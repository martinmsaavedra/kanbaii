import { Router, Request, Response } from 'express';
import { runStore } from '../engines/runStore';
import { startRalph, stopRalph, pauseRalph, resumeRalph } from '../engines/ralph';

const router = Router();

// POST /api/ralph/start
router.post('/start', async (req: Request, res: Response) => {
  const { projectSlug, workItemSlug, taskIds } = req.body;

  if (!projectSlug || !workItemSlug) {
    return res.status(400).json({ ok: false, error: 'projectSlug and workItemSlug are required' });
  }

  // Check if already running
  if (runStore.getState().status !== 'idle') {
    return res.status(409).json({ ok: false, error: 'Ralph is already running. Stop it first.' });
  }

  try {
    startRalph({ projectSlug, workItemSlug, taskIds }).catch((err) => {
      console.error('[ralph] Loop error:', err);
    });
    res.json({ ok: true, data: { message: 'Ralph started' } });
  } catch (err) {
    res.status(409).json({ ok: false, error: (err as Error).message });
  }
});

// POST /api/ralph/stop
router.post('/stop', (_req: Request, res: Response) => {
  stopRalph();
  res.json({ ok: true, data: { message: 'Stop requested' } });
});

// POST /api/ralph/pause
router.post('/pause', (_req: Request, res: Response) => {
  pauseRalph();
  res.json({ ok: true, data: { message: 'Paused' } });
});

// POST /api/ralph/resume
router.post('/resume', (_req: Request, res: Response) => {
  resumeRalph();
  res.json({ ok: true, data: { message: 'Resumed' } });
});

// POST /api/ralph/input — send user input to running Claude process
router.post('/input', (req: Request, res: Response) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ ok: false, error: 'text required' });

  // Access the current runner via the module
  const ralph = require('../engines/ralph');
  if (ralph.sendInputToRunner) {
    ralph.sendInputToRunner(text);
    res.json({ ok: true });
  } else {
    res.status(409).json({ ok: false, error: 'No active runner' });
  }
});

// GET /api/ralph/state
router.get('/state', (_req: Request, res: Response) => {
  res.json({ ok: true, data: runStore.getState() });
});

export default router;
