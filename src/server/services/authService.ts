import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getSection } from './settingsService';

const DATA_DIR = path.resolve(process.env.KANBAII_DATA_DIR || path.join(process.cwd(), 'data', 'projects'));
const USERS_FILE = path.join(DATA_DIR, '..', '.users.json');

// ─── Types ───

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
}

export interface TokenPayload {
  userId: string;
  username: string;
  iat: number;
  exp: number;
}

// ─── Password hashing (no bcrypt dependency — use native crypto) ───

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

function generateSalt(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ─── JWT-like tokens (simple HMAC-based, no jsonwebtoken dependency) ───

function getSecret(): string {
  const auth = getSection('auth');
  return auth.secret || 'kanbaii-default-secret-change-me';
}

function base64url(str: string): string {
  return Buffer.from(str).toString('base64url');
}

function sign(payload: object): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', getSecret()).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verify(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = crypto.createHmac('sha256', getSecret()).update(`${header}.${body}`).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as TokenPayload;
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch { return null; }
}

// ─── User store ───

function readUsers(): User[] {
  try {
    if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch {}
  return [];
}

function writeUsers(users: User[]): void {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

// ─── API ───

export function isAuthEnabled(): boolean {
  return getSection('auth').enabled;
}

export function register(username: string, password: string): { user: Omit<User, 'passwordHash' | 'salt'>; token: string } {
  const users = readUsers();
  if (users.find(u => u.username === username)) {
    throw new Error('Username already exists');
  }

  const salt = generateSalt();
  const user: User = {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    username,
    passwordHash: hashPassword(password, salt),
    salt,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeUsers(users);

  const expiry = parseExpiry(getSection('auth').tokenExpiry || '24h');
  const token = sign({ userId: user.id, username, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expiry });

  return { user: { id: user.id, username, createdAt: user.createdAt }, token };
}

export function login(username: string, password: string): { user: Omit<User, 'passwordHash' | 'salt'>; token: string } {
  const users = readUsers();
  const user = users.find(u => u.username === username);
  if (!user) throw new Error('Invalid credentials');

  const hash = hashPassword(password, user.salt);
  if (hash !== user.passwordHash) throw new Error('Invalid credentials');

  const expiry = parseExpiry(getSection('auth').tokenExpiry || '24h');
  const token = sign({ userId: user.id, username, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expiry });

  return { user: { id: user.id, username, createdAt: user.createdAt }, token };
}

export function verifyToken(token: string): TokenPayload | null {
  return verify(token);
}

export function hasUsers(): boolean {
  return readUsers().length > 0;
}

function parseExpiry(str: string): number {
  const match = str.match(/^(\d+)(h|d|m)$/);
  if (!match) return 86400; // 24h default
  const val = parseInt(match[1], 10);
  switch (match[2]) {
    case 'h': return val * 3600;
    case 'd': return val * 86400;
    case 'm': return val * 60;
    default: return 86400;
  }
}
