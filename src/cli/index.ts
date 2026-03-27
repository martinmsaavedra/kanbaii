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
      const data = await res.json() as { ok: boolean; version: string; uptime: number };
      if (data.ok) {
        console.log(`  \x1b[32m◇\x1b[0m KANBAII running on port ${opts.port} (v${data.version}, uptime ${Math.floor(data.uptime)}s)`);
      }
    } catch {
      console.log(`  \x1b[2m◇ No server running on port ${opts.port}\x1b[0m`);
    }
  });

program.parse();
