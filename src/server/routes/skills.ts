import { Router, Request, Response } from 'express';
import * as skillsRegistry from '../services/skillsRegistry';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({ ok: true, data: skillsRegistry.listSkills() });
});

router.post('/', (req: Request, res: Response) => {
  const { name, description, promptTemplate, tools, enabled } = req.body;
  if (!name || !description) {
    return res.status(400).json({ ok: false, error: 'name and description required' });
  }
  const skill = skillsRegistry.saveSkill({
    name, description, promptTemplate: promptTemplate || '', tools: tools || [], enabled: enabled !== false,
  });
  res.json({ ok: true, data: skill });
});

router.patch('/:name/toggle', (req: Request, res: Response) => {
  const { enabled } = req.body;
  skillsRegistry.toggleSkill(req.params.name, enabled);
  res.json({ ok: true });
});

router.delete('/:name', (req: Request, res: Response) => {
  skillsRegistry.deleteSkill(req.params.name);
  res.json({ ok: true });
});

export default router;
