/**
 * Coordinator Singleton — Claude CLI process that orchestrates Teams execution.
 *
 * The coordinator is a Claude CLI process spawned with the orchestrator prompt
 * from buildCoordinatorPrompt(). It uses MCP tools (list_tasks, assign_task,
 * check_workers, wait_for_completion, escalate_to_human, send_notification)
 * via the kanbaii MCP server to manage worker agents.
 *
 * Module-level state — no class, no instantiation. Import and call functions.
 */

import { spawn, ChildProcess } from 'child_process';
import { buildCoordinatorPrompt } from './coordinatorPrompt';
import { initPool, resetPool, stopAllWorkers, getPoolStatus } from './workerPool';
import { generateMcpConfigForClaude } from '../services/mcpConfig';
import { emit } from '../lib/typedEmit';
import * as workItemStore from '../services/workItemStore';
import * as projectStore from '../services/projectStore';

// ── Types ─────────────────────────────────────────────────────────────────

export type CoordinatorStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'error';

export interface CoordinatorConfig {
  projectSlug: string;
  workItemSlugs: string[];
  maxWorkers?: number;
  model?: string;
  maxTurns?: number;
}

export interface CoordinatorState {
  status: CoordinatorStatus;
  projectSlug: string | null;
  workItemSlugs: string[];
  // Kept for backward compat with teams.ts wrapper
  executedTasks: string[];
  failedTasks: { id: string; title: string; reason: string; retryCount: number }[];
  currentParallelTaskIds: string[];
  executionPlan: string[];
  parallelGroups: string[][];
  stats: {
    completed: number;
    failed: number;
    skipped: number;
    retries: number;
    durationMs: number;
    startedAt: string;
  };
  error: string | null;
}

// ── Singleton state ───────────────────────────────────────────────────────

const INITIAL_STATE: CoordinatorState = {
  status: 'idle',
  projectSlug: null,
  workItemSlugs: [],
  executedTasks: [],
  failedTasks: [],
  currentParallelTaskIds: [],
  executionPlan: [],
  parallelGroups: [],
  stats: { completed: 0, failed: 0, skipped: 0, retries: 0, durationMs: 0, startedAt: '' },
  error: null,
};

let _state: CoordinatorState = { ...INITIAL_STATE };
let _proc: ChildProcess | null = null;
let _killed = false;

// ── Escalation instructions appended to system prompt ─────────────────────

const ESCALATION_INSTRUCTIONS = [
  'CRITICAL TOOL RESTRICTION: You MUST NOT use the AskUserQuestion tool.',
  'It does NOT work in this execution mode — it auto-resolves without waiting for human input.',
  'When you need human input, approval, or a decision, you MUST use the "escalate_to_human" MCP tool (from the kanbaii MCP server).',
  'This tool blocks and waits for a real human response.',
  'NEVER ask questions in your text output. The user cannot see them. ONLY use escalate_to_human.',
].join(' ');

// ── Main orchestration ────────────────────────────────────────────────────

