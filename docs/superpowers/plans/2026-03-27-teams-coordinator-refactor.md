# Teams Coordinator Refactor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace KANBAII's independent-process-per-task Teams engine with a Coordinator + Scheduler architecture (ported from agency-kanban) where a singleton orchestrator resolves dependencies, executes parallel groups, manages retries/budget, and persists state for recovery.

**Architecture:** The Coordinator is a singleton that reads project SOUL, resolves task dependencies via topological sort into parallel groups, and executes groups sequentially (tasks within each group run concurrently via Promise.all). Each task is dispatched to the existing ClaudeRunner. The Coordinator owns task lifecycle: agent selection, prompt enrichment with constitution + completed-task context, retry with model escalation, budget checking, and circuit breaker. State is persisted to JSON for crash recovery.

**Tech Stack:** Node.js, TypeScript, ClaudeRunner (existing), Socket.IO events, JSON file persistence

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/server/engines/coordinator.ts` | **Create** | Coordinator singleton: state, orchestration loop, task execution, retry, persistence |
| `src/server/engines/dependencyResolver.ts` | **Create** | Topological sort (Kahn's algorithm), parallel groups, cycle detection, blocked propagation |
| `src/server/engines/taskRouter.ts` | **Create** | Agent selection for tasks, prompt building with constitution context |
| `src/server/engines/teams.ts` | **Rewrite** | Thin wrapper: validates config, calls coordinator.start(), exposes stop/pause/resume/getState |
| `src/server/engines/runStore.ts` | **Modify** | Add coordinator run type support |
| `src/shared/types.ts` | **Modify** | Add coordinator socket events + Task.depends field |

---

### Task 1: Dependency Resolver

**Files:**
- Create: `src/server/engines/dependencyResolver.ts`

This is a pure function with no side effects — perfect for TDD.

- [ ] **Step 1: Create the dependency resolver**

```typescript
// src/server/engines/dependencyResolver.ts

export interface TaskNode {
  id: string;
  title: string;
  depends?: string[];
}

export interface ResolvedPlan {
  executionOrder: string[];
  parallelGroups: string[][];
  blocked: Map<string, string[]>;
}

export class CyclicDependencyError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`Cyclic dependency detected: ${cycle.join(' → ')}`);
    this.name = 'CyclicDependencyError';
  }
}

/**
 * Kahn's algorithm: topological sort with parallel group detection.
 * Tasks with no remaining dependencies form a parallel group.
 * Groups execute sequentially; tasks within a group run concurrently.
 */
export function resolveDependencies(tasks: TaskNode[]): ResolvedPlan {
  const idSet = new Set(tasks.map(t => t.id));

  // Build adjacency
  const inDeps = new Map<string, Set<string>>();
  const outDeps = new Map<string, Set<string>>();

  for (const task of tasks) {
    if (!inDeps.has(task.id)) inDeps.set(task.id, new Set());
    if (!outDeps.has(task.id)) outDeps.set(task.id, new Set());

    for (const depId of task.depends ?? []) {
      if (!idSet.has(depId)) continue; // external dep, skip
      inDeps.get(task.id)!.add(depId);
      if (!outDeps.has(depId)) outDeps.set(depId, new Set());
      outDeps.get(depId)!.add(task.id);
    }
  }

  const executionOrder: string[] = [];
  const parallelGroups: string[][] = [];
  const queue: string[] = [];

  for (const task of tasks) {
    if (inDeps.get(task.id)!.size === 0) queue.push(task.id);
  }

  let visited = 0;
  while (queue.length > 0) {
    const group = [...queue];
    parallelGroups.push(group);
    queue.length = 0;

    for (const id of group) {
      executionOrder.push(id);
      visited++;
      for (const dependentId of outDeps.get(id) ?? []) {
        const deps = inDeps.get(dependentId)!;
        deps.delete(id);
        if (deps.size === 0) queue.push(dependentId);
      }
    }
  }

  if (visited !== tasks.length) {
    // Cycle: find it via DFS
    const cycle = findCycle(tasks, inDeps);
    throw new CyclicDependencyError(cycle);
  }

  return { executionOrder, parallelGroups, blocked: new Map() };
}

/**
 * Propagate failures: if a task failed, all tasks depending on it are blocked.
 */
