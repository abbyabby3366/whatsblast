import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware.js';
import { BlastCampaign, CampaignStatus } from '../models/BlastCampaign.js';
import { MessageTemplate } from '../models/MessageTemplate.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';
import { WhatsAppSession, SessionStatus } from '../models/WhatsAppSession.js';
import { User } from '../models/User.js';
import { FileModel } from '../models/File.js';
import { pickUserSession, getActiveSession, initWhatsAppSession } from '../services/baileysManager.js';
import { sendBaileysTemplateMessage, getFileUrl, stopCampaignExecution, triggerCampaignExecution } from '../services/blastRunner.js';
import { executeCampaignRetryFailed, executeCampaignRetryRecipient } from '../services/campaignRetryService.js';
import { executeCampaignReschedule } from '../services/campaignRescheduleService.js';
import { syncCampaignRecipients, checkAndAutoHealCampaignRecipients } from '../services/campaignRecipientSyncService.js';
export { executeCampaignRetryFailed, executeCampaignReschedule };

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

  const ownerUser = await User.findById(targetUser);
  let userMin = 10;
  let userMax = 15;
  if (ownerUser?.min_interval_minutes) {
    const parts = ownerUser.min_interval_minutes.split('-');
    if (parts[0] && !isNaN(Number(parts[0]))) userMin = Number(parts[0]);
    if (parts[1] && !isNaN(Number(parts[1]))) userMax = Number(parts[1]);
  }

  const minInterval = (min_interval_seconds !== undefined && min_interval_seconds !== null && !isNaN(Number(min_interval_seconds)))
    ? Number(min_interval_seconds)
    : userMin;
  const maxInterval = (max_interval_seconds !== undefined && max_interval_seconds !== null && !isNaN(Number(max_interval_seconds)))
    ? Number(max_interval_seconds)
    : userMax;
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
    status: req.body.status || CampaignStatus.DRAFT,
    stats: {
      total: phoneList.length,
      sent: 0,
      failed: 0,
    },
  });

  // Create and schedule PENDING messages for all recipients
  if (phoneList.length > 0) {
    await syncCampaignRecipients(campaign, phoneList, {
      templates: templateObjs,
      sessionMode: sessionModeVal,
      selectedSessions: selectedSessionsList,
      minIntervalSeconds: minInterval,
      maxIntervalSeconds: maxInterval,
    });
  }

  if (campaign.status === CampaignStatus.RUNNING) {
    triggerCampaignExecution(campaign._id.toString());
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

  if (
    (campaign.status === CampaignStatus.PAUSED || campaign.status === CampaignStatus.DRAFT) &&
    Array.isArray(campaign.recipient_phones) &&
    campaign.recipient_phones.length > 0
  ) {
    await checkAndAutoHealCampaignRecipients(campaign);
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

  const wasRunning = campaign.status === CampaignStatus.RUNNING;
  if (wasRunning) {
    await stopCampaignExecution(campaign._id.toString(), 2000);
  }

  const { name, status, recipient_phones, contacts, templates, min_interval_seconds, max_interval_seconds, enable_warmup, retry_on_failure, session_mode, selected_sessions } = req.body;
  if (name !== undefined) campaign.name = name;
  if (status !== undefined) {
    campaign.status = status;
    if (status === CampaignStatus.RUNNING) {
      campaign.error_message = undefined;
    }
  }
  if (min_interval_seconds !== undefined) campaign.min_interval_seconds = min_interval_seconds;
  if (max_interval_seconds !== undefined) campaign.max_interval_seconds = max_interval_seconds;
  if (enable_warmup !== undefined) campaign.enable_warmup = Boolean(enable_warmup);
  if (retry_on_failure !== undefined) campaign.retry_on_failure = Boolean(retry_on_failure);
  if (session_mode !== undefined) campaign.session_mode = session_mode === 'SPECIFIC' ? 'SPECIFIC' : 'ALL';
  if (selected_sessions !== undefined) campaign.selected_sessions = Array.isArray(selected_sessions) ? selected_sessions : [];
  if (templates !== undefined) campaign.templates = templates;

  await campaign.save();

  const targetRecipients = recipient_phones !== undefined || contacts !== undefined
    ? (recipient_phones || contacts || [])
    : campaign.recipient_phones;

  await syncCampaignRecipients(campaign, targetRecipients, {
    templates: campaign.templates,
    sessionMode: campaign.session_mode,
    selectedSessions: campaign.selected_sessions,
    minIntervalSeconds: campaign.min_interval_seconds,
    maxIntervalSeconds: campaign.max_interval_seconds,
  });

  if (campaign.status === CampaignStatus.RUNNING) {
    triggerCampaignExecution(campaign._id.toString());
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

  await stopCampaignExecution(campaign._id.toString(), 2000);

  if (Array.isArray(campaign.recipient_phones) && campaign.recipient_phones.length > 0) {
    await syncCampaignRecipients(campaign, campaign.recipient_phones, {
      templates: campaign.templates,
      sessionMode: campaign.session_mode,
      selectedSessions: campaign.selected_sessions,
      minIntervalSeconds: campaign.min_interval_seconds,
      maxIntervalSeconds: campaign.max_interval_seconds,
    });
  }

  campaign.status = CampaignStatus.RUNNING;
  campaign.error_message = undefined;
  campaign.started_at = campaign.started_at || new Date();
  await campaign.save();

  // If any pending messages have scheduled_at in the past, shift them forward from now per session
  const now = Date.now();
  const pendingMsgs = await Message.find({
    campaign: campaign._id,
    status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED] },
  }).sort({ scheduled_at: 1, createdAt: 1 });

  const hasPastScheduled = pendingMsgs.some(
    (m) => !m.scheduled_at || new Date(m.scheduled_at).getTime() <= now
  );

  if (hasPastScheduled && pendingMsgs.length > 0) {
    const minIntervalMins = Number(campaign.min_interval_seconds) || 10;
    const maxIntervalMins =
      Number(campaign.max_interval_seconds) >= minIntervalMins
        ? Number(campaign.max_interval_seconds)
        : minIntervalMins + 5;
    const sessionLastTimeMap = new Map<string, number>();

    for (const msg of pendingMsgs) {
      const sessKey = msg.session ? msg.session.toString() : 'default';
      let scheduledTimeMs = now;
      if (sessionLastTimeMap.has(sessKey)) {
        const prevMs = sessionLastTimeMap.get(sessKey)!;
        const randomMinutes =
          Math.random() * (maxIntervalMins - minIntervalMins) + minIntervalMins;
        scheduledTimeMs = prevMs + randomMinutes * 60 * 1000;
      }
      sessionLastTimeMap.set(sessKey, scheduledTimeMs);
      msg.scheduled_at = new Date(scheduledTimeMs);
      await msg.save();
    }
  }

  triggerCampaignExecution(campaign._id.toString());

  return res.json({ success: true, campaign: await formatCampaign(campaign) });
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
  await stopCampaignExecution(campaign._id.toString(), 2000);

  return res.json({ success: true, campaign: await formatCampaign(campaign) });
};

