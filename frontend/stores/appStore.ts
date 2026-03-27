'use client';

import { create } from 'zustand';

// ============================================================
// REGLA #1: Todo estado de ejecución vive aquí. NUNCA en useState.
// Ver CLAUDE.md — "Estado Centralizado (NUNCA VIOLAR)"
// ============================================================

export type RalphStatus = 'idle' | 'running' | 'paused' | 'stopping';

export interface RalphInputRequest {
  taskId: string;
  taskTitle: string;
  context: string;
}

export interface EscalationRequest {
  id: string;
  source: 'ralph' | 'teams' | 'planner';
  taskId: string;
  taskTitle: string;
  question: string;
  options: string[];
  timeoutMs: number;
}

export interface RalphRun {
  status: RalphStatus;
  runId: string | null;
  projectSlug: string | null;
  workItemSlug: string | null;
  currentTaskId: string | null;
  currentTaskTitle: string | null;
  inputNeeded: RalphInputRequest | null;
  stats: {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    startedAt: string | null;
  };
  output: string[];
}

export interface TeamsWorker {
  id: string;
  taskId: string;
  taskTitle: string;
  agentName: string | null;
  workItemSlug: string;
  status: 'running' | 'completed' | 'failed';
}

export interface TeamsMetrics {
  activeWorkers: number;
  totalCompleted: number;
  totalFailed: number;
  totalTasks: number;
}

export interface TeamsInputRequest {
  workerId: string;
  taskId: string;
  taskTitle: string;
  context: string;
}

export interface CoordinatorToolCall {
  tool: string;
  input: any;
  timestamp: string;
}

export interface TeamsState {
  active: boolean;
  projectSlug: string | null;
  workers: TeamsWorker[];
  metrics: TeamsMetrics | null;
  logs: string[];
  workerLogs: Record<string, string[]>;
  inputNeeded: TeamsInputRequest | null;
  // Coordinator AI state
  coordinatorThinking: string[];
  coordinatorToolCalls: CoordinatorToolCall[];
  coordinatorStatus: 'idle' | 'thinking' | 'calling-tool' | 'waiting';
}

export interface PlannerTask {
  title: string;
  description: string;
  model: string;
  priority: string;
  tags: string[];
}

export interface PlannerDiscoveredItem {
  id: string;
  title: string;
  category: 'feature' | 'bug' | 'refactor';
  status: 'identified' | 'planning' | 'ready';
  plan: string | null;
  tasks: PlannerTask[];
  approvedAs: string | null;
}

export interface PlannerMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'escalation';
  content: string;
  options?: string[];
  respondedWith?: string;
  timestamp: string;
}

export interface PlannerState {
  active: boolean;
  projectSlug: string | null;
  messages: PlannerMessage[];
  discoveredItems: PlannerDiscoveredItem[];
  escalation: EscalationRequest | null;
  escalationMessageId: string | null;
}

const IDLE_RALPH: RalphRun = {
  status: 'idle', runId: null, projectSlug: null, workItemSlug: null,
  currentTaskId: null, currentTaskTitle: null, inputNeeded: null,
  stats: { total: 0, completed: 0, failed: 0, skipped: 0, startedAt: null },
  output: [],
};

const IDLE_TEAMS: TeamsState = {
  active: false, projectSlug: null, workers: [], metrics: null, logs: [], workerLogs: {}, inputNeeded: null,
  coordinatorThinking: [], coordinatorToolCalls: [], coordinatorStatus: 'idle',
};

const IDLE_PLANNER: PlannerState = {
  active: false, projectSlug: null, messages: [], discoveredItems: [],
  escalation: null, escalationMessageId: null,
};

interface AppStore {
  // --- Ralph (SSOT) ---
  ralph: RalphRun;
  setRalphState: (state: Partial<RalphRun>) => void;
  appendRalphOutput: (line: string) => void;
  resetRalph: () => void;
  onRalphStarted: (data: { projectSlug: string; workItemId: string; total: number; taskIds: string[] }) => void;
  onRalphProgress: (data: { current: number; total: number; currentTask: { id: string; title: string } | null }) => void;
  onRalphOutput: (data: { taskId: string; message: string }) => void;
  onRalphCompleted: (data: { stats: any; message: string }) => void;
  onRalphError: (data: { taskId?: string; message?: string }) => void;
  onRalphInputNeeded: (data: RalphInputRequest) => void;
  clearRalphInput: () => void;

