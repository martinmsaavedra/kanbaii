import { Router, Request, Response } from 'express';
import * as mcpConfig from '../services/mcpConfig';

const router = Router();

// Command whitelist — only known safe executables
const ALLOWED_COMMANDS = new Set([
  'node', 'npx', 'cmd', 'cmd.exe', 'python', 'python3', 'uvx', 'pip', 'pipx',
]);

// Shell metacharacter pattern — reject args that could enable injection
const SHELL_META = /[;&|`$(){}!<>\\"\n\r]/;

function validateMcpCommand(command: string, args: unknown[]): string | null {
  const cmdBase = (command.split(/[\\/]/).pop() || command).toLowerCase();
  if (!ALLOWED_COMMANDS.has(cmdBase)) {
    return `Command not allowed: ${command}. Allowed: ${[...ALLOWED_COMMANDS].join(', ')}`;
  }
  for (const arg of args) {
    if (typeof arg !== 'string' || SHELL_META.test(arg)) {
      return 'Invalid argument: contains shell metacharacters';
    }
  }
  return null;
}

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

  const argList: string[] = args || [];
  const validationError = validateMcpCommand(command, argList);
  if (validationError) {
    return res.status(400).json({ ok: false, error: validationError });
  }

  const server = mcpConfig.addServer({ name, command, args: argList, env: env || {}, enabled: enabled !== false });
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
