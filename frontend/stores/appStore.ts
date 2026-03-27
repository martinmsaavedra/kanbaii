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

export interface TeamsState {
  active: boolean;
  projectSlug: string | null;
  workers: TeamsWorker[];
  metrics: TeamsMetrics | null;
  logs: string[];
  inputNeeded: TeamsInputRequest | null;
}

const IDLE_RALPH: RalphRun = {
  status: 'idle', runId: null, projectSlug: null, workItemSlug: null,
  currentTaskId: null, currentTaskTitle: null, inputNeeded: null,
  stats: { total: 0, completed: 0, failed: 0, skipped: 0, startedAt: null },
  output: [],
};

const IDLE_TEAMS: TeamsState = {
  active: false, projectSlug: null, workers: [], metrics: null, logs: [], inputNeeded: null,
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

  // --- Terminal (SSOT) ---
  terminal: { status: string; output: string[]; projectSlug: string | null };
  appendTerminalOutput: (text: string) => void;
  setTerminalStatus: (status: string) => void;
  resetTerminal: () => void;

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
      active: true,
      projectSlug: data.projectSlug,
      workers: [],
      metrics: null,
      inputNeeded: null,
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
  onTeamsOutput: (data) => set((s) => ({
    teams: { ...s.teams, logs: [...s.teams.logs.slice(-300), data.message] },
  })),
  onTeamsStopped: (data) => set((s) => ({
    teams: { ...s.teams, active: false, inputNeeded: null, logs: [...s.teams.logs, `\n--- ${data.message} ---`] },
  })),
  onTeamsInputNeeded: (data) => set((s) => ({
    teams: { ...s.teams, inputNeeded: data },
  })),
  clearTeamsInput: () => set((s) => ({
    teams: { ...s.teams, inputNeeded: null },
  })),

  // --- Terminal ---
  terminal: { status: 'idle', output: [], projectSlug: null },

  appendTerminalOutput: (text) => set((s) => ({
    terminal: { ...s.terminal, output: [...s.terminal.output.slice(-500), text] },
  })),
  setTerminalStatus: (status) => set((s) => ({ terminal: { ...s.terminal, status } })),
  resetTerminal: () => set({ terminal: { status: 'idle', output: [], projectSlug: null } }),

  // --- System ---
  isSystemBusy: () => {
    const s = get();
    return s.ralph.status === 'running' || s.ralph.status === 'paused' || s.teams.active || s.terminal.status === 'running';
  },

  rehydrate: async () => {
    try {
      const [ralphRes, teamsRes] = await Promise.all([
        fetch(`${API}/api/ralph/state`).then((r) => r.json()).catch(() => null),
        fetch(`${API}/api/teams/state`).then((r) => r.json()).catch(() => null),
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
    } catch { /* server not ready */ }
  },
}));
