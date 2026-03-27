# CLI + NPM Packaging

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make KANBAII installable via `npm i -g kanbaii` with commands `kanbaii start`, `kanbaii init`, `kanbaii doctor`, `kanbaii stop`, `kanbaii status` — working on Windows, Mac, Linux.

**Architecture:** CLI uses `commander` (already in deps) for command routing. `kanbaii doctor` pre-checks Claude CLI existence, version, auth, and Node version. `kanbaii start` spawns the Express server (importing from `../server/index`). The server serves the pre-built frontend from `dashboard/` directory (Next.js static export). `node-pty` is already optional (try/catch in terminalManager.ts). Build pipeline: `tsc` for server+cli → `dist/`, `next build && next export` for frontend → `dashboard/`.

**Tech Stack:** Commander.js, child_process (execSync for claude detection), Express static serving, TypeScript, Next.js static export

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/cli/index.ts` | **Create** | CLI entry point: commander setup, all commands |
| `src/cli/doctor.ts` | **Create** | Diagnose: claude path, version, auth, node version |
| `src/cli/banner.ts` | **Create** | ASCII art banner + version display |
| `package.json` | **Modify** | Move node-pty to optionalDependencies, add postinstall hint |
| `tsconfig.cli.json` | **Modify** | Include cli + shared + server (CLI imports server) |
| `src/server/index.ts` | **Modify** | Fix dashboard path resolution for both dev and production |

---

### Task 1: Create doctor.ts (Claude CLI detection)

**Files:**
- Create: `src/cli/doctor.ts`

- [ ] **Step 1: Create the doctor module**

```typescript
// src/cli/doctor.ts

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  message: string;
}

/**
 * Find the claude CLI binary path.
 * Checks: PATH lookup, common install locations.
 */
