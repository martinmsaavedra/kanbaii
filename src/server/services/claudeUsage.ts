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

// ─── Backoff ───

let _backoffMs = 0;
const MAX_BACKOFF = 5 * 60 * 1000; // 5 minutes max

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
      console.warn('[claude-usage] No OAuth token found in ~/.claude/.credentials.json');
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
            _backoffMs = Math.min((_backoffMs || 15000) * 2, MAX_BACKOFF);
            console.warn(`[claude-usage] Rate limited, backing off ${Math.round(_backoffMs / 1000)}s`);
            resolve();
            return;
          }
          if (res.statusCode !== 200) {
            console.warn(`[claude-usage] API returned ${res.statusCode}`);
            resolve();
            return;
          }
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
            _backoffMs = 0;

            // Broadcast via Socket.IO
            try { getIO().emit('claude-usage' as any, usageCache); } catch {}
          } catch {}
          resolve();
        });
      }
    );

    req.on('error', (err) => {
      _backoffMs = Math.min((_backoffMs || 15000) * 2, MAX_BACKOFF);
      console.warn(`[claude-usage] Request error: ${err.message}, backing off ${Math.round(_backoffMs / 1000)}s`);
      resolve();
    });
    req.setTimeout(15000, () => { console.warn('[claude-usage] Request timeout (15s)'); req.destroy(); resolve(); });
    req.end();
  });
}

// ─── Polling ───

let _pollActive = false;
let _pollTimer: ReturnType<typeof setTimeout> | null = null;

export function startPolling(intervalMs: number = 60000): void {
  if (_pollActive) return;
  _pollActive = true;
  console.log(`[claude-usage] Polling started (${intervalMs / 1000}s base interval)`);

  const poll = async () => {
    if (!_pollActive) return;
    await fetchClaudeUsage();
    if (!_pollActive) return;
    const delay = _backoffMs > 0 ? _backoffMs : intervalMs;
    _pollTimer = setTimeout(poll, delay);
  };

  poll(); // Immediate first fetch
}

export function stopPolling(): void {
  _pollActive = false;
  if (_pollTimer) { clearTimeout(_pollTimer); _pollTimer = null; }
  // Legacy: clear interval reference if any
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}
