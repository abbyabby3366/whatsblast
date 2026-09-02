import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware.js';
import { BlastCampaign, CampaignStatus } from '../models/BlastCampaign.js';
import { MessageTemplate } from '../models/MessageTemplate.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';
import { WhatsAppSession, SessionStatus } from '../models/WhatsAppSession.js';
import { FileModel } from '../models/File.js';
import { pickUserSession, getActiveSession, initWhatsAppSession } from '../services/baileysManager.js';
import { sendBaileysTemplateMessage, getFileUrl } from '../services/blastRunner.js';

const router = Router();

router.use(authenticateToken);

export async function computeCampaignsStats(campaignIds: any[]): Promise<Map<string, { total?: number; sent: number; failed: number; pending: number }>> {
  if (!campaignIds || campaignIds.length === 0) return new Map();
  const objectIds = campaignIds.map((id) => (typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id));
  const msgStats = await Message.aggregate([
    { $match: { campaign: { $in: objectIds } } },
    { $group: { _id: { campaign: '$campaign', status: '$status' }, count: { $sum: 1 } } },
  ]);

  const statsMap = new Map<string, { sent: number; failed: number; pending: number }>();
  for (const s of msgStats) {
    const cId = s._id.campaign?.toString();
    if (!cId) continue;
    if (!statsMap.has(cId)) {
      statsMap.set(cId, { sent: 0, failed: 0, pending: 0 });
    }
    const entry = statsMap.get(cId)!;
    const st = String(s._id.status || '').toLowerCase();
    if (st === 'sent' || st === 'delivered' || st === 'read') {
      entry.sent += s.count;
    } else if (st === 'failed' || st === 'error') {
      entry.failed += s.count;
    } else if (st === 'pending' || st === 'queued' || st === 'expired') {
      entry.pending += s.count;
    }
  }
  return statsMap;
}

