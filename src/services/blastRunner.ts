import { BlastCampaign, CampaignStatus } from '../models/BlastCampaign.js';
import { WhatsAppSession, SessionStatus } from '../models/WhatsAppSession.js';
import { Message, MessageStatus } from '../models/Message.js';
import { User } from '../models/User.js';
import {
  runSessionQueueForCampaign,
  syncCampaignStatusAndStats,
  getInFlightMessageIds,
  SessionWorkerResult,
} from './sessionBlastWorker.js';

// Re-export shared utilities from blastUtils so existing importers don't break
export { sendBaileysTemplateMessage, getFileUrl, isSessionQualified, resolveCampaignInterval, isSessionAllowed } from './blastUtils.js';
import { isSessionAllowed } from './blastUtils.js';

let runnerInterval: NodeJS.Timeout | null = null;
let isProcessing = false;

/** A claimed (SENDING) message older than this, with no message_id, is considered stuck. */
const STALE_SENDING_MS = 10 * 60 * 1000;
const STALE_SENDING_HEAL_EVERY_MS = 5 * 60 * 1000;
let lastStaleSendingHealAt = 0;

/** Backoff after a run that made no progress (sessions busy / not ready / nothing sendable). */
const NO_PROGRESS_BACKOFF_MS = 30 * 1000;
const DEFERRED_BACKOFF_MS = 60 * 1000;

/**
 * Messages stuck in SENDING (process crashed / unexpected error mid-send) are
 * marked FAILED — never PENDING — so they can't be double-sent automatically.
 * The user can still retry them explicitly. In-flight sends of this process are skipped.
 */
