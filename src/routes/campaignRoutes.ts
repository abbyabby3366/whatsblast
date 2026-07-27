import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware.js';
import { BlastCampaign, CampaignStatus } from '../models/BlastCampaign.js';
import { MessageTemplate } from '../models/MessageTemplate.js';
import { Message, MessageDirection, MessageStatus } from '../models/Message.js';
import { WhatsAppSession } from '../models/WhatsAppSession.js';
import { FileModel } from '../models/File.js';
import { pickUserSession, getActiveSession, initWhatsAppSession } from '../services/baileysManager.js';
import { sendBaileysTemplateMessage, getFileUrl } from '../services/blastRunner.js';

const router = Router();

router.use(authenticateToken);

async function formatCampaign(c: any) {
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

  return {
    id: _id ? _id.toString() : obj.id,
    created_at: obj.createdAt,
    ...rest,
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
  const formatted = await Promise.all(campaigns.map(formatCampaign));
  return res.json(formatted);
};

router.get('/blast-campaigns', getCampaigns);

const createCampaign = async (req: AuthRequest, res: Response) => {
  const { name, template, contacts, recipient_phones, templates, user: targetUserId, min_interval_seconds, max_interval_seconds, enable_warmup, session_mode, selected_sessions, scheduled_at } = req.body;
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
    session_mode: sessionModeVal,
    selected_sessions: selectedSessionsList,
    scheduled_at: scheduled_at ? new Date(scheduled_at) : undefined,
    stats: {
      total: phoneList.length,
      sent: 0,
      failed: 0,
    },
  });

  // Immediately create PENDING messages for all recipients
  if (phoneList.length > 0) {
    const avgIntervalSec = (minInterval + maxInterval) / 2;
    const baseScheduledAt = campaign.scheduled_at ? new Date(campaign.scheduled_at) : new Date();

    const primaryTpl = templateObjs.length > 0 ? templateObjs[0] : null;
    const tplText = primaryTpl ? (primaryTpl.text || primaryTpl.template || '') : '';
    const msgType = primaryTpl ? (primaryTpl.type || primaryTpl.messageType || 'text') : 'text';

    const pendingMessages = phoneList.map((contact: string, idx: number) => {
      const cleanPhone = contact.replace(/[^0-9]/g, '');
      const scheduledTime = new Date(baseScheduledAt.getTime() + idx * avgIntervalSec * 1000);

      return {
        campaign: campaign._id,
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

  const { name, status, recipient_phones, contacts, templates, min_interval_seconds, max_interval_seconds, enable_warmup, session_mode, selected_sessions } = req.body;
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
  if (session_mode !== undefined) campaign.session_mode = session_mode === 'SPECIFIC' ? 'SPECIFIC' : 'ALL';
  if (selected_sessions !== undefined) campaign.selected_sessions = Array.isArray(selected_sessions) ? selected_sessions : [];

  await campaign.save();
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

const retryCampaignFailed = async (req: AuthRequest, res: Response) => {
  const filter: any = { _id: req.params.id };
  if (req.user?.role !== 'admin') {
    filter.user = req.user?._id;
  }

  const campaign = await BlastCampaign.findOne(filter);
  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  const allContacts = campaign.contacts || campaign.recipient_phones || [];

  const sentMessages = await Message.find({ campaign: campaign._id, status: { $ne: MessageStatus.FAILED } });
  const sentPhones = new Set(sentMessages.map((m) => (m.recipient_phone ? m.recipient_phone.replace(/[^0-9]/g, '') : '')));

  const retryContacts: string[] = [];
  const successfulContacts: string[] = [];

  for (const c of allContacts) {
    const clean = c.replace(/[^0-9]/g, '');
    if (sentPhones.has(clean)) {
      successfulContacts.push(c);
    } else {
      retryContacts.push(c);
    }
  }

  if (retryContacts.length === 0) {
    return res.json({ success: true, message: 'No failed messages to retry', campaign: formatCampaign(campaign) });
  }

  const now = new Date();
  const minInterval = campaign.min_interval_seconds || 10;
  const maxInterval = campaign.max_interval_seconds || 15;
  const avgIntervalSec = (minInterval + maxInterval) / 2;

  for (let idx = 0; idx < retryContacts.length; idx++) {
    const contact = retryContacts[idx];
    const clean = contact.replace(/[^0-9]/g, '');
    const scheduledTime = new Date(now.getTime() + idx * avgIntervalSec * 1000);

    const updated = await Message.findOneAndUpdate(
      { campaign: campaign._id, recipient_phone: clean },
      {
        status: MessageStatus.PENDING,
        $unset: { error: 1, sent_at: 1, wa_timestamp: 1 },
        scheduled_at: scheduledTime,
        $inc: { retry_count: 1 },
      }
    );

    if (!updated) {
      await Message.create({
        campaign: campaign._id,
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

  campaign.contacts = [...successfulContacts, ...retryContacts];
  campaign.recipient_phones = campaign.contacts;
  campaign.current_index = successfulContacts.length;
  campaign.stats.total = campaign.contacts.length;
  campaign.stats.sent = successfulContacts.length;
  campaign.stats.failed = 0;
  campaign.status = CampaignStatus.RUNNING;
  campaign.completed_at = undefined;

  await campaign.save();

  return res.json({
    success: true,
    message: `Retrying ${retryContacts.length} failed recipient(s)`,
    campaign: formatCampaign(campaign),
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

  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const targetJid = `${cleanPhone}@s.whatsapp.net`;

  let sessionId: string;
  try {
    sessionId = await pickUserSession(campaign.user.toString());
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'No available connected WhatsApp session' });
  }

  let activeSession = getActiveSession(sessionId);
  if (!activeSession) {
    activeSession = await initWhatsAppSession(sessionId);
  }

  let templatesToSend: any[] = [];
  if (Array.isArray(campaign.templates) && campaign.templates.length > 0) {
    templatesToSend = campaign.templates;
  } else if (campaign.template) {
    const tplDoc = await MessageTemplate.findById(campaign.template);
    if (tplDoc) templatesToSend = [tplDoc];
  }

  if (templatesToSend.length === 0) {
    return res.status(400).json({ error: 'No templates configured for this campaign' });
  }

  const sessionDoc = await WhatsAppSession.findOne({ session_id: sessionId });

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
        file: activeMedia?.url || mainMedia?.url || (typeof tplItem.file === 'string' ? tplItem.file : null),
        file_type: activeMedia?.type || tplItem.messageType || tplItem.type || 'text',
        file_name: activeMedia?.filename || null,
        button_image: buttonMedia?.url || (typeof tplItem.button_image === 'string' ? tplItem.button_image : null),
      };

      const now = new Date();
      const updatedMsg = await Message.findOneAndUpdate(
        { campaign: campaign._id, recipient_phone: cleanPhone },
        {
          session: sessionDoc?._id,
          direction: MessageDirection.OUTBOUND,
          type: tplItem.messageType || tplItem.type || 'text',
          status: MessageStatus.SENT,
          to_jid: targetJid,
          template: campaign.template || null,
          content: fullContent,
          message_id: result?.key?.id || '',
          sent_at: now,
          wa_timestamp: now,
          $unset: { error: 1 },
          $inc: { retry_count: 1 },
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
          retry_count: 1,
        });
      }
    }

    if (campaign.stats.failed > 0) {
      campaign.stats.failed = Math.max(0, campaign.stats.failed - 1);
      campaign.stats.sent += 1;
      await campaign.save();
    }

    return res.json({ success: true, message: `Successfully retried message to ${cleanPhone}` });
  } catch (err: any) {
    console.error(`❌ Single recipient retry error for ${cleanPhone}:`, err);
    return res.status(500).json({ error: err.message || 'Failed to retry message' });
  }
};

router.post('/blast-campaigns/:id/retry-recipient', retryCampaignRecipient);

export default router;
