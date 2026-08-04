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
}

const activeDialogues: Map<string, ActiveDialogue> = new Map();
let runnerInterval: NodeJS.Timeout | null = null;
let isRunningCycle = false;
const userLastInitiatedMap: Map<string, number> = new Map();
const userNextScheduledTimeMap: Map<string, number> = new Map(); // Fixed scheduled time for next cycle per user

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
      if (!turn) {
        activeDialogues.delete(dialogueId);
        scheduleNextCycleForUser(dialogue.user_id);
        continue;
      }

      const isSenderA = turn.speaker === 'A';
      const senderSessionId = isSenderA ? dialogue.session_a_id : dialogue.session_b_id;
      const recipientPhone = isSenderA ? dialogue.session_b_phone : dialogue.session_a_phone;

      const senderActive = getActiveSession(senderSessionId);
      if (!senderActive || !senderActive.socket) {
        console.warn(`[CrossChat] Sender session ${senderSessionId} not active. Aborting dialogue.`);
        activeDialogues.delete(dialogueId);
        scheduleNextCycleForUser(dialogue.user_id);
        continue;
      }

      const senderSessionDoc = await WhatsAppSession.findOne({ session_id: senderSessionId });
      if (!senderSessionDoc || senderSessionDoc.status !== SessionStatus.CONNECTED) {
        console.warn(`[CrossChat] Sender session ${senderSessionId} disconnected in DB.`);
        activeDialogues.delete(dialogueId);
        scheduleNextCycleForUser(dialogue.user_id);
        continue;
      }

      // Fetch user configuration
      const userDoc = await User.findById(dialogue.user_id);
      const minDelaySec = userDoc?.cross_chat_min_delay_sec ?? 25;
      const maxDelaySec = userDoc?.cross_chat_max_delay_sec ?? 300;
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
        scheduleNextCycleForUser(dialogue.user_id);
        continue;
      }

      // Format recipient JID
      const { jid, cleanPhone } = await verifyAndFormatJid(senderActive.socket, recipientPhone);
      const targetJid = jid || `${cleanPhone || recipientPhone.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
      const processedText = parseSpintax(turn.text);

      try {
        const sendImagesEnabled = Boolean(userDoc?.cross_chat_send_images_enabled);
        const imagePercentage = userDoc?.cross_chat_image_percentage ?? 20;
        const shouldSendImage = sendImagesEnabled && (Math.random() * 100 < imagePercentage);

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

        const messageId = sentMsg?.key?.id || `cross_${Date.now()}`;
        markSystemSentMessageId(messageId);

        // Update session stats
        senderSessionDoc.current_message_count += 1;
        senderSessionDoc.last_phone_activity_at = new Date();
        senderSessionDoc.last_physical_phone_sent_message_at = new Date();
        await senderSessionDoc.save();

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
          wa_timestamp: Math.floor(now / 1000),
        });

        if (isMediaImage) {
          console.log(`🖼️ [CrossChat] ${senderSessionDoc.phone_number || senderSessionId} -> ${recipientPhone}: Image (${imageUrlUsed})`);
        } else {
          console.log(`💬 [CrossChat] ${senderSessionDoc.phone_number || senderSessionId} -> ${recipientPhone}: "${processedText}"`);
        }

        // Advance to next turn
        dialogue.current_turn_index += 1;
        const targetTurns = dialogue.target_turns || userDoc?.cross_chat_max_turns || 5;

        if (dialogue.current_turn_index < Math.min(dialogue.script.turns.length, targetTurns)) {
          dialogue.next_turn_at = Date.now() + getRandomDelayMs(minDelaySec, maxDelaySec);
        } else {
          console.log(`✅ [CrossChat] Completed dialogue "${dialogue.script.topic}" (${dialogue.current_turn_index} turns) between ${dialogue.session_a_phone} & ${dialogue.session_b_phone}`);
          activeDialogues.delete(dialogueId);
          scheduleNextCycleForUser(dialogue.user_id);
        }
      } catch (err) {
        console.error(`❌ [CrossChat] Failed sending turn from ${senderSessionId}:`, err);
        activeDialogues.delete(dialogueId);
        scheduleNextCycleForUser(dialogue.user_id);
      }
    }

    // Step 2: Check for users with Cross-Chat enabled and start new dialogues
    const enabledUsers = await User.find({ cross_chat_enabled: true });

    for (const user of enabledUsers) {
      const userIdStr = user._id.toString();

      // Check how many active dialogues this user currently has
      let userActiveCount = 0;
      for (const d of activeDialogues.values()) {
        if (d.user_id === userIdStr) userActiveCount++;
      }

      // Limit to 1 active dialogue per user at a time
      if (userActiveCount >= 1) continue;

      // Check scheduled target time for this user
      let scheduledTime = userNextScheduledTimeMap.get(userIdStr);
      if (!scheduledTime) {
        scheduledTime = scheduleNextCycleForUser(userIdStr, user);
      }

      if (now < scheduledTime) continue;

      // Fetch active connected sessions for this user with phone numbers
      const connectedSessions = await WhatsAppSession.find({
        user: user._id,
        status: SessionStatus.CONNECTED,
        phone_number: { $exists: true, $ne: '' },
      });

      if (connectedSessions.length < 2) continue;

      // Pick 2 random sessions
      const shuffled = [...connectedSessions].sort(() => Math.random() - 0.5);
      const sessionA = shuffled[0];
      const sessionB = shuffled[1];

      // Ensure both sockets are available in memory
      const activeA = getActiveSession(sessionA.session_id);
      const activeB = getActiveSession(sessionB.session_id);
      if (!activeA || !activeB) continue;

      const script = getRandomScript();
      const dialogueId = `dialogue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const minTurns = user.cross_chat_min_turns ?? 3;
      const maxTurns = user.cross_chat_max_turns ?? 5;
      const targetTurns = Math.floor(Math.random() * (Math.max(minTurns, maxTurns) - Math.min(minTurns, maxTurns) + 1)) + Math.min(minTurns, maxTurns);

      activeDialogues.set(dialogueId, {
        id: dialogueId,
        user_id: userIdStr,
        session_a_id: sessionA.session_id,
        session_a_phone: sessionA.phone_number || '',
        session_b_id: sessionB.session_id,
        session_b_phone: sessionB.phone_number || '',
        script,
        current_turn_index: 0,
        target_turns: targetTurns,
        next_turn_at: Date.now() + 3000, // start first turn in 3s
      });

      userLastInitiatedMap.set(userIdStr, now);
      userNextScheduledTimeMap.delete(userIdStr);
      console.log(`🚀 [CrossChat] Started new warmup dialogue "${script.topic}" between ${sessionA.phone_number} & ${sessionB.phone_number}`);
    }
  } catch (err) {
    console.error('Error in processCrossChat:', err);
  } finally {
    isRunningCycle = false;
  }
}

