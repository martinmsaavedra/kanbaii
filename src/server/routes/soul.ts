import { Router, Request, Response } from 'express';
import * as soulStore from '../services/soulStore';

const router = Router({ mergeParams: true });

// ─── Documents ───

// GET /api/projects/:slug/soul/documents
router.get('/documents', (req: Request, res: Response) => {
  const docs = soulStore.listDocuments(req.params.slug);
  res.json({ ok: true, data: docs });
});

// GET /api/projects/:slug/soul/documents/:name
router.get('/documents/:name', (req: Request, res: Response) => {
  const doc = soulStore.getDocument(req.params.slug, req.params.name);
  if (!doc) return res.status(404).json({ ok: false, error: 'Document not found' });
  res.json({ ok: true, data: doc });
});

// PUT /api/projects/:slug/soul/documents/:name
router.put('/documents/:name', (req: Request, res: Response) => {
  const { content } = req.body;
  if (content === undefined) return res.status(400).json({ ok: false, error: 'content required' });
  try {
    const doc = soulStore.updateDocument(req.params.slug, req.params.name, content);
    res.json({ ok: true, data: doc });
  } catch (err) {
    res.status(400).json({ ok: false, error: (err as Error).message });
  }
});

// ─── Memory ───

// GET /api/projects/:slug/soul/memory
router.get('/memory', (req: Request, res: Response) => {
  res.json({ ok: true, data: soulStore.getMemory(req.params.slug) });
});

// POST /api/projects/:slug/soul/memory
router.post('/memory', (req: Request, res: Response) => {
  const { content, source } = req.body;
  if (!content) return res.status(400).json({ ok: false, error: 'content required' });
  const entry = soulStore.addMemory(req.params.slug, content, source);
  res.json({ ok: true, data: entry });
});

// PATCH /api/projects/:slug/soul/memory/:id
router.patch('/memory/:id', (req: Request, res: Response) => {
  const { content } = req.body;
  const entry = soulStore.updateMemoryEntry(req.params.slug, req.params.id, content);
  if (!entry) return res.status(404).json({ ok: false, error: 'Entry not found' });
  res.json({ ok: true, data: entry });
});

// DELETE /api/projects/:slug/soul/memory/:id
router.delete('/memory/:id', (req: Request, res: Response) => {
  soulStore.deleteMemoryEntry(req.params.slug, req.params.id);
  res.json({ ok: true });
});

// POST /api/projects/:slug/soul/memory/reset
router.post('/memory/reset', (req: Request, res: Response) => {
  soulStore.resetMemory(req.params.slug);
  res.json({ ok: true });
});

// ─── Daily Logs ───

// GET /api/projects/:slug/soul/logs
router.get('/logs', (req: Request, res: Response) => {
  res.json({ ok: true, data: soulStore.listDailyLogs(req.params.slug) });
});

// GET /api/projects/:slug/soul/logs/:date
router.get('/logs/:date', (req: Request, res: Response) => {
  try {
    const log = soulStore.getDailyLog(req.params.slug, req.params.date);
    if (!log) return res.status(404).json({ ok: false, error: 'Log not found' });
    res.json({ ok: true, data: log });
  } catch (err) {
    res.status(400).json({ ok: false, error: (err as Error).message });
  }
});

// POST /api/projects/:slug/soul/logs
router.post('/logs', (req: Request, res: Response) => {
  const { entry, date } = req.body;
  if (!entry) return res.status(400).json({ ok: false, error: 'entry required' });
  try {
    soulStore.appendDailyLog(req.params.slug, entry, date);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: (err as Error).message });
  }
});

// ─── Config ───

// GET /api/projects/:slug/soul/config
router.get('/config', (req: Request, res: Response) => {
  res.json({ ok: true, data: soulStore.getConfig(req.params.slug) });
});

// PUT /api/projects/:slug/soul/config
router.put('/config', (req: Request, res: Response) => {
  const config = soulStore.updateConfig(req.params.slug, req.body);
  res.json({ ok: true, data: config });
});

// ─── Health ───

// GET /api/projects/:slug/soul/health
router.get('/health', (req: Request, res: Response) => {
  res.json({ ok: true, data: soulStore.getHealth(req.params.slug) });
});

export default router;
