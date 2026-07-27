import { BlastCampaign, CampaignStatus } from '../models/BlastCampaign.js';
import { MessageTemplate } from '../models/MessageTemplate.js';
import { WhatsAppSession } from '../models/WhatsAppSession.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';
import { FileModel } from '../models/File.js';
import { getActiveSession, pickUserSession, initWhatsAppSession, verifyAndFormatJid } from './baileysManager.js';
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

function normalizeMediaUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  const match = rawUrl.match(/^https?:\/\/([^/]+)\.linodeobjects\.com\/(.+)$/i);
  if (match) {
    const hostPrefix = match[1];
    const pathKey = match[2];
    if (hostPrefix.includes('.')) {
      const parts = hostPrefix.split('.');
      const endpoint = parts.pop();
      const bucket = parts.join('.');
      return `https://${endpoint}.linodeobjects.com/${bucket}/${pathKey}`;
    }
  }
  return rawUrl;
}

export async function getFileUrl(fileIdOrObj: any): Promise<{ url: string; type: string; filename?: string; mimetype?: string } | null> {
  if (!fileIdOrObj) return null;

  if (typeof fileIdOrObj === 'object') {
    const url = fileIdOrObj.file_path || fileIdOrObj.file_url || fileIdOrObj.url;
    if (url) {
      return {
        url: normalizeMediaUrl(url),
        type: fileIdOrObj.file_type || fileIdOrObj.type || 'image',
        filename: fileIdOrObj.file_name || fileIdOrObj.fileName,
        mimetype: fileIdOrObj.mimetype,
      };
    }
  }

  if (typeof fileIdOrObj === 'string' && fileIdOrObj.trim().length > 0) {
    if (fileIdOrObj.startsWith('http://') || fileIdOrObj.startsWith('https://')) {
      return { url: normalizeMediaUrl(fileIdOrObj), type: 'image' };
    }
    try {
      const fileDoc = await FileModel.findById(fileIdOrObj);
      if (fileDoc && fileDoc.file_path) {
        return {
          url: normalizeMediaUrl(fileDoc.file_path),
          type: fileDoc.file_type || 'image',
          filename: fileDoc.file_name,
          mimetype: fileDoc.mimetype,
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
  const rawFileIds = tplItem.file_ids || tplItem.fileIds || tplItem.files;
  const buttonMediaId = tplItem.button_image_id || tplItem.buttonImageId || tplItem.button_image;

  let fileIdList: any[] = [];
  if (Array.isArray(rawFileIds) && rawFileIds.length > 0) {
    fileIdList = rawFileIds;
  } else if (fileId) {
    fileIdList = [fileId];
  }

  const allMedia: any[] = [];
  for (const fid of fileIdList) {
    const sId = typeof fid === 'string' ? fid : fid?.id || fid?._id || fid?.file_id;
    if (sId) {
      const mediaObj = await getFileUrl(sId);
      if (mediaObj?.url) allMedia.push(mediaObj);
    }
  }

  const buttonMedia = await getFileUrl(buttonMediaId);
  const mainMedia = allMedia[0] || null;

  const buttons = Array.isArray(tplItem.buttons) ? tplItem.buttons : [];
  const customFooter = tplItem.footer !== undefined && tplItem.footer !== null ? String(tplItem.footer).trim() : '';

  const activeMedia = buttonMedia?.url ? buttonMedia : mainMedia;
  let primarySendResult: any = null;

  // Interactive buttons / footer handler matching reference Whats-Blasting-Server
  if (buttons.length > 0 || mediaType === 'buttons' || customFooter) {
    const interactiveButtons = normalizeInteractiveButtons(buttons);
    const hasMedia = Boolean(activeMedia && activeMedia.url);

    const interactivePayload: any = {
      title: tplItem.title || undefined,
      subtitle: tplItem.subtitle || undefined,
      footer: customFooter || undefined,
      interactiveButtons,
      hasMediaAttachment: hasMedia,
    };

    if (activeMedia && activeMedia.url) {
      const isImg = mediaType === 'image' || activeMedia.type === 'image';
      const isVid = mediaType === 'video' || activeMedia.type === 'video';
      const isDoc = mediaType === 'document' || activeMedia.type === 'document';

      if (isImg) {
        interactivePayload.image = { url: activeMedia.url };
        interactivePayload.caption = messageText;
      } else if (isVid) {
        interactivePayload.video = { url: activeMedia.url };
        interactivePayload.caption = messageText;
      } else if (isDoc) {
        interactivePayload.document = { url: activeMedia.url };
        interactivePayload.fileName = activeMedia.filename || 'Attachment';
        interactivePayload.caption = messageText;
        interactivePayload.mimetype = activeMedia.mimetype || 'application/pdf';
      } else {
        interactivePayload.image = { url: activeMedia.url };
        interactivePayload.caption = messageText;
      }
    } else {
      interactivePayload.text = messageText;
    }

    try {
      console.log(`🚀 Sending interactive message payload to ${targetJid}:`, JSON.stringify(interactivePayload));
      primarySendResult = await sock.sendMessage(targetJid, interactivePayload);
    } catch (err: any) {
      console.warn('⚠️ Interactive message payload failed, falling back to standard media/text:', err.message || err);
    }
  }

  // Fallback / Standard Media Attachments (Image, Video, Document)
  if (!primarySendResult && activeMedia && activeMedia.url) {
    const isImg = mediaType === 'image' || activeMedia.type === 'image';
    const isVid = mediaType === 'video' || activeMedia.type === 'video';
    const isDoc = mediaType === 'document' || activeMedia.type === 'document';

    if (isImg) {
      primarySendResult = await sock.sendMessage(targetJid, {
        image: { url: activeMedia.url },
        caption: messageText,
        footer: customFooter || undefined,
        mimetype: activeMedia.mimetype || 'image/jpeg',
      });
    } else if (isVid) {
      primarySendResult = await sock.sendMessage(targetJid, {
        video: { url: activeMedia.url },
        caption: messageText,
        footer: customFooter || undefined,
        mimetype: activeMedia.mimetype || 'video/mp4',
      });
    } else if (isDoc) {
      primarySendResult = await sock.sendMessage(targetJid, {
        document: { url: activeMedia.url },
        fileName: activeMedia.filename || 'Attachment',
        caption: messageText,
        footer: customFooter || undefined,
        mimetype: activeMedia.mimetype || 'application/pdf',
      });
    }
  }

  // Default Text Message if no media sent yet
  if (!primarySendResult) {
    primarySendResult = await sock.sendMessage(targetJid, {
      text: messageText,
      footer: customFooter || undefined,
    });
  }

  // Send additional media files sequentially if multiple images/files attached
  if (allMedia.length > 1) {
    for (const extraMedia of allMedia.slice(1)) {
      try {
        await new Promise((res) => setTimeout(res, 800));
        const isImg = extraMedia.type === 'image' || mediaType === 'image';
        const isVid = extraMedia.type === 'video' || mediaType === 'video';
        const isDoc = extraMedia.type === 'document' || mediaType === 'document';

        if (isImg) {
          await sock.sendMessage(targetJid, {
            image: { url: extraMedia.url },
            mimetype: extraMedia.mimetype || 'image/jpeg',
          });
        } else if (isVid) {
          await sock.sendMessage(targetJid, {
            video: { url: extraMedia.url },
            mimetype: extraMedia.mimetype || 'video/mp4',
          });
        } else if (isDoc) {
          await sock.sendMessage(targetJid, {
            document: { url: extraMedia.url },
            fileName: extraMedia.filename || 'Attachment',
            mimetype: extraMedia.mimetype || 'application/pdf',
          });
        }
      } catch (err: any) {
        console.warn('⚠️ Failed sending additional media item:', err.message || err);
      }
    }
  }

  return primarySendResult;
}

const activeCampaigns = new Set<string>();

async function runSingleCampaign(campaignId: string): Promise<void> {
  try {
    while (true) {
      const campaign = await BlastCampaign.findById(campaignId);
      if (!campaign || campaign.status !== CampaignStatus.RUNNING) {
        break;
      }

      if (campaign.current_index >= campaign.contacts.length) {
        campaign.status = CampaignStatus.COMPLETED;
        campaign.completed_at = new Date();
        campaign.error_message = undefined;
        await campaign.save();
        console.log(`🎉 Campaign "${campaign.name}" completed!`);
        break;
      }

      const recipientPhone = campaign.contacts[campaign.current_index];
      if (!recipientPhone) {
        campaign.current_index += 1;
        await campaign.save();
        continue;
      }

      let sessionId: string;
      try {
        const allowedSessions = campaign.session_mode === 'SPECIFIC' ? campaign.selected_sessions : undefined;
        sessionId = await pickUserSession(campaign.user.toString(), allowedSessions);
      } catch (err: any) {
        const errorMsg = err.message || 'No connected WhatsApp session available';
        console.warn(`⚠️ Campaign "${campaign.name}" paused: ${errorMsg}`);
        campaign.status = CampaignStatus.PAUSED;
        campaign.error_message = errorMsg;
        await campaign.save();
        break;
      }

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
          const errorMsg = `Session ${sessionId} reached daily message limit (${sessionDoc.max_message_count_per_day})`;
          console.log(`⚠️ ${errorMsg}. Pausing campaign "${campaign.name}".`);
          campaign.status = CampaignStatus.PAUSED;
          campaign.error_message = errorMsg;
          await campaign.save();
          break;
        }

        // Active Sending Time Window Check
        const startTime = sessionDoc.active_start_time || '00:00';
        const endTime = sessionDoc.active_end_time || '23:59';
        const currentTime = dayjs().format('HH:mm');

        let isWithinActiveHours = false;
        if (startTime <= endTime) {
          isWithinActiveHours = currentTime >= startTime && currentTime <= endTime;
        } else {
          // Overnight range (e.g. 22:00 to 06:00)
          isWithinActiveHours = currentTime >= startTime || currentTime <= endTime;
        }

        if (!isWithinActiveHours) {
          const errorMsg = `Outside active sending window (${startTime} - ${endTime})`;
          console.log(`⏰ ${errorMsg}. Pausing campaign "${campaign.name}".`);
          campaign.status = CampaignStatus.PAUSED;
          campaign.error_message = errorMsg;
          await campaign.save();
          break;
        }
      }

      // Verify recipient on WhatsApp & format phone number / JID
      const rawPhone = recipientPhone;
      const { jid: targetJid, exists, cleanPhone } = await verifyAndFormatJid(activeSession.socket, rawPhone);

      if (!exists) {
        const errorMsg = `Phone number ${rawPhone} is not registered on WhatsApp`;
        console.warn(`❌ ${errorMsg} for campaign "${campaign.name}"`);

        const targetPhone = cleanPhone || rawPhone;
        const now = new Date();
        const updatedMsg = await Message.findOneAndUpdate(
          { campaign: campaign._id, recipient_phone: targetPhone, status: MessageStatus.PENDING },
          {
            session: sessionDoc?._id,
            status: MessageStatus.FAILED,
            error: errorMsg,
            content: { text: 'Send Failed: Recipient not registered on WhatsApp' },
            sent_at: now,
            wa_timestamp: now,
          },
          { new: true }
        );

        if (!updatedMsg) {
          await Message.create({
            session: sessionDoc?._id,
            campaign: campaign._id,
            direction: MessageDirection.OUTBOUND,
            type: 'text',
            status: MessageStatus.FAILED,
            recipient_phone: targetPhone,
            to_jid: targetJid || `${rawPhone}@s.whatsapp.net`,
            error: errorMsg,
            content: { text: 'Send Failed: Recipient not registered on WhatsApp' },
            sent_at: now,
            wa_timestamp: now,
          });
        }

        campaign.stats.failed += 1;
        campaign.current_index += 1;
        await campaign.save();

        console.log(`❌ Campaign "${campaign.name}": Failed to send to ${rawPhone} (Not on WhatsApp) (${campaign.current_index}/${campaign.contacts.length})`);

        const minIntervalSec = sessionDoc?.min_interval_seconds ?? campaign.min_interval_seconds ?? 10;
        const maxIntervalSec = sessionDoc?.max_interval_seconds ?? campaign.max_interval_seconds ?? 15;
        const minDelay = minIntervalSec * 1000;
        const maxDelay = maxIntervalSec * 1000;
        const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        await new Promise((res) => setTimeout(res, randomDelay));
        continue;
      }

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
        campaign.error_message = 'No templates found for this campaign';
        await campaign.save();
        console.error(`Campaign ${campaign._id} failed: No templates found`);
        break;
      }

      // Send sequence of templates to recipient
      try {
        for (let i = 0; i < templatesToSend.length; i++) {
          const tplItem = templatesToSend[i];
          const result = await sendBaileysTemplateMessage(activeSession.socket, targetJid, tplItem, cleanPhone);

          if (sessionDoc) {
            sessionDoc.current_message_count += 1;
            await sessionDoc.save();
          }

          const fileId = tplItem.file_id || tplItem.fileId || tplItem.file;
          const buttonMediaId = tplItem.button_image_id || tplItem.buttonImageId || tplItem.button_image;
          const mainMedia = await getFileUrl(fileId);
          const buttonMedia = await getFileUrl(buttonMediaId);
          const activeMedia = buttonMedia?.url ? buttonMedia : mainMedia;

          const fullContent = {
            text: tplItem.text || tplItem.template || '',
            buttons: tplItem.buttons || [],
            footer: tplItem.footer || '',
            title: tplItem.title || '',
            subtitle: tplItem.subtitle || '',
            file: activeMedia?.url || mainMedia?.url || null,
            file_type: activeMedia?.type || tplItem.messageType || tplItem.type || 'text',
            file_name: activeMedia?.filename || null,
            button_image: buttonMedia?.url || null,
          };

          const now = new Date();
          const updatedMsg = await Message.findOneAndUpdate(
            { campaign: campaign._id, recipient_phone: cleanPhone, status: MessageStatus.PENDING },
            {
              session: sessionDoc?._id,
              type: tplItem.messageType || tplItem.type || 'text',
              status: MessageStatus.SENT,
              to_jid: targetJid,
              template: campaign.template || null,
              content: fullContent,
              message_id: result?.key?.id || '',
              sent_at: now,
              wa_timestamp: now,
            },
            { new: true }
          );

          if (!updatedMsg) {
            await Message.create({
              session: sessionDoc?._id,
              campaign: campaign._id,
              direction: MessageDirection.OUTBOUND,
              type: tplItem.messageType || tplItem.type || 'text',
              status: MessageStatus.SENT,
              recipient_phone: cleanPhone,
              to_jid: targetJid,
              template: campaign.template || null,
              content: fullContent,
              message_id: result?.key?.id || '',
              sent_at: now,
              wa_timestamp: now,
            });
          }

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
        try {
          const now = new Date();
          const updatedMsg = await Message.findOneAndUpdate(
            { campaign: campaign._id, recipient_phone: cleanPhone, status: MessageStatus.PENDING },
            {
              session: sessionDoc?._id,
              status: MessageStatus.FAILED,
              to_jid: targetJid,
              error: err.message || String(err),
              content: { text: templatesToSend[0]?.text || templatesToSend[0]?.template || 'Send Failed' },
              sent_at: now,
              wa_timestamp: now,
            },
            { new: true }
          );

          if (!updatedMsg) {
            await Message.create({
              session: sessionDoc?._id,
              campaign: campaign._id,
              direction: MessageDirection.OUTBOUND,
              type: 'text',
              status: MessageStatus.FAILED,
              recipient_phone: cleanPhone,
              to_jid: targetJid,
              error: err.message || String(err),
              content: { text: templatesToSend[0]?.text || templatesToSend[0]?.template || 'Send Failed' },
              sent_at: now,
              wa_timestamp: now,
            });
          }
        } catch (mErr) {
          console.error('Failed to log failed message:', mErr);
        }
        campaign.stats.failed += 1;
        campaign.current_index += 1;
        await campaign.save();
      }

      // Random delay between contacts (binded to session, inherits default 10s - 15s or campaign settings)
      const minIntervalSec = sessionDoc?.min_interval_seconds ?? campaign.min_interval_seconds ?? 10;
      const maxIntervalSec = sessionDoc?.max_interval_seconds ?? campaign.max_interval_seconds ?? 15;
      const minDelay = minIntervalSec * 1000;
      const maxDelay = maxIntervalSec * 1000;
      const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

      await new Promise((res) => setTimeout(res, randomDelay));
    }
  } catch (err) {
    console.error(`Error in runSingleCampaign (${campaignId}):`, err);
  } finally {
    activeCampaigns.delete(campaignId);
  }
}

async function processCampaigns(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const now = new Date();
    const runningCampaigns = await BlastCampaign.find({
      status: CampaignStatus.RUNNING,
      $or: [
        { scheduled_at: { $exists: false } },
        { scheduled_at: null },
        { scheduled_at: { $lte: now } },
      ],
    });

    for (const campaign of runningCampaigns) {
      const campaignId = campaign._id.toString();
      if (!activeCampaigns.has(campaignId)) {
        activeCampaigns.add(campaignId);
        runSingleCampaign(campaignId).catch((err) =>
          console.error(`Unhandled error in runSingleCampaign (${campaignId}):`, err)
        );
      }
    }
  } catch (err) {
    console.error('Error in Blast Runner scheduler loop:', err);
  } finally {
    isProcessing = false;
  }
}
