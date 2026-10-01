import { BlastCampaign, CampaignStatus } from '../models/BlastCampaign.js';
import { Message, MessageStatus } from '../models/Message.js';
import { WhatsAppSession, SessionStatus } from '../models/WhatsAppSession.js';
import { findNextAvailableSlotsForSession } from './scheduleSlotFinder.js';
import { stopCampaignExecution, triggerCampaignExecution } from './blastRunner.js';
import { isSessionAllowed } from './blastUtils.js';

export interface RescheduleOptions {
  sessionIds?: string[];
  minInterval?: number; // in minutes
  maxInterval?: number; // in minutes
}

export interface RescheduleResult {
  success: boolean;
  count: number;
  message: string;
  assignedSessionsCount: number;
  campaign?: any;
}

/**
 * Redistributes remaining unsent (pending / queued) messages of a campaign
 * across the specified or newly added connected WhatsApp sending phones.
 */
export async function executeCampaignReschedule(
  campaignDocOrId: any,
  options: RescheduleOptions = {}
): Promise<RescheduleResult> {
  const campaign =
    typeof campaignDocOrId === 'string'
      ? await BlastCampaign.findById(campaignDocOrId)
      : campaignDocOrId;

  if (!campaign) {
    return {
      success: false,
      count: 0,
      message: 'Campaign not found.',
      assignedSessionsCount: 0,
    };
  }

  // 1. Find all remaining pending or queued messages for this campaign
  const pendingMessages = await Message.find({
    campaign: campaign._id,
    status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED] },
  }).sort({ scheduled_at: 1, createdAt: 1 });

  if (pendingMessages.length === 0) {
    return {
      success: false,
      count: 0,
      message: 'No remaining pending messages to reschedule in this campaign.',
      assignedSessionsCount: 0,
      campaign,
    };
  }

  // 2. Fetch all WhatsApp sessions for the campaign owner
  const userSessions = await WhatsAppSession.find({ user: campaign.user });
  const connectedSessions = userSessions.filter(
    (s) => s.status === SessionStatus.CONNECTED
  );

  let targetSessions: any[] = [];
  if (Array.isArray(options.sessionIds) && options.sessionIds.length > 0) {
    targetSessions = userSessions.filter((s) =>
      isSessionAllowed(s, options.sessionIds!)
    );
  }

  // If no specific valid sessions matched or none provided, use all connected sessions
  if (targetSessions.length === 0) {
    targetSessions = connectedSessions;
  }

  if (targetSessions.length === 0) {
    return {
      success: false,
      count: 0,
      message:
        'No connected WhatsApp phone found. Please connect your phone in WhatsApp Sessions first before rescheduling.',
      assignedSessionsCount: 0,
      campaign,
    };
  }

  // 3. Gracefully stop current background execution loops for this campaign
  await stopCampaignExecution(campaign._id.toString(), 3000);

  // 4. Resolve interval bounds
  const minIntervalMins =
    options.minInterval !== undefined && !isNaN(Number(options.minInterval))
      ? Math.max(0.1, Number(options.minInterval))
      : Number(campaign.min_interval_seconds) || 10;

  const maxIntervalMins =
    options.maxInterval !== undefined && !isNaN(Number(options.maxInterval))
      ? Math.max(minIntervalMins, Number(options.maxInterval))
      : Number(campaign.max_interval_seconds) >= minIntervalMins
      ? Number(campaign.max_interval_seconds)
      : minIntervalMins + 5;

  // 5. Group pending messages across target sessions using round-robin distribution
  const sessionItemsMap = new Map<string, typeof pendingMessages>();
  targetSessions.forEach((s) => sessionItemsMap.set(s._id.toString(), []));

  for (let idx = 0; idx < pendingMessages.length; idx++) {
    const assignedSession = targetSessions[idx % targetSessions.length];
    const list = sessionItemsMap.get(assignedSession._id.toString())!;
    list.push(pendingMessages[idx]);
  }

  // 6. Compute conflict-free scheduled times and reassign sessions for all pending messages
  const pendingMessageIds = pendingMessages.map((m) => m._id);

  for (const sessionDoc of targetSessions) {
    const items = sessionItemsMap.get(sessionDoc._id.toString()) || [];
    if (items.length === 0) continue;

    const scheduledSlots = await findNextAvailableSlotsForSession({
      sessionDoc,
      campaign: {
        ...campaign.toObject(),
        min_interval_seconds: minIntervalMins,
        max_interval_seconds: maxIntervalMins,
      },
      count: items.length,
      excludeMessageIds: pendingMessageIds,
    });

    for (let i = 0; i < items.length; i++) {
      const msg = items[i];
      const slot = scheduledSlots[i] || new Date();
      msg.session = sessionDoc._id;
      msg.sender_phone = sessionDoc.phone_number;
      msg.scheduled_at = slot;
      msg.status = MessageStatus.PENDING;
      delete (msg as any).error;
      await msg.save();
    }
  }

  // 7. Update Campaign configuration and clear previous error state
  campaign.min_interval_seconds = minIntervalMins;
  campaign.max_interval_seconds = maxIntervalMins;

  if (Array.isArray(options.sessionIds) && options.sessionIds.length > 0) {
    campaign.session_mode = 'SPECIFIC';
    campaign.selected_sessions = targetSessions.map(
      (s) => s.session_id || s._id.toString()
    );
  } else {
    campaign.session_mode = 'ALL';
    campaign.selected_sessions = [];
  }

  campaign.error_message = undefined;

  if (campaign.status === CampaignStatus.COMPLETED) {
    campaign.status = CampaignStatus.RUNNING;
    campaign.completed_at = undefined;
  }

  await campaign.save();

  // 8. If campaign is RUNNING, trigger immediate parallel execution across all assigned sessions
  const isRunning = campaign.status === CampaignStatus.RUNNING;
  if (isRunning) {
    triggerCampaignExecution(campaign._id.toString());
  }

  const phoneNumbers = targetSessions
    .map((s) => s.phone_number || s.session_id)
    .filter(Boolean)
    .join(', ');

  return {
    success: true,
    count: pendingMessages.length,
    assignedSessionsCount: targetSessions.length,
    message: `Rescheduled ${pendingMessages.length} remaining message(s) across ${targetSessions.length} sending phone(s) (${phoneNumbers}).${
      isRunning
        ? ' Blasting will send in parallel according to the configured interval.'
        : ' Messages will blast when the campaign is resumed.'
    }`,
    campaign,
  };
}
