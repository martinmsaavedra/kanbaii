import fs from 'fs';
import path from 'path';
import { emit } from '../lib/typedEmit';

const DATA_DIR = path.resolve(process.env.KANBAII_DATA_DIR || path.join(process.cwd(), 'data', 'projects'));
const SCHEDULES_FILE = path.join(DATA_DIR, '..', '.schedules.json');

// ─── Types ───

export type ScheduleFrequency = 'once' | 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface TaskSchedule {
  id: string;
  projectSlug: string;
  workItemSlug: string;
  taskId: string;
  taskTitle: string;
  frequency: ScheduleFrequency;
  time: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  timezone: string;
  enabled: boolean;
  lastRun: string | null;
  lastStatus: 'success' | 'failed' | 'running' | null;
  nextRun: string | null;
  runCount: number;
  createdAt: string;
}

// ─── Persistence ───

function readSchedules(): TaskSchedule[] {
  try {
    if (fs.existsSync(SCHEDULES_FILE)) {
      return JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf-8')).schedules || [];
    }
  } catch {}
  return [];
}

function writeSchedules(schedules: TaskSchedule[]): void {
  const dir = path.dirname(SCHEDULES_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify({ schedules }, null, 2), 'utf-8');
}

// ─── CRUD ───

export function listSchedules(projectSlug?: string): TaskSchedule[] {
  const all = readSchedules();
  if (projectSlug) return all.filter(s => s.projectSlug === projectSlug);
  return all;
}

export function getSchedule(id: string): TaskSchedule | null {
  return readSchedules().find(s => s.id === id) || null;
}

export function getTaskSchedule(projectSlug: string, workItemSlug: string, taskId: string): TaskSchedule | null {
  return readSchedules().find(s =>
    s.projectSlug === projectSlug && s.workItemSlug === workItemSlug && s.taskId === taskId
  ) || null;
}

