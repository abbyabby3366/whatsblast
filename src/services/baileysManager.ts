import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  AuthenticationState,
  generateMessageIDV2,
  generateMessageID,
} from 'baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { WhatsAppSession, SessionStatus } from '../models/WhatsAppSession.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';
import { User } from '../models/User.js';
import { useRedisAuthState } from './redisAuthState.js';

const SESSIONS_DIR = process.env.SESSIONS_DIR || './sessions';

if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

interface ActiveSession {
  socket: ReturnType<typeof makeWASocket>;
  sessionId: string;
  clearCreds?: () => Promise<void>;
}

const activeSessions = new Map<string, ActiveSession>();

export function getActiveSession(sessionId: string): ActiveSession | undefined {
  return activeSessions.get(sessionId);
}

export function removeActiveSession(sessionId: string): void {
  const active = activeSessions.get(sessionId);
  if (active) {
    try {
      active.socket.end(undefined);
    } catch (_) { }
    activeSessions.delete(sessionId);
  }
}

const systemSentMessageIds = new Set<string>();

export function markSystemSentMessageId(msgId?: string) {
  if (!msgId) return;
  systemSentMessageIds.add(msgId);
  if (systemSentMessageIds.size > 10000) {
    const first = systemSentMessageIds.values().next().value;
    if (first) systemSentMessageIds.delete(first);
  }
}

export async function isSystemSentMessageId(msgId?: string): Promise<boolean> {
  if (!msgId) return false;
  // Check in-memory set (pre-marked before transmission)
  if (systemSentMessageIds.has(msgId)) return true;

  // Fallback: check if this message was recorded in the DB by our system (handles server restarts)
  try {
    const exists = await Message.exists({ message_id: msgId, direction: MessageDirection.OUTBOUND });
    if (exists) {
      systemSentMessageIds.add(msgId);
      return true;
    }
  } catch (_) { }

  return false;
}

export async function updateLastPhoneActivity(sessionId: string, timestamp?: Date): Promise<void> {
  try {
    await WhatsAppSession.updateOne(
      { session_id: sessionId },
      { $set: { last_phone_activity_at: timestamp || new Date() } }
    );
  } catch (err) {
    console.error(`Failed to update last_phone_activity_at for ${sessionId}:`, err);
  }
}

export async function updateLastPhysicalPhoneSentMessage(sessionId: string, timestamp?: Date): Promise<void> {
  try {
    const ts = timestamp || new Date();
    await WhatsAppSession.updateOne(
      { session_id: sessionId },
      { $set: { last_physical_phone_sent_message_at: ts, last_phone_activity_at: ts } }
    );
  } catch (err) {
    console.error(`Failed to update last_physical_phone_sent_message_at for ${sessionId}:`, err);
  }
}

