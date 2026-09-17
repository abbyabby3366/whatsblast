import { SessionStatus } from '../models/WhatsAppSession.js';
import { FileModel } from '../models/File.js';
import { getLocalTimeInTimezone } from './crossChatRunner.js';
import { markSystemSentMessageId } from './baileysManager.js';
import dayjs from 'dayjs';

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

export function isSessionQualified(sessionDoc: any, userTimezone = 'Asia/Kuala_Lumpur'): { qualified: boolean; reason?: string } {
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

export function resolveCampaignInterval(campaign: any, sessionDoc: any): { minMins: number; maxMins: number } {
  const campMin = campaign?.min_interval_seconds !== undefined && campaign?.min_interval_seconds !== null && !isNaN(Number(campaign.min_interval_seconds))
    ? Number(campaign.min_interval_seconds)
    : undefined;
  const campMax = campaign?.max_interval_seconds !== undefined && campaign?.max_interval_seconds !== null && !isNaN(Number(campaign.max_interval_seconds))
    ? Number(campaign.max_interval_seconds)
    : undefined;

  const sessMin = sessionDoc?.min_interval_seconds !== undefined && sessionDoc?.min_interval_seconds !== null && !isNaN(Number(sessionDoc.min_interval_seconds))
    ? Number(sessionDoc.min_interval_seconds)
    : undefined;
  const sessMax = sessionDoc?.max_interval_seconds !== undefined && sessionDoc?.max_interval_seconds !== null && !isNaN(Number(sessionDoc.max_interval_seconds))
    ? Number(sessionDoc.max_interval_seconds)
    : undefined;

  let min = 10;
  let max = 15;

  // 1. If campaign has a custom configured interval (different from generic default 10-15), campaign is authoritative
  if (campMin !== undefined && (campMin !== 10 || campMax !== 15)) {
    min = campMin;
    max = campMax !== undefined && campMax >= campMin ? campMax : campMin + 5;
  }
  // 2. Otherwise if session has a custom interval (different from generic default 10-15), use session
  else if (sessMin !== undefined && (sessMin !== 10 || sessMax !== 15)) {
    min = sessMin;
    max = sessMax !== undefined && sessMax >= sessMin ? sessMax : sessMin + 5;
  }
  // 3. Otherwise if campaign has explicit values defined, use them
  else if (campMin !== undefined) {
    min = campMin;
    max = campMax !== undefined && campMax >= campMin ? campMax : campMin + 5;
  }
  // 4. Otherwise if session has explicit values defined, use them
  else if (sessMin !== undefined) {
    min = sessMin;
    max = sessMax !== undefined && sessMax >= sessMin ? sessMax : sessMin + 5;
  }

  min = Math.max(0.1, min);
  max = Math.max(min, max);

  return { minMins: min, maxMins: max };
}
