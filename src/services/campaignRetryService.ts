import { BlastCampaign, CampaignStatus } from '../models/BlastCampaign.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';
import { WhatsAppSession, SessionStatus } from '../models/WhatsAppSession.js';
import { resolveCampaignInterval } from './blastUtils.js';

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
  campaignDocOrId: any
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

  // Load existing messages for this campaign to preserve original sending phones & sessions
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

  // Group retry contacts by their original sending phone / session
  const sessionQueueMap = new Map<string, RetryItem[]>();

  for (let idx = 0; idx < retryContacts.length; idx++) {
    const contact = retryContacts[idx];
    const rawRecip = contact.replace(/[^0-9]/g, '');
    const normRecip = rawRecip.startsWith('0') ? '60' + rawRecip.slice(1) : (rawRecip.startsWith('60') ? '0' + rawRecip.slice(2) : rawRecip);
    const possiblePhones = Array.from(new Set([rawRecip, normRecip])).filter(Boolean);
    const clean = rawRecip.startsWith('0') ? '60' + rawRecip.slice(1) : rawRecip;

    const existingMsg = messageByPhone.get(clean) || messageByPhone.get(normRecip) || messageByPhone.get(rawRecip);

    let assignedSessionId: any = existingMsg?.session;
    let sessionDoc = assignedSessionId ? sessionDocMap.get(assignedSessionId.toString()) : null;

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

    const senderPhone = existingMsg?.sender_phone || sessionDoc?.phone_number;
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

    // Resolve intervals per phone (campaign first, then session settings)
    const { minMins, maxMins } = resolveCampaignInterval(campaign, sessionDoc);
    const getRandIntervalMs = () => {
      const randMinutes = Math.random() * (maxMins - minMins) + minMins;
      return Math.floor(randMinutes * 60 * 1000);
    };

    // Check if this sending phone already has future pending messages (excluding retry recipients)
    const retryPhonesForThisSession = items.map((it) => it.cleanPhone);
    const lastPending = sessionDoc
      ? await Message.findOne({
          session: sessionDoc._id,
          recipient_phone: { $nin: retryPhonesForThisSession },
          status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED] },
          scheduled_at: { $gt: now },
        }).sort({ scheduled_at: -1 })
      : null;

    let currentScheduleMs: number;
    if (lastPending && lastPending.scheduled_at) {
      // Start after this phone's latest future scheduled message
      currentScheduleMs = new Date(lastPending.scheduled_at).getTime() + getRandIntervalMs();
    } else {
      // No future scheduled messages -> start immediately at now
      currentScheduleMs = nowMs;
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let scheduledTimeMs = currentScheduleMs;
      if (i > 0) {
        // Subsequent message on the same sending phone adds interval
        scheduledTimeMs = currentScheduleMs + getRandIntervalMs();
        currentScheduleMs = scheduledTimeMs;
      }

      const scheduledTime = new Date(scheduledTimeMs);

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
  campaign.status = CampaignStatus.RUNNING;
  campaign.scheduled_at = new Date();
  campaign.completed_at = undefined;
  campaign.error_message = undefined;

  await campaign.save();

  const warningMsg = !hasConnectedSession
    ? ' (Note: No connected WhatsApp session found. Messages will send once WhatsApp connects.)'
    : '';

  return {
    success: true,
    count: retryContacts.length,
    message: `Retrying ${retryContacts.length} recipient(s)${warningMsg}`,
    warning: !hasConnectedSession ? 'No connected WhatsApp session found' : undefined,
    campaign,
  };
};

/**
 * Retries a single recipient message within a campaign.
 * Preserves the original assigned session and calculates next schedule time for that session.
 */
export const executeCampaignRetryRecipient = async (
  campaign: any,
  phone: string
): Promise<{ success: boolean; message: string; scheduled_at?: Date; error?: string }> => {
  const rawRecip = phone.replace(/[^0-9]/g, '');
  const normRecip = rawRecip.startsWith('0') ? '60' + rawRecip.slice(1) : (rawRecip.startsWith('60') ? '0' + rawRecip.slice(2) : rawRecip);
  const possiblePhones = Array.from(new Set([rawRecip, normRecip])).filter(Boolean);
  const cleanPhone = rawRecip.startsWith('0') ? '60' + rawRecip.slice(1) : rawRecip;
  const now = new Date();

  // Find existing message to preserve assigned session
  const existingMsg = await Message.findOne({ campaign: campaign._id, recipient_phone: { $in: possiblePhones } });
  let sessionDoc = null;
  if (existingMsg?.session) {
    sessionDoc = await WhatsAppSession.findById(existingMsg.session);
  }
  if (!sessionDoc) {
    sessionDoc = await WhatsAppSession.findOne({ user: campaign.user });
  }

  // Resolve interval for phone / campaign
  const { minMins, maxMins } = resolveCampaignInterval(campaign, sessionDoc);
  const getRandIntervalMs = () => {
    const randMinutes = Math.random() * (maxMins - minMins) + minMins;
    return Math.floor(randMinutes * 60 * 1000);
  };

  // Find latest future pending message for this assigned session
  const lastPending = sessionDoc
    ? await Message.findOne({
        session: sessionDoc._id,
        recipient_phone: { $nin: possiblePhones },
        status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED] },
        scheduled_at: { $gt: now },
      }).sort({ scheduled_at: -1 })
    : null;

  let scheduledTimeMs = now.getTime();
  if (lastPending && lastPending.scheduled_at) {
    scheduledTimeMs = new Date(lastPending.scheduled_at).getTime() + getRandIntervalMs();
  }
  const scheduledTime = new Date(scheduledTimeMs);

  // Update or create message in PENDING status
  const updatedMsg = await Message.findOneAndUpdate(
    { campaign: campaign._id, recipient_phone: { $in: possiblePhones } },
    {
      status: MessageStatus.PENDING,
      session: sessionDoc ? sessionDoc._id : undefined,
      sender_phone: existingMsg?.sender_phone || sessionDoc?.phone_number,
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
      sender_phone: sessionDoc?.phone_number,
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

  campaign.status = CampaignStatus.RUNNING;
  campaign.completed_at = undefined;
  campaign.error_message = undefined;
  await campaign.save();

  return {
    success: true,
    message: `Message rescheduled for ${cleanPhone}. It will be sent via campaign scheduler.`,
    scheduled_at: scheduledTime,
  };
};
