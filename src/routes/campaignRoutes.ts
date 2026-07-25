import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware.js';
import { BlastCampaign, CampaignStatus } from '../models/BlastCampaign.js';

const router = Router();

router.use(authenticateToken);

router.get('/blast-campaigns', async (req: AuthRequest, res: Response) => {
  const campaigns = await BlastCampaign.find({ user: req.user?._id })
    .populate('template')
    .sort({ createdAt: -1 });
  return res.json(campaigns);
});

router.post('/blast-campaigns', async (req: AuthRequest, res: Response) => {
  const { name, template, contacts, min_interval_seconds, max_interval_seconds, enable_warmup } = req.body;

  if (!name || !template || !Array.isArray(contacts)) {
    return res.status(400).json({ error: 'name, template, and contacts array are required' });
  }

  const campaign = await BlastCampaign.create({
    user: req.user?._id,
    name,
    template,
    contacts,
    min_interval_seconds: min_interval_seconds || 10,
    max_interval_seconds: max_interval_seconds || 15,
    enable_warmup: Boolean(enable_warmup),
    stats: {
      total: contacts.length,
      sent: 0,
      failed: 0,
    },
  });

  return res.status(201).json(campaign);
});

router.post('/blast-campaigns/:id/start', async (req: AuthRequest, res: Response) => {
  const campaign = await BlastCampaign.findOne({ _id: req.params.id, user: req.user?._id });
  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  campaign.status = CampaignStatus.RUNNING;
  campaign.started_at = campaign.started_at || new Date();
  await campaign.save();

  return res.json({ success: true, campaign });
});

router.post('/blast-campaigns/:id/pause', async (req: AuthRequest, res: Response) => {
  const campaign = await BlastCampaign.findOne({ _id: req.params.id, user: req.user?._id });
  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  campaign.status = CampaignStatus.PAUSED;
  await campaign.save();

  return res.json({ success: true, campaign });
});

router.delete('/blast-campaigns/:id', async (req: AuthRequest, res: Response) => {
  await BlastCampaign.deleteOne({ _id: req.params.id, user: req.user?._id });
  return res.json({ success: true });
});

export default router;
