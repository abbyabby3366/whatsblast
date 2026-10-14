import mongoose from 'mongoose';
import { BlastCampaign, CampaignStatus } from '../models/BlastCampaign.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';
import { MessageTemplate } from '../models/MessageTemplate.js';
import { WhatsAppSession, SessionStatus } from '../models/WhatsAppSession.js';
import { getActiveSession, initWhatsAppSession, verifyAndFormatJid } from './baileysManager.js';
import { sendBaileysTemplateMessage, getFileUrl, resolveCampaignInterval, isSessionQualified, isSessionAllowed } from './blastUtils.js';

async function resolveSessionDoc(id: string) {
  if (!id) return null;
  if (mongoose.isValidObjectId(id)) {
    const doc = await WhatsAppSession.findById(id);
    if (doc) return doc;
  }
  return await WhatsAppSession.findOne({ session_id: id });
}

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

async function cascadeSessionIntervalForward(
  campaignId: string,
  sessionId: string,
  referenceTimeMs: number,
  minMins: number,
  maxMins: number,
  excludeMsgId?: any
): Promise<void> {
  const minIntervalMs = Math.max(1, minMins) * 60 * 1000;
  const subsequentPending = await Message.find({
    campaign: campaignId,
    session: sessionId,
    ...(excludeMsgId ? { _id: { $ne: excludeMsgId } } : {}),
    status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED] },
  })
    .select('_id scheduled_at')
    .sort({ scheduled_at: 1, createdAt: 1 })
    .lean();

  let prevSchedMs = referenceTimeMs;
  for (const subMsg of subsequentPending) {
    const subCurrentMs = subMsg.scheduled_at ? new Date(subMsg.scheduled_at).getTime() : 0;
    if (subCurrentMs - prevSchedMs < minIntervalMs) {
      const randMs = Math.floor((Math.random() * (maxMins - minMins) + minMins) * 60 * 1000);
      const newSchedMs = prevSchedMs + randMs;
      await Message.updateOne({ _id: subMsg._id }, { $set: { scheduled_at: new Date(newSchedMs) } });
      prevSchedMs = newSchedMs;
    } else {
      prevSchedMs = subCurrentMs;
    }
  }
}

const activeSessionWorkerLocks = new Set<string>();

