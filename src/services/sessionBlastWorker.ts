import { BlastCampaign, CampaignStatus } from '../models/BlastCampaign.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';
import { MessageTemplate } from '../models/MessageTemplate.js';
import { WhatsAppSession, SessionStatus } from '../models/WhatsAppSession.js';
import { getActiveSession, initWhatsAppSession, verifyAndFormatJid } from './baileysManager.js';
import { sendBaileysTemplateMessage, getFileUrl, resolveCampaignInterval, isSessionQualified } from './blastUtils.js';

export async function syncCampaignStatusAndStats(campaignId: string): Promise<void> {
  try {
    const pendingCount = await Message.countDocuments({
      campaign: campaignId,
      status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED] },
    });

    if (pendingCount === 0) {
      const campaign = await BlastCampaign.findById(campaignId);
      if (campaign && campaign.status === CampaignStatus.RUNNING) {
        campaign.status = CampaignStatus.COMPLETED;
        campaign.completed_at = new Date();
        campaign.error_message = undefined;
        await campaign.save();
        console.log(`🎉 Campaign "${campaign.name}" (${campaignId}) marked as COMPLETED!`);
      }
    }
  } catch (err) {
    console.error(`Error in syncCampaignStatusAndStats for campaign ${campaignId}:`, err);
  }
}

