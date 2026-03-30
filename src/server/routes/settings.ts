import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as settingsService from '../services/settingsService';
import type { AppSettings } from '../services/settingsService';

const router = Router();

// Schema restricts updates to known keys only — prevents arbitrary key injection
const SettingsSchema = z.object({
  general: z.object({
    defaultModel: z.enum(['opus', 'sonnet', 'haiku']).optional(),
    timezone: z.string().max(100).optional(),
    port: z.number().int().min(1024).max(65535).optional(),
  }).optional(),
  scheduler: z.object({
    enabled: z.boolean().optional(),
    maxConcurrent: z.number().int().min(1).max(20).optional(),
    timeout: z.number().int().min(10000).max(3600000).optional(),
    staleThreshold: z.number().int().min(1).max(1440).optional(),
  }).optional(),
  terminal: z.object({
    inactivityWarn: z.number().int().min(1).max(1440).optional(),
    inactivityKill: z.number().int().min(1).max(1440).optional(),
    maxTimeout: z.number().int().min(1).max(1440).optional(),
  }).optional(),
  ralph: z.object({
    maxIterations: z.number().int().min(1).max(500).optional(),
    circuitBreaker: z.number().int().min(1).max(50).optional(),
    taskFilter: z.enum(['all', 'todo-only']).optional(),
  }).optional(),
  auth: z.object({
    enabled: z.boolean().optional(),
    secret: z.string().max(500).optional(),
    tokenExpiry: z.string().regex(/^\d+(h|d|m)$/).optional(),
  }).optional(),
  integrations: z.object({
    telegram: z.object({
      enabled: z.boolean().optional(),
      botToken: z.string().max(500).optional(),
      chatId: z.string().max(100).optional(),
    }).optional(),
    voice: z.object({
      enabled: z.boolean().optional(),
      openaiApiKey: z.string().max(500).optional(),
    }).optional(),
  }).optional(),
}).strict();

// Allowed section names
const VALID_SECTIONS = new Set(['general', 'scheduler', 'terminal', 'ralph', 'auth', 'integrations']);

// GET /api/settings
router.get('/', (_req: Request, res: Response) => {
  res.json({ ok: true, data: settingsService.getSettings() });
});

// PUT /api/settings — update entire settings
router.put('/', (req: Request, res: Response) => {
  const parsed = SettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || 'Invalid settings' });
  }
  const settings = settingsService.updateSettings(parsed.data as Partial<AppSettings>);
  res.json({ ok: true, data: settings });
});

// GET /api/settings/:section
router.get('/:section', (req: Request, res: Response) => {
  const section = req.params.section as keyof ReturnType<typeof settingsService.getSettings>;
  if (!VALID_SECTIONS.has(req.params.section)) return res.status(404).json({ ok: false, error: 'Section not found' });
  const settings = settingsService.getSettings();
  res.json({ ok: true, data: (settings as any)[section] });
});

// PATCH /api/settings/:section — update a section
router.patch('/:section', (req: Request, res: Response) => {
  if (!VALID_SECTIONS.has(req.params.section)) return res.status(404).json({ ok: false, error: 'Section not found' });
  const section = req.params.section as keyof ReturnType<typeof settingsService.getSettings>;
  // Validate just the section being updated
  const sectionSchema = SettingsSchema.shape[section as keyof typeof SettingsSchema.shape];
  if (sectionSchema) {
    const parsed = sectionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || 'Invalid settings' });
    }
    const updated = settingsService.updateSection(section, parsed.data as any);
    return res.json({ ok: true, data: updated });
  }
  const updated = settingsService.updateSection(section, req.body);
  res.json({ ok: true, data: updated });
});

export default router;
