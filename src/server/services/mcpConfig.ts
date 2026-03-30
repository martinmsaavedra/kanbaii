import fs from 'fs';
import os from 'os';
import path from 'path';

export interface McpServer {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export interface McpConfig {
  servers: McpServer[];
}

const DATA_DIR = path.resolve(process.env.KANBAII_DATA_DIR || path.join(process.cwd(), 'data', 'projects'));
const KANBAII_ROOT = path.resolve(__dirname, '..', '..', '..');
const CONFIG_FILE = path.join(DATA_DIR, '..', '.mcp-config.json');

function ensureFile(): void {
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ servers: [] }, null, 2), 'utf-8');
  }
}

function readConfig(): McpConfig {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return { servers: [] };
  }
}

function writeConfig(config: McpConfig): void {
  ensureFile();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function listServers(): McpServer[] {
  return readConfig().servers;
}

export function getServer(name: string): McpServer | null {
  return readConfig().servers.find((s) => s.name === name) || null;
}

export function addServer(server: McpServer): McpServer {
  const config = readConfig();
  const existing = config.servers.findIndex((s) => s.name === server.name);
  if (existing >= 0) {
    config.servers[existing] = server;
  } else {
    config.servers.push(server);
  }
  writeConfig(config);
  return server;
}

export function removeServer(name: string): void {
  const config = readConfig();
  config.servers = config.servers.filter((s) => s.name !== name);
  writeConfig(config);
}

export function toggleServer(name: string, enabled: boolean): void {
  const config = readConfig();
  const server = config.servers.find((s) => s.name === name);
  if (server) {
    server.enabled = enabled;
    writeConfig(config);
  }
}

/**
 * Built-in MCP server presets that users can add with one click.
 */
const isWindows = process.platform === 'win32';
const npxCmd = isWindows ? 'cmd' : 'npx';
const npxArgs = (pkg: string, ...extra: string[]) =>
  isWindows ? ['/c', 'npx', '-y', pkg, ...extra] : ['-y', pkg, ...extra];

export const MCP_PRESETS: McpServer[] = [
  {
    name: 'context7',
    command: npxCmd,
    args: npxArgs('@upstash/context7-mcp@latest'),
    env: { DEFAULT_MINIMUM_TOKENS: '10000', CONTEXT7_API_KEY: '' },
    enabled: true,
  },
  {
    name: 'brave-search',
    command: npxCmd,
    args: npxArgs('@brave/brave-search-mcp-server'),
    env: { BRAVE_API_KEY: '' },
    enabled: true,
  },
  {
    name: 'github',
    command: npxCmd,
    args: npxArgs('@modelcontextprotocol/server-github'),
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
    enabled: true,
  },
  {
    name: 'filesystem',
    command: npxCmd,
    args: npxArgs('@modelcontextprotocol/server-filesystem', '.'),
    enabled: true,
  },
];

export function getPresets(): McpServer[] {
  return MCP_PRESETS;
}

/**
 * Test if an MCP server can be spawned and responds.
 * Spawns the command, waits briefly, and checks if process is alive.
 */
export async function testServer(name: string): Promise<{ ok: boolean; message: string }> {
  const server = getServer(name);
  if (!server) return { ok: false, message: 'Server not found' };

  const { spawn } = require('child_process');
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      proc.kill();
      resolve({ ok: true, message: 'Server started successfully' });
    }, 3000);

    const proc = spawn(server.command, server.args || [], {
      env: { ...process.env, ...server.env },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.on('error', (err: Error) => {
      clearTimeout(timeout);
      resolve({ ok: false, message: `Failed to start: ${err.message}` });
    });

    proc.on('close', (code: number) => {
      clearTimeout(timeout);
      if (code !== 0) {
        resolve({ ok: false, message: `Process exited with code ${code}` });
      } else {
        resolve({ ok: true, message: 'Server responded OK' });
      }
    });
  });
}

/**
 * Generate the MCP config JSON that Claude CLI expects for --mcp-config flag.
 * @param onlyKanbaii If true, only include the KANBAII escalation server (fast). Default: true.
 */
export function generateMcpConfigForClaude(onlyKanbaii: boolean = true): string | null {
  const mcpConfig: Record<string, { command: string; args?: string[]; env?: Record<string, string> }> = {};

  // Always include KANBAII's own MCP server (escalation + notifications)
  const kanbaiiMcpPath = path.resolve(__dirname, '..', 'mcp', 'kanbaii-mcp-server.js');
  mcpConfig['kanbaii'] = {
    command: 'node',
    args: [kanbaiiMcpPath],
    env: {
      KANBAII_PORT: process.env.KANBAII_PORT || '5555',
      KANBAII_HOST: 'localhost',
    },
  };

  // Only add user-configured servers if requested
  if (!onlyKanbaii) {
    const servers = listServers().filter((s) => s.enabled);
    for (const s of servers) {
      mcpConfig[s.name] = {
        command: s.command,
        ...(s.args?.length ? { args: s.args } : {}),
        ...(s.env && Object.keys(s.env).length ? { env: s.env } : {}),
      };
    }
  }

  const runtimeDir = path.join(os.tmpdir(), 'kanbaii');
  if (!fs.existsSync(runtimeDir)) fs.mkdirSync(runtimeDir, { recursive: true });
  const tmpFile = path.join(runtimeDir, onlyKanbaii ? '.mcp-runtime-minimal.json' : '.mcp-runtime.json');
  fs.writeFileSync(tmpFile, JSON.stringify({ mcpServers: mcpConfig }, null, 2), 'utf-8');
  return tmpFile;
}
