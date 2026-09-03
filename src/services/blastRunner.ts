import { BlastCampaign, CampaignStatus } from '../models/BlastCampaign.js';
import { MessageTemplate } from '../models/MessageTemplate.js';
import { WhatsAppSession, SessionStatus } from '../models/WhatsAppSession.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';
import { FileModel } from '../models/File.js';
import { User } from '../models/User.js';
import { getActiveSession, pickUserSession, initWhatsAppSession, verifyAndFormatJid, markSystemSentMessageId } from './baileysManager.js';
import { getLocalTimeInTimezone } from './crossChatRunner.js';
import dayjs from 'dayjs';

let runnerInterval: NodeJS.Timeout | null = null;
let isProcessing = false;

export function startBlastRunner(intervalMs = 3000): void {
  if (runnerInterval) return;

  // Automatically unpause any campaigns that were paused due to daily message limits
  BlastCampaign.updateMany(
    {
      status: CampaignStatus.PAUSED,
      error_message: { $regex: /daily message limit/i },
    },
    {
      $set: { status: CampaignStatus.RUNNING },
      $unset: { error_message: 1 },
    }
  )
    .then((res) => {
      if (res.modifiedCount > 0) {
        console.log(`🔄 Automatically resumed ${res.modifiedCount} campaign(s) previously paused by daily message limit.`);
      }
    })
    .catch((err) => {
      console.error('Error auto-resuming campaigns paused by daily message limit:', err);
    });

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
  const rawFooter = tplItem.footer ?? tplItem.footer_text ?? (typeof tplItem.content === 'object' ? tplItem.content?.footer ?? tplItem.content?.footer_text : null);
  const customFooter = rawFooter !== undefined && rawFooter !== null ? String(rawFooter).trim() : '';

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

  if (primarySendResult?.key?.id) {
    markSystemSentMessageId(primarySendResult.key.id);
  }

  return primarySendResult;
}

function isSessionQualified(sessionDoc: any, userTimezone = 'Asia/Kuala_Lumpur'): { qualified: boolean; reason?: string } {
  if (!sessionDoc || sessionDoc.status !== SessionStatus.CONNECTED) {
    return { qualified: false, reason: 'Session is disconnected or unavailable' };
  }

  const today = dayjs().format('YYYY-MM-DD');
  if (sessionDoc.current_day !== today) {
    sessionDoc.current_day = today;
    sessionDoc.current_message_count = 0;
    sessionDoc.warmup_message_count = 0;
  }

  const startTime = sessionDoc.active_start_time || '00:00';
  const endTime = sessionDoc.active_end_time || '23:59';
  const local = getLocalTimeInTimezone(new Date(), userTimezone);
  const currentTime = `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`;

  let isWithinActiveHours = false;
  if (startTime <= endTime) {
    isWithinActiveHours = currentTime >= startTime && currentTime <= endTime;
  } else {
    isWithinActiveHours = currentTime >= startTime || currentTime <= endTime;
  }

  if (!isWithinActiveHours) {
    return { qualified: false, reason: `Outside active sending window (${startTime} - ${endTime}) in ${userTimezone}` };
  }

  return { qualified: true };
}

