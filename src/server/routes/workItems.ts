import { Router, Request, Response } from 'express';
import * as workItemStore from '../services/workItemStore';
import { emit } from '../lib/typedEmit';
import { ZodError } from 'zod';

const router = Router({ mergeParams: true });

// GET /api/projects/:slug/work-items
router.get('/', (req: Request, res: Response) => {
  const items = workItemStore.listWorkItems(req.params.slug);
  res.json({ ok: true, data: items });
});

// GET /api/projects/:slug/work-items/:wiId
router.get('/:wiId', (req: Request, res: Response) => {
  const item = workItemStore.getWorkItem(req.params.slug, req.params.wiId);
  if (!item) {
    return res.status(404).json({ ok: false, error: 'Work item not found' });
  }
  res.json({ ok: true, data: item });
});

// POST /api/projects/:slug/work-items
router.post('/', (req: Request, res: Response) => {
  try {
    const item = workItemStore.createWorkItem(req.params.slug, req.body);
    emit('workItem:updated', { projectSlug: req.params.slug, workItem: item });
    res.status(201).json({ ok: true, data: item });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ ok: false, error: err.errors[0].message });
    }
    throw err;
  }
});

// PATCH /api/projects/:slug/work-items/:wiId
router.patch('/:wiId', (req: Request, res: Response) => {
  try {
    const item = workItemStore.updateWorkItem(req.params.slug, req.params.wiId, req.body);
    emit('workItem:updated', { projectSlug: req.params.slug, workItem: item });
    res.json({ ok: true, data: item });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ ok: false, error: err.errors[0].message });
    }
    if (err instanceof Error && err.message.includes('not found')) {
      return res.status(404).json({ ok: false, error: err.message });
    }
    throw err;
  }
});

// POST /api/projects/:slug/work-items/:wiId/reorder
router.post('/:wiId/reorder', (req: Request, res: Response) => {
  const { order } = req.body;
  if (typeof order !== 'number') return res.status(400).json({ ok: false, error: 'order (number) required' });
  const item = workItemStore.reorderWorkItem(req.params.slug, req.params.wiId, order);
  if (!item) return res.status(404).json({ ok: false, error: 'Work item not found' });
  emit('workItem:updated', { projectSlug: req.params.slug, workItem: item });
  res.json({ ok: true, data: item });
});

// DELETE /api/projects/:slug/work-items/:wiId
router.delete('/:wiId', (req: Request, res: Response) => {
  try {
    workItemStore.deleteWorkItem(req.params.slug, req.params.wiId);
    emit('workItem:deleted', { projectSlug: req.params.slug, workItemId: req.params.wiId });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message.includes('not found')) {
      return res.status(404).json({ ok: false, error: err.message });
    }
    throw err;
  }
});

export default router;
