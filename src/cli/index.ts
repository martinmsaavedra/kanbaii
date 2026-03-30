#!/usr/bin/env node

// src/cli/index.ts

import { Command } from 'commander';
import { printBanner, getVersion } from './banner';
import { runDiagnostics, findClaudePath, isClaudeAuthenticated } from './doctor';
import updateNotifier from 'update-notifier';
import path from 'path';
import fs from 'fs';

// Check for updates (runs in background, shows banner on next run)
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf-8'));
updateNotifier({ pkg, updateCheckInterval: 1000 * 60 * 60 * 4 }).notify();

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

    // Auto-rebuild dashboard if running from dev environment with stale build
    const frontendDir = path.join(__dirname, '..', '..', 'frontend');
    const dashboardIndex = path.join(__dirname, '..', '..', 'dashboard', 'index.html');
    if (fs.existsSync(path.join(frontendDir, 'package.json'))) {
      const dashboardTime = fs.existsSync(dashboardIndex)
        ? fs.statSync(dashboardIndex).mtimeMs : 0;
      const srcDirs = ['components', 'app', 'stores', 'hooks', 'lib', 'contexts'].map(d => path.join(frontendDir, d));
      let needsRebuild = false;
      for (const dir of srcDirs) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir, { recursive: true }) as string[];
        if (files.some(f => fs.statSync(path.join(dir, f)).mtimeMs > dashboardTime)) {
          needsRebuild = true;
          break;
        }
      }
      if (needsRebuild) {
        console.log('  \x1b[33m◇\x1b[0m Frontend changes detected, rebuilding dashboard...');
        const { execSync } = require('child_process');
        try {
          const projectRoot = path.join(__dirname, '..', '..');
          execSync('npm run build:frontend', { cwd: projectRoot, stdio: 'pipe' });
          console.log('  \x1b[32m◇\x1b[0m Dashboard rebuilt successfully.');
          console.log('');
        } catch (err: any) {
          console.log('  \x1b[31m✗\x1b[0m Dashboard rebuild failed. Using last build.');
          console.log(`    ${err.message?.split('\n')[0] || 'Unknown error'}`);
          console.log('');
        }
      }
    }

    // Pre-flight: check claude exists AND is authenticated
    const claudePath = findClaudePath();
    if (!claudePath) {
      console.log('  \x1b[31m✗\x1b[0m Claude CLI not found. Install it first:');
      console.log('    npm i -g @anthropic-ai/claude-code');
      console.log('');
      console.log('  Run \x1b[1mkanbaii doctor\x1b[0m for full diagnostics.');
      process.exit(1);
    }

    // Check authentication
    const authed = isClaudeAuthenticated(claudePath);
    if (!authed) {
      console.log('  \x1b[33m!\x1b[0m Claude CLI found but not authenticated.');
      console.log('');
      console.log('  Run this first to link your account:');
      console.log('    \x1b[1mclaude\x1b[0m');
      console.log('');
      console.log('  This will open a browser to authenticate with Anthropic.');
      console.log('  Once done, run \x1b[1mkanbaii start\x1b[0m again.');
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
    const { httpServer, io, watcher } = createApp();

    watcher.start();

    // Start background services
    try { require('../server/services/claudeUsage').startPolling(60000); } catch {}
    try { require('../server/services/schedulerService').startSchedulerLoop(); } catch {}

    const port = parseInt(opts.port, 10);
    httpServer.listen(port, () => {
      console.log(`  \x1b[32m◇\x1b[0m Server running on \x1b[1mhttp://localhost:${port}\x1b[0m`);
      console.log(`  \x1b[2mData: ${dataDir}\x1b[0m`);
      console.log('');
      console.log('  \x1b[2mEnjoy KANBAII? Give it a star:\x1b[0m');
      console.log('  \x1b[2mhttps://github.com/martinmsaavedra/kanbaii\x1b[0m');
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

    // Graceful shutdown (mirrors src/server/index.ts logic)
    let _shuttingDown = false;
    const shutdown = () => {
      if (_shuttingDown) { process.exit(1); return; } // Second Ctrl+C = force kill
      _shuttingDown = true;
      console.log('\n  Shutting down...');

      // Stop background services first
      try { require('../server/services/claudeUsage').stopPolling(); } catch {}
      try { require('../server/services/schedulerService').stopSchedulerLoop(); } catch {}

      // Stop active executions
      try { require('../server/engines/coordinator').stopCoordinator(); } catch {}
      try { require('../server/engines/workerPool').stopAllWorkers(); } catch {}
      try { require('../server/engines/ralph').stopRalph(); } catch {}

      watcher.stop();
      io.close();

      httpServer.close(() => {
        console.log('  Server closed.');
        process.exit(0);
      });

      // Force exit after 3 seconds
      setTimeout(() => { console.log('  Force exit.'); process.exit(1); }, 3000).unref();
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

    // Validate Claude CLI setup
    const claudePath = findClaudePath();
    if (!claudePath) {
      console.log(`  \x1b[31m✗\x1b[0m Claude CLI not found.`);
      console.log('');
      console.log('  KANBAII needs Claude Code to power AI features.');
      console.log('  Install it:');
      console.log('    \x1b[1mnpm i -g @anthropic-ai/claude-code\x1b[0m');
      console.log('');
      console.log('  Then authenticate:');
      console.log('    \x1b[1mclaude\x1b[0m');
      console.log('');
    } else {
      console.log(`  \x1b[32m◇\x1b[0m Claude CLI found: ${claudePath}`);
      const authed = isClaudeAuthenticated(claudePath);
      if (!authed) {
        console.log(`  \x1b[33m!\x1b[0m Claude not authenticated. Run \x1b[1mclaude\x1b[0m to link your account.`);
        console.log('');
      } else {
        console.log(`  \x1b[32m◇\x1b[0m Claude authenticated`);
      }
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

// ── kanbaii shortcut ─────────────────────────────────────────────────────

program
  .command('shortcut')
  .description('Create a desktop shortcut to launch KANBAII')
  .option('-p, --port <port>', 'Port number', '5555')
  .option('--remove', 'Remove the desktop shortcut')
  .action((opts) => {
    printBanner();

    const os = require('os');
    const desktop = path.join(os.homedir(), 'Desktop');

    if (!fs.existsSync(desktop)) {
      // Try common localized desktop paths
      const alternatives = [
        path.join(os.homedir(), 'Escritorio'),
        path.join(os.homedir(), 'Bureau'),
        path.join(os.homedir(), 'Schreibtisch'),
      ];
      const found = alternatives.find(d => fs.existsSync(d));
      if (!found) {
        console.log('  \x1b[31m✗\x1b[0m Could not find Desktop directory.');
        process.exit(1);
      }
    }

    const desktopPath = fs.existsSync(desktop) ? desktop
      : [path.join(os.homedir(), 'Escritorio'), path.join(os.homedir(), 'Bureau'), path.join(os.homedir(), 'Schreibtisch')]
        .find(d => fs.existsSync(d)) || desktop;

    const platform = process.platform;
    const port = opts.port;

    if (platform === 'win32') {
      const batPath = path.join(desktopPath, 'KANBAII.bat');
      if (opts.remove) {
        if (fs.existsSync(batPath)) { fs.unlinkSync(batPath); console.log('  \x1b[32m◇\x1b[0m Shortcut removed.'); }
        else { console.log('  \x1b[2mNo shortcut found.\x1b[0m'); }
        return;
      }
      const batContent = `@echo off\ntitle KANBAII\nkanbaii start -p ${port}\n`;
      fs.writeFileSync(batPath, batContent, 'utf-8');
      console.log(`  \x1b[32m◇\x1b[0m Created shortcut: ${batPath}`);

    } else if (platform === 'darwin') {
      const cmdPath = path.join(desktopPath, 'KANBAII.command');
      if (opts.remove) {
        if (fs.existsSync(cmdPath)) { fs.unlinkSync(cmdPath); console.log('  \x1b[32m◇\x1b[0m Shortcut removed.'); }
        else { console.log('  \x1b[2mNo shortcut found.\x1b[0m'); }
        return;
      }
      const cmdContent = `#!/bin/bash\nkanbaii start -p ${port}\n`;
      fs.writeFileSync(cmdPath, cmdContent, { mode: 0o755 });
      console.log(`  \x1b[32m◇\x1b[0m Created shortcut: ${cmdPath}`);

    } else {
      // Linux .desktop file
      const desktopFile = path.join(desktopPath, 'kanbaii.desktop');
      if (opts.remove) {
        if (fs.existsSync(desktopFile)) { fs.unlinkSync(desktopFile); console.log('  \x1b[32m◇\x1b[0m Shortcut removed.'); }
        else { console.log('  \x1b[2mNo shortcut found.\x1b[0m'); }
        return;
      }
      const desktopContent = `[Desktop Entry]\nName=KANBAII\nExec=kanbaii start -p ${port}\nType=Application\nTerminal=true\nComment=AI-native kanban for software development\n`;
      fs.writeFileSync(desktopFile, desktopContent, { mode: 0o755 });
      console.log(`  \x1b[32m◇\x1b[0m Created shortcut: ${desktopFile}`);
    }

    console.log('');
    console.log('  Double-click it to launch KANBAII.');
    console.log('  It will start the server and open your browser.');
    console.log('');
    console.log(`  \x1b[2mTo remove: kanbaii shortcut --remove\x1b[0m`);
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
      const data = await res.json() as { ok: boolean; version: string; uptime: number };
      if (data.ok) {
        console.log(`  \x1b[32m◇\x1b[0m KANBAII running on port ${opts.port} (v${data.version}, uptime ${Math.floor(data.uptime)}s)`);
      }
    } catch {
      console.log(`  \x1b[2m◇ No server running on port ${opts.port}\x1b[0m`);
    }
  });

program.parse();
