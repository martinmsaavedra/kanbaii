import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { invalidateSettingsCache } from '../services/settingsService';

// ─── Section 1: settingsService unit tests ────────────────────────────────────

const DATA_DIR = process.env.KANBAII_DATA_DIR!;
const SETTINGS_FILE = path.join(DATA_DIR, '..', '.settings.json');

function cleanup() {
  if (fs.existsSync(DATA_DIR)) fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(SETTINGS_FILE)) fs.rmSync(SETTINGS_FILE, { force: true });
  // Invalidate settings cache after cleanup so tests start fresh
  invalidateSettingsCache();
}

describe('settingsService unit tests', () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it('getSettings returns defaults when no file exists', async () => {
    const { getSettings } = await import('../services/settingsService');
    const settings = getSettings();
    expect(settings.general.defaultModel).toBe('sonnet');
    expect(settings.general.port).toBe(5555);
    expect(settings.scheduler.enabled).toBe(false);
    expect(settings.scheduler.maxConcurrent).toBe(2);
    expect(settings.auth.enabled).toBe(false);
    expect(settings.auth.tokenExpiry).toBe('24h');
    expect(settings.integrations.telegram.enabled).toBe(false);
    expect(settings.integrations.voice.enabled).toBe(false);
  });

  it('getSettings returns correct defaults for all sections', async () => {
    const { getSettings } = await import('../services/settingsService');
    const settings = getSettings();

    // general
    expect(settings.general.defaultModel).toBe('sonnet');
    expect(settings.general.port).toBe(5555);
    expect(typeof settings.general.timezone).toBe('string');

    // scheduler
    expect(settings.scheduler.enabled).toBe(false);
    expect(settings.scheduler.maxConcurrent).toBe(2);
    expect(settings.scheduler.timeout).toBe(600000);
    expect(settings.scheduler.staleThreshold).toBe(30);

    // terminal
    expect(settings.terminal.inactivityWarn).toBe(15);
    expect(settings.terminal.inactivityKill).toBe(60);
    expect(settings.terminal.maxTimeout).toBe(120);

    // ralph
    expect(settings.ralph.maxIterations).toBe(50);
    expect(settings.ralph.circuitBreaker).toBe(3);
    expect(settings.ralph.taskFilter).toBe('todo-only');

    // auth
    expect(settings.auth.enabled).toBe(false);
    expect(settings.auth.secret).toBe('');
    expect(settings.auth.tokenExpiry).toBe('24h');

    // integrations
    expect(settings.integrations.telegram.enabled).toBe(false);
    expect(settings.integrations.telegram.botToken).toBe('');
    expect(settings.integrations.telegram.chatId).toBe('');
    expect(settings.integrations.voice.enabled).toBe(false);
    expect(settings.integrations.voice.openaiApiKey).toBe('');
  });

  it('updateSettings merges partial updates — only general.defaultModel changes', async () => {
    const { getSettings, updateSettings } = await import('../services/settingsService');
    updateSettings({ general: { defaultModel: 'opus' } } as any);
    const settings = getSettings();
    expect(settings.general.defaultModel).toBe('opus');
    // rest stays at defaults
    expect(settings.general.port).toBe(5555);
    expect(settings.scheduler.maxConcurrent).toBe(2);
    expect(settings.auth.tokenExpiry).toBe('24h');
  });

  it('updateSection updates only the specified section', async () => {
    const { getSettings, updateSection } = await import('../services/settingsService');
    updateSection('scheduler', { maxConcurrent: 5 });
    const settings = getSettings();
    expect(settings.scheduler.maxConcurrent).toBe(5);
    // other scheduler fields unchanged
    expect(settings.scheduler.enabled).toBe(false);
    expect(settings.scheduler.timeout).toBe(600000);
    // other sections unchanged
    expect(settings.general.defaultModel).toBe('sonnet');
    expect(settings.auth.tokenExpiry).toBe('24h');
  });

  it('sensitive fields are encrypted on disk but decrypted when read', async () => {
    const { getSettings, updateSettings } = await import('../services/settingsService');
    const testToken = 'my-secret-bot-token-12345';
    updateSettings({
      integrations: { telegram: { enabled: true, botToken: testToken, chatId: '' } },
    } as any);

    // Read raw JSON from disk — token should be encrypted
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    expect(raw.integrations.telegram.botToken).toMatch(/^enc:/);

    // getSettings should return the plaintext token
    const settings = getSettings();
    expect(settings.integrations.telegram.botToken).toBe(testToken);
  });
});

