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
  time: string;          // HH:mm
  dayOfWeek?: number;    // 0-6 (Sunday-Saturday) for weekly/biweekly
  dayOfMonth?: number;   // 1-31 for monthly
  timezone: string;
  enabled: boolean;
  lastRun: string | null;
  lastStatus: 'success' | 'failed' | 'running' | null;
  nextRun: string | null;
  runCount: number;
  createdAt: string;
}

export interface ScheduleRunLog {
  scheduleId: string;
  startedAt: string;
  completedAt: string | null;
  status: 'success' | 'failed' | 'running' | 'cancelled';
  output?: string;
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
  projectSlug: string;
  workItemSlug: string;
  taskId: string;
  taskTitle: string;
  frequency: ScheduleFrequency;
  time: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  timezone?: string;
}): TaskSchedule {
  const schedules = readSchedules();

  // Remove existing schedule for this task
  const filtered = schedules.filter(s =>
    !(s.projectSlug === data.projectSlug && s.workItemSlug === data.workItemSlug && s.taskId === data.taskId)
  );

  const schedule: TaskSchedule = {
    id: `sched-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    projectSlug: data.projectSlug,
    workItemSlug: data.workItemSlug,
    taskId: data.taskId,
    taskTitle: data.taskTitle,
    frequency: data.frequency,
    time: data.time,
    dayOfWeek: data.dayOfWeek,
    dayOfMonth: data.dayOfMonth,
    timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    enabled: true,
    lastRun: null,
    lastStatus: null,
    nextRun: computeNextRun(data.frequency, data.time, data.dayOfWeek, data.dayOfMonth),
    runCount: 0,
    createdAt: new Date().toISOString(),
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

  schedule.nextRun = schedule.enabled
    ? computeNextRun(schedule.frequency, schedule.time, schedule.dayOfWeek, schedule.dayOfMonth)
    : null;

  writeSchedules(schedules);
  return schedule;
}

export function deleteSchedule(id: string): void {
  const schedules = readSchedules().filter(s => s.id !== id);
  writeSchedules(schedules);
}

export function markRunStarted(id: string): void {
  const schedules = readSchedules();
  const schedule = schedules.find(s => s.id === id);
  if (!schedule) return;
  schedule.lastRun = new Date().toISOString();
  schedule.lastStatus = 'running';
  writeSchedules(schedules);
}

export function markRunCompleted(id: string, status: 'success' | 'failed'): void {
  const schedules = readSchedules();
  const schedule = schedules.find(s => s.id === id);
  if (!schedule) return;
  schedule.lastStatus = status;
  schedule.runCount++;

  // Compute next run (or null if once)
  if (schedule.frequency === 'once') {
    schedule.enabled = false;
    schedule.nextRun = null;
  } else {
    schedule.nextRun = computeNextRun(schedule.frequency, schedule.time, schedule.dayOfWeek, schedule.dayOfMonth);
  }

  writeSchedules(schedules);
}

// ─── Stale Watchdog ───

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export function findStaleSchedules(): TaskSchedule[] {
  const schedules = readSchedules();
  const now = Date.now();
  return schedules.filter(s => {
    if (s.lastStatus !== 'running' || !s.lastRun) return false;
    return (now - new Date(s.lastRun).getTime()) > STALE_THRESHOLD_MS;
  });
}

export function resetStaleSchedules(): number {
  const schedules = readSchedules();
  const now = Date.now();
  let resetCount = 0;
  for (const s of schedules) {
    if (s.lastStatus === 'running' && s.lastRun && (now - new Date(s.lastRun).getTime()) > STALE_THRESHOLD_MS) {
      s.lastStatus = 'failed';
      s.nextRun = s.enabled ? computeNextRun(s.frequency, s.time, s.dayOfWeek, s.dayOfMonth) : null;
      resetCount++;
    }
  }
  if (resetCount > 0) writeSchedules(schedules);
  return resetCount;
}

// ─── Scheduler Loop ───

let checkInterval: ReturnType<typeof setInterval> | null = null;

export function startSchedulerLoop(): void {
  if (checkInterval) return;
  // Reset stale on startup
  resetStaleSchedules();
  // Check every 30 seconds
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

    const nextRun = new Date(schedule.nextRun);
    if (now >= nextRun) {
      // Emit event — Ralph or task runner will pick it up
      emit('ralph:output' as any, {
        taskId: schedule.taskId,
        message: `[scheduler] Triggering scheduled task: ${schedule.taskTitle}`,
      });

      markRunStarted(schedule.id);
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
      if (next <= now) next.setDate(next.getDate() + 1);
      break;

    case 'daily':
      if (next <= now) next.setDate(next.getDate() + 1);
      break;

    case 'weekly':
      if (dayOfWeek !== undefined) {
        const currentDay = next.getDay();
        let daysUntil = dayOfWeek - currentDay;
        if (daysUntil < 0 || (daysUntil === 0 && next <= now)) daysUntil += 7;
        next.setDate(next.getDate() + daysUntil);
      } else {
        if (next <= now) next.setDate(next.getDate() + 7);
      }
      break;

    case 'biweekly':
      if (dayOfWeek !== undefined) {
        const currentDay = next.getDay();
        let daysUntil = dayOfWeek - currentDay;
        if (daysUntil < 0 || (daysUntil === 0 && next <= now)) daysUntil += 14;
        next.setDate(next.getDate() + daysUntil);
      } else {
        if (next <= now) next.setDate(next.getDate() + 14);
      }
      break;

    case 'monthly':
      if (dayOfMonth !== undefined) {
        next.setDate(dayOfMonth);
        if (next <= now) next.setMonth(next.getMonth() + 1);
      } else {
        if (next <= now) next.setMonth(next.getMonth() + 1);
      }
      break;
  }

  return next.toISOString();
}

// Summary for UI
export function getSchedulerStatus(): {
  running: boolean;
  totalSchedules: number;
  active: number;
  runningNow: number;
  nextDue: string | null;
} {
  const schedules = readSchedules();
  const active = schedules.filter(s => s.enabled);
  const runningNow = schedules.filter(s => s.lastStatus === 'running');
  const nextDue = active
    .filter(s => s.nextRun)
    .sort((a, b) => new Date(a.nextRun!).getTime() - new Date(b.nextRun!).getTime())[0];

  return {
    running: isSchedulerRunning(),
    totalSchedules: schedules.length,
    active: active.length,
    runningNow: runningNow.length,
    nextDue: nextDue?.nextRun || null,
  };
}