  // --- Teams (SSOT) ---
  teams: TeamsState;
  onTeamsStarted: (data: { projectSlug: string; workItemSlugs: string[]; maxWorkers: number }) => void;
  onTeamsWorkerAssigned: (data: { workerId: string; taskId: string; taskTitle: string; agentName: string | null; workItemSlug: string }) => void;
  onTeamsWorkerCompleted: (data: { workerId: string; taskId: string; status: 'completed' | 'failed' }) => void;
  onTeamsMetrics: (data: TeamsMetrics) => void;
  onTeamsOutput: (data: { workerId: string; taskId: string; message: string }) => void;
  onTeamsStopped: (data: { message: string }) => void;
  onTeamsInputNeeded: (data: TeamsInputRequest) => void;
  clearTeamsInput: () => void;
  // Coordinator AI events
  onCoordinatorThinking: (data: { text: string }) => void;
  onCoordinatorToolCall: (data: { tool: string; input: any }) => void;
  onCoordinatorCompleted: (data: { stats: any; message: string }) => void;

  // --- Terminal (SSOT) ---
  terminal: { status: string; output: string[]; projectSlug: string | null };
  appendTerminalOutput: (text: string) => void;
  setTerminalStatus: (status: string) => void;
  resetTerminal: () => void;

  // --- Escalation (SSOT) ---
  escalation: EscalationRequest | null;
  onEscalationCreated: (data: EscalationRequest) => void;
  onEscalationResponded: () => void;
  onEscalationTimeout: () => void;

  // --- Planner (SSOT) ---
  planner: PlannerState;
  onPlannerStarted: (data: { projectSlug: string }) => void;
  onPlannerMessage: (data: { id: string; role: string; content: string }) => void;
  onPlannerItemDiscovered: (data: { id: string; title: string; category: string }) => void;
  onPlannerItemUpdated: (data: { id: string; status: string; plan?: string; tasks?: PlannerTask[] }) => void;
  onPlannerEscalation: (data: any) => void;
  onPlannerEscalationResponded: (response: string) => void;
  onPlannerItemApproved: (data: { id: string; workItemSlug: string }) => void;
  onPlannerStopped: () => void;

