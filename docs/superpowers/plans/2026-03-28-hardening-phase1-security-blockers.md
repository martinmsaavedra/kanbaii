# Hardening Phase 1 — Security Blockers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all CRITICAL and HIGH security vulnerabilities that block production readiness — command injection, CORS, path traversal, predictable IDs, request limits, error handling, and package hygiene.

**Architecture:** Each fix is surgical — change the minimum code to close the vulnerability without altering behavior. Every fix is independently testable. No new dependencies except `crypto` (built-in Node.js). Changes are ordered so they don't conflict.

**Tech Stack:** Node.js crypto, Express middleware, path validation

---

## Verification Strategy

After ALL tasks, run:
```bash
npm run dev:server   # Server starts without errors
# In another terminal:
curl http://localhost:5555/api/health   # Returns 200
curl http://localhost:5555/api/projects  # Returns project list
# Frontend: navigate, create project, create work item, drag tasks
```

---

### Task 1: Fix command injection in system.ts

**Files:**
- Modify: `src/server/routes/system.ts`

Replace `exec(cmd)` with `execFile()` using array arguments. No user input touches shell.

- [ ] **Step 1: Rewrite system.ts**

```typescript
import { Router, Request, Response } from 'express';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';

const router = Router();

router.post('/open-folder', (req: Request, res: Response) => {
  const { path: folderPath } = req.body;

  if (!folderPath || typeof folderPath !== 'string') {
    return res.status(400).json({ ok: false, error: 'path is required' });
  }

  // Resolve and validate path — must be absolute and exist
  const resolved = path.resolve(folderPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return res.status(404).json({ ok: false, error: 'Directory not found' });
  }

  const platform = process.platform;
  let cmd: string;
  let args: string[];

  if (platform === 'win32') {
    cmd = 'explorer';
    args = [resolved];
  } else if (platform === 'darwin') {
    cmd = 'open';
    args = [resolved];
  } else {
    cmd = 'xdg-open';
    args = [resolved];
  }

  // execFile does NOT use shell — no injection possible
  execFile(cmd, args, (err) => {
    if (err) return res.status(500).json({ ok: false, error: 'Failed to open folder' });
    res.json({ ok: true });
  });
});

export default router;
```

- [ ] **Step 2: Verify** — `curl -X POST http://localhost:5555/api/open-folder -H "Content-Type: application/json" -d '{"path":"C:/Users"}'` should open explorer.

- [ ] **Step 3: Commit**
```bash
git add src/server/routes/system.ts
git commit -m "security: fix command injection in open-folder — use execFile instead of exec"
```

---

### Task 2: Fix CORS + add request size limits

**Files:**
- Modify: `src/server/index.ts:46-54`

- [ ] **Step 1: Replace CORS config and add JSON limit**

Find and replace these lines in `createApp()`:

```typescript
// BEFORE (lines 46-54):
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
  serveClient: false,
});
setIO(io);

app.use(cors());
app.use(express.json());

// AFTER:
const allowedOrigins = [
  'http://localhost:3000',   // Next.js dev
  'http://localhost:5555',   // Production (self)
  `http://localhost:${PORT}`, // Custom port
];

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
  serveClient: false,
});
setIO(io);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '2mb' }));
```

- [ ] **Step 2: Verify** — Frontend at localhost:3000 can still connect. `curl` from localhost works. Browser console shows no CORS errors.

- [ ] **Step 3: Commit**
```bash
git add src/server/index.ts
git commit -m "security: restrict CORS to localhost origins, add 2mb JSON limit"
```

---

### Task 3: Add path traversal validation

**Files:**
- Create: `src/server/lib/safePath.ts`
- Modify: `src/server/services/projectStore.ts:15-16`
- Modify: `src/server/services/workItemStore.ts:17-22`

- [ ] **Step 1: Create safePath helper**

```typescript
// src/server/lib/safePath.ts

import path from 'path';

/**
 * Validate that a slug/filename doesn't escape the base directory.
 * Throws if path traversal detected.
 */
