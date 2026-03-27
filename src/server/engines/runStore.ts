import fs from 'fs';
import path from 'path';

export type RunStatus = 'idle' | 'running' | 'paused' | 'stopping';

export interface RunState {
  status: RunStatus;
  runId: string | null;
  type: 'ralph' | 'teams' | null;
  projectSlug: string | null;
  workItemSlug: string | null;
  currentTaskId: string | null;
  currentTaskTitle: string | null;
  stats: {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    startedAt: string | null;
  };
}

const INITIAL_STATE: RunState = {
  status: 'idle',
  runId: null,
  type: null,
  projectSlug: null,
  workItemSlug: null,
  currentTaskId: null,
  currentTaskTitle: null,
  stats: { total: 0, completed: 0, failed: 0, skipped: 0, startedAt: null },
};

// Simple mutex to prevent concurrent runs
let locked = false;

class RunStore {
  private state: RunState = { ...INITIAL_STATE };
  private stateFile: string;

  constructor() {
    const dataDir = process.env.KANBAII_DATA_DIR || path.join(process.cwd(), 'data', 'projects');
    this.stateFile = path.join(dataDir, '..', '.run-state.json');
    this.loadState();
  }

  private loadState(): void {
    try {
      if (fs.existsSync(this.stateFile)) {
        const raw = JSON.parse(fs.readFileSync(this.stateFile, 'utf-8'));
        // If was running when backend crashed, reset to idle
        if (raw.status === 'running' || raw.status === 'paused') {
          this.state = { ...INITIAL_STATE };
        } else {
          this.state = raw;
        }
      }
    } catch {
      this.state = { ...INITIAL_STATE };
    }
  }

  private persist(): void {
    try {
      const dir = path.dirname(this.stateFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err) {
      console.error('[RunStore] Failed to persist state:', err);
    }
  }

  getState(): RunState {
    return { ...this.state };
  }

  acquire(): boolean {
    if (locked) return false;
    locked = true;
    return true;
  }

  release(): void {
    locked = false;
  }

  start(type: 'ralph' | 'teams', projectSlug: string, workItemSlug: string | null, total: number): string {
    if (this.state.status !== 'idle') {
      throw new Error(`Cannot start: already ${this.state.status}`);
    }
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.state = {
      status: 'running',
      runId,
      type,
      projectSlug,
      workItemSlug,
      currentTaskId: null,
      currentTaskTitle: null,
      stats: { total, completed: 0, failed: 0, skipped: 0, startedAt: new Date().toISOString() },
    };
    this.persist();
    return runId;
  }

  setCurrentTask(taskId: string, title: string): void {
    this.state.currentTaskId = taskId;
    this.state.currentTaskTitle = title;
    this.persist();
  }

  taskCompleted(): void {
    this.state.stats.completed++;
    this.state.currentTaskId = null;
    this.state.currentTaskTitle = null;
    this.persist();
  }

  taskFailed(): void {
    this.state.stats.failed++;
    this.state.currentTaskId = null;
    this.state.currentTaskTitle = null;
    this.persist();
  }

  taskSkipped(): void {
    this.state.stats.skipped++;
    this.persist();
  }

  pause(): void {
    if (this.state.status === 'running') {
      this.state.status = 'paused';
      this.persist();
    }
  }

  resume(): void {
    if (this.state.status === 'paused') {
      this.state.status = 'running';
      this.persist();
    }
  }

  requestStop(): void {
    if (this.state.status === 'running' || this.state.status === 'paused') {
      this.state.status = 'stopping';
      this.persist();
    }
  }

  stop(): void {
    this.state = { ...INITIAL_STATE };
    this.release();
    this.persist();
  }

  isRunning(): boolean {
    return this.state.status === 'running';
  }

  isPaused(): boolean {
    return this.state.status === 'paused';
  }

  isStopping(): boolean {
    return this.state.status === 'stopping';
  }
}

export const runStore = new RunStore();