  // --- System ---
  isSystemBusy: () => boolean;
  rehydrate: () => Promise<void>;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';

export const useAppStore = create<AppStore>((set, get) => ({
  // --- Ralph ---
  ralph: { ...IDLE_RALPH },

  setRalphState: (partial) => set((s) => ({ ralph: { ...s.ralph, ...partial } })),
  appendRalphOutput: (line) => set((s) => ({
    ralph: { ...s.ralph, output: [...s.ralph.output.slice(-500), line] },
  })),
  resetRalph: () => set({ ralph: { ...IDLE_RALPH } }),

  onRalphStarted: (data) => set({
    ralph: {
      status: 'running', runId: null, projectSlug: data.projectSlug, workItemSlug: null,
      currentTaskId: null, currentTaskTitle: null, inputNeeded: null,
      stats: { total: data.total, completed: 0, failed: 0, skipped: 0, startedAt: new Date().toISOString() },
      output: [],
    },
  }),
  onRalphProgress: (data) => set((s) => ({
    ralph: {
      ...s.ralph, status: 'running',
      currentTaskId: data.currentTask?.id || null,
      currentTaskTitle: data.currentTask?.title || null,
      stats: { ...s.ralph.stats, total: data.total },
    },
  })),
  onRalphOutput: (data) => { get().appendRalphOutput(data.message); },
  onRalphCompleted: () => set((s) => ({
    ralph: { ...s.ralph, status: 'idle', currentTaskId: null, currentTaskTitle: null },
  })),
  onRalphError: (data) => { if (data.message) get().appendRalphOutput(`ERROR: ${data.message}`); },
  onRalphInputNeeded: (data) => set((s) => ({
    ralph: { ...s.ralph, inputNeeded: data },
  })),
  clearRalphInput: () => set((s) => ({
    ralph: { ...s.ralph, inputNeeded: null },
  })),

  // --- Teams ---
  teams: { ...IDLE_TEAMS },

  onTeamsStarted: (data) => set({
    teams: {
      ...IDLE_TEAMS,
      active: true,
      projectSlug: data.projectSlug,
      logs: [`Teams started: ${data.workItemSlugs.length} work items, ${data.maxWorkers} workers`],
    },
  }),
  onTeamsWorkerAssigned: (data) => set((s) => {
    const newWorker: TeamsWorker = { id: data.workerId, taskId: data.taskId, taskTitle: data.taskTitle, agentName: data.agentName, workItemSlug: data.workItemSlug, status: 'running' };
    return { teams: { ...s.teams, workers: [...s.teams.workers, newWorker], logs: [...s.teams.logs, `${data.agentName || 'Worker'} → ${data.taskTitle}`] } };
  }),
  onTeamsWorkerCompleted: (data) => set((s) => {
    const workers: TeamsWorker[] = s.teams.workers.map((w) => w.id === data.workerId ? { ...w, status: data.status as TeamsWorker['status'] } : w);
    return { teams: { ...s.teams, workers, logs: [...s.teams.logs, `${data.status === 'completed' ? '✓' : '✗'} Task ${data.taskId}`] } };
  }),
  onTeamsMetrics: (data) => set((s) => ({ teams: { ...s.teams, metrics: data } })),
  onTeamsOutput: (data) => set((s) => {
    // Prefix with short worker ID for log separation
    const wShort = data.workerId ? `[${data.workerId.slice(-4)}] ` : '';
    // Per-worker logs (skip coordinator entries)
    const wLogs = { ...s.teams.workerLogs };
    if (data.workerId && data.workerId !== 'coordinator') {
      const prev = wLogs[data.workerId] || [];
      wLogs[data.workerId] = [...prev.slice(-1000), data.message];
    }
    return { teams: { ...s.teams, logs: [...s.teams.logs.slice(-500), `${wShort}${data.message}`], workerLogs: wLogs } };
  }),
  onTeamsStopped: (data) => set((s) => ({
    teams: { ...s.teams, active: false, inputNeeded: null, logs: [...s.teams.logs, `\n--- ${data.message} ---`] },
  })),
  onTeamsInputNeeded: (data) => set((s) => ({
    teams: { ...s.teams, inputNeeded: data },
  })),
  clearTeamsInput: () => set((s) => ({
    teams: { ...s.teams, inputNeeded: null },
  })),

  // Coordinator AI events
  onCoordinatorThinking: (data) => set((s) => ({
    teams: {
      ...s.teams,
      coordinatorThinking: [...s.teams.coordinatorThinking.slice(-200), data.text],
      coordinatorStatus: 'thinking',
    },
  })),
  onCoordinatorToolCall: (data) => set((s) => ({
    teams: {
      ...s.teams,
      coordinatorToolCalls: [...s.teams.coordinatorToolCalls.slice(-30), { tool: data.tool, input: data.input, timestamp: new Date().toISOString() }],
      coordinatorStatus: 'calling-tool',
      logs: [...s.teams.logs, `🔧 ${data.tool}${data.input?.taskId ? ` → ${data.input.taskId}` : ''}`],
    },
  })),
  onCoordinatorCompleted: (data) => set((s) => ({
    teams: {
      ...s.teams,
      active: false,
      coordinatorStatus: 'idle',
      logs: [...s.teams.logs, `\n--- ${data.message} ---`],
    },
  })),

  // --- Terminal ---
  terminal: { status: 'idle', output: [], projectSlug: null },

  appendTerminalOutput: (text) => set((s) => ({
    terminal: { ...s.terminal, output: [...s.terminal.output.slice(-500), text] },
  })),
  setTerminalStatus: (status) => set((s) => ({ terminal: { ...s.terminal, status } })),
  resetTerminal: () => set({ terminal: { status: 'idle', output: [], projectSlug: null } }),

  // --- Escalation ---
  escalation: null,
  onEscalationCreated: (data) => set({ escalation: data }),
  onEscalationResponded: () => set({ escalation: null }),
  onEscalationTimeout: () => set({ escalation: null }),

  // --- Planner ---
  planner: { ...IDLE_PLANNER },

  onPlannerStarted: (data) => set({
    planner: { ...IDLE_PLANNER, active: true, projectSlug: data.projectSlug },
  }),

  onPlannerMessage: (data) => set((s) => ({
    planner: {
      ...s.planner,
      messages: [...s.planner.messages.slice(-200), {
        id: data.id,
        role: data.role as PlannerMessage['role'],
        content: data.content,
        timestamp: new Date().toISOString(),
      }],
    },
  })),

  onPlannerItemDiscovered: (data) => set((s) => ({
    planner: {
      ...s.planner,
      discoveredItems: [...s.planner.discoveredItems, {
        id: data.id,
        title: data.title,
        category: data.category as PlannerDiscoveredItem['category'],
        status: 'identified' as const,
        plan: null,
        tasks: [],
        approvedAs: null,
      }],
    },
  })),

  onPlannerItemUpdated: (data) => set((s) => ({
    planner: {
      ...s.planner,
      discoveredItems: s.planner.discoveredItems.map((item) =>
        item.id === data.id
          ? { ...item, status: data.status as PlannerDiscoveredItem['status'], plan: data.plan ?? item.plan, tasks: data.tasks ?? item.tasks }
          : item
      ),
    },
  })),

  onPlannerEscalation: (data) => set((s) => ({
    planner: {
      ...s.planner,
      escalation: { id: data.id, source: 'planner' as const, taskId: data.taskId, taskTitle: data.taskTitle, question: data.question, options: data.options, timeoutMs: data.timeoutMs },
      escalationMessageId: data.messageId || null,
    },
  })),

  onPlannerEscalationResponded: (response) => set((s) => ({
    planner: {
      ...s.planner,
      escalation: null,
      escalationMessageId: null,
      messages: s.planner.messages.map((m) =>
        m.id === s.planner.escalationMessageId ? { ...m, respondedWith: response } : m
      ),
    },
  })),

  onPlannerItemApproved: (data) => set((s) => ({
    planner: {
      ...s.planner,
      discoveredItems: s.planner.discoveredItems.map((item) =>
        item.id === data.id ? { ...item, approvedAs: data.workItemSlug } : item
      ),
    },
  })),

  onPlannerStopped: () => set((s) => ({
    planner: { ...s.planner, active: false, escalation: null, escalationMessageId: null },
  })),

  // --- System ---
  isSystemBusy: () => {
    const s = get();
    return s.ralph.status === 'running' || s.ralph.status === 'paused' || s.teams.active || s.terminal.status === 'running' || s.planner.active;
  },

  rehydrate: async () => {
    try {
      const [ralphRes, teamsRes, plannerRes] = await Promise.all([
        fetch(`${API}/api/ralph/state`).then((r) => r.json()).catch(() => null),
        fetch(`${API}/api/teams/state`).then((r) => r.json()).catch(() => null),
        fetch(`${API}/api/planner/state`).then((r) => r.json()).catch(() => null),
      ]);
      if (ralphRes?.ok && ralphRes.data) {
        const d = ralphRes.data;
        set((s) => ({
          ralph: {
            ...s.ralph,
            status: d.status === 'stopping' ? 'idle' : d.status,
            runId: d.runId, projectSlug: d.projectSlug, workItemSlug: d.workItemSlug,
            currentTaskId: d.currentTaskId, currentTaskTitle: d.currentTaskTitle, stats: d.stats,
          },
        }));
      }
      if (teamsRes?.ok && teamsRes.data) {
        set((s) => ({ teams: { ...s.teams, active: teamsRes.data.active } }));
      }
      if (plannerRes?.ok && plannerRes.data?.active) {
        set((s) => ({
          planner: { ...s.planner, active: true, projectSlug: plannerRes.data.projectSlug, messages: plannerRes.data.messages || [], discoveredItems: plannerRes.data.discoveredItems || [] },
        }));
      }
    } catch { /* server not ready */ }
  },
}));