async function formatCampaign(c: any, overrideStats?: any) {
  const obj = c.toObject ? c.toObject() : c;
  const { _id, __v, ...rest } = obj;

  if (Array.isArray(rest.templates) && rest.templates.length > 0) {
    const fileIdsToFetch = new Set<string>();
    rest.templates.forEach((tpl: any) => {
      const fId = tpl.file_id || tpl.fileId || (typeof tpl.file === 'string' ? tpl.file : undefined);
      const bId = tpl.button_image_id || tpl.buttonImageId || (typeof tpl.button_image === 'string' ? tpl.button_image : undefined);
      if (typeof fId === 'string' && fId.match(/^[0-9a-fA-F]{24}$/)) fileIdsToFetch.add(fId);
      if (typeof bId === 'string' && bId.match(/^[0-9a-fA-F]{24}$/)) fileIdsToFetch.add(bId);
      const fIds = tpl.file_ids || tpl.fileIds;
      if (Array.isArray(fIds)) {
        fIds.forEach((id: any) => {
          const sId = typeof id === 'string' ? id : id?.id || id?._id;
          if (typeof sId === 'string' && sId.match(/^[0-9a-fA-F]{24}$/)) fileIdsToFetch.add(sId);
        });
      }
    });

    if (fileIdsToFetch.size > 0) {
      const filesMap = new Map<string, any>();
      try {
        const fileDocs = await FileModel.find({ _id: { $in: Array.from(fileIdsToFetch) } });
        fileDocs.forEach((fDoc) => {
          filesMap.set(fDoc._id.toString(), {
            id: fDoc._id.toString(),
            file_name: fDoc.file_name,
            file_type: fDoc.file_type,
            file_path: fDoc.file_path,
            file_url: fDoc.file_path,
          });
        });
      } catch (_) {}

      rest.templates = rest.templates.map((tpl: any) => {
        const fId = tpl.file_id || tpl.fileId || (typeof tpl.file === 'string' ? tpl.file : undefined);
        const bId = tpl.button_image_id || tpl.buttonImageId || (typeof tpl.button_image === 'string' ? tpl.button_image : undefined);
        const fObj = typeof fId === 'string' ? filesMap.get(fId) : tpl.file;
        const bObj = typeof bId === 'string' ? filesMap.get(bId) : tpl.button_image;
        const fIds = tpl.file_ids || tpl.fileIds;
        const resolvedFilesList = Array.isArray(fIds) && fIds.length > 0
          ? fIds.map((id: any) => {
              const sId = typeof id === 'string' ? id : id?.id || id?._id;
              return filesMap.get(sId) || (typeof id === 'object' ? id : { id: sId });
            }).filter(Boolean)
          : (fObj ? [fObj] : []);

        return {
          ...tpl,
          file: fObj || (typeof tpl.file === 'object' ? tpl.file : undefined),
          file_url: tpl.file_url || fObj?.file_url || fObj?.file_path,
          files: resolvedFilesList,
          button_image: bObj || (typeof tpl.button_image === 'object' ? tpl.button_image : undefined),
        };
      });
    }
  }

  let formattedUser = rest.user;
  if (formattedUser && typeof formattedUser === 'object') {
    const uId = formattedUser._id ? formattedUser._id.toString() : formattedUser.id;
    formattedUser = {
      id: uId,
      _id: uId,
      phone_number: formattedUser.phone_number,
      role: formattedUser.role,
    };
  }

  let calculatedStats = rest.stats || { total: 0, sent: 0, failed: 0, pending: 0 };
  const totalContacts = rest.recipient_phones?.length || rest.contacts?.length || 0;

  if (overrideStats) {
    calculatedStats = {
      total: Math.max(totalContacts, (overrideStats.sent || 0) + (overrideStats.failed || 0) + (overrideStats.pending || 0)),
      sent: overrideStats.sent || 0,
      failed: overrideStats.failed || 0,
      pending: overrideStats.pending !== undefined ? overrideStats.pending : Math.max(0, totalContacts - (overrideStats.sent || 0) - (overrideStats.failed || 0)),
    };
  } else if (_id) {
    try {
      const statsMap = await computeCampaignsStats([_id]);
      const single = statsMap.get(_id.toString());
      if (single) {
        calculatedStats = {
          total: Math.max(totalContacts, (single.sent || 0) + (single.failed || 0) + (single.pending || 0)),
          sent: single.sent || 0,
          failed: single.failed || 0,
          pending: single.pending !== undefined ? single.pending : Math.max(0, totalContacts - (single.sent || 0) - (single.failed || 0)),
        };
      }
    } catch (_) {}
  }

  return {
    id: _id ? _id.toString() : obj.id,
    created_at: obj.createdAt,
    ...rest,
    stats: calculatedStats,
    user: formattedUser,
  };
}

const getCampaigns = async (req: AuthRequest, res: Response) => {
  const filter: any = {};
  if (req.user?.role !== 'admin') {
    filter.user = req.user?._id;
  }

  const { search, status, user: userId, ordering } = req.query;
  if (search) {
    filter.name = { $regex: String(search), $options: 'i' };
  }
  if (status && status !== 'all') {
    filter.status = status;
  }
  if (userId && userId !== 'all') {
    filter.user = userId;
  }

  let query = BlastCampaign.find(filter).populate('user', 'phone_number role').populate('template');

  if (ordering) {
    const orderStr = String(ordering);
    if (orderStr.startsWith('-')) {
      query = query.sort({ [orderStr.substring(1)]: -1 });
    } else {
      query = query.sort({ [orderStr]: 1 });
    }
  } else {
    query = query.sort({ createdAt: -1 });
  }

  const campaigns = await query;
  const campaignIds = campaigns.map((c) => c._id);
  const statsMap = await computeCampaignsStats(campaignIds);
  const formatted = await Promise.all(
    campaigns.map((c) => formatCampaign(c, statsMap.get(c._id.toString())))
  );
  return res.json(formatted);
};

router.get('/blast-campaigns', getCampaigns);

