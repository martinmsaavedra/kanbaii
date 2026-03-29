// src/server/engines/workerPool.ts

import { ClaudeRunner } from './claudeRunner';
import { selectAgent, buildPrompt } from './taskRouter';
import { emit } from '../lib/typedEmit';
import * as workItemStore from '../services/workItemStore';
import * as projectStore from '../services/projectStore';
import { getDocument } from '../services/soulStore';
import { createEscalation } from '../services/escalationService';
import { recordExecution } from '../services/costTracker';
import { buildSkillsPrompt } from '../services/skillsRegistry';
import { runHook } from '../services/pluginLoader';

export interface WorkerInfo {
  id: string;
  taskId: string;
  taskTitle: string;
  workItemSlug: string;
  agentName: string;
  model: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  exitCode?: number;
  output?: string;
}

interface CompletedResult {
  taskId: string;
  taskTitle: string;
  exitCode: number;
  success: boolean;
  durationMs: number;
  completedAt: string;
}

const MAX_COMPLETED_RESULTS = 100;
const MAX_WORKER_AGE_MS = 30 * 60 * 1000; // 30 minutes

let _workers: Map<string, { info: WorkerInfo; runner: ClaudeRunner }> = new Map();
let _completedResults: CompletedResult[] = [];
let _maxWorkers = 3;
let _projectSlug: string | null = null;
let _workItemSlugs: string[] = [];

export function initPool(projectSlug: string, workItemSlugs: string[], maxWorkers: number): void {
  _projectSlug = projectSlug;
  _workItemSlugs = workItemSlugs;
  _maxWorkers = maxWorkers;
  _workers.clear();
  _completedResults = [];
}

export function resetPool(): void {
  for (const { runner } of _workers.values()) {
    runner.stop();
  }
  _workers.clear();
  _completedResults = [];
  _projectSlug = null;
}

export function getPoolStatus() {
  const active = [..._workers.values()].filter(w => w.info.status === 'running');
  return {
    activeWorkers: active.length,
    maxWorkers: _maxWorkers,
    availableSlots: Math.max(0, _maxWorkers - active.length),
    workers: [..._workers.values()].map(w => w.info),
    completedResults: _completedResults,
    stats: {
      completed: _completedResults.filter(r => r.success).length,
      failed: _completedResults.filter(r => !r.success).length,
      total: _completedResults.length,
    },
  };
}

export function getCompletedResults(): CompletedResult[] {
  return [..._completedResults];
}

/**
 * Assign a task to a worker. Spawns a ClaudeRunner process.
 * Called by the backend when coordinator's MCP tool calls assign_task.
 */
