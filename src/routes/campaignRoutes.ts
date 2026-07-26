import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware.js';
import { BlastCampaign, CampaignStatus } from '../models/BlastCampaign.js';
import { MessageTemplate } from '../models/MessageTemplate.js';

const router = Router();

router.use(authenticateToken);

function formatCampaign(c: any) {
  const obj = c.toObject ? c.toObject() : c;
  const { _id, __v, ...rest } = obj;
  return {
    id: _id ? _id.toString() : obj.id,
    created_at: obj.createdAt,
    ...rest,
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
  return res.json(campaigns.map(formatCampaign));
};

router.get('/blast-campaigns', getCampaigns);

const createCampaign = async (req: AuthRequest, res: Response) => {
  const { name, template, contacts, recipient_phones, templates, user: targetUserId, min_interval_seconds, max_interval_seconds, enable_warmup } = req.body;
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

  const campaign = await BlastCampaign.create({
    user: targetUser,
    name: name || 'Untitled Campaign',
    template: templateId,
    templates: templateObjs,
    contacts: phoneList,
    recipient_phones: phoneList,
    min_interval_seconds: min_interval_seconds || 10,
    max_interval_seconds: max_interval_seconds || 15,
    enable_warmup: Boolean(enable_warmup),
    stats: {
      total: phoneList.length,
      sent: 0,
      failed: 0,
    },
  });

  return res.status(201).json(formatCampaign(campaign));
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

  return res.json(formatCampaign(campaign));
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

  const { name, status, recipient_phones, contacts, templates, min_interval_seconds, max_interval_seconds, enable_warmup } = req.body;
  if (name !== undefined) campaign.name = name;
  if (status !== undefined) campaign.status = status;
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

  await campaign.save();
  return res.json(formatCampaign(campaign));
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

export default router;
