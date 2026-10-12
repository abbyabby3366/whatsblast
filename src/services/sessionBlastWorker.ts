import mongoose from 'mongoose';
import { BlastCampaign, CampaignStatus } from '../models/BlastCampaign.js';
import { Message, MessageStatus } from '../models/Message.js';
import { MessageTemplate } from '../models/MessageTemplate.js';
import { WhatsAppSession } from '../models/WhatsAppSession.js';
import { getActiveSession, initWhatsAppSession, verifyAndFormatJid } from './baileysManager.js';
import { sendBaileysTemplateMessage, getFileUrl, resolveCampaignInterval, isSessionQualified, isSessionAllowed } from './blastUtils.js';
import { normalizePhoneNumber } from './campaignRecipientSyncService.js';

const UNSENT_STATUSES = [MessageStatus.PENDING, MessageStatus.QUEUED];

/**
 * Message ids this process has claimed (status SENDING) and is sending right now.
 * The stale-SENDING heal in blastRunner skips these.
 */
const inFlightMessageIds = new Set<string>();

export function getInFlightMessageIds(): Set<string> {
  return inFlightMessageIds;
}

/**
 * Why a session worker stopped:
 *   drained  - no more pending messages for this session
 *   halted   - campaign stopped/aborted or session no longer allowed
 *   locked   - another campaign's worker currently owns this WhatsApp number
 *   deferred - session can't send right now (disconnected / socket not ready / outside window)
 *   error    - unexpected error
 */
export type SessionWorkerOutcome = 'drained' | 'halted' | 'locked' | 'deferred' | 'error';

export interface SessionWorkerResult {
  outcome: SessionWorkerOutcome;
  /** Messages this run finished (sent or failed). 0 means no progress was made. */
  processed: number;
}

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
    // SENDING is intentionally not counted: when this runs all of the campaign's
    // workers have finished, so a SENDING row is a stuck claim (healed separately)
    // and must not keep the campaign RUNNING forever.
    const pendingCount = await Message.countDocuments({
      campaign: campaignId,
      status: { $in: UNSENT_STATUSES },
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
    status: { $in: UNSENT_STATUSES },
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
      await Message.updateOne(
        { _id: subMsg._id, status: { $in: UNSENT_STATUSES } },
        { $set: { scheduled_at: new Date(newSchedMs) } }
      );
      prevSchedMs = newSchedMs;
    } else {
      prevSchedMs = subCurrentMs;
    }
  }
}

/** Pushes the session's next pending message out so it respects the interval from `fromMs`. */
async function scheduleNextAfterSend(
  campaignId: string,
  sessionId: string,
  campaign: any,
  sessionDoc: any,
  fromMs: number
): Promise<void> {
  const subsequentMsg = await Message.findOne({
    campaign: campaignId,
    session: sessionId,
    status: { $in: UNSENT_STATUSES },
  })
    .select('_id scheduled_at recipient_phone')
    .sort({ scheduled_at: 1, createdAt: 1 })
    .lean();

  if (!subsequentMsg) return;

  const { minMins, maxMins } = resolveCampaignInterval(campaign, sessionDoc);
  const randIntervalMs = Math.floor((Math.random() * (maxMins - minMins) + minMins) * 60 * 1000);
  const earliestAllowedNextMs = fromMs + randIntervalMs;
  const subSchedMs = subsequentMsg.scheduled_at ? new Date(subsequentMsg.scheduled_at).getTime() : 0;

  if (subSchedMs < earliestAllowedNextMs) {
    await Message.updateOne(
      { _id: subsequentMsg._id, status: { $in: UNSENT_STATUSES } },
      { $set: { scheduled_at: new Date(earliestAllowedNextMs) } }
    );
    console.log(`⏱️ Session ${sessionDoc?.phone_number || sessionId}: Next message scheduled for ${subsequentMsg.recipient_phone} at ${new Date(earliestAllowedNextMs).toISOString()}`);
    await cascadeSessionIntervalForward(campaignId, sessionId, earliestAllowedNextMs, minMins, maxMins, subsequentMsg._id);
  }
}

// One sender per WhatsApp number at a time (ban safety), across all campaigns.
const activeSessionWorkerLocks = new Set<string>();

