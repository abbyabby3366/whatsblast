import { BlastCampaign, CampaignStatus } from '../models/BlastCampaign.js';
import { WhatsAppSession, SessionStatus } from '../models/WhatsAppSession.js';
import { Message, MessageStatus } from '../models/Message.js';
import { User } from '../models/User.js';
import { runSessionQueueForCampaign, syncCampaignStatusAndStats } from './sessionBlastWorker.js';

// Re-export shared utilities from blastUtils so existing importers don't break
export { sendBaileysTemplateMessage, getFileUrl, isSessionQualified, resolveCampaignInterval, isSessionAllowed } from './blastUtils.js';
import { isSessionAllowed } from './blastUtils.js';

let runnerInterval: NodeJS.Timeout | null = null;
let isProcessing = false;

export function startBlastRunner(intervalMs = 3000): void {
  if (runnerInterval) return;

  // Automatically unpause any campaigns that were paused due to daily message limits
  BlastCampaign.updateMany(
    {
      status: CampaignStatus.PAUSED,
      error_message: { $regex: /daily message limit/i },
    },
    {
      $set: { status: CampaignStatus.RUNNING },
      $unset: { error_message: 1 },
    }
  )
    .then((res) => {
      if (res.modifiedCount > 0) {
        console.log(`🔄 Automatically resumed ${res.modifiedCount} campaign(s) previously paused by daily message limit.`);
      }
    })
    .catch((err) => {
      console.error('Error auto-resuming campaigns paused by daily message limit:', err);
    });

  // Automatically heal any sent campaign messages that were erroneously marked pending
  Message.updateMany(
    {
      campaign: { $exists: true, $ne: null },
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
  )
    .then((res) => {
      if (res.modifiedCount > 0) {
        console.log(`✨ Automatically healed ${res.modifiedCount} sent campaign message(s) that were erroneously marked pending.`);
      }
    })
    .catch((err) => {
      console.error('Error auto-healing sent campaign messages:', err);
    });

  runnerInterval = setInterval(processCampaigns, intervalMs);
}

export function stopBlastRunner(): void {
  if (runnerInterval) {
    clearInterval(runnerInterval);
    runnerInterval = null;
  }
}

const activeCampaigns = new Set<string>();
const campaignAbortControllers = new Map<string, AbortController>();

export function getActiveCampaigns(): Set<string> {
  return activeCampaigns;
}

export async function stopCampaignExecution(campaignId: string, timeoutMs = 3000): Promise<void> {
  const controller = campaignAbortControllers.get(campaignId);
  if (controller) {
    controller.abort();
  }
  const start = Date.now();
  while (activeCampaigns.has(campaignId) && Date.now() - start < timeoutMs) {
    await new Promise((res) => setTimeout(res, 100));
  }
  activeCampaigns.delete(campaignId);
  campaignAbortControllers.delete(campaignId);
}

export function triggerCampaignExecution(campaignId: string): void {
  if (activeCampaigns.has(campaignId)) return;
  activeCampaigns.add(campaignId);
  runSingleCampaign(campaignId).catch((err) =>
    console.error(`Unhandled error in triggered runSingleCampaign (${campaignId}):`, err)
  );
}

async function runSingleCampaign(campaignId: string): Promise<void> {
  const abortController = new AbortController();
  campaignAbortControllers.set(campaignId, abortController);

  try {
    const campaign = await BlastCampaign.findById(campaignId);
    if (!campaign || campaign.status !== CampaignStatus.RUNNING) {
      return;
    }

    const userDoc = campaign.user ? await User.findById(campaign.user) : null;
    const userTimezone = userDoc?.timezone || 'Asia/Kuala_Lumpur';

    // Find all pending or queued messages for this campaign
    let pendingMessages: any[] | null = await Message.find({
      campaign: campaignId,
      status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED] },
    });

    if (pendingMessages.length === 0) {
      await syncCampaignStatusAndStats(campaignId);
      return;
    }

    // Resolve candidate sessions based on campaign mode
    let candidateSessions = await WhatsAppSession.find({
      user: campaign.user,
      status: SessionStatus.CONNECTED,
    }).sort({ createdAt: 1 });

    if (campaign.session_mode === 'SPECIFIC' && campaign.selected_sessions && campaign.selected_sessions.length > 0) {
      candidateSessions = candidateSessions.filter((s) =>
        isSessionAllowed(s, campaign.selected_sessions)
      );
      if (candidateSessions.length === 0) {
        const fallback = await WhatsAppSession.find({ user: campaign.user }).sort({ createdAt: 1 });
        candidateSessions = fallback.filter((s) =>
          isSessionAllowed(s, campaign.selected_sessions)
        );
      }
    }

    // Reassign unassigned messages or messages assigned to disallowed or disconnected sessions
    const connectedSessionIdSet = new Set(candidateSessions.map((s) => s._id.toString()));
    const messagesToReassign = pendingMessages.filter((m: any) => {
      if (!m.session) return true;
      if (candidateSessions.length > 0 && !connectedSessionIdSet.has(m.session.toString())) return true;
      if (campaign.session_mode === 'SPECIFIC' && candidateSessions.length > 0) {
        return !candidateSessions.some((s) => s._id.toString() === m.session?.toString());
      }
      return false;
    });

    if (messagesToReassign.length > 0 && candidateSessions.length > 0) {
      for (let i = 0; i < messagesToReassign.length; i++) {
        const sDoc = candidateSessions[i % candidateSessions.length];
        messagesToReassign[i].session = sDoc._id;
        messagesToReassign[i].sender_phone = sDoc.phone_number;
        await messagesToReassign[i].save();
      }
    }

    // Explicitly release large document array so it is NOT retained in closure during long Promise.allSettled
    pendingMessages = null;

    if (abortController.signal.aborted) {
      return;
    }

    // Collect all distinct session IDs assigned to pending messages
    const distinctSessionIds = await Message.distinct('session', {
      campaign: campaignId,
      status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED] },
    });

    let validSessionIds = distinctSessionIds.filter(Boolean).map((s: any) => s.toString());

    if (campaign.session_mode === 'SPECIFIC' && candidateSessions.length > 0) {
      const allowedMongoIds = new Set(candidateSessions.map((s) => s._id.toString()));
      validSessionIds = validSessionIds.filter((sId) => allowedMongoIds.has(sId));
    }

    if (validSessionIds.length === 0) {
      console.warn(`⚠️ No sessions assigned for campaign "${campaign.name}" (${campaignId})`);
      await syncCampaignStatusAndStats(campaignId);
      return;
    }

    console.log(`🚀 Campaign "${campaign.name}" (${campaignId}): Running ${validSessionIds.length} concurrent session queues in parallel...`);

    // Run all assigned session workers concurrently
    await Promise.allSettled(
      validSessionIds.map((sId) => runSessionQueueForCampaign(campaignId, sId, userTimezone, abortController.signal))
    );

    // Synchronize overall campaign completion and stats
    await syncCampaignStatusAndStats(campaignId);
  } catch (err) {
    console.error(`Error in runSingleCampaign (${campaignId}):`, err);
  } finally {
    campaignAbortControllers.delete(campaignId);
    activeCampaigns.delete(campaignId);
  }
}

async function processCampaigns(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const now = new Date();
    const runningCampaigns = await BlastCampaign.find({
      status: CampaignStatus.RUNNING,
      $or: [
        { scheduled_at: { $exists: false } },
        { scheduled_at: null },
        { scheduled_at: { $lte: now } },
      ],
    });

    for (const campaign of runningCampaigns) {
      const campaignId = campaign._id.toString();
      if (!activeCampaigns.has(campaignId)) {
        activeCampaigns.add(campaignId);
        runSingleCampaign(campaignId).catch((err) =>
          console.error(`Unhandled error in runSingleCampaign (${campaignId}):`, err)
        );
      }
    }
  } catch (err) {
    console.error('Error in Blast Runner scheduler loop:', err);
  } finally {
    isProcessing = false;
  }
}
