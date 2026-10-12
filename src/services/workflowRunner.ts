import dayjs from 'dayjs';
import mongoose from 'mongoose';
import { Workflow, IWorkflow } from '../models/Workflow.js';
import { WorkflowLog } from '../models/WorkflowLog.js';
import { WhatsAppSession, SessionStatus } from '../models/WhatsAppSession.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';
import { getActiveSession, markSystemSentMessageId } from './baileysManager.js';
import { sendBaileysTemplateMessage } from './blastRunner.js';

export function parseSpintax(text: string): string {
  if (!text) return '';
  let result = text;
  const regex = /\{([^{}]+)\}/g;
  let hasMatches = true;
  let iterations = 0;

  while (hasMatches && iterations < 10) {
    iterations++;
    let replaced = false;
    result = result.replace(regex, (match, choices) => {
      if (!choices.includes('|')) return match;
      replaced = true;
      const parts = choices.split('|');
      return parts[Math.floor(Math.random() * parts.length)];
    });
    if (!replaced) break;
  }
  return result;
}

export function replaceDynamicVariables(
  text: string,
  vars: {
    sender_name?: string;
    sender_phone?: string;
    incoming_message?: string;
    date?: string;
    time?: string;
    phone?: string;
    session_id?: string;
    session_phone?: string;
  }
): string {
  let result = text || '';
  if (vars.sender_name !== undefined) {
    result = result.replace(/\{\{\s*sender_name\s*\}\}|\{\s*sender_name\s*\}/gi, vars.sender_name);
  }
  if (vars.sender_phone !== undefined) {
    result = result.replace(/\{\{\s*sender_phone\s*\}\}|\{\s*sender_phone\s*\}/gi, vars.sender_phone);
  }
  if (vars.incoming_message !== undefined) {
    result = result.replace(/\{\{\s*incoming_message\s*\}\}|\{\s*incoming_message\s*\}/gi, vars.incoming_message);
  }
  if (vars.date !== undefined) {
    result = result.replace(/\{\{\s*date\s*\}\}|\{\s*date\s*\}/gi, vars.date);
  }
  if (vars.time !== undefined) {
    result = result.replace(/\{\{\s*time\s*\}\}|\{\s*time\s*\}/gi, vars.time);
  }
  if (vars.phone !== undefined) {
    result = result.replace(/\{\{\s*phone\s*\}\}|\{\s*phone\s*\}/gi, vars.phone);
  }
  return parseSpintax(result);
}

function cleanPhoneNumber(raw: string): string {
  return String(raw || '').replace(/[^0-9]/g, '');
}

// ---------------------------------------------------------------------------
// Run lock: prevents the same workflow from running concurrently (cron + run-now)
// ---------------------------------------------------------------------------
const runningWorkflows = new Set<string>();

export class WorkflowAlreadyRunningError extends Error {
  constructor(workflowId: string) {
    super(`Workflow ${workflowId} is already running`);
    this.name = 'WorkflowAlreadyRunningError';
  }
}

export function isWorkflowRunning(workflowId: string): boolean {
  return runningWorkflows.has(String(workflowId));
}

/** Marks a workflow as running. Returns false if it was already running. */
export function tryMarkWorkflowRunning(workflowId: string): boolean {
  const id = String(workflowId);
  if (runningWorkflows.has(id)) return false;
  runningWorkflows.add(id);
  return true;
}

export function markWorkflowFinished(workflowId: string): void {
  runningWorkflows.delete(String(workflowId));
}

export function getRunningWorkflowIds(): string[] {
  return Array.from(runningWorkflows);
}

// ---------------------------------------------------------------------------
// Auto-reply loop protection
// ---------------------------------------------------------------------------
const SESSION_PHONE_CACHE_TTL_MS = 60 * 1000;
let sessionPhoneCache: { phones: Set<string>; fetchedAt: number } | null = null;
let sessionPhoneFetch: Promise<Set<string>> | null = null;

