import { Router, Request, Response } from 'express';
import * as scheduler from '../services/schedulerService';

const router = Router({ mergeParams: true });

// GET /api/scheduler/status — scheduler loop status + summary
router.get('/status', (_req: Request, res: Response) => {
  res.json({ ok: true, data: scheduler.getSchedulerStatus() });
});

// GET /api/scheduler/schedules — list all (optional ?projectSlug=)
router.get('/schedules', (req: Request, res: Response) => {
  const projectSlug = req.query.projectSlug as string | undefined;
  res.json({ ok: true, data: scheduler.listSchedules(projectSlug) });
});

// GET /api/scheduler/schedules/:id
router.get('/schedules/:id', (req: Request, res: Response) => {
  const schedule = scheduler.getSchedule(req.params.id);
  if (!schedule) return res.status(404).json({ ok: false, error: 'Schedule not found' });
  res.json({ ok: true, data: schedule });
});

// POST /api/scheduler/schedules — create schedule
router.post('/schedules', (req: Request, res: Response) => {
  const { projectSlug, workItemSlug, taskId, taskTitle, frequency, time, dayOfWeek, dayOfMonth, timezone } = req.body;
  if (!projectSlug || !workItemSlug || !taskId || !frequency || !time) {
    return res.status(400).json({ ok: false, error: 'projectSlug, workItemSlug, taskId, frequency, and time are required' });
  }
  const schedule = scheduler.createSchedule({
    projectSlug, workItemSlug, taskId, taskTitle: taskTitle || taskId,
    frequency, time, dayOfWeek, dayOfMonth, timezone,
  });
  res.json({ ok: true, data: schedule });
});

// PATCH /api/scheduler/schedules/:id — update schedule
router.patch('/schedules/:id', (req: Request, res: Response) => {
  const schedule = scheduler.updateSchedule(req.params.id, req.body);
  if (!schedule) return res.status(404).json({ ok: false, error: 'Schedule not found' });
  res.json({ ok: true, data: schedule });
});

// DELETE /api/scheduler/schedules/:id
router.delete('/schedules/:id', (req: Request, res: Response) => {
  scheduler.deleteSchedule(req.params.id);
  res.json({ ok: true });
});

// POST /api/scheduler/schedules/:id/run — run now
router.post('/schedules/:id/run', (req: Request, res: Response) => {
  const schedule = scheduler.getSchedule(req.params.id);
  if (!schedule) return res.status(404).json({ ok: false, error: 'Schedule not found' });
  scheduler.markRunStarted(schedule.id);
  res.json({ ok: true, data: { message: `Triggered: ${schedule.taskTitle}` } });
});

// POST /api/scheduler/schedules/:id/cancel — cancel running
router.post('/schedules/:id/cancel', (req: Request, res: Response) => {
  scheduler.markRunCompleted(req.params.id, 'failed');
  res.json({ ok: true });
});

// GET /api/scheduler/task/:projectSlug/:workItemSlug/:taskId — get schedule for specific task
router.get('/task/:projectSlug/:workItemSlug/:taskId', (req: Request, res: Response) => {
  const schedule = scheduler.getTaskSchedule(req.params.projectSlug, req.params.workItemSlug, req.params.taskId);
  res.json({ ok: true, data: schedule });
});

// POST /api/scheduler/start — start the scheduler loop
router.post('/start', (_req: Request, res: Response) => {
  scheduler.startSchedulerLoop();
  res.json({ ok: true, data: { message: 'Scheduler started' } });
});

// POST /api/scheduler/stop — stop the scheduler loop
router.post('/stop', (_req: Request, res: Response) => {
  scheduler.stopSchedulerLoop();
  res.json({ ok: true, data: { message: 'Scheduler stopped' } });
});

// POST /api/scheduler/watchdog — check for stale schedules
router.post('/watchdog', (_req: Request, res: Response) => {
  const resetCount = scheduler.resetStaleSchedules();
  res.json({ ok: true, data: { reset: resetCount } });
});

export default router;
