import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware.js';
import { Workflow, IWorkflow } from '../models/Workflow.js';
import { WorkflowLog } from '../models/WorkflowLog.js';
import { WhatsAppSession } from '../models/WhatsAppSession.js';
import { scheduleWorkflowJob, unscheduleWorkflowJob } from '../services/workflowScheduler.js';
import { executeManualWorkflow } from '../services/workflowRunner.js';

const router = Router();

router.use(authenticateToken);

function formatWorkflow(w: IWorkflow | any) {
  const obj = w.toObject ? w.toObject() : w;
  const { _id, __v, ...rest } = obj;
  return {
    id: _id ? _id.toString() : obj.id,
    _id: _id ? _id.toString() : obj.id,
    ...rest,
  };
}

// GET /workflows
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { trigger_type, is_active, search } = req.query;
    const query: any = { user: req.user?._id };

    if (trigger_type) {
      query.trigger_type = String(trigger_type).toUpperCase();
    }
    if (is_active !== undefined) {
      query.is_active = is_active === 'true';
    }
    if (search && typeof search === 'string') {
      query.name = { $regex: search.trim(), $options: 'i' };
    }

    const workflows = await Workflow.find(query).sort({ updatedAt: -1 });
    return res.json(workflows.map(formatWorkflow));
  } catch (err: any) {
    console.error('Error fetching workflows:', err);
    return res.status(500).json({ error: 'Failed to fetch workflows' });
  }
});

// GET /workflows/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const workflow = await Workflow.findOne({ _id: req.params.id, user: req.user?._id });
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    return res.json(formatWorkflow(workflow));
  } catch (err: any) {
    console.error('Error fetching workflow:', err);
    return res.status(500).json({ error: 'Failed to fetch workflow' });
  }
});

// POST /workflows
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const {
      name,
      description,
      trigger_type,
      trigger_config,
      action_config,
      templates,
      is_active,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Workflow name is required' });
    }

    if (!trigger_type || !['CRON', 'REPLY', 'MANUAL'].includes(trigger_type)) {
      return res.status(400).json({ error: 'Invalid trigger type' });
    }

    const workflow = await Workflow.create({
      user: req.user?._id,
      name: name.trim(),
      description: description || '',
      is_active: is_active !== undefined ? Boolean(is_active) : true,
      trigger_type,
      trigger_config: trigger_config || {},
      action_config: action_config || {},
      templates: Array.isArray(templates) ? templates : [],
      stats: {
        triggered_count: 0,
        sent_count: 0,
        failed_count: 0,
      },
    });

    if (workflow.trigger_type === 'CRON' && workflow.is_active) {
      scheduleWorkflowJob(workflow);
    }

    return res.status(201).json(formatWorkflow(workflow));
  } catch (err: any) {
    console.error('Error creating workflow:', err);
    return res.status(500).json({ error: err.message || 'Failed to create workflow' });
  }
});

// PATCH /workflows/:id or PUT /workflows/:id
const updateWorkflowHandler = async (req: AuthRequest, res: Response) => {
  try {
    const {
      name,
      description,
      trigger_type,
      trigger_config,
      action_config,
      templates,
      is_active,
    } = req.body;

    const existing = await Workflow.findOne({ _id: req.params.id, user: req.user?._id });
    if (!existing) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    if (name !== undefined) existing.name = name.trim();
    if (description !== undefined) existing.description = description;
    if (trigger_type !== undefined) existing.trigger_type = trigger_type;
    if (trigger_config !== undefined) existing.trigger_config = trigger_config;
    if (action_config !== undefined) existing.action_config = action_config;
    if (templates !== undefined) existing.templates = templates;
    if (is_active !== undefined) existing.is_active = Boolean(is_active);

    await existing.save();

    if (existing.trigger_type === 'CRON') {
      if (existing.is_active) {
        scheduleWorkflowJob(existing);
      } else {
        unscheduleWorkflowJob(String(existing._id));
      }
    } else {
      unscheduleWorkflowJob(String(existing._id));
    }

    return res.json(formatWorkflow(existing));
  } catch (err: any) {
    console.error('Error updating workflow:', err);
    return res.status(500).json({ error: err.message || 'Failed to update workflow' });
  }
};

router.patch('/:id', updateWorkflowHandler);
router.put('/:id', updateWorkflowHandler);

