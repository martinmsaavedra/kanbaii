# Hardening Phase 2 — Pre-Release Quality

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix performance bottlenecks, add rate limiting, sanitize prompt inputs, validate plugins, and ensure the app doesn't crash under load — making it ready for public v1.0 release.

**Architecture:** In-memory cache for file I/O, express-rate-limit for API protection, prompt sanitization layer, worker pool cleanup, and proper timeout management. Each fix is backward-compatible.

**Tech Stack:** Node.js, express-rate-limit (new dep), crypto

**Prerequisite:** Phase 1 must be complete first.

---

### Task 1: Rate limiting on sensitive endpoints

**Files:**
- Modify: `package.json` (add express-rate-limit)
- Create: `src/server/lib/rateLimiter.ts`
- Modify: `src/server/index.ts`

- [ ] **Step 1: Install dependency**
```bash
npm install express-rate-limit
```

- [ ] **Step 2: Create rate limiter presets**

```typescript
// src/server/lib/rateLimiter.ts
import rateLimit from 'express-rate-limit';

// General API: 100 requests per minute
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests, try again later' },
});

// Auth endpoints: 10 attempts per 15 minutes
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { ok: false, error: 'Too many login attempts' },
});

// Execution endpoints (ralph/teams/start): 5 per minute
export const executionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { ok: false, error: 'Too many execution requests' },
});

// Voice transcription: 10 per minute (resource-heavy)
export const voiceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { ok: false, error: 'Too many transcription requests' },
});
```

- [ ] **Step 3: Apply to index.ts**

Add after `app.use(authMiddleware)`:
```typescript
import { apiLimiter, authLimiter, executionLimiter, voiceLimiter } from './lib/rateLimiter';

// Rate limiting
app.use('/api/', apiLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/ralph/start', executionLimiter);
app.use('/api/teams/start', executionLimiter);
app.use('/api/voice', voiceLimiter);
```

- [ ] **Step 4: Commit**
```bash
git add package.json src/server/lib/rateLimiter.ts src/server/index.ts
git commit -m "security: add rate limiting on API, auth, execution, and voice endpoints"
```

---

### Task 2: Prompt sanitization layer

**Files:**
- Create: `src/server/lib/promptSanitizer.ts`
- Modify: `src/server/engines/taskRouter.ts`
- Modify: `src/server/engines/coordinatorPrompt.ts`

- [ ] **Step 1: Create prompt sanitizer**

```typescript
// src/server/lib/promptSanitizer.ts

/**
 * Sanitize user-controlled text before injecting into Claude prompts.
 * Strips prompt injection patterns without altering normal text.
 */
export function sanitizeForPrompt(text: string): string {
  if (!text || typeof text !== 'string') return '';

  let sanitized = text;

  // Strip system/assistant role markers that could override prompt structure
  sanitized = sanitized.replace(/^(system|assistant|human|user):/gim, '[role]:');

  // Strip XML-like tags that Claude interprets specially
  sanitized = sanitized.replace(/<\/?(?:system|instructions|context|prompt|tool_use|tool_result|thinking)[^>]*>/gi, '');

  // Strip markdown heading overrides that could inject new sections
  // Only strip if they look like injection (e.g., "# New System Prompt")
  sanitized = sanitized.replace(/^#{1,3}\s*(system|instructions|role|override|ignore|forget)/gim, '[$1]');

  // Limit length to prevent context flooding
  if (sanitized.length > 10000) {
    sanitized = sanitized.slice(0, 10000) + '\n[truncated]';
  }

  return sanitized;
}
```

- [ ] **Step 2: Apply in taskRouter.ts**

In `buildPrompt()`, sanitize task title and description:
```typescript
import { sanitizeForPrompt } from '../lib/promptSanitizer';

// In buildPrompt, where task fields are used:
parts.push(`# Task: ${sanitizeForPrompt(task.title)}`);
if (task.description) parts.push(`\n## Description\n${sanitizeForPrompt(task.description)}`);
```

- [ ] **Step 3: Apply in coordinatorPrompt.ts**

Sanitize work item titles:
```typescript
import { sanitizeForPrompt } from '../lib/promptSanitizer';

// In buildCoordinatorPrompt, where work item titles are listed:
for (const title of opts.workItemTitles) {
  parts.push(`- ${sanitizeForPrompt(title)}`);
}
```

- [ ] **Step 4: Commit**
```bash
git add src/server/lib/promptSanitizer.ts src/server/engines/taskRouter.ts src/server/engines/coordinatorPrompt.ts
git commit -m "security: add prompt sanitization layer for user-controlled text in prompts"
```

---

### Task 3: Worker pool cleanup + memory management

**Files:**
- Modify: `src/server/engines/workerPool.ts`

- [ ] **Step 1: Add automatic cleanup to workerPool**

Add a cleanup function and cap `_completedResults`:

```typescript
// Add after the assignTask function:

const MAX_COMPLETED_RESULTS = 100;
const MAX_WORKER_AGE_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Clean up stale workers and cap completed results.
 * Called automatically after each worker completion.
 */
