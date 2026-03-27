import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getIO } from '../lib/typedEmit';

// ─── Types ───

export interface ClaudeUsageEntry {
  label: string;
  percent: number;
  resetsAt: string;
  resetsAtIso: string;
}

export interface ClaudeUsageData {
  entries: ClaudeUsageEntry[];
  timestamp: string;
}

// ─── Cache ───

let usageCache: ClaudeUsageData | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;

export function getCachedUsage(): ClaudeUsageData | null {
  return usageCache;
}

// ─── OAuth Token ───

function readOAuthToken(): string | null {
  try {
    const credsPath = path.join(os.homedir(), '.claude', '.credentials.json');
    if (!fs.existsSync(credsPath)) return null;
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    return creds?.claudeAiOauth?.accessToken || null;
  } catch {
    return null;
  }
}

// ─── Time formatting ───

function formatResetTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    if (diffMs <= 0) return 'now';
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `${diffMin}m`;
    const diffH = Math.floor(diffMin / 60);
    const remainMin = diffMin % 60;
    if (diffH < 24) return `${diffH}h ${remainMin}m`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD}d ${diffH % 24}h`;
  } catch {
    return iso;
  }
}

// ─── Fetch from Claude API ───

export function fetchClaudeUsage(): Promise<void> {
  return new Promise((resolve) => {
    const token = readOAuthToken();
    if (!token) {
      resolve();
      return;
    }

    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/api/oauth/usage',
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'claude-code/2.1.70',
          'anthropic-beta': 'oauth-2025-04-20',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c: Buffer) => (data += c));
        res.on('end', () => {
          if (res.statusCode === 429) {
            // Rate limited — retry in 15 seconds
            console.log('[claude-usage] Rate limited, retrying in 15s');
            setTimeout(() => fetchClaudeUsage(), 15000);
            resolve();
            return;
          }
          if (res.statusCode !== 200) { resolve(); return; }
          try {
            const raw = JSON.parse(data);
            const entries: ClaudeUsageEntry[] = [];

            if (raw.five_hour) {
              entries.push({
                label: 'Session (5h)',
                percent: raw.five_hour.utilization,
                resetsAt: formatResetTime(raw.five_hour.resets_at),
                resetsAtIso: raw.five_hour.resets_at,
              });
            }
            if (raw.seven_day) {
              entries.push({
                label: 'Weekly (all)',
                percent: raw.seven_day.utilization,
                resetsAt: formatResetTime(raw.seven_day.resets_at),
                resetsAtIso: raw.seven_day.resets_at,
              });
            }
            if (raw.seven_day_sonnet) {
              entries.push({
                label: 'Weekly (Sonnet)',
                percent: raw.seven_day_sonnet.utilization,
                resetsAt: formatResetTime(raw.seven_day_sonnet.resets_at),
                resetsAtIso: raw.seven_day_sonnet.resets_at,
              });
            }
            if (raw.seven_day_opus) {
              entries.push({
                label: 'Weekly (Opus)',
                percent: raw.seven_day_opus.utilization,
                resetsAt: formatResetTime(raw.seven_day_opus.resets_at),
                resetsAtIso: raw.seven_day_opus.resets_at,
              });
            }

            usageCache = { entries, timestamp: new Date().toISOString() };

            // Broadcast via Socket.IO
            try { getIO().emit('claude-usage' as any, usageCache); } catch {}
          } catch {}
          resolve();
        });
      }
    );

    req.on('error', () => resolve());
    req.setTimeout(10000, () => { req.destroy(); resolve(); });
    req.end();
  });
}

// ─── Polling ───

export function startPolling(intervalMs: number = 60000): void {
  if (pollInterval) return;
  fetchClaudeUsage(); // Immediate first fetch
  pollInterval = setInterval(() => fetchClaudeUsage(), intervalMs);
  console.log(`[claude-usage] Polling started (${intervalMs / 1000}s interval)`);
}

export function stopPolling(): void {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}
