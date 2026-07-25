import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  AuthenticationState,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { WhatsAppSession, SessionStatus } from '../models/WhatsAppSession.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';
import { User } from '../models/User.js';
import { useRedisAuthState, getRedisClient } from './redisAuthState.js';

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

export async function initWhatsAppSession(sessionId: string): Promise<ActiveSession> {
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
      console.log(`🔐 Using Redis auth storage for WhatsApp session ${sessionId}`);
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

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
  });

  const sessionObj: ActiveSession = { socket: sock, sessionId, clearCreds };
  activeSessions.set(sessionId, sessionObj);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const qrBase64 = await QRCode.toDataURL(qr);
        await WhatsAppSession.findOneAndUpdate(
          { session_id: sessionId },
          { status: SessionStatus.QR_READY, qr_code: qrBase64 },
          { upsert: true }
        );
      } catch (err) {
        console.error(`Failed to generate QR for session ${sessionId}`, err);
      }
    }

    if (connection === 'open') {
      const rawUserJid = sock.user?.id || '';
      const phoneNumber = rawUserJid.split(':')[0].replace(/[^0-9]/g, '');
      const pushName = sock.user?.name || '';

      await WhatsAppSession.findOneAndUpdate(
        { session_id: sessionId },
        {
          status: SessionStatus.CONNECTED,
          qr_code: '',
          phone_number: phoneNumber,
          push_name: pushName,
        }
      );
      console.log(`✅ WhatsApp Session Connected: ${sessionId} (${phoneNumber})`);
    }

    if (connection === 'close') {
      activeSessions.delete(sessionId);
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      await WhatsAppSession.findOneAndUpdate(
        { session_id: sessionId },
        { status: SessionStatus.DISCONNECTED }
      );

      if (shouldReconnect) {
        console.log(`🔄 Reconnecting session ${sessionId}...`);
        setTimeout(() => initWhatsAppSession(sessionId).catch(console.error), 3000);
      } else {
        console.log(`❌ Session ${sessionId} logged out.`);
        if (clearCreds) {
          await clearCreds();
        } else {
          const sessionFolder = path.join(SESSIONS_DIR, sessionId);
          try {
            fs.rmSync(sessionFolder, { recursive: true, force: true });
          } catch (_) {}
        }
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

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
        wa_timestamp: new Date((msg.messageTimestamp as number) * 1000),
      });

      if (waSession.agent_phone_numbers && waSession.agent_phone_numbers.length > 0) {
        for (const agent of waSession.agent_phone_numbers) {
          if (agent.is_active) {
            const agentJid = `${agent.phone_number.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
            sock.sendMessage(agentJid, {
              text: `📩 *Inbound Reply* from ${pushName || senderPhone} (${senderPhone}):\n\n"${textContent}"`,
            }).catch(console.error);
          }
        }
      }
    }
  });

  return sessionObj;
}

export function getActiveSession(sessionId: string): ActiveSession | undefined {
  return activeSessions.get(sessionId);
}

export async function restoreAllSessions(): Promise<void> {
  const sessions = await WhatsAppSession.find({ status: { $in: [SessionStatus.CONNECTED, SessionStatus.STARTING, SessionStatus.QR_READY] } });
  for (const s of sessions) {
    initWhatsAppSession(s.session_id).catch((err) => console.error(`Error restoring session ${s.session_id}:`, err));
  }
}

export async function pickUserSession(userId: string): Promise<string> {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const connectedSessions = await WhatsAppSession.find({
    user: userId,
    status: SessionStatus.CONNECTED,
  }).sort({ createdAt: 1 });

  if (connectedSessions.length === 0) {
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
