import { Router, Request, Response } from 'express';
import * as costTracker from '../services/costTracker';
import { getCachedUsage } from '../services/claudeUsage';

const router = Router();

// GET /api/costs/summary — cost summary (optional ?projectSlug=)
router.get('/summary', (req: Request, res: Response) => {
  const projectSlug = req.query.projectSlug as string | undefined;
  res.json({ ok: true, data: costTracker.getSummary(projectSlug) });
});

// GET /api/costs/executions — execution list
router.get('/executions', (req: Request, res: Response) => {
  const projectSlug = req.query.projectSlug as string | undefined;
  const days = req.query.days ? parseInt(req.query.days as string, 10) : undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  res.json({ ok: true, data: costTracker.listExecutions({ projectSlug, days, limit }) });
});

// POST /api/costs/record — record an execution (called by Ralph/Teams)
router.post('/record', (req: Request, res: Response) => {
  const { projectSlug, workItemSlug, taskId, taskTitle, model, duration, inputTokens, outputTokens, cacheTokens, status } = req.body;
  if (!projectSlug || !model) {
    return res.status(400).json({ ok: false, error: 'projectSlug and model required' });
  }
  const record = costTracker.recordExecution({
    projectSlug, workItemSlug, taskId, taskTitle,
    model: model || 'sonnet',
    duration: duration || 0,
    inputTokens: inputTokens || 0,
    outputTokens: outputTokens || 0,
    cacheTokens: cacheTokens || 0,
    status: status || 'success',
  });
  res.json({ ok: true, data: record });
});

// GET /api/costs/claude-usage — Claude API rate limits (from OAuth)
router.get('/claude-usage', (_req: Request, res: Response) => {
  const data = getCachedUsage();
  res.json({ ok: true, data });
});

// DELETE /api/costs/clear — clear executions
router.delete('/clear', (req: Request, res: Response) => {
  const projectSlug = req.query.projectSlug as string | undefined;
  costTracker.clearExecutions(projectSlug);
  res.json({ ok: true });
});

export default router;