export function safePath(baseDir: string, ...segments: string[]): string {
  // Reject obviously malicious segments
  for (const seg of segments) {
    if (typeof seg !== 'string' || seg.includes('..') || seg.includes('\0') || /[<>:"|?*]/.test(seg)) {
      throw new Error(`Invalid path segment: ${seg}`);
    }
  }

  const resolved = path.resolve(baseDir, ...segments);
  const normalizedBase = path.resolve(baseDir);

  if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
    throw new Error(`Path escapes base directory`);
  }

  return resolved;
}
```

- [ ] **Step 2: Apply to projectStore.ts**

Replace `projectDir()`:
```typescript
import { safePath } from '../lib/safePath';

function projectDir(slug: string): string {
  return safePath(DATA_DIR, slug);
}
```

- [ ] **Step 3: Apply to workItemStore.ts**

Replace `workItemsDir()` and `workItemFile()`:
```typescript
import { safePath } from '../lib/safePath';

function workItemsDir(projectSlug: string): string {
  return safePath(DATA_DIR, projectSlug, 'work-items');
}

function workItemFile(projectSlug: string, slug: string): string {
  return safePath(DATA_DIR, projectSlug, 'work-items', `${slug}.json`);
}
```

- [ ] **Step 4: Verify** — Creating/reading projects and work items still works. `curl -X POST /api/projects -d '{"title":"../../etc/passwd"}' ` returns error, not file content.

- [ ] **Step 5: Commit**
```bash
git add src/server/lib/safePath.ts src/server/services/projectStore.ts src/server/services/workItemStore.ts
git commit -m "security: add path traversal validation for all file operations"
```

---

### Task 4: Fix escalation IDs + model validation

**Files:**
- Modify: `src/server/services/escalationService.ts:37`
- Modify: `src/server/services/terminalManager.ts:40-41`

- [ ] **Step 1: Use crypto for escalation IDs**

In `escalationService.ts`, add import and fix ID generation:

```typescript
import crypto from 'crypto';

// Replace line 37:
// BEFORE:
id: `esc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,

// AFTER:
id: `esc-${crypto.randomBytes(12).toString('hex')}`,
```

- [ ] **Step 2: Validate model in terminalManager.ts**

In `terminalManager.ts`, add model validation before use:

```typescript
// Replace lines 38-41:
const isWindows = process.platform === 'win32';
const shell = isWindows ? 'cmd.exe' : '/bin/bash';

// Validate model — whitelist only known values
const validModels = ['opus', 'sonnet', 'haiku'];
const model = opts?.model && validModels.includes(opts.model) ? opts.model : undefined;
const claudeCmd = `claude${model ? ` --model ${model}` : ''}`;
const shellArgs = isWindows ? ['/c', claudeCmd] : ['-c', claudeCmd];
```

- [ ] **Step 3: Verify** — Create an escalation, check ID is hex not timestamp. Open terminal with model=sonnet works; model="; rm -rf /" rejected.

- [ ] **Step 4: Commit**
```bash
git add src/server/services/escalationService.ts src/server/services/terminalManager.ts
git commit -m "security: crypto IDs for escalations, whitelist model in terminal"
```

---

### Task 5: Fix shell:true in generate.ts and mcpConfig.ts

**Files:**
- Modify: `src/server/routes/generate.ts:12-16`
- Modify: `src/server/services/mcpConfig.ts:133-137`

- [ ] **Step 1: Remove shell:true from generate.ts**

```typescript
// BEFORE (line 12-16):
const proc = spawn('claude', ['-p', '--output-format', 'text'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: true,
  timeout: 120000,
});

// AFTER:
const proc = spawn('claude', ['-p', '--output-format', 'text'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
});
```

- [ ] **Step 2: Remove shell:true from mcpConfig.ts testServer()**

```typescript
// BEFORE (line 133-136):
const proc = spawn(server.command, server.args || [], {
  env: { ...process.env, ...server.env },
  shell: true,
  stdio: ['pipe', 'pipe', 'pipe'],
});

// AFTER:
const proc = spawn(server.command, server.args || [], {
  env: { ...process.env, ...server.env },
  windowsHide: true,
  stdio: ['pipe', 'pipe', 'pipe'],
});
```

- [ ] **Step 3: Verify** — Plan generation still works (create a work item via wizard). MCP server test still works.