export function isCurrentTimeInActiveWindow(startTime = '08:00', endTime = '22:00', targetDate = new Date()): boolean {
  const [startHour, startMin] = (startTime || '08:00').split(':').map(Number);
  const [endHour, endMin] = (endTime || '22:00').split(':').map(Number);

  const curMinutes = targetDate.getHours() * 60 + targetDate.getMinutes();
  const startMinutes = (startHour || 0) * 60 + (startMin || 0);
  const endMinutes = (endHour || 0) * 60 + (endMin || 0);

  if (startMinutes <= endMinutes) {
    return curMinutes >= startMinutes && curMinutes <= endMinutes;
  } else {
    return curMinutes >= startMinutes || curMinutes <= endMinutes;
  }
}

export function adjustToActiveWindow(targetMs: number, startTime = '08:00', endTime = '22:00'): number {
  const date = new Date(targetMs);
  if (isCurrentTimeInActiveWindow(startTime, endTime, date)) {
    return targetMs;
  }

  const [startHour, startMin] = (startTime || '08:00').split(':').map(Number);
  const [endHour, endMin] = (endTime || '22:00').split(':').map(Number);
  const curMinutes = date.getHours() * 60 + date.getMinutes();
  const endMinutes = (endHour || 0) * 60 + (endMin || 0);

  const nextActive = new Date(targetMs);
  if (curMinutes > endMinutes) {
    nextActive.setDate(nextActive.getDate() + 1);
  }
  nextActive.setHours(startHour || 8, (startMin || 0) + Math.floor(Math.random() * 5), 0, 0);

  return nextActive.getTime();
}

function scheduleNextCycleForUser(userId: string, userDoc?: any): number {
  const minMin = userDoc?.cross_chat_min_cooldown_min ?? userDoc?.cross_chat_cooldown_min ?? 5;
  const maxMin = userDoc?.cross_chat_max_cooldown_min ?? 720;
  const randomMin = Math.floor(Math.random() * (Math.max(minMin, maxMin) - Math.min(minMin, maxMin) + 1)) + Math.min(minMin, maxMin);
  let nextTarget = Date.now() + randomMin * 60 * 1000;

  const startTime = userDoc?.cross_chat_active_start_time || '08:00';
  const endTime = userDoc?.cross_chat_active_end_time || '22:00';

  nextTarget = adjustToActiveWindow(nextTarget, startTime, endTime);

  userNextScheduledTimeMap.set(userId, nextTarget);
  return nextTarget;
}

export function getUserNextScheduledTime(userId: string, minCooldownMin = 5): number {
  const dialogue = Array.from(activeDialogues.values()).find((d) => d.user_id === userId);
  if (dialogue) {
    return dialogue.next_turn_at;
  }

  let scheduled = userNextScheduledTimeMap.get(userId);
  if (!scheduled || scheduled <= Date.now()) {
    scheduled = scheduleNextCycleForUser(userId);
  }

  return scheduled;
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
  const user = await User.findById(userId);
  const startTime = user?.cross_chat_active_start_time || '08:00';
  const endTime = user?.cross_chat_active_end_time || '22:00';

  if (!isCurrentTimeInActiveWindow(startTime, endTime)) {
    return {
      success: false,
      message: `Cannot send: Current time is outside configured active sending window (${startTime} to ${endTime}).`
    };
  }
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

