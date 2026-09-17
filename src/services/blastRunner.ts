import { BlastCampaign, CampaignStatus } from '../models/BlastCampaign.js';
import { WhatsAppSession, SessionStatus } from '../models/WhatsAppSession.js';
import { Message, MessageStatus } from '../models/Message.js';
import { User } from '../models/User.js';
import { runSessionQueueForCampaign, syncCampaignStatusAndStats } from './sessionBlastWorker.js';

// Re-export shared utilities from blastUtils so existing importers don't break
export { sendBaileysTemplateMessage, getFileUrl, isSessionQualified, resolveCampaignInterval } from './blastUtils.js';

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

  runnerInterval = setInterval(processCampaigns, intervalMs);
}

export function stopBlastRunner(): void {
  if (runnerInterval) {
    clearInterval(runnerInterval);
    runnerInterval = null;
  }
}

const activeCampaigns = new Set<string>();

async function runSingleCampaign(campaignId: string): Promise<void> {
  try {
    const campaign = await BlastCampaign.findById(campaignId);
    if (!campaign || campaign.status !== CampaignStatus.RUNNING) {
      return;
    }

    const userDoc = campaign.user ? await User.findById(campaign.user) : null;
    const userTimezone = userDoc?.timezone || 'Asia/Kuala_Lumpur';

    // Find all pending or queued messages for this campaign
    const pendingMessages = await Message.find({
      campaign: campaignId,
      status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED] },
    });

    if (pendingMessages.length === 0) {
      await syncCampaignStatusAndStats(campaignId);
      return;
    }

    // Assign any unassigned pending messages to available connected sessions
    const unassignedMessages = pendingMessages.filter((m) => !m.session);
    if (unassignedMessages.length > 0) {
      const allowedSessionIds: string[] | undefined = campaign.session_mode === 'SPECIFIC' ? campaign.selected_sessions : undefined;
      let candidateSessions = await WhatsAppSession.find({ user: campaign.user, status: SessionStatus.CONNECTED }).sort({ createdAt: 1 });
      if (allowedSessionIds && allowedSessionIds.length > 0) {
        candidateSessions = candidateSessions.filter((s) => allowedSessionIds.includes(s.session_id) || allowedSessionIds.includes(s._id.toString()));
      }
      if (candidateSessions.length > 0) {
        for (let i = 0; i < unassignedMessages.length; i++) {
          const sDoc = candidateSessions[i % candidateSessions.length];
          unassignedMessages[i].session = sDoc._id;
          unassignedMessages[i].sender_phone = sDoc.phone_number;
          await unassignedMessages[i].save();
        }
      }
    }

    // Collect all distinct session IDs assigned to pending messages
    const distinctSessionIds = await Message.distinct('session', {
      campaign: campaignId,
      status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED] },
    });

    const validSessionIds = distinctSessionIds.filter(Boolean).map((s: any) => s.toString());

    if (validSessionIds.length === 0) {
      console.warn(`⚠️ No sessions assigned for campaign "${campaign.name}" (${campaignId})`);
      await syncCampaignStatusAndStats(campaignId);
      return;
    }

    console.log(`🚀 Campaign "${campaign.name}" (${campaignId}): Running ${validSessionIds.length} concurrent session queues in parallel...`);

    // Run all assigned session workers concurrently
    await Promise.allSettled(
      validSessionIds.map((sId) => runSessionQueueForCampaign(campaignId, sId, userTimezone))
    );

    // Synchronize overall campaign completion and stats
    await syncCampaignStatusAndStats(campaignId);
  } catch (err) {
    console.error(`Error in runSingleCampaign (${campaignId}):`, err);
  } finally {
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
