import { Message, MessageStatus } from '../models/Message.js';
import { resolveCampaignInterval } from './blastUtils.js';

interface FindSlotsOptions {
  sessionDoc: any;
  campaign?: any;
  count: number;
  excludeMessageIds?: (string | any)[];
  excludePhones?: string[];
}

/**
 * Finds next available sending slots for a specific WhatsApp session / phone number.
 * 1. Follows the configured interval (e.g. 30–45 mins).
 * 2. Checks the last sending time for this phone; if recently sent, ensures the first slot
 *    waits for the interval to elapse.
 * 3. Checks existing pending/queued messages for this phone. If a slot is occupied,
 *    queues into the next available conflict-free slot.
 */
export async function findNextAvailableSlotsForSession(options: FindSlotsOptions): Promise<Date[]> {
  const { sessionDoc, campaign, count, excludeMessageIds = [], excludePhones = [] } = options;

  if (count <= 0) return [];

  // 1. Resolve min and max interval in minutes
  const { minMins, maxMins } = resolveCampaignInterval(campaign, sessionDoc);
  const minIntervalMs = Math.max(1, minMins) * 60 * 1000;

  const getRandIntervalMs = () => {
    const randMinutes = Math.random() * (maxMins - minMins) + minMins;
    return Math.floor(randMinutes * 60 * 1000);
  };

  const nowMs = Date.now();

  // 2. Find the last sending time for this sending phone / session
  const sessionFilter: any[] = [];
  if (sessionDoc?._id) {
    sessionFilter.push({ session: sessionDoc._id });
  }
  if (sessionDoc?.phone_number) {
    sessionFilter.push({ sender_phone: sessionDoc.phone_number });
  }

  let lastSentTimeMs: number | null = null;

  if (sessionFilter.length > 0) {
    const lastSentMsg = await Message.findOne({
      $or: sessionFilter,
      status: { $in: [MessageStatus.SENT, MessageStatus.DELIVERED, MessageStatus.READ] },
    }).sort({ sent_at: -1, wa_timestamp: -1, updatedAt: -1 });

    const msgSentTime = lastSentMsg?.sent_at || lastSentMsg?.wa_timestamp || lastSentMsg?.updatedAt;

    const candidateTimestamps = [
      msgSentTime ? new Date(msgSentTime).getTime() : null,
      sessionDoc?.last_physical_phone_sent_message_at ? new Date(sessionDoc.last_physical_phone_sent_message_at).getTime() : null,
      sessionDoc?.last_phone_activity_at ? new Date(sessionDoc.last_phone_activity_at).getTime() : null,
    ].filter((t): t is number => typeof t === 'number' && !isNaN(t) && t > 0);

    if (candidateTimestamps.length > 0) {
      lastSentTimeMs = Math.max(...candidateTimestamps);
    }
  }

  // Determine earliest start time:
  // If phone recently sent a message, earliest time is (lastSentTimeMs + randomInterval).
  // Otherwise, start now (+ a short 10s buffer so it doesn't trigger 0-second race conditions).
  let earliestStartMs = nowMs + 10_000;
  if (lastSentTimeMs && lastSentTimeMs > 0) {
    const earliestAfterSend = lastSentTimeMs + getRandIntervalMs();
    if (earliestAfterSend > earliestStartMs) {
      earliestStartMs = earliestAfterSend;
    }
  }

  // 3. Find existing occupied slots on this session / phone (excluding messages being retried)
  const occupiedSlots: number[] = [];

  if (sessionFilter.length > 0) {
    const occupiedQuery: any = {
      $or: sessionFilter,
      status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED] },
      scheduled_at: { $gt: new Date(nowMs - 2 * 60 * 1000) },
    };

    if (excludeMessageIds.length > 0) {
      occupiedQuery._id = { $nin: excludeMessageIds };
    }
    if (excludePhones.length > 0) {
      occupiedQuery.recipient_phone = { $nin: excludePhones };
    }

    const occupiedMessages = await Message.find(occupiedQuery).select('scheduled_at').lean();

    for (const msg of occupiedMessages) {
      if (msg.scheduled_at) {
        const t = new Date(msg.scheduled_at).getTime();
        if (!isNaN(t)) {
          occupiedSlots.push(t);
        }
      }
    }
  }

  occupiedSlots.sort((a, b) => a - b);

  // 4. Sequentially allocate conflict-free slots
  const allocatedSlots: Date[] = [];
  let cursorMs = earliestStartMs;

  for (let i = 0; i < count; i++) {
    // Check if cursorMs collides with any occupied slot
    let hasConflict = true;
    let attempts = 0;

    while (hasConflict && attempts < 1000) {
      attempts++;
      hasConflict = false;

      for (const slot of occupiedSlots) {
        // If cursor is within minIntervalMs of an existing slot, it is occupied
        if (Math.abs(cursorMs - slot) < minIntervalMs) {
          // Advance cursor past the occupied slot
          cursorMs = slot + getRandIntervalMs();
          hasConflict = true;
          break; // restart check with new cursorMs
        }
      }
    }

    allocatedSlots.push(new Date(cursorMs));
    occupiedSlots.push(cursorMs);
    occupiedSlots.sort((a, b) => a - b);

    // Prepare cursor for next item
    cursorMs = cursorMs + getRandIntervalMs();
  }

  return allocatedSlots;
}