const createCampaign = async (req: AuthRequest, res: Response) => {
  const { name, template, contacts, recipient_phones, templates, user: targetUserId, min_interval_seconds, max_interval_seconds, enable_warmup, retry_on_failure, session_mode, selected_sessions, scheduled_at } = req.body;
  const targetUser = (req.user?.role === 'admin' && targetUserId) ? targetUserId : req.user?._id;

  const phoneList = Array.isArray(contacts) ? contacts : Array.isArray(recipient_phones) ? recipient_phones : [];

  let templateId = template;
  let templateObjs = templates || [];
  if (!templateId && Array.isArray(templates) && templates.length > 0) {
    const textContent = typeof templates[0] === 'string' ? templates[0] : templates[0].text || '';
    const newTpl = await MessageTemplate.create({
      user: targetUser,
      name: `Template for ${name || 'Campaign'}`,
      text: textContent,
      type: 'text',
    });
    templateId = newTpl._id;
  }

  const minInterval = min_interval_seconds || 10;
  const maxInterval = max_interval_seconds || 15;
  const sessionModeVal = session_mode === 'SPECIFIC' ? 'SPECIFIC' : 'ALL';
  const selectedSessionsList = Array.isArray(selected_sessions) ? selected_sessions : [];
  const retryOnFailureVal = retry_on_failure !== undefined ? Boolean(retry_on_failure) : true;

  const campaign = await BlastCampaign.create({
    user: targetUser,
    name: name || 'Untitled Campaign',
    template: templateId,
    templates: templateObjs,
    contacts: phoneList,
    recipient_phones: phoneList,
    min_interval_seconds: minInterval,
    max_interval_seconds: maxInterval,
    enable_warmup: Boolean(enable_warmup),
    retry_on_failure: retryOnFailureVal,
    session_mode: sessionModeVal,
    selected_sessions: selectedSessionsList,
    scheduled_at: scheduled_at ? new Date(scheduled_at) : undefined,
    stats: {
      total: phoneList.length,
      sent: 0,
      failed: 0,
    },
  });

  // Immediately create PENDING messages for all recipients with cumulative random 10-15 minute intervals per assigned session
  if (phoneList.length > 0) {
    const minIntervalMins = Number(minInterval) || 10;
    const maxIntervalMins = Number(maxInterval) >= minIntervalMins ? Number(maxInterval) : minIntervalMins + 5;
    const baseScheduledAt = campaign.scheduled_at ? new Date(campaign.scheduled_at) : new Date();

    const primaryTpl = templateObjs.length > 0 ? templateObjs[0] : null;
    const tplText = primaryTpl ? (primaryTpl.text || primaryTpl.template || '') : '';
    const msgType = primaryTpl ? (primaryTpl.type || primaryTpl.messageType || 'text') : 'text';

    // Fetch user's WhatsApp sessions to pre-assign round-robin
    let availableSessions = await WhatsAppSession.find({
      user: targetUser,
      status: SessionStatus.CONNECTED,
    }).sort({ createdAt: 1 });

    const matchesAllowed = (s: any) => {
      if (sessionModeVal !== 'SPECIFIC' || selectedSessionsList.length === 0) return true;
      const sId = s.session_id;
      const mongoId = s._id ? s._id.toString() : (s.id ? s.id.toString() : null);
      return (sId && selectedSessionsList.includes(sId)) || (mongoId ? selectedSessionsList.includes(mongoId) : false);
    };

    if (sessionModeVal === 'SPECIFIC' && selectedSessionsList.length > 0) {
      availableSessions = availableSessions.filter(matchesAllowed);
    }

    if (availableSessions.length === 0) {
      let fallbackSessions = await WhatsAppSession.find({ user: targetUser }).sort({ createdAt: 1 });
      if (sessionModeVal === 'SPECIFIC' && selectedSessionsList.length > 0) {
        fallbackSessions = fallbackSessions.filter(matchesAllowed);
      }
      availableSessions = fallbackSessions;
    }

    const sessionLastTimeMap = new Map<string, number>();

    const pendingMessages = phoneList.map((contact: string, idx: number) => {
      let cleanPhone = contact.replace(/[^0-9]/g, '');
      if (cleanPhone.startsWith('0')) cleanPhone = '60' + cleanPhone.slice(1);
      const assignedSession = availableSessions.length > 0 ? availableSessions[idx % availableSessions.length] : null;
      const sessKey = assignedSession ? assignedSession._id.toString() : 'default';

      let scheduledTimeMs = baseScheduledAt.getTime();
      if (sessionLastTimeMap.has(sessKey)) {
        const prevMs = sessionLastTimeMap.get(sessKey)!;
        const randomMinutes = Math.random() * (maxIntervalMins - minIntervalMins) + minIntervalMins;
        scheduledTimeMs = prevMs + randomMinutes * 60 * 1000;
      }
      sessionLastTimeMap.set(sessKey, scheduledTimeMs);

      const scheduledTime = new Date(scheduledTimeMs);

      return {
        campaign: campaign._id,
        session: assignedSession ? assignedSession._id : undefined,
        sender_phone: assignedSession ? assignedSession.phone_number : undefined,
        direction: MessageDirection.OUTBOUND,
        type: msgType,
        status: MessageStatus.PENDING,
        recipient_phone: cleanPhone || contact,
        to_jid: `${cleanPhone || contact}@s.whatsapp.net`,
        template: templateId || null,
        content: { text: tplText, buttons: primaryTpl?.buttons },
        scheduled_at: scheduledTime,
      };
    });

    await Message.insertMany(pendingMessages);
  }

  const populated = await BlastCampaign.findById(campaign._id).populate('user', 'phone_number role').populate('template');
  return res.status(201).json(await formatCampaign(populated || campaign));
};

