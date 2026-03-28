# Hardening Phase 3 — Production Quality

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden auth, encrypt secrets at rest, add monitoring hooks, and polish reliability — making KANBAII production-grade for public users.

**Architecture:** Secrets encrypted with AES-256-GCM using a machine-derived key. Auth hardened with stronger defaults. Request logging with unique IDs. Process monitoring with health metrics. All changes backward-compatible — existing settings auto-migrate.

**Tech Stack:** Node.js crypto (AES-256-GCM), Express middleware

**Prerequisite:** Phase 1 and Phase 2 must be complete first.

---

### Task 1: Encrypt secrets at rest

**Files:**
- Create: `src/server/lib/secretsEncryption.ts`
- Modify: `src/server/services/settingsService.ts`

- [ ] **Step 1: Create encryption utility**

```typescript
// src/server/lib/secretsEncryption.ts

import crypto from 'crypto';
import os from 'os';

const ALGORITHM = 'aes-256-gcm';

/**
 * Derive encryption key from machine identity.
 * Not unbreakable, but prevents casual reading of settings file.
 */
function deriveKey(): Buffer {
  const material = [os.hostname(), os.homedir(), 'kanbaii-v1'].join(':');
  return crypto.scryptSync(material, 'kanbaii-salt', 32);
}

export function encrypt(text: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `enc:${iv.toString('hex')}:${tag}:${encrypted}`;
}

export function decrypt(encoded: string): string {
  if (!encoded.startsWith('enc:')) return encoded; // Not encrypted, return as-is (migration)
  const [, ivHex, tagHex, data] = encoded.split(':');
  const key = deriveKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let decrypted = decipher.update(data, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');
  return decrypted;
}

export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith('enc:');
}
```

- [ ] **Step 2: Apply to settingsService.ts**

In `getSettings()`, decrypt sensitive fields after reading. In `updateSettings()`, encrypt before writing.

Sensitive fields: `integrations.telegram.botToken`, `integrations.voice.openaiApiKey`, `auth.secret`.

```typescript
import { encrypt, decrypt, isEncrypted } from '../lib/secretsEncryption';

// In getSettings(), after reading and parsing:
const settings = deepMerge(DEFAULTS, saved);
// Auto-decrypt
if (settings.integrations.telegram.botToken) {
  settings.integrations.telegram.botToken = decrypt(settings.integrations.telegram.botToken);
}
if (settings.integrations.voice.openaiApiKey) {
  settings.integrations.voice.openaiApiKey = decrypt(settings.integrations.voice.openaiApiKey);
}
if (settings.auth.secret && isEncrypted(settings.auth.secret)) {
  settings.auth.secret = decrypt(settings.auth.secret);
}

// In updateSettings(), before writing:
// Auto-encrypt sensitive fields
const toSave = { ...merged };
if (toSave.integrations?.telegram?.botToken && !isEncrypted(toSave.integrations.telegram.botToken)) {
  toSave.integrations.telegram.botToken = encrypt(toSave.integrations.telegram.botToken);
}
if (toSave.integrations?.voice?.openaiApiKey && !isEncrypted(toSave.integrations.voice.openaiApiKey)) {
  toSave.integrations.voice.openaiApiKey = encrypt(toSave.integrations.voice.openaiApiKey);
}
if (toSave.auth?.secret && !isEncrypted(toSave.auth.secret)) {
  toSave.auth.secret = encrypt(toSave.auth.secret);
}
```

- [ ] **Step 3: Verify** — Existing plaintext settings auto-decrypt (backward compat). After saving, `.settings.json` shows `enc:...` values.

- [ ] **Step 4: Commit**
```bash
git add src/server/lib/secretsEncryption.ts src/server/services/settingsService.ts
git commit -m "security: encrypt sensitive settings at rest with AES-256-GCM"
```

---

### Task 2: Auth hardening

**Files:**
- Modify: `src/server/services/authService.ts`

- [ ] **Step 1: Fix default secret + strengthen password requirements**

```typescript
// Replace the getSecret() function:
function getSecret(): string {
  const auth = getSection('auth');
  if (!auth.secret || auth.secret === 'kanbaii-default-secret-change-me') {
    // Auto-generate a unique secret on first use
    const generated = crypto.randomBytes(32).toString('hex');
    updateSection('auth', { secret: generated });
    return generated;
  }
  return auth.secret;
}
```

```typescript
// Strengthen password validation (currently 4 chars minimum):
// Change the minimum password length check:
if (!password || password.length < 8) {
  throw new Error('Password must be at least 8 characters');
}
```

- [ ] **Step 2: Commit**
```bash
git add src/server/services/authService.ts
git commit -m "security: auto-generate JWT secret, require 8-char passwords"
```

---

### Task 3: Request logging with unique IDs

**Files:**
- Create: `src/server/lib/requestLogger.ts`
- Modify: `src/server/index.ts`

- [ ] **Step 1: Create request logger middleware**

```typescript
// src/server/lib/requestLogger.ts

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const id = crypto.randomBytes(4).toString('hex');
  const start = Date.now();

  // Attach ID to request for error tracking
  (req as any).requestId = id;

  res.on('finish', () => {
    const duration = Date.now() - start;
    // Only log non-health, non-static requests
    if (req.path.startsWith('/api/') && req.path !== '/api/health') {
      const status = res.statusCode;
      const level = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO';
      if (level !== 'INFO' || duration > 1000) {
        console.log(`[${level}] ${id} ${req.method} ${req.path} ${status} ${duration}ms`);
      }
    }
  });

  next();
}
```

- [ ] **Step 2: Apply in index.ts**

Add before other middleware:
```typescript
import { requestLogger } from './lib/requestLogger';
app.use(requestLogger);
```

- [ ] **Step 3: Commit**
```bash
git add src/server/lib/requestLogger.ts src/server/index.ts
git commit -m "feat: add request logging with unique IDs for error tracking"
```

---

### Task 4: Health endpoint with system metrics

**Files:**
- Modify: `src/server/index.ts` (health endpoint)

- [ ] **Step 1: Enhance health endpoint**

```typescript
// Replace the existing health endpoint:
app.get('/api/health', (_req, res) => {
  const mem = process.memoryUsage();
  res.json({
    ok: true,
    version: require('../../package.json').version,
    uptime: Math.floor(process.uptime()),
    memory: {
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
    },
    node: process.version,
    platform: process.platform,
  });
});
```

- [ ] **Step 2: Commit**
```bash
git add src/server/index.ts
git commit -m "feat: enhance health endpoint with memory and system metrics"
```

---

## Summary — Phase 3

| Task | Issue | Impact |
|------|-------|--------|
| 1 | API keys in plaintext | AES-256-GCM encryption at rest |
| 2 | Weak auth defaults | Auto-generated JWT secret, 8-char min passwords |
| 3 | No request tracking | Unique IDs + duration logging for slow/error requests |
| 4 | Basic health endpoint | Memory, uptime, platform metrics |

**Total: 4 tasks, ~6 files modified, 2 files created, 0 new dependencies.**

---

## All 3 Phases Combined

| Phase | Tasks | Severity Fixed | New Deps |
|-------|-------|---------------|----------|
| **Phase 1** | 8 | 3 CRITICAL, 5 HIGH | 0 |
| **Phase 2** | 6 | 3 MEDIUM, 3 performance | 1 (express-rate-limit) |
| **Phase 3** | 4 | 2 MEDIUM, 2 quality | 0 |
| **Total** | **18** | **16 vulnerabilities** | **1** |

After all 3 phases: Zero known vulnerabilities above LOW severity.