router.post('/blast-campaigns/:id/pause', pauseCampaign);

const deleteCampaign = async (req: AuthRequest, res: Response) => {
  const filter: any = { _id: req.params.id };
  if (req.user?.role !== 'admin') {
    filter.user = req.user?._id;
  }

  const campaign = await BlastCampaign.findOne(filter);
  if (campaign) {
    await stopCampaignExecution(campaign._id.toString(), 2000);
    await Message.deleteMany({ campaign: campaign._id });
    await BlastCampaign.deleteOne({ _id: campaign._id });
  }
  return res.json({ success: true });
};

router.delete('/blast-campaigns/:id', deleteCampaign);

const retryCampaignFailed = async (req: AuthRequest, res: Response) => {
  const filter: any = { _id: req.params.id };
  if (req.user?.role !== 'admin') {
    filter.user = req.user?._id;
  }

  const campaign = await BlastCampaign.findOne(filter);
  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  const { sessionId } = req.body || {};
  const result = await executeCampaignRetryFailed(campaign, sessionId);
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

  const { phone, sessionId } = req.body || {};
  if (!phone) {
    return res.status(400).json({ error: 'phone parameter is required' });
  }

  const result = await executeCampaignRetryRecipient(campaign, phone, sessionId);
  if (!result.success) {
    return res.status(400).json({ error: result.error || 'Failed to retry recipient' });
  }

  return res.json(result);
};

router.post('/blast-campaigns/:id/retry-recipient', retryCampaignRecipient);

export const rescheduleCampaign = async (req: AuthRequest, res: Response) => {
  const filter: any = { _id: req.params.id };
  if (req.user?.role !== 'admin') {
    filter.user = req.user?._id;
  }

  const campaign = await BlastCampaign.findOne(filter);
  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  if (Array.isArray(campaign.recipient_phones) && campaign.recipient_phones.length > 0) {
    await checkAndAutoHealCampaignRecipients(campaign);
  }

  const { sessionIds, minInterval, maxInterval } = req.body || {};
  const result = await executeCampaignReschedule(campaign, {
    sessionIds,
    minInterval,
    maxInterval,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }

  return res.json({
    success: true,
    message: result.message,
    count: result.count,
    assignedSessionsCount: result.assignedSessionsCount,
    campaign: await formatCampaign(result.campaign || campaign),
  });
};

router.post('/blast-campaigns/:id/reschedule', rescheduleCampaign);

export default router;