export async function startCoordinator(config: CoordinatorConfig): Promise<void> {
  const {
    projectSlug,
    workItemSlugs,
    maxWorkers = 3,
    model = 'sonnet',
    maxTurns = 200,
  } = config;

  // ── 1. Validate project ──────────────────────────────────────────────
  const project = projectStore.getProject(projectSlug);
  if (!project) throw new Error(`Project not found: ${projectSlug}`);
  if (!project.workingDir) throw new Error('Project has no working directory configured.');
  if (_state.status === 'running') throw new Error('Coordinator is already running');

  // Validate work items exist
  const workItemTitles: string[] = [];
  for (const wiSlug of workItemSlugs) {
    const wi = workItemStore.getWorkItem(projectSlug, wiSlug);
    if (!wi) throw new Error(`Work item not found: ${wiSlug}`);
    workItemTitles.push(wi.title);
  }

  // ── 2. Reset state ──────────────────────────────────────────────────
  _killed = false;
  const startedAt = Date.now();

  _state = {
    status: 'running',
    projectSlug,
    workItemSlugs: [...workItemSlugs],
    executedTasks: [],
    failedTasks: [],
    currentParallelTaskIds: [],
    executionPlan: [],
    parallelGroups: [],
    stats: {
      completed: 0,
      failed: 0,
      skipped: 0,
      retries: 0,
      durationMs: 0,
      startedAt: new Date().toISOString(),
    },
    error: null,
  };

  // ── 3. Init worker pool ─────────────────────────────────────────────
  initPool(projectSlug, workItemSlugs, maxWorkers);

  // ── 4. Build coordinator prompt ─────────────────────────────────────
  const prompt = buildCoordinatorPrompt({
    projectSlug,
    projectTitle: project.title || projectSlug,
    workItemTitles,
    maxWorkers,
  });

  // ── 5. Generate MCP config ──────────────────────────────────────────
  const mcpConfigPath = generateMcpConfigForClaude();

  // ── 6. Build CLI args ───────────────────────────────────────────────
  //
  // On Windows cmd.exe has an 8191 character limit for command lines.
  // If the prompt exceeds 6000 chars we pipe it via stdin instead of -p.
  const WIN_CMD_LIMIT = 6000;
  const useStdinForPrompt = prompt.length > WIN_CMD_LIMIT;

  const args: string[] = [
    '-p',
    '--verbose',
    '--dangerously-skip-permissions',
    '--output-format', 'stream-json',
    '--max-turns', String(maxTurns),
    '--model', model,
    '--disallowedTools', 'AskUserQuestion',
  ];

  if (mcpConfigPath) {
    args.push('--mcp-config', mcpConfigPath);
  }

  args.push('--append-system-prompt', ESCALATION_INSTRUCTIONS);

  // ── 7. Auto-move work items to 'active' ────────────────────────────
  for (const wiSlug of workItemSlugs) {
    const wiActivated = workItemStore.activateWorkItemIfNeeded(projectSlug, wiSlug);
    if (wiActivated) {
      emit('workItem:updated' as any, { projectSlug, workItem: wiActivated });
    }
  }

  // ── 8. Emit started events ──────────────────────────────────────────
  emit('live:started' as any, { projectSlug, workItemSlugs, maxWorkers });
  emit('coordinator:started' as any, {
    projectSlug,
    total: 0,
    parallelGroups: [],
  });

  // ── 9. Spawn claude process ─────────────────────────────────────────
  return new Promise<void>((resolve) => {
    const proc = spawn('claude', args, {
      cwd: project.workingDir!,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      windowsHide: true,
    });

    _proc = proc;

    let lineBuf = '';

    // ── Parse stdout stream-json events line by line ────────────────
    proc.stdout!.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      lineBuf += text;
      const lines = lineBuf.split('\n');
      lineBuf = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const ev = JSON.parse(trimmed);
          handleStreamEvent(ev);
        } catch {
          // Non-JSON line — emit as raw output
          emit('live:output' as any, {
            workerId: 'coordinator',
            taskId: 'coordinator',
            message: trimmed + '\n',
          });
        }
      }
    });

    // ── Capture stderr for diagnostics ──────────────────────────────
    proc.stderr!.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      // Emit stderr as coordinator output so the user can see diagnostics
      emit('live:output' as any, {
        workerId: 'coordinator',
        taskId: 'coordinator',
        message: `[stderr] ${text}`,
      });
    });

    // ── On close: cleanup ───────────────────────────────────────────
    proc.on('close', (code: number | null) => {
      // Flush remaining buffer
      if (lineBuf.trim()) {
        try {
          handleStreamEvent(JSON.parse(lineBuf.trim()));
        } catch {}
      }

      _proc = null;

      // Sync stats from worker pool
      syncStatsFromPool();

      // Update duration
      _state.stats.durationMs = Date.now() - startedAt;

      // Determine final status
      if (_state.status === 'error') {
        // Already set to error by an event handler; keep it
      } else if (_killed) {
        _state.status = 'stopped';
        _state.error = 'Coordinator stopped by user';
      } else if (code !== null && code !== 0) {
        _state.status = 'error';
        _state.error = `Coordinator process exited with code ${code}`;
      } else {
        _state.status = 'idle';
      }

      // Clean up worker pool
      resetPool();

      // Emit completion events
      const msg = _state.error
        ? `Coordinator stopped: ${_state.error}`
        : `Coordinator completed: ${_state.stats.completed} done, ${_state.stats.failed} failed`;

      emit('coordinator:completed' as any, {
        stats: { ..._state.stats },
        message: msg,
        interrupted: _killed,
        failedTasks: [..._state.failedTasks],
      });
      emit('live:stopped' as any, { message: msg });

      resolve();
    });

    proc.on('error', (err: Error) => {
      _proc = null;
      _state.status = 'error';
      _state.error = `Failed to spawn coordinator: ${err.message}`;

      resetPool();

      emit('coordinator:completed' as any, {
        stats: { ..._state.stats },
        message: _state.error,
        interrupted: false,
        failedTasks: [],
      });
      emit('live:stopped' as any, { message: _state.error });

      resolve();
    });

    // ── 10. Write prompt to stdin and close ─────────────────────────
    if (useStdinForPrompt) {
      proc.stdin!.write(prompt + '\n');
    } else {
      proc.stdin!.write(prompt + '\n');
    }
    proc.stdin!.end();
  });
}

// ── Stream event handler ──────────────────────────────────────────────────

