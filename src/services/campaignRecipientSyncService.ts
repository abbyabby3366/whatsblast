import mongoose from 'mongoose';
import { BlastCampaign, CampaignStatus } from '../models/BlastCampaign.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';
import { WhatsAppSession, SessionStatus } from '../models/WhatsAppSession.js';
import { isSessionAllowed } from './blastUtils.js';

export function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  const str = String(phone).split('@')[0];
  let clean = str.replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) {
    clean = '60' + clean.slice(1);
  }
  return clean;
}

export interface SyncRecipientsOptions {
  templates?: any[];
  sessionMode?: 'ALL' | 'SPECIFIC';
  selectedSessions?: string[];
  minIntervalSeconds?: number;
  maxIntervalSeconds?: number;
  /**
   * Allow creating new PENDING rows even when the campaign is COMPLETED.
   * Only explicit retry paths should set this; otherwise a sync on a finished
   * campaign (e.g. after message retention pruned its rows) must not re-blast.
   */
  allowCreateWhenCompleted?: boolean;
}

const UNSENT_STATUSES = [MessageStatus.PENDING, MessageStatus.QUEUED];
const SENT_STATUSES = [MessageStatus.SENT, MessageStatus.DELIVERED, MessageStatus.READ];

/** Normalized phones the campaign has durably recorded as sent (missing field = empty). */
export function getProcessedPhoneSet(campaign: any): Set<string> {
  const list: any[] = Array.isArray(campaign?.processed_phones) ? campaign.processed_phones : [];
  return new Set(list.map((p) => normalizePhoneNumber(p)).filter(Boolean));
}

function messagePhone(m: any): string {
  return normalizePhoneNumber(m.recipient_phone || (m.to_jid ? m.to_jid.split('@')[0] : ''));
}

export interface SyncRecipientsResult {
  deletedCount: number;
  createdCount: number;
  remainingPendingCount: number;
  executedCount: number;
}

/**
 * Synchronizes the Message collection for a campaign with the desired recipient phone list.
 *
 * 1. Unsent messages (PENDING, QUEUED) for recipients NOT in the new list are deleted.
 * 2. Already executed messages (SENT, DELIVERED, READ, FAILED, EXPIRED) are preserved.
 * 3. New recipients who have neither executed nor unsent messages get a new PENDING message created.
 * 4. All pending messages are sequentially scheduled using the campaign's interval settings.
 * 5. Campaign document recipient_phones, contacts, and stats are updated.
 */