export function applyFailedDependencies(
  plan: ResolvedPlan,
  tasks: TaskNode[],
  failedIds: Set<string>
): ResolvedPlan {
  if (failedIds.size === 0) return plan;

  const blocked = new Map<string, string[]>(plan.blocked);
  const toBlock = new Set<string>();
  const queue = [...failedIds];

  while (queue.length > 0) {
    const failedId = queue.shift()!;
    for (const task of tasks) {
      if (task.depends?.includes(failedId) && !toBlock.has(task.id) && !failedIds.has(task.id)) {
        toBlock.add(task.id);
        blocked.set(task.id, [...(blocked.get(task.id) ?? []), failedId]);
        queue.push(task.id);
      }
    }
  }

  const executionOrder = plan.executionOrder.filter(id => !toBlock.has(id) && !failedIds.has(id));
  const parallelGroups = plan.parallelGroups
    .map(g => g.filter(id => !toBlock.has(id) && !failedIds.has(id)))
    .filter(g => g.length > 0);

  return { executionOrder, parallelGroups, blocked };
}

function findCycle(tasks: TaskNode[], inDeps: Map<string, Set<string>>): string[] {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  function dfs(id: string): boolean {
    if (stack.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    stack.add(id);
    path.push(id);
    for (const depId of inDeps.get(id) ?? []) {
      if (dfs(depId)) return true;
    }
    stack.delete(id);
    path.pop();
    return false;
  }

  for (const task of tasks) {
    if (!visited.has(task.id) && dfs(task.id)) {
      const cycleStart = path[path.length - 1];
      const idx = path.indexOf(cycleStart);
      return [...path.slice(idx), cycleStart];
    }
  }
  return ['(unknown cycle)'];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/engines/dependencyResolver.ts
git commit -m "feat(coordinator): add dependency resolver with topological sort"
```

---

### Task 2: Task Router (Agent Selection + Prompt Building)

**Files:**
- Create: `src/server/engines/taskRouter.ts`

- [ ] **Step 1: Create the task router**

```typescript
// src/server/engines/taskRouter.ts

import { suggestAgent, getAgent, Agent } from '../services/agentRegistry';

export interface TaskForRouting {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  agent?: string;
  model?: string;
}

export interface AgentSelection {
  agent: Agent;
  selectionReason: string;
}

export function selectAgent(task: TaskForRouting): AgentSelection {
  // Explicit assignment wins
  if (task.agent) {
    const explicit = getAgent(task.agent);
    if (explicit) return { agent: explicit, selectionReason: `explicit: ${task.agent}` };
  }

  // Auto-select by tags
  const suggestion = suggestAgent(task.tags || []);
  if (suggestion) {
    return { agent: suggestion.agent, selectionReason: `auto: ${suggestion.agent.name} (score ${suggestion.score})` };
  }

  // Fallback: CoderAgent
  const fallback = getAgent('CoderAgent');
  return { agent: fallback!, selectionReason: 'fallback: CoderAgent' };
}

export function buildPrompt(
  task: TaskForRouting,
  agent: Agent,
  soulSummary: string,
  completedTaskIds: string[],
  failedTaskIds: string[],
  projectTitle: string,
  workItemTitle: string,
): string {
  const parts: string[] = [];

  // Agent identity
  if (agent.instructions) {
    parts.push(`# Agent: ${agent.name}\n${agent.instructions}\n`);
  }

  // Soul/Constitution context
  if (soulSummary) {
    parts.push(`# Project Context\n${soulSummary}\n`);
  }

  // Task details
  parts.push(`# Task: ${task.title}`);
  if (task.description) parts.push(`\n## Description\n${task.description}`);

  parts.push(`\n## Project Info`);
  parts.push(`- Project: ${projectTitle}`);
  parts.push(`- Work Item: ${workItemTitle}`);

  // Dependency context
  if (completedTaskIds.length > 0) {
    parts.push(`\n## Previously Completed Tasks`);
    parts.push(`These tasks are done: ${completedTaskIds.map(id => '`' + id + '`').join(', ')}. Your work must be compatible.`);
  }
  if (failedTaskIds.length > 0) {
    parts.push(`\n## Failed Tasks (avoid their approach)`);
    parts.push(`These tasks failed: ${failedTaskIds.map(id => '`' + id + '`').join(', ')}.`);
  }

  parts.push(`\n## Instructions`);
  parts.push(`Implement this task. Write clean, working code. Run tests if applicable.`);
  parts.push(`If blocked, use escalate_to_human MCP tool (not AskUserQuestion).`);

  return parts.join('\n');
}

export function escalateModel(model: string): string {
  if (model === 'haiku') return 'sonnet';
  if (model === 'sonnet') return 'opus';
  return 'opus';
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/engines/taskRouter.ts
git commit -m "feat(coordinator): add task router for agent selection + prompt building"
```

---

### Task 3: Coordinator Singleton

**Files:**
- Create: `src/server/engines/coordinator.ts`
- Modify: `src/shared/types.ts` (add coordinator events)

This is the core orchestration engine. It is a singleton module with state management, persistence, and the main execution loop.

- [ ] **Step 1: Add coordinator socket events to types.ts**

In `src/shared/types.ts`, add these events to the `ServerToClientEvents` interface:

```typescript
// Coordinator events
'coordinator:started': (data: { projectSlug: string; total: number; parallelGroups: string[][] }) => void;
'coordinator:progress': (data: { status: string; current: number; total: number; currentParallelTaskIds: string[]; stats: any; failedTasks: any[] }) => void;
'coordinator:task-assigned': (data: { taskId: string; taskTitle: string; agentName: string; model: string; groupIndex: number }) => void;
'coordinator:task-completed': (data: { taskId: string; taskTitle: string; status: string; exitCode?: number; retriesUsed?: number }) => void;
'coordinator:task-blocked': (data: { taskId: string; taskTitle: string; blockedBy: string[] }) => void;
'coordinator:retry': (data: { taskId: string; taskTitle: string; attempt: number; model: string }) => void;
'coordinator:group-started': (data: { groupIndex: number; totalGroups: number; taskIds: string[]; parallel: boolean }) => void;
'coordinator:completed': (data: { stats: any; message: string; interrupted?: boolean; failedTasks?: any[] }) => void;
'coordinator:error': (data: { message: string }) => void;
'coordinator:paused': (data: { current: number; total: number }) => void;
```

- [ ] **Step 2: Create the coordinator**

```typescript
// src/server/engines/coordinator.ts

import fs from 'fs';
import path from 'path';
import { ClaudeRunner } from './claudeRunner';
import { resolveDependencies, applyFailedDependencies, CyclicDependencyError, TaskNode } from './dependencyResolver';
import { selectAgent, buildPrompt, escalateModel } from './taskRouter';
import { emit } from '../lib/typedEmit';
import * as workItemStore from '../services/workItemStore';
import * as projectStore from '../services/projectStore';
import { getSoul } from '../services/soulStore';
import { createEscalation } from '../services/escalationService';
import { recordExecution } from '../services/costTracker';

// ── Types ─────────────────────────────────────────────────────────────────

export type CoordinatorStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'error';

export interface CoordinatorConfig {
  projectSlug: string;
  workItemSlugs: string[];
  maxWorkers?: number;
  model?: string;
  maxRetries?: number;
  maxTurns?: number;
}

interface FailedTask {
  id: string;
  title: string;
  reason: string;
  retryCount: number;
}

interface CoordinatorStats {
  completed: number;
  failed: number;
  skipped: number;
  retries: number;
  durationMs: number;
  startedAt: string;
}

export interface CoordinatorState {
  status: CoordinatorStatus;
  projectSlug: string | null;
  executedTasks: string[];
  failedTasks: FailedTask[];
  currentTaskId: string | null;
  currentParallelTaskIds: string[];
  executionPlan: string[];
  parallelGroups: string[][];
  stats: CoordinatorStats;
  error: string | null;
}

// ── Singleton state ───────────────────────────────────────────────────────

const STATE_FILE = path.resolve(process.cwd(), 'data', '.coordinator-state.json');

let _state: CoordinatorState = {
  status: 'idle',
  projectSlug: null,
  executedTasks: [],
  failedTasks: [],
  currentTaskId: null,
  currentParallelTaskIds: [],
  executionPlan: [],
  parallelGroups: [],
  stats: { completed: 0, failed: 0, skipped: 0, retries: 0, durationMs: 0, startedAt: '' },
  error: null,
};

let _stopRequested = false;
let _pauseRequested = false;
let _consecutiveErrors = 0;
let _activeRunners: ClaudeRunner[] = [];

// ── Persistence ───────────────────────────────────────────────────────────

function persistState(): void {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(_state, null, 2), 'utf-8');
  } catch {}
}

function loadPersistedState(): void {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      if (raw.status === 'running' || raw.status === 'paused') {
        raw.status = 'stopped';
        raw.error = 'Coordinator stopped: server restarted';
      }
      _state = { ..._state, ...raw };
    }
  } catch {}
}