/** Set of (digits-only) phone numbers of every WhatsApp session in the system, cached ~60s. */
async function getAllSessionPhones(): Promise<Set<string>> {
  if (sessionPhoneCache && Date.now() - sessionPhoneCache.fetchedAt < SESSION_PHONE_CACHE_TTL_MS) {
    return sessionPhoneCache.phones;
  }
  if (sessionPhoneFetch) return sessionPhoneFetch;

  sessionPhoneFetch = (async () => {
    try {
      const sessions = await WhatsAppSession.find({ phone_number: { $exists: true, $ne: '' } })
        .select('phone_number')
        .lean();
      const phones = new Set<string>();
      for (const s of sessions) {
        const clean = cleanPhoneNumber((s as any).phone_number);
        if (clean) phones.add(clean);
      }
      sessionPhoneCache = { phones, fetchedAt: Date.now() };
      return phones;
    } catch (err) {
      console.error('[Workflow] Failed to load session phone numbers for loop protection:', err);
      // Fall back to stale cache (if any) rather than disabling protection entirely
      return sessionPhoneCache?.phones || new Set<string>();
    } finally {
      sessionPhoneFetch = null;
    }
  })();
  return sessionPhoneFetch;
}

const AUTOREPLY_COOLDOWN_MS = (() => {
  const raw = Number(process.env.AUTOREPLY_COOLDOWN_SEC);
  return (Number.isFinite(raw) && raw >= 0 ? raw : 300) * 1000;
})();
const AUTOREPLY_COOLDOWN_MAX_ENTRIES = 20000;
const autoReplyCooldowns = new Map<string, number>(); // key -> last reply timestamp

const PROCESSED_MSG_TTL_MS = 10 * 60 * 1000;
const PROCESSED_MSG_MAX_ENTRIES = 20000;
const processedInboundMsgIds = new Map<string, number>(); // `${sessionId}|${msgId}` -> seen at

function setBounded(map: Map<string, number>, key: string, value: number, maxEntries: number) {
  map.delete(key); // re-insert to keep Map insertion order ~ recency
  map.set(key, value);
  while (map.size > maxEntries) {
    const oldestKey = map.keys().next().value;
    if (oldestKey === undefined) break;
    map.delete(oldestKey);
  }
}

const loopProtectionPruneTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of autoReplyCooldowns) {
    if (now - ts >= AUTOREPLY_COOLDOWN_MS) autoReplyCooldowns.delete(key);
  }
  for (const [key, ts] of processedInboundMsgIds) {
    if (now - ts >= PROCESSED_MSG_TTL_MS) processedInboundMsgIds.delete(key);
  }
}, 60 * 1000);
loopProtectionPruneTimer.unref?.();

function formatMasterNotification(
  senderName: string,
  senderPhone: string,
  sessionIdentifier: string,
  messageContent: string
): string {
  const cleanPhone = cleanPhoneNumber(senderPhone);
  return `🔔 *Message Alert*\n\n*Sender:* ${senderName || cleanPhone} (${cleanPhone})\n*Recipient WhatsApp Session:* ${sessionIdentifier}\n*Contact link:* https://wa.me/${cleanPhone}\n\n*Message content:*\n${messageContent}`;
}

