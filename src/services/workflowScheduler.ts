import cron, { ScheduledTask } from 'node-cron';
import { Workflow, IWorkflow } from '../models/Workflow.js';
import { executeCronWorkflow } from './workflowRunner.js';

const scheduledJobs = new Map<string, ScheduledTask>();

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

  try {
    const task = cron.schedule(expression, async () => {
      console.log(`⏰ [WorkflowScheduler] Triggering cron workflow ${workflowId} (${workflow.name})`);
      try {
        await executeCronWorkflow(workflowId);
      } catch (err) {
        console.error(`[WorkflowScheduler] Execution error on workflow ${workflowId}:`, err);
      }
    });

    scheduledJobs.set(workflowId, task);
    console.log(`✅ [WorkflowScheduler] Scheduled workflow ${workflowId} (${workflow.name}) with cron: ${expression}`);
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
    scheduledJobs.delete(workflowId);
    console.log(`🛑 [WorkflowScheduler] Unscheduled workflow ${workflowId}`);
  }
}

export async function initWorkflowScheduler() {
  console.log('🔄 [WorkflowScheduler] Initializing workflow cron scheduler...');

  // Stop any existing jobs in memory
  for (const [id, job] of scheduledJobs.entries()) {
    try {
      job.stop();
    } catch (_) {}
  }
  scheduledJobs.clear();

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