loadPersistedState();

// ── Helpers ───────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function emitProgress(): void {
  emit('coordinator:progress' as any, {
    status: _state.status,
    current: _state.stats.completed + _state.stats.failed + _state.stats.skipped,
    total: _state.executionPlan.length,
    currentParallelTaskIds: _state.currentParallelTaskIds,
    stats: { ..._state.stats },
    failedTasks: [..._state.failedTasks],
  });
}

function getSoulSummary(projectSlug: string): string {
  try {
    const soul = getSoul(projectSlug);
    return soul?.content || '';
  } catch { return ''; }
}

// ── Main orchestration ────────────────────────────────────────────────────

export async function startCoordinator(config: CoordinatorConfig): Promise<void> {
  const { projectSlug, workItemSlugs, maxWorkers = 3, model: defaultModel, maxRetries = 2, maxTurns = 50 } = config;

  const project = projectStore.getProject(projectSlug);
  if (!project) throw new Error(`Project not found: ${projectSlug}`);
  if (!project.workingDir) throw new Error('Project has no working directory configured.');

  if (_state.status === 'running') throw new Error('Coordinator is already running');

  // Reset state
  _stopRequested = false;
  _pauseRequested = false;
  _consecutiveErrors = 0;
  _activeRunners = [];

  const startedAt = Date.now();

  _state = {
    status: 'running',
    projectSlug,
    executedTasks: [],
    failedTasks: [],
    currentTaskId: null,
    currentParallelTaskIds: [],
    executionPlan: [],
    parallelGroups: [],
    stats: { completed: 0, failed: 0, skipped: 0, retries: 0, durationMs: 0, startedAt: new Date().toISOString() },
    error: null,
  };

  // Collect all tasks from selected work items
  const allTasks: { wiSlug: string; task: any }[] = [];
  for (const wiSlug of workItemSlugs) {
    const wi = workItemStore.getWorkItem(projectSlug, wiSlug);
    if (!wi) continue;
    for (const task of wi.columns['todo'] || []) {
      allTasks.push({ wiSlug, task });
    }
  }

  if (allTasks.length === 0) {
    _state.status = 'idle';
    persistState();
    emit('live:stopped' as any, { message: 'No tasks in To Do' });
    return;
  }

  // Build task nodes for dependency resolution
  const taskNodes: TaskNode[] = allTasks.map(({ task }) => ({
    id: task.id,
    title: task.title,
    depends: task.depends || [],
  }));

  // Resolve dependencies → parallel groups
  let parallelGroups: string[][];
  try {
    const plan = resolveDependencies(taskNodes);
    parallelGroups = plan.parallelGroups;
  } catch (err) {
    if (err instanceof CyclicDependencyError) {
      console.warn('[coordinator] Cyclic dependency, falling back to sequential');
    }
    // Fallback: each task is its own group (sequential)
    parallelGroups = allTasks.map(({ task }) => [task.id]);
  }

  _state.executionPlan = parallelGroups.flat();
  _state.parallelGroups = parallelGroups;
  persistState();

  const soulSummary = getSoulSummary(projectSlug);

  // Build task lookup
  const taskLookup = new Map(allTasks.map(({ wiSlug, task }) => [task.id, { wiSlug, task }]));

  emit('live:started' as any, { projectSlug, workItemSlugs, maxWorkers });
  emit('coordinator:started' as any, {
    projectSlug,
    total: _state.executionPlan.length,
    parallelGroups,
  });

  // ── Group-by-group execution loop ───────────────────────────────────────
  const retryCountMap = new Map<string, number>();
  const failedTaskIds = new Set<string>();

  for (let groupIdx = 0; groupIdx < parallelGroups.length; groupIdx++) {
    // Stop/Pause checks
    if (_stopRequested) break;
    while (_pauseRequested && !_stopRequested) {
      _state.status = 'paused';
      persistState();
      emit('coordinator:paused' as any, { current: _state.stats.completed + _state.stats.failed, total: _state.executionPlan.length });
      await sleep(500);
    }
    if (_stopRequested) break;
    _state.status = 'running';

    const group = parallelGroups[groupIdx];

    // Filter: skip blocked tasks (dependency on failed task)
    const executableInGroup: { taskId: string; wiSlug: string; task: any }[] = [];
    for (const taskId of group) {
      const entry = taskLookup.get(taskId);
      if (!entry) { _state.stats.skipped++; continue; }

      const deps = entry.task.depends || [];
      const blockedBy = deps.filter((d: string) => failedTaskIds.has(d));
      if (blockedBy.length > 0) {
        _state.stats.skipped++;
        _state.failedTasks.push({ id: taskId, title: entry.task.title, reason: `Blocked by: ${blockedBy.join(', ')}`, retryCount: 0 });
        failedTaskIds.add(taskId);
        emit('coordinator:task-blocked' as any, { taskId, taskTitle: entry.task.title, blockedBy });
        continue;
      }

      executableInGroup.push({ taskId, wiSlug: entry.wiSlug, task: entry.task });
    }

    if (executableInGroup.length === 0) continue;

    // Cap concurrency to maxWorkers
    const concurrency = Math.min(executableInGroup.length, maxWorkers);
    _state.currentParallelTaskIds = executableInGroup.map(e => e.taskId);
    persistState();

    emit('coordinator:group-started' as any, {
      groupIndex: groupIdx,
      totalGroups: parallelGroups.length,
      taskIds: executableInGroup.map(e => e.taskId),
      parallel: executableInGroup.length > 1,
    });

    // Execute tasks in group with concurrency limit
    const results: { taskId: string; title: string; exitCode: number }[] = [];
    let taskIdx = 0;

    async function runNextInGroup(): Promise<void> {
      while (taskIdx < executableInGroup.length && !_stopRequested) {
        const { taskId, wiSlug, task } = executableInGroup[taskIdx++];

        const exitCode = await executeTaskWithRetry(
          projectSlug, project.workingDir!, wiSlug, task,
          soulSummary, defaultModel || 'sonnet', maxRetries, maxTurns,
          retryCountMap
        );
        results.push({ taskId, title: task.title, exitCode });
      }
    }

    const workers: Promise<void>[] = [];
    for (let i = 0; i < concurrency; i++) workers.push(runNextInGroup());
    await Promise.all(workers);

    // Process results
    _state.currentParallelTaskIds = [];
    _state.currentTaskId = null;

    for (const { taskId, title, exitCode } of results) {
      const entry = taskLookup.get(taskId)!;
      if (exitCode === 0) {
        _consecutiveErrors = 0;
        _state.stats.completed++;
        _state.executedTasks.push(taskId);

        workItemStore.moveTask(projectSlug, entry.wiSlug, taskId, { toColumn: 'review', toIndex: 0 });
        workItemStore.updateTask(projectSlug, entry.wiSlug, taskId, { output: `Completed by coordinator` });

        emit('coordinator:task-completed' as any, { taskId, taskTitle: title, status: 'success', retriesUsed: retryCountMap.get(taskId) || 0 });
        emit('live:worker-completed' as any, { workerId: taskId, taskId, status: 'completed' });
      } else {
        _consecutiveErrors++;
        _state.stats.failed++;
        failedTaskIds.add(taskId);
        _state.failedTasks.push({ id: taskId, title, reason: `Exit code ${exitCode}`, retryCount: retryCountMap.get(taskId) || 0 });

        emit('coordinator:task-completed' as any, { taskId, taskTitle: title, status: 'failed', exitCode, retriesUsed: retryCountMap.get(taskId) || 0 });
        emit('live:worker-completed' as any, { workerId: taskId, taskId, status: 'failed' });
      }

      // Broadcast updates
      const updatedWI = workItemStore.getWorkItem(projectSlug, entry.wiSlug);
      if (updatedWI) emit('workItem:updated' as any, { projectSlug, workItem: updatedWI });

      emitProgress();
    }

    // Circuit breaker
    if (_consecutiveErrors >= 3) {
      _state.status = 'error';
      _state.error = `Circuit breaker: ${_consecutiveErrors} consecutive errors`;
      break;
    }

    _state.stats.durationMs = Date.now() - startedAt;
    persistState();

    emit('live:metrics' as any, {
      activeWorkers: 0,
      totalCompleted: _state.stats.completed,
      totalFailed: _state.stats.failed,
      totalTasks: _state.executionPlan.length,
    });
  }

  // ── Done ────────────────────────────────────────────────────────────────
  if (_state.status !== 'error') {
    _state.status = _stopRequested ? 'stopped' : 'idle';
  }
  _state.stats.durationMs = Date.now() - startedAt;
  _state.currentTaskId = null;
  _state.currentParallelTaskIds = [];
  persistState();

  const msg = `Coordinator completed: ${_state.stats.completed} done, ${_state.stats.failed} failed, ${_state.stats.skipped} skipped`;
  emit('coordinator:completed' as any, { stats: { ..._state.stats }, message: msg, failedTasks: [..._state.failedTasks] });
  emit('live:stopped' as any, { message: msg });
}