export function findClaudePath(): string | null {
  // Try PATH first
  try {
    const cmd = process.platform === 'win32' ? 'where claude' : 'which claude';
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
    if (result) return result.split('\n')[0].trim();
  } catch {}

  // Common locations
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const candidates = [
    path.join(home, '.local', 'bin', 'claude'),
    path.join(home, '.claude', 'local', 'claude'),
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ];
  if (process.platform === 'win32') {
    candidates.push(
      path.join(home, 'AppData', 'Local', 'Programs', 'claude', 'claude.exe'),
      path.join(home, '.local', 'bin', 'claude.exe'),
    );
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

/**
 * Get Claude CLI version string.
 */
export function getClaudeVersion(claudePath: string): string | null {
  try {
    const result = execSync(`"${claudePath}" --version`, { encoding: 'utf-8', timeout: 10000 }).trim();
    // Output: "2.1.85 (Claude Code)" → extract version
    const match = result.match(/^(\d+\.\d+\.\d+)/);
    return match ? match[1] : result.split('\n')[0];
  } catch {
    return null;
  }
}

/**
 * Check if Claude CLI is authenticated (has valid session).
 */
export function isClaudeAuthenticated(claudePath: string): boolean {
  try {
    // Quick check: run a minimal command. If not authenticated, it exits with error.
    execSync(`"${claudePath}" -p --output-format text "echo test" 2>&1`, {
      encoding: 'utf-8',
      timeout: 15000,
    });
    return true;
  } catch {
    // Check if credentials file exists as fallback
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const credPath = path.join(home, '.claude', '.credentials.json');
    return fs.existsSync(credPath);
  }
}

/**
 * Run all diagnostic checks.
 */
export function runDiagnostics(): CheckResult[] {
  const results: CheckResult[] = [];

  // 1. Node.js version
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  results.push({
    name: 'Node.js',
    status: nodeMajor >= 18 ? 'ok' : 'fail',
    message: nodeMajor >= 18
      ? `${nodeVersion} (>= 18 required)`
      : `${nodeVersion} — Node.js 18+ required. Upgrade at https://nodejs.org`,
  });

  // 2. Claude CLI existence
  const claudePath = findClaudePath();
  if (!claudePath) {
    results.push({
      name: 'Claude CLI',
      status: 'fail',
      message: 'Not found in PATH. Install: npm i -g @anthropic-ai/claude-code',
    });
    return results; // Can't check further
  }
  results.push({ name: 'Claude CLI', status: 'ok', message: claudePath });

  // 3. Claude CLI version
  const version = getClaudeVersion(claudePath);
  if (!version) {
    results.push({ name: 'Claude version', status: 'warn', message: 'Could not determine version' });
  } else {
    const major = parseInt(version.split('.')[0], 10);
    results.push({
      name: 'Claude version',
      status: major >= 2 ? 'ok' : 'warn',
      message: major >= 2
        ? `${version}`
        : `${version} — version 2.x+ recommended for stream-json support`,
    });
  }

  // 4. Claude authentication
  const authenticated = isClaudeAuthenticated(claudePath);
  results.push({
    name: 'Claude auth',
    status: authenticated ? 'ok' : 'fail',
    message: authenticated
      ? 'Authenticated'
      : 'Not authenticated. Run: claude login',
  });

  // 5. node-pty (optional)
  try {
    require('node-pty');
    results.push({ name: 'node-pty', status: 'ok', message: 'Available (terminal feature enabled)' });
  } catch {
    results.push({ name: 'node-pty', status: 'warn', message: 'Not available (terminal feature disabled — optional)' });
  }

  // 6. Data directory
  const dataDir = path.resolve(process.env.KANBAII_DATA_DIR || path.join(process.cwd(), 'data', 'projects'));
  results.push({
    name: 'Data directory',
    status: fs.existsSync(dataDir) ? 'ok' : 'warn',
    message: fs.existsSync(dataDir) ? dataDir : `${dataDir} (will be created on first run)`,
  });

  return results;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/cli/doctor.ts
git commit -m "feat(cli): add doctor module for Claude CLI detection and diagnostics"
```

---

### Task 2: Create banner.ts

**Files:**
- Create: `src/cli/banner.ts`

- [ ] **Step 1: Create the banner module**

```typescript
// src/cli/banner.ts

import fs from 'fs';
import path from 'path';

export function getVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function printBanner(): void {
  const version = getVersion();
  console.log(`
  \x1b[38;5;99m◇\x1b[0m  \x1b[1mKANBAII\x1b[0m v${version}
     \x1b[2mAI-native kanban for software development\x1b[0m
`);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/cli/banner.ts
git commit -m "feat(cli): add banner module"
```

---

### Task 3: Create CLI entry point (index.ts)

**Files:**
- Create: `src/cli/index.ts`

- [ ] **Step 1: Create the CLI entry point**

```typescript
#!/usr/bin/env node

// src/cli/index.ts

import { Command } from 'commander';
import { printBanner, getVersion } from './banner';
import { runDiagnostics, findClaudePath } from './doctor';
import path from 'path';
import fs from 'fs';

const program = new Command();

program
  .name('kanbaii')
  .description('AI-native kanban board for software development')
  .version(getVersion());

// ── kanbaii start ────────────────────────────────────────────────────────

program
  .command('start')
  .description('Start the KANBAII server')
  .option('-p, --port <port>', 'Port number', '5555')
  .option('--no-open', 'Do not open browser')
  .option('--data-dir <path>', 'Custom data directory')
  .action(async (opts) => {
    printBanner();

    // Quick pre-flight: check claude exists
    const claudePath = findClaudePath();
    if (!claudePath) {
      console.log('  \x1b[31m✗\x1b[0m Claude CLI not found. Install it first:');
      console.log('    npm i -g @anthropic-ai/claude-code');
      console.log('');
      console.log('  Run \x1b[1mkanbaii doctor\x1b[0m for full diagnostics.');
      process.exit(1);
    }

    // Set env before importing server
    process.env.KANBAII_PORT = opts.port;
    if (opts.dataDir) {
      process.env.KANBAII_DATA_DIR = path.resolve(opts.dataDir);
    }

    // Ensure data directory exists
    const dataDir = process.env.KANBAII_DATA_DIR || path.join(process.cwd(), 'data', 'projects');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Import and start server
    const { createApp } = require('../server/index');
    const { httpServer, watcher } = createApp();

    watcher.start();

    // Start background services
    try { require('../server/services/claudeUsage').startPolling(60000); } catch {}
    try { require('../server/services/schedulerService').startSchedulerLoop(); } catch {}

    const port = parseInt(opts.port, 10);
    httpServer.listen(port, () => {
      console.log(`  \x1b[32m◇\x1b[0m Server running on \x1b[1mhttp://localhost:${port}\x1b[0m`);
      console.log(`  \x1b[2mData: ${dataDir}\x1b[0m`);
      console.log('');

      // Open browser (unless --no-open)
      if (opts.open !== false) {
        const url = `http://localhost:${port}`;
        const openCmd = process.platform === 'darwin' ? 'open'
          : process.platform === 'win32' ? 'start'
          : 'xdg-open';
        try {
          require('child_process').exec(`${openCmd} ${url}`);
        } catch {}
      }
    });

    // Graceful shutdown
    const shutdown = () => {
      console.log('\n  Shutting down...');
      watcher.stop();
      httpServer.close(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });

// ── kanbaii init ─────────────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize KANBAII data directory')
  .option('--data-dir <path>', 'Custom data directory')
  .action((opts) => {
    printBanner();

    const dataDir = opts.dataDir
      ? path.resolve(opts.dataDir)
      : path.join(process.cwd(), 'data', 'projects');

    if (fs.existsSync(dataDir)) {
      console.log(`  \x1b[33m◇\x1b[0m Data directory already exists: ${dataDir}`);
    } else {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log(`  \x1b[32m◇\x1b[0m Created data directory: ${dataDir}`);
    }

    // Create .gitignore if not exists
    const gitignorePath = path.join(path.dirname(dataDir), '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, 'data/\n.run-state.json\n.mcp-runtime*.json\n.coordinator-state.json\n', 'utf-8');
      console.log(`  \x1b[32m◇\x1b[0m Created .gitignore`);
    }

    console.log('');
    console.log('  Run \x1b[1mkanbaii start\x1b[0m to start the server.');
  });

// ── kanbaii doctor ───────────────────────────────────────────────────────

program
  .command('doctor')
  .description('Diagnose environment and dependencies')
  .action(() => {
    printBanner();
    console.log('  Running diagnostics...\n');

    const results = runDiagnostics();
    for (const r of results) {
      const icon = r.status === 'ok' ? '\x1b[32m✓\x1b[0m'
        : r.status === 'warn' ? '\x1b[33m!\x1b[0m'
        : '\x1b[31m✗\x1b[0m';
      console.log(`  ${icon} \x1b[1m${r.name}\x1b[0m — ${r.message}`);
    }

    const failures = results.filter(r => r.status === 'fail');
    console.log('');
    if (failures.length === 0) {
      console.log('  \x1b[32mAll checks passed.\x1b[0m Ready to run \x1b[1mkanbaii start\x1b[0m');
    } else {
      console.log(`  \x1b[31m${failures.length} issue(s) found.\x1b[0m Fix them before starting.`);
    }
  });

// ── kanbaii stop ─────────────────────────────────────────────────────────

program
  .command('stop')
  .description('Stop the running KANBAII server')
  .option('-p, --port <port>', 'Port number', '5555')
  .action(async (opts) => {
    try {
      const res = await fetch(`http://localhost:${opts.port}/api/health`);
      if (res.ok) {
        // Server is running — send shutdown signal
        console.log(`  Stopping server on port ${opts.port}...`);
        // The cleanest way: hit a shutdown endpoint or just inform the user
        console.log('  \x1b[33m◇\x1b[0m Use Ctrl+C in the terminal where kanbaii is running.');
        console.log('  \x1b[2m(Remote stop not yet implemented)\x1b[0m');
      }
    } catch {
      console.log(`  \x1b[2mNo server running on port ${opts.port}\x1b[0m`);
    }
  });

// ── kanbaii status ───────────────────────────────────────────────────────

program
  .command('status')
  .description('Check if KANBAII server is running')
  .option('-p, --port <port>', 'Port number', '5555')
  .action(async (opts) => {
    try {
      const res = await fetch(`http://localhost:${opts.port}/api/health`);
      const data = await res.json();
      if (data.ok) {
        console.log(`  \x1b[32m◇\x1b[0m KANBAII running on port ${opts.port} (v${data.version}, uptime ${Math.floor(data.uptime)}s)`);
      }
    } catch {
      console.log(`  \x1b[2m◇ No server running on port ${opts.port}\x1b[0m`);
    }
  });

program.parse();
```

- [ ] **Step 2: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat(cli): add CLI entry point with start, init, doctor, stop, status commands"
```

---

### Task 4: Fix tsconfig and package.json for build

**Files:**
- Modify: `tsconfig.cli.json`
- Modify: `package.json`

- [ ] **Step 1: Fix tsconfig.cli.json to include server (CLI imports server)**

The CLI `start` command does `require('../server/index')`, so the CLI tsconfig must compile both cli AND server:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/cli/**/*", "src/server/**/*", "src/shared/**/*"]
}
```

Actually, since both cli and server compile to `dist/`, and server already has its own tsconfig, the simplest approach is to have ONE build that compiles everything. The cli tsconfig should include everything:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: Move node-pty to optionalDependencies in package.json**

Move `node-pty` from `dependencies` to `optionalDependencies` so install doesn't fail on machines without build tools:

In package.json, remove `"node-pty": "^1.1.0"` from `dependencies` and add an `optionalDependencies` section:

```json
"optionalDependencies": {
  "node-pty": "^1.1.0"
}
```

- [ ] **Step 3: Simplify build scripts in package.json**

Replace the build scripts:

```json
"scripts": {
  "dev:server": "tsx watch src/server/index.ts",
  "dev:frontend": "cd frontend && npm run dev",
  "dev": "concurrently \"npm run dev:server\" \"npm run dev:frontend\"",
  "build:server": "tsc -p tsconfig.server.json",
  "build:frontend": "cd frontend && npm ci && npm run build && node -e \"const fs=require('fs');fs.rmSync('../dashboard',{recursive:true,force:true});fs.cpSync('out','../dashboard',{recursive:true});\"",
  "build": "tsc -p tsconfig.cli.json && npm run build:frontend",
  "start": "node dist/server/index.js",
  "postbuild": "node -e \"require('fs').chmodSync('dist/cli/index.js', '755')\"",
  "test": "vitest run",
  "test:watch": "vitest",
  "prepublishOnly": "npm run build"
}
```

- [ ] **Step 4: Commit**

```bash
git add tsconfig.cli.json package.json
git commit -m "feat(cli): fix tsconfig and package.json for unified build + npm packaging"
```

---

### Task 5: Fix server dashboard path for production

**Files:**
- Modify: `src/server/index.ts:86-92`

The current dashboard path uses `__dirname` which resolves to `dist/server/` in production. The dashboard lives at the package root: `dashboard/`. Fix the path to work in both dev (tsx) and production (compiled).

- [ ] **Step 1: Fix dashboard path resolution**

In `src/server/index.ts`, change lines 86-92:

```typescript
// Before:
const dashboardDir = path.resolve(__dirname, '..', '..', 'dashboard');

// After — works in both dev (src/server/) and prod (dist/server/):
const dashboardDir = path.resolve(__dirname, '..', '..', 'dashboard');
// Also try package root if dashboard not found at relative path
const altDashboardDir = path.resolve(process.cwd(), 'dashboard');
const effectiveDashboardDir = fs.existsSync(dashboardDir) ? dashboardDir : altDashboardDir;

app.use(express.static(effectiveDashboardDir));
app.get('*', (_req, res) => {
  const indexPath = path.join(effectiveDashboardDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ ok: false, error: 'Dashboard not found. Run: npm run build:frontend' });
  }
});
```

Add `import fs from 'fs';` at the top if not already there.

- [ ] **Step 2: Commit**

```bash
git add src/server/index.ts
git commit -m "fix(server): dashboard path resolution for both dev and production"
```

---

### Task 6: Test the full build + install flow

**Files:** None (verification only)

- [ ] **Step 1: Build**

```bash
npm run build
```

Expected: `dist/` created with `cli/index.js`, `server/index.js`, `shared/types.js`

- [ ] **Step 2: Test CLI directly**

```bash
node dist/cli/index.js --version
node dist/cli/index.js doctor
node dist/cli/index.js status
```

Expected: Version prints, doctor runs checks, status shows no server

- [ ] **Step 3: Test start command**

```bash
node dist/cli/index.js start --no-open
```

Expected: Server starts on :5555, dashboard served at /

- [ ] **Step 4: Test npm link (simulates global install)**

```bash
npm link
kanbaii --version
kanbaii doctor
kanbaii start --no-open
```

Expected: Binary works globally, doctor passes, server starts

- [ ] **Step 5: Test npm pack (simulates publish)**

```bash
npm pack --dry-run
```

Expected: Package includes `dist/`, `dashboard/`, package.json. Does NOT include `src/`, `frontend/`, `node_modules/`, `data/`.

- [ ] **Step 6: Commit if any fixes needed**

---

## Summary

| File | Purpose |
|------|---------|
| `src/cli/index.ts` | CLI entry: start, init, doctor, stop, status |
| `src/cli/doctor.ts` | Claude CLI detection, version check, auth check |
| `src/cli/banner.ts` | Version + branding |
| `package.json` | node-pty → optional, build scripts fixed, prepublishOnly |
| `tsconfig.cli.json` | Unified build (cli + server + shared) |
| `src/server/index.ts` | Dashboard path fix for production |

**Cross-platform considerations:**
- Claude CLI detection: `which` (unix) / `where` (windows) + fallback paths
- Browser open: `open` (mac) / `start` (win) / `xdg-open` (linux)
- node-pty: optionalDependency — terminal feature gracefully degrades
- Paths: all use `path.resolve()` / `path.join()` — no hardcoded separators