router.post('/blast-campaigns', createCampaign);
router.post('/blast-campaigns/full-create', createCampaign);

const getCampaignById = async (req: AuthRequest, res: Response) => {
  const filter: any = { _id: req.params.id };
  if (req.user?.role !== 'admin') {
    filter.user = req.user?._id;
  }

  const campaign = await BlastCampaign.findOne(filter).populate('user', 'phone_number role').populate('template');
  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  return res.json(await formatCampaign(campaign));
};

router.get('/blast-campaigns/:id', getCampaignById);

const patchCampaign = async (req: AuthRequest, res: Response) => {
  const filter: any = { _id: req.params.id };
  if (req.user?.role !== 'admin') {
    filter.user = req.user?._id;
  }

  const campaign = await BlastCampaign.findOne(filter);
  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  const { name, status, recipient_phones, contacts, templates, min_interval_seconds, max_interval_seconds, enable_warmup, retry_on_failure, session_mode, selected_sessions } = req.body;
  if (name !== undefined) campaign.name = name;
  if (status !== undefined) {
    campaign.status = status;
    if (status === CampaignStatus.RUNNING) {
      campaign.error_message = undefined;
    }
  }
  if (recipient_phones !== undefined || contacts !== undefined) {
    const list = recipient_phones || contacts || [];
    campaign.recipient_phones = list;
    campaign.contacts = list;
    campaign.stats.total = list.length;
  }
  if (templates !== undefined) campaign.templates = templates;
  if (min_interval_seconds !== undefined) campaign.min_interval_seconds = min_interval_seconds;
  if (max_interval_seconds !== undefined) campaign.max_interval_seconds = max_interval_seconds;
  if (enable_warmup !== undefined) campaign.enable_warmup = Boolean(enable_warmup);
  if (retry_on_failure !== undefined) campaign.retry_on_failure = Boolean(retry_on_failure);
  if (session_mode !== undefined) campaign.session_mode = session_mode === 'SPECIFIC' ? 'SPECIFIC' : 'ALL';
  if (selected_sessions !== undefined) campaign.selected_sessions = Array.isArray(selected_sessions) ? selected_sessions : [];

  await campaign.save();

  // Recalculate scheduled_at timestamps for pending messages using random 10-15 minute intervals
  const minIntervalMins = Number(campaign.min_interval_seconds) || 10;
  const maxIntervalMins = Number(campaign.max_interval_seconds) >= minIntervalMins ? Number(campaign.max_interval_seconds) : minIntervalMins + 5;

  const pendingMsgs = await Message.find({ campaign: campaign._id, status: MessageStatus.PENDING }).sort({ createdAt: 1 });
  if (pendingMsgs.length > 0) {
    let cumulativeMs = Date.now();
    for (let idx = 0; idx < pendingMsgs.length; idx++) {
      const msg = pendingMsgs[idx];
      if (idx > 0) {
        const randomMinutes = Math.random() * (maxIntervalMins - minIntervalMins) + minIntervalMins;
        cumulativeMs += randomMinutes * 60 * 1000;
      }
      msg.scheduled_at = new Date(cumulativeMs);
      await msg.save();
    }
  }

  return res.json(await formatCampaign(campaign));
};

