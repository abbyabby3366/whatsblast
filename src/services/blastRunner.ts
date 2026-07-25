import { BlastCampaign, CampaignStatus } from '../models/BlastCampaign.js';
import { MessageTemplate } from '../models/MessageTemplate.js';
import { WhatsAppSession } from '../models/WhatsAppSession.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';
import { FileModel } from '../models/File.js';
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

async function getFileUrl(fileIdOrObj: any): Promise<{ url: string; type: string; filename?: string } | null> {
  if (!fileIdOrObj) return null;

  if (typeof fileIdOrObj === 'object') {
    const url = fileIdOrObj.file_path || fileIdOrObj.file_url || fileIdOrObj.url;
    if (url) {
      return {
        url,
        type: fileIdOrObj.file_type || fileIdOrObj.type || 'image',
        filename: fileIdOrObj.file_name || fileIdOrObj.fileName,
      };
    }
  }

  if (typeof fileIdOrObj === 'string' && fileIdOrObj.trim().length > 0) {
    if (fileIdOrObj.startsWith('http://') || fileIdOrObj.startsWith('https://')) {
      return { url: fileIdOrObj, type: 'image' };
    }
    try {
      const fileDoc = await FileModel.findById(fileIdOrObj);
      if (fileDoc && fileDoc.file_path) {
        return {
          url: fileDoc.file_path,
          type: fileDoc.file_type || 'image',
          filename: fileDoc.file_name,
        };
      }
    } catch (_) {}
  }
  return null;
}

function normalizeInteractiveButtons(buttons: any[]): any[] {
  const typeAliases: Record<string, string> = {
    reply: 'quick_reply',
    quick_reply: 'quick_reply',
    url: 'cta_url',
    link: 'cta_url',
    cta_url: 'cta_url',
    call: 'cta_call',
    phone: 'cta_call',
    phone_call: 'cta_call',
    cta_call: 'cta_call',
    copy: 'cta_copy',
    code: 'cta_copy',
    copy_code: 'cta_copy',
    cta_copy: 'cta_copy',
  };

  return (buttons || []).map((b, idx) => {
    const rawType = String(b.type || b.name || 'reply').toLowerCase().trim();
    const name = typeAliases[rawType] || 'quick_reply';
    const displayText = b.displayText || b.display_text || b.text || b.title || `Button ${idx + 1}`;
    const value = b.value || b.url || b.phone_number || b.copy_code || '';
    const id = b.id || value || `btn_${idx + 1}`;

    const params: Record<string, any> = { display_text: displayText };
    if (name === 'cta_url') {
      params.url = value;
      params.merchant_url = value;
    } else if (name === 'cta_call') {
      params.phone_number = value;
    } else if (name === 'cta_copy') {
      params.copy_code = value;
    } else {
      params.id = id;
    }

    return {
      name,
      buttonParamsJson: JSON.stringify(params),
    };
  });
}

