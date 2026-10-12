import mongoose from 'mongoose';
import { BlastCampaign, CampaignStatus } from '../models/BlastCampaign.js';
import { MessageStatus } from '../models/Message.js';

/**
 * Escapes RegExp metacharacters so user input can be safely embedded in a
 * `new RegExp(...)` / Mongo `$regex` as a literal substring match.
 */
export function escapeRegex(str: string): string {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function applyMessageStatusFilter(filter: any, status?: any): Promise<void> {
  if (!status || status === 'all' || status === 'ALL') {
    return;
  }

  const s = String(status).toLowerCase();

  if (s === 'sent') {
    filter.status = { $in: ['sent', 'delivered', 'read', 'SENT', 'DELIVERED', 'READ'] };
  } else if (s === 'failed') {
    filter.status = { $in: ['failed', 'FAILED', 'error', 'ERROR'] };
  } else if (s === 'paused') {
    const rawPausedCampaignIds = await BlastCampaign.find({
      status: { $in: [CampaignStatus.PAUSED, 'paused', 'PAUSED'] },
    }).distinct('_id');
    const pausedCampaignIds = rawPausedCampaignIds.map((id: any) =>
      typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
    );

    const isSpecificCampaignId =
      filter.campaign instanceof mongoose.Types.ObjectId ||
      (typeof filter.campaign === 'string' && mongoose.Types.ObjectId.isValid(filter.campaign));

    if (filter.campaign) {
      if (!isSpecificCampaignId && typeof filter.campaign === 'object') {
        filter.campaign = { ...filter.campaign, $in: pausedCampaignIds };
      } else {
        const isPaused = pausedCampaignIds.some((id: any) => id.toString() === filter.campaign.toString());
        if (!isPaused) {
          filter.campaign = { $in: [] };
        }
      }
    } else {
      filter.campaign = { $in: pausedCampaignIds };
    }
    filter.status = { $in: [MessageStatus.PENDING, MessageStatus.QUEUED, 'pending', 'queued', 'PENDING', 'QUEUED'] };
  } else if (s === 'pending') {
    const rawPausedCampaignIds = await BlastCampaign.find({
      status: { $in: [CampaignStatus.PAUSED, 'paused', 'PAUSED'] },
    }).distinct('_id');
    const pausedCampaignIds = rawPausedCampaignIds.map((id: any) =>
      typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
    );

    const isSpecificCampaignId =
      filter.campaign instanceof mongoose.Types.ObjectId ||
      (typeof filter.campaign === 'string' && mongoose.Types.ObjectId.isValid(filter.campaign));

    // Exclude messages from paused campaigns
    if (filter.campaign) {
      if (!isSpecificCampaignId && typeof filter.campaign === 'object') {
        filter.campaign = { ...filter.campaign, $nin: pausedCampaignIds };
      } else {
        const isPaused = pausedCampaignIds.some((id: any) => id.toString() === filter.campaign.toString());
        if (isPaused) {
          filter.campaign = { $in: [] };
        }
      }
    } else {
      filter.campaign = { $nin: pausedCampaignIds };
    }

    filter.status = { $in: [MessageStatus.PENDING, MessageStatus.QUEUED, MessageStatus.SENDING, 'pending', 'queued', 'PENDING', 'QUEUED'] };

  } else if (s === 'expired') {
    const activeCampaignIds = await BlastCampaign.find({
      status: {
        $in: [
          CampaignStatus.RUNNING,
          CampaignStatus.PAUSED,
          CampaignStatus.DRAFT,
          'running',
          'paused',
          'scheduled',
          'draft',
          'RUNNING',
          'PAUSED',
          'SCHEDULED',
          'DRAFT',
        ],
      },
    }).distinct('_id');

    filter.$and = filter.$and || [];
    filter.$and.push({
      $or: [
        { status: { $in: [MessageStatus.EXPIRED, 'expired', 'EXPIRED'] } },
        {
          status: { $in: [MessageStatus.PENDING, MessageStatus.QUEUED, 'pending', 'queued', 'PENDING', 'QUEUED'] },
          campaign: { $nin: activeCampaignIds },
          $or: [
            { scheduled_at: { $lt: new Date() } },
            { scheduled_at: null, createdAt: { $lt: new Date() } },
            { scheduled_at: { $exists: false }, createdAt: { $lt: new Date() } },
          ],
        },
      ],
    });
  } else {
    filter.status = s;
  }
}
