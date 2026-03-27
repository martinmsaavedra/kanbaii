import { Router, Request, Response } from 'express';
import { scanPlugins, togglePlugin } from '../services/pluginLoader';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const plugins = scanPlugins();
  res.json({ ok: true, data: plugins });
});

router.post('/toggle', (req: Request, res: Response) => {
  const { name, enabled } = req.body;
  if (!name) return res.status(400).json({ ok: false, error: 'name required' });
  togglePlugin(name, enabled);
  res.json({ ok: true });
});

router.post('/rescan', (_req: Request, res: Response) => {
  const plugins = scanPlugins();
  res.json({ ok: true, data: plugins });
});

export default router;
