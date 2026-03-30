import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';

// ─── Section 1: mcpConfig unit tests ─────────────────────────────────────────

const DATA_DIR = process.env.KANBAII_DATA_DIR!;
const MCP_CONFIG_FILE = path.join(DATA_DIR, '..', '.mcp-config.json');

function cleanup() {
  if (fs.existsSync(DATA_DIR)) fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(MCP_CONFIG_FILE)) fs.rmSync(MCP_CONFIG_FILE, { force: true });
}

describe('mcpConfig unit tests', () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it('listServers returns empty array initially', async () => {
    const { listServers } = await import('../services/mcpConfig');
    expect(listServers()).toEqual([]);
  });

  it('addServer adds a server, listServers returns it', async () => {
    const { addServer, listServers } = await import('../services/mcpConfig');
    addServer({ name: 'my-server', command: 'node', args: ['server.js'], enabled: true });
    const servers = listServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].name).toBe('my-server');
    expect(servers[0].command).toBe('node');
    expect(servers[0].args).toEqual(['server.js']);
    expect(servers[0].enabled).toBe(true);
  });

  it('addServer with same name updates existing server', async () => {
    const { addServer, listServers } = await import('../services/mcpConfig');
    addServer({ name: 'my-server', command: 'node', args: ['v1.js'], enabled: true });
    addServer({ name: 'my-server', command: 'node', args: ['v2.js'], enabled: false });
    const servers = listServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].args).toEqual(['v2.js']);
    expect(servers[0].enabled).toBe(false);
  });

  it('getServer returns server by name', async () => {
    const { addServer, getServer } = await import('../services/mcpConfig');
    addServer({ name: 'target-server', command: 'npx', args: ['-y', 'some-pkg'], enabled: true });
    const server = getServer('target-server');
    expect(server).not.toBeNull();
    expect(server!.name).toBe('target-server');
    expect(server!.command).toBe('npx');
  });

  it('getServer returns null for non-existent server', async () => {
    const { getServer } = await import('../services/mcpConfig');
    expect(getServer('does-not-exist')).toBeNull();
  });

  it('removeServer removes a server', async () => {
    const { addServer, removeServer, listServers } = await import('../services/mcpConfig');
    addServer({ name: 'to-remove', command: 'node', args: [], enabled: true });
    expect(listServers()).toHaveLength(1);
    removeServer('to-remove');
    expect(listServers()).toHaveLength(0);
  });

  it('toggleServer changes enabled state', async () => {
    const { addServer, toggleServer, getServer } = await import('../services/mcpConfig');
    addServer({ name: 'toggle-me', command: 'node', args: [], enabled: true });
    toggleServer('toggle-me', false);
    expect(getServer('toggle-me')!.enabled).toBe(false);
    toggleServer('toggle-me', true);
    expect(getServer('toggle-me')!.enabled).toBe(true);
  });

  it('getPresets returns non-empty array of presets', async () => {
    const { getPresets } = await import('../services/mcpConfig');
    const presets = getPresets();
    expect(Array.isArray(presets)).toBe(true);
    expect(presets.length).toBeGreaterThan(0);
    // Each preset has required fields
    for (const preset of presets) {
      expect(typeof preset.name).toBe('string');
      expect(typeof preset.command).toBe('string');
      expect(typeof preset.enabled).toBe('boolean');
    }
  });
});

// ─── Section 2: MCP API route tests ──────────────────────────────────────────

import { createApp } from '../index';

const MCP_TEST_PORT = 15559;

let mcpHttpServer: http.Server;
let mcpBaseUrl: string;

function request(method: string, urlPath: string, body?: unknown): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, mcpBaseUrl);
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload).toString() } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode!, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode!, body: data });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function cleanRouteTestData() {
  if (fs.existsSync(DATA_DIR)) fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(MCP_CONFIG_FILE)) fs.rmSync(MCP_CONFIG_FILE, { force: true });
}

beforeAll(async () => {
  cleanRouteTestData();
  const app = createApp();
  mcpHttpServer = app.httpServer;
  await new Promise<void>((resolve) => {
    mcpHttpServer.listen(MCP_TEST_PORT, () => {
      mcpBaseUrl = `http://127.0.0.1:${MCP_TEST_PORT}`;
      resolve();
    });
  });
});

afterAll(async () => {
  cleanRouteTestData();
  await new Promise<void>((resolve) => mcpHttpServer.close(() => resolve()));
});

beforeEach(() => {
  cleanRouteTestData();
});

describe('MCP API routes', () => {
  it('GET /api/mcp/servers returns empty list initially (200)', async () => {
    const res = await request('GET', '/api/mcp/servers');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(0);
  });

  it('POST /api/mcp/servers with valid node command succeeds (200)', async () => {
    const res = await request('POST', '/api/mcp/servers', {
      name: 'my-node-server',
      command: 'node',
      args: ['server.js', '--port', '3000'],
      enabled: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.name).toBe('my-node-server');
    expect(res.body.data.command).toBe('node');
  });

  it('POST /api/mcp/servers with name missing returns 400', async () => {
    const res = await request('POST', '/api/mcp/servers', {
      command: 'node',
      args: ['server.js'],
    });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('POST /api/mcp/servers with /bin/sh command returns 400 (not in whitelist)', async () => {
    const res = await request('POST', '/api/mcp/servers', {
      name: 'bad-server',
      command: '/bin/sh',
      args: ['-c', 'echo hello'],
      enabled: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/not allowed/i);
  });

  it('POST /api/mcp/servers with bash command returns 400', async () => {
    const res = await request('POST', '/api/mcp/servers', {
      name: 'bash-server',
      command: 'bash',
      args: ['-c', 'echo hello'],
      enabled: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/not allowed/i);
  });

  it('POST /api/mcp/servers with valid command but shell metachar in args returns 400', async () => {
    const res = await request('POST', '/api/mcp/servers', {
      name: 'injection-server',
      command: 'node',
      args: ['--flag; rm -rf /'],
      enabled: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/metachar/i);
  });

  it('POST /api/mcp/servers with args containing backtick returns 400', async () => {
    const res = await request('POST', '/api/mcp/servers', {
      name: 'backtick-server',
      command: 'node',
      args: ['`whoami`'],
      enabled: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/metachar/i);
  });

  it('POST /api/mcp/servers with args containing $() returns 400', async () => {
    const res = await request('POST', '/api/mcp/servers', {
      name: 'subshell-server',
      command: 'node',
      args: ['$(cat /etc/passwd)'],
      enabled: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/metachar/i);
  });

  it('GET /api/mcp/presets returns presets array (200)', async () => {
    const res = await request('GET', '/api/mcp/presets');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    // Each preset has required fields
    for (const preset of res.body.data) {
      expect(typeof preset.name).toBe('string');
      expect(typeof preset.command).toBe('string');
    }
  });

  it('DELETE /api/mcp/servers/:name removes server (200)', async () => {
    // First add a server
    await request('POST', '/api/mcp/servers', {
      name: 'to-delete',
      command: 'node',
      args: [],
      enabled: true,
    });
    // Verify it exists
    const listBefore = await request('GET', '/api/mcp/servers');
    expect(listBefore.body.data).toHaveLength(1);

    // Delete it
    const deleteRes = await request('DELETE', '/api/mcp/servers/to-delete');
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.ok).toBe(true);

    // Verify it's gone
    const listAfter = await request('GET', '/api/mcp/servers');
    expect(listAfter.body.data).toHaveLength(0);
  });
});
