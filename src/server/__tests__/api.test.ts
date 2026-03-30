import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createApp } from '../index';

const DATA_DIR = process.env.KANBAII_DATA_DIR!;
const TEST_PORT = 15555;

let httpServer: http.Server;
let baseUrl: string;

// Simple HTTP helper (no external deps)
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

// Cleanup test data
function cleanTestData() {
  if (fs.existsSync(DATA_DIR)) {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

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

beforeEach(() => {
  cleanTestData();
});

// ===== Health =====

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await request('GET', '/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.version).toBe('string');
    expect(typeof res.body.uptime).toBe('number');
  });
});

// ===== Projects =====

describe('Projects API', () => {
  it('POST /api/projects — creates a project', async () => {
    const res = await request('POST', '/api/projects', { title: 'Test Project' });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.title).toBe('Test Project');
    expect(res.body.data.slug).toBe('test-project');
    expect(res.body.data.color).toBe('#6366f1');
    expect(res.body.data.status).toBe('active');
  });

  it('GET /api/projects — lists projects', async () => {
    await request('POST', '/api/projects', { title: 'Project A' });
    await request('POST', '/api/projects', { title: 'Project B' });

    const res = await request('GET', '/api/projects');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('GET /api/projects/:slug — gets a project', async () => {
    await request('POST', '/api/projects', { title: 'My App' });

    const res = await request('GET', '/api/projects/my-app');
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('My App');
  });

  it('GET /api/projects/:slug — 404 for missing', async () => {
    const res = await request('GET', '/api/projects/nope');
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });

  it('PATCH /api/projects/:slug — updates a project', async () => {
    await request('POST', '/api/projects', { title: 'Old Name' });

    const res = await request('PATCH', '/api/projects/old-name', { title: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('New Name');
  });

  it('DELETE /api/projects/:slug — soft deletes', async () => {
    await request('POST', '/api/projects', { title: 'Bye' });

    const res = await request('DELETE', '/api/projects/bye');
    expect(res.status).toBe(200);

    // Still in list but with status 'deleted' (frontend filters)
    const list = await request('GET', '/api/projects');
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].status).toBe('deleted');
  });

  it('POST /api/projects — 400 on invalid input', async () => {
    const res = await request('POST', '/api/projects', { title: '' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});

// ===== Work Items =====

describe('Work Items API', () => {
  const projectSlug = 'wi-test';

  beforeEach(async () => {
    await request('POST', '/api/projects', { title: 'WI Test' });
  });

  it('POST — creates a work item', async () => {
    const res = await request('POST', `/api/projects/${projectSlug}/work-items`, {
      title: 'Auth System',
      category: 'feature',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Auth System');
    expect(res.body.data.category).toBe('feature');
    expect(res.body.data.slug).toMatch(/^feat-/);
    expect(res.body.data.status).toBe('planning');
  });

  it('GET — lists work items', async () => {
    await request('POST', `/api/projects/${projectSlug}/work-items`, {
      title: 'Feature A', category: 'feature',
    });
    await request('POST', `/api/projects/${projectSlug}/work-items`, {
      title: 'Bug B', category: 'bug',
    });

    const res = await request('GET', `/api/projects/${projectSlug}/work-items`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('GET /:wiId — gets a work item by slug', async () => {
    const created = await request('POST', `/api/projects/${projectSlug}/work-items`, {
      title: 'Login Flow', category: 'bug',
    });

    const res = await request('GET', `/api/projects/${projectSlug}/work-items/${created.body.data.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Login Flow');
  });

  it('GET /:wiId — 404 for missing', async () => {
    const res = await request('GET', `/api/projects/${projectSlug}/work-items/nope`);
    expect(res.status).toBe(404);
  });

  it('PATCH — updates a work item', async () => {
    const created = await request('POST', `/api/projects/${projectSlug}/work-items`, {
      title: 'Cleanup', category: 'refactor',
    });

    const res = await request('PATCH', `/api/projects/${projectSlug}/work-items/${created.body.data.slug}`, {
      status: 'active',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
  });

  it('DELETE — deletes a work item', async () => {
    const created = await request('POST', `/api/projects/${projectSlug}/work-items`, {
      title: 'Temp', category: 'feature',
    });

    const res = await request('DELETE', `/api/projects/${projectSlug}/work-items/${created.body.data.slug}`);
    expect(res.status).toBe(200);

    const list = await request('GET', `/api/projects/${projectSlug}/work-items`);
    expect(list.body.data).toHaveLength(0);
  });

  it('POST — 400 on invalid category', async () => {
    const res = await request('POST', `/api/projects/${projectSlug}/work-items`, {
      title: 'Bad', category: 'invalid',
    });
    expect(res.status).toBe(400);
  });
});

// ===== Tasks =====

describe('Tasks API', () => {
  const projectSlug = 'task-test';
  let wiSlug: string;

  beforeEach(async () => {
    await request('POST', '/api/projects', { title: 'Task Test' });
    const wi = await request('POST', `/api/projects/${projectSlug}/work-items`, {
      title: 'Feature X', category: 'feature',
    });
    wiSlug = wi.body.data.slug;
  });

  it('POST — creates a task', async () => {
    const res = await request('POST', `/api/projects/${projectSlug}/work-items/${wiSlug}/tasks`, {
      title: 'Setup DB',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Setup DB');
    expect(res.body.data.model).toBe('sonnet');
    expect(res.body.data.completed).toBe(false);
  });

  it('PATCH — updates a task', async () => {
    const created = await request('POST', `/api/projects/${projectSlug}/work-items/${wiSlug}/tasks`, {
      title: 'Write tests',
    });
    const taskId = created.body.data.id;

    const res = await request('PATCH', `/api/projects/${projectSlug}/work-items/${wiSlug}/tasks/${taskId}`, {
      priority: 'high',
      model: 'opus',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.priority).toBe('high');
    expect(res.body.data.model).toBe('opus');
  });

  it('POST /:taskId/move — moves a task between columns', async () => {
    const created = await request('POST', `/api/projects/${projectSlug}/work-items/${wiSlug}/tasks`, {
      title: 'Moveable',
    });
    const taskId = created.body.data.id;

    const res = await request('POST', `/api/projects/${projectSlug}/work-items/${wiSlug}/tasks/${taskId}/move`, {
      toColumn: 'in-progress',
      toIndex: 0,
    });
    expect(res.status).toBe(200);

    // Verify it moved
    const wi = await request('GET', `/api/projects/${projectSlug}/work-items/${wiSlug}`);
    expect(wi.body.data.columns['backlog']).toHaveLength(0);
    expect(wi.body.data.columns['in-progress']).toHaveLength(1);
    expect(wi.body.data.columns['in-progress'][0].id).toBe(taskId);
  });

  it('POST /:taskId/move — marks completed when moved to done', async () => {
    const created = await request('POST', `/api/projects/${projectSlug}/work-items/${wiSlug}/tasks`, {
      title: 'Finish me',
    });
    const taskId = created.body.data.id;

    await request('POST', `/api/projects/${projectSlug}/work-items/${wiSlug}/tasks/${taskId}/move`, {
      toColumn: 'done',
      toIndex: 0,
    });

    const wi = await request('GET', `/api/projects/${projectSlug}/work-items/${wiSlug}`);
    const doneTask = wi.body.data.columns['done'][0];
    expect(doneTask.completed).toBe(true);
    expect(doneTask.completedAt).toBeTruthy();
  });

  it('DELETE — deletes a task', async () => {
    const created = await request('POST', `/api/projects/${projectSlug}/work-items/${wiSlug}/tasks`, {
      title: 'Delete me',
    });
    const taskId = created.body.data.id;

    const res = await request('DELETE', `/api/projects/${projectSlug}/work-items/${wiSlug}/tasks/${taskId}`);
    expect(res.status).toBe(200);

    const wi = await request('GET', `/api/projects/${projectSlug}/work-items/${wiSlug}`);
    expect(wi.body.data.columns['backlog']).toHaveLength(0);
  });

  it('POST — 400 on invalid task', async () => {
    const res = await request('POST', `/api/projects/${projectSlug}/work-items/${wiSlug}/tasks`, {
      title: '',
    });
    expect(res.status).toBe(400);
  });

  it('PATCH — 404 for missing task', async () => {
    const res = await request('PATCH', `/api/projects/${projectSlug}/work-items/${wiSlug}/tasks/nonexistent`, {
      title: 'Updated',
    });
    expect(res.status).toBe(404);
  });
});

// ===== Slug Validation =====

describe('Slug validation', () => {
  it('rejects uppercase slug in projects', async () => {
    const res = await request('GET', '/api/projects/MyProject');
    expect(res.status).toBe(400);
  });

  it('rejects special chars in slug', async () => {
    const res = await request('GET', '/api/projects/test;rm');
    expect(res.status).toBe(400);
  });

  it('rejects slug with spaces', async () => {
    const res = await request('GET', '/api/projects/my project');
    expect(res.status).toBe(400);
  });

  it('allows valid lowercase-hyphen slug', async () => {
    // Should get 404 (not found) not 400 (invalid slug)
    const res = await request('GET', '/api/projects/valid-slug');
    expect(res.status).toBe(404);
  });

  it('rejects uppercase in work item wiId', async () => {
    await request('POST', '/api/projects', { title: 'Slug Test' });
    const res = await request('GET', '/api/projects/slug-test/work-items/InvalidSlug');
    expect(res.status).toBe(400);
  });
});

// ===== Input Size Limits =====

describe('Input size limits', () => {
  it('rejects project title over 100 chars', async () => {
    const res = await request('POST', '/api/projects', { title: 'a'.repeat(101) });
    expect(res.status).toBe(400);
  });

  it('accepts project title at 100 chars', async () => {
    const res = await request('POST', '/api/projects', { title: 'a'.repeat(100) });
    expect(res.status).toBe(201);
  });

  it('rejects project description over 500 chars', async () => {
    const res = await request('POST', '/api/projects', {
      title: 'Test',
      description: 'a'.repeat(501),
    });
    expect(res.status).toBe(400);
  });

  it('rejects task description over 2000 chars', async () => {
    await request('POST', '/api/projects', { title: 'Limit Test' });
    const wi = await request('POST', '/api/projects/limit-test/work-items', {
      title: 'WI', category: 'feature',
    });
    const res = await request('POST', `/api/projects/limit-test/work-items/${wi.body.data.slug}/tasks`, {
      title: 'Task',
      description: 'a'.repeat(2001),
    });
    expect(res.status).toBe(400);
  });

  it('rejects work item title over 200 chars', async () => {
    await request('POST', '/api/projects', { title: 'Limit Test 2' });
    const res = await request('POST', '/api/projects/limit-test-2/work-items', {
      title: 'a'.repeat(201),
      category: 'feature',
    });
    expect(res.status).toBe(400);
  });
});