// ─── Section 2: Settings API route tests ─────────────────────────────────────

import { createApp } from '../index';

const SETTINGS_TEST_PORT = 15557;

let settingsHttpServer: http.Server;
let settingsBaseUrl: string;

function request(method: string, urlPath: string, body?: unknown): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, settingsBaseUrl);
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
  if (fs.existsSync(SETTINGS_FILE)) fs.rmSync(SETTINGS_FILE, { force: true });
  invalidateSettingsCache();
}

beforeAll(async () => {
  cleanRouteTestData();
  const app = createApp();
  settingsHttpServer = app.httpServer;
  await new Promise<void>((resolve) => {
    settingsHttpServer.listen(SETTINGS_TEST_PORT, () => {
      settingsBaseUrl = `http://127.0.0.1:${SETTINGS_TEST_PORT}`;
      resolve();
    });
  });
});

afterAll(async () => {
  cleanRouteTestData();
  await new Promise<void>((resolve) => settingsHttpServer.close(() => resolve()));
});

beforeEach(() => {
  cleanRouteTestData();
});

describe('Settings API routes', () => {
  it('GET /api/settings returns defaults (200)', async () => {
    const res = await request('GET', '/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.general.defaultModel).toBe('sonnet');
    expect(res.body.data.general.port).toBe(5555);
    expect(res.body.data.scheduler.enabled).toBe(false);
    expect(res.body.data.auth.tokenExpiry).toBe('24h');
  });

  it('PUT /api/settings with valid data merges correctly (200)', async () => {
    const res = await request('PUT', '/api/settings', {
      general: { defaultModel: 'haiku', port: 8080 },
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.general.defaultModel).toBe('haiku');
    expect(res.body.data.general.port).toBe(8080);
    // Other sections remain at defaults
    expect(res.body.data.scheduler.maxConcurrent).toBe(2);
    expect(res.body.data.auth.tokenExpiry).toBe('24h');
  });

  it('PUT /api/settings with unknown keys is rejected (400)', async () => {
    const res = await request('PUT', '/api/settings', {
      unknownKey: 'value',
    });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('PATCH /api/settings/general with valid data (200)', async () => {
    const res = await request('PATCH', '/api/settings/general', {
      defaultModel: 'opus',
      timezone: 'America/New_York',
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.general.defaultModel).toBe('opus');
    expect(res.body.data.general.timezone).toBe('America/New_York');
  });

  it('PATCH /api/settings/invalidSection returns 404', async () => {
    const res = await request('PATCH', '/api/settings/invalidSection', {
      foo: 'bar',
    });
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });

  it('PATCH /api/settings/scheduler with out-of-bounds maxConcurrent returns 400', async () => {
    const res = await request('PATCH', '/api/settings/scheduler', {
      maxConcurrent: 9999,
    });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('PATCH /api/settings/auth with valid tokenExpiry "48h" succeeds (200)', async () => {
    const res = await request('PATCH', '/api/settings/auth', {
      tokenExpiry: '48h',
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.auth.tokenExpiry).toBe('48h');
  });

  it('PATCH /api/settings/auth with invalid tokenExpiry "forever" returns 400', async () => {
    const res = await request('PATCH', '/api/settings/auth', {
      tokenExpiry: 'forever',
    });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});
