import { Router, Request, Response } from 'express';
import { startTeams, stopTeams, getTeamsState, sendInputToWorker } from '../engines/teams';

const router = Router();

// POST /api/teams/start
router.post('/start', async (req: Request, res: Response) => {
  const { projectSlug, workItemSlugs, maxWorkers } = req.body;

  if (!projectSlug || !workItemSlugs?.length) {
    return res.status(400).json({ ok: false, error: 'projectSlug and workItemSlugs are required' });
  }

  try {
    startTeams({ projectSlug, workItemSlugs, maxWorkers }).catch((err) => {
      console.error('[teams] Error:', err);
    });
    res.json({ ok: true, data: { message: 'Teams started' } });
  } catch (err) {
    res.status(409).json({ ok: false, error: (err as Error).message });
  }
});

// POST /api/teams/stop
router.post('/stop', (_req: Request, res: Response) => {
  stopTeams();
  res.json({ ok: true, data: { message: 'Teams stopped' } });
});

// POST /api/teams/input — send user input to a worker's Claude process
router.post('/input', (req: Request, res: Response) => {
  const { workerId, text } = req.body;
  if (!text) return res.status(400).json({ ok: false, error: 'text required' });
  const sent = sendInputToWorker(workerId || '', text);
  if (sent) {
    res.json({ ok: true });
  } else {
    res.status(409).json({ ok: false, error: 'No active worker to receive input' });
  }
});

// GET /api/teams/state
router.get('/state', (_req: Request, res: Response) => {
  res.json({ ok: true, data: getTeamsState() });
});

export default router;
