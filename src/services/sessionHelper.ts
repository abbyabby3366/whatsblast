import { WhatsAppSession, SessionStatus } from '../models/WhatsAppSession.js';
import { User } from '../models/User.js';

export async function pickUserSession(
  userId: string,
  allowedSessionIds?: string[],
  excludeSessionIds?: string[]
): Promise<string> {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  let connectedSessions = await WhatsAppSession.find({
    user: userId,
    status: SessionStatus.CONNECTED,
  }).sort({ createdAt: 1 });

  const matchesAllowed = (s: any) => {
    if (!allowedSessionIds || allowedSessionIds.length === 0) return true;
    const sId = s.session_id;
    const mongoId = s._id ? s._id.toString() : s.id ? s.id.toString() : null;
    return (sId && allowedSessionIds.includes(sId)) || (mongoId ? allowedSessionIds.includes(mongoId) : false);
  };

  const isExcluded = (s: any) => {
    if (!excludeSessionIds || excludeSessionIds.length === 0) return false;
    const sId = s.session_id;
    const mongoId = s._id ? s._id.toString() : s.id ? s.id.toString() : null;
    return (sId && excludeSessionIds.includes(sId)) || (mongoId ? excludeSessionIds.includes(mongoId) : false);
  };

  if (allowedSessionIds && allowedSessionIds.length > 0) {
    connectedSessions = connectedSessions.filter(matchesAllowed);
  }

  if (excludeSessionIds && excludeSessionIds.length > 0) {
    connectedSessions = connectedSessions.filter((s) => !isExcluded(s));
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
  if (!clean) return { jid: '', exists: false, cleanPhone: '' };

  // Normalize Malaysian phone number format: convert leading 0 to 60 (e.g. 01222733418 -> 601222733418)
  if (clean.startsWith('0')) clean = '60' + clean.slice(1);
  const defaultJid = `${clean}@s.whatsapp.net`;

  try {
    if (sock && typeof sock.onWhatsApp === 'function') {
      const results = await sock.onWhatsApp(clean);
      if (Array.isArray(results) && results.length > 0) {
        const match = results.find((r: any) => r.exists) || results[0];
        if (match && match.exists && match.jid) {
          return { jid: match.jid, exists: true, cleanPhone: match.jid.split('@')[0] };
        }
        return { jid: defaultJid, exists: false, cleanPhone: clean };
      }
    }
  } catch (err) {
    console.warn(`⚠️ Failed to query onWhatsApp for ${clean}:`, err);
  }

  return { jid: defaultJid, exists: true, cleanPhone: clean };
}
