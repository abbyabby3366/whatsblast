import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { Message, MessageStatus } from '../models/Message.js';

/**
 * Automatic message retention / pruning.
 *
 * `messages` is by far the largest collection in this database and it grows
 * without bound (~170k docs / ~250 MB per month), which repeatedly tripped the
 * Atlas cluster size alert. Measured breakdown before this service existed
 * (296k docs / 420 MB):
 *
 *   inbound from newsletters (@newsletter)   ~294 MB   <- the bulk, pure noise
 *   outbound cross-chat warmup (synthetic)    ~43 MB   <- internal test traffic
 *   inbound from groups (@g.us)               3.6 MB
 *   customer conversations + campaigns         90 MB   <- the part worth keeping
 *
 * So retention runs in two tiers:
 *
 *   NOISE   newsletter + group traffic and cross-chat warmup messages -> short window (7 days)
 *   GENERAL everything else: real customer conversations and campaign messages -> longer window (30 days)
 *
 * Messages that are not finished yet (`queued` / `pending`) are never deleted,
 * so a long-running or far-future-scheduled campaign can't lose its work queue.
 *
 * Environment (all optional):
 *   MESSAGE_RETENTION_ENABLED          'true' | 'false'          (default: true)
 *   MESSAGE_RETENTION_DAYS             noise window, days         (default: 7)
 *   MESSAGE_RETENTION_DAYS_GENERAL     general window, days       (default: 30)
 *   MESSAGE_RETENTION_CRON             cron expression            (default: '30 3 * * *' = 03:30, app TZ)
 *   MESSAGE_RETENTION_BATCH            docs per delete batch      (default: 2000)
 *   MESSAGE_RETENTION_BATCH_DELAY_MS   pause between batches, ms   (default: 200)
 *   MESSAGE_RETENTION_ON_START         'true' | 'false'           (default: true — catch-up prune after boot)
 *
 * NOTE: the in-memory `isRunning` guard assumes a SINGLE app instance, which is
 * how this service is deployed (one systemd unit). If this app is ever scaled to
 * multiple replicas, replace it with a shared lock (Mongo/Redis) or every
 * replica will prune concurrently.
 */

const DEFAULTS = {
  noiseDays: 7,
  generalDays: 30,
  batchSize: 2000,
  batchDelayMs: 200,
  cron: '30 3 * * *',
};
const STARTUP_DELAY_MS = 60_000;

/** Never delete messages that still have work to do. */
const UNFINISHED: string[] = [MessageStatus.QUEUED, MessageStatus.PENDING];

let scheduledTask: ScheduledTask | null = null;
let startupTimer: NodeJS.Timeout | null = null;
let isRunning = false;

function readInt(value: string | undefined, fallback: number, min: number): number {
  const parsed = parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return parsed;
}

function isEnabled(): boolean {
  return (process.env.MESSAGE_RETENTION_ENABLED ?? 'true').toLowerCase() !== 'false';
}