- [ ] **Step 4: Commit**
```bash
git add src/server/routes/generate.ts src/server/services/mcpConfig.ts
git commit -m "security: remove shell:true from spawn calls in generate and mcpConfig"
```

---

### Task 6: Global error handler + sanitized errors

**Files:**
- Modify: `src/server/index.ts` (add after all routes, before static serving)

- [ ] **Step 1: Add global error handler middleware**

Add this AFTER all `app.use('/api/...')` route registrations but BEFORE the static file serving:

```typescript
// Global error handler — catches unhandled errors in routes
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server] Unhandled error:', err.message);
  res.status(500).json({ ok: false, error: 'Internal server error' });
});
```

- [ ] **Step 2: Verify** — Server still starts. Invalid requests return 500 with generic message, not stack traces.

- [ ] **Step 3: Commit**
```bash
git add src/server/index.ts
git commit -m "security: add global error handler, sanitize error responses"
```

---

### Task 7: Package hygiene — remove tests + source maps

**Files:**
- Modify: `package.json` — `files` field
- Modify: `tsconfig.json` — source maps
- Create: `tsconfig.build.json` — production build config (no source maps)

- [ ] **Step 1: Create tsconfig.build.json for production**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "sourceMap": false,
    "declarationMap": false
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "frontend", "src/**/__tests__/**"]
}
```

- [ ] **Step 2: Update package.json**

Change `files` field to exclude tests and maps:
```json
"files": [
  "dist/cli/",
  "dist/server/engines/",
  "dist/server/lib/",
  "dist/server/mcp/",
  "dist/server/routes/",
  "dist/server/services/",
  "dist/server/index.*",
  "dist/shared/",
  "dashboard/",
  "LICENSE",
  "README.md"
],
```

Change `prepublishOnly` to use production config:
```json
"prepublishOnly": "tsc -p tsconfig.build.json"
```

- [ ] **Step 3: Verify** — `npm pack --dry-run 2>&1 | grep __tests__` returns nothing. `npm pack --dry-run 2>&1 | grep .js.map` returns nothing.

- [ ] **Step 4: Commit**
```bash
git add tsconfig.build.json package.json
git commit -m "chore: exclude tests and source maps from npm package"
```

---

### Task 8: Graceful shutdown

**Files:**
- Modify: `src/server/index.ts:155-169`

- [ ] **Step 1: Add complete shutdown handlers**

Replace the existing shutdown block at the bottom of the file:

```typescript
// Graceful shutdown
const shutdown = () => {
  console.log('\n  Shutting down...');
  watcher.stop();

  // Stop active executions
  try { require('./engines/coordinator').stopCoordinator(); } catch {}
  try { require('./engines/workerPool').stopAllWorkers(); } catch {}
  try { require('./engines/ralph').stopRalph(); } catch {}

  // Close Socket.IO connections
  io.close();

  httpServer.close(() => {
    console.log('  Server closed.');
    process.exit(0);
  });

  // Force exit after 5 seconds
  setTimeout(() => process.exit(1), 5000);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

- [ ] **Step 2: Verify** — Start server, run a Ralph task, Ctrl+C. Server stops cleanly, no zombie processes.

- [ ] **Step 3: Commit**
```bash
git add src/server/index.ts
git commit -m "fix: complete graceful shutdown — stop coordinator, workers, ralph, socket.io"
```

---

## Summary — Phase 1

| Task | Vulnerability | Severity | Fix |
|------|-------------|----------|-----|
| 1 | Command injection (system.ts) | CRITICAL | `execFile()` with array args |
| 2 | CORS wildcard + no size limit | HIGH | Whitelist localhost + 2mb limit |
| 3 | Path traversal | HIGH | `safePath()` validator |
| 4 | Predictable IDs + PTY injection | MEDIUM | `crypto.randomBytes` + model whitelist |
| 5 | `shell:true` in spawn | HIGH | Remove shell flag |
| 6 | No error handler | MEDIUM | Global Express error middleware |
| 7 | Tests + source maps in package | HIGH | Separate build config, files whitelist |
| 8 | Incomplete shutdown | MEDIUM | Stop all engines + force exit |

**Total: 8 tasks, ~10 files modified, 1 file created.**

After Phase 1: Zero CRITICAL vulns, zero HIGH vulns in server code.