export async function runSessionQueueForCampaign(
  campaignId: string,
  sessionId: string,
  userTimezone = 'Asia/Kuala_Lumpur',
  abortSignal?: AbortSignal
): Promise<SessionWorkerResult> {
  const sessionLockKey = sessionId.toString();
  if (activeSessionWorkerLocks.has(sessionLockKey)) {
    return { outcome: 'locked', processed: 0 };
  }
  activeSessionWorkerLocks.add(sessionLockKey);

  let processed = 0;

  try {
    while (true) {
      if (abortSignal?.aborted) {
        return { outcome: 'halted', processed };
      }

      const campaign = await BlastCampaign.findById(campaignId).select('-processed_phones');
      if (!campaign || campaign.status !== CampaignStatus.RUNNING) {
        return { outcome: 'halted', processed };
      }

      if (campaign.session_mode === 'SPECIFIC' && campaign.selected_sessions && campaign.selected_sessions.length > 0) {
        const currentSessDoc = await resolveSessionDoc(sessionId);
        if (currentSessDoc && !isSessionAllowed(currentSessDoc, campaign.selected_sessions)) {
          return { outcome: 'halted', processed };
        }
      }

      // Fetch the next pending or queued message for this specific session in the campaign.
      // NOTE: this is only a candidate — it is atomically claimed right before sending,
      // because other paths may reassign/reschedule it while we wait for its slot.
      const nextMsg = await Message.findOne({
        campaign: campaignId,
        session: sessionId,
        status: { $in: UNSENT_STATUSES },
      })
        .select('_id session scheduled_at recipient_phone templates_sent')
        .sort({ scheduled_at: 1, createdAt: 1 })
        .lean();

      if (!nextMsg) {
        // No more pending messages for this session
        return { outcome: 'drained', processed };
      }

      let nextScheduledMs = nextMsg.scheduled_at ? new Date(nextMsg.scheduled_at).getTime() : 0;

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
        })
          .select('sent_at createdAt')
          .sort({ sent_at: -1, createdAt: -1 })
          .lean();

        const lastSentTime = lastSentMsg?.sent_at || lastSentMsg?.createdAt;
        if (lastSentTime) {
          const lastSentMs = new Date(lastSentTime).getTime();
          const elapsedMs = Date.now() - lastSentMs;
          if (elapsedMs < minIntervalMs) {
            const randIntervalMs = Math.floor((Math.random() * (maxMins - minMins) + minMins) * 60 * 1000);
            const earliestAllowedMs = lastSentMs + randIntervalMs;
            if (nextScheduledMs < earliestAllowedMs) {
              nextScheduledMs = earliestAllowedMs;
              console.log(`⏱️ Enforcing interval for session ${intervalSessionDoc.phone_number || sessionId}: shifted next message to ${new Date(earliestAllowedMs).toISOString()}`);
            }
          }
        }

        // If scheduled_at is in the past, update it to now so it doesn't appear expired
        if (nextScheduledMs && nextScheduledMs < Date.now()) {
          nextScheduledMs = Date.now();
        }

        const origSchedMs = nextMsg.scheduled_at ? new Date(nextMsg.scheduled_at).getTime() : 0;
        if (nextScheduledMs && nextScheduledMs !== origSchedMs) {
          await Message.updateOne(
            { _id: nextMsg._id, session: sessionId, status: { $in: UNSENT_STATUSES } },
            { $set: { scheduled_at: new Date(nextScheduledMs) } }
          );
        }

        // Auto-heal and cascade: ensure all subsequent pending messages for this session
        // strictly maintain the configured interval from nextMsg.scheduled_at or now
        const refSchedMs = Math.max(Date.now(), nextScheduledMs || Date.now());
        await cascadeSessionIntervalForward(campaignId, sessionId, refSchedMs, minMins, maxMins, nextMsg._id);
      }

      // Respect scheduled_at if set in the future
      if (nextScheduledMs) {
        const scheduledTime = nextScheduledMs;
        const diffMs = scheduledTime - Date.now();

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
            return { outcome: 'halted', processed };
          }
        }
      }

      if (abortSignal?.aborted) {
        return { outcome: 'halted', processed };
      }

      // Re-verify campaign state before sending
      const liveCampaign = await BlastCampaign.findById(campaignId).select('-processed_phones');
      if (!liveCampaign || liveCampaign.status !== CampaignStatus.RUNNING) {
        return { outcome: 'halted', processed };
      }
      if (liveCampaign.session_mode === 'SPECIFIC' && liveCampaign.selected_sessions && liveCampaign.selected_sessions.length > 0) {
        const liveSessDoc = await resolveSessionDoc(sessionId);
        if (liveSessDoc && !isSessionAllowed(liveSessDoc, liveCampaign.selected_sessions)) {
          return { outcome: 'halted', processed };
        }
      }

      // Check session status and active window qualification.
      // A session that can't send right now is NOT a failed message: leave it PENDING
      // and stop this worker; the runner backs off and retries later.
      const sessionDoc = await resolveSessionDoc(sessionId);
      const qualCheck = isSessionQualified(sessionDoc, userTimezone);

      if (!sessionDoc || !qualCheck.qualified) {
        const reason = qualCheck.reason || 'WhatsApp session is disconnected or unavailable';
        console.warn(`⏸️ Session ${sessionId} cannot send to ${nextMsg.recipient_phone} right now (${reason}); leaving it pending.`);
        return { outcome: 'deferred', processed };
      }

      // Ensure active Baileys socket is available
      let activeSession = getActiveSession(sessionDoc.session_id);
      if (!activeSession) {
        activeSession = await initWhatsAppSession(sessionDoc.session_id);
      }

      if (!activeSession?.socket) {
        console.warn(`⏸️ WhatsApp session socket not ready for session ${sessionDoc.session_id}; leaving message pending.`);
        return { outcome: 'deferred', processed };
      }

      // Resolve templates to send
      let templatesToSend: any[] = [];
      if (Array.isArray(liveCampaign.templates) && liveCampaign.templates.length > 0) {
        templatesToSend = liveCampaign.templates;
      } else if (liveCampaign.template) {
        const tplDoc = await MessageTemplate.findById(liveCampaign.template);
        if (tplDoc) templatesToSend = [tplDoc];
      }

      // Atomically claim the message. If another path reassigned, rescheduled,
      // deleted or already claimed it while we were waiting, skip it.
      const claimed = await Message.findOneAndUpdate(
        { _id: nextMsg._id, session: sessionId, status: { $in: UNSENT_STATUSES } },
        { $set: { status: MessageStatus.SENDING } },
        { new: true }
      );
      if (!claimed) {
        console.log(`↪️ Message ${nextMsg._id} for ${nextMsg.recipient_phone} was moved or claimed elsewhere; skipping.`);
        continue;
      }

      const claimedId = claimed._id.toString();
      inFlightMessageIds.add(claimedId);
      try {
        const outcome = await sendClaimedMessage(claimed, liveCampaign, sessionDoc, activeSession.socket, templatesToSend);
        processed++;
        await scheduleNextAfterSend(campaignId, sessionId, liveCampaign, sessionDoc, outcome.attemptedAtMs);
      } finally {
        inFlightMessageIds.delete(claimedId);
      }
    }
  } catch (queueErr) {
    console.error(`Error processing queue for session ${sessionId} in campaign ${campaignId}:`, queueErr);
    return { outcome: 'error', processed };
  } finally {
    activeSessionWorkerLocks.delete(sessionLockKey);
  }
}

