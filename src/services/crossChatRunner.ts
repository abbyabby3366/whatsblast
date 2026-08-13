import { User } from '../models/User.js';
import { WhatsAppSession, SessionStatus } from '../models/WhatsAppSession.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';
import { getActiveSession, markSystemSentMessageId, verifyAndFormatJid } from './baileysManager.js';
import { DialogueScript, getRandomScript, parseSpintax } from './crossChatService.js';
import dayjs from 'dayjs';

interface ActiveDialogue {
  id: string;
  user_id: string;
  session_a_id: string;
  session_a_phone: string;
  session_b_id: string;
  session_b_phone: string;
  script: DialogueScript;
  current_turn_index: number;
  target_turns?: number;
  next_turn_at: number;
  last_turn_sent_messages?: Array<{ key: any }>;
}

const activeDialogues: Map<string, ActiveDialogue> = new Map();
let runnerInterval: NodeJS.Timeout | null = null;
let isRunningCycle = false;
const userLastInitiatedMap: Map<string, number> = new Map();
const pairNextScheduledTimeMap: Map<string, number> = new Map(); // Fixed scheduled time per pair ID
const pairLastSentTimeMap: Map<string, number> = new Map(); // Last sent time per pair ID


export function getCanonicalPairKey(idA: string, idB: string): string {
  return [idA, idB].sort().join('_');
}

export function startCrossChatRunner(intervalMs = 8000): void {
  if (runnerInterval) return;
  console.log('🔄 Cross-Chat Session Warmup runner initialized.');
  runnerInterval = setInterval(processCrossChat, intervalMs);
}

export function stopCrossChatRunner(): void {
  if (runnerInterval) {
    clearInterval(runnerInterval);
    runnerInterval = null;
  }
}

