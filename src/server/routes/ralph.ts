import { Router, Request, Response } from 'express';
import { runStore } from '../engines/runStore';
import { startRalph, stopRalph, pauseRalph, resumeRalph } from '../engines/ralph';

const router = Router();

// POST /api/ralph/start
router.post('/start', async (req: Request, res: Response) => {
  const { projectSlug, workItemSlug } = req.body;

  if (!projectSlug || !workItemSlug) {
    return res.status(400).json({ ok: false, error: 'projectSlug and workItemSlug are required' });
  }

  try {
    // Start async — don't await (it runs in background)
    startRalph({ projectSlug, workItemSlug }).catch((err) => {
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

// GET /api/ralph/state
router.get('/state', (_req: Request, res: Response) => {
  res.json({ ok: true, data: runStore.getState() });
});

export default router;
