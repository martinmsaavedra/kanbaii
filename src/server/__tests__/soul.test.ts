import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import * as projectStore from '../services/projectStore';
import * as soulStore from '../services/soulStore';
import { createApp } from '../index';

const DATA_DIR = process.env.KANBAII_DATA_DIR!;

// ─── Cleanup helper ───

function cleanTestData() {
  if (fs.existsSync(DATA_DIR)) {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ═══════════════════════════════════════════════════════════
// Section 1: soulStore unit tests
// ═══════════════════════════════════════════════════════════

describe('soulStore — unit', () => {
  const slug = 'soul-test';

  beforeEach(() => {
    cleanTestData();
    projectStore.createProject({ title: 'Soul Test' });
  });

  // ─── Documents ───

  it('listDocuments returns 3 docs with empty content', () => {
    const docs = soulStore.listDocuments(slug);
    expect(docs).toHaveLength(3);
    const names = docs.map(d => d.name);
    expect(names).toContain('SOUL.md');
    expect(names).toContain('ME.md');
    expect(names).toContain('HEALTH.md');
    // Files don't exist yet — content should be empty string
    const soul = docs.find(d => d.name === 'SOUL.md')!;
    expect(soul.content).toBe('');
  });

  it('getDocument returns null for invalid (non-whitelisted) name', () => {
    const result = soulStore.getDocument(slug, 'EVIL.md');
    expect(result).toBeNull();
  });

  it('getDocument returns a valid doc for SOUL.md', () => {
    const doc = soulStore.getDocument(slug, 'SOUL.md');
    expect(doc).not.toBeNull();
    expect(doc!.name).toBe('SOUL.md');
    expect(typeof doc!.content).toBe('string');
    expect(typeof doc!.updatedAt).toBe('string');
  });

  it('updateDocument writes content and getDocument reads it back', () => {
    soulStore.updateDocument(slug, 'SOUL.md', '# My Soul\nMission: build things.');
    const doc = soulStore.getDocument(slug, 'SOUL.md');
    expect(doc!.content).toBe('# My Soul\nMission: build things.');
  });

  it('updateDocument throws for invalid doc name', () => {
    expect(() => soulStore.updateDocument(slug, 'EVIL.md', 'bad')).toThrow('Invalid document');
  });

  // ─── Memory ───

  it('addMemory creates entry with required fields', () => {
    const entry = soulStore.addMemory(slug, 'First memory', 'manual');
    expect(typeof entry.id).toBe('string');
    expect(entry.content).toBe('First memory');
    expect(entry.source).toBe('manual');
    expect(typeof entry.createdAt).toBe('string');
  });

  it('getMemory returns all entries', () => {
    soulStore.addMemory(slug, 'Entry one', 'manual');
    soulStore.addMemory(slug, 'Entry two', 'auto');
    const entries = soulStore.getMemory(slug);
    expect(entries).toHaveLength(2);
  });

  it('deleteMemoryEntry removes specific entry', () => {
    const a = soulStore.addMemory(slug, 'Keep', 'manual');
    const b = soulStore.addMemory(slug, 'Delete me', 'manual');
    soulStore.deleteMemoryEntry(slug, b.id);
    const entries = soulStore.getMemory(slug);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(a.id);
  });

  it('resetMemory clears all entries', () => {
    soulStore.addMemory(slug, 'A', 'manual');
    soulStore.addMemory(slug, 'B', 'auto');
    soulStore.resetMemory(slug);
    expect(soulStore.getMemory(slug)).toHaveLength(0);
  });

  // ─── Daily Logs ───

  it('appendDailyLog creates log file, getDailyLog reads it back', () => {
    soulStore.appendDailyLog(slug, 'Worked on tests', '2026-03-30');
    const log = soulStore.getDailyLog(slug, '2026-03-30');
    expect(log).not.toBeNull();
    expect(log!.date).toBe('2026-03-30');
    expect(log!.entries.length).toBeGreaterThan(0);
    expect(log!.entries[0]).toContain('Worked on tests');
  });

  it('listDailyLogs returns logs sorted reverse chronologically', () => {
    soulStore.appendDailyLog(slug, 'Entry A', '2026-03-28');
    soulStore.appendDailyLog(slug, 'Entry B', '2026-03-30');
    soulStore.appendDailyLog(slug, 'Entry C', '2026-03-29');
    const logs = soulStore.listDailyLogs(slug);
    expect(logs).toHaveLength(3);
    expect(logs[0].date).toBe('2026-03-30');
    expect(logs[1].date).toBe('2026-03-29');
    expect(logs[2].date).toBe('2026-03-28');
  });

  // ─── Security: path traversal via date ───

  it('getDailyLog rejects traversal date — throws Invalid date format', () => {
    expect(() => soulStore.getDailyLog(slug, '../../etc/passwd')).toThrow('Invalid date format');
  });

  it('appendDailyLog rejects traversal date — throws Invalid date format', () => {
    expect(() => soulStore.appendDailyLog(slug, 'pwned', '../../../hack')).toThrow('Invalid date format');
  });

  it('getDailyLog with valid date format 2026-03-30 works', () => {
    // No log exists yet — should return null (not throw)
    expect(() => soulStore.getDailyLog(slug, '2026-03-30')).not.toThrow();
    const log = soulStore.getDailyLog(slug, '2026-03-30');
    expect(log).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════
// Section 2: Soul API route tests
// ═══════════════════════════════════════════════════════════

const TEST_PORT = 15558;

let httpServer: http.Server;
let baseUrl: string;

function request(method: string, urlPath: string, body?: unknown): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
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

describe('Soul API routes', () => {
  beforeAll(async () => {
    cleanTestData();
    const app = createApp();
    httpServer = app.httpServer;
    await new Promise<void>((resolve) => {
      httpServer.listen(TEST_PORT, () => {
        baseUrl = `http://127.0.0.1:${TEST_PORT}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    cleanTestData();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  beforeEach(async () => {
    cleanTestData();
    // Create the project every test needs
    await request('POST', '/api/projects', { title: 'Soul Test' });
  });

  // ─── Documents ───

  it('GET /documents returns 3 docs', async () => {
    const res = await request('GET', '/api/projects/soul-test/soul/documents');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveLength(3);
    const names: string[] = res.body.data.map((d: any) => d.name);
    expect(names).toContain('SOUL.md');
    expect(names).toContain('ME.md');
    expect(names).toContain('HEALTH.md');
  });

  it('PUT /documents/SOUL.md updates content', async () => {
    const res = await request('PUT', '/api/projects/soul-test/soul/documents/SOUL.md', {
      content: '# Updated Soul',
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.content).toBe('# Updated Soul');
  });

  it('GET /documents/EVIL.md returns 404', async () => {
    const res = await request('GET', '/api/projects/soul-test/soul/documents/EVIL.md');
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });

  // ─── Memory ───

  it('POST /memory creates a memory entry', async () => {
    const res = await request('POST', '/api/projects/soul-test/soul/memory', {
      content: 'Remember this',
      source: 'manual',
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.content).toBe('Remember this');
    expect(typeof res.body.data.id).toBe('string');
  });

  it('GET /memory returns entries', async () => {
    await request('POST', '/api/projects/soul-test/soul/memory', { content: 'A', source: 'manual' });
    await request('POST', '/api/projects/soul-test/soul/memory', { content: 'B', source: 'auto' });
    const res = await request('GET', '/api/projects/soul-test/soul/memory');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveLength(2);
  });

  // ─── Daily Logs ───

  it('POST /logs with valid date works (200)', async () => {
    const res = await request('POST', '/api/projects/soul-test/soul/logs', {
      entry: 'Productive day',
      date: '2026-03-30',
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('POST /logs with traversal date returns 400', async () => {
    const res = await request('POST', '/api/projects/soul-test/soul/logs', {
      entry: 'Malicious entry',
      date: '../../../hack',
    });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('GET /logs/:date with valid date works', async () => {
    // Append first so there's something to read
    await request('POST', '/api/projects/soul-test/soul/logs', {
      entry: 'Test entry',
      date: '2026-03-30',
    });
    const res = await request('GET', '/api/projects/soul-test/soul/logs/2026-03-30');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.date).toBe('2026-03-30');
  });

  it('GET /logs/../../hack returns 400', async () => {
    const res = await request('GET', '/api/projects/soul-test/soul/logs/..%2F..%2Fhack');
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});