export function createSchedule(data: {
  projectSlug: string; workItemSlug: string; taskId: string; taskTitle: string;
  frequency: ScheduleFrequency; time: string; dayOfWeek?: number; dayOfMonth?: number; timezone?: string;
}): TaskSchedule {
  const schedules = readSchedules();
  const filtered = schedules.filter(s =>
    !(s.projectSlug === data.projectSlug && s.workItemSlug === data.workItemSlug && s.taskId === data.taskId)
  );
  const schedule: TaskSchedule = {
    id: `sched-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ...data,
    timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    enabled: true, lastRun: null, lastStatus: null,
    nextRun: computeNextRun(data.frequency, data.time, data.dayOfWeek, data.dayOfMonth),
    runCount: 0, createdAt: new Date().toISOString(),
  };
  filtered.push(schedule);
  writeSchedules(filtered);
  return schedule;
}

export function updateSchedule(id: string, data: Partial<Pick<TaskSchedule, 'frequency' | 'time' | 'dayOfWeek' | 'dayOfMonth' | 'enabled'>>): TaskSchedule | null {
  const schedules = readSchedules();
  const schedule = schedules.find(s => s.id === id);
  if (!schedule) return null;
  if (data.frequency !== undefined) schedule.frequency = data.frequency;
  if (data.time !== undefined) schedule.time = data.time;
  if (data.dayOfWeek !== undefined) schedule.dayOfWeek = data.dayOfWeek;
  if (data.dayOfMonth !== undefined) schedule.dayOfMonth = data.dayOfMonth;
  if (data.enabled !== undefined) schedule.enabled = data.enabled;
  schedule.nextRun = schedule.enabled ? computeNextRun(schedule.frequency, schedule.time, schedule.dayOfWeek, schedule.dayOfMonth) : null;
  writeSchedules(schedules);
  return schedule;
}

export function deleteSchedule(id: string): void {
  writeSchedules(readSchedules().filter(s => s.id !== id));
}

export function markRunStarted(id: string): void {
  const schedules = readSchedules();
  const s = schedules.find(s => s.id === id);
  if (!s) return;
  s.lastRun = new Date().toISOString();
  s.lastStatus = 'running';
  writeSchedules(schedules);
}

export function markRunCompleted(id: string, status: 'success' | 'failed'): void {
  const schedules = readSchedules();
  const s = schedules.find(s => s.id === id);
  if (!s) return;
  s.lastStatus = status;
  s.runCount++;
  if (s.frequency === 'once') { s.enabled = false; s.nextRun = null; }
  else { s.nextRun = computeNextRun(s.frequency, s.time, s.dayOfWeek, s.dayOfMonth); }
  writeSchedules(schedules);
}

// ─── Execute a single scheduled task via Ralph ───

export async function executeScheduledTask(id: string): Promise<{ ok: boolean; error?: string }> {
  const schedule = getSchedule(id);
  if (!schedule) return { ok: false, error: 'Schedule not found' };

  // Lazy import to avoid circular dependency
  const { startRalph } = require('../engines/ralph');
  const { runStore } = require('../engines/runStore');

  // Check if Ralph is already busy
  if (runStore.getState().status !== 'idle') {
    return { ok: false, error: 'Ralph is busy with another run' };
  }

  markRunStarted(id);

  try {
    // Move this specific task to "todo" if it's not already there
    const workItemStore = require('./workItemStore');
    const wi = workItemStore.getWorkItem(schedule.projectSlug, schedule.workItemSlug);
    if (!wi) return { ok: false, error: 'Work item not found' };

    // Find the task in any column
    let taskFound = false;
    for (const [col, tasks] of Object.entries(wi.columns)) {
      const task = (tasks as any[]).find((t: any) => t.id === schedule.taskId);
      if (task) {
        if (col !== 'todo') {
          workItemStore.moveTask(schedule.projectSlug, schedule.workItemSlug, schedule.taskId, {
            toColumn: 'todo', toIndex: 0,
          });
          const updatedWI = workItemStore.getWorkItem(schedule.projectSlug, schedule.workItemSlug);
          if (updatedWI) emit('workItem:updated', { projectSlug: schedule.projectSlug, workItem: updatedWI });
        }
        taskFound = true;
        break;
      }
    }

    if (!taskFound) {
      markRunCompleted(id, 'failed');
      return { ok: false, error: 'Task not found in work item' };
    }

    // Start Ralph on the work item — it will pick up the task from "todo"
    startRalph({ projectSlug: schedule.projectSlug, workItemSlug: schedule.workItemSlug })
      .then(() => { markRunCompleted(id, 'success'); })
      .catch((err: Error) => {
        markRunCompleted(id, 'failed');
        console.error(`[scheduler] Task execution failed: ${err.message}`);
      });

    return { ok: true };
  } catch (err) {
    markRunCompleted(id, 'failed');
    return { ok: false, error: (err as Error).message };
  }
}

// ─── Stale Watchdog ───

const STALE_THRESHOLD_MS = 30 * 60 * 1000;

export function resetStaleSchedules(): number {
  const schedules = readSchedules();
  const now = Date.now();
  let count = 0;
  for (const s of schedules) {
    if (s.lastStatus === 'running' && s.lastRun && (now - new Date(s.lastRun).getTime()) > STALE_THRESHOLD_MS) {
      s.lastStatus = 'failed';
      s.nextRun = s.enabled ? computeNextRun(s.frequency, s.time, s.dayOfWeek, s.dayOfMonth) : null;
      count++;
    }
  }
  if (count > 0) writeSchedules(schedules);
  return count;
}

// ─── Scheduler Loop ───

let checkInterval: ReturnType<typeof setInterval> | null = null;

export function startSchedulerLoop(): void {
  if (checkInterval) return;
  resetStaleSchedules();
  checkInterval = setInterval(checkDueSchedules, 30_000);
  console.log('[scheduler] Loop started (30s interval)');
}

export function stopSchedulerLoop(): void {
  if (checkInterval) { clearInterval(checkInterval); checkInterval = null; }
}

export function isSchedulerRunning(): boolean {
  return checkInterval !== null;
}

function checkDueSchedules(): void {
  const now = new Date();
  const schedules = readSchedules();
  for (const schedule of schedules) {
    if (!schedule.enabled || !schedule.nextRun || schedule.lastStatus === 'running') continue;
    if (now >= new Date(schedule.nextRun)) {
      console.log(`[scheduler] Executing due task: ${schedule.taskTitle}`);
      executeScheduledTask(schedule.id).catch(err => {
        console.error(`[scheduler] Failed to execute: ${err}`);
      });
    }
  }
}

// ─── Helpers ───

function computeNextRun(frequency: ScheduleFrequency, time: string, dayOfWeek?: number, dayOfMonth?: number): string {
  const [hours, minutes] = time.split(':').map(Number);
  const now = new Date();
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);

  switch (frequency) {
    case 'once':
    case 'daily':
      if (next <= now) next.setDate(next.getDate() + 1);
      break;
    case 'weekly': {
      if (dayOfWeek !== undefined) {
        let d = dayOfWeek - next.getDay();
        if (d < 0 || (d === 0 && next <= now)) d += 7;
        next.setDate(next.getDate() + d);
      } else if (next <= now) next.setDate(next.getDate() + 7);
      break;
    }
    case 'biweekly': {
      if (dayOfWeek !== undefined) {
        let d = dayOfWeek - next.getDay();
        if (d < 0 || (d === 0 && next <= now)) d += 14;
        next.setDate(next.getDate() + d);
      } else if (next <= now) next.setDate(next.getDate() + 14);
      break;
    }
    case 'monthly':
      if (dayOfMonth !== undefined) { next.setDate(dayOfMonth); if (next <= now) next.setMonth(next.getMonth() + 1); }
      else if (next <= now) next.setMonth(next.getMonth() + 1);
      break;
  }
  return next.toISOString();
}

export function getSchedulerStatus() {
  const schedules = readSchedules();
  const active = schedules.filter(s => s.enabled);
  const running = schedules.filter(s => s.lastStatus === 'running');
  const next = active.filter(s => s.nextRun).sort((a, b) => new Date(a.nextRun!).getTime() - new Date(b.nextRun!).getTime())[0];
  return {
    running: isSchedulerRunning(),
    totalSchedules: schedules.length,
    active: active.length,
    runningNow: running.length,
    nextDue: next?.nextRun || null,
  };
}