export async function syncCampaignRecipients(
  campaign: any,
  rawRecipientPhones: any[],
  options: SyncRecipientsOptions = {}
): Promise<SyncRecipientsResult> {
  const cleanNewRecipients: string[] = [];
  const seenNew = new Set<string>();

  for (const raw of rawRecipientPhones || []) {
    const rawPhone =
      typeof raw === 'object' && raw !== null
        ? raw.phone || raw.recipient_phone || raw.phoneNumber || ''
        : raw;
    const clean = normalizePhoneNumber(rawPhone);
    if (clean && !seenNew.has(clean)) {
      seenNew.add(clean);
      cleanNewRecipients.push(clean);
    }
  }

  const existingMsgs = await Message.find({ campaign: campaign._id })
    .select('_id status recipient_phone to_jid')
    .sort({ scheduled_at: 1, createdAt: 1 })
    .lean();

  const executedStatuses = [
    MessageStatus.SENT,
    MessageStatus.DELIVERED,
    MessageStatus.READ,
    MessageStatus.FAILED,
    MessageStatus.EXPIRED,
  ];

  const executedMsgs = existingMsgs.filter((m) => executedStatuses.includes(m.status));
  // Messages a worker has claimed and is sending right now: never delete or
  // touch them, but count their recipient as covered so no duplicate is created.
  const inFlightMsgs = existingMsgs.filter((m) => m.status === MessageStatus.SENDING);
  const unsentMsgs = existingMsgs.filter(
    (m) => !executedStatuses.includes(m.status) && m.status !== MessageStatus.SENDING
  );

  const executedPhoneSet = new Set<string>();
  const sentRowPhones: string[] = [];
  for (const m of executedMsgs) {
    const p = messagePhone(m);
    if (p) executedPhoneSet.add(p);
    if (p && SENT_STATUSES.includes(m.status)) sentRowPhones.push(p);
  }

  // Durable "already sent" record that survives message retention.
  const processedPhoneSet = getProcessedPhoneSet(campaign);
  // Backfill it from existing sent rows (campaigns created before the field existed).
  const newlyProcessed = Array.from(new Set(sentRowPhones)).filter((p) => !processedPhoneSet.has(p));
  if (newlyProcessed.length > 0) {
    await BlastCampaign.updateOne(
      { _id: campaign._id },
      { $addToSet: { processed_phones: { $each: newlyProcessed } } }
    );
    newlyProcessed.forEach((p) => processedPhoneSet.add(p));
  }

  const keptUnsentPhoneSet = new Set<string>();
  for (const m of inFlightMsgs) {
    const p = messagePhone(m);
    if (p) keptUnsentPhoneSet.add(p);
  }

  // 1. Delete unsent messages that are no longer targeted, or that were already executed
  const msgsToDeleteIds: mongoose.Types.ObjectId[] = [];

  for (const m of unsentMsgs) {
    const p = messagePhone(m);
    if (!seenNew.has(p) || executedPhoneSet.has(p) || processedPhoneSet.has(p) || keptUnsentPhoneSet.has(p)) {
      msgsToDeleteIds.push(m._id as mongoose.Types.ObjectId);
    } else {
      keptUnsentPhoneSet.add(p);
    }
  }

  let deletedCount = 0;
  if (msgsToDeleteIds.length > 0) {
    // Status guard: a message claimed by a worker in the meantime is not deleted.
    const del = await Message.deleteMany({ _id: { $in: msgsToDeleteIds }, status: { $in: UNSENT_STATUSES } });
    deletedCount = del.deletedCount ?? 0;
  }

  // 2. Resolve available sessions for assigning
  const userId = campaign.user?._id || campaign.user;
  const sessionModeVal = options.sessionMode || campaign.session_mode || 'ALL';
  const selectedSessionsList = options.selectedSessions || campaign.selected_sessions || [];

  let availableSessions = await WhatsAppSession.find({
    user: userId,
    status: SessionStatus.CONNECTED,
  }).sort({ createdAt: 1 });

  if (sessionModeVal === 'SPECIFIC' && selectedSessionsList.length > 0) {
    availableSessions = availableSessions.filter((s: any) =>
      isSessionAllowed(s, selectedSessionsList)
    );
  }

  if (availableSessions.length === 0) {
    let fallbackSessions = await WhatsAppSession.find({ user: userId }).sort({ createdAt: 1 });
    if (sessionModeVal === 'SPECIFIC' && selectedSessionsList.length > 0) {
      fallbackSessions = fallbackSessions.filter((s: any) =>
        isSessionAllowed(s, selectedSessionsList)
      );
    }
    availableSessions = fallbackSessions;
  }

  // 3. Identify missing recipients who need a pending message created.
  // A finished campaign never gets new rows here unless a retry path explicitly asks.
  const canCreate =
    campaign.status !== CampaignStatus.COMPLETED || options.allowCreateWhenCompleted === true;
  const missingPhones = canCreate
    ? cleanNewRecipients.filter(
        (p) => !executedPhoneSet.has(p) && !processedPhoneSet.has(p) && !keptUnsentPhoneSet.has(p)
      )
    : [];

  const templateObjs = options.templates || campaign.templates || [];
  const primaryTpl = templateObjs.length > 0 ? templateObjs[0] : null;
  const tplText = primaryTpl
    ? primaryTpl.text ||
      primaryTpl.template ||
      primaryTpl.caption ||
      (typeof primaryTpl.content === 'object' ? primaryTpl.content?.text : '') ||
      ''
    : '';
  const msgType = primaryTpl
    ? primaryTpl.message_type || primaryTpl.type || primaryTpl.messageType || 'text'
    : 'text';
  const rawButtons =
    primaryTpl?.buttons ||
    (typeof primaryTpl?.content === 'object' ? primaryTpl?.content?.buttons : null);
  const templateId = campaign.template?._id || campaign.template || null;

  if (missingPhones.length > 0) {
    const newDocs = missingPhones.map((phone, idx) => {
      const assignedSession =
        availableSessions.length > 0
          ? availableSessions[idx % availableSessions.length]
          : null;
      return {
        campaign: campaign._id,
        session: assignedSession ? assignedSession._id : undefined,
        sender_phone: assignedSession ? assignedSession.phone_number : undefined,
        direction: MessageDirection.OUTBOUND,
        type: msgType,
        status: MessageStatus.PENDING,
        recipient_phone: phone,
        to_jid: `${phone}@s.whatsapp.net`,
        template: templateId,
        content: { text: tplText, buttons: rawButtons },
        scheduled_at: new Date(),
      };
    });

    await Message.insertMany(newDocs);
  }

  // 4. If templates were updated, update pending messages content
  if (options.templates !== undefined && primaryTpl) {
    await Message.updateMany(
      {
        campaign: campaign._id,
        status: { $in: UNSENT_STATUSES },
      },
      {
        $set: {
          type: msgType,
          content: { text: tplText, buttons: rawButtons },
        },
      }
    );
  }

  // 5. Reschedule and assign sessions for all pending messages sequentially
  const allUnsentMsgs = await Message.find({
    campaign: campaign._id,
    status: { $in: UNSENT_STATUSES },
  })
    .select('_id session sender_phone')
    .sort({ createdAt: 1 })
    .lean();

  const minIntervalMins =
    Number(options.minIntervalSeconds ?? campaign.min_interval_seconds) || 10;
  const maxIntervalMins =
    Number(options.maxIntervalSeconds ?? campaign.max_interval_seconds) >= minIntervalMins
      ? Number(options.maxIntervalSeconds ?? campaign.max_interval_seconds)
      : minIntervalMins + 5;

  const sessionLastTimeMap = new Map<string, number>();
  const now = Date.now();
  const scheduleOps: any[] = [];

  for (let idx = 0; idx < allUnsentMsgs.length; idx++) {
    const msg = allUnsentMsgs[idx];

    // Ensure session is assigned and matches available sessions
    if (availableSessions.length > 0) {
      const isSessionValid =
        msg.session &&
        availableSessions.some(
          (s: any) => s._id.toString() === msg.session?.toString()
        );
      // Only redistribute valid assignments when an explicit, non-empty session
      // selection is in effect (callers always pass selectedSessions, often as []).
      const shouldReassign =
        !isSessionValid ||
        (selectedSessionsList.length > 0 &&
          (sessionModeVal === 'SPECIFIC' || options.selectedSessions !== undefined));

      if (shouldReassign) {
        const assignedSession = availableSessions[idx % availableSessions.length];
        msg.session = assignedSession._id;
        msg.sender_phone = assignedSession.phone_number;
      }
    }

    const sessKey = msg.session ? msg.session.toString() : 'default';
    let scheduledTimeMs = now;

    if (!sessionLastTimeMap.has(sessKey)) {
      let earliestFirstMs = now;
      if (msg.session) {
        const sessionFilter: any[] = [{ session: msg.session }];
        if (msg.sender_phone) {
          const raw = String(msg.sender_phone).trim();
          const digits = raw.replace(/[^0-9]/g, '');
          sessionFilter.push({ sender_phone: raw });
          if (digits && digits !== raw) {
            sessionFilter.push({ sender_phone: digits });
          }
        }

        const lastSent = await Message.findOne({
          $or: sessionFilter,
          status: { $in: [MessageStatus.SENT, MessageStatus.DELIVERED, MessageStatus.READ] },
        }).sort({ sent_at: -1, createdAt: -1, updatedAt: -1 });

        const lastSentTime = lastSent?.sent_at || lastSent?.createdAt || lastSent?.wa_timestamp;
        if (lastSentTime) {
          const lastSentMs = new Date(lastSentTime).getTime();
          const elapsedMs = now - lastSentMs;
          const minMs = minIntervalMins * 60 * 1000;
          if (elapsedMs < minMs) {
            const randMinutes = Math.random() * (maxIntervalMins - minIntervalMins) + minIntervalMins;
            earliestFirstMs = Math.max(now + 10_000, lastSentMs + Math.floor(randMinutes * 60 * 1000));
          }
        }
      }
      scheduledTimeMs = earliestFirstMs;
      sessionLastTimeMap.set(sessKey, scheduledTimeMs);
    } else {
      const prevMs = sessionLastTimeMap.get(sessKey)!;
      const randomMinutes =
        Math.random() * (maxIntervalMins - minIntervalMins) + minIntervalMins;
      scheduledTimeMs = prevMs + Math.floor(randomMinutes * 60 * 1000);
      sessionLastTimeMap.set(sessKey, scheduledTimeMs);
    }

    msg.scheduled_at = new Date(scheduledTimeMs);
    scheduleOps.push({
      updateOne: {
        // Status guard: never move/reschedule a message a worker has claimed.
        filter: { _id: msg._id, status: { $in: UNSENT_STATUSES } },
        update: {
          $set: { session: msg.session, sender_phone: msg.sender_phone, scheduled_at: msg.scheduled_at },
        },
      },
    });
  }

  if (scheduleOps.length > 0) {
    await Message.bulkWrite(scheduleOps, { ordered: false });
  }

  // 6. Update campaign document
  campaign.recipient_phones = cleanNewRecipients;
  campaign.contacts = cleanNewRecipients;

  // Recipients recorded as sent whose Message rows were pruned still count as sent.
  let prunedSentCount = 0;
  for (const p of processedPhoneSet) {
    if (!executedPhoneSet.has(p)) prunedSentCount++;
  }
  const sentCount =
    executedMsgs.filter((m) => SENT_STATUSES.includes(m.status)).length + prunedSentCount;
  const failedCount = executedMsgs.filter((m) =>
    [MessageStatus.FAILED, MessageStatus.EXPIRED].includes(m.status)
  ).length;
  const pendingCount = allUnsentMsgs.length + inFlightMsgs.length;

  campaign.stats = {
    ...(campaign.stats || {}),
    total: executedMsgs.length + prunedSentCount + pendingCount,
    sent: sentCount,
    failed: failedCount,
    pending: pendingCount,
  };

  await campaign.save();

  return {
    deletedCount,
    createdCount: missingPhones.length,
    remainingPendingCount: pendingCount,
    executedCount: executedMsgs.length,
  };
}

