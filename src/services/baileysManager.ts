import makeWASocket, {
  DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore, Browsers, AuthenticationState, ConnectionState,
  generateMessageIDV2, generateMessageID,
} from 'baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { WhatsAppSession, SessionStatus } from '../models/WhatsAppSession.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';
import { useRedisAuthState } from './redisAuthState.js';
import { handleIncomingMessageWorkflow } from './workflowRunner.js';
import { extractBaileysMessageContent } from './messageExtractor.js';
import { BoundedSignalCache } from './signalCache.js';
import { SESSIONS_DIR, getSessionFolder } from '../utils/sessionPath.js';

if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

interface ActiveSession {
  socket: ReturnType<typeof makeWASocket>;
  sessionId: string;
  clearCreds?: () => Promise<void>;
  caches?: any[];
}

const activeSessions = new Map<string, ActiveSession>();
const pendingInits = new Map<string, Promise<ActiveSession>>();
const reconnectAttempts = new Map<string, number>();
const reconnectTimers = new Map<string, NodeJS.Timeout>();
const stableTimers = new Map<string, NodeJS.Timeout>();
// Bumped by removeActiveSession so an in-flight _createSession can tell it was cancelled
const sessionGenerations = new Map<string, number>();
const MAX_RECONNECT_ATTEMPTS = 10;
// Only reset the reconnect counter once a connection has stayed up this long, so a
// connect/kick/reconnect cycle (e.g. two servers fighting) still hits the attempt cap.
const STABLE_CONNECTION_MS = 60_000;
// Another client took over these credentials (usually the new instance during a deploy).
// Back off for a long time instead of fighting over the connection.
const CONNECTION_REPLACED_RETRY_MS = 5 * 60_000;
let isShuttingDown = false;
// Sessions whose connection was replaced (440) elsewhere: implicit init calls (blast worker,
// send routes, workflows) must not reconnect before this time, or the fight restarts.
const replacedUntil = new Map<string, number>();

function getGeneration(sessionId: string): number {
  return sessionGenerations.get(sessionId) || 0;
}

class SessionInitCancelledError extends Error {
  constructor(sessionId: string) {
    super(`Initialization of session ${sessionId} was cancelled`);
    this.name = 'SessionInitCancelledError';
  }
}

let cachedBaileysVersion: [number, number, number] | null = null;
async function getBaileysVersion(): Promise<[number, number, number]> {
  if (cachedBaileysVersion) return cachedBaileysVersion;
  try {
    const { version } = await fetchLatestBaileysVersion();
    cachedBaileysVersion = version as [number, number, number];
    return cachedBaileysVersion;
  } catch (err) {
    console.warn('⚠️ Failed to fetch latest Baileys version, using default fallback', err);
    return [2, 3000, 1015901307];
  }
}

export function destroySocket(sock: any, caches?: any[]): void {
  if (!sock) return;
  try {
    if (Array.isArray(caches)) {
      for (const c of caches) {
        c?.close?.();
        c?.flushAll?.();
      }
    }
    sock.ev?.removeAllListeners();
    sock.ev?.destroy?.();
    sock.signalRepository?.close?.();
    if (sock.ws?.socket) {
      sock.ws.socket.removeAllListeners?.();
      sock.ws.socket.terminate?.();
    }
    sock.ws?.removeAllListeners?.();
    sock.ws?.close?.().catch?.(() => {});
    if (typeof sock.end === 'function') {
      sock.end(undefined);
    }
  } catch (_) { }
}

export function getActiveSession(sessionId: string): ActiveSession | undefined {
  return activeSessions.get(sessionId);
}

export function getActiveSessionsCount(): number {
  return activeSessions.size;
}