export async function initWhatsAppSession(sessionId: string): Promise<ActiveSession> {
  // Check if session document exists in DB before initializing or returning cached
  const dbSession = await WhatsAppSession.findOne({ session_id: sessionId });
  if (!dbSession) {
    console.log(`🛑 Session ${sessionId} does not exist in DB, purging active socket.`);
    removeActiveSession(sessionId);
    throw new Error(`WhatsApp session ${sessionId} not found`);
  }

  if (activeSessions.has(sessionId)) {
    return activeSessions.get(sessionId)!;
  }

  let state: AuthenticationState;
  let saveCreds: () => Promise<void>;
  let clearCreds: (() => Promise<void>) | undefined;

  const hasRedis = Boolean(process.env.REDIS_HOST);

  if (hasRedis) {
    try {
      const redisAuth = await useRedisAuthState(sessionId);
      state = redisAuth.state;
      saveCreds = redisAuth.saveCreds;
      clearCreds = redisAuth.clearCreds;
    } catch (err) {
      console.warn(`⚠️ Failed to use Redis auth for ${sessionId}, falling back to disk storage`, err);
      const sessionFolder = path.join(SESSIONS_DIR, sessionId);
      const fileAuth = await useMultiFileAuthState(sessionFolder);
      state = fileAuth.state;
      saveCreds = fileAuth.saveCreds;
    }
  } else {
    const sessionFolder = path.join(SESSIONS_DIR, sessionId);
    if (!fs.existsSync(sessionFolder)) {
      fs.mkdirSync(sessionFolder, { recursive: true });
    }
    const fileAuth = await useMultiFileAuthState(sessionFolder);
    state = fileAuth.state;
    saveCreds = fileAuth.saveCreds;
  }

  const logger = pino({ level: 'silent' });
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    browser: Browsers.macOS('Chrome'),
    printQRInTerminal: false,
    logger,
  });

  // Intercept all socket.sendMessage calls to automatically track system-sent message IDs
  const originalSendMessage = sock.sendMessage.bind(sock);
  sock.sendMessage = async (...args: Parameters<typeof originalSendMessage>) => {
    const [jid, content, options] = args;
    const opts = options || {};
    const messageId = opts.messageId || (generateMessageIDV2 ? generateMessageIDV2(sock.user?.id) : generateMessageID());
    const finalOpts = { ...opts, messageId };

    // Pre-mark system message ID before transmission to prevent race condition with incoming messages.upsert WS frame
    markSystemSentMessageId(messageId);

    const res = await originalSendMessage(jid, content, finalOpts);
    if (res?.key?.id) {
      markSystemSentMessageId(res.key.id);
    }
    return res;
  };

  const sessionObj: ActiveSession = { socket: sock, sessionId, clearCreds };
  activeSessions.set(sessionId, sessionObj);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const qrBase64 = await QRCode.toDataURL(qr);
        const exists = await WhatsAppSession.exists({ session_id: sessionId });
        if (exists) {
          await WhatsAppSession.updateOne(
            { session_id: sessionId },
            { $set: { status: SessionStatus.QR_READY, qr_code: qrBase64 } }
          );
        } else {
          console.log(`🛑 Session ${sessionId} deleted, closing socket on QR event.`);
          removeActiveSession(sessionId);
          return;
        }
      } catch (err) {
        console.error(`Failed to generate QR for session ${sessionId}`, err);
      }
    }

    if (connection === 'open') {
      const rawUserJid = sock.user?.id || '';
      const phoneNumber = rawUserJid.split(':')[0].replace(/[^0-9]/g, '');
      const pushName = sock.user?.name || '';

      const exists = await WhatsAppSession.exists({ session_id: sessionId });
      if (exists) {
        await WhatsAppSession.updateOne(
          { session_id: sessionId },
          {
            $set: {
              status: SessionStatus.CONNECTED,
              qr_code: '',
              phone_number: phoneNumber,
              push_name: pushName,
              last_phone_activity_at: new Date(),
            },
          }
        );
        console.log(`✅ WhatsApp Session Connected: ${sessionId} (${phoneNumber})`);
      }
    }

    if (connection === 'close') {
      activeSessions.delete(sessionId);

      // Verify if session still exists in MongoDB
      const exists = await WhatsAppSession.exists({ session_id: sessionId });
      if (!exists) {
        console.log(`🛑 Session ${sessionId} was deleted from DB, halting reconnection.`);
        return;
      }

      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;

      if (isLoggedOut) {
        console.log(`❌ WhatsApp Session logged out (401): ${sessionId}`);
        await WhatsAppSession.updateOne(
          { session_id: sessionId },
          { $set: { status: SessionStatus.DISCONNECTED, qr_code: '' } }
        );
        if (clearCreds) {
          await clearCreds().catch(console.error);
        } else {
          const sessionFolder = path.join(SESSIONS_DIR, sessionId);
          try {
            fs.rmSync(sessionFolder, { recursive: true, force: true });
          } catch (_) { }
        }
      } else {
        console.log(`🔄 Reconnecting session ${sessionId} (reason: ${statusCode || 'unknown'})...`);
        await WhatsAppSession.updateOne(
          { session_id: sessionId },
          { $set: { status: SessionStatus.STARTING } }
        );
        setTimeout(() => {
          initWhatsAppSession(sessionId).catch(console.error);
        }, 3000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      const msgTime = msg.messageTimestamp ? new Date((msg.messageTimestamp as number) * 1000) : new Date();

      if (msg.key.fromMe) {
        const msgId = msg.key.id || '';
        const isSystem = await isSystemSentMessageId(msgId);
        if (isSystem) {
          // Sent by WhatsBlast system -> updates general phone sync activity only
          updateLastPhoneActivity(sessionId, msgTime).catch(console.error);
        } else {
          // Sent directly from physical phone or official WhatsApp client -> updates last_physical_phone_sent_message_at
          updateLastPhysicalPhoneSentMessage(sessionId, msgTime).catch(console.error);
        }
        continue;
      }

      if (!msg.message) continue;

      // Inbound activity also implies network/sync activity on WhatsApp primary account
      updateLastPhoneActivity(sessionId, msgTime).catch(console.error);

      const fromJid = msg.key.remoteJid || '';
      const senderPhone = fromJid.split('@')[0];
      const pushName = msg.pushName || '';

      let textContent =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        '';

      const waSession = await WhatsAppSession.findOne({ session_id: sessionId }).populate('user');
      if (!waSession) continue;

      await Message.create({
        session: waSession._id,
        message_id: msg.key.id || '',
        direction: MessageDirection.INBOUND,
        type: 'text',
        status: MessageStatus.RECEIVED,
        from_jid: fromJid,
        sender_phone: senderPhone,
        push_name: pushName,
        content: { text: textContent, raw: msg.message },
        wa_timestamp: msgTime,
      });

      if (waSession.agent_phone_numbers && waSession.agent_phone_numbers.length > 0) {
        for (const agent of waSession.agent_phone_numbers) {
          if (agent.is_active) {
            const agentJid = `${agent.phone_number.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
            sock.sendMessage(agentJid, {
              text: `📩 *Inbound Reply* from ${pushName || senderPhone} (${senderPhone}):\n\n"${textContent}"`,
            }).then((sentAgentMsg) => {
              if (sentAgentMsg?.key?.id) markSystemSentMessageId(sentAgentMsg.key.id);
            }).catch(console.error);
          }
        }
      }
    }
  });

  sock.ev.on('messages.update', async (updates) => {
    if (updates.length > 0) {
      updateLastPhoneActivity(sessionId).catch(console.error);
    }

    for (const update of updates) {
      if (!update.key?.id) continue;

      const messageId = update.key.id;
      const updateStatus: any = update.update?.status;

      let newStatus: MessageStatus | null = null;
      if (updateStatus === 3 || updateStatus === 'DELIVERED' || updateStatus === 'DELIVERY_ACK') {
        newStatus = MessageStatus.DELIVERED;
      } else if (updateStatus === 4 || updateStatus === 'READ') {
        newStatus = MessageStatus.READ;
      } else if (updateStatus === 0 || updateStatus === 'FAILED' || updateStatus === 'ERROR') {
        newStatus = MessageStatus.FAILED;
      }

      if (newStatus) {
        await Message.updateOne(
          { message_id: messageId },
          { $set: { status: newStatus } }
        ).catch(console.error);
      }
    }
  });

  return sessionObj;
}

export async function restoreAllSessions(): Promise<void> {
  const sessions = await WhatsAppSession.find({ status: { $in: [SessionStatus.CONNECTED, SessionStatus.STARTING, SessionStatus.QR_READY] } });
  for (const s of sessions) {
    initWhatsAppSession(s.session_id).catch((err) => console.error(`Error restoring session ${s.session_id}:`, err));
  }
}

export async function pickUserSession(userId: string, allowedSessionIds?: string[], excludeSessionIds?: string[]): Promise<string> {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  let connectedSessions = await WhatsAppSession.find({
    user: userId,
    status: SessionStatus.CONNECTED,
  }).sort({ createdAt: 1 });

  if (allowedSessionIds && allowedSessionIds.length > 0) {
    connectedSessions = connectedSessions.filter((s) => allowedSessionIds.includes(s.session_id));
  }

  if (excludeSessionIds && excludeSessionIds.length > 0) {
    connectedSessions = connectedSessions.filter((s) => !excludeSessionIds.includes(s.session_id));
  }

  if (connectedSessions.length === 0) {
    if (allowedSessionIds && allowedSessionIds.length > 0) {
      throw new Error('None of the selected WhatsApp sessions for this campaign are connected');
    }
    throw new Error('No connected WhatsApp session available');
  }

  if (connectedSessions.length === 1) {
    return connectedSessions[0].session_id;
  }

  const ids = connectedSessions.map((s) => s.session_id);
  const lastUsed = user.last_used_session_id;
  let chosenSessionId = ids[0];

  if (lastUsed && ids.includes(lastUsed)) {
    const idx = ids.indexOf(lastUsed);
    chosenSessionId = ids[(idx + 1) % ids.length];
  }

  user.last_used_session_id = chosenSessionId;
  await user.save();

  return chosenSessionId;
}

export async function verifyAndFormatJid(
  sock: any,
  phone: string
): Promise<{ jid: string; exists: boolean; cleanPhone: string }> {
  let clean = String(phone || '').replace(/[^0-9]/g, '');
  if (!clean) {
    return { jid: '', exists: false, cleanPhone: '' };
  }

  // Normalize Malaysian phone number format: convert leading 0 to 60 (e.g. 01222733418 -> 601222733418)
  if (clean.startsWith('0')) {
    clean = '60' + clean.slice(1);
  }

  const defaultJid = `${clean}@s.whatsapp.net`;

  try {
    if (sock && typeof sock.onWhatsApp === 'function') {
      const results = await sock.onWhatsApp(clean);
      if (Array.isArray(results) && results.length > 0) {
        const match = results.find((r: any) => r.exists) || results[0];
        if (match && match.exists && match.jid) {
          const verifiedPhone = match.jid.split('@')[0];
          return { jid: match.jid, exists: true, cleanPhone: verifiedPhone };
        } else {
          return { jid: defaultJid, exists: false, cleanPhone: clean };
        }
      }
    }
  } catch (err) {
    console.warn(`⚠️ Failed to query onWhatsApp for ${clean}:`, err);
  }

  // Fallback if onWhatsApp check fails to respond or is unsupported
  return { jid: defaultJid, exists: true, cleanPhone: clean };
}