router.patch('/blast-campaigns/:id', patchCampaign);

const startCampaign = async (req: AuthRequest, res: Response) => {
  const filter: any = { _id: req.params.id };
  if (req.user?.role !== 'admin') {
    filter.user = req.user?._id;
  }

  const campaign = await BlastCampaign.findOne(filter);
  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  campaign.status = CampaignStatus.RUNNING;
  campaign.error_message = undefined;
  campaign.started_at = campaign.started_at || new Date();
  await campaign.save();

  return res.json({ success: true, campaign: formatCampaign(campaign) });
};

router.post('/blast-campaigns/:id/start', startCampaign);
router.post('/blast-campaigns/:id/run', startCampaign);
router.post('/blast-campaigns/:id/resume', startCampaign);

const pauseCampaign = async (req: AuthRequest, res: Response) => {
  const filter: any = { _id: req.params.id };
  if (req.user?.role !== 'admin') {
    filter.user = req.user?._id;
  }

  const campaign = await BlastCampaign.findOne(filter);
  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  campaign.status = CampaignStatus.PAUSED;
  await campaign.save();

  return res.json({ success: true, campaign: formatCampaign(campaign) });
};

router.post('/blast-campaigns/:id/pause', pauseCampaign);

const deleteCampaign = async (req: AuthRequest, res: Response) => {
  const filter: any = { _id: req.params.id };
  if (req.user?.role !== 'admin') {
    filter.user = req.user?._id;
  }

  await BlastCampaign.deleteOne(filter);
  return res.json({ success: true });
};

router.delete('/blast-campaigns/:id', deleteCampaign);

