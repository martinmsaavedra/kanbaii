import { Router, Request, Response } from 'express';
import * as terminalManager from '../services/terminalManager';
import * as projectStore from '../services/projectStore';

const router = Router();

// POST /api/terminal/spawn — Start PTY terminal
router.post('/spawn', (req: Request, res: Response) => {
  const { projectSlug, model, cols, rows } = req.body;
  if (!projectSlug) return res.status(400).json({ ok: false, error: 'projectSlug required' });

  const project = projectStore.getProject(projectSlug);
  if (!project) return res.status(404).json({ ok: false, error: 'Project not found' });
  if (!project.workingDir) return res.status(400).json({ ok: false, error: 'No working directory' });

  try {
    const id = terminalManager.spawnPty(projectSlug, project.workingDir, { model, cols, rows });
    res.json({ ok: true, data: { sessionId: id } });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// POST /api/terminal/input — Send keystrokes to PTY
router.post('/input', (req: Request, res: Response) => {
  const { projectSlug, data } = req.body;
  terminalManager.sendInput(projectSlug, data);
  res.json({ ok: true });
});

// POST /api/terminal/resize — Resize PTY
router.post('/resize', (req: Request, res: Response) => {
  const { projectSlug, cols, rows } = req.body;
  terminalManager.resizeTerminal(projectSlug, cols, rows);
  res.json({ ok: true });
});

// GET /api/terminal/state/:projectSlug
router.get('/state/:projectSlug', (req: Request, res: Response) => {
  res.json({ ok: true, data: terminalManager.getSessionState(req.params.projectSlug) });
});

// POST /api/terminal/stop
router.post('/stop', (req: Request, res: Response) => {
  terminalManager.killSession(req.body.projectSlug);
  res.json({ ok: true });
});

// POST /api/terminal/reset
router.post('/reset', (req: Request, res: Response) => {
  terminalManager.resetSession(req.body.projectSlug);
  res.json({ ok: true });
});

export default router;
