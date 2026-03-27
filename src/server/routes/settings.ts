import { Router, Request, Response } from 'express';
import * as settingsService from '../services/settingsService';

const router = Router();

// GET /api/settings
router.get('/', (_req: Request, res: Response) => {
  res.json({ ok: true, data: settingsService.getSettings() });
});

// PUT /api/settings — update entire settings
router.put('/', (req: Request, res: Response) => {
  const settings = settingsService.updateSettings(req.body);
  res.json({ ok: true, data: settings });
});

// GET /api/settings/:section
router.get('/:section', (req: Request, res: Response) => {
  const section = req.params.section as keyof ReturnType<typeof settingsService.getSettings>;
  const settings = settingsService.getSettings();
  if (!(section in settings)) return res.status(404).json({ ok: false, error: 'Section not found' });
  res.json({ ok: true, data: (settings as any)[section] });
});

// PATCH /api/settings/:section — update a section
router.patch('/:section', (req: Request, res: Response) => {
  const section = req.params.section as keyof ReturnType<typeof settingsService.getSettings>;
  const settings = settingsService.getSettings();
  if (!(section in settings)) return res.status(404).json({ ok: false, error: 'Section not found' });
  const updated = settingsService.updateSection(section, req.body);
  res.json({ ok: true, data: updated });
});

export default router;