function getRandomDelayMs(minSec = 10, maxSec = 25): number {
  const min = minSec * 1000;
  const max = maxSec * 1000;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function getRandomWarmupImageUrl(): Promise<string> {
  const topics = ['nature', 'landscape', 'coffee', 'workspace', 'city', 'architecture', 'minimal', 'travel', 'animals', 'technology'];
  const topic = topics[Math.floor(Math.random() * topics.length)];

  // 1. Try Unsplash API if access key exists
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY || process.env.UNSPLASH_API_KEY;
  if (unsplashKey) {
    try {
      const res = await fetch(`https://api.unsplash.com/photos/random?query=${topic}&orientation=landscape`, {
        headers: { Authorization: `Client-ID ${unsplashKey}` },
      });
      if (res.ok) {
        const data: any = await res.json();
        if (data?.urls?.regular || data?.urls?.small) {
          return data.urls.regular || data.urls.small;
        }
      }
    } catch (e) {
      console.warn('[CrossChat] Unsplash API fetch error:', e);
    }
  }

  // 2. Try Pexels API if key exists
  const pexelsKey = process.env.PEXELS_API_KEY;
  if (pexelsKey) {
    try {
      const page = Math.floor(Math.random() * 10) + 1;
      const res = await fetch(`https://api.pexels.com/v1/search?query=${topic}&per_page=15&page=${page}`, {
        headers: { Authorization: pexelsKey },
      });
      if (res.ok) {
        const data: any = await res.json();
        if (data?.photos?.length > 0) {
          const photo = data.photos[Math.floor(Math.random() * data.photos.length)];
          if (photo?.src?.medium || photo?.src?.original) {
            return photo.src.medium || photo.src.original;
          }
        }
      }
    } catch (e) {
      console.warn('[CrossChat] Pexels API fetch error:', e);
    }
  }

  // 3. Fallback: Picsum Photos dynamic seed URL
  const seed = Math.floor(Math.random() * 100000);
  return `https://picsum.photos/seed/${seed}/800/600`;
}

async function processCrossChat(): Promise<void> {
  if (isRunningCycle) return;
  isRunningCycle = true;

  try {
    const now = Date.now();

    // Step 1: Advance active dialogues
    for (const [dialogueId, dialogue] of Array.from(activeDialogues.entries())) {
      if (now < dialogue.next_turn_at) continue;

      const turn = dialogue.script.turns[dialogue.current_turn_index];
      const pairKey = getCanonicalPairKey(dialogue.session_a_id, dialogue.session_b_id);

      if (!turn) {
        activeDialogues.delete(dialogueId);
        await scheduleNextCycleForPair(pairKey);
        continue;
      }

      const isSenderA = turn.speaker === 'A';
      const senderSessionId = isSenderA ? dialogue.session_a_id : dialogue.session_b_id;
      const recipientPhone = isSenderA ? dialogue.session_b_phone : dialogue.session_a_phone;

      const senderActive = getActiveSession(senderSessionId);
      if (!senderActive || !senderActive.socket) {
        console.warn(`[CrossChat] Sender session ${senderSessionId} not active. Aborting dialogue.`);
        activeDialogues.delete(dialogueId);
        await scheduleNextCycleForPair(pairKey);
        continue;
      }

      const senderSessionDoc = await WhatsAppSession.findOne({ session_id: senderSessionId });
      if (!senderSessionDoc || senderSessionDoc.status !== SessionStatus.CONNECTED) {
        console.warn(`[CrossChat] Sender session ${senderSessionId} disconnected in DB.`);
        activeDialogues.delete(dialogueId);
        await scheduleNextCycleForPair(pairKey);
        continue;
      }

      const userDoc = await User.findById(dialogue.user_id);
      const startTime = userDoc?.cross_chat_active_start_time || '08:00';
      const endTime = userDoc?.cross_chat_active_end_time || '22:00';
      const timezone = userDoc?.timezone || 'Asia/Kuala_Lumpur';

      if (!isCurrentTimeInActiveWindow(startTime, endTime, new Date(), timezone)) {
        dialogue.next_turn_at = adjustToActiveWindow(Date.now(), startTime, endTime, timezone);
        console.log(`⏸️ [CrossChat] Active dialogue ${dialogueId} paused outside active window (${startTime}-${endTime}). Rescheduling to next active window.`);
        continue;
      }

      const minDelaySec = userDoc?.cross_chat_min_delay_sec ?? 15;
      const maxDelaySec = userDoc?.cross_chat_max_delay_sec ?? 120;
      const maxDailyMsgs = userDoc?.cross_chat_max_daily_messages || senderSessionDoc.max_message_count_per_day || 50;

      // Check daily limit for sender session
      const todayStr = dayjs().format('YYYY-MM-DD');
      if (senderSessionDoc.current_day !== todayStr) {
        senderSessionDoc.current_day = todayStr;
        senderSessionDoc.current_message_count = 0;
      }

      if (senderSessionDoc.current_message_count >= maxDailyMsgs) {
        console.log(`[CrossChat] Session ${senderSessionId} reached configured daily max message limit (${maxDailyMsgs}). Stopping dialogue.`);
        activeDialogues.delete(dialogueId);
        await scheduleNextCycleForPair(pairKey, userDoc);
        continue;
      }

      // Group consecutive turns for the same speaker starting at current_turn_index
      const speaker = turn.speaker;
      let endIdx = dialogue.current_turn_index;
      while (
        endIdx < dialogue.script.turns.length &&
        dialogue.script.turns[endIdx].speaker === speaker
      ) {
        endIdx++;
      }
      const consumedTurnsCount = endIdx - dialogue.current_turn_index;
      const consecutiveTurns = dialogue.script.turns.slice(dialogue.current_turn_index, endIdx);

      // Determine how many bubbles to send based on user config (min/max msgs per turn)
      const minMsgs = userDoc?.cross_chat_min_msgs_per_turn ?? 1;
      const maxMsgs = userDoc?.cross_chat_max_msgs_per_turn ?? 2;
      const targetBubbles = Math.floor(Math.random() * (maxMsgs - minMsgs + 1)) + minMsgs;

      let messagesToSend = consecutiveTurns.map(t => t.text);
      if (messagesToSend.length < targetBubbles) {
        const lastMsg = messagesToSend.pop();
        if (lastMsg) {
          const sentences = lastMsg.split(/(?<=[.!?])\s+/).filter(Boolean);
          if (sentences.length > 1) {
            messagesToSend.push(...sentences);
          } else {
            messagesToSend.push(lastMsg);
          }
        }
        if (messagesToSend.length > targetBubbles) {
          messagesToSend = messagesToSend.slice(0, targetBubbles);
        }
      } else if (messagesToSend.length > targetBubbles) {
        messagesToSend = messagesToSend.slice(0, targetBubbles);
      }

      // Format recipient JID
      const { jid, cleanPhone } = await verifyAndFormatJid(senderActive.socket, recipientPhone);
      const targetJid = jid || `${cleanPhone || recipientPhone.replace(/[^0-9]/g, '')}@s.whatsapp.net`;

      try {
        const sendImagesEnabled = Boolean(userDoc?.cross_chat_send_images_enabled);
        const imagePercentage = userDoc?.cross_chat_image_percentage ?? 20;
        const sendReactionsEnabled = Boolean(userDoc?.cross_chat_send_reactions_enabled);
        const reactionPercentage = userDoc?.cross_chat_reaction_percentage ?? 20;

        // Process reactions to opposing sender's previous turn messages
        if (sendReactionsEnabled && dialogue.last_turn_sent_messages && dialogue.last_turn_sent_messages.length > 0) {
          const reactionEmojis = ['👍', '❤️', '😂', '😮', '🔥', '🙏', '👏'];
          let reactionsSentCount = 0;

          for (const prevMsg of dialogue.last_turn_sent_messages) {
            if (prevMsg?.key && Math.random() * 100 < reactionPercentage) {
              try {
                const emoji = reactionEmojis[Math.floor(Math.random() * reactionEmojis.length)];
                const reactionKey = {
                  ...prevMsg.key,
                  remoteJid: targetJid,
                  fromMe: false,
                };
                const reactMsg: any = await senderActive.socket.sendMessage(targetJid, {
                  react: { text: emoji, key: reactionKey },
                });
                const reactId = reactMsg?.key?.id || `react_${Date.now()}`;
                markSystemSentMessageId(reactId);
                reactionsSentCount++;

                console.log(`😍 [CrossChat] ${senderSessionDoc.phone_number || senderSessionId} reacted "${emoji}" to opposing message`);
              } catch (reactErr) {
                console.warn(`[CrossChat] Failed sending reaction:`, reactErr);
              }
            }
          }

          if (reactionsSentCount > 0) {
            // Small delay (1-2 seconds) after sending reactions before sending text bubbles
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
        }

        const currentTurnSentMessages: Array<{ key: any }> = [];

        for (let i = 0; i < messagesToSend.length; i++) {
          const loopTodayStr = dayjs().format('YYYY-MM-DD');
          if (senderSessionDoc.current_day !== loopTodayStr) {
            senderSessionDoc.current_day = loopTodayStr;
            senderSessionDoc.current_message_count = 0;
          }

          if (senderSessionDoc.current_message_count >= maxDailyMsgs) {
            console.log(`[CrossChat] Session ${senderSessionId} reached configured daily max message limit (${maxDailyMsgs}) mid-turn. Stopping turn.`);
            break;
          }

          const bubbleText = messagesToSend[i];
          const processedText = parseSpintax(bubbleText);
          const shouldSendImage = (i === 0) && sendImagesEnabled && (Math.random() * 100 < imagePercentage);

          let sentMsg: any;
          let isMediaImage = false;
          let imageUrlUsed = '';

          if (shouldSendImage) {
            try {
              imageUrlUsed = await getRandomWarmupImageUrl();
              console.log(`📸 [CrossChat] Sending random image (${imageUrlUsed})`);
              sentMsg = await senderActive.socket.sendMessage(targetJid, {
                image: { url: imageUrlUsed },
                caption: processedText,
              });
              isMediaImage = true;
            } catch (imgErr) {
              console.warn(`[CrossChat] Image send failed, falling back to text:`, imgErr);
              sentMsg = await senderActive.socket.sendMessage(targetJid, { text: processedText });
            }
          } else {
            sentMsg = await senderActive.socket.sendMessage(targetJid, { text: processedText });
          }

          if (sentMsg?.key) {
            currentTurnSentMessages.push({ key: sentMsg.key });
          }

          const messageId = sentMsg?.key?.id || `cross_${Date.now()}`;
          markSystemSentMessageId(messageId);

          // Update session stats
          senderSessionDoc.current_message_count += 1;
          senderSessionDoc.last_phone_activity_at = new Date();
          await senderSessionDoc.save();

          pairLastSentTimeMap.set(pairKey, Date.now());

          // Log message record
          await Message.create({
            session: senderSessionDoc._id,
            message_id: messageId,
            direction: MessageDirection.OUTBOUND,
            type: isMediaImage ? 'image' : 'text',
            status: MessageStatus.SENT,
            to_jid: targetJid,
            recipient_phone: cleanPhone || recipientPhone,
            content: isMediaImage
              ? { text: `[Cross-Chat Warmup Image] ${processedText}`, file_url: imageUrlUsed }
              : { text: `[Cross-Chat Warmup] ${processedText}` },
            wa_timestamp: Math.floor(Date.now() / 1000),
          });

          if (isMediaImage) {
            console.log(`🖼️ [CrossChat] ${senderSessionDoc.phone_number || senderSessionId} -> ${recipientPhone}: Image (${imageUrlUsed})`);
          } else {
            console.log(`💬 [CrossChat] ${senderSessionDoc.phone_number || senderSessionId} -> ${recipientPhone}: "${processedText}"`);
          }

          if (i < messagesToSend.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }

        // Save last turn sent messages for reaction matching in the next speaker's turn
        if (currentTurnSentMessages.length > 0) {
          dialogue.last_turn_sent_messages = currentTurnSentMessages;
        }

        // Advance script index
        dialogue.current_turn_index += consumedTurnsCount;
        const targetTurns = dialogue.target_turns || userDoc?.cross_chat_max_turns || 5;

        if (dialogue.current_turn_index < Math.min(dialogue.script.turns.length, targetTurns)) {
          const rawNext = Date.now() + getRandomDelayMs(minDelaySec, maxDelaySec);
          dialogue.next_turn_at = adjustToActiveWindow(rawNext, startTime, endTime, timezone);
        } else {
          console.log(`✅ [CrossChat] Completed dialogue "${dialogue.script.topic}" (${dialogue.current_turn_index} turns) between ${dialogue.session_a_phone} & ${dialogue.session_b_phone}`);
          activeDialogues.delete(dialogueId);
          await scheduleNextCycleForPair(pairKey, userDoc);
        }
      } catch (err) {
        console.error(`❌ [CrossChat] Failed sending turn from ${senderSessionId}:`, err);
        activeDialogues.delete(dialogueId);
        await scheduleNextCycleForPair(pairKey);
      }
    }

    // Step 2: Check for users with Cross-Chat enabled and start new dialogues per pair schedule
    const enabledUsers = await User.find({ cross_chat_enabled: true });

    for (const user of enabledUsers) {
      const userIdStr = user._id.toString();
      const startTime = user.cross_chat_active_start_time || '08:00';
      const endTime = user.cross_chat_active_end_time || '22:00';
      const timezone = user.timezone || 'Asia/Kuala_Lumpur';

      if (!isCurrentTimeInActiveWindow(startTime, endTime, new Date(), timezone)) {
        continue;
      }

      // Fetch active connected sessions for this user with phone numbers
      const connectedSessions = await WhatsAppSession.find({
        user: user._id,
        status: SessionStatus.CONNECTED,
        phone_number: { $exists: true, $ne: '' },
      });

      if (connectedSessions.length < 2) continue;

      // Identify sessions currently engaged in active dialogues
      const busySessionIds = new Set<string>();
      for (const d of activeDialogues.values()) {
        if (d.user_id === userIdStr) {
          busySessionIds.add(d.session_a_id);
          busySessionIds.add(d.session_b_id);
        }
      }

      // Collect eligible candidate pairs whose scheduled send time has passed
      const candidatePairs: { sessionA: any; sessionB: any; pairKey: string; scheduledTime: number }[] = [];
      let staggerIdx = 0;

      for (let i = 0; i < connectedSessions.length; i++) {
        for (let j = i + 1; j < connectedSessions.length; j++) {
          const sA = connectedSessions[i];
          const sB = connectedSessions[j];

          // Skip if either session is busy in an ongoing dialogue
          if (busySessionIds.has(sA.session_id) || busySessionIds.has(sB.session_id)) {
            continue;
          }

          // Skip if either session has reached daily max message limit
          const todayStr = dayjs().format('YYYY-MM-DD');
          const countA = sA.current_day === todayStr ? (sA.current_message_count || 0) : 0;
          const countB = sB.current_day === todayStr ? (sB.current_message_count || 0) : 0;
          const maxA = user.cross_chat_max_daily_messages || sA.max_message_count_per_day || 50;
          const maxB = user.cross_chat_max_daily_messages || sB.max_message_count_per_day || 50;

          if (countA >= maxA || countB >= maxB) {
            continue;
          }

          const pairKey = getCanonicalPairKey(sA.session_id, sB.session_id);
          let scheduledTime = pairNextScheduledTimeMap.get(pairKey);
          if (!scheduledTime) {
            scheduledTime = await scheduleNextCycleForPair(pairKey, user, staggerIdx++);
          } else if (scheduledTime <= now) {
            const adjusted = adjustToActiveWindow(scheduledTime, startTime, endTime, timezone);
            if (adjusted > now) {
              pairNextScheduledTimeMap.set(pairKey, adjusted);
              continue;
            }
          }

          if (now >= scheduledTime) {
            candidatePairs.push({ sessionA: sA, sessionB: sB, pairKey, scheduledTime });
          }
        }
      }

      if (candidatePairs.length === 0) continue;

      // Sort candidate pairs by scheduledTime ascending (most overdue first)
      candidatePairs.sort((a, b) => a.scheduledTime - b.scheduledTime);
      const chosen = candidatePairs[0];

      // Ensure both sockets are available in memory
      const activeA = getActiveSession(chosen.sessionA.session_id);
      const activeB = getActiveSession(chosen.sessionB.session_id);
      if (!activeA || !activeB) continue;

      const script = getRandomScript();
      const dialogueId = `dialogue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const minTurns = user.cross_chat_min_turns ?? 3;
      const maxTurns = user.cross_chat_max_turns ?? 5;
      const targetTurns = Math.floor(Math.random() * (Math.max(minTurns, maxTurns) - Math.min(minTurns, maxTurns) + 1)) + Math.min(minTurns, maxTurns);

      activeDialogues.set(dialogueId, {
        id: dialogueId,
        user_id: userIdStr,
        session_a_id: chosen.sessionA.session_id,
        session_a_phone: chosen.sessionA.phone_number || '',
        session_b_id: chosen.sessionB.session_id,
        session_b_phone: chosen.sessionB.phone_number || '',
        script,
        current_turn_index: 0,
        target_turns: targetTurns,
        next_turn_at: Date.now() + 3000,
      });

      userLastInitiatedMap.set(userIdStr, now);
      console.log(`🚀 [CrossChat] Started new warmup dialogue "${script.topic}" between ${chosen.sessionA.phone_number} & ${chosen.sessionB.phone_number}`);
    }
  } catch (err) {
    console.error('Error in processCrossChat:', err);
  } finally {
    isRunningCycle = false;
  }
}

export function getLocalTimeInTimezone(date: Date, timeZone: string = 'Asia/Kuala_Lumpur') {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    let year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0;
    for (const part of parts) {
      if (part.type === 'year') year = parseInt(part.value, 10);
      if (part.type === 'month') month = parseInt(part.value, 10);
      if (part.type === 'day') day = parseInt(part.value, 10);
      if (part.type === 'hour') hour = parseInt(part.value, 10) % 24;
      if (part.type === 'minute') minute = parseInt(part.value, 10);
      if (part.type === 'second') second = parseInt(part.value, 10);
    }
    return { year, month, day, hour, minute, second };
  } catch (e) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    };
  }
}

export function getTimeInTimezoneMs(year: number, month: number, day: number, hour: number, minute: number, second: number, timeZone: string): number {
  const utcEstimate = Date.UTC(year, month - 1, day, hour, minute, second);
  const localOfUtc = getLocalTimeInTimezone(new Date(utcEstimate), timeZone);
  const localOfUtcMs = Date.UTC(localOfUtc.year, localOfUtc.month - 1, localOfUtc.day, localOfUtc.hour, localOfUtc.minute, localOfUtc.second);
  const offset = localOfUtcMs - utcEstimate;
  return utcEstimate - offset;
}

export function isCurrentTimeInActiveWindow(startTime = '08:00', endTime = '22:00', targetDate = new Date(), userTimezone = 'Asia/Kuala_Lumpur'): boolean {
  const [startHour, startMin] = (startTime || '08:00').split(':').map(Number);
  const [endHour, endMin] = (endTime || '22:00').split(':').map(Number);

  const local = getLocalTimeInTimezone(targetDate, userTimezone);
  const curMinutes = local.hour * 60 + local.minute;

  const startMinutes = (startHour || 0) * 60 + (startMin || 0);
  const endMinutes = (endHour || 0) * 60 + (endMin || 0);

  if (startMinutes <= endMinutes) {
    return curMinutes >= startMinutes && curMinutes <= endMinutes;
  } else {
    return curMinutes >= startMinutes || curMinutes <= endMinutes;
  }
}

export function adjustToActiveWindow(targetMs: number, startTime = '08:00', endTime = '22:00', userTimezone = 'Asia/Kuala_Lumpur'): number {
  const date = new Date(targetMs);
  if (isCurrentTimeInActiveWindow(startTime, endTime, date, userTimezone)) {
    return targetMs;
  }

  const [startHour, startMin] = (startTime || '08:00').split(':').map(Number);
  const [endHour, endMin] = (endTime || '22:00').split(':').map(Number);

  const local = getLocalTimeInTimezone(date, userTimezone);
  const curMinutes = local.hour * 60 + local.minute;

  const startMinutes = (startHour || 0) * 60 + (startMin || 0);
  const endMinutes = (endHour || 0) * 60 + (endMin || 0);

  let targetYear = local.year;
  let targetMonth = local.month;
  let targetDay = local.day;

  if (startMinutes <= endMinutes) {
    if (curMinutes > endMinutes) {
      const nextDayDate = new Date(targetMs + 24 * 3600 * 1000);
      const nextLocal = getLocalTimeInTimezone(nextDayDate, userTimezone);
      targetYear = nextLocal.year;
      targetMonth = nextLocal.month;
      targetDay = nextLocal.day;
    }
  }

  const jitterMinutes = Math.floor(Math.random() * 5);
  const finalStartMin = (startMin || 0) + jitterMinutes;
  const finalHour = (startHour || 8) + Math.floor(finalStartMin / 60);
  const finalMin = finalStartMin % 60;

  return getTimeInTimezoneMs(targetYear, targetMonth, targetDay, finalHour, finalMin, 0, userTimezone);
}

async function scheduleNextCycleForPair(pairKey: string, userDoc?: any, _staggerIndex = 0): Promise<number> {
  const doc = userDoc;
  const minMin = doc?.cross_chat_min_cooldown_min ?? doc?.cross_chat_cooldown_min ?? 5;
  const maxMin = doc?.cross_chat_max_cooldown_min ?? 720;
  const randomMin = Math.floor(Math.random() * (Math.max(minMin, maxMin) - Math.min(minMin, maxMin) + 1)) + Math.min(minMin, maxMin);

  const totalOffsetMs = randomMin * 60 * 1000;
  let nextTarget = Date.now() + totalOffsetMs;

  const startTime = doc?.cross_chat_active_start_time || '08:00';
  const endTime = doc?.cross_chat_active_end_time || '22:00';
  const timezone = doc?.timezone || 'Asia/Kuala_Lumpur';

  nextTarget = adjustToActiveWindow(nextTarget, startTime, endTime, timezone);

  pairNextScheduledTimeMap.set(pairKey, nextTarget);
  return nextTarget;
}

export async function getPairScheduledTimes(userId: string): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const userSessions = await WhatsAppSession.find({
    user: userId,
    status: SessionStatus.CONNECTED,
    phone_number: { $exists: true, $ne: '' },
  });

  const userDoc = await User.findById(userId);

  for (let i = 0; i < userSessions.length; i++) {
    for (let j = i + 1; j < userSessions.length; j++) {
      const sA = userSessions[i];
      const sB = userSessions[j];
      const pairKey = getCanonicalPairKey(sA.session_id, sB.session_id);

      const activeDialogue = Array.from(activeDialogues.values()).find(
        (d) => d.user_id === userId && getCanonicalPairKey(d.session_a_id, d.session_b_id) === pairKey
      );

      if (activeDialogue) {
        result[pairKey] = activeDialogue.next_turn_at;
      } else {
        const todayStr = dayjs().format('YYYY-MM-DD');
        const countA = sA.current_day === todayStr ? (sA.current_message_count || 0) : 0;
        const countB = sB.current_day === todayStr ? (sB.current_message_count || 0) : 0;
        const maxA = userDoc?.cross_chat_max_daily_messages || sA.max_message_count_per_day || 50;
        const maxB = userDoc?.cross_chat_max_daily_messages || sB.max_message_count_per_day || 50;

        if (countA >= maxA || countB >= maxB) {
          result[pairKey] = 0;
        } else {
          let scheduled = pairNextScheduledTimeMap.get(pairKey);
          if (!scheduled || scheduled <= Date.now()) {
            scheduled = await scheduleNextCycleForPair(pairKey, userDoc, i + j);
          }
          result[pairKey] = scheduled;
        }
      }
    }
  }

  return result;
}

export async function rescheduleAllPairsForUser(userId: string): Promise<Record<string, number>> {
  const userSessions = await WhatsAppSession.find({
    user: userId,
    status: SessionStatus.CONNECTED,
    phone_number: { $exists: true, $ne: '' },
  });

  const userDoc = await User.findById(userId);

  for (let i = 0; i < userSessions.length; i++) {
    for (let j = i + 1; j < userSessions.length; j++) {
      const sA = userSessions[i];
      const sB = userSessions[j];
      const pairKey = getCanonicalPairKey(sA.session_id, sB.session_id);

      pairNextScheduledTimeMap.delete(pairKey);

      const activeDialogue = Array.from(activeDialogues.values()).find(
        (d) => d.user_id === userId && getCanonicalPairKey(d.session_a_id, d.session_b_id) === pairKey
      );

      if (!activeDialogue) {
        await scheduleNextCycleForPair(pairKey, userDoc, i + j);
      }
    }
  }

  return getPairScheduledTimes(userId);
}

export async function getPairLastSentTimes(userId: string): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const userSessions = await WhatsAppSession.find({
    user: userId,
    status: SessionStatus.CONNECTED,
    phone_number: { $exists: true, $ne: '' },
  });

  for (let i = 0; i < userSessions.length; i++) {
    for (let j = i + 1; j < userSessions.length; j++) {
      const sA = userSessions[i];
      const sB = userSessions[j];
      const pairKey = getCanonicalPairKey(sA.session_id, sB.session_id);

      if (pairLastSentTimeMap.has(pairKey)) {
        result[pairKey] = pairLastSentTimeMap.get(pairKey)!;
      } else {
        const cleanA = (sA.phone_number || '').replace(/[^0-9]/g, '');
        const cleanB = (sB.phone_number || '').replace(/[^0-9]/g, '');
        const phones = [cleanA, cleanB, sA.phone_number, sB.phone_number].filter(Boolean);

        const latestMsg = await Message.findOne({
          session: { $in: [sA._id, sB._id] },
          recipient_phone: { $in: phones },
          'content.text': { $regex: 'Cross-Chat Warmup', $options: 'i' },
        }).sort({ createdAt: -1 });

        if (latestMsg && latestMsg.createdAt) {
          const lastTs = new Date(latestMsg.createdAt).getTime();
          pairLastSentTimeMap.set(pairKey, lastTs);
          result[pairKey] = lastTs;
        }
      }
    }
  }

  return result;
}

export async function getUserNextScheduledTime(userId: string): Promise<number> {
  const pairTimes = await getPairScheduledTimes(userId);
  const times = Object.values(pairTimes);
  if (times.length > 0) {
    return Math.min(...times);
  }
  return Date.now() + 5 * 60 * 1000;
}

export function getCrossChatStatus(userId: string) {
  const dialogues = Array.from(activeDialogues.values()).filter((d) => d.user_id === userId);
  return dialogues.map((d) => {
    const currentTurn = d.script.turns[d.current_turn_index];
    const isSenderA = currentTurn ? currentTurn.speaker === 'A' : true;
    const senderPhone = isSenderA ? d.session_a_phone : d.session_b_phone;
    const recipientPhone = isSenderA ? d.session_b_phone : d.session_a_phone;

    return {
      dialogue_id: d.id,
      topic: d.script.topic,
      current_turn_index: d.current_turn_index,
      total_turns: d.target_turns || d.script.turns.length,
      next_turn_at: d.next_turn_at,
      sender_phone: senderPhone,
      recipient_phone: recipientPhone,
      next_message_preview: currentTurn ? parseSpintax(currentTurn.text) : '',
    };
  });
}

export async function forceSendNextTurn(
  userId: string,
  sessionAId?: string,
  sessionBId?: string
): Promise<{ success: boolean; message: string }> {
  if (sessionAId && sessionBId) {
    const existing = Array.from(activeDialogues.values()).find(
      (d) => d.user_id === userId &&
        ((d.session_a_id === sessionAId && d.session_b_id === sessionBId) ||
         (d.session_a_id === sessionBId && d.session_b_id === sessionAId))
    );

    if (existing) {
      existing.next_turn_at = Date.now();
      await processCrossChat();
      return { success: true, message: 'Message sent immediately for this session pair!' };
    } else {
      const sessionA = await WhatsAppSession.findOne({ session_id: sessionAId, user: userId });
      const sessionB = await WhatsAppSession.findOne({ session_id: sessionBId, user: userId });

      if (!sessionA || !sessionB) {
        return { success: false, message: 'Specified sessions not found' };
      }

      const user = await User.findById(userId);
      const todayStr = dayjs().format('YYYY-MM-DD');
      const countA = sessionA.current_day === todayStr ? (sessionA.current_message_count || 0) : 0;
      const countB = sessionB.current_day === todayStr ? (sessionB.current_message_count || 0) : 0;
      const maxA = user?.cross_chat_max_daily_messages || sessionA.max_message_count_per_day || 50;
      const maxB = user?.cross_chat_max_daily_messages || sessionB.max_message_count_per_day || 50;

      if (countA >= maxA || countB >= maxB) {
        let reason = '';
        if (countA >= maxA && countB >= maxB) {
          reason = `Daily limit reached for both Session A (${sessionA.phone_number || 'Session A'}) and Session B (${sessionB.phone_number || 'Session B'})`;
        } else if (countA >= maxA) {
          reason = `Daily limit reached for Session A (${sessionA.phone_number || 'Session A'})`;
        } else {
          reason = `Daily limit reached for Session B (${sessionB.phone_number || 'Session B'})`;
        }
        return { success: false, message: `Cannot start chat: ${reason}` };
      }

      const minTurns = user?.cross_chat_min_turns ?? 3;
      const maxTurns = user?.cross_chat_max_turns ?? 5;
      const targetTurns = Math.floor(Math.random() * (Math.max(minTurns, maxTurns) - Math.min(minTurns, maxTurns) + 1)) + Math.min(minTurns, maxTurns);

      const script = getRandomScript();
      const dialogueId = `dialogue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      activeDialogues.set(dialogueId, {
        id: dialogueId,
        user_id: userId,
        session_a_id: sessionA.session_id,
        session_a_phone: sessionA.phone_number || '',
        session_b_id: sessionB.session_id,
        session_b_phone: sessionB.phone_number || '',
        script,
        current_turn_index: 0,
        target_turns: targetTurns,
        next_turn_at: Date.now(),
      });

      await processCrossChat();
      return { success: true, message: 'Started and sent first turn immediately for this pair!' };
    }
  }

  const dialogues = Array.from(activeDialogues.values()).filter((d) => d.user_id === userId);
  if (dialogues.length === 0) {
    const user = await User.findById(userId);
    if (!user || !user.cross_chat_enabled) {
      return { success: false, message: 'Cross-Chat Warmup is not enabled' };
    }

    const connectedSessions = await WhatsAppSession.find({
      user: userId,
      status: SessionStatus.CONNECTED,
      phone_number: { $exists: true, $ne: '' },
    });

    if (connectedSessions.length < 2) {
      return { success: false, message: 'Need at least 2 connected WhatsApp sessions for cross-chat' };
    }

    const shuffled = [...connectedSessions].sort(() => Math.random() - 0.5);
    const sessionA = shuffled[0];
    const sessionB = shuffled[1];

    const minTurns = user?.cross_chat_min_turns ?? 3;
    const maxTurns = user?.cross_chat_max_turns ?? 5;
    const targetTurns = Math.floor(Math.random() * (Math.max(minTurns, maxTurns) - Math.min(minTurns, maxTurns) + 1)) + Math.min(minTurns, maxTurns);

    const script = getRandomScript();
    const dialogueId = `dialogue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    activeDialogues.set(dialogueId, {
      id: dialogueId,
      user_id: userId,
      session_a_id: sessionA.session_id,
      session_a_phone: sessionA.phone_number || '',
      session_b_id: sessionB.session_id,
      session_b_phone: sessionB.phone_number || '',
      script,
      current_turn_index: 0,
      target_turns: targetTurns,
      next_turn_at: Date.now(),
    });
  }

  const targetDialogue = Array.from(activeDialogues.values()).find((d) => d.user_id === userId);
  if (!targetDialogue) {
    return { success: false, message: 'No active dialogue found' };
  }

  targetDialogue.next_turn_at = Date.now();
  await processCrossChat();

  return { success: true, message: 'Next scheduled message sent immediately!' };
}