async function getQualifiedSessionForCampaign(campaign: any, targetPendingMsg?: any): Promise<{ sessionId?: string; sessionDoc?: any; errorMsg?: string }> {
  const allowedSessionIds: string[] | undefined = campaign.session_mode === 'SPECIFIC' ? campaign.selected_sessions : undefined;
  const userDoc = campaign.user ? await User.findById(campaign.user) : null;
  const userTimezone = userDoc?.timezone || 'Asia/Kuala_Lumpur';

  const matchesAllowed = (s: any) => {
    if (!allowedSessionIds || allowedSessionIds.length === 0) return true;
    const sId = s.session_id;
    const mongoId = s._id ? s._id.toString() : (s.id ? s.id.toString() : null);
    return (sId && allowedSessionIds.includes(sId)) || (mongoId ? allowedSessionIds.includes(mongoId) : false);
  };

  if (targetPendingMsg && targetPendingMsg.session) {
    const preSessObj: any = targetPendingMsg.session.toObject ? targetPendingMsg.session.toObject() : targetPendingMsg.session;
    const sessId = preSessObj.session_id;
    const sessMongoId = preSessObj._id ? preSessObj._id.toString() : (preSessObj.id ? preSessObj.id.toString() : null);
    if ((sessId || sessMongoId) && matchesAllowed(preSessObj)) {
      const orConditions: any[] = [];
      if (sessId) orConditions.push({ session_id: sessId });
      if (sessMongoId) orConditions.push({ _id: sessMongoId });
      const liveSessDoc = await WhatsAppSession.findOne({ $or: orConditions });
      if (liveSessDoc) {
        const check = isSessionQualified(liveSessDoc, userTimezone);
        if (check.qualified) {
          await liveSessDoc.save();
          return { sessionId: liveSessDoc.session_id, sessionDoc: liveSessDoc };
        }
      }
    }
  }

  let candidateSessions = await WhatsAppSession.find({ user: campaign.user, status: SessionStatus.CONNECTED }).sort({ createdAt: 1 });
  if (allowedSessionIds && allowedSessionIds.length > 0) {
    candidateSessions = candidateSessions.filter(matchesAllowed);
  }

  if (candidateSessions.length === 0) {
    return { errorMsg: 'No connected WhatsApp session available' };
  }

  const disqualificationReasons: string[] = [];

  for (const sessDoc of candidateSessions) {
    const check = isSessionQualified(sessDoc, userTimezone);
    if (check.qualified) {
      await sessDoc.save();
      if (targetPendingMsg && targetPendingMsg._id) {
        targetPendingMsg.session = sessDoc._id;
        targetPendingMsg.sender_phone = sessDoc.phone_number;
        await targetPendingMsg.save();
      }
      return { sessionId: sessDoc.session_id, sessionDoc: sessDoc };
    }
    if (check.reason) disqualificationReasons.push(check.reason);
  }

  const allHours = disqualificationReasons.every((r) => r.includes('Outside active sending window'));

  let finalError = 'No WhatsApp session available to send';
  if (allHours) {
    finalError = 'All WhatsApp sessions are outside active sending window';
  } else if (disqualificationReasons.length > 0) {
    finalError = disqualificationReasons[0];
  }

  return { errorMsg: finalError };
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

      const rawRecip = recipientPhone.replace(/[^0-9]/g, '');
      const normRecip = rawRecip.startsWith('0') ? '60' + rawRecip.slice(1) : (rawRecip.startsWith('60') ? '0' + rawRecip.slice(2) : rawRecip);
      const possiblePhones = Array.from(new Set([rawRecip, normRecip])).filter(Boolean);

      const existingPendingMsg = await Message.findOne({
        campaign: campaign._id,
        recipient_phone: { $in: possiblePhones },
        status: { $in: [MessageStatus.PENDING, MessageStatus.EXPIRED, MessageStatus.QUEUED] },
      }).populate('session');

      const qualifiedRes = await getQualifiedSessionForCampaign(campaign, existingPendingMsg);
      if (!qualifiedRes.sessionId || !qualifiedRes.sessionDoc) {
        const errorMsg = qualifiedRes.errorMsg || 'No connected WhatsApp session available';
        console.warn(`⚠️ Campaign "${campaign.name}" paused: ${errorMsg}`);
        campaign.status = CampaignStatus.PAUSED;
        campaign.error_message = errorMsg;
        await campaign.save();
        break;
      }

      const { sessionId, sessionDoc } = qualifiedRes;

      let activeSession = getActiveSession(sessionId);
      if (!activeSession) {
        activeSession = await initWhatsAppSession(sessionId);
      }

      // Verify recipient on WhatsApp & format phone number / JID
      const rawPhone = recipientPhone;
      const { jid: targetJid, exists, cleanPhone } = await verifyAndFormatJid(activeSession.socket, rawPhone);
      if (cleanPhone && !possiblePhones.includes(cleanPhone)) {
        possiblePhones.push(cleanPhone);
      }

      if (!exists) {
        const errorMsg = `Phone number ${rawPhone} is not registered on WhatsApp`;
        console.warn(`❌ ${errorMsg} for campaign "${campaign.name}"`);

        const targetPhone = cleanPhone || rawPhone;
        const now = new Date();
        const updatedMsg = await Message.findOneAndUpdate(
          { campaign: campaign._id, recipient_phone: { $in: possiblePhones }, status: { $in: [MessageStatus.PENDING, MessageStatus.EXPIRED, MessageStatus.QUEUED] } },
          {
            session: sessionDoc?._id,
            recipient_phone: targetPhone,
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

        if (campaign.current_index >= campaign.contacts.length) {
          campaign.status = CampaignStatus.COMPLETED;
          campaign.completed_at = new Date();
          campaign.error_message = undefined;
          await campaign.save();
          console.log(`🎉 Campaign "${campaign.name}" completed!`);
          break;
        }

        await campaign.save();

        console.log(`❌ Campaign "${campaign.name}": Failed to send to ${rawPhone} (Not on WhatsApp) (${campaign.current_index}/${campaign.contacts.length})`);

        const minIntervalMins = Math.max(0.1, Number(campaign.min_interval_seconds ?? sessionDoc?.min_interval_seconds ?? 10));
        const maxIntervalMins = Math.max(minIntervalMins, Number(campaign.max_interval_seconds ?? sessionDoc?.max_interval_seconds ?? 15));
        const randomMinutes = Math.random() * (maxIntervalMins - minIntervalMins) + minIntervalMins;
        const randomDelayMs = Math.floor(randomMinutes * 60 * 1000);
        console.log(`⏱️ Waiting ${randomMinutes.toFixed(2)} minutes (${Math.round(randomDelayMs / 1000)}s) interval before next contact...`);
        await new Promise((res) => setTimeout(res, randomDelayMs));
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

          const rawFooter = tplItem.footer ?? tplItem.footer_text ?? (typeof tplItem.content === 'object' ? tplItem.content?.footer ?? tplItem.content?.footer_text : null);
          const itemFooter = rawFooter !== undefined && rawFooter !== null ? String(rawFooter).trim() : '';

          const fullContent = {
            text: tplItem.text || tplItem.template || '',
            buttons: tplItem.buttons || [],
            footer: itemFooter,
            title: tplItem.title || '',
            subtitle: tplItem.subtitle || '',
            file: activeMedia?.url || mainMedia?.url || null,
            file_type: activeMedia?.type || tplItem.messageType || tplItem.type || 'text',
            file_name: activeMedia?.filename || null,
            button_image: buttonMedia?.url || null,
          };

          const now = new Date();
          const updatedMsg = await Message.findOneAndUpdate(
            { campaign: campaign._id, recipient_phone: { $in: possiblePhones }, status: { $in: [MessageStatus.PENDING, MessageStatus.EXPIRED, MessageStatus.QUEUED] } },
            {
              session: sessionDoc?._id,
              recipient_phone: cleanPhone,
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

        let retrySuccess = false;
        if (campaign.retry_on_failure !== false) {
          try {
            const allowedSessions = campaign.session_mode === 'SPECIFIC' ? campaign.selected_sessions : undefined;
            const retrySessionId = await pickUserSession(campaign.user.toString(), allowedSessions, [sessionId]);
            if (retrySessionId) {
              console.log(`🔄 Retrying send to ${cleanPhone} using fallback session ${retrySessionId}...`);
              let retrySession = getActiveSession(retrySessionId);
              if (!retrySession) {
                retrySession = await initWhatsAppSession(retrySessionId);
              }
              const retrySessionDoc = await WhatsAppSession.findOne({ session_id: retrySessionId });

              for (let i = 0; i < templatesToSend.length; i++) {
                const tplItem = templatesToSend[i];
                const result = await sendBaileysTemplateMessage(retrySession.socket, targetJid, tplItem, cleanPhone);

                if (retrySessionDoc) {
                  retrySessionDoc.current_message_count += 1;
                  await retrySessionDoc.save();
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
                await Message.findOneAndUpdate(
                  { campaign: campaign._id, recipient_phone: { $in: possiblePhones }, status: { $in: [MessageStatus.PENDING, MessageStatus.EXPIRED, MessageStatus.QUEUED] } },
                  {
                    session: retrySessionDoc?._id,
                    recipient_phone: cleanPhone,
                    type: tplItem.messageType || tplItem.type || 'text',
                    status: MessageStatus.SENT,
                    to_jid: targetJid,
                    template: campaign.template || null,
                    content: fullContent,
                    message_id: result?.key?.id || '',
                    sent_at: now,
                    wa_timestamp: now,
                  },
                  { new: true, upsert: true }
                );
              }

              campaign.current_index += 1;
              campaign.stats.sent += 1;
              await campaign.save();

              console.log(`💬 Campaign "${campaign.name}": Sent to ${cleanPhone} via fallback session (${campaign.current_index}/${campaign.contacts.length})`);
              retrySuccess = true;
            }
          } catch (retryErr: any) {
            console.warn(`⚠️ Retry session fallback failed for ${cleanPhone}:`, retryErr.message || retryErr);
          }
        }

        if (!retrySuccess) {
          try {
            const now = new Date();
            const updatedMsg = await Message.findOneAndUpdate(
              { campaign: campaign._id, recipient_phone: { $in: possiblePhones }, status: { $in: [MessageStatus.PENDING, MessageStatus.EXPIRED, MessageStatus.QUEUED] } },
              {
                session: sessionDoc?._id,
                recipient_phone: cleanPhone,
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
      }

      // Check if all contacts are finished before waiting for interval
      if (campaign.current_index >= campaign.contacts.length) {
        campaign.status = CampaignStatus.COMPLETED;
        campaign.completed_at = new Date();
        campaign.error_message = undefined;
        await campaign.save();
        console.log(`🎉 Campaign "${campaign.name}" completed!`);
        break;
      }

      // Random delay between contacts (inherits campaign 10-15 minute settings or session defaults)
      const minIntervalMins = Math.max(0.1, Number(campaign.min_interval_seconds ?? sessionDoc?.min_interval_seconds ?? 10));
      const maxIntervalMins = Math.max(minIntervalMins, Number(campaign.max_interval_seconds ?? sessionDoc?.max_interval_seconds ?? 15));

      const randomMinutes = Math.random() * (maxIntervalMins - minIntervalMins) + minIntervalMins;
      const randomDelayMs = Math.floor(randomMinutes * 60 * 1000);

      console.log(`⏱️ Waiting ${randomMinutes.toFixed(2)} minutes (${Math.round(randomDelayMs / 1000)}s) interval before next contact...`);
      await new Promise((res) => setTimeout(res, randomDelayMs));
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