function cleanup(): void {
  const now = Date.now();

  // Remove finished workers older than 30 min
  for (const [id, { info }] of _workers) {
    if (info.status !== 'running' && info.completedAt) {
      const age = now - new Date(info.completedAt).getTime();
      if (age > MAX_WORKER_AGE_MS) _workers.delete(id);
    }
  }

  // Cap completed results
  if (_completedResults.length > MAX_COMPLETED_RESULTS) {
    _completedResults = _completedResults.slice(-MAX_COMPLETED_RESULTS);
  }
}
```

Then call `cleanup()` at the end of the async worker IIFE (after the `emit('live:metrics')` call).

- [ ] **Step 2: Commit**
```bash
git add src/server/engines/workerPool.ts
git commit -m "fix: add worker pool cleanup to prevent memory leaks"
```

---

### Task 4: Fix ClaudeRunner timeout

**Files:**
- Modify: `src/server/engines/claudeRunner.ts`

The `timeout` option in `spawn()` doesn't work in Node.js. Implement manual timeout.

- [ ] **Step 1: Add manual timeout to ClaudeRunner.run()**

After `this.proc = spawn(...)`, add:

```typescript
// Manual timeout — spawn's timeout option doesn't kill the process
const timeoutTimer = setTimeout(() => {
  if (this.proc && !this.killed) {
    console.warn(`[claude-runner] Process timeout after ${timeout}ms, killing`);
    this.stop();
  }
}, timeout);

// Clear timeout in both close and error handlers:
this.proc.on('close', (code) => {
  clearTimeout(timeoutTimer);
  // ... existing close handler
});

this.proc.on('error', (err) => {
  clearTimeout(timeoutTimer);
  // ... existing error handler
});
```

Also remove `timeout` from the spawn options (it doesn't do anything):

```typescript
// BEFORE:
this.proc = spawn('claude', args, {
  cwd: workingDir,
  stdio: ['pipe', 'pipe', 'pipe'],
  timeout,  // <-- REMOVE THIS
  env: { ...process.env },
  windowsHide: true,
});

// AFTER:
this.proc = spawn('claude', args, {
  cwd: workingDir,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env },
  windowsHide: true,
});
```

- [ ] **Step 2: Commit**
```bash
git add src/server/engines/claudeRunner.ts
git commit -m "fix: implement manual process timeout in ClaudeRunner (spawn timeout doesn't work)"
```

---

### Task 5: Claude usage polling with exponential backoff

**Files:**
- Modify: `src/server/services/claudeUsage.ts`

- [ ] **Step 1: Add backoff to polling**

Add backoff state and modify the polling function:

```typescript
let _backoffMs = 0;
const MAX_BACKOFF = 5 * 60 * 1000; // 5 minutes max

// In the fetch/polling function, on 429 or error:
_backoffMs = Math.min((_backoffMs || 15000) * 2, MAX_BACKOFF);
console.warn(`[claude-usage] Rate limited, backing off ${_backoffMs / 1000}s`);

// On success:
_backoffMs = 0;

// In the polling interval setup, use dynamic interval:
function scheduleNext(baseInterval: number): void {
  const delay = _backoffMs > 0 ? _backoffMs : baseInterval;
  setTimeout(() => { fetchAndSchedule(baseInterval); }, delay);
}
```

- [ ] **Step 2: Commit**
```bash
git add src/server/services/claudeUsage.ts
git commit -m "fix: add exponential backoff to claude usage polling"
```

---

### Task 6: Plugin validation (basic sandboxing)

**Files:**
- Modify: `src/server/services/pluginLoader.ts`

Full sandboxing (V8 isolates) is heavy. For now, add basic validation: check file is in the plugins dir, validate exports, wrap in try/catch with timeout.

- [ ] **Step 1: Add plugin validation**

Before the `require(fullPath)` call, add:

```typescript
// Validate plugin is within plugins directory (prevent path traversal)
const resolvedPath = path.resolve(fullPath);
if (!resolvedPath.startsWith(path.resolve(PLUGINS_DIR))) {
  console.warn(`[plugins] Rejected plugin outside plugins dir: ${file}`);
  continue;
}

// Read and check for obviously dangerous patterns
const content = fs.readFileSync(fullPath, 'utf-8');
const dangerousPatterns = [
  /child_process/,
  /require\(['"]fs['"]\)/,
  /process\.exit/,
  /eval\s*\(/,
  /Function\s*\(/,
];
const hasDangerous = dangerousPatterns.some(p => p.test(content));
if (hasDangerous) {
  console.warn(`[plugins] Plugin ${file} uses restricted APIs — loading with warning`);
  // Still load, but log the warning. Future: block or sandbox.
}
```

- [ ] **Step 2: Commit**
```bash
git add src/server/services/pluginLoader.ts
git commit -m "security: add plugin validation — path check and dangerous pattern warning"
```

---

## Summary — Phase 2

| Task | Issue | Impact |
|------|-------|--------|
| 1 | No rate limiting | DoS prevention on all endpoints |
| 2 | Prompt injection | Sanitize user text before Claude prompts |
| 3 | Worker memory leak | Auto-cleanup + capped results |
| 4 | Timeout doesn't work | Manual process timeout with kill |
| 5 | Polling without backoff | Exponential backoff on 429 |
| 6 | Unsafe plugins | Path validation + pattern warnings |

**Total: 6 tasks, ~8 files modified, 2 files created, 1 new dependency.**
