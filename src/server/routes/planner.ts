import { Router, Request, Response } from 'express';
import { plannerStore } from '../engines/plannerStore';
import { startPlanner, stopPlanner, approveItem, discardItem } from '../engines/planner';

const router = Router();

// POST /api/planner/start
router.post('/start', async (req: Request, res: Response) => {
  const { projectSlug, prompt } = req.body;
  if (!projectSlug || !prompt) {
    return res.status(400).json({ ok: false, error: 'projectSlug and prompt are required' });
  }
  if (plannerStore.isActive()) {
    return res.status(409).json({ ok: false, error: 'Planner is already running. Stop it first.' });
  }

  try {
    startPlanner(projectSlug, prompt).catch((err) => {
      console.error('[planner] Error:', err);
    });
    res.json({ ok: true, data: { message: 'Planner started' } });
  } catch (err) {
    res.status(409).json({ ok: false, error: (err as Error).message });
  }
});

// POST /api/planner/stop
router.post('/stop', (_req: Request, res: Response) => {
  stopPlanner();
  res.json({ ok: true, data: { message: 'Planner stopped' } });
});

// GET /api/planner/state
router.get('/state', (_req: Request, res: Response) => {
  res.json({ ok: true, data: plannerStore.getState() });
});

// POST /api/planner/approve
router.post('/approve', async (req: Request, res: Response) => {
  const { itemId } = req.body;
  if (!itemId) return res.status(400).json({ ok: false, error: 'itemId is required' });

  try {
    const slug = await approveItem(itemId);
    res.json({ ok: true, data: { workItemSlug: slug } });
  } catch (err) {
    res.status(400).json({ ok: false, error: (err as Error).message });
  }
});

// POST /api/planner/discard
router.post('/discard', (req: Request, res: Response) => {
  const { itemId } = req.body;
  if (!itemId) return res.status(400).json({ ok: false, error: 'itemId is required' });

  discardItem(itemId);
  res.json({ ok: true, data: { message: 'Item discarded' } });
});

export default router;