export async function sendBaileysTemplateMessage(
  sock: any,
  targetJid: string,
  tplItem: any,
  cleanPhone: string
) {
  let messageText = tplItem.text || tplItem.template || '';
  messageText = messageText.replace(/\{\{\s*phone\s*\}\}/gi, cleanPhone);

  const mediaType = tplItem.messageType || tplItem.type || 'text';
  const fileId = tplItem.file_id || tplItem.fileId || tplItem.file;
  const buttonMediaId = tplItem.button_image_id || tplItem.buttonImageId || tplItem.button_image;

  const mainMedia = await getFileUrl(fileId);
  const buttonMedia = await getFileUrl(buttonMediaId);

  const buttons = Array.isArray(tplItem.buttons) ? tplItem.buttons : [];

  // Interactive buttons handler
  if (buttons.length > 0 || mediaType === 'buttons') {
    const interactiveButtons = normalizeInteractiveButtons(buttons);

    const hasMedia = Boolean(
      (buttonMedia && buttonMedia.url) ||
      (mainMedia && mainMedia.url && (mediaType === 'image' || mainMedia.type === 'image'))
    );

    const customFooter = tplItem.footer !== undefined ? tplItem.footer : 'WhatsBlast';

    const interactivePayload: any = {
      text: messageText,
      footer: customFooter,
      interactiveButtons,
      hasMediaAttachment: hasMedia,
    };

    if (buttonMedia && buttonMedia.url) {
      interactivePayload.image = { url: buttonMedia.url };
      interactivePayload.caption = messageText;
      delete interactivePayload.text;
    } else if (mainMedia && mainMedia.url && (mediaType === 'image' || mainMedia.type === 'image')) {
      interactivePayload.image = { url: mainMedia.url };
      interactivePayload.caption = messageText;
      delete interactivePayload.text;
    }

    try {
      console.log(`🚀 Sending interactive buttons payload to ${targetJid}:`, JSON.stringify(interactiveButtons));
      return await sock.sendMessage(targetJid, interactivePayload);
    } catch (err: any) {
      console.warn('⚠️ interactiveButtons payload failed:', err.message || err);
      return await sock.sendMessage(targetJid, { text: messageText });
    }
  }

  // Media Attachments (Image, Video, Document)
  if (mainMedia && mainMedia.url) {
    const isImg = mediaType === 'image' || mainMedia.type === 'image';
    const isVid = mediaType === 'video' || mainMedia.type === 'video';
    const isDoc = mediaType === 'document' || mainMedia.type === 'document';

    if (isImg) {
      return await sock.sendMessage(targetJid, {
        image: { url: mainMedia.url },
        caption: messageText,
      });
    }
    if (isVid) {
      return await sock.sendMessage(targetJid, {
        video: { url: mainMedia.url },
        caption: messageText,
      });
    }
    if (isDoc) {
      return await sock.sendMessage(targetJid, {
        document: { url: mainMedia.url },
        fileName: mainMedia.filename || 'Attachment',
        caption: messageText,
      });
    }
  }

  // Default Text Message
  return await sock.sendMessage(targetJid, { text: messageText });
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

        const cleanPhone = recipientPhone.replace(/[^0-9]/g, '');
        const targetJid = `${cleanPhone}@s.whatsapp.net`;

        // Resolve templates to send
        let templatesToSend: any[] = [];
        if (Array.isArray(campaign.templates) && campaign.templates.length > 0) {
          templatesToSend = campaign.templates;
        } else if (campaign.template) {
          const tplDoc = await MessageTemplate.findById(campaign.template);
          if (tplDoc) templatesToSend = [tplDoc];
        }

        if (templatesToSend.length === 0) {
          campaign.status = CampaignStatus.FAILED;
          await campaign.save();
          console.error(`Campaign ${campaign._id} failed: No templates found`);
          continue;
        }

        // Send sequence of templates to recipient
        for (let i = 0; i < templatesToSend.length; i++) {
          const tplItem = templatesToSend[i];
          const result = await sendBaileysTemplateMessage(activeSession.socket, targetJid, tplItem, cleanPhone);

          if (sessionDoc) {
            sessionDoc.current_message_count += 1;
            await sessionDoc.save();
          }

          // Log message sending
          await Message.create({
            session: sessionDoc?._id,
            campaign: campaign._id,
            direction: MessageDirection.OUTBOUND,
            type: tplItem.messageType || tplItem.type || 'text',
            status: MessageStatus.SENT,
            recipient_phone: cleanPhone,
            to_jid: targetJid,
            template: campaign.template || null,
            content: { text: tplItem.text || tplItem.template, buttons: tplItem.buttons },
            message_id: result?.key?.id || '',
            wa_timestamp: new Date(),
          });

          if (i < templatesToSend.length - 1) {
            await new Promise((res) => setTimeout(res, 1000));
          }
        }

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

      // Random delay between contacts
      const minDelay = (campaign.min_interval_seconds || 10) * 1000;
      const maxDelay = (campaign.max_interval_seconds || 15) * 1000;
      const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

      await new Promise((res) => setTimeout(res, randomDelay));
    }
  } catch (err) {
    console.error('Error in Blast Runner processing loop:', err);
  } finally {
    isProcessing = false;
  }
}
