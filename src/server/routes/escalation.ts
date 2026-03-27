import { Router, Request, Response } from 'express';
import * as esc from '../services/escalationService';

const router = Router();

// POST /api/escalation/create — called by MCP server when Claude needs input
router.post('/create', (req: Request, res: Response) => {
  const { source, taskId, taskTitle, question, options, timeoutSeconds } = req.body;
  if (!question) return res.status(400).json({ ok: false, error: 'question required' });
  const escalation = esc.createEscalation({
    source: source || 'ralph',
    taskId: taskId || '',
    taskTitle: taskTitle || '',
    question, options, timeoutSeconds,
  });
  res.json({ ok: true, data: { escalationId: escalation.id } });
});

// POST /api/escalation/respond — called by frontend when user answers
router.post('/respond', (req: Request, res: Response) => {
  const { id, response } = req.body;
  if (!id || !response) return res.status(400).json({ ok: false, error: 'id and response required' });
  const escalation = esc.respondToEscalation(id, response);
  if (!escalation) return res.status(404).json({ ok: false, error: 'Escalation not found or already resolved' });
  res.json({ ok: true, data: escalation });
});

// GET /api/escalation/status — polled by MCP server to check for response
router.get('/status', (_req: Request, res: Response) => {
  res.json({ ok: true, data: esc.getEscalationStatus() });
});

// POST /api/escalation/clear — clear after consumption
router.post('/clear', (_req: Request, res: Response) => {
  esc.clearEscalation();
  res.json({ ok: true });
});

export default router;