export async function executeWorkflowForRecipients(
  workflow: IWorkflow,
  recipients: string[],
  triggerType: 'CRON' | 'MANUAL'
): Promise<{ successCount: number; failedCount: number; errors: string[] }> {
  const errors: string[] = [];
  let successCount = 0;
  let failedCount = 0;

  if (!recipients || recipients.length === 0) {
    return { successCount: 0, failedCount: 0, errors: ['No recipients provided.'] };
  }

  // Find candidate sessions for this user
  let candidateSessions: any[] = [];
  if (workflow.action_config.session_mode === 'SPECIFIC' && (workflow.action_config.selected_sessions || []).length > 0) {
    const selected = workflow.action_config.selected_sessions || [];
    const mongoIds = selected.filter((id: string) => mongoose.Types.ObjectId.isValid(id));
    candidateSessions = await WhatsAppSession.find({
      user: workflow.user,
      $or: [
        { session_id: { $in: selected } },
        { _id: { $in: mongoIds } },
      ],
      status: SessionStatus.CONNECTED,
    });
  } else {
    candidateSessions = await WhatsAppSession.find({
      user: workflow.user,
      status: SessionStatus.CONNECTED,
    });
  }

  const activeSockets = candidateSessions
    .map((s) => ({ dbSession: s, active: getActiveSession(s.session_id) }))
    .filter((item) => Boolean(item.active?.socket));

  if (activeSockets.length === 0) {
    const errorMsg = 'No connected and working WhatsApp sessions found for this workflow.';
    for (const phone of recipients) {
      await WorkflowLog.create({
        workflow: workflow._id,
        user: workflow.user,
        trigger_type: triggerType,
        recipient_phone: phone,
        status: 'FAILED',
        error_message: errorMsg,
      });
    }
    await Workflow.findByIdAndUpdate(workflow._id, {
      $inc: { 'stats.triggered_count': 1, 'stats.failed_count': recipients.length },
      $set: { 'stats.last_run_at': new Date() },
    });
    return { successCount: 0, failedCount: recipients.length, errors: [errorMsg] };
  }

  const templates = (workflow.templates && workflow.templates.length > 0)
    ? workflow.templates
    : [{ text: 'Automated notification' }];

  const minInterval = Math.max(1, workflow.action_config.min_interval_seconds || 5);
  const maxInterval = Math.max(minInterval, workflow.action_config.max_interval_seconds || 10);

  let sessionIdx = 0;
  const wasActiveAtStart = Boolean(workflow.is_active);
  const candidateDbSessions = activeSockets.map((item) => item.dbSession);

  for (let i = 0; i < recipients.length; i++) {
    const rawPhone = recipients[i];
    const cleanPhone = cleanPhoneNumber(rawPhone);
    if (!cleanPhone) continue;

    // Stop if the workflow was deleted, or deactivated mid-run. (Manual runs of an
    // already-inactive workflow are allowed to proceed; only deletion stops them.)
    const current = await Workflow.findById(workflow._id).select('is_active').lean();
    if (!current || (wasActiveAtStart && !current.is_active)) {
      const reason = !current ? 'deleted' : 'deactivated';
      console.warn(`[Workflow] Workflow ${workflow._id} was ${reason} mid-run; stopping after ${i}/${recipients.length} recipients.`);
      errors.push(`Workflow was ${reason} during execution; stopped after ${i} of ${recipients.length} recipients.`);
      break;
    }

    // Re-resolve the socket per recipient (sockets are replaced on reconnect).
    let sock: any = null;
    let dbSession: any = null;
    for (let attempt = 0; attempt < candidateDbSessions.length; attempt++) {
      const candidate = candidateDbSessions[sessionIdx % candidateDbSessions.length];
      sessionIdx++;
      const active = getActiveSession(candidate.session_id);
      if (active?.socket) {
        sock = active.socket;
        dbSession = candidate;
        break;
      }
    }

    if (!sock || !dbSession) {
      const errorMsg = 'No connected and working WhatsApp sessions available for this recipient.';
      errors.push(`Failed for ${cleanPhone}: ${errorMsg}`);
      failedCount++;
      await WorkflowLog.create({
        workflow: workflow._id,
        user: workflow.user,
        trigger_type: triggerType,
        recipient_phone: cleanPhone,
        status: 'FAILED',
        error_message: errorMsg,
      });
      continue;
    }

    const targetJid = `${cleanPhone}@s.whatsapp.net`;

    const rawTpl = templates[i % templates.length];
    const renderedText = replaceDynamicVariables(rawTpl.text || rawTpl.template || '', {
      phone: cleanPhone,
      date: dayjs().format('YYYY-MM-DD'),
      time: dayjs().format('HH:mm:ss'),
    });

    const tplToSend = {
      ...rawTpl,
      text: renderedText,
    };

    try {
      const sendResult = await sendBaileysTemplateMessage(sock, targetJid, tplToSend, cleanPhone);
      const msgId = sendResult?.key?.id || '';
      if (msgId) markSystemSentMessageId(msgId);

      await Message.create({
        session: dbSession._id,
        message_id: msgId || `wf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        direction: MessageDirection.OUTBOUND,
        type: tplToSend.messageType || 'text',
        status: MessageStatus.SENT,
        to_jid: targetJid,
        recipient_phone: cleanPhone,
        content: { text: renderedText, raw: tplToSend },
        wa_timestamp: new Date(),
      });

      await WorkflowLog.create({
        workflow: workflow._id,
        user: workflow.user,
        trigger_type: triggerType,
        recipient_phone: cleanPhone,
        session_id: dbSession.session_id,
        status: 'SUCCESS',
        message_id: msgId,
        trigger_details: {
          schedule_expression: workflow.trigger_config.cron_expression,
        },
      });

      successCount++;
    } catch (err: any) {
      console.error(`Workflow send error to ${cleanPhone}:`, err);
      errors.push(`Failed for ${cleanPhone}: ${err.message || err}`);
      failedCount++;

      await WorkflowLog.create({
        workflow: workflow._id,
        user: workflow.user,
        trigger_type: triggerType,
        recipient_phone: cleanPhone,
        session_id: dbSession.session_id,
        status: 'FAILED',
        error_message: err.message || String(err),
      });
    }

    if (i < recipients.length - 1) {
      const waitSec = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;
      await new Promise((res) => setTimeout(res, waitSec * 1000));
    }
  }

  await Workflow.findByIdAndUpdate(workflow._id, {
    $inc: {
      'stats.triggered_count': 1,
      'stats.sent_count': successCount,
      'stats.failed_count': failedCount,
    },
    $set: { 'stats.last_run_at': new Date() },
  });

  return { successCount, failedCount, errors };
}

/**
 * Runs a workflow manually. The run lock is taken synchronously on call (before any await),
 * so callers can check isWorkflowRunning() and then call this without a race.
 * Rejects with WorkflowAlreadyRunningError if the workflow is already running.
 */
export async function executeManualWorkflow(workflowId: string, userId: string) {
  if (!tryMarkWorkflowRunning(workflowId)) throw new WorkflowAlreadyRunningError(workflowId);
  try {
    const workflow = await Workflow.findOne({ _id: workflowId, user: userId });
    if (!workflow) throw new Error('Workflow not found');

    const recipients = workflow.action_config.recipient_phones || [];
    return await executeWorkflowForRecipients(workflow, recipients, 'MANUAL');
  } finally {
    markWorkflowFinished(workflowId);
  }
}

/** Runs a cron workflow. Silently skips if the same workflow is already running. */
export async function executeCronWorkflow(workflowId: string) {
  if (!tryMarkWorkflowRunning(workflowId)) {
    console.warn(`[Workflow] Cron workflow ${workflowId} is already running; skipping.`);
    return;
  }
  try {
    const workflow = await Workflow.findById(workflowId);
    if (!workflow || !workflow.is_active || workflow.trigger_type !== 'CRON') return;

    const recipients = workflow.action_config.recipient_phones || [];
    return await executeWorkflowForRecipients(workflow, recipients, 'CRON');
  } finally {
    markWorkflowFinished(workflowId);
  }
}

export async function handleIncomingMessageWorkflow(
  sessionId: string,
  textContent: string,
  senderPhone: string,
  pushName: string,
  fromJid?: string,
  metadata?: {
    selectedId?: string;
    selectedDisplayText?: string;
    messageType?: string;
  },
  msgId?: string
) {
  try {
    // (c) Dedupe: the same inbound message (e.g. re-delivered on reconnect) is only processed once.
    if (msgId) {
      const dedupeKey = `${sessionId}|${msgId}`;
      const seenAt = processedInboundMsgIds.get(dedupeKey);
      if (seenAt !== undefined && Date.now() - seenAt < PROCESSED_MSG_TTL_MS) return;
      setBounded(processedInboundMsgIds, dedupeKey, Date.now(), PROCESSED_MSG_MAX_ENTRIES);
    }

    const cleanSender = cleanPhoneNumber(senderPhone);
    if (!cleanSender) return;

    // (a) Never auto-reply to another WhatsApp session managed by this system
    // (e.g. cross-chat warmup partners) — that creates infinite reply loops.
    const sessionPhones = await getAllSessionPhones();
    if (sessionPhones.has(cleanSender)) return;

    const waSession = await WhatsAppSession.findOne({ session_id: sessionId });
    if (!waSession || !waSession.user) return;
    if (cleanPhoneNumber(waSession.phone_number || '') === cleanSender) return;

    // Find all active REPLY workflows for this user
    const replyWorkflows = await Workflow.find({
      user: waSession.user,
      trigger_type: 'REPLY',
      is_active: true,
    });

    if (!replyWorkflows || replyWorkflows.length === 0) return;

    const normalizedMsg = (textContent || '').trim();

    for (const workflow of replyWorkflows) {
      const triggerCfg = workflow.trigger_config || {};

      // Check session scope
      if (
        triggerCfg.reply_session_mode === 'SPECIFIC' &&
        triggerCfg.reply_selected_sessions &&
        triggerCfg.reply_selected_sessions.length > 0 &&
        !triggerCfg.reply_selected_sessions.includes(sessionId) &&
        !triggerCfg.reply_selected_sessions.includes(String(waSession._id))
      ) {
        continue;
      }

      // Check match type
      const matchType = triggerCfg.match_type || 'all';
      const keywords = (triggerCfg.keywords || []).map((k) => k.trim()).filter(Boolean);
      const isCaseSensitive = Boolean(triggerCfg.case_sensitive);

      let isMatched = false;
      let matchedKeyword = '';

      if (matchType === 'all') {
        isMatched = true;
      } else if (keywords.length === 0) {
        isMatched = true;
      } else {
        const candidates = Array.from(new Set([
          normalizedMsg,
          (metadata?.selectedDisplayText || '').trim(),
          (metadata?.selectedId || '').trim(),
        ])).filter(Boolean);

        for (const candidate of candidates) {
          const testText = isCaseSensitive ? candidate : candidate.toLowerCase();

          for (const kw of keywords) {
            const testKw = isCaseSensitive ? kw : kw.toLowerCase();
            if (matchType === 'contains' && testText.includes(testKw)) {
              isMatched = true;
              matchedKeyword = kw;
              break;
            }
            if (matchType === 'exact' && testText === testKw) {
              isMatched = true;
              matchedKeyword = kw;
              break;
            }
            if (matchType === 'starts_with' && testText.startsWith(testKw)) {
              isMatched = true;
              matchedKeyword = kw;
              break;
            }
          }
          if (isMatched) break;
        }
      }

      if (!isMatched) continue;

      const triggerDetails = {
        incoming_text: textContent,
        matched_keyword: matchedKeyword,
        selected_id: metadata?.selectedId,
        selected_display_text: metadata?.selectedDisplayText,
        sender_name: pushName,
        sender_phone: cleanSender,
      };

      // Filter out rapid auto-replies received within 15 seconds of an outbound message
      if (triggerCfg.filter_rapid_autoreplies) {
        const fifteenSecAgo = new Date(Date.now() - 15 * 1000);
        const recentOutbound = await Message.findOne({
          session: waSession._id,
          recipient_phone: cleanSender,
          direction: MessageDirection.OUTBOUND,
          createdAt: { $gte: fifteenSecAgo },
        });

        if (recentOutbound) {
          console.log(`[Workflow] Filtered out rapid auto-reply from ${cleanSender} (<15s after outbound message).`);
          await WorkflowLog.create({
            workflow: workflow._id,
            user: waSession.user,
            trigger_type: 'REPLY',
            recipient_phone: cleanSender,
            session_id: sessionId,
            status: 'SKIPPED',
            error_message: 'Ignored: Received within 15 seconds of outbound blast/message (auto-responder filter).',
            trigger_details: triggerDetails,
          });
          continue;
        }
      }

      // (b) Per (session, sender, workflow, inbound text/button) cooldown on replies to the
      // sender — breaks ping-pong loops with auto-responders/bots (which repeat the same
      // message) while still answering a customer who asks something different.
      const inboundKey = String(metadata?.selectedId || textContent || '').trim().toLowerCase().slice(0, 200);
      const cooldownKey = `${sessionId}|${cleanSender}|${String(workflow._id)}|${inboundKey}`;
      const lastReplyAt = autoReplyCooldowns.get(cooldownKey);
      const senderOnCooldown = AUTOREPLY_COOLDOWN_MS > 0 &&
        lastReplyAt !== undefined &&
        Date.now() - lastReplyAt < AUTOREPLY_COOLDOWN_MS;
      if (senderOnCooldown) {
        const cfgTarget = workflow.action_config.reply_target || 'SENDER';
        const hasMasters = (workflow.action_config.master_phones || []).map(cleanPhoneNumber).some(Boolean);
        const wouldAlertMaster = (cfgTarget === 'MASTER_PHONE' || cfgTarget === 'BOTH') && hasMasters;
        if (!wouldAlertMaster) {
          console.log(`[Workflow] Auto-reply cooldown active for ${cleanSender} on session ${sessionId} (workflow ${workflow._id}); skipping.`);
          await WorkflowLog.create({
            workflow: workflow._id,
            user: waSession.user,
            trigger_type: 'REPLY',
            recipient_phone: cleanSender,
            session_id: sessionId,
            status: 'SKIPPED',
            error_message: `Ignored: already auto-replied to this same message from this sender within the last ${Math.round(AUTOREPLY_COOLDOWN_MS / 1000)}s (loop protection).`,
            trigger_details: triggerDetails,
          });
          continue;
        }
      }

      // Reserve the cooldown slot now (before any await) so concurrent inbound messages
      // from the same sender don't both reply. Released again if the reply isn't sent.
      const replyTargetCfg = workflow.action_config.reply_target || 'SENDER';
      const willReplyToSender = !senderOnCooldown && (replyTargetCfg === 'SENDER' || replyTargetCfg === 'BOTH');
      if (willReplyToSender && AUTOREPLY_COOLDOWN_MS > 0) {
        setBounded(autoReplyCooldowns, cooldownKey, Date.now(), AUTOREPLY_COOLDOWN_MAX_ENTRIES);
      }

      // Match found! Resolve session to send reply from
      let targetSessionId = sessionId;
      if (workflow.action_config.reply_session_id) {
        const replyId = workflow.action_config.reply_session_id;
        const customSession = await WhatsAppSession.findOne({
          $or: [
            { session_id: replyId },
            ...(mongoose.Types.ObjectId.isValid(replyId) ? [{ _id: replyId }] : []),
          ],
          user: waSession.user,
          status: SessionStatus.CONNECTED,
        });
        if (customSession) targetSessionId = customSession.session_id;
      }

      const activeSockPair = getActiveSession(targetSessionId) || getActiveSession(sessionId);
      if (!activeSockPair?.socket) {
        console.warn(`[Workflow] No active socket for session ${targetSessionId} on reply workflow ${workflow._id}`);
        if (willReplyToSender) autoReplyCooldowns.delete(cooldownKey);
        await WorkflowLog.create({
          workflow: workflow._id,
          user: waSession.user,
          trigger_type: 'REPLY',
          recipient_phone: cleanSender,
          status: 'FAILED',
          error_message: `WhatsApp session ${targetSessionId} is not connected.`,
          trigger_details: triggerDetails,
        });
        continue;
      }

      const sock = activeSockPair.socket;
      const templates = (workflow.templates && workflow.templates.length > 0)
        ? workflow.templates
        : [{ text: 'Thank you for your message! We will get back to you shortly.' }];

      const chosenTpl = templates[Math.floor(Math.random() * templates.length)];
      const renderedText = replaceDynamicVariables(chosenTpl.text || chosenTpl.template || '', {
        sender_name: pushName || cleanSender,
        sender_phone: cleanSender,
        incoming_message: textContent,
        phone: cleanSender,
        date: dayjs().format('YYYY-MM-DD'),
        time: dayjs().format('HH:mm:ss'),
      });

      const replyTarget = workflow.action_config.reply_target || 'SENDER';
      const sendToSender = replyTarget === 'SENDER' || replyTarget === 'BOTH';
      const sendToMaster = replyTarget === 'MASTER_PHONE' || replyTarget === 'BOTH';
      const masterPhones = (workflow.action_config.master_phones || []).map(cleanPhoneNumber).filter(Boolean);

      let sentCount = 0;
      let failCount = 0;

      // 1. Reply to sender
      if (sendToSender && !senderOnCooldown) {
        const senderJid = (fromJid && fromJid.includes('@')) ? fromJid : `${cleanSender}@s.whatsapp.net`;
        const senderTpl = { ...chosenTpl, text: renderedText };

        try {
          const sendRes = await sendBaileysTemplateMessage(sock, senderJid, senderTpl, cleanSender);
          const msgId = sendRes?.key?.id || '';
          if (msgId) markSystemSentMessageId(msgId);

          await Message.create({
            session: waSession._id,
            message_id: msgId || `reply_${Date.now()}`,
            direction: MessageDirection.OUTBOUND,
            type: chosenTpl.messageType || 'text',
            status: MessageStatus.SENT,
            to_jid: senderJid,
            recipient_phone: cleanSender,
            content: { text: renderedText, raw: senderTpl },
            wa_timestamp: new Date(),
          });

          await WorkflowLog.create({
            workflow: workflow._id,
            user: waSession.user,
            trigger_type: 'REPLY',
            recipient_phone: cleanSender,
            session_id: targetSessionId,
            status: 'SUCCESS',
            message_id: msgId,
            trigger_details: triggerDetails,
          });
          sentCount++;
        } catch (err: any) {
          console.error(`[Workflow] Failed replying to sender ${cleanSender}:`, err);
          autoReplyCooldowns.delete(cooldownKey); // allow a retry on the next inbound message
          failCount++;
          await WorkflowLog.create({
            workflow: workflow._id,
            user: waSession.user,
            trigger_type: 'REPLY',
            recipient_phone: cleanSender,
            session_id: targetSessionId,
            status: 'FAILED',
            error_message: err.message || String(err),
            trigger_details: triggerDetails,
          });
        }
      }

      // 2. Send to Master Phone(s)
      if (sendToMaster && masterPhones.length > 0) {
        const sessionIdentifier = waSession.alias
          ? `${waSession.alias} (${waSession.phone_number || waSession.session_id})`
          : (waSession.phone_number || waSession.session_id);
        const masterFormattedText = formatMasterNotification(
          pushName,
          cleanSender,
          sessionIdentifier,
          textContent
        );

        for (const masterPhone of masterPhones) {
          const masterJid = `${masterPhone}@s.whatsapp.net`;
          const masterTpl = {
            ...chosenTpl,
            text: masterFormattedText,
          };

          try {
            const sendRes = await sendBaileysTemplateMessage(sock, masterJid, masterTpl, masterPhone);
            const msgId = sendRes?.key?.id || '';
            if (msgId) markSystemSentMessageId(msgId);

            await Message.create({
              session: waSession._id,
              message_id: msgId || `master_${Date.now()}`,
              direction: MessageDirection.OUTBOUND,
              type: masterTpl.messageType || 'text',
              status: MessageStatus.SENT,
              to_jid: masterJid,
              recipient_phone: masterPhone,
              content: { text: masterFormattedText, raw: masterTpl },
              wa_timestamp: new Date(),
            });

            await WorkflowLog.create({
              workflow: workflow._id,
              user: waSession.user,
              trigger_type: 'REPLY',
              recipient_phone: `Master: ${masterPhone}`,
              session_id: targetSessionId,
              status: 'SUCCESS',
              message_id: msgId,
              trigger_details: triggerDetails,
            });
            sentCount++;
          } catch (err: any) {
            console.error(`[Workflow] Failed sending alert to Master ${masterPhone}:`, err);
            failCount++;
            await WorkflowLog.create({
              workflow: workflow._id,
              user: waSession.user,
              trigger_type: 'REPLY',
              recipient_phone: `Master: ${masterPhone}`,
              session_id: targetSessionId,
              status: 'FAILED',
              error_message: err.message || String(err),
              trigger_details: triggerDetails,
            });
          }
        }
      }

      await Workflow.findByIdAndUpdate(workflow._id, {
        $inc: {
          'stats.triggered_count': 1,
          'stats.sent_count': sentCount,
          'stats.failed_count': failCount,
        },
        $set: { 'stats.last_run_at': new Date() },
      });
    }
  } catch (err) {
    console.error('Error in handleIncomingMessageWorkflow:', err);
  }
}
