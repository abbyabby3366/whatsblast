import { BlastCampaign, CampaignStatus } from '../models/BlastCampaign.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';
import { WhatsAppSession, SessionStatus } from '../models/WhatsAppSession.js';
import { resolveCampaignInterval } from './blastUtils.js';
import { findNextAvailableSlotsForSession } from './scheduleSlotFinder.js';

export const COMPLETED_STATUSES = [
  MessageStatus.SENT,
  MessageStatus.DELIVERED,
  MessageStatus.READ,
  'sent',
  'delivered',
  'read',
  'SENT',
  'DELIVERED',
  'READ',
];

export const FAILED_STATUSES = [
  MessageStatus.FAILED,
  'failed',
  'FAILED',
  'error',
  'ERROR',
];

export const EXPIRED_STATUSES = [
  MessageStatus.EXPIRED,
  'expired',
  'EXPIRED',
];

interface RetryItem {
  msg: any;
  phone: string;
  cleanPhone: string;
  possiblePhones: string[];
  sessionDoc: any;
  senderPhone: string | undefined;
}

/**
 * Restores any messages that were already sent via WhatsApp (have a valid WhatsApp message_id)
 * but were mistakenly overwritten to PENDING by previous buggy retry logic.
 */
export async function healCorruptedCampaignMessages(campaignId: any): Promise<number> {
  try {
    const healed = await Message.updateMany(
      {
        campaign: campaignId,
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
    return healed.modifiedCount || 0;
  } catch (err) {
    console.error(`Error healing corrupted messages for campaign ${campaignId}:`, err);
    return 0;
  }
}

/**
 * Recomputes and persists accurate campaign stats directly from the Message collection.
 */
export async function recomputeCampaignStats(campaign: any): Promise<any> {
  const sentCount = await Message.countDocuments({
    campaign: campaign._id,
    status: { $in: COMPLETED_STATUSES },
  });
  const failedCount = await Message.countDocuments({
    campaign: campaign._id,
    status: { $in: FAILED_STATUSES },
  });
  const pendingCount = await Message.countDocuments({
    campaign: campaign._id,
    status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED, 'pending', 'queued', 'PENDING', 'QUEUED'] },
  });

  const total = sentCount + failedCount + pendingCount;
  campaign.stats = {
    ...(campaign.stats || {}),
    total,
    sent: sentCount,
    failed: failedCount,
    pending: pendingCount,
  };
  campaign.current_index = sentCount;
  await campaign.save();
  return campaign;
}

/**
 * Retries all failed and expired messages for a campaign.
 * STRICT SAFETY: Already sent messages (SENT, DELIVERED, READ) are NEVER modified or turned to pending.
 */