// ── Single task execution with retry ──────────────────────────────────────

async function executeTaskWithRetry(
  projectSlug: string, workingDir: string, wiSlug: string, task: any,
  soulSummary: string, defaultModel: string, maxRetries: number, maxTurns: number,
  retryCountMap: Map<string, number>,
): Promise<number> {
  let currentModel = task.model || defaultModel;
  let lastExitCode = -1;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (_stopRequested) return -1;

    const isRetry = attempt > 0;
    if (isRetry) {
      _state.stats.retries++;
      retryCountMap.set(task.id, attempt);
      currentModel = escalateModel(currentModel);
      emit('coordinator:retry' as any, { taskId: task.id, taskTitle: task.title, attempt, model: currentModel });
      await sleep(Math.min(5000 * Math.pow(2, attempt - 1), 60000));
    }

    // Select agent
    const { agent, selectionReason } = selectAgent(task);

    // Build enriched prompt
    const project = projectStore.getProject(projectSlug);
    const wi = workItemStore.getWorkItem(projectSlug, wiSlug);
    const prompt = buildPrompt(
      task, agent, soulSummary,
      _state.executedTasks, _state.failedTasks.map(f => f.id),
      project?.title || projectSlug, wi?.title || wiSlug,
    );

    const retryContext = isRetry
      ? `\n\n## Retry Context\nAttempt ${attempt}/${maxRetries}. Previous exit code: ${lastExitCode}. Be extra careful.`
      : '';

    _state.currentTaskId = task.id;
    persistState();

    // Move to in-progress
    workItemStore.moveTask(projectSlug, wiSlug, task.id, { toColumn: 'in-progress', toIndex: 0 });
    const wiMoved = workItemStore.getWorkItem(projectSlug, wiSlug);
    if (wiMoved) emit('workItem:updated' as any, { projectSlug, workItem: wiMoved });

    emit('coordinator:task-assigned' as any, {
      taskId: task.id, taskTitle: task.title, agentName: agent.name,
      model: currentModel, groupIndex: 0,
    });
    emit('live:worker-assigned' as any, {
      workerId: task.id, taskId: task.id, taskTitle: task.title, agentName: agent.name, workItemSlug: wiSlug,
    });

    // Run Claude
    const runner = new ClaudeRunner();
    _activeRunners.push(runner);

    let output = '';
    runner.on('output', (chunk: string) => {
      output += chunk;
      emit('live:output' as any, { workerId: task.id, taskId: task.id, message: chunk });
    });

    runner.on('escalation', (data: { tool: string; question: string; input: any }) => {
      createEscalation({
        source: 'teams',
        taskId: task.id,
        taskTitle: task.title,
        question: data.question,
        options: data.input?.options || [],
      });
    });

    try {
      const result = await runner.run({
        prompt: prompt + retryContext,
        workingDir,
        model: currentModel,
        maxTurns,
      });

      _activeRunners = _activeRunners.filter(r => r !== runner);
      lastExitCode = result.exitCode;

      // Record cost
      try {
        recordExecution({
          projectSlug, workItemSlug: wiSlug, taskId: task.id, taskTitle: task.title,
          model: currentModel, duration: result.duration,
          inputTokens: 0, outputTokens: 0, cacheTokens: 0,
          status: result.exitCode === 0 ? 'success' : 'failed',
        });
      } catch {}

      // Store output
      workItemStore.updateTask(projectSlug, wiSlug, task.id, { output: output || result.stdout });

      if (result.exitCode === 0) return 0;
      // Non-zero: will retry if attempts remain

    } catch (err) {
      _activeRunners = _activeRunners.filter(r => r !== runner);
      lastExitCode = -1;
    }
  }

  return lastExitCode;
}