function config() {
  return {
    noiseDays: readInt(process.env.MESSAGE_RETENTION_DAYS, DEFAULTS.noiseDays, 1),
    generalDays: readInt(process.env.MESSAGE_RETENTION_DAYS_GENERAL, DEFAULTS.generalDays, 1),
    batchSize: readInt(process.env.MESSAGE_RETENTION_BATCH, DEFAULTS.batchSize, 100),
    batchDelayMs: readInt(process.env.MESSAGE_RETENTION_BATCH_DELAY_MS, DEFAULTS.batchDelayMs, 0),
  };
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** Newsletter + group inbound, and the synthetic cross-chat warmup traffic. */
const NOISE_CONDITIONS = [
  { direction: 'inbound', from_jid: { $regex: '@(newsletter|g\\.us)$' } },
  { direction: 'outbound', campaign: null, 'content.text': { $regex: 'Cross-Chat Warmup', $options: 'i' } },
];

function noiseFilter(cutoff: Date) {
  return {
    $or: NOISE_CONDITIONS,
    status: { $nin: UNFINISHED },
    // $gte guards against documents with a missing/null createdAt being treated
    // as "infinitely old" (a $lt comparison matches null in MongoDB).
    createdAt: { $gte: new Date(0), $lt: cutoff },
  };
}

function generalFilter(cutoff: Date) {
  return {
    $nor: NOISE_CONDITIONS,
    status: { $nin: UNFINISHED },
    createdAt: { $gte: new Date(0), $lt: cutoff },
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Deletes matching messages in bounded batches so a large backlog can never hold
 * a long-running delete, spike memory, or starve the live WhatsApp traffic.
 */
async function pruneFilter(
  label: string,
  filter: Record<string, any>,
  batchSize: number,
  batchDelayMs: number
): Promise<number> {
  let deleted = 0;
  for (;;) {
    // Oldest first: walks the { createdAt: -1 } index instead of scanning at random.
    const batch = await Message.find(filter).sort({ createdAt: 1 }).select('_id').limit(batchSize).lean();
    if (batch.length === 0) break;

    const result = await Message.deleteMany({ _id: { $in: batch.map((doc) => doc._id) } });
    deleted += result.deletedCount ?? 0;

    // Guard: if a full batch deleted nothing (e.g. matched docs vanished or the
    // delete is a no-op), stop instead of looping forever on the same documents.
    if (!result.deletedCount) break;
    if (batch.length < batchSize) break;
    if (batchDelayMs > 0) await sleep(batchDelayMs);
  }
  if (deleted > 0) console.log(`🧹 [MessageRetention] ${label}: pruned ${deleted} message(s)`);
  return deleted;
}

/**
 * Runs one retention pass: noise tier first (the big, safe win), then the
 * general tier. Rejects on failure so callers can surface it, but the
 * in-progress flag is always released.
 */
export async function pruneOldMessages(): Promise<{ noise: number; general: number; total: number }> {
  if (isRunning) {
    console.log('🧹 [MessageRetention] a prune is already in progress — skipping this run');
    return { noise: 0, general: 0, total: 0 };
  }

  const { noiseDays, generalDays, batchSize, batchDelayMs } = config();
  const noiseCutoff = daysAgo(noiseDays);
  const generalCutoff = daysAgo(generalDays);

  isRunning = true;
  const startedAt = Date.now();
  console.log(
    `🧹 [MessageRetention] starting prune — noise > ${noiseDays}d, general > ${generalDays}d (batches of ${batchSize})`
  );

  try {
    const noise = await pruneFilter('noise (newsletters/groups/warmup)', noiseFilter(noiseCutoff), batchSize, batchDelayMs);
    const general = await pruneFilter('general (customer/campaign)', generalFilter(generalCutoff), batchSize, batchDelayMs);

    const total = noise + general;
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    if (total === 0) {
      console.log(`✅ [MessageRetention] prune complete — nothing to delete [${seconds}s]`);
    } else {
      console.log(`✅ [MessageRetention] prune complete — ${total} message(s) deleted in ${seconds}s`);
    }
    return { noise, general, total };
  } finally {
    isRunning = false;
  }
}

/** Starts the daily schedule plus an optional catch-up prune shortly after boot. */
export async function initMessageRetention(): Promise<void> {
  if (!isEnabled()) {
    console.log('⏭️  [MessageRetention] disabled via MESSAGE_RETENTION_ENABLED=false');
    return;
  }

  const { noiseDays, generalDays } = config();
  const expression = (process.env.MESSAGE_RETENTION_CRON ?? DEFAULTS.cron).trim();

  scheduledTask?.stop();
  scheduledTask = null;

  if (cron.validate(expression)) {
    scheduledTask = cron.schedule(expression, () => {
      pruneOldMessages().catch((err) => console.error('[MessageRetention] scheduled prune failed:', err));
    });
    console.log(
      `🧹 [MessageRetention] scheduled prune (noise ${noiseDays}d / general ${generalDays}d) with cron '${expression}'`
    );
  } else {
    console.warn(`⚠️ [MessageRetention] invalid MESSAGE_RETENTION_CRON '${expression}' — daily schedule not started`);
  }

  // Catch-up run after boot: keeps retention honest across restarts/deploys and
  // drains the existing backlog on first deployment. Delayed so it does not
  // compete with session restore, and batched so live traffic is unaffected.
  if ((process.env.MESSAGE_RETENTION_ON_START ?? 'true').toLowerCase() !== 'false') {
    startupTimer = setTimeout(() => {
      startupTimer = null;
      pruneOldMessages().catch((err) => console.error('[MessageRetention] startup prune failed:', err));
    }, STARTUP_DELAY_MS);
    console.log('🧹 [MessageRetention] startup catch-up prune queued (~60s after boot)');
  }
}

/** Stops the scheduled prune and cancels a pending startup run. */
export function stopMessageRetention(): void {
  scheduledTask?.stop();
  scheduledTask = null;
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
}