export const executeCampaignRetryFailed = async (campaignDocOrId: any): Promise<{ success: boolean; count: number; message: string; warning?: string; campaign?: any }> => {
  const campaign = typeof campaignDocOrId === 'string'
    ? await BlastCampaign.findById(campaignDocOrId)
    : campaignDocOrId;

  if (!campaign) {
    return { success: false, count: 0, message: 'Campaign not found' };
  }

  const allContacts = campaign.contacts || campaign.recipient_phones || [];

  const sentMessages = await Message.find({
    campaign: campaign._id,
    status: { $in: [MessageStatus.SENT, MessageStatus.DELIVERED, MessageStatus.READ] },
  });
  const sentPhones = new Set<string>();
  sentMessages.forEach((m) => {
    const raw = m.recipient_phone ? m.recipient_phone.replace(/[^0-9]/g, '') : '';
    if (raw) {
      sentPhones.add(raw);
      if (raw.startsWith('0')) sentPhones.add('60' + raw.slice(1));
      if (raw.startsWith('60')) sentPhones.add('0' + raw.slice(2));
    }
  });

  const retryContacts: string[] = [];
  const successfulContacts: string[] = [];

  for (const c of allContacts) {
    const clean = c.replace(/[^0-9]/g, '');
    const norm = clean.startsWith('0') ? '60' + clean.slice(1) : (clean.startsWith('60') ? '0' + clean.slice(2) : clean);
    if (sentPhones.has(clean) || sentPhones.has(norm)) {
      successfulContacts.push(c);
    } else {
      retryContacts.push(c);
    }
  }

  if (retryContacts.length === 0) {
    return { success: true, count: 0, message: 'No failed messages to retry', campaign };
  }

  const now = new Date();
  const minInterval = Number(campaign.min_interval_seconds) || 10;
  const maxInterval = Number(campaign.max_interval_seconds) >= minInterval ? Number(campaign.max_interval_seconds) : minInterval + 5;

  // Fetch available sessions for pre-assignment (same as createCampaign)
  const sessionModeVal = (campaign as any).session_mode === 'SPECIFIC' ? 'SPECIFIC' : 'ALL';
  const selectedSessionsList: string[] = Array.isArray((campaign as any).selected_sessions) ? (campaign as any).selected_sessions : [];

  let availableSessions = await WhatsAppSession.find({ user: campaign.user, status: SessionStatus.CONNECTED }).sort({ createdAt: 1 });
  const matchesAllowed = (s: any) => {
    if (sessionModeVal !== 'SPECIFIC' || selectedSessionsList.length === 0) return true;
    const sId = s.session_id;
    const mongoId = s._id ? s._id.toString() : (s.id ? s.id.toString() : null);
    return (sId && selectedSessionsList.includes(sId)) || (mongoId ? selectedSessionsList.includes(mongoId) : false);
  };

  if (sessionModeVal === 'SPECIFIC' && selectedSessionsList.length > 0) {
    availableSessions = availableSessions.filter(matchesAllowed);
  }
  if (availableSessions.length === 0) {
    let fallbackSessions = await WhatsAppSession.find({ user: campaign.user }).sort({ createdAt: 1 });
    if (sessionModeVal === 'SPECIFIC' && selectedSessionsList.length > 0) {
      fallbackSessions = fallbackSessions.filter(matchesAllowed);
    }
    availableSessions = fallbackSessions;
  }

  let lastScheduledMs = now.getTime();

  for (let idx = 0; idx < retryContacts.length; idx++) {
    const contact = retryContacts[idx];
    const rawRecip = contact.replace(/[^0-9]/g, '');
    const normRecip = rawRecip.startsWith('0') ? '60' + rawRecip.slice(1) : (rawRecip.startsWith('60') ? '0' + rawRecip.slice(2) : rawRecip);
    const possiblePhones = Array.from(new Set([rawRecip, normRecip])).filter(Boolean);
    const clean = rawRecip.startsWith('0') ? '60' + rawRecip.slice(1) : rawRecip;
    const assignedSession = availableSessions.length > 0 ? availableSessions[idx % availableSessions.length] : null;

    let scheduledTimeMs = now.getTime();
    if (idx > 0) {
      const randomMinutes = Math.random() * (maxInterval - minInterval) + minInterval;
      scheduledTimeMs = lastScheduledMs + randomMinutes * 60 * 1000;
    }
    lastScheduledMs = scheduledTimeMs;

    const scheduledTime = new Date(scheduledTimeMs);

    const updated = await Message.findOneAndUpdate(
      { campaign: campaign._id, recipient_phone: { $in: possiblePhones } },
      {
        status: MessageStatus.PENDING,
        session: assignedSession ? assignedSession._id : undefined,
        sender_phone: assignedSession ? assignedSession.phone_number : undefined,
        $unset: { error: 1, sent_at: 1, wa_timestamp: 1 },
        scheduled_at: scheduledTime,
        $inc: { retry_count: 1 },
      }
    );

    if (!updated) {
      await Message.create({
        campaign: campaign._id,
        session: assignedSession ? assignedSession._id : undefined,
        sender_phone: assignedSession ? assignedSession.phone_number : undefined,
        direction: MessageDirection.OUTBOUND,
        type: 'text',
        status: MessageStatus.PENDING,
        recipient_phone: clean,
        to_jid: `${clean}@s.whatsapp.net`,
        template: campaign.template || null,
        scheduled_at: scheduledTime,
        retry_count: 1,
      });
    }
  }

  let hasConnectedSession = availableSessions.some((s) => s.status === SessionStatus.CONNECTED);

  campaign.contacts = [...successfulContacts, ...retryContacts];
  campaign.recipient_phones = campaign.contacts;
  campaign.current_index = successfulContacts.length;
  campaign.stats.total = campaign.contacts.length;
  campaign.stats.sent = successfulContacts.length;
  campaign.stats.failed = 0;
  campaign.status = CampaignStatus.RUNNING;
  campaign.scheduled_at = new Date();
  campaign.completed_at = undefined;
  campaign.error_message = undefined;

  await campaign.save();

  const warningMsg = !hasConnectedSession
    ? ' (Note: No connected WhatsApp session found. Messages will send once WhatsApp connects.)'
    : '';

  return {
    success: true,
    count: retryContacts.length,
    message: `Retrying ${retryContacts.length} failed recipient(s)${warningMsg}`,
    warning: !hasConnectedSession ? 'No connected WhatsApp session found' : undefined,
    campaign,
  };
};

