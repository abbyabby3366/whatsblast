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

  const existingMsgs = await Message.find({ campaign: campaign._id }).sort({
    scheduled_at: 1,
    createdAt: 1,
  });

  const executedStatuses = [
    MessageStatus.SENT,
    MessageStatus.DELIVERED,
    MessageStatus.READ,
    MessageStatus.FAILED,
    MessageStatus.EXPIRED,
  ];

  const executedMsgs = existingMsgs.filter((m) => executedStatuses.includes(m.status));
  const unsentMsgs = existingMsgs.filter((m) => !executedStatuses.includes(m.status));

  const executedPhoneSet = new Set<string>();
  for (const m of executedMsgs) {
    const p = normalizePhoneNumber(
      m.recipient_phone || (m.to_jid ? m.to_jid.split('@')[0] : '')
    );
    if (p) executedPhoneSet.add(p);
  }

  // 1. Delete unsent messages that are no longer targeted, or that were already executed
  const msgsToDeleteIds: mongoose.Types.ObjectId[] = [];
  const keptUnsentPhoneSet = new Set<string>();

  for (const m of unsentMsgs) {
    const p = normalizePhoneNumber(
      m.recipient_phone || (m.to_jid ? m.to_jid.split('@')[0] : '')
    );
    if (!seenNew.has(p) || executedPhoneSet.has(p) || keptUnsentPhoneSet.has(p)) {
      msgsToDeleteIds.push(m._id);
    } else {
      keptUnsentPhoneSet.add(p);
    }
  }

  if (msgsToDeleteIds.length > 0) {
    await Message.deleteMany({ _id: { $in: msgsToDeleteIds } });
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

  // 3. Identify missing recipients who need a pending message created
  const missingPhones = cleanNewRecipients.filter(
    (p) => !executedPhoneSet.has(p) && !keptUnsentPhoneSet.has(p)
  );

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
        status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED] },
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
    status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED] },
  }).sort({ createdAt: 1 });

  const minIntervalMins =
    Number(options.minIntervalSeconds ?? campaign.min_interval_seconds) || 10;
  const maxIntervalMins =
    Number(options.maxIntervalSeconds ?? campaign.max_interval_seconds) >= minIntervalMins
      ? Number(options.maxIntervalSeconds ?? campaign.max_interval_seconds)
      : minIntervalMins + 5;

  const sessionLastTimeMap = new Map<string, number>();
  const now = Date.now();

  for (let idx = 0; idx < allUnsentMsgs.length; idx++) {
    const msg = allUnsentMsgs[idx];

    // Ensure session is assigned and matches available sessions
    if (availableSessions.length > 0) {
      const isSessionValid =
        msg.session &&
        availableSessions.some(
          (s: any) => s._id.toString() === msg.session?.toString()
        );
      const shouldReassign =
        !isSessionValid ||
        sessionModeVal === 'SPECIFIC' ||
        options.sessionMode !== undefined ||
        options.selectedSessions !== undefined;

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
    await msg.save();
  }

  // 6. Update campaign document
  campaign.recipient_phones = cleanNewRecipients;
  campaign.contacts = cleanNewRecipients;

  const sentCount = executedMsgs.filter((m) =>
    [MessageStatus.SENT, MessageStatus.DELIVERED, MessageStatus.READ].includes(m.status)
  ).length;
  const failedCount = executedMsgs.filter((m) =>
    [MessageStatus.FAILED, MessageStatus.EXPIRED].includes(m.status)
  ).length;
  const pendingCount = allUnsentMsgs.length;

  campaign.stats = {
    ...(campaign.stats || {}),
    total: executedMsgs.length + pendingCount,
    sent: sentCount,
    failed: failedCount,
    pending: pendingCount,
  };

  await campaign.save();

  return {
    deletedCount: msgsToDeleteIds.length,
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

    const cleanRecipients = new Set<string>(
      campaign.recipient_phones.map((p: any) => normalizePhoneNumber(p))
    );
    const pendingMsgs = await Message.find({
      campaign: campaign._id,
      status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED] },
    }).select('recipient_phone to_jid');

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
    ];

    const executedMsgs = await Message.find({
      campaign: campaign._id,
      status: { $in: executedStatuses },
    }).select('recipient_phone to_jid');

    const executedPhones = new Set(
      executedMsgs
        .map((m) =>
          normalizePhoneNumber(
            m.recipient_phone || (m.to_jid ? m.to_jid.split('@')[0] : '')
          )
        )
        .filter(Boolean)
    );

    let targetExecutedCount = 0;
    for (const r of cleanRecipients) {
      if (executedPhones.has(r)) {
        targetExecutedCount++;
      }
    }

    const expectedPendingCount = Math.max(0, cleanRecipients.size - targetExecutedCount);
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
