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