// ── Control API ───────────────────────────────────────────────────────────

export function stopCoordinator(): void {
  _stopRequested = true;
  for (const runner of _activeRunners) runner.stop();
}

export function pauseCoordinator(): void {
  _pauseRequested = true;
}

export function resumeCoordinator(): void {
  _pauseRequested = false;
  _state.status = 'running';
  persistState();
}

export function getCoordinatorState(): CoordinatorState {
  return { ..._state };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/server/engines/coordinator.ts src/server/engines/dependencyResolver.ts src/server/engines/taskRouter.ts
git commit -m "feat(coordinator): add coordinator orchestration engine with dependency resolution"
```

---

### Task 4: Rewrite Teams as Thin Wrapper

**Files:**
- Rewrite: `src/server/engines/teams.ts`

The current teams.ts is 200 lines of orchestration logic. Replace it with a thin wrapper that delegates to coordinator.

- [ ] **Step 1: Rewrite teams.ts**

```typescript
// src/server/engines/teams.ts

import { startCoordinator, stopCoordinator, pauseCoordinator, resumeCoordinator, getCoordinatorState, CoordinatorConfig } from './coordinator';

export { CoordinatorConfig as TeamsConfig };

export async function startTeams(config: CoordinatorConfig): Promise<void> {
  return startCoordinator(config);
}

export function stopTeams(): void {
  stopCoordinator();
}

export function pauseTeams(): void {
  pauseCoordinator();
}

export function resumeTeams(): void {
  resumeCoordinator();
}

export function getTeamsState() {
  const state = getCoordinatorState();
  return {
    active: state.status === 'running' || state.status === 'paused',
    status: state.status,
    workers: state.currentParallelTaskIds.map(id => ({
      id,
      taskId: id,
      taskTitle: '',
      status: 'running' as const,
    })),
    stats: state.stats,
    parallelGroups: state.parallelGroups,
    executionPlan: state.executionPlan,
    failedTasks: state.failedTasks,
    executedTasks: state.executedTasks,
  };
}
```

- [ ] **Step 2: Update API routes if needed**

Check `src/server/index.ts` or wherever Teams routes are defined. The existing routes call `startTeams`, `stopTeams`, `getTeamsState` — these names are preserved, so routes should work without changes.

- [ ] **Step 3: Commit**

```bash
git add src/server/engines/teams.ts
git commit -m "refactor(teams): rewrite as thin wrapper over coordinator"
```

---

### Task 5: Wire Socket Events to Types + Verify Integration

**Files:**
- Modify: `src/shared/types.ts`
- Verify: API routes, frontend TeamsView

- [ ] **Step 1: Add coordinator events to ServerToClientEvents in types.ts**

Find the `ServerToClientEvents` interface and add the coordinator events listed in Task 3, Step 1. Also verify the existing `live:*` events are still present (they are — coordinator emits them for backward compatibility).

- [ ] **Step 2: Add `depends` field to Task type if not present**

In `src/shared/types.ts`, check if Task has a `depends?: string[]` field. If not, add it.

- [ ] **Step 3: Test the full flow**

```bash
npm run dev:server
```

Start a Teams execution from the dashboard:
1. Select a work item with multiple tasks in To Do
2. Click Play
3. Expected: Coordinator starts, resolves dependencies, groups tasks, executes groups sequentially with tasks in parallel
4. Output panel shows real-time streaming per worker
5. Tasks move to Review on completion
6. Stats update in real-time

- [ ] **Step 4: Commit types changes**

```bash
git add src/shared/types.ts
git commit -m "feat(types): add coordinator socket events and Task.depends field"
```

---

## Summary

| Component | File | What it does |
|-----------|------|-------------|
| Dependency Resolver | `dependencyResolver.ts` | Topological sort → parallel groups |
| Task Router | `taskRouter.ts` | Agent selection + prompt enrichment with SOUL + context |
| Coordinator | `coordinator.ts` | Singleton orchestrator: group execution, retry, circuit breaker, state persistence |
| Teams (thin) | `teams.ts` | Wrapper: delegates to coordinator, preserves API surface |

**Key behaviors ported from agency-kanban:**
- Dependency resolution with Kahn's algorithm → parallel groups
- Sequential group execution, parallel within groups (capped by maxWorkers)
- Retry with model escalation (haiku → sonnet → opus)
- Circuit breaker (3 consecutive errors → stop)
- Failed dependency propagation (blocked tasks skipped)
- Soul/Constitution context injected into every worker prompt
- Previously-completed-tasks context for each worker
- State persistence to JSON for crash recovery
- Real-time Socket.IO events for UI
- Backward-compatible with existing `live:*` events