export const executeCampaignRetryFailed = async (
  campaignDocOrId: any,
  targetSessionId?: string
): Promise<{ success: boolean; count: number; message: string; warning?: string; campaign?: any }> => {
  const campaign =
    typeof campaignDocOrId === 'string'
      ? await BlastCampaign.findById(campaignDocOrId)
      : campaignDocOrId;

  if (!campaign) {
    return { success: false, count: 0, message: 'Campaign not found' };
  }

  // 1. Auto-heal any messages that were already sent but erroneously flipped to pending
  await healCorruptedCampaignMessages(campaign._id);

  // 2. Query ONLY the messages that are genuinely failed or expired
  // STRICTLY EXCLUDE completed messages (SENT, DELIVERED, READ) and messages with a WhatsApp message_id
  const EXPIRED_GRACE_MS = 2 * 60 * 1000;
  const cutoff = new Date(Date.now() - EXPIRED_GRACE_MS);

  const retryMessages = await Message.find({
    campaign: campaign._id,
    status: { $nin: COMPLETED_STATUSES },
    $and: [
      {
        $or: [
          { message_id: { $exists: false } },
          { message_id: null },
          { message_id: '' },
        ],
      },
      {
        $or: [
          { status: { $in: [...FAILED_STATUSES, ...EXPIRED_STATUSES] } },
          ...(![CampaignStatus.PAUSED, CampaignStatus.RUNNING, 'running', 'paused', 'scheduled', 'SCHEDULED'].includes(campaign.status as any)
            ? [
                {
                  status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED, 'pending', 'queued', 'PENDING', 'QUEUED'] },
                  scheduled_at: { $lt: cutoff },
                },
              ]
            : []),
        ],
      },
    ],
  }).sort({ scheduled_at: 1, createdAt: 1 });

  if (retryMessages.length === 0) {
    await recomputeCampaignStats(campaign);
    return { success: true, count: 0, message: 'No failed or expired messages to retry', campaign };
  }

  // 3. Resolve user sessions for assigning
  const userSessions = await WhatsAppSession.find({ user: campaign.user });
  const sessionDocMap = new Map<string, any>();
  for (const s of userSessions) {
    sessionDocMap.set(s._id.toString(), s);
    if (s.session_id) sessionDocMap.set(s.session_id, s);
  }

  const allowedSessionIds: string[] | undefined =
    campaign.session_mode === 'SPECIFIC' && campaign.selected_sessions?.length > 0
      ? campaign.selected_sessions
      : undefined;

  let connectedSessions = userSessions.filter((s) => s.status === SessionStatus.CONNECTED);
  if (allowedSessionIds && allowedSessionIds.length > 0) {
    const restrictedConnected = connectedSessions.filter((s) =>
      allowedSessionIds.includes(s.session_id) || allowedSessionIds.includes(s._id.toString())
    );
    if (restrictedConnected.length > 0) {
      connectedSessions = restrictedConnected;
    }
  }

  let specificTargetSession: any = null;
  if (targetSessionId && targetSessionId !== 'random' && targetSessionId !== 'original') {
    specificTargetSession =
      sessionDocMap.get(targetSessionId) ||
      userSessions.find(
        (s) => s._id.toString() === targetSessionId || s.session_id === targetSessionId
      );
    if (!specificTargetSession) {
      return { success: false, count: 0, message: 'Selected WhatsApp session not found' };
    }
  }

  if (targetSessionId === 'random' && connectedSessions.length === 0) {
    return {
      success: false,
      count: 0,
      message: 'No connected WhatsApp phone found. Please connect a phone first before retrying.',
    };
  }

  // 4. Group retry messages by their target sending phone / session
  const sessionQueueMap = new Map<string, RetryItem[]>();

  for (let idx = 0; idx < retryMessages.length; idx++) {
    const msg = retryMessages[idx];
    const rawRecip = String(msg.recipient_phone || (msg.to_jid ? msg.to_jid.split('@')[0] : '')).replace(/[^0-9]/g, '');
    const normRecip = rawRecip.startsWith('0') ? '60' + rawRecip.slice(1) : (rawRecip.startsWith('60') ? '0' + rawRecip.slice(2) : rawRecip);
    const possiblePhones = Array.from(new Set([rawRecip, normRecip])).filter(Boolean);
    const clean = rawRecip.startsWith('0') ? '60' + rawRecip.slice(1) : rawRecip;

    let sessionDoc = null;
    if (specificTargetSession) {
      sessionDoc = specificTargetSession;
    } else if (targetSessionId === 'random') {
      sessionDoc = connectedSessions[idx % connectedSessions.length];
    } else {
      let assignedSessionId: any = msg.session;
      sessionDoc = assignedSessionId ? sessionDocMap.get(assignedSessionId.toString()) : null;
      if (assignedSessionId && !sessionDoc) {
        sessionDoc = await WhatsAppSession.findById(assignedSessionId);
        if (sessionDoc) {
          sessionDocMap.set(sessionDoc._id.toString(), sessionDoc);
        }
      }
      if (!sessionDoc && connectedSessions.length > 0) {
        sessionDoc = connectedSessions[idx % connectedSessions.length];
      } else if (!sessionDoc && userSessions.length > 0) {
        sessionDoc = userSessions[idx % userSessions.length];
      }
    }

    const senderPhone = sessionDoc?.phone_number || msg.sender_phone;
    const sessKey = sessionDoc ? sessionDoc._id.toString() : 'default';

    const item: RetryItem = {
      msg,
      phone: rawRecip,
      cleanPhone: clean,
      possiblePhones,
      sessionDoc,
      senderPhone,
    };

    const queue = sessionQueueMap.get(sessKey) || [];
    queue.push(item);
    sessionQueueMap.set(sessKey, queue);
  }

  // 5. For each sending session, schedule retry messages conflict-free and update BY ID
  for (const [, items] of sessionQueueMap.entries()) {
    const sampleItem = items[0];
    const sessionDoc = sampleItem.sessionDoc;

    const retryPhonesForThisSession = items.flatMap((it) => it.possiblePhones);
    const scheduledSlots = await findNextAvailableSlotsForSession({
      sessionDoc,
      campaign,
      count: items.length,
      excludePhones: retryPhonesForThisSession,
    });

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const scheduledTime = scheduledSlots[i] || new Date();

      // Update strictly by document _id to guarantee no other message is affected
      await Message.findByIdAndUpdate(item.msg._id, {
        status: MessageStatus.PENDING,
        session: sessionDoc ? sessionDoc._id : item.msg.session,
        sender_phone: item.senderPhone,
        $unset: { error: 1 },
        scheduled_at: scheduledTime,
        $inc: { retry_count: 1 },
      });
    }
  }

  const hasConnectedSession = Array.from(sessionDocMap.values()).some(
    (s) => s.status === SessionStatus.CONNECTED
  );

  // 6. Recalculate campaign stats directly from DB
  await recomputeCampaignStats(campaign);

  if (campaign.status !== CampaignStatus.PAUSED) {
    campaign.status = CampaignStatus.RUNNING;
  }
  campaign.completed_at = undefined;
  campaign.error_message = undefined;
  await campaign.save();

  const statusNotice = campaign.status === CampaignStatus.PAUSED
    ? ' (Campaign is paused. Messages will send when resumed.)'
    : '';

  const warningMsg = !hasConnectedSession
    ? ' (Note: No connected WhatsApp session found. Messages will send once WhatsApp connects.)'
    : '';

  const phoneNotice = specificTargetSession?.phone_number
    ? ` via phone ${specificTargetSession.phone_number}`
    : targetSessionId === 'random'
    ? ` across ${connectedSessions.length} connected phone(s)`
    : '';

  return {
    success: true,
    count: retryMessages.length,
    message: `Retrying ${retryMessages.length} recipient(s)${phoneNotice}${statusNotice}${warningMsg}`,
    warning: !hasConnectedSession ? 'No connected WhatsApp session found' : undefined,
    campaign,
  };
};

