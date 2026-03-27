import { ClaudeRunner } from './claudeRunner';
import { emit } from '../lib/typedEmit';
import * as workItemStore from '../services/workItemStore';
import * as projectStore from '../services/projectStore';
import { suggestAgent, getAgent } from '../services/agentRegistry';

export interface TeamsConfig {
  projectSlug: string;
  workItemSlugs: string[];
  maxWorkers?: number;
}

interface Worker {
  id: string;
  workItemSlug: string;
  taskId: string;
  taskTitle: string;
  agentName: string | null;
  status: 'running' | 'completed' | 'failed';
  runner: ClaudeRunner | null;
}

let workers: Worker[] = [];
let teamsActive = false;

export async function startTeams(config: TeamsConfig): Promise<void> {
  const { projectSlug, workItemSlugs, maxWorkers = 3 } = config;

  const project = projectStore.getProject(projectSlug);
  if (!project) throw new Error(`Project not found: ${projectSlug}`);
  if (!project.workingDir) throw new Error('Project has no working directory configured.');

  teamsActive = true;

  console.log('[teams] Emitting live:started', { projectSlug, workItemSlugs, maxWorkers });
  emit('live:started', { projectSlug, workItemSlugs, maxWorkers });

  // Process work items — for each, run tasks from Todo
  const taskQueue: { wiSlug: string; task: any }[] = [];
  for (const wiSlug of workItemSlugs) {
    const wi = workItemStore.getWorkItem(projectSlug, wiSlug);
    if (!wi) continue;
    for (const task of wi.columns['todo']) {
      taskQueue.push({ wiSlug, task });
    }
  }

  if (taskQueue.length === 0) throw new Error('No tasks in To Do across selected work items');

  // Execute with worker pool
  let idx = 0;
  const results: { success: number; failed: number } = { success: 0, failed: 0 };

  async function runNext(): Promise<void> {
    while (idx < taskQueue.length && teamsActive) {
      const { wiSlug, task } = taskQueue[idx++];

      // Suggest agent
      const suggestion = suggestAgent(task.tags || []);
      const agentName = task.agent || suggestion?.agent.name || null;
      const agent = agentName ? getAgent(agentName) : null;

      const workerId = `worker-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`;
      const worker: Worker = {
        id: workerId,
        workItemSlug: wiSlug,
        taskId: task.id,
        taskTitle: task.title,
        agentName,
        status: 'running',
        runner: new ClaudeRunner(),
      };
      workers.push(worker);

      emit('live:worker-assigned', { workerId, taskId: task.id, taskTitle: task.title, agentName, workItemSlug: wiSlug });

      // Move task to In Progress
      workItemStore.moveTask(projectSlug, wiSlug, task.id, { toColumn: 'in-progress', toIndex: 0 });
      const wiMoved = workItemStore.getWorkItem(projectSlug, wiSlug);
      if (wiMoved) emit('workItem:updated', { projectSlug, workItem: wiMoved });

      const wi = workItemStore.getWorkItem(projectSlug, wiSlug);
      const prompt = buildPrompt(project, wi, task, agent);

      let output = '';
      worker.runner!.on('output', (chunk: string) => {
        output += chunk;
        emit('live:output', { workerId, taskId: task.id, message: chunk });
      });

      try {
        const result = await worker.runner!.run({
          prompt,
          workingDir: project.workingDir!,
          model: agent?.model || task.model || 'sonnet',
        });

        worker.runner = null;

        if (result.exitCode === 0) {
          worker.status = 'completed';
          workItemStore.moveTask(projectSlug, wiSlug, task.id, { toColumn: 'review', toIndex: 0 });
          workItemStore.updateTask(projectSlug, wiSlug, task.id, { output: output || result.stdout });
          results.success++;
          emit('live:worker-completed', { workerId, taskId: task.id, status: 'completed' });
        } else {
          worker.status = 'failed';
          workItemStore.updateTask(projectSlug, wiSlug, task.id, { output: `EXIT: ${result.exitCode}\n${result.stderr || result.stdout}` });
          results.failed++;
          emit('live:worker-completed', { workerId, taskId: task.id, status: 'failed' });
        }

        // Broadcast metrics + work item update
        emit('live:metrics', {
          activeWorkers: workers.filter((w) => w.status === 'running').length,
          totalCompleted: results.success,
          totalFailed: results.failed,
          totalTasks: taskQueue.length,
        });
        const updatedWI = workItemStore.getWorkItem(projectSlug, wiSlug);
        if (updatedWI) emit('workItem:updated', { projectSlug, workItem: updatedWI });

      } catch (err) {
        worker.status = 'failed';
        worker.runner = null;
        results.failed++;
        emit('live:worker-completed', { workerId, taskId: task.id, status: 'failed' });
      }
    }
  }

  // Launch workers in parallel (up to maxWorkers)
  const workerPromises = [];
  for (let i = 0; i < Math.min(maxWorkers, taskQueue.length); i++) {
    workerPromises.push(runNext());
  }

  await Promise.all(workerPromises);

  teamsActive = false;
  workers = [];

  emit('live:stopped', { message: `Teams completed: ${results.success} done, ${results.failed} failed` });
}

export function stopTeams(): void {
  teamsActive = false;
  for (const w of workers) {
    if (w.runner) w.runner.stop();
  }
}

export function getTeamsState() {
  return {
    active: teamsActive,
    workers: workers.map((w) => ({
      id: w.id,
      workItemSlug: w.workItemSlug,
      taskId: w.taskId,
      taskTitle: w.taskTitle,
      agentName: w.agentName,
      status: w.status,
    })),
  };
}

function buildPrompt(project: any, wi: any, task: any, agent: any): string {
  const lines = [
    agent?.instructions ? `# Agent: ${agent.name}\n${agent.instructions}\n` : '',
    `# Task: ${task.title}`,
    task.description ? `\n## Description\n${task.description}` : '',
    `\n## Context`,
    `- Project: ${project.title}`,
    `- Work Item: ${wi?.title || 'Unknown'} (${wi?.category || 'unknown'})`,
    wi?.plan?.content ? `- Plan:\n${wi.plan.content}` : '',
    `\n## Instructions`,
    `Implement this task. Write clean, working code. Run tests if applicable.`,
  ].filter(Boolean);
  return lines.join('\n');
}