async function markClaimedFailed(msgId: any, campaignId: any, fields: Record<string, any>): Promise<void> {
  const now = new Date();
  await Message.updateOne(
    { _id: msgId },
    { $set: { status: MessageStatus.FAILED, sent_at: now, wa_timestamp: now, ...fields } }
  );
  await BlastCampaign.findByIdAndUpdate(campaignId, {
    $inc: { 'stats.failed': 1, current_index: 1 },
  });
}

/**
 * Sends a message this worker has claimed (status SENDING). Always moves it to a
 * terminal state: SENT only after every template went out, FAILED otherwise.
 */
async function sendClaimedMessage(
  msg: any,
  campaign: any,
  sessionDoc: any,
  socket: any,
  templatesToSend: any[]
): Promise<{ attemptedAtMs: number }> {
  const campaignId = campaign._id;

  if (templatesToSend.length === 0) {
    console.error(`Campaign ${campaignId} has no templates to send`);
    await markClaimedFailed(msg._id, campaignId, { error: 'No templates found for this campaign' });
    return { attemptedAtMs: Date.now() };
  }

  // Verify recipient on WhatsApp & format phone number / JID
  const rawPhone = String(msg.recipient_phone || '');
  let targetJid: string;
  let cleanPhone: string;
  try {
    const verified = await verifyAndFormatJid(socket, rawPhone);
    targetJid = verified.jid;
    cleanPhone = verified.cleanPhone;

    if (!verified.exists) {
      const errorMsg = `Phone number ${rawPhone} is not registered on WhatsApp`;
      console.warn(`❌ ${errorMsg} for campaign "${campaign.name}"`);
      await markClaimedFailed(msg._id, campaignId, {
        recipient_phone: cleanPhone || rawPhone,
        to_jid: targetJid || `${rawPhone}@s.whatsapp.net`,
        error: errorMsg,
        content: { text: 'Send Failed: Recipient not registered on WhatsApp' },
      });
      return { attemptedAtMs: Date.now() };
    }
  } catch (verifyErr: any) {
    // Nothing was sent yet, so it is safe to hand the message back to the queue.
    console.warn(`⏸️ Could not verify ${rawPhone} via session ${sessionDoc.session_id}:`, verifyErr?.message || verifyErr);
    await Message.updateOne({ _id: msg._id, status: MessageStatus.SENDING }, { $set: { status: MessageStatus.PENDING } });
    throw verifyErr;
  }

  // Resume after the templates already delivered by a previous, partially failed attempt.
  const startIdx = Math.max(0, Math.min(Number(msg.templates_sent) || 0, templatesToSend.length));
  let firstMessageId: string | null = null;
  let lastTpl: any = null;
  let lastContent: any = null;

  try {
    for (let i = startIdx; i < templatesToSend.length; i++) {
      const tplItem = templatesToSend[i];
      const result = await sendBaileysTemplateMessage(socket, targetJid, tplItem, cleanPhone);
      if (!firstMessageId) firstMessageId = result?.key?.id || null;

      // Record per-template progress (no message_id yet: that marks the message as fully sent).
      await Message.updateOne({ _id: msg._id }, { $set: { templates_sent: i + 1 } }).catch((err) =>
        console.error(`Failed to record template progress for message ${msg._id}:`, err)
      );

      sessionDoc.current_message_count = (sessionDoc.current_message_count || 0) + 1;
      await sessionDoc.save().catch((err: any) => console.error(`Failed to update session message count:`, err));

      lastTpl = tplItem;

      if (i < templatesToSend.length - 1) {
        await new Promise((res) => setTimeout(res, 1000));
      }
    }
  } catch (sendErr: any) {
    console.error(`❌ Error sending message to ${cleanPhone} via session ${sessionDoc.session_id}:`, sendErr.message || sendErr);
    await markClaimedFailed(msg._id, campaignId, {
      recipient_phone: cleanPhone,
      to_jid: targetJid,
      error: sendErr.message || String(sendErr),
    });
    return { attemptedAtMs: Date.now() };
  }

  // Everything went out: persist SENT + message_id once, then record the recipient durably.
  try {
    if (lastTpl) {
      const fileId = lastTpl.file_id || lastTpl.fileId || lastTpl.file;
      const buttonMediaId = lastTpl.button_image_id || lastTpl.buttonImageId || lastTpl.button_image;
      const mainMedia = await getFileUrl(fileId);
      const buttonMedia = await getFileUrl(buttonMediaId);
      const activeMedia = buttonMedia?.url ? buttonMedia : mainMedia;

      const rawFooter = lastTpl.footer ?? lastTpl.footer_text ?? (typeof lastTpl.content === 'object' ? lastTpl.content?.footer ?? lastTpl.content?.footer_text : null);
      const itemFooter = rawFooter !== undefined && rawFooter !== null ? String(rawFooter).trim() : '';

      lastContent = {
        text: lastTpl.text || lastTpl.template || '',
        buttons: lastTpl.buttons || [],
        footer: itemFooter,
        title: lastTpl.title || '',
        subtitle: lastTpl.subtitle || '',
        file: activeMedia?.url || mainMedia?.url || null,
        file_type: activeMedia?.type || lastTpl.messageType || lastTpl.type || 'text',
        file_name: activeMedia?.filename || null,
        button_image: buttonMedia?.url || null,
      };
    }
  } catch (contentErr) {
    console.error(`Failed to build content snapshot for message ${msg._id}:`, contentErr);
  }

  const now = new Date();
  const sentSet: Record<string, any> = {
    status: MessageStatus.SENT,
    recipient_phone: cleanPhone,
    to_jid: targetJid,
    sent_at: now,
    wa_timestamp: now,
    templates_sent: templatesToSend.length,
  };
  if (firstMessageId) sentSet.message_id = firstMessageId;
  if (lastTpl) sentSet.type = lastTpl.messageType || lastTpl.type || 'text';
  if (lastContent) sentSet.content = lastContent;

  await Message.updateOne({ _id: msg._id }, { $set: sentSet, $unset: { error: 1 } });

  const processedPhone = normalizePhoneNumber(cleanPhone || rawPhone);
  await BlastCampaign.findByIdAndUpdate(campaignId, {
    $inc: { 'stats.sent': 1, current_index: 1 },
    ...(processedPhone ? { $addToSet: { processed_phones: processedPhone } } : {}),
  });

  console.log(`💬 Campaign "${campaign.name}": Sent to ${cleanPhone} via ${sessionDoc.phone_number || sessionDoc.session_id}`);
  return { attemptedAtMs: now.getTime() };
}