/**
 * Retries a single recipient message within a campaign.
 * STRICT SAFETY: Already sent messages can never be turned back to pending.
 */
export const executeCampaignRetryRecipient = async (
  campaign: any,
  phone: string,
  targetSessionId?: string
): Promise<{ success: boolean; message: string; scheduled_at?: Date; error?: string }> => {
  const rawRecip = phone.replace(/[^0-9]/g, '');
  const normRecip = rawRecip.startsWith('0') ? '60' + rawRecip.slice(1) : (rawRecip.startsWith('60') ? '0' + rawRecip.slice(2) : rawRecip);
  const possiblePhones = Array.from(new Set([rawRecip, normRecip])).filter(Boolean);
  const cleanPhone = rawRecip.startsWith('0') ? '60' + rawRecip.slice(1) : rawRecip;

  // 1. Auto-heal any corrupted sent message for this campaign first
  await healCorruptedCampaignMessages(campaign._id);

  // 2. Find existing message for this recipient
  const existingMsg = await Message.findOne({
    campaign: campaign._id,
    $or: [
      { recipient_phone: { $in: possiblePhones } },
      { to_jid: { $in: possiblePhones.map((p) => `${p}@s.whatsapp.net`) } },
    ],
  }).sort({ scheduled_at: -1, createdAt: -1 });

  // STRICT GUARD: If message is already successfully sent, do not overwrite it
  if (existingMsg) {
    const isAlreadySent =
      COMPLETED_STATUSES.includes(existingMsg.status) ||
      (Boolean(existingMsg.message_id) && !String(existingMsg.message_id).startsWith('wf_'));
    if (isAlreadySent) {
      return {
        success: false,
        message: `Message to ${cleanPhone} has already been sent successfully.`,
        error: `Message to ${cleanPhone} has already been sent successfully.`,
      };
    }
  }

  const userSessions = await WhatsAppSession.find({ user: campaign.user });
  const allowedSessionIds: string[] | undefined =
    campaign.session_mode === 'SPECIFIC' && campaign.selected_sessions?.length > 0
      ? campaign.selected_sessions
      : undefined;

  let connectedSessions = userSessions.filter((s) => s.status === SessionStatus.CONNECTED);
  if (allowedSessionIds && allowedSessionIds.length > 0) {
    const restrictedConnected = connectedSessions.filter((s) =>
      allowedSessionIds.includes(s.session_id) || allowedSessionIds.includes(s._id.toString())
    );
    if (restrictedConnected.length > 0) {
      connectedSessions = restrictedConnected;
    }
  }

  let sessionDoc = null;
  if (targetSessionId === 'random') {
    if (connectedSessions.length === 0) {
      return {
        success: false,
        message: 'No connected WhatsApp phone found. Please connect a phone first before retrying.',
        error: 'No connected WhatsApp phone found. Please connect a phone first before retrying.',
      };
    }
    sessionDoc = connectedSessions[Math.floor(Math.random() * connectedSessions.length)];
  } else if (targetSessionId && targetSessionId !== 'original') {
    sessionDoc = userSessions.find(
      (s) => s._id.toString() === targetSessionId || s.session_id === targetSessionId
    );
    if (!sessionDoc) {
      sessionDoc = await WhatsAppSession.findOne({
        user: campaign.user,
        $or: [{ _id: targetSessionId }, { session_id: targetSessionId }],
      });
    }
    if (!sessionDoc) {
      return {
        success: false,
        message: 'Selected WhatsApp phone not found.',
        error: 'Selected WhatsApp phone not found.',
      };
    }
  } else {
    if (existingMsg?.session) {
      sessionDoc = await WhatsAppSession.findById(existingMsg.session);
    }
    if (!sessionDoc) {
      sessionDoc = connectedSessions.length > 0 ? connectedSessions[0] : (userSessions[0] || null);
    }
  }

  const [scheduledTime = new Date()] = await findNextAvailableSlotsForSession({
    sessionDoc,
    campaign,
    count: 1,
    excludePhones: possiblePhones,
  });

  const senderPhone = sessionDoc?.phone_number || existingMsg?.sender_phone;

  if (existingMsg) {
    await Message.findByIdAndUpdate(existingMsg._id, {
      status: MessageStatus.PENDING,
      session: sessionDoc ? sessionDoc._id : existingMsg.session,
      sender_phone: senderPhone,
      $unset: { error: 1 },
      scheduled_at: scheduledTime,
      $inc: { retry_count: 1 },
    });
  } else {
    await Message.create({
      campaign: campaign._id,
      session: sessionDoc ? sessionDoc._id : undefined,
      sender_phone: senderPhone,
      direction: MessageDirection.OUTBOUND,
      type: 'text',
      status: MessageStatus.PENDING,
      recipient_phone: cleanPhone,
      to_jid: `${cleanPhone}@s.whatsapp.net`,
      template: campaign.template || null,
      scheduled_at: scheduledTime,
      retry_count: 1,
    });
  }

  await recomputeCampaignStats(campaign);

  if (campaign.status !== CampaignStatus.PAUSED) {
    campaign.status = CampaignStatus.RUNNING;
  }
  campaign.completed_at = undefined;
  campaign.error_message = undefined;
  await campaign.save();

  const phoneNotice = sessionDoc?.phone_number ? ` via phone ${sessionDoc.phone_number}` : '';
  const isPaused = campaign.status === CampaignStatus.PAUSED;

  return {
    success: true,
    message: isPaused
      ? `Message rescheduled for ${cleanPhone}${phoneNotice}. Campaign is currently paused, message will send when resumed.`
      : `Message rescheduled for ${cleanPhone}${phoneNotice}. It will be sent via campaign scheduler.`,
    scheduled_at: scheduledTime,
  };
};