/**
 * Checks if a campaign's pending messages are out of sync with its recipient_phones list.
 * If out of sync, automatically synchronizes them.
 */
export async function checkAndAutoHealCampaignRecipients(
  campaign: any
): Promise<boolean> {
  try {
    if (
      !campaign ||
      !Array.isArray(campaign.recipient_phones) ||
      campaign.recipient_phones.length === 0
    ) {
      return false;
    }

    // Auto-heal any messages that were already sent via WhatsApp (have a valid WhatsApp message_id)
    // but were mistakenly marked PENDING
    const healed = await Message.updateMany(
      {
        campaign: campaign._id,
        status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED, 'pending', 'queued', 'PENDING', 'QUEUED'] },
        message_id: { $exists: true, $nin: ['', null] },
        $nor: [
          { message_id: /^wf_/ },
          { message_id: /^reply_/ },
          { message_id: /^master_/ },
        ],
      },
      {
        $set: {
          status: MessageStatus.SENT,
          sent_at: new Date(),
        },
      }
    );

    if (healed.modifiedCount > 0) {
      const sentCount = await Message.countDocuments({
        campaign: campaign._id,
        status: { $in: [MessageStatus.SENT, MessageStatus.DELIVERED, MessageStatus.READ, 'sent', 'delivered', 'read', 'SENT', 'DELIVERED', 'READ'] },
      });
      const failedCount = await Message.countDocuments({
        campaign: campaign._id,
        status: { $in: [MessageStatus.FAILED, MessageStatus.EXPIRED, 'failed', 'expired', 'FAILED', 'EXPIRED', 'error', 'ERROR'] },
      });
      const pendingCount = await Message.countDocuments({
        campaign: campaign._id,
        status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED, 'pending', 'queued', 'PENDING', 'QUEUED'] },
      });
      campaign.stats = {
        ...(campaign.stats || {}),
        total: sentCount + failedCount + pendingCount,
        sent: sentCount,
        failed: failedCount,
        pending: pendingCount,
      };
      campaign.current_index = sentCount;
      await campaign.save();
    }

    const cleanRecipients = new Set<string>(
      campaign.recipient_phones.map((p: any) => normalizePhoneNumber(p))
    );
    const pendingMsgs = await Message.find({
      campaign: campaign._id,
      status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED, MessageStatus.SENDING] },
    })
      .select('recipient_phone to_jid')
      .lean();

    const hasStale = pendingMsgs.some((m) => {
      const p = normalizePhoneNumber(
        m.recipient_phone || (m.to_jid ? m.to_jid.split('@')[0] : '')
      );
      return !cleanRecipients.has(p);
    });

    const executedStatuses = [
      MessageStatus.SENT,
      MessageStatus.DELIVERED,
      MessageStatus.READ,
      MessageStatus.FAILED,
      MessageStatus.EXPIRED,
      'sent',
      'delivered',
      'read',
      'failed',
      'expired',
      'SENT',
      'DELIVERED',
      'READ',
      'FAILED',
      'EXPIRED',
    ];

    const executedMsgs = await Message.find({
      campaign: campaign._id,
      status: { $in: executedStatuses },
    })
      .select('recipient_phone to_jid')
      .lean();

    const executedPhones = new Set(executedMsgs.map((m) => messagePhone(m)).filter(Boolean));
    // Recipients recorded as sent (their rows may have been pruned) count as executed too.
    for (const p of getProcessedPhoneSet(campaign)) executedPhones.add(p);

    let targetExecutedCount = 0;
    for (const r of cleanRecipients) {
      if (executedPhones.has(r)) {
        targetExecutedCount++;
      }
    }

    // A COMPLETED campaign never gets new pending rows from a sync, so don't flag a mismatch for it.
    const expectedPendingCount =
      campaign.status === CampaignStatus.COMPLETED
        ? pendingMsgs.length
        : Math.max(0, cleanRecipients.size - targetExecutedCount);
    const isCountMismatched = pendingMsgs.length !== expectedPendingCount;

    if (hasStale || isCountMismatched) {
      await syncCampaignRecipients(campaign, campaign.recipient_phones, {
        templates: campaign.templates,
        sessionMode: campaign.session_mode,
        selectedSessions: campaign.selected_sessions,
        minIntervalSeconds: campaign.min_interval_seconds,
        maxIntervalSeconds: campaign.max_interval_seconds,
      });
      return true;
    }

    return false;
  } catch (err) {
    console.error('Error auto-healing campaign recipients:', err);
    return false;
  }
}