export function removeActiveSession(sessionId: string): void {
  const timer = reconnectTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    reconnectTimers.delete(sessionId);
  }
  const stableTimer = stableTimers.get(sessionId);
  if (stableTimer) {
    clearTimeout(stableTimer);
    stableTimers.delete(sessionId);
  }
  reconnectAttempts.delete(sessionId);
  pendingInits.delete(sessionId);
  replacedUntil.delete(sessionId);
  sessionGenerations.set(sessionId, getGeneration(sessionId) + 1);

  const active = activeSessions.get(sessionId);
  if (active) {
    destroySocket(active.socket, active.caches);
    activeSessions.delete(sessionId);
  }
}

/** Closes every socket without logging out, so another instance can take over the sessions. */
export function shutdownAllSessions(): void {
  isShuttingDown = true;
  const ids = new Set<string>([...activeSessions.keys(), ...pendingInits.keys(), ...reconnectTimers.keys()]);
  for (const id of ids) {
    removeActiveSession(id);
  }
  console.log(`🛑 Closed ${ids.size} WhatsApp session(s) for shutdown`);
}

function scheduleReconnect(sessionId: string, delay: number, reason: string): void {
  if (isShuttingDown) return;
  const existingTimer = reconnectTimers.get(sessionId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  console.log(`🔄 Reconnecting session ${sessionId} in ${delay}ms (${reason})...`);
  const timer = setTimeout(() => {
    reconnectTimers.delete(sessionId);
    WhatsAppSession.findOne({ session_id: sessionId }).then((latest) => {
      if (latest && latest.status !== SessionStatus.DISCONNECTED) {
        initWhatsAppSession(sessionId).catch((err) => {
          if (!(err instanceof SessionInitCancelledError)) console.error(err);
        });
      }
    }).catch(console.error);
  }, delay);
  reconnectTimers.set(sessionId, timer);
}

/**
 * Counts a failed connection and schedules a backoff reconnect, or marks the session
 * DISCONNECTED once MAX_RECONNECT_ATTEMPTS is exceeded.
 */
async function handleRetryableFailure(sessionId: string, reason: string): Promise<void> {
  const attempts = (reconnectAttempts.get(sessionId) || 0) + 1;
  reconnectAttempts.set(sessionId, attempts);

  if (attempts > MAX_RECONNECT_ATTEMPTS) {
    console.warn(`🛑 Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) exceeded for session ${sessionId}. Stopping auto-reconnect.`);
    reconnectAttempts.delete(sessionId);
    await WhatsAppSession.updateOne(
      { session_id: sessionId },
      { $set: { status: SessionStatus.DISCONNECTED, qr_code: '' } }
    );
    return;
  }

  const delay = Math.min(Math.round(3000 * Math.pow(1.5, attempts - 1)), 60000) + Math.floor(Math.random() * 1500);
  await WhatsAppSession.updateOne(
    { session_id: sessionId },
    { $set: { status: SessionStatus.STARTING } }
  );
  scheduleReconnect(sessionId, delay, `attempt ${attempts}/${MAX_RECONNECT_ATTEMPTS}, reason: ${reason}`);
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
      markSystemSentMessageId(msgId);
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
  if (isShuttingDown) {
    throw new Error('Server is shutting down');
  }
  const replacedUntilTs = replacedUntil.get(sessionId);
  if (replacedUntilTs !== undefined) {
    if (Date.now() < replacedUntilTs) {
      throw new Error(`WhatsApp session ${sessionId} is connected from another client; retrying later`);
    }
    replacedUntil.delete(sessionId);
  }
  const existingTimer = reconnectTimers.get(sessionId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    reconnectTimers.delete(sessionId);
  }

  if (activeSessions.has(sessionId)) {
    return activeSessions.get(sessionId)!;
  }

  if (pendingInits.has(sessionId)) {
    return pendingInits.get(sessionId)!;
  }

  const initPromise: Promise<ActiveSession> = _createSession(sessionId).finally(() => {
    // A cancelled init must not remove the pending promise of a newer init
    if (pendingInits.get(sessionId) === initPromise) {
      pendingInits.delete(sessionId);
    }
  });

  pendingInits.set(sessionId, initPromise);
  return initPromise;
}

async function _createSession(sessionId: string): Promise<ActiveSession> {
  const generation = getGeneration(sessionId);
  // Checked after every await: removeActiveSession (logout/delete/reconnect) may have run meanwhile
  const assertNotCancelled = () => {
    if (getGeneration(sessionId) !== generation || isShuttingDown) {
      throw new SessionInitCancelledError(sessionId);
    }
  };

  // Check if session document exists in DB before initializing
  const dbSession = await WhatsAppSession.findOne({ session_id: sessionId });
  assertNotCancelled();
  if (!dbSession) {
    console.log(`🛑 Session ${sessionId} does not exist in DB, purging active socket.`);
    removeActiveSession(sessionId);
    throw new Error(`WhatsApp session ${sessionId} not found`);
  }

  // Clean up any stale active socket instance for this session before creating new one
  const existingActive = activeSessions.get(sessionId);
  if (existingActive) {
    destroySocket(existingActive.socket, existingActive.caches);
    activeSessions.delete(sessionId);
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
      // Do NOT fall back to empty disk creds: that would show a QR / register a new device
      // and later overwrite the real credentials. Retry with backoff instead.
      assertNotCancelled();
      console.error(`⚠️ Failed to load Redis auth for ${sessionId}; will retry`, err);
      scheduleReconnect(sessionId, 15_000 + Math.floor(Math.random() * 5000), 'redis auth load failed');
      throw err;
    }
  } else {
    const sessionFolder = getSessionFolder(sessionId);
    if (!sessionFolder) {
      throw new Error(`Invalid session id: ${sessionId}`);
    }
    if (!fs.existsSync(sessionFolder)) {
      fs.mkdirSync(sessionFolder, { recursive: true });
    }
    const fileAuth = await useMultiFileAuthState(sessionFolder);
    state = fileAuth.state;
    saveCreds = fileAuth.saveCreds;
  }

  assertNotCancelled();

  const logger = pino({ level: 'silent' });
  const version = await getBaileysVersion();
  assertNotCancelled();

  const signalKeyCache = new BoundedSignalCache(2000, 300);
  const msgRetryCache = new BoundedSignalCache(1000, 3600);
  const userDevicesCache = new BoundedSignalCache(1000, 300);
  const callOfferCache = new BoundedSignalCache(500, 300);
  const placeholderResendCache = new BoundedSignalCache(1000, 3600);
  const sessionCaches = [signalKeyCache, msgRetryCache, userDevicesCache, callOfferCache, placeholderResendCache];

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger, signalKeyCache),
    },
    msgRetryCounterCache: msgRetryCache,
    userDevicesCache,
    callOfferCache,
    placeholderResendCache,
    browser: Browsers.macOS('Chrome'),
    printQRInTerminal: false,
    logger,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    defaultQueryTimeoutMs: 60_000,
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

  const sessionObj: ActiveSession = { socket: sock, sessionId, clearCreds, caches: sessionCaches };
  // Never leave two live sockets on the same credentials: they kick each other off (440)
  // and write diverging signal keys
  const previous = activeSessions.get(sessionId);
  if (previous && previous.socket !== sock) {
    destroySocket(previous.socket, previous.caches);
  }
  activeSessions.set(sessionId, sessionObj);

  const isCurrentSocket = () =>
    activeSessions.get(sessionId)?.socket === sock && getGeneration(sessionId) === generation;

  sock.ev.on('creds.update', async () => {
    if (!isCurrentSocket()) return;
    try {
      await saveCreds();
    } catch (err) {
      console.error(`Failed to save creds for ${sessionId}:`, err);
    }
  });

  const handleConnectionUpdate = async (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    if (connection !== 'close' && !isCurrentSocket()) {
      // Stale socket from a cancelled/replaced init: shut it down quietly
      destroySocket(sock, sessionObj.caches);
      return;
    }

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

      const current = await WhatsAppSession.findOne({ session_id: sessionId }).select('status').lean();
      if (!current || current.status === SessionStatus.DISCONNECTED || !isCurrentSocket()) {
        // Logged out or deleted while this socket was connecting
        console.log(`🛑 Session ${sessionId} opened after being disconnected/deleted, closing socket.`);
        if (activeSessions.get(sessionId)?.socket === sock) activeSessions.delete(sessionId);
        destroySocket(sock, sessionObj.caches);
        return;
      }

      const prevStable = stableTimers.get(sessionId);
      if (prevStable) clearTimeout(prevStable);
      const stableTimer = setTimeout(() => {
        stableTimers.delete(sessionId);
        if (isCurrentSocket()) reconnectAttempts.delete(sessionId);
      }, STABLE_CONNECTION_MS);
      stableTimer.unref?.();
      stableTimers.set(sessionId, stableTimer);

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

    if (connection === 'close') {
      const wasCurrent = isCurrentSocket();
      const currentActive = activeSessions.get(sessionId);
      if (currentActive?.socket === sock) {
        activeSessions.delete(sessionId);
      }
      destroySocket(sock, sessionObj.caches);

      // A replaced/cancelled socket closing must not schedule reconnects for its successor
      if (!wasCurrent || isShuttingDown) {
        return;
      }

      const stableTimer = stableTimers.get(sessionId);
      if (stableTimer) {
        clearTimeout(stableTimer);
        stableTimers.delete(sessionId);
      }

      // Verify if session still exists in MongoDB and check status
      const dbSession = await WhatsAppSession.findOne({ session_id: sessionId });
      if (!dbSession) {
        console.log(`🛑 Session ${sessionId} was deleted from DB, halting reconnection.`);
        reconnectAttempts.delete(sessionId);
        return;
      }

      if (dbSession.status === SessionStatus.DISCONNECTED) {
        console.log(`🛑 Session ${sessionId} status is DISCONNECTED, halting reconnection.`);
        reconnectAttempts.delete(sessionId);
        return;
      }

      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;

      if (isLoggedOut) {
        console.log(`❌ WhatsApp Session logged out (401): ${sessionId}`);
        reconnectAttempts.delete(sessionId);
        await WhatsAppSession.updateOne(
          { session_id: sessionId },
          { $set: { status: SessionStatus.DISCONNECTED, qr_code: '' } }
        );
        if (clearCreds) {
          await clearCreds().catch(console.error);
        } else {
          const sessionFolder = getSessionFolder(sessionId);
          if (sessionFolder) {
            try {
              fs.rmSync(sessionFolder, { recursive: true, force: true });
            } catch (_) { }
          }
        }
      } else if (statusCode === DisconnectReason.connectionReplaced) {
        // 440: these credentials were opened elsewhere (typically the new instance during a
        // deploy). Reconnecting immediately makes both sides kick each other forever.
        console.warn(`⚠️ Session ${sessionId} connection replaced (440) by another client; backing off.`);
        replacedUntil.set(sessionId, Date.now() + CONNECTION_REPLACED_RETRY_MS);
        await WhatsAppSession.updateOne(
          { session_id: sessionId },
          { $set: { status: SessionStatus.STARTING } }
        );
        scheduleReconnect(sessionId, CONNECTION_REPLACED_RETRY_MS, 'connection replaced (440)');
      } else {
        await handleRetryableFailure(sessionId, String(statusCode || 'unknown'));
      }
    }
  };

  sock.ev.on('connection.update', async (update) => {
    try {
      await handleConnectionUpdate(update);
    } catch (err) {
      console.error(`[Baileys] connection.update handler error for ${sessionId}:`, err);
      // A failed close-handler (e.g. Mongo blip) must still lead to a reconnect attempt
      if (update.connection === 'close' && getGeneration(sessionId) === generation && !reconnectTimers.has(sessionId)) {
        scheduleReconnect(sessionId, 30_000, 'close handler error');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    if (!isCurrentSocket()) return;

    for (const msg of messages) {
      try {
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
        if (!fromJid || fromJid === 'status@broadcast' || fromJid.endsWith('@broadcast')) {
          continue;
        }
        const pushName = msg.pushName || '';

        const waSession = await WhatsAppSession.findOne({ session_id: sessionId }).populate('user');
        if (!waSession) continue;

        // Extract real phone number (handling WhatsApp @lid / Linked Identity Device)
        let senderPhone = '';
        if (fromJid.endsWith('@s.whatsapp.net') || fromJid.endsWith('@c.us')) {
          senderPhone = fromJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        }

        if (!senderPhone || fromJid.endsWith('@lid') || fromJid.endsWith('@g.us')) {
          const candidates = [(msg.key as any)?.remoteJidAlt, (msg.key as any)?.participant, (msg as any)?.participant, (msg.key as any)?.participantPn, (msg as any)?.sender, (msg.key as any)?.senderPn];
          for (const cand of candidates) {
            if (typeof cand === 'string' && (cand.includes('@s.whatsapp.net') || cand.includes('@c.us'))) {
              const p = cand.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
              if (p.length >= 8 && p.length <= 15) { senderPhone = p; break; }
            }
          }
        }

        if (!senderPhone || fromJid.endsWith('@lid')) {
          try {
            const lidClean = fromJid.includes('@') ? fromJid : `${fromJid}@lid`;
            const pn = await (sock as any).signalRepository?.lidMapping?.getPNForLID?.(lidClean);
            if (typeof pn === 'string' && (pn.includes('@s.whatsapp.net') || pn.includes('@c.us'))) {
              senderPhone = pn.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            }
            if (!senderPhone) {
              const pns = await (sock as any).signalRepository?.lidMapping?.getPNsForLIDs?.([lidClean]);
              const firstPn = pns?.[0]?.pn;
              if (typeof firstPn === 'string' && (firstPn.includes('@s.whatsapp.net') || firstPn.includes('@c.us'))) {
                senderPhone = firstPn.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
              }
            }
          } catch (err) {
            console.warn('[Baileys] Error resolving LID to PN:', err);
          }
        }

        if (!senderPhone) senderPhone = fromJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');

        const extracted = extractBaileysMessageContent(msg);
        const textContent = extracted.text;
        console.log(`[Baileys Inbound] fromJid: ${fromJid}, resolved senderPhone: ${senderPhone}, pushName: ${pushName}, type: ${extracted.messageType}, text: "${textContent}", buttonId: "${extracted.selectedId || ''}"`);

        await Message.create({
          session: waSession._id,
          message_id: msg.key.id || '',
          direction: MessageDirection.INBOUND,
          type: extracted.messageType || 'text',
          status: MessageStatus.RECEIVED,
          from_jid: fromJid,
          sender_phone: senderPhone,
          push_name: pushName,
          content: {
            text: textContent,
            selected_id: extracted.selectedId,
            selected_display_text: extracted.selectedDisplayText,
            raw: msg.message,
          },
          wa_timestamp: msgTime,
        });

        // Trigger active automated reply workflows for this user
        handleIncomingMessageWorkflow(sessionId, textContent, senderPhone, pushName, fromJid, {
          selectedId: extracted.selectedId,
          selectedDisplayText: extracted.selectedDisplayText,
          messageType: extracted.messageType,
        }, msg.key.id || undefined).catch((err) => {
          console.error('[Workflow] Error handling inbound message:', err);
        });

        if (waSession.agent_phone_numbers && waSession.agent_phone_numbers.length > 0) {
          for (const agent of waSession.agent_phone_numbers) {
            const agentPhone = agent.phone_number.replace(/[^0-9]/g, '');
            // Don't forward an agent's own messages back to agents (forwarding loop)
            if (agent.is_active && agentPhone !== senderPhone) {
              const agentJid = `${agentPhone}@s.whatsapp.net`;
              sock.sendMessage(agentJid, {
                text: `📩 *Inbound Reply* from ${pushName || senderPhone} (${senderPhone}):\n\n"${textContent}"`,
              }).then((sentAgentMsg) => {
                if (sentAgentMsg?.key?.id) markSystemSentMessageId(sentAgentMsg.key.id);
              }).catch(console.error);
            }
          }
        }
      } catch (err) {
        console.error(`[Baileys] messages.upsert handler error for ${sessionId}:`, err);
      }
    }
  });

  // Status hierarchy for downgrade protection (higher number = more advanced status)
  const STATUS_RANK: Record<string, number> = {
    [MessageStatus.QUEUED]: 0,
    [MessageStatus.PENDING]: 1,
    [MessageStatus.SENDING]: 1,
    [MessageStatus.SENT]: 2,
    [MessageStatus.DELIVERED]: 3,
    [MessageStatus.READ]: 4,
    [MessageStatus.RECEIVED]: 4, // Inbound messages; treat same rank as READ
    [MessageStatus.FAILED]: -1, // Special: only allowed if current status is queued/pending
    [MessageStatus.EXPIRED]: -2,
  };

  sock.ev.on('messages.update', async (updates) => {
    if (!isCurrentSocket()) return;
    if (updates.length > 0) {
      updateLastPhoneActivity(sessionId).catch(console.error);
    }

    for (const update of updates) {
      try {
        if (!update.key?.id) continue;

        const messageId = update.key.id;
        const updateStatus: any = update.update?.status;

        let newStatus: MessageStatus | null = null;
        // Baileys WebMessageInfo.Status: 0=ERROR, 1=PENDING, 2=SERVER_ACK, 3=DELIVERY_ACK, 4=READ, 5=PLAYED
        if (updateStatus === 2 || updateStatus === 'SERVER_ACK') {
          newStatus = MessageStatus.SENT;
        } else if (updateStatus === 3 || updateStatus === 'DELIVERED' || updateStatus === 'DELIVERY_ACK') {
          newStatus = MessageStatus.DELIVERED;
        } else if (updateStatus === 4 || updateStatus === 5 || updateStatus === 'READ' || updateStatus === 'PLAYED') {
          newStatus = MessageStatus.READ;
        } else if (updateStatus === 0 || updateStatus === 'FAILED' || updateStatus === 'ERROR') {
          newStatus = MessageStatus.FAILED;
        }

        if (newStatus) {
          // Downgrade protection: don't overwrite a more-advanced status with a lesser one
          const existingMsg = await Message.findOne({ message_id: messageId }).select('status').lean();
          if (existingMsg) {
            const currentRank = STATUS_RANK[existingMsg.status] ?? -99;
            const newRank = STATUS_RANK[newStatus] ?? -99;

            // Block FAILED from overwriting sent/delivered/read (stale ERROR updates from Baileys)
            if (newStatus === MessageStatus.FAILED && currentRank >= STATUS_RANK[MessageStatus.SENT]) {
              console.log(`[Baileys] Ignoring stale FAILED update for message ${messageId} (current status: ${existingMsg.status})`);
              continue;
            }

            // Block any downgrade (e.g. SENT shouldn't overwrite DELIVERED)
            if (newRank < currentRank && newRank >= 0) {
              console.log(`[Baileys] Ignoring status downgrade for message ${messageId}: ${existingMsg.status} → ${newStatus}`);
              continue;
            }
          }

          console.log(`[Baileys] Status update for message ${messageId}: ${existingMsg?.status || 'unknown'} → ${newStatus} (raw: ${updateStatus})`);
          await Message.updateOne(
            { message_id: messageId },
            { $set: { status: newStatus } }
          ).catch(console.error);
        }
      } catch (err) {
        console.error(`[Baileys] messages.update handler error for ${sessionId}:`, err);
      }
    }
  });

  return sessionObj;
}

export async function restoreAllSessions(): Promise<void> {
  const sessions = await WhatsAppSession.find({ status: { $in: [SessionStatus.CONNECTED, SessionStatus.STARTING, SessionStatus.QR_READY] } });
  for (const s of sessions) {
    try {
      await initWhatsAppSession(s.session_id);
      // Stagger session initialization to prevent memory spikes on boot
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(`Error restoring session ${s.session_id}:`, err);
    }
  }
}
export { pickUserSession, verifyAndFormatJid } from './sessionHelper.js';

