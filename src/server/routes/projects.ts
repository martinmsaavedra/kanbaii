import { Router, Request, Response } from 'express';
import * as projectStore from '../services/projectStore';
import { emit } from '../lib/typedEmit';
import { ZodError } from 'zod';
import { validateSlugParam } from '../lib/validateSlug';

const router = Router();

// Validate :slug param for all routes in this router
router.param('slug', (req, res, next) => validateSlugParam('slug')(req, res, next));

// GET /api/projects
router.get('/', (_req: Request, res: Response) => {
  const projects = projectStore.listProjects();
  res.json({ ok: true, data: projects });
});

// GET /api/projects/:slug
router.get('/:slug', (req: Request, res: Response) => {
  const project = projectStore.getProject(req.params.slug);
  if (!project) {
    return res.status(404).json({ ok: false, error: 'Project not found' });
  }
  res.json({ ok: true, data: project });
});

// POST /api/projects
router.post('/', (req: Request, res: Response) => {
  try {
    const project = projectStore.createProject(req.body);
    emit('project:updated', { project });
    res.status(201).json({ ok: true, data: project });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ ok: false, error: err.errors[0].message });
    }
    throw err;
  }
});

// PATCH /api/projects/:slug
router.patch('/:slug', (req: Request, res: Response) => {
  try {
    const project = projectStore.updateProject(req.params.slug, req.body);
    emit('project:updated', { project });
    res.json({ ok: true, data: project });
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

// DELETE /api/projects/:slug — soft delete (move to trash)
router.delete('/:slug/permanent', (req: Request, res: Response) => {
  try {
    projectStore.permanentDeleteProject(req.params.slug);
    emit('project:deleted', { slug: req.params.slug });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message.includes('not found')) {
      return res.status(404).json({ ok: false, error: err.message });
    }
    throw err;
  }
});

router.delete('/:slug', (req: Request, res: Response) => {
  try {
    const project = projectStore.deleteProject(req.params.slug);
    emit('project:updated', { project });
    res.json({ ok: true, data: project });
  } catch (err) {
    if (err instanceof Error && err.message.includes('not found')) {
      return res.status(404).json({ ok: false, error: err.message });
    }
    throw err;
  }
});

export default router;
