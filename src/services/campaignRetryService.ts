import { BlastCampaign, CampaignStatus } from '../models/BlastCampaign.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';
import { WhatsAppSession, SessionStatus } from '../models/WhatsAppSession.js';
import { resolveCampaignInterval } from './blastUtils.js';
import { findNextAvailableSlotsForSession } from './scheduleSlotFinder.js';

interface RetryItem {
  contact: string;
  cleanPhone: string;
  possiblePhones: string[];
  sessionDoc: any;
  senderPhone: string | undefined;
}

/**
 * Retries all failed and expired messages for a campaign.
 * Keeps original sending phones intact and calculates intervals per individual sending phone.
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

  const allContacts = campaign.contacts || campaign.recipient_phones || [];

  // Identify all successfully sent recipients
  const sentMessages = await Message.find({
    campaign: campaign._id,
    status: { $in: [MessageStatus.SENT, MessageStatus.DELIVERED, MessageStatus.READ] },
  });
  const sentPhones = new Set<string>();
  sentMessages.forEach((m) => {
    const raw = m.recipient_phone ? m.recipient_phone.replace(/[^0-9]/g, '') : '';
    if (raw) {
      sentPhones.add(raw);
      if (raw.startsWith('0')) sentPhones.add('60' + raw.slice(1));
      if (raw.startsWith('60')) sentPhones.add('0' + raw.slice(2));
    }
  });

  const retryContacts: string[] = [];
  const successfulContacts: string[] = [];

  for (const c of allContacts) {
    const clean = c.replace(/[^0-9]/g, '');
    const norm = clean.startsWith('0') ? '60' + clean.slice(1) : (clean.startsWith('60') ? '0' + clean.slice(2) : clean);
    if (sentPhones.has(clean) || sentPhones.has(norm)) {
      successfulContacts.push(c);
    } else {
      retryContacts.push(c);
    }
  }

  if (retryContacts.length === 0) {
    return { success: true, count: 0, message: 'No failed or expired messages to retry', campaign };
  }

  // Load existing messages for this campaign to check previous sending phones & sessions
  const existingMessages = await Message.find({ campaign: campaign._id });
  const messageByPhone = new Map<string, any>();
  for (const m of existingMessages) {
    if (m.recipient_phone) {
      const raw = m.recipient_phone.replace(/[^0-9]/g, '');
      messageByPhone.set(raw, m);
      if (raw.startsWith('0')) messageByPhone.set('60' + raw.slice(1), m);
      if (raw.startsWith('60')) messageByPhone.set('0' + raw.slice(2), m);
    }
  }

  // Pre-load user sessions into map for fast lookup
  const userSessions = await WhatsAppSession.find({ user: campaign.user });
  const sessionDocMap = new Map<string, any>();
  for (const s of userSessions) {
    sessionDocMap.set(s._id.toString(), s);
    if (s.session_id) sessionDocMap.set(s.session_id, s);
  }

  // Resolve connected candidate sessions
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

  // Group retry contacts by their target sending phone / session
  const sessionQueueMap = new Map<string, RetryItem[]>();

  for (let idx = 0; idx < retryContacts.length; idx++) {
    const contact = retryContacts[idx];
    const rawRecip = contact.replace(/[^0-9]/g, '');
    const normRecip = rawRecip.startsWith('0') ? '60' + rawRecip.slice(1) : (rawRecip.startsWith('60') ? '0' + rawRecip.slice(2) : rawRecip);
    const possiblePhones = Array.from(new Set([rawRecip, normRecip])).filter(Boolean);
    const clean = rawRecip.startsWith('0') ? '60' + rawRecip.slice(1) : rawRecip;

    const existingMsg = messageByPhone.get(clean) || messageByPhone.get(normRecip) || messageByPhone.get(rawRecip);

    let sessionDoc = null;
    if (specificTargetSession) {
      sessionDoc = specificTargetSession;
    } else if (targetSessionId === 'random') {
      sessionDoc = connectedSessions[idx % connectedSessions.length];
    } else {
      // Preserve assigned session from existing message (original behavior)
      let assignedSessionId: any = existingMsg?.session;
      sessionDoc = assignedSessionId ? sessionDocMap.get(assignedSessionId.toString()) : null;

      if (assignedSessionId && !sessionDoc) {
        sessionDoc = await WhatsAppSession.findById(assignedSessionId);
        if (sessionDoc) {
          sessionDocMap.set(sessionDoc._id.toString(), sessionDoc);
        }
      }

      // Fallback only if message had no assigned session at all
      if (!sessionDoc && userSessions.length > 0) {
        sessionDoc = userSessions[idx % userSessions.length];
      }
    }

    const senderPhone = sessionDoc?.phone_number || existingMsg?.sender_phone;
    const sessKey = sessionDoc ? sessionDoc._id.toString() : 'default';

    const item: RetryItem = {
      contact,
      cleanPhone: clean,
      possiblePhones,
      sessionDoc,
      senderPhone,
    };

    const queue = sessionQueueMap.get(sessKey) || [];
    queue.push(item);
    sessionQueueMap.set(sessKey, queue);
  }

  const now = new Date();
  const nowMs = now.getTime();

  // For each individual sending phone, schedule independently
  for (const [, items] of sessionQueueMap.entries()) {
    const sampleItem = items[0];
    const sessionDoc = sampleItem.sessionDoc;

    // Allocate conflict-free slots following interval, last sending time, and occupied slots
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

      const updated = await Message.findOneAndUpdate(
        { campaign: campaign._id, recipient_phone: { $in: item.possiblePhones } },
        {
          status: MessageStatus.PENDING,
          session: sessionDoc ? sessionDoc._id : undefined,
          sender_phone: item.senderPhone,
          $unset: { error: 1, sent_at: 1, wa_timestamp: 1 },
          scheduled_at: scheduledTime,
          $inc: { retry_count: 1 },
        }
      );

      if (!updated) {
        await Message.create({
          campaign: campaign._id,
          session: sessionDoc ? sessionDoc._id : undefined,
          sender_phone: item.senderPhone,
          direction: MessageDirection.OUTBOUND,
          type: 'text',
          status: MessageStatus.PENDING,
          recipient_phone: item.cleanPhone,
          to_jid: `${item.cleanPhone}@s.whatsapp.net`,
          template: campaign.template || null,
          scheduled_at: scheduledTime,
          retry_count: 1,
        });
      }
    }
  }

  const hasConnectedSession = Array.from(sessionDocMap.values()).some(
    (s) => s.status === SessionStatus.CONNECTED
  );

  campaign.contacts = [...successfulContacts, ...retryContacts];
  campaign.recipient_phones = campaign.contacts;
  campaign.current_index = successfulContacts.length;
  campaign.stats.total = campaign.contacts.length;
  campaign.stats.sent = successfulContacts.length;
  campaign.stats.failed = 0;
  if (campaign.status !== CampaignStatus.PAUSED) {
    campaign.status = CampaignStatus.RUNNING;
  }
  campaign.scheduled_at = new Date();
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
    count: retryContacts.length,
    message: `Retrying ${retryContacts.length} recipient(s)${phoneNotice}${statusNotice}${warningMsg}`,
    warning: !hasConnectedSession ? 'No connected WhatsApp session found' : undefined,
    campaign,
  };
};

/**
 * Retries a single recipient message within a campaign.
 * Supports targetSessionId: 'random', 'original', or specific session ID.
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
  const now = new Date();

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

  // Find existing message to check original session
  const existingMsg = await Message.findOne({ campaign: campaign._id, recipient_phone: { $in: possiblePhones } });
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
    // Original behavior: preserve assigned session from existing message
    if (existingMsg?.session) {
      sessionDoc = await WhatsAppSession.findById(existingMsg.session);
    }
    if (!sessionDoc) {
      sessionDoc = connectedSessions.length > 0 ? connectedSessions[0] : (userSessions[0] || null);
    }
  }

  // Allocate next available conflict-free slot following interval, last sending time, and occupied slots
  const [scheduledTime = new Date()] = await findNextAvailableSlotsForSession({
    sessionDoc,
    campaign,
    count: 1,
    excludePhones: possiblePhones,
  });

  const senderPhone = sessionDoc?.phone_number || existingMsg?.sender_phone;

  // Update or create message in PENDING status
  const updatedMsg = await Message.findOneAndUpdate(
    { campaign: campaign._id, recipient_phone: { $in: possiblePhones } },
    {
      status: MessageStatus.PENDING,
      session: sessionDoc ? sessionDoc._id : undefined,
      sender_phone: senderPhone,
      $unset: { error: 1, sent_at: 1, wa_timestamp: 1 },
      scheduled_at: scheduledTime,
      $inc: { retry_count: 1 },
    },
    { new: true }
  );

  if (!updatedMsg) {
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

  // Ensure contact is queued in campaign.contacts for background worker
  const currentContacts = campaign.contacts || campaign.recipient_phones || [];
  const cleanContacts = currentContacts.map((c: string) => c.replace(/[^0-9]/g, ''));

  const isUpcoming = cleanContacts.slice(campaign.current_index).includes(cleanPhone);
  if (!isUpcoming) {
    const remaining = currentContacts.slice(campaign.current_index);
    const past = currentContacts.slice(0, campaign.current_index).filter((c: string) => c.replace(/[^0-9]/g, '') !== cleanPhone);
    const originalPhoneEntry = currentContacts.find((c: string) => c.replace(/[^0-9]/g, '') === cleanPhone) || cleanPhone;

    campaign.contacts = [...past, ...remaining, originalPhoneEntry];
    campaign.recipient_phones = campaign.contacts;
    campaign.current_index = past.length;
    campaign.stats.total = campaign.contacts.length;
  }

  if (campaign.stats.failed > 0) {
    campaign.stats.failed = Math.max(0, campaign.stats.failed - 1);
  }

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