export async function runSessionQueueForCampaign(
  campaignId: string,
  sessionId: string,
  userTimezone = 'Asia/Kuala_Lumpur'
): Promise<void> {
  try {
    while (true) {
      const campaign = await BlastCampaign.findById(campaignId);
      if (!campaign || campaign.status !== CampaignStatus.RUNNING) {
        break;
      }

      // Fetch the next pending or queued message for this specific session in the campaign
      const nextMsg = await Message.findOne({
        campaign: campaignId,
        session: sessionId,
        status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED] },
      }).sort({ scheduled_at: 1, createdAt: 1 });

      if (!nextMsg) {
        // No more pending messages for this session
        break;
      }

      // Respect scheduled_at if set in the future
      if (nextMsg.scheduled_at) {
        const scheduledTime = new Date(nextMsg.scheduled_at).getTime();
        const now = Date.now();
        const diffMs = scheduledTime - now;

        if (diffMs > 0) {
          let campaignHalted = false;

          while (Date.now() < scheduledTime) {
            const step = Math.min(2000, scheduledTime - Date.now());
            await new Promise((resolve) => setTimeout(resolve, step));

            const checkCampaign = await BlastCampaign.findById(campaignId).select('status');
            if (!checkCampaign || checkCampaign.status !== CampaignStatus.RUNNING) {
              campaignHalted = true;
              break;
            }
          }

          if (campaignHalted) {
            break;
          }
        }
      }

      // Re-verify campaign state before sending
      const liveCampaign = await BlastCampaign.findById(campaignId);
      if (!liveCampaign || liveCampaign.status !== CampaignStatus.RUNNING) {
        break;
      }

      // Check session status and active window qualification
      const sessionDoc = await WhatsAppSession.findById(sessionId);
      const qualCheck = isSessionQualified(sessionDoc, userTimezone);

      if (!sessionDoc || !qualCheck.qualified) {
        const errorReason = qualCheck.reason || 'WhatsApp session is disconnected or unavailable';
        console.warn(`❌ Session ${sessionId} cannot send to ${nextMsg.recipient_phone}: ${errorReason}`);

        const now = new Date();
        nextMsg.status = MessageStatus.FAILED;
        nextMsg.error = errorReason;
        nextMsg.sent_at = now;
        nextMsg.wa_timestamp = now;
        await nextMsg.save();

        await BlastCampaign.findByIdAndUpdate(campaignId, {
          $inc: { 'stats.failed': 1, current_index: 1 },
        });
        continue;
      }

      // Ensure active Baileys socket is available
      let activeSession = getActiveSession(sessionDoc.session_id);
      if (!activeSession) {
        activeSession = await initWhatsAppSession(sessionDoc.session_id);
      }

      if (!activeSession?.socket) {
        const errorMsg = 'WhatsApp session socket not ready';
        console.warn(`❌ ${errorMsg} for session ${sessionDoc.session_id}`);

        const now = new Date();
        nextMsg.status = MessageStatus.FAILED;
        nextMsg.error = errorMsg;
        nextMsg.sent_at = now;
        nextMsg.wa_timestamp = now;
        await nextMsg.save();

        await BlastCampaign.findByIdAndUpdate(campaignId, {
          $inc: { 'stats.failed': 1, current_index: 1 },
        });
        continue;
      }

      // Verify recipient on WhatsApp & format phone number / JID
      const rawPhone = String(nextMsg.recipient_phone || '');
      const { jid: targetJid, exists, cleanPhone } = await verifyAndFormatJid(activeSession.socket, rawPhone);

      if (!exists) {
        const errorMsg = `Phone number ${rawPhone} is not registered on WhatsApp`;
        console.warn(`❌ ${errorMsg} for campaign "${liveCampaign.name}"`);

        const now = new Date();
        nextMsg.status = MessageStatus.FAILED;
        nextMsg.recipient_phone = cleanPhone || rawPhone;
        nextMsg.to_jid = targetJid || `${rawPhone}@s.whatsapp.net`;
        nextMsg.error = errorMsg;
        nextMsg.content = { text: 'Send Failed: Recipient not registered on WhatsApp' };
        nextMsg.sent_at = now;
        nextMsg.wa_timestamp = now;
        await nextMsg.save();

        await BlastCampaign.findByIdAndUpdate(campaignId, {
          $inc: { 'stats.failed': 1, current_index: 1 },
        });

        // Ensure subsequent message respects the required interval from this send attempt
        const subsequentMsg = await Message.findOne({
          campaign: campaignId,
          session: sessionId,
          status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED] },
        }).sort({ scheduled_at: 1, createdAt: 1 });

        if (subsequentMsg) {
          const { minMins, maxMins } = resolveCampaignInterval(liveCampaign, sessionDoc);
          const randIntervalMs = Math.floor((Math.random() * (maxMins - minMins) + minMins) * 60 * 1000);
          const earliestAllowedNextMs = now.getTime() + randIntervalMs;
          const subSchedMs = subsequentMsg.scheduled_at ? new Date(subsequentMsg.scheduled_at).getTime() : 0;

          if (subSchedMs < earliestAllowedNextMs) {
            subsequentMsg.scheduled_at = new Date(earliestAllowedNextMs);
            await subsequentMsg.save();
          }
        }
        continue;
      }

      // Resolve templates to send
      let templatesToSend: any[] = [];
      if (Array.isArray(liveCampaign.templates) && liveCampaign.templates.length > 0) {
        templatesToSend = liveCampaign.templates;
      } else if (liveCampaign.template) {
        const tplDoc = await MessageTemplate.findById(liveCampaign.template);
        if (tplDoc) templatesToSend = [tplDoc];
      }

      if (templatesToSend.length === 0) {
        console.error(`Campaign ${campaignId} has no templates to send`);
        nextMsg.status = MessageStatus.FAILED;
        nextMsg.error = 'No templates found for this campaign';
        await nextMsg.save();

        await BlastCampaign.findByIdAndUpdate(campaignId, {
          $inc: { 'stats.failed': 1, current_index: 1 },
        });
        continue;
      }

      // Send message via Baileys socket
      try {
        for (let i = 0; i < templatesToSend.length; i++) {
          const tplItem = templatesToSend[i];
          const result = await sendBaileysTemplateMessage(activeSession.socket, targetJid, tplItem, cleanPhone);

          sessionDoc.current_message_count = (sessionDoc.current_message_count || 0) + 1;
          await sessionDoc.save();

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
          nextMsg.recipient_phone = cleanPhone;
          nextMsg.to_jid = targetJid;
          nextMsg.type = tplItem.messageType || tplItem.type || 'text';
          nextMsg.status = MessageStatus.SENT;
          nextMsg.content = fullContent;
          nextMsg.message_id = result?.key?.id || '';
          nextMsg.sent_at = now;
          nextMsg.wa_timestamp = now;
          delete (nextMsg as any).error;
          await nextMsg.save();

          if (i < templatesToSend.length - 1) {
            await new Promise((res) => setTimeout(res, 1000));
          }
        }

        await BlastCampaign.findByIdAndUpdate(campaignId, {
          $inc: { 'stats.sent': 1, current_index: 1 },
        });

        console.log(`💬 Campaign "${liveCampaign.name}": Sent to ${cleanPhone} via ${sessionDoc.phone_number || sessionId}`);
      } catch (sendErr: any) {
        console.error(`❌ Error sending message to ${cleanPhone} via session ${sessionId}:`, sendErr.message || sendErr);

        const now = new Date();
        nextMsg.status = MessageStatus.FAILED;
        nextMsg.recipient_phone = cleanPhone;
        nextMsg.to_jid = targetJid;
        nextMsg.error = sendErr.message || String(sendErr);
        nextMsg.sent_at = now;
        nextMsg.wa_timestamp = now;
        await nextMsg.save();

        await BlastCampaign.findByIdAndUpdate(campaignId, {
          $inc: { 'stats.failed': 1, current_index: 1 },
        });
      }

      // Ensure subsequent message for this session strictly respects the interval from this send time
      const subsequentMsg = await Message.findOne({
        campaign: campaignId,
        session: sessionId,
        status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED] },
      }).sort({ scheduled_at: 1, createdAt: 1 });

      if (subsequentMsg) {
        const { minMins, maxMins } = resolveCampaignInterval(liveCampaign, sessionDoc);
        const randIntervalMs = Math.floor((Math.random() * (maxMins - minMins) + minMins) * 60 * 1000);
        const earliestAllowedNextMs = Date.now() + randIntervalMs;
        const subSchedMs = subsequentMsg.scheduled_at ? new Date(subsequentMsg.scheduled_at).getTime() : 0;

        if (subSchedMs < earliestAllowedNextMs) {
          subsequentMsg.scheduled_at = new Date(earliestAllowedNextMs);
          await subsequentMsg.save();
          console.log(`⏱️ Session ${sessionDoc.phone_number || sessionId}: Next message scheduled for ${subsequentMsg.recipient_phone} at ${new Date(earliestAllowedNextMs).toISOString()}`);
        }
      }
    }
  } catch (queueErr) {
    console.error(`Error processing queue for session ${sessionId} in campaign ${campaignId}:`, queueErr);
  }
}