export async function runSessionQueueForCampaign(
  campaignId: string,
  sessionId: string,
  userTimezone = 'Asia/Kuala_Lumpur',
  abortSignal?: AbortSignal
): Promise<void> {
  const sessionLockKey = sessionId.toString();
  if (activeSessionWorkerLocks.has(sessionLockKey)) {
    console.log(`⏳ Worker for session ${sessionId} is already active. Skipping duplicate queue runner.`);
    return;
  }
  activeSessionWorkerLocks.add(sessionLockKey);

  try {
    while (true) {
      if (abortSignal?.aborted) {
        break;
      }

      const campaign = await BlastCampaign.findById(campaignId);
      if (!campaign || campaign.status !== CampaignStatus.RUNNING) {
        break;
      }

      if (campaign.session_mode === 'SPECIFIC' && campaign.selected_sessions && campaign.selected_sessions.length > 0) {
        const currentSessDoc = await resolveSessionDoc(sessionId);
        if (currentSessDoc && !isSessionAllowed(currentSessDoc, campaign.selected_sessions)) {
          break;
        }
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

      // Enforce strict minimum interval between outbound sends for this session across all campaigns
      const intervalSessionDoc = await resolveSessionDoc(sessionId);
      if (intervalSessionDoc) {
        const { minMins, maxMins } = resolveCampaignInterval(campaign, intervalSessionDoc);
        const minIntervalMs = Math.max(1, minMins) * 60 * 1000;

        const sessionFilter = [
          { session: intervalSessionDoc._id },
          ...(intervalSessionDoc.phone_number ? [{ sender_phone: intervalSessionDoc.phone_number }] : []),
        ];

        const lastSentMsg = await Message.findOne({
          $or: sessionFilter,
          _id: { $ne: nextMsg._id },
          status: { $in: [MessageStatus.SENT, MessageStatus.DELIVERED, MessageStatus.READ] },
        }).sort({ sent_at: -1, createdAt: -1 });

        const lastSentTime = lastSentMsg?.sent_at || lastSentMsg?.createdAt;
        if (lastSentTime) {
          const lastSentMs = new Date(lastSentTime).getTime();
          const elapsedMs = Date.now() - lastSentMs;
          if (elapsedMs < minIntervalMs) {
            const randIntervalMs = Math.floor((Math.random() * (maxMins - minMins) + minMins) * 60 * 1000);
            const earliestAllowedMs = lastSentMs + randIntervalMs;
            const currentSchedMs = nextMsg.scheduled_at ? new Date(nextMsg.scheduled_at).getTime() : 0;
            if (currentSchedMs < earliestAllowedMs) {
              nextMsg.scheduled_at = new Date(earliestAllowedMs);
              await nextMsg.save();
              console.log(`⏱️ Enforcing interval for session ${intervalSessionDoc.phone_number || sessionId}: shifted next message to ${new Date(earliestAllowedMs).toISOString()}`);
            }
          }
        }

        // If nextMsg scheduled_at is in the past, update it to now so it doesn't appear expired
        if (nextMsg.scheduled_at && new Date(nextMsg.scheduled_at).getTime() < Date.now()) {
          nextMsg.scheduled_at = new Date();
          await nextMsg.save();
        }

        // Auto-heal and cascade: ensure all subsequent pending messages for this session
        // strictly maintain the configured interval from nextMsg.scheduled_at or now
        const refSchedMs = Math.max(Date.now(), nextMsg.scheduled_at ? new Date(nextMsg.scheduled_at).getTime() : Date.now());
        await cascadeSessionIntervalForward(campaignId, sessionId, refSchedMs, minMins, maxMins, nextMsg._id);
      }

      // Respect scheduled_at if set in the future
      if (nextMsg.scheduled_at) {
        const scheduledTime = new Date(nextMsg.scheduled_at).getTime();
        const now = Date.now();
        const diffMs = scheduledTime - now;

        if (diffMs > 0) {
          let campaignHalted = false;

          while (Date.now() < scheduledTime) {
            if (abortSignal?.aborted) {
              campaignHalted = true;
              break;
            }

            const step = Math.min(2000, scheduledTime - Date.now());
            await new Promise((resolve) => {
              let timer: NodeJS.Timeout | null = null;
              let onAbort: (() => void) | null = null;

              const cleanup = () => {
                if (timer) {
                  clearTimeout(timer);
                  timer = null;
                }
                if (abortSignal && onAbort) {
                  abortSignal.removeEventListener('abort', onAbort);
                  onAbort = null;
                }
              };

              onAbort = () => {
                cleanup();
                resolve(null);
              };

              if (abortSignal) {
                if (abortSignal.aborted) {
                  resolve(null);
                  return;
                }
                abortSignal.addEventListener('abort', onAbort, { once: true });
              }

              timer = setTimeout(() => {
                cleanup();
                resolve(null);
              }, step);
            });

            if (abortSignal?.aborted) {
              campaignHalted = true;
              break;
            }

            const checkCampaign = await BlastCampaign.findById(campaignId).select('status session_mode selected_sessions').lean();
            if (!checkCampaign || checkCampaign.status !== CampaignStatus.RUNNING) {
              campaignHalted = true;
              break;
            }
            if (checkCampaign.session_mode === 'SPECIFIC' && checkCampaign.selected_sessions && checkCampaign.selected_sessions.length > 0) {
              const checkSessDoc = await resolveSessionDoc(sessionId);
              if (checkSessDoc && !isSessionAllowed(checkSessDoc, checkCampaign.selected_sessions)) {
                campaignHalted = true;
                break;
              }
            }
          }

          if (campaignHalted) {
            break;
          }
        }
      }

      if (abortSignal?.aborted) {
        break;
      }

      // Re-verify campaign state before sending
      const liveCampaign = await BlastCampaign.findById(campaignId);
      if (!liveCampaign || liveCampaign.status !== CampaignStatus.RUNNING) {
        break;
      }
      if (liveCampaign.session_mode === 'SPECIFIC' && liveCampaign.selected_sessions && liveCampaign.selected_sessions.length > 0) {
        const liveSessDoc = await resolveSessionDoc(sessionId);
        if (liveSessDoc && !isSessionAllowed(liveSessDoc, liveCampaign.selected_sessions)) {
          break;
        }
      }

      // Check session status and active window qualification
      const sessionDoc = await resolveSessionDoc(sessionId);
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
            await cascadeSessionIntervalForward(campaignId, sessionId, earliestAllowedNextMs, minMins, maxMins, subsequentMsg._id);
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
          await cascadeSessionIntervalForward(campaignId, sessionId, earliestAllowedNextMs, minMins, maxMins, subsequentMsg._id);
        }
      }
    }
  } catch (queueErr) {
    console.error(`Error processing queue for session ${sessionId} in campaign ${campaignId}:`, queueErr);
  } finally {
    activeSessionWorkerLocks.delete(sessionLockKey);
  }
}
