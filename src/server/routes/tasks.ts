import { Router, Request, Response } from 'express';
import * as workItemStore from '../services/workItemStore';
import { emit } from '../lib/typedEmit';
import { ZodError } from 'zod';

const router = Router({ mergeParams: true });

// POST /api/projects/:slug/work-items/:wiId/tasks
router.post('/', (req: Request, res: Response) => {
  try {
    const { workItem, task } = workItemStore.createTask(req.params.slug, req.params.wiId, req.body);
    emit('workItem:updated', { projectSlug: req.params.slug, workItem });
    res.status(201).json({ ok: true, data: task });
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

// PATCH /api/projects/:slug/work-items/:wiId/tasks/:taskId
router.patch('/:taskId', (req: Request, res: Response) => {
  try {
    const { workItem, task } = workItemStore.updateTask(
      req.params.slug, req.params.wiId, req.params.taskId, req.body
    );
    emit('workItem:updated', { projectSlug: req.params.slug, workItem });
    res.json({ ok: true, data: task });
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

// POST /api/projects/:slug/work-items/:wiId/tasks/:taskId/move
router.post('/:taskId/move', (req: Request, res: Response) => {
  try {
    const workItem = workItemStore.moveTask(
      req.params.slug, req.params.wiId, req.params.taskId, req.body
    );
    emit('task:moved', {
      projectSlug: req.params.slug,
      workItemId: workItem.id,
      taskId: req.params.taskId,
      toColumn: req.body.toColumn,
      toIndex: req.body.toIndex,
    });
    emit('workItem:updated', { projectSlug: req.params.slug, workItem });
    res.json({ ok: true, data: workItem });
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

// DELETE /api/projects/:slug/work-items/:wiId/tasks/:taskId
router.delete('/:taskId', (req: Request, res: Response) => {
  try {
    const workItem = workItemStore.deleteTask(
      req.params.slug, req.params.wiId, req.params.taskId
    );
    emit('workItem:updated', { projectSlug: req.params.slug, workItem });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message.includes('not found')) {
      return res.status(404).json({ ok: false, error: err.message });
    }
    throw err;
  }
});

export default router;