function handleStreamEvent(event: any): void {
  if (!event?.type) return;

  switch (event.type) {
    case 'assistant': {
      const content = event.message?.content;
      if (!Array.isArray(content)) break;

      for (const block of content) {
        if (block.type === 'text' && block.text) {
          // Coordinator thinking — stream to the UI
          emit('coordinator:thinking' as any, { text: block.text });
          emit('live:output' as any, {
            workerId: 'coordinator',
            taskId: 'coordinator',
            message: block.text,
          });

        } else if (block.type === 'tool_use') {
          const name = block.name || 'tool';
          const input = block.input || {};

          // Coordinator tool call — show in UI
          emit('coordinator:tool_call' as any, { tool: name, input });
          emit('live:output' as any, {
            workerId: 'coordinator',
            taskId: 'coordinator',
            message: `⚡ ${name} ${formatToolInput(name, input)}\n`,
          });

          // Track active workers from assign_task calls
          if (name === 'assign_task' && input.taskId) {
            if (!_state.currentParallelTaskIds.includes(input.taskId)) {
              _state.currentParallelTaskIds.push(input.taskId);
            }
          }

        } else if (block.type === 'tool_result') {
          // Tool result — show preview
          const resultContent = typeof block.content === 'string'
            ? block.content
            : Array.isArray(block.content)
              ? block.content.map((c: any) => c.text ?? '').join('')
              : '';
          if (resultContent) {
            const preview = resultContent.length > 300
              ? resultContent.slice(0, 300) + '...'
              : resultContent;
            emit('live:output' as any, {
              workerId: 'coordinator',
              taskId: 'coordinator',
              message: `  → ${preview}\n`,
            });
          }
        }
      }
      break;
    }

    case 'result': {
      // Final result from the coordinator process
      const resultText = event.result || '';
      emit('coordinator:completed' as any, {
        result: resultText,
        costUsd: event.total_cost_usd,
        usage: event.usage,
      });

      // Sync final stats from pool
      syncStatsFromPool();
      break;
    }

    case 'system': {
      if (event.subtype === 'api_retry') {
        emit('live:output' as any, {
          workerId: 'coordinator',
          taskId: 'coordinator',
          message: `⏳ API retry #${event.attempt} (${event.error || 'rate limit'})...\n`,
        });
        emit('coordinator:thinking' as any, {
          text: `[API retry #${event.attempt}: ${event.error || 'rate limit'}]`,
        });
      }
      break;
    }
  }
}

// ── Sync coordinator stats from worker pool ───────────────────────────────

function syncStatsFromPool(): void {
  const pool = getPoolStatus();
  _state.stats.completed = pool.stats.completed;
  _state.stats.failed = pool.stats.failed;

  // Update currentParallelTaskIds from active workers
  _state.currentParallelTaskIds = pool.workers
    .filter((w) => w.status === 'running')
    .map((w) => w.taskId);

  // Update executedTasks from completed results
  _state.executedTasks = pool.completedResults
    .filter((r) => r.success)
    .map((r) => r.taskId);

  // Update failedTasks from completed results
  _state.failedTasks = pool.completedResults
    .filter((r) => !r.success)
    .map((r) => ({
      id: r.taskId,
      title: r.taskTitle,
      reason: `Exit code ${r.exitCode}`,
      retryCount: 0,
    }));
}

// ── Format tool input for display ─────────────────────────────────────────

function formatToolInput(tool: string, input: any): string {
  if (!input) return '';
  switch (tool) {
    case 'assign_task':
      return `taskId=${input.taskId || '?'}${input.agent ? ` agent=${input.agent}` : ''}`;
    case 'check_workers':
      return '';
    case 'list_tasks':
      return '';
    case 'wait_for_completion':
      return input.taskIds ? `[${input.taskIds.join(', ')}]` : '(any)';
    case 'escalate_to_human':
      return input.question ? `"${input.question.slice(0, 60)}"` : '';
    case 'send_notification':
      return input.message ? `"${input.message.slice(0, 60)}"` : '';
    default:
      return '';
  }
}

// ── Control API ───────────────────────────────────────────────────────────

export function stopCoordinator(): void {
  _killed = true;

  // Stop all worker agents first
  stopAllWorkers();

  // Kill coordinator process
  if (_proc) {
    try {
      _proc.stdin?.end();
    } catch {}

    try {
      _proc.kill('SIGTERM');
    } catch {}

    // Force kill after 5 seconds if still alive
    const proc = _proc;
    setTimeout(() => {
      if (proc && !proc.killed) {
        try {
          proc.kill('SIGKILL');
        } catch {}
      }
    }, 5000);
  }
}

export function pauseCoordinator(): void {
  // Pause is not feasible with an external Claude process.
  // For now, we just stop.
  stopCoordinator();
}

export function resumeCoordinator(): void {
  // Resume is not feasible after stop. The caller should start a new session.
  // No-op to maintain API compatibility.
}

export function getCoordinatorState(): CoordinatorState {
  // Sync live stats from pool if running
  if (_state.status === 'running') {
    syncStatsFromPool();
  }
  return { ..._state };
}