// PATCH /workflows/:id/toggle
router.patch('/:id/toggle', async (req: AuthRequest, res: Response) => {
  try {
    const workflow = await Workflow.findOne({ _id: req.params.id, user: req.user?._id });
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    workflow.is_active = !workflow.is_active;
    await workflow.save();

    if (workflow.trigger_type === 'CRON') {
      if (workflow.is_active) {
        scheduleWorkflowJob(workflow);
      } else {
        unscheduleWorkflowJob(String(workflow._id));
      }
    }

    return res.json(formatWorkflow(workflow));
  } catch (err: any) {
    console.error('Error toggling workflow status:', err);
    return res.status(500).json({ error: 'Failed to toggle workflow status' });
  }
});

// DELETE /workflows/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const workflow = await Workflow.findOneAndDelete({ _id: req.params.id, user: req.user?._id });
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    unscheduleWorkflowJob(String(workflow._id));
    await WorkflowLog.deleteMany({ workflow: workflow._id });

    return res.json({ success: true, message: 'Workflow deleted' });
  } catch (err: any) {
    console.error('Error deleting workflow:', err);
    return res.status(500).json({ error: 'Failed to delete workflow' });
  }
});

// POST /workflows/:id/run-now
router.post('/:id/run-now', async (req: AuthRequest, res: Response) => {
  try {
    const workflow = await Workflow.findOne({ _id: req.params.id, user: req.user?._id });
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    // Execute asynchronously in background to not block response
    executeManualWorkflow(String(workflow._id), String(req.user?._id)).catch((err) => {
      console.error(`[Workflow Run-Now] Error executing workflow ${workflow._id}:`, err);
    });

    return res.json({
      success: true,
      message: 'Workflow execution started in background.',
    });
  } catch (err: any) {
    console.error('Error triggering workflow run:', err);
    return res.status(500).json({ error: err.message || 'Failed to execute workflow' });
  }
});

// GET /workflows/:id/logs
router.get('/:id/logs', async (req: AuthRequest, res: Response) => {
  try {
    const { page = '1', limit = '50', status } = req.query;
    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const query: any = { workflow: req.params.id, user: req.user?._id };
    if (status && typeof status === 'string') {
      query.status = status.toUpperCase();
    }

    const [logs, total, sessions] = await Promise.all([
      WorkflowLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      WorkflowLog.countDocuments(query),
      WhatsAppSession.find({ user: req.user?._id }).select('session_id alias phone_number').lean(),
    ]);

    const sessionMap = new Map<string, { alias?: string; phone_number?: string }>();
    for (const s of sessions) {
      sessionMap.set(s.session_id, { alias: s.alias, phone_number: s.phone_number });
    }

    return res.json({
      logs: logs.map((l) => {
        const sessInfo = l.session_id ? sessionMap.get(l.session_id) : undefined;
        let sessionDisplay = l.session_id || '—';
        if (sessInfo) {
          if (sessInfo.alias && sessInfo.phone_number) {
            sessionDisplay = `${sessInfo.alias} (${sessInfo.phone_number})`;
          } else if (sessInfo.alias) {
            sessionDisplay = sessInfo.alias;
          } else if (sessInfo.phone_number) {
            sessionDisplay = sessInfo.phone_number;
          }
        }

        return {
          id: l._id.toString(),
          workflow: l.workflow,
          trigger_type: l.trigger_type,
          recipient_phone: l.recipient_phone,
          session_id: l.session_id,
          session_display: sessionDisplay,
          session_alias: sessInfo?.alias,
          session_phone: sessInfo?.phone_number,
          status: l.status,
          message_id: l.message_id,
          error_message: l.error_message,
          trigger_details: l.trigger_details,
          createdAt: l.createdAt,
        };
      }),
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err: any) {
    console.error('Error fetching workflow logs:', err);
    return res.status(500).json({ error: 'Failed to fetch workflow logs' });
  }
});

// DELETE /workflows/:id/logs (Reset/clear logs and reset execution stats)
router.delete('/:id/logs', async (req: AuthRequest, res: Response) => {
  try {
    const workflow = await Workflow.findOne({ _id: req.params.id, user: req.user?._id });
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const result = await WorkflowLog.deleteMany({ workflow: workflow._id });

    workflow.stats = {
      triggered_count: 0,
      sent_count: 0,
      failed_count: 0,
      last_run_at: undefined,
    };
    await workflow.save();

    return res.json({
      success: true,
      message: `Cleared ${result.deletedCount} log(s) and reset stats.`,
      workflow: formatWorkflow(workflow),
    });
  } catch (err: any) {
    console.error('Error clearing workflow logs:', err);
    return res.status(500).json({ error: 'Failed to clear workflow logs' });
  }
});

export default router;