async function healStaleSendingMessages(): Promise<void> {
  lastStaleSendingHealAt = Date.now();
  const inFlight = Array.from(getInFlightMessageIds());
  const res = await Message.updateMany(
    {
      status: MessageStatus.SENDING,
      updatedAt: { $lt: new Date(Date.now() - STALE_SENDING_MS) },
      $or: [{ message_id: { $exists: false } }, { message_id: null }, { message_id: '' }],
      ...(inFlight.length > 0 ? { _id: { $nin: inFlight } } : {}),
    },
    {
      $set: {
        status: MessageStatus.FAILED,
        error: 'Send interrupted (stuck in sending state); not retried automatically to avoid a duplicate send',
      },
    }
  );
  if (res.modifiedCount > 0) {
    console.log(`🩹 Marked ${res.modifiedCount} stuck SENDING campaign message(s) as FAILED.`);
  }
}

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

  // Fail (never re-queue) messages left mid-send by a previous process
  healStaleSendingMessages().catch((err) => {
    console.error('Error healing stuck SENDING campaign messages:', err);
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
/** Campaigns that were (re)triggered while a previous run was still winding down. */
const pendingRetriggers = new Set<string>();
/** Earliest time the scheduler may start another run of a campaign (no-progress backoff). */
const nextAllowedRun = new Map<string, number>();

export function getActiveCampaigns(): Set<string> {
  return activeCampaigns;
}

/**
 * Asks a running campaign to stop and waits up to `timeoutMs` for it. If the run
 * is still winding down after the timeout it stays registered as active, so no
 * parallel run can start; it cleans itself up (and honours a re-trigger) when done.
 */
export async function stopCampaignExecution(campaignId: string, timeoutMs = 3000): Promise<void> {
  pendingRetriggers.delete(campaignId);
  const controller = campaignAbortControllers.get(campaignId);
  if (controller) {
    controller.abort();
  }
  const start = Date.now();
  while (activeCampaigns.has(campaignId) && Date.now() - start < timeoutMs) {
    await new Promise((res) => setTimeout(res, 100));
  }
  if (activeCampaigns.has(campaignId)) {
    console.warn(`⏳ Campaign ${campaignId} is still winding down after ${timeoutMs}ms; it will finish on its own.`);
  }
}

export function triggerCampaignExecution(campaignId: string): void {
  // An explicit trigger bypasses the no-progress backoff.
  nextAllowedRun.delete(campaignId);
  if (activeCampaigns.has(campaignId)) {
    // A previous run is still active (possibly winding down after a stop):
    // start a fresh run as soon as it finishes instead of running in parallel.
    pendingRetriggers.add(campaignId);
    return;
  }
  startCampaignRun(campaignId);
}

function startCampaignRun(campaignId: string): void {
  activeCampaigns.add(campaignId);
  runSingleCampaign(campaignId).catch((err) =>
    console.error(`Unhandled error in runSingleCampaign (${campaignId}):`, err)
  );
}

async function runSingleCampaign(campaignId: string): Promise<void> {
  const abortController = new AbortController();
  campaignAbortControllers.set(campaignId, abortController);

  try {
    const campaign = await BlastCampaign.findById(campaignId)
      .select('_id name user status session_mode selected_sessions')
      .lean();
    if (!campaign || campaign.status !== CampaignStatus.RUNNING) {
      return;
    }

    const userDoc = campaign.user ? await User.findById(campaign.user).select('timezone').lean() : null;
    const userTimezone = userDoc?.timezone || 'Asia/Kuala_Lumpur';

    // Find all pending or queued messages for this campaign (ids + session only)
    let pendingMessages: { _id: any; session?: any }[] | null = await Message.find({
      campaign: campaignId,
      status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED] },
    })
      .select('_id session')
      .lean();

    if (pendingMessages.length === 0) {
      await syncCampaignStatusAndStats(campaignId);
      return;
    }

    // Resolve candidate sessions based on campaign mode
    const sessionFields = '_id session_id phone_number alias status';
    let candidateSessions = await WhatsAppSession.find({
      user: campaign.user,
      status: SessionStatus.CONNECTED,
    })
      .select(sessionFields)
      .sort({ createdAt: 1 })
      .lean();

    const selectedSessions = campaign.selected_sessions || [];
    if (campaign.session_mode === 'SPECIFIC' && selectedSessions.length > 0) {
      candidateSessions = candidateSessions.filter((s) => isSessionAllowed(s, selectedSessions));
      if (candidateSessions.length === 0) {
        const fallback = await WhatsAppSession.find({ user: campaign.user })
          .select(sessionFields)
          .sort({ createdAt: 1 })
          .lean();
        candidateSessions = fallback.filter((s) => isSessionAllowed(s, selectedSessions));
      }
    }

    // Reassign unassigned messages or messages assigned to disallowed or disconnected sessions
    const connectedSessionIdSet = new Set(candidateSessions.map((s) => s._id.toString()));
    const messagesToReassign = pendingMessages.filter((m) => {
      if (!m.session) return true;
      return candidateSessions.length > 0 && !connectedSessionIdSet.has(m.session.toString());
    });

    if (messagesToReassign.length > 0 && candidateSessions.length > 0) {
      const ops = messagesToReassign.map((m, i) => {
        const sDoc = candidateSessions[i % candidateSessions.length];
        return {
          updateOne: {
            // Status guard: never move a message a worker has already claimed (SENDING).
            filter: { _id: m._id, status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED] } },
            update: { $set: { session: sDoc._id, sender_phone: sDoc.phone_number } },
          },
        };
      });
      await Message.bulkWrite(ops, { ordered: false });
    }

    // Explicitly release the array so it is NOT retained in closure during long Promise.allSettled
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
      nextAllowedRun.set(campaignId, Date.now() + DEFERRED_BACKOFF_MS);
      return;
    }

    console.log(`🚀 Campaign "${campaign.name}" (${campaignId}): Running ${validSessionIds.length} concurrent session queues in parallel...`);

    // Run all assigned session workers concurrently
    const settled = await Promise.allSettled(
      validSessionIds.map((sId) => runSessionQueueForCampaign(campaignId, sId, userTimezone, abortController.signal))
    );

    // Synchronize overall campaign completion and stats
    await syncCampaignStatusAndStats(campaignId);

    // Back off if this run made no progress (sessions busy with another campaign,
    // not connected, outside their active window, ...) instead of reloading every tick.
    const results = settled
      .filter((r): r is PromiseFulfilledResult<SessionWorkerResult> => r.status === 'fulfilled')
      .map((r) => r.value);
    const processed = results.reduce((sum, r) => sum + r.processed, 0);
    const halted = results.some((r) => r.outcome === 'halted');
    if (processed === 0 && !halted) {
      const allDeferred = results.length > 0 && results.every((r) => r.outcome === 'deferred');
      nextAllowedRun.set(campaignId, Date.now() + (allDeferred ? DEFERRED_BACKOFF_MS : NO_PROGRESS_BACKOFF_MS));
    }
  } catch (err) {
    console.error(`Error in runSingleCampaign (${campaignId}):`, err);
    nextAllowedRun.set(campaignId, Date.now() + NO_PROGRESS_BACKOFF_MS);
  } finally {
    // Only clean up entries that still belong to this run.
    if (campaignAbortControllers.get(campaignId) === abortController) {
      campaignAbortControllers.delete(campaignId);
      activeCampaigns.delete(campaignId);
    }
    // Honour a trigger that arrived while this run was winding down.
    if (pendingRetriggers.delete(campaignId) && !activeCampaigns.has(campaignId)) {
      nextAllowedRun.delete(campaignId);
      startCampaignRun(campaignId);
    }
  }
}

async function processCampaigns(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  try {
    if (Date.now() - lastStaleSendingHealAt >= STALE_SENDING_HEAL_EVERY_MS) {
      await healStaleSendingMessages().catch((err) =>
        console.error('Error healing stuck SENDING campaign messages:', err)
      );
    }

    const now = new Date();
    const runningCampaigns = await BlastCampaign.find({
      status: CampaignStatus.RUNNING,
      $or: [
        { scheduled_at: { $exists: false } },
        { scheduled_at: null },
        { scheduled_at: { $lte: now } },
      ],
    })
      .select('_id')
      .lean();

    const nowMs = now.getTime();
    for (const campaign of runningCampaigns) {
      const campaignId = campaign._id.toString();
      if (activeCampaigns.has(campaignId)) continue;
      const notBefore = nextAllowedRun.get(campaignId);
      if (notBefore !== undefined) {
        if (nowMs < notBefore) continue;
        nextAllowedRun.delete(campaignId);
      }
      startCampaignRun(campaignId);
    }
  } catch (err) {
    console.error('Error in Blast Runner scheduler loop:', err);
  } finally {
    isProcessing = false;
  }
}
