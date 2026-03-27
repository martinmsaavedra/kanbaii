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

// POST /api/planner/report-item — called by MCP tool to register a discovered item
router.post('/report-item', (req: Request, res: Response) => {
  const { id, title, category } = req.body;
  if (!id || !title) return res.status(400).json({ ok: false, error: 'id and title required' });

  const { emit } = require('../lib/typedEmit');
  const item = plannerStore.addDiscoveredItem({ id, title, category: category || 'feature' });

  // Add system message to chat
  const msg = plannerStore.addMessage('system', `Identified: ${title} (${category || 'feature'})`);
  emit('planner:message' as any, { id: msg.id, role: 'system', content: msg.content });
  emit('planner:item-discovered' as any, { id: item.id, title: item.title, category: item.category });

  res.json({ ok: true, data: { itemId: item.id, message: `Item "${title}" registered. The user can see it on the dashboard.` } });
});

// POST /api/planner/update-item — called by MCP tool to update plan/tasks on item
router.post('/update-item', (req: Request, res: Response) => {
  const { id, status, plan, tasks } = req.body;
  if (!id) return res.status(400).json({ ok: false, error: 'id required' });

  const { emit } = require('../lib/typedEmit');
  const item = plannerStore.updateItem(id, { status, plan, tasks });
  if (!item) return res.status(404).json({ ok: false, error: `Item not found: ${id}` });

  emit('planner:item-updated' as any, { id, status: item.status, plan: item.plan, tasks: item.tasks });

  if (status === 'ready') {
    const msg = plannerStore.addMessage('system', `Ready for approval: ${item.title} (${item.tasks.length} tasks)`);
    emit('planner:message' as any, { id: msg.id, role: 'system', content: msg.content });
  } else if (status === 'planning') {
    const msg = plannerStore.addMessage('system', `Planning: ${item.title}...`);
    emit('planner:message' as any, { id: msg.id, role: 'system', content: msg.content });
  }

  res.json({ ok: true, data: { itemId: item.id, status: item.status, message: `Item "${item.title}" updated to ${item.status}. ${item.tasks.length} tasks.` } });
});

export default router;
