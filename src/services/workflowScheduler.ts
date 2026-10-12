import cron, { ScheduledTask } from 'node-cron';
import { Workflow, IWorkflow } from '../models/Workflow.js';
import { executeCronWorkflow, isWorkflowRunning } from './workflowRunner.js';

const scheduledJobs = new Map<string, ScheduledTask>();
const DEFAULT_WORKFLOW_TIMEZONE = 'Asia/Kuala_Lumpur';

function resolveTimezone(tz?: string): string {
  // The model defaults trigger_config.timezone to 'UTC' and the UI never sets it, while
  // crons historically ran in the server TZ (Asia/Kuala_Lumpur). Treat that default as
  // "unset" so existing schedules don't shift by 8 hours.
  const trimmed = (tz || '').trim();
  const candidate = trimmed && trimmed.toUpperCase() !== 'UTC' ? trimmed : DEFAULT_WORKFLOW_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate });
    return candidate;
  } catch (_) {
    console.warn(`[WorkflowScheduler] Invalid timezone '${candidate}', falling back to ${DEFAULT_WORKFLOW_TIMEZONE}`);
    return DEFAULT_WORKFLOW_TIMEZONE;
  }
}

export function isCronValid(expression: string): boolean {
  if (!expression || typeof expression !== 'string') return false;
  return cron.validate(expression.trim());
}

export function scheduleWorkflowJob(workflow: IWorkflow) {
  const workflowId = String(workflow._id);

  // Unschedule existing job if any
  unscheduleWorkflowJob(workflowId);

  if (!workflow.is_active || workflow.trigger_type !== 'CRON') {
    return;
  }

  const expression = workflow.trigger_config?.cron_expression?.trim();
  if (!expression || !cron.validate(expression)) {
    console.warn(`[WorkflowScheduler] Invalid cron expression '${expression}' for workflow ${workflowId} (${workflow.name})`);
    return;
  }

  const timezone = resolveTimezone(workflow.trigger_config?.timezone);

  try {
    const task = cron.schedule(expression, async () => {
      if (isWorkflowRunning(workflowId)) {
        console.warn(`[WorkflowScheduler] Workflow ${workflowId} (${workflow.name}) is still running; skipping this tick.`);
        return;
      }
      console.log(`⏰ [WorkflowScheduler] Triggering cron workflow ${workflowId} (${workflow.name})`);
      try {
        await executeCronWorkflow(workflowId);
      } catch (err) {
        console.error(`[WorkflowScheduler] Execution error on workflow ${workflowId}:`, err);
      }
    }, {
      noOverlap: true,
      timezone,
      name: `workflow_${workflowId}`,
    });

    scheduledJobs.set(workflowId, task);
    console.log(`✅ [WorkflowScheduler] Scheduled workflow ${workflowId} (${workflow.name}) with cron: ${expression} (${timezone})`);
  } catch (err) {
    console.error(`[WorkflowScheduler] Failed to schedule cron for workflow ${workflowId}:`, err);
  }
}

export function unscheduleWorkflowJob(workflowId: string) {
  const existingJob = scheduledJobs.get(workflowId);
  if (existingJob) {
    try {
      existingJob.stop();
    } catch (_) {}
    try {
      // destroy() also removes the task from node-cron's internal registry (stop() alone leaks it)
      void existingJob.destroy();
    } catch (_) {}
    scheduledJobs.delete(workflowId);
    console.log(`🛑 [WorkflowScheduler] Unscheduled workflow ${workflowId}`);
  }
}

/** Stops every scheduled workflow cron job (used on graceful shutdown / re-init). */
export function stopAllWorkflowJobs() {
  for (const job of scheduledJobs.values()) {
    try {
      job.stop();
    } catch (_) {}
    try {
      // destroy() also removes the task from node-cron's internal registry
      void job.destroy();
    } catch (_) {}
  }
  scheduledJobs.clear();
}

export async function initWorkflowScheduler() {
  console.log('🔄 [WorkflowScheduler] Initializing workflow cron scheduler...');

  // Stop any existing jobs in memory
  stopAllWorkflowJobs();

  try {
    const activeCronWorkflows = await Workflow.find({
      trigger_type: 'CRON',
      is_active: true,
    });

    for (const wf of activeCronWorkflows) {
      scheduleWorkflowJob(wf);
    }

    console.log(`🚀 [WorkflowScheduler] Initialized ${scheduledJobs.size} cron workflows.`);
  } catch (err) {
    console.error('[WorkflowScheduler] Failed to initialize cron workflows from DB:', err);
  }
}
