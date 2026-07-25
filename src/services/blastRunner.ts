import { BlastCampaign, CampaignStatus } from '../models/BlastCampaign.js';
import { MessageTemplate } from '../models/MessageTemplate.js';
import { WhatsAppSession, SessionStatus } from '../models/WhatsAppSession.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';
import { getActiveSession, pickUserSession, initWhatsAppSession } from './baileysManager.js';
import dayjs from 'dayjs';

let runnerInterval: NodeJS.Timeout | null = null;
let isProcessing = false;

export function startBlastRunner(intervalMs = 3000): void {
  if (runnerInterval) return;
  runnerInterval = setInterval(processCampaigns, intervalMs);
}

export function stopBlastRunner(): void {
  if (runnerInterval) {
    clearInterval(runnerInterval);
    runnerInterval = null;
  }
}

async function processCampaigns(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const runningCampaigns = await BlastCampaign.find({ status: CampaignStatus.RUNNING });

    for (const campaign of runningCampaigns) {
      if (campaign.current_index >= campaign.contacts.length) {
        campaign.status = CampaignStatus.COMPLETED;
        campaign.completed_at = new Date();
        await campaign.save();
        console.log(`🎉 Campaign "${campaign.name}" completed!`);
        continue;
      }

      const recipientPhone = campaign.contacts[campaign.current_index];
      if (!recipientPhone) {
        campaign.current_index += 1;
        await campaign.save();
        continue;
      }

      try {
        const sessionId = await pickUserSession(campaign.user.toString());
        let activeSession = getActiveSession(sessionId);
        if (!activeSession) {
          activeSession = await initWhatsAppSession(sessionId);
        }

        const sessionDoc = await WhatsAppSession.findOne({ session_id: sessionId });
        if (sessionDoc) {
          const today = dayjs().format('YYYY-MM-DD');
          if (sessionDoc.current_day !== today) {
            sessionDoc.current_day = today;
            sessionDoc.current_message_count = 0;
          }

          if (sessionDoc.current_message_count >= sessionDoc.max_message_count_per_day) {
            console.log(`⚠️ Session ${sessionId} reached daily limit (${sessionDoc.max_message_count_per_day}). Skipping contact for now.`);
            continue;
          }
        }

        const template = await MessageTemplate.findById(campaign.template);
        if (!template) {
          campaign.status = CampaignStatus.FAILED;
          await campaign.save();
          console.error(`Campaign ${campaign._id} failed: Template not found`);
          continue;
        }

        const cleanPhone = recipientPhone.replace(/[^0-9]/g, '');
        const targetJid = `${cleanPhone}@s.whatsapp.net`;

        let messageText = template.text || '';
        // Basic template tag replacement e.g. {{phone}}
        messageText = messageText.replace(/\{\{\s*phone\s*\}\}/gi, cleanPhone);

        // Send via Baileys socket
        await activeSession.socket.sendMessage(targetJid, { text: messageText });

        // Update session count
        if (sessionDoc) {
          sessionDoc.current_message_count += 1;
          await sessionDoc.save();
        }

        // Log message sending
        await Message.create({
          session: sessionDoc?._id,
          campaign: campaign._id,
          direction: MessageDirection.OUTBOUND,
          type: template.type || 'text',
          status: MessageStatus.SENT,
          recipient_phone: cleanPhone,
          to_jid: targetJid,
          template: template._id,
          content: { text: messageText },
          wa_timestamp: new Date(),
        });

        campaign.current_index += 1;
        campaign.stats.sent += 1;
        await campaign.save();

        console.log(`💬 Campaign "${campaign.name}": Sent to ${cleanPhone} (${campaign.current_index}/${campaign.contacts.length})`);
      } catch (err: any) {
        console.error(`❌ Error sending message for campaign ${campaign.name}:`, err.message || err);
        campaign.stats.failed += 1;
        campaign.current_index += 1;
        await campaign.save();
      }

      // Random delay between messages (intervals are specified in minutes)
      const minDelay = (campaign.min_interval_seconds || 10) * 60 * 1000;
      const maxDelay = (campaign.max_interval_seconds || 15) * 60 * 1000;
      const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

      await new Promise((res) => setTimeout(res, randomDelay));
    }
  } catch (err) {
    console.error('Error in Blast Runner processing loop:', err);
  } finally {
    isProcessing = false;
  }
}
