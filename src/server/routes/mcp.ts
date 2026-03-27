import { Router, Request, Response } from 'express';
import * as mcpConfig from '../services/mcpConfig';

const router = Router();

// GET /api/mcp/servers
router.get('/servers', (_req: Request, res: Response) => {
  res.json({ ok: true, data: mcpConfig.listServers() });
});

// GET /api/mcp/presets — built-in MCP server presets
router.get('/presets', (_req: Request, res: Response) => {
  res.json({ ok: true, data: mcpConfig.getPresets() });
});

// POST /api/mcp/servers
router.post('/servers', (req: Request, res: Response) => {
  const { name, command, args, env, enabled } = req.body;
  if (!name || !command) {
    return res.status(400).json({ ok: false, error: 'name and command are required' });
  }
  const server = mcpConfig.addServer({ name, command, args: args || [], env: env || {}, enabled: enabled !== false });
  res.json({ ok: true, data: server });
});

// POST /api/mcp/servers/:name/test — test connection
router.post('/servers/:name/test', async (req: Request, res: Response) => {
  try {
    const result = await mcpConfig.testServer(req.params.name);
    res.json({ ok: result.ok, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// DELETE /api/mcp/servers/:name
router.delete('/servers/:name', (req: Request, res: Response) => {
  mcpConfig.removeServer(req.params.name);
  res.json({ ok: true });
});

// PATCH /api/mcp/servers/:name/toggle
router.patch('/servers/:name/toggle', (req: Request, res: Response) => {
  const { enabled } = req.body;
  mcpConfig.toggleServer(req.params.name, enabled);
  res.json({ ok: true });
});

export default router;