const retryCampaignFailed = async (req: AuthRequest, res: Response) => {
  const filter: any = { _id: req.params.id };
  if (req.user?.role !== 'admin') {
    filter.user = req.user?._id;
  }

  const campaign = await BlastCampaign.findOne(filter);
  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  const result = await executeCampaignRetryFailed(campaign);
  return res.json({
    success: result.success,
    message: result.message,
    warning: result.warning,
    campaign: await formatCampaign(result.campaign || campaign),
  });
};

router.post('/blast-campaigns/:id/retry-failed', retryCampaignFailed);
router.post('/blast-campaigns/:id/retry', retryCampaignFailed);

export const retryCampaignRecipient = async (req: AuthRequest, res: Response) => {
  const filter: any = { _id: req.params.id };
  if (req.user?.role !== 'admin') {
    filter.user = req.user?._id;
  }

  const campaign = await BlastCampaign.findOne(filter);
  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'phone parameter is required' });
  }

  const rawRecip = phone.replace(/[^0-9]/g, '');
  const normRecip = rawRecip.startsWith('0') ? '60' + rawRecip.slice(1) : (rawRecip.startsWith('60') ? '0' + rawRecip.slice(2) : rawRecip);
  const possiblePhones = Array.from(new Set([rawRecip, normRecip])).filter(Boolean);
  const cleanPhone = rawRecip.startsWith('0') ? '60' + rawRecip.slice(1) : rawRecip;
  const now = new Date();
  const minInterval = Number(campaign.min_interval_seconds) || 10;
  const maxInterval = Number(campaign.max_interval_seconds) >= minInterval ? Number(campaign.max_interval_seconds) : minInterval + 5;

  // Determine scheduled_at time based on any future pending messages in this campaign
  const lastPending = await Message.findOne({
    campaign: campaign._id,
    recipient_phone: { $nin: possiblePhones },
    status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED] },
    scheduled_at: { $gt: now },
  }).sort({ scheduled_at: -1 });

  let scheduledTimeMs = now.getTime();
  if (lastPending && lastPending.scheduled_at) {
    const randomMinutes = Math.random() * (maxInterval - minInterval) + minInterval;
    scheduledTimeMs = new Date(lastPending.scheduled_at).getTime() + randomMinutes * 60 * 1000;
  }
  const scheduledTime = new Date(scheduledTimeMs);

  // Fetch available sessions for session assignment
  const sessionModeVal = (campaign as any).session_mode === 'SPECIFIC' ? 'SPECIFIC' : 'ALL';
  const selectedSessionsList: string[] = Array.isArray((campaign as any).selected_sessions) ? (campaign as any).selected_sessions : [];

  let availableSessions = await WhatsAppSession.find({ user: campaign.user, status: SessionStatus.CONNECTED }).sort({ createdAt: 1 });
  const matchesAllowed = (s: any) => {
    if (sessionModeVal !== 'SPECIFIC' || selectedSessionsList.length === 0) return true;
    const sId = s.session_id;
    const mongoId = s._id ? s._id.toString() : (s.id ? s.id.toString() : null);
    return (sId && selectedSessionsList.includes(sId)) || (mongoId ? selectedSessionsList.includes(mongoId) : false);
  };

  if (sessionModeVal === 'SPECIFIC' && selectedSessionsList.length > 0) {
    availableSessions = availableSessions.filter(matchesAllowed);
  }
  if (availableSessions.length === 0) {
    let fallbackSessions = await WhatsAppSession.find({ user: campaign.user }).sort({ createdAt: 1 });
    if (sessionModeVal === 'SPECIFIC' && selectedSessionsList.length > 0) {
      fallbackSessions = fallbackSessions.filter(matchesAllowed);
    }
    availableSessions = fallbackSessions;
  }

  const assignedSession = availableSessions.length > 0 ? availableSessions[0] : null;

  // Update or create message in PENDING status
  const updatedMsg = await Message.findOneAndUpdate(
    { campaign: campaign._id, recipient_phone: { $in: possiblePhones } },
    {
      status: MessageStatus.PENDING,
      session: assignedSession ? assignedSession._id : undefined,
      sender_phone: assignedSession ? assignedSession.phone_number : undefined,
      $unset: { error: 1, sent_at: 1, wa_timestamp: 1 },
      scheduled_at: scheduledTime,
      $inc: { retry_count: 1 },
    },
    { new: true }
  );

  if (!updatedMsg) {
    await Message.create({
      campaign: campaign._id,
      session: assignedSession ? assignedSession._id : undefined,
      sender_phone: assignedSession ? assignedSession.phone_number : undefined,
      direction: MessageDirection.OUTBOUND,
      type: 'text',
      status: MessageStatus.PENDING,
      recipient_phone: cleanPhone,
      to_jid: `${cleanPhone}@s.whatsapp.net`,
      template: campaign.template || null,
      scheduled_at: scheduledTime,
      retry_count: 1,
    });
  }

  // Ensure contact is queued in campaign.contacts for the background blastRunner
  const currentContacts = campaign.contacts || campaign.recipient_phones || [];
  const cleanContacts = currentContacts.map((c: string) => c.replace(/[^0-9]/g, ''));

  const isUpcoming = cleanContacts.slice(campaign.current_index).includes(cleanPhone);
  if (!isUpcoming) {
    const remaining = currentContacts.slice(campaign.current_index);
    const past = currentContacts.slice(0, campaign.current_index).filter((c: string) => c.replace(/[^0-9]/g, '') !== cleanPhone);
    const originalPhoneEntry = currentContacts.find((c: string) => c.replace(/[^0-9]/g, '') === cleanPhone) || cleanPhone;

    campaign.contacts = [...past, ...remaining, originalPhoneEntry];
    campaign.recipient_phones = campaign.contacts;
    campaign.current_index = past.length;
    campaign.stats.total = campaign.contacts.length;
  }

  if (campaign.stats.failed > 0) {
    campaign.stats.failed = Math.max(0, campaign.stats.failed - 1);
  }

  campaign.status = CampaignStatus.RUNNING;
  campaign.completed_at = undefined;
  campaign.error_message = undefined;
  await campaign.save();

  return res.json({
    success: true,
    message: `Message rescheduled for ${cleanPhone}. It will be sent via campaign scheduler.`,
    scheduled_at: scheduledTime,
  });
};

router.post('/blast-campaigns/:id/retry-recipient', retryCampaignRecipient);

export default router;
