import { Router, Request, Response } from 'express';
import * as agentRegistry from '../services/agentRegistry';

const router = Router();

// GET /api/agents — List all agents
router.get('/', (_req: Request, res: Response) => {
  const agents = agentRegistry.listAgents();
  res.json({ ok: true, data: agents });
});

// GET /api/agents/suggest — Suggest best agent for tags
router.get('/suggest', (req: Request, res: Response) => {
  const tags = (req.query.tags as string || '').split(',').filter(Boolean);
  if (tags.length === 0) {
    return res.json({ ok: true, data: null });
  }
  const result = agentRegistry.suggestAgent(tags);
  res.json({ ok: true, data: result });
});

// GET /api/agents/:name — Get agent by name
router.get('/:name', (req: Request, res: Response) => {
  const agent = agentRegistry.getAgent(req.params.name);
  if (!agent) {
    return res.status(404).json({ ok: false, error: 'Agent not found' });
  }
  res.json({ ok: true, data: agent });
});

// POST /api/agents — Create/update agent
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, description, model, skills, tools, instructions } = req.body;
    if (!name || !description) {
      return res.status(400).json({ ok: false, error: 'name and description are required' });
    }
    const agent = agentRegistry.saveAgent({
      name,
      description: description || '',
      model: model || 'sonnet',
      skills: skills || [],
      tools: tools || ['Bash', 'Edit', 'Write', 'Read'],
      instructions: instructions || '',
    });
    res.json({ ok: true, data: agent });
  } catch (err) {
    res.status(400).json({ ok: false, error: (err as Error).message });
  }
});

// DELETE /api/agents/:name — Delete custom agent
router.delete('/:name', (req: Request, res: Response) => {
  try {
    agentRegistry.deleteAgent(req.params.name);
    res.json({ ok: true });
  } catch (err) {
    if ((err as Error).message.includes('not found')) {
      return res.status(404).json({ ok: false, error: (err as Error).message });
    }
    if ((err as Error).message.includes('built-in')) {
      return res.status(403).json({ ok: false, error: (err as Error).message });
    }
    throw err;
  }
});

export default router;
