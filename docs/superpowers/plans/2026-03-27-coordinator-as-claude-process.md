# Coordinator as Claude Process (AI Orchestrator)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the programmatic TypeScript coordinator with a real Claude CLI process that thinks, decides, and orchestrates workers through MCP tools — exactly like agency-kanban's Live Engine.

**Architecture:** The coordinator becomes a Claude CLI process spawned with a dynamic system prompt (role + SOUL + agents + tools reference + rules). It orchestrates by calling MCP tools: `list_tasks`, `assign_task`, `check_workers`, `wait_for_completion`, `escalate_to_human`, `send_message`. Workers are spawned by the backend when the coordinator calls `assign_task`. The coordinator's thinking is streamed to the frontend via `coordinator:thinking` socket events. The existing kanbaii-mcp-server.js is expanded with orchestration tools.

**Tech Stack:** Claude CLI (stream-json), MCP stdio server (JSONL), Express REST API, Socket.IO, ClaudeRunner

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────┐
│          COORDINATOR (Claude CLI Process)         │
│  - Dynamic system prompt with SOUL + agents       │
│  - Calls MCP tools to orchestrate                │
│  - Thinking streamed to UI                        │
└─────────────────────┬────────────────────────────┘
                      │ stdio (JSONL)
                      ▼
┌──────────────────────────────────────────────────┐
│           KANBAII MCP SERVER (expanded)           │
│  Tools:                                           │
│  - list_tasks        → GET /api/teams/tasks       │
│  - assign_task       → POST /api/teams/assign     │
│  - check_workers     → GET /api/teams/workers     │
│  - wait_for_completion → polls /api/teams/workers │
│  - escalate_to_human → POST /api/escalation/*    │
│  - send_message      → emit to socket            │
└─────────────────────┬────────────────────────────┘
                      │ HTTP
                      ▼
┌──────────────────────────────────────────────────┐
│              KANBAII BACKEND (Express)            │
│  New routes:                                      │
│  - GET  /api/teams/tasks    → task board state    │
│  - POST /api/teams/assign   → spawn worker        │
│  - GET  /api/teams/workers  → worker pool status  │
│  Existing:                                        │
│  - /api/escalation/*        → escalation flow     │
│  - /api/agents/*            → agent registry      │
└─────────────────────┬────────────────────────────┘
                      │ ClaudeRunner
                      ▼
┌──────────────────────────────────────────────────┐
│         WORKER PROCESSES (Claude CLI)             │
│  - Spawned by backend on assign_task             │
│  - Each gets enriched prompt + kanbaii MCP       │
│  - Results tracked in worker pool                │
└──────────────────────────────────────────────────┘
```

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/server/engines/coordinator.ts` | **Rewrite** | Spawn coordinator as Claude process, stream thinking, manage lifecycle |
| `src/server/engines/workerPool.ts` | **Create** | Worker pool: spawn workers via ClaudeRunner, track status, report completions |
| `src/server/mcp/kanbaii-mcp-server.js` | **Expand** | Add orchestration tools: list_tasks, assign_task, check_workers, wait_for_completion, send_message |
| `src/server/routes/teams.ts` | **Expand** | Add API endpoints for MCP tools: /tasks, /assign, /workers |
| `src/server/engines/coordinatorPrompt.ts` | **Create** | Dynamic prompt builder: role + SOUL + agents + tools ref + rules |

---

### Task 1: Worker Pool Manager

**Files:**
- Create: `src/server/engines/workerPool.ts`

The worker pool manages Claude worker processes. The coordinator assigns tasks via MCP → backend → workerPool. Each worker runs via ClaudeRunner with its own prompt.

- [ ] **Step 1: Create workerPool.ts**

```typescript
// src/server/engines/workerPool.ts

import { ClaudeRunner } from './claudeRunner';
import { selectAgent, buildPrompt } from './taskRouter';
import { emit } from '../lib/typedEmit';
import * as workItemStore from '../services/workItemStore';
import * as projectStore from '../services/projectStore';
import { getDocument } from '../services/soulStore';
import { createEscalation } from '../services/escalationService';
import { recordExecution } from '../services/costTracker';

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

    try {
      const result = await runner.run({
        prompt, workingDir: project.workingDir!, model: effectiveModel, maxTurns: 50,
      });

      workerInfo.status = result.exitCode === 0 ? 'completed' : 'failed';
      workerInfo.exitCode = result.exitCode;
      workerInfo.completedAt = new Date().toISOString();
      workerInfo.output = output || result.stdout;

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
  })();

  return { workerId };
}

export function stopAllWorkers(): void {
  for (const { runner } of _workers.values()) {
    try { runner.stop(); } catch {}
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/engines/workerPool.ts
git commit -m "feat(coordinator): add worker pool manager for AI-orchestrated execution"
```

---

### Task 2: Expand MCP Server with Orchestration Tools

**Files:**
- Rewrite: `src/server/mcp/kanbaii-mcp-server.js`

Add orchestration tools that the coordinator Claude process will call. Each tool makes HTTP calls to the KANBAII backend.

- [ ] **Step 1: Rewrite kanbaii-mcp-server.js**

Keep the existing JSONL/Content-Length dual transport. Add these tools:

1. **list_tasks** — GET /api/teams/tasks → returns tasks grouped by column for all selected work items
2. **assign_task** — POST /api/teams/assign → spawns a worker for a task
3. **check_workers** — GET /api/teams/workers → returns worker pool status + completed results
4. **wait_for_completion** — polls GET /api/teams/workers until specified tasks complete (3s interval)
5. **send_message** — POST to socket emit (or just return for now)
6. **escalate_to_human** — existing, keep as-is
7. **send_notification** — existing, keep as-is

The full MCP server code is too large for inline display. Key implementation notes:

- `list_tasks`: `GET /api/teams/tasks` → returns `{ columns: { todo: [...], 'in-progress': [...], review: [...], done: [...] } }`
- `assign_task`: input `{ taskId, agent?, model?, additionalContext? }` → `POST /api/teams/assign` → returns `{ workerId }`
- `check_workers`: `GET /api/teams/workers` → returns `{ activeWorkers, maxWorkers, availableSlots, workers: [...], completedResults: [...], stats }`
- `wait_for_completion`: input `{ taskIds?, timeout_seconds? }` → polls `/api/teams/workers` every 3s until all taskIds appear in completedResults or timeout. If no taskIds specified, waits for next ANY completion.

- [ ] **Step 2: Commit**

```bash
git add src/server/mcp/kanbaii-mcp-server.js
git commit -m "feat(mcp): add orchestration tools for coordinator AI process"
```

---

### Task 3: Add Teams API Endpoints for MCP Tools

**Files:**
- Expand: `src/server/routes/teams.ts`

Add the endpoints the MCP server calls.

- [ ] **Step 1: Expand teams.ts routes**

```typescript
// Add to existing teams.ts routes:

import { getPoolStatus, assignTask } from '../engines/workerPool';
import * as workItemStore from '../services/workItemStore';

// GET /api/teams/tasks — list tasks for coordinator's work items
router.get('/tasks', (req: Request, res: Response) => {
  const state = getTeamsState();
  if (!state.active) return res.json({ ok: false, error: 'Teams not running' });

  // Return all tasks across selected work items
  const coordState = getCoordinatorState();
  const projectSlug = coordState.projectSlug;
  if (!projectSlug) return res.json({ ok: false, error: 'No project' });

  const tasks: Record<string, any[]> = { backlog: [], todo: [], 'in-progress': [], review: [], done: [] };

  // Get from coordinator's work item slugs
  for (const wiSlug of coordState.workItemSlugs || []) {
    const wi = workItemStore.getWorkItem(projectSlug, wiSlug);
    if (!wi) continue;
    for (const [col, items] of Object.entries(wi.columns)) {
      if (tasks[col]) tasks[col].push(...(items as any[]));
    }
  }

  res.json({ ok: true, data: { tasks } });
});

// POST /api/teams/assign — coordinator assigns task to worker
router.post('/assign', async (req: Request, res: Response) => {
  const { taskId, agent, model, additionalContext } = req.body;
  if (!taskId) return res.status(400).json({ ok: false, error: 'taskId required' });

  const result = await assignTask({ taskId, agent, model, additionalContext });
  if ('error' in result) return res.status(409).json({ ok: false, error: result.error });
  res.json({ ok: true, data: result });
});

// GET /api/teams/workers — worker pool status for coordinator polling
router.get('/workers', (_req: Request, res: Response) => {
  res.json({ ok: true, data: getPoolStatus() });
});
```

- [ ] **Step 2: Import getCoordinatorState in teams routes**

Add the coordinator state import and the workItemStore import at the top of the file.

- [ ] **Step 3: Commit**

```bash
git add src/server/routes/teams.ts
git commit -m "feat(api): add /tasks, /assign, /workers endpoints for coordinator MCP tools"
```

---

### Task 4: Coordinator Prompt Builder

**Files:**
- Create: `src/server/engines/coordinatorPrompt.ts`

Builds the dynamic system prompt for the coordinator Claude process, ported from agency-kanban's `buildCoordinatorPrompt()`.

- [ ] **Step 1: Create coordinatorPrompt.ts**

```typescript
// src/server/engines/coordinatorPrompt.ts

import { listAgents } from '../services/agentRegistry';
import { getDocument } from '../services/soulStore';

export function buildCoordinatorPrompt(opts: {
  projectSlug: string;
  projectTitle: string;
  workItemTitles: string[];
  maxWorkers: number;
}): string {
  const parts: string[] = [];

  // 1. Role
  parts.push(`## Role
You are the **Live Coordinator** for project "${opts.projectTitle}".

You are an autonomous AI project manager that orchestrates a team of specialized worker agents to build software. You think strategically, delegate tasks, monitor progress, handle failures, and make real-time decisions.

You do NOT implement code yourself. You delegate to worker agents via the assign_task tool.

Your thinking is streamed to the human operator in real-time. Be clear about your reasoning.`);

  // 2. Soul / Constitution
  const soul = (() => { try { return getDocument(opts.projectSlug, 'SOUL.md')?.content || ''; } catch { return ''; } })();
  if (soul) {
    parts.push(`\n## Project Soul (Constitution)\n${soul}`);
  }

  // 3. Available Agents
  const agents = listAgents();
  if (agents.length > 0) {
    parts.push(`\n## Available Agents`);
    for (const a of agents) {
      parts.push(`- **${a.name}** (${a.model}): ${a.role}. Skills: ${a.skills.join(', ')}. Tags: ${a.tags.join(', ')}`);
    }
    parts.push(`\nWhen assigning tasks: if a task has an explicit \`agent\` field, use that agent. Otherwise, choose the best fit by matching task tags to agent skills.`);
  }

  // 4. Work Items
  parts.push(`\n## Work Items to Process`);
  for (const title of opts.workItemTitles) {
    parts.push(`- ${title}`);
  }

  // 5. MCP Tools Reference
  parts.push(`\n## Available MCP Tools

- **list_tasks()** — Get all tasks grouped by column (backlog, todo, in-progress, review, done). Call this first to understand the task board.
- **assign_task(taskId, agent?, model?, additionalContext?)** — Assign a task to a worker agent. The backend spawns a Claude process. Returns workerId. Check available slots with check_workers first.
- **check_workers()** — Get worker pool status: active workers, max workers, available slots, completed results with exit codes. Call this before every assign_task and to monitor progress.
- **wait_for_completion(taskIds?, timeout_seconds?)** — Block until specified tasks complete. Polls every 3 seconds. If no taskIds given, waits for next any completion. Default timeout: 900s (15 min).
- **escalate_to_human(question, options?, blocking?, timeout_seconds?)** — Ask the human operator a question. Blocking mode waits for response. Use for ambiguous decisions, architecture questions, or repeated failures.
- **send_notification(message, type?)** — Send a notification to the dashboard.`);

  // 6. Operational Rules
  parts.push(`\n## Operational Rules

### Worker Pool
- Maximum ${opts.maxWorkers} concurrent workers. ALWAYS call check_workers before assign_task.
- If no slots available, call wait_for_completion to wait for one to finish.

### Execution Order
- Respect task dependencies (depends field). Never assign a task whose dependencies haven't completed.
- Prioritize: urgent > high > medium > low.
- Tasks without dependencies can run in parallel.

### Error Handling
- If a task fails (exitCode != 0), you may retry ONCE with a more powerful model.
- After 2 failures on the same task, skip it and continue with others.
- 3 consecutive failures across different tasks → escalate to human.

### Communication
- Announce your plan before starting execution.
- Report progress after every 3 completions.
- When all tasks are done, provide a final summary.

### Anti-Patterns (NEVER do these)
- Never assign a task if check_workers shows 0 available slots.
- Never assign a task whose dependencies haven't completed.
- Never loop infinitely — if stuck, escalate to human.
- Never implement code yourself — always delegate via assign_task.`);

  // 7. Initial Workflow
  parts.push(`\n## Your Workflow

1. **Discover**: Call list_tasks to see all tasks on the board.
2. **Analyze**: Identify dependencies, priorities, and parallel opportunities.
3. **Plan**: Announce your execution strategy to the human.
4. **Execute**: Assign tasks respecting dependencies and worker limits. Use wait_for_completion between dependency groups.
5. **Monitor**: After each completion, check results and adapt if needed.
6. **Summarize**: When done, provide a final status report.

Begin now.`);

  return parts.join('\n');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/engines/coordinatorPrompt.ts
git commit -m "feat(coordinator): add dynamic prompt builder for AI orchestrator"
```

---

### Task 5: Rewrite Coordinator as Claude Process

**Files:**
- Rewrite: `src/server/engines/coordinator.ts`

The coordinator becomes a Claude CLI process (like a worker, but with the orchestrator prompt and MCP tools for managing other workers).

- [ ] **Step 1: Rewrite coordinator.ts**

Key changes:
- Spawn Claude CLI with `buildCoordinatorPrompt()` as the prompt
- Use ClaudeRunner but with a special MCP config that includes the expanded kanbaii MCP server
- Stream thinking text via `coordinator:thinking` socket events
- Parse tool calls and emit them via `coordinator:tool_call` events
- On exit, clean up worker pool

The coordinator process lifecycle:
1. `startCoordinator()` → init worker pool → build prompt → spawn Claude CLI
2. Claude calls MCP tools (list_tasks → assign_task → wait_for_completion → ...)
3. Stream events parsed and emitted to frontend
4. On process exit → cleanup → emit coordinator:completed

- [ ] **Step 2: Commit**

```bash
git add src/server/engines/coordinator.ts
git commit -m "feat(coordinator): rewrite as Claude AI process with MCP tool orchestration"
```

---

### Task 6: Wire Teams Wrapper + Socket Events

**Files:**
- Modify: `src/server/engines/teams.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Update teams.ts wrapper**

The wrapper needs to pass workItemSlugs to coordinator so the worker pool knows which work items to search for tasks.

- [ ] **Step 2: Add new socket events to types.ts**

```typescript
// Add to ServerToClientEvents:
'coordinator:thinking': (data: { text: string }) => void;
'coordinator:tool_call': (data: { tool: string; input: any }) => void;
```

- [ ] **Step 3: Commit**

```bash
git add src/server/engines/teams.ts src/shared/types.ts
git commit -m "feat(coordinator): wire socket events for thinking + tool calls streaming"
```

---

## Summary

| Before (programmatic) | After (AI orchestrator) |
|---|---|
| TypeScript code dispatches tasks mechanically | Claude CLI process thinks and decides |
| No visible orchestrator | Coordinator thinking streamed to UI |
| Workers spawned directly | Workers spawned via assign_task MCP tool |
| No tools for orchestrator | 6 MCP tools: list_tasks, assign_task, check_workers, wait_for_completion, escalate_to_human, send_notification |
| No SOUL context for orchestrator | Dynamic prompt includes SOUL + agents + rules |
| Fixed execution order | Coordinator adapts strategy based on results |
| No retry intelligence | Coordinator retries with model escalation, escalates to human |

**6 tasks, 2 new files, 3 rewrites/expansions.**
