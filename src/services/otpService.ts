import { MasterPhone } from '../models/MasterPhone.js';
import { SessionStatus } from '../models/WhatsAppSession.js';
import { getActiveSession, initWhatsAppSession, verifyAndFormatJid } from './baileysManager.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';

/**
 * Sends an OTP verification code to a recipient's WhatsApp phone number
 * using an active Master OTP WhatsApp session configured in Admin settings.
 */
export async function sendOtpViaMasterPhone(recipientPhone: string, code: string): Promise<void> {
  // Find all active master phone configurations
  const masters = await MasterPhone.find({ is_active: true }).populate('session');
  
  // Filter master accounts that have a connected session
  const connectedMasters = masters.filter((m: any) => {
    if (!m.session) return false;
    const status = m.session.status || m.session_status;
    return status === SessionStatus.CONNECTED || status === 'CONNECTED';
  });

  if (connectedMasters.length === 0) {
    throw new Error('No active connected Master OTP account found. Please configure an active WhatsApp session as Master OTP in Admin settings.');
  }

  // Randomly select one active master session to balance load
  const selectedMaster: any = connectedMasters[Math.floor(Math.random() * connectedMasters.length)];
  const sessionId = selectedMaster.session?.session_id || selectedMaster.session_id;

  if (!sessionId) {
    throw new Error('Master OTP session ID is missing');
  }

  // Get active socket connection or initialize session
  let active = getActiveSession(sessionId);
  if (!active) {
    active = await initWhatsAppSession(sessionId);
  }

  const { jid: targetJid, exists, cleanPhone } = await verifyAndFormatJid(active.socket, recipientPhone);
  if (!cleanPhone || !exists) {
    throw new Error(`Recipient phone number (${recipientPhone}) is not registered on WhatsApp`);
  }

  const messageText = `[WhatsBlast] Your OTP verification code is ${code}. It is valid for 10 minutes. Do not share this code with anyone.`;

  // Send WhatsApp text message
  const result = await active.socket.sendMessage(targetJid, { text: messageText });

  // Record outbound message in database for tracking & history
  try {
    await Message.create({
      session: selectedMaster.session?._id,
      direction: MessageDirection.OUTBOUND,
      type: 'text',
      status: MessageStatus.SENT,
      recipient_phone: cleanPhone,
      to_jid: targetJid,
      content: { text: messageText },
      message_id: result?.key?.id || '',
      wa_timestamp: new Date(),
    });
  } catch (logErr) {
    console.warn('⚠️ Failed to log OTP message to Message database:', logErr);
  }
}