export async function assignTask(opts: {
  taskId: string;
  agent?: string;
  model?: string;
  additionalContext?: string;
}): Promise<{ workerId: string } | { error: string }> {
  if (!_projectSlug) return { error: 'Pool not initialized' };

  const activeCount = [..._workers.values()].filter(w => w.info.status === 'running').length;
  if (activeCount >= _maxWorkers) return { error: `No available worker slots (${activeCount}/${_maxWorkers})` };

  // Find the task across work items
  let foundTask: any = null;
  let foundWiSlug: string = '';
  for (const wiSlug of _workItemSlugs) {
    const wi = workItemStore.getWorkItem(_projectSlug, wiSlug);
    if (!wi) continue;
    for (const col of Object.values(wi.columns) as any[]) {
      if (!Array.isArray(col)) continue;
      const task = col.find((t: any) => t.id === opts.taskId);
      if (task) { foundTask = task; foundWiSlug = wiSlug; break; }
    }
    if (foundTask) break;
  }

  if (!foundTask) return { error: `Task ${opts.taskId} not found` };

  const project = projectStore.getProject(_projectSlug);
  if (!project?.workingDir) return { error: 'No working directory' };

  // Move to in-progress
  workItemStore.moveTask(_projectSlug, foundWiSlug, opts.taskId, { toColumn: 'in-progress', toIndex: 0 });
  const wiUpdated = workItemStore.getWorkItem(_projectSlug, foundWiSlug);
  if (wiUpdated) emit('workItem:updated' as any, { projectSlug: _projectSlug, workItem: wiUpdated });

  // Select agent + build prompt
  const taskForRouting = { ...foundTask, agent: opts.agent || foundTask.agent };
  const { agent } = selectAgent(taskForRouting);
  const effectiveModel = opts.model || foundTask.model || agent.model || 'sonnet';

  const soulSummary = (() => { try { return getDocument(_projectSlug!, 'SOUL.md')?.content || ''; } catch { return ''; } })();
  const wi = workItemStore.getWorkItem(_projectSlug, foundWiSlug);

  const completedIds = _completedResults.filter(r => r.success).map(r => r.taskId);
  const failedIds = _completedResults.filter(r => !r.success).map(r => r.taskId);

  let prompt = buildPrompt(
    taskForRouting, agent, soulSummary,
    completedIds, failedIds,
    project.title || _projectSlug, wi?.title || foundWiSlug,
  );

  if (opts.additionalContext) {
    prompt += `\n\n## Additional Context from Coordinator\n${opts.additionalContext}`;
  }

  const workerId = `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 4)}`;

  const workerInfo: WorkerInfo = {
    id: workerId,
    taskId: opts.taskId,
    taskTitle: foundTask.title,
    workItemSlug: foundWiSlug,
    agentName: agent.name,
    model: effectiveModel,
    status: 'running',
    startedAt: new Date().toISOString(),
  };

  const runner = new ClaudeRunner();
  _workers.set(workerId, { info: workerInfo, runner });

  emit('live:worker-assigned' as any, {
    workerId, taskId: opts.taskId, taskTitle: foundTask.title,
    agentName: agent.name, workItemSlug: foundWiSlug,
  });

  // Build skills prompt for worker (same as Ralph does)
  const skillsPrompt = buildSkillsPrompt();

  // Run async — don't await (coordinator will poll via check_workers/wait_for_completion)
  (async () => {
    let output = '';
    runner.on('output', (chunk: string) => {
      output += chunk;
      emit('live:output' as any, { workerId, taskId: opts.taskId, message: chunk });
    });
    runner.on('escalation', (data: any) => {
      createEscalation({
        source: 'teams', taskId: opts.taskId, taskTitle: foundTask.title,
        question: data.question, options: data.input?.options || [],
      });
    });

    // Plugin: preTask hook
    await runHook('preTask', { taskId: opts.taskId, title: foundTask.title, workingDir: project.workingDir! });

    try {
      const result = await runner.run({
        prompt, workingDir: project.workingDir!, model: effectiveModel, maxTurns: 50,
        systemPrompt: skillsPrompt || undefined,
      });

      workerInfo.status = result.exitCode === 0 ? 'completed' : 'failed';
      workerInfo.exitCode = result.exitCode;
      workerInfo.completedAt = new Date().toISOString();
      workerInfo.output = output || result.stdout;

      // Plugin: postTask hook
      await runHook('postTask', { taskId: opts.taskId, title: foundTask.title, exitCode: result.exitCode, output });

      // Move task based on result
      if (result.exitCode === 0) {
        workItemStore.moveTask(_projectSlug!, foundWiSlug, opts.taskId, { toColumn: 'review', toIndex: 0 });
      }
      workItemStore.updateTask(_projectSlug!, foundWiSlug, opts.taskId, { output: output || result.stdout });

      _completedResults.push({
        taskId: opts.taskId, taskTitle: foundTask.title,
        exitCode: result.exitCode, success: result.exitCode === 0,
        durationMs: result.duration, completedAt: new Date().toISOString(),
      });

      try {
        recordExecution({
          projectSlug: _projectSlug!, workItemSlug: foundWiSlug,
          taskId: opts.taskId, taskTitle: foundTask.title,
          model: effectiveModel, duration: result.duration,
          inputTokens: 0, outputTokens: 0, cacheTokens: 0,
          status: result.exitCode === 0 ? 'success' : 'failed',
        });
      } catch {}

      const wiAfter = workItemStore.getWorkItem(_projectSlug!, foundWiSlug);
      if (wiAfter) emit('workItem:updated' as any, { projectSlug: _projectSlug, workItem: wiAfter });

      // Auto-promote work item to 'review' if all tasks are done/review
      const wiPromoted = workItemStore.promoteWorkItemIfComplete(_projectSlug!, foundWiSlug);
      if (wiPromoted && wiPromoted.status === 'review') {
        emit('workItem:updated' as any, { projectSlug: _projectSlug, workItem: wiPromoted });
      }

      emit('live:worker-completed' as any, {
        workerId, taskId: opts.taskId,
        status: result.exitCode === 0 ? 'completed' : 'failed',
      });

    } catch (err) {
      workerInfo.status = 'failed';
      workerInfo.exitCode = -1;
      workerInfo.completedAt = new Date().toISOString();
      _completedResults.push({
        taskId: opts.taskId, taskTitle: foundTask.title,
        exitCode: -1, success: false, durationMs: 0, completedAt: new Date().toISOString(),
      });
      emit('live:worker-completed' as any, { workerId, taskId: opts.taskId, status: 'failed' });
    }

    emit('live:metrics' as any, {
      activeWorkers: [..._workers.values()].filter(w => w.info.status === 'running').length,
      totalCompleted: _completedResults.filter(r => r.success).length,
      totalFailed: _completedResults.filter(r => !r.success).length,
      totalTasks: _completedResults.length,
    });
    cleanup();
  })();

  return { workerId };
}

export function stopAllWorkers(): void {
  for (const { runner } of _workers.values()) {
    try { runner.stop(); } catch {}
  }
}

function cleanup(): void {
  const now = Date.now();
  for (const [id, { info }] of _workers) {
    if (info.status !== 'running' && info.completedAt) {
      const age = now - new Date(info.completedAt).getTime();
      if (age > MAX_WORKER_AGE_MS) _workers.delete(id);
    }
  }
  if (_completedResults.length > MAX_COMPLETED_RESULTS) {
    _completedResults = _completedResults.slice(-MAX_COMPLETED_RESULTS);
  }
}
