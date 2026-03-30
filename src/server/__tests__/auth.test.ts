import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';

// ─── Section 1: authService unit tests ───────────────────────────────────────

const DATA_DIR = process.env.KANBAII_DATA_DIR!;
const USERS_FILE = path.join(DATA_DIR, '..', '.users.json');

function cleanup() {
  if (fs.existsSync(DATA_DIR)) fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(USERS_FILE)) fs.rmSync(USERS_FILE, { force: true });
}

describe('authService unit tests', () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it('register returns user + token (token has 3 parts split by ".")', async () => {
    const { register } = await import('../services/authService');
    const result = register('alice', 'password123');
    expect(result.user.username).toBe('alice');
    expect(typeof result.token).toBe('string');
    expect(result.token.split('.').length).toBe(3);
  });

  it('rejects password under 8 chars', async () => {
    const { register } = await import('../services/authService');
    expect(() => register('bob', 'short')).toThrow('8 characters');
  });

  it('rejects duplicate username', async () => {
    const { register } = await import('../services/authService');
    register('charlie', 'password123');
    expect(() => register('charlie', 'password456')).toThrow('already exists');
  });

  it('login succeeds with correct credentials', async () => {
    const { register, login } = await import('../services/authService');
    register('diana', 'securepass');
    const result = login('diana', 'securepass');
    expect(result.user.username).toBe('diana');
    expect(typeof result.token).toBe('string');
    expect(result.token.split('.').length).toBe(3);
  });

  it('login fails with wrong password', async () => {
    const { register, login } = await import('../services/authService');
    register('eve', 'correctpass');
    expect(() => login('eve', 'wrongpass')).toThrow('Invalid credentials');
  });

  it('login fails for non-existent user', async () => {
    const { login } = await import('../services/authService');
    expect(() => login('ghost', 'anypassword')).toThrow('Invalid credentials');
  });

  it('verifyToken validates a valid token (returns payload with username)', async () => {
    const { register, verifyToken } = await import('../services/authService');
    const { token } = register('frank', 'password123');
    const payload = verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.username).toBe('frank');
  });

  it('verifyToken rejects garbage tokens', async () => {
    const { verifyToken } = await import('../services/authService');
    expect(verifyToken('not.a.token')).toBeNull();
    expect(verifyToken('')).toBeNull();
    expect(verifyToken('abc')).toBeNull();
  });

  it('hasUsers returns false when empty, true after register', async () => {
    const { hasUsers, register } = await import('../services/authService');
    expect(hasUsers()).toBe(false);
    register('grace', 'password123');
    expect(hasUsers()).toBe(true);
  });
});

// ─── Section 2: Auth API route tests ─────────────────────────────────────────

import { createApp } from '../index';

const AUTH_TEST_PORT = 15556;

let authHttpServer: http.Server;
let authBaseUrl: string;

function request(method: string, urlPath: string, body?: unknown): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, authBaseUrl);
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

function requestWithHeaders(
  method: string,
  urlPath: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, authBaseUrl);
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload).toString() } : {}),
        ...headers,
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
  if (fs.existsSync(USERS_FILE)) fs.rmSync(USERS_FILE, { force: true });
}

beforeAll(async () => {
  cleanRouteTestData();
  const app = createApp();
  authHttpServer = app.httpServer;
  await new Promise<void>((resolve) => {
    authHttpServer.listen(AUTH_TEST_PORT, () => {
      authBaseUrl = `http://127.0.0.1:${AUTH_TEST_PORT}`;
      resolve();
    });
  });
});

afterAll(async () => {
  cleanRouteTestData();
  await new Promise<void>((resolve) => authHttpServer.close(() => resolve()));
});

beforeEach(() => {
  cleanRouteTestData();
});

describe('Auth API routes', () => {
  // Run the no-token test first (before accumulating rate-limit budget)
  it('GET /api/auth/verify without token returns 401', async () => {
    const res = await request('GET', '/api/auth/verify');
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it('GET /api/auth/status returns { enabled: false }', async () => {
    const res = await request('GET', '/api/auth/status');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.enabled).toBe(false);
  });

  it('POST /api/auth/register creates user (200 + token)', async () => {
    const res = await request('POST', '/api/auth/register', {
      username: 'testuser',
      password: 'password123',
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.user.username).toBe('testuser');
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.token.split('.').length).toBe(3);
  });

  it('POST /api/auth/register rejects short password (400)', async () => {
    const res = await request('POST', '/api/auth/register', {
      username: 'testuser',
      password: 'short',
    });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('POST /api/auth/register rejects missing fields (400)', async () => {
    const res = await request('POST', '/api/auth/register', { username: 'testuser' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('POST /api/auth/login succeeds with valid creds (200 + token)', async () => {
    await request('POST', '/api/auth/register', {
      username: 'loginuser',
      password: 'password123',
    });
    const res = await request('POST', '/api/auth/login', {
      username: 'loginuser',
      password: 'password123',
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.user.username).toBe('loginuser');
    expect(typeof res.body.data.token).toBe('string');
  });

  it('POST /api/auth/login fails with wrong password (401)', async () => {
    await request('POST', '/api/auth/register', {
      username: 'wrongpass',
      password: 'correctpassword',
    });
    const res = await request('POST', '/api/auth/login', {
      username: 'wrongpass',
      password: 'wrongpassword',
    });
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it('GET /api/auth/verify with valid token returns user info (200)', async () => {
    const reg = await request('POST', '/api/auth/register', {
      username: 'verifyuser',
      password: 'password123',
    });
    const token = reg.body.data.token;

    const res = await requestWithHeaders('GET', '/api/auth/verify', {
      Authorization: `Bearer ${token}`,
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.username).toBe('verifyuser');
  });
});
