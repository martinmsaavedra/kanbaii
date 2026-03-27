'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { getSocket } from '@/lib/socket';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';
const POLL_MS = 60_000;
const RETRY_MS = 8_000;
const MAX_RETRIES = 5;
const CACHE_KEY = 'kanbaii-claude-usage';
const CACHE_TTL = 5 * 60 * 1000;

interface UsageEntry {
  label: string;
  percent: number;
  resetsAt: string;
  resetsAtIso: string;
}

interface UsageData {
  entries: UsageEntry[];
  timestamp: string;
}

function barColor(percent: number): string {
  if (percent >= 80) return '#ef4444';
  if (percent >= 60) return '#f59e0b';
  return '#6366f1';
}

function glowColor(percent: number): string {
  if (percent >= 80) return 'rgba(239, 68, 68, 0.3)';
  if (percent >= 60) return 'rgba(245, 158, 11, 0.2)';
  return 'rgba(99, 102, 241, 0.15)';
}

function readCache(): UsageData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UsageData;
    if (Date.now() - new Date(parsed.timestamp).getTime() < CACHE_TTL) return parsed;
  } catch {}
  return null;
}

function writeCache(data: UsageData): void {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
}

export function ClaudeUsageWidget({ isExpanded }: { isExpanded: boolean }) {
  const [usage, setUsage] = useState<UsageData | null>(readCache);
  const [error, setError] = useState(false);
  const retriesRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const applyData = useCallback((data: UsageData) => {
    setUsage(data);
    setError(false);
    retriesRef.current = 0;
    writeCache(data);
  }, []);

  const fetchUsage = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${API}/api/costs/claude-usage`, { signal: controller.signal });
      clearTimeout(timeout);
      const json = await res.json();
      if (json.ok && json.data?.entries?.length > 0) {
        applyData(json.data);
      } else {
        // API returned but no data — maybe server cache empty, retry
        retriesRef.current++;
        if (retriesRef.current >= MAX_RETRIES) setError(true);
      }
    } catch {
      retriesRef.current++;
      if (retriesRef.current >= MAX_RETRIES) setError(true);
    }
  }, [applyData]);

  // Single polling loop: fast retries when no data, slow poll when data exists
  useEffect(() => {
    fetchUsage();
    pollRef.current = setInterval(() => {
      fetchUsage();
    }, usage ? POLL_MS : RETRY_MS);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchUsage, !!usage]); // re-create interval when usage presence changes

  // Socket.IO push updates
  useEffect(() => {
    const socket = getSocket();
    const handler = (data: UsageData) => {
      if (data?.entries?.length > 0) applyData(data);
    };
    socket.on('claude-usage' as any, handler);
    return () => { socket.off('claude-usage' as any, handler); };
  }, [applyData]);

  const maxPercent = usage ? Math.max(...usage.entries.map(e => e.percent), 0) : 0;

  // ─── Collapsed: mini vertical bar ───
  if (!isExpanded) {
    if (!usage) return null; // Don't show anything collapsed if no data
    return (
      <div className="flex flex-col items-center gap-1 py-1" title={usage.entries.map(e => `${e.label}: ${e.percent}%`).join('\n')}>
        <div className="w-[5px] h-5 rounded-full overflow-hidden flex flex-col-reverse"
             style={{ background: 'rgba(148, 163, 242, 0.06)' }}>
          <div className="w-full rounded-full transition-[height] duration-500"
               style={{ height: `${Math.min(maxPercent, 100)}%`, background: barColor(maxPercent) }} />
        </div>
        <span className="text-[7px] text-text-muted font-mono opacity-50">{maxPercent}%</span>
      </div>
    );
  }

  // ─── No data ───
  if (!usage) {
    return (
      <div className="px-3 py-2 flex items-center justify-center gap-2">
        {error ? (
          <>
            <span className="text-[8px] text-text-muted font-mono opacity-40">Unavailable</span>
            <button
              className="text-[8px] text-accent font-mono opacity-60 hover:opacity-100 transition-opacity flex items-center gap-1"
              onClick={() => { retriesRef.current = 0; setError(false); fetchUsage(); }}
            >
              <RefreshCw size={8} /> Retry
            </button>
          </>
        ) : (
          <>
            <div className="w-2.5 h-2.5 border border-text-muted/20 border-t-accent/50 rounded-full animate-spin" />
            <span className="text-[8px] text-text-muted font-mono opacity-40">Loading usage...</span>
          </>
        )}
      </div>
    );
  }

  // ─── Expanded: full rate limit bars ───
  return (
    <div className="px-3 py-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 mb-0.5">
        <Activity size={10} className="text-text-muted opacity-50" />
        <span className="text-[8px] font-semibold text-text-muted uppercase tracking-[0.1em] font-mono opacity-60">
          Rate Limits
        </span>
      </div>

      {usage.entries.map((entry, i) => {
        const color = barColor(entry.percent);
        const glow = glowColor(entry.percent);
        const isCritical = entry.percent >= 80;

        return (
          <div key={i} className="flex flex-col gap-[3px]">
            <div className="flex justify-between items-baseline">
              <span className="text-[9px] text-text-muted truncate max-w-[110px] font-mono">
                {entry.label}
              </span>
              <span className={`text-[10px] font-bold font-mono tabular-nums ${isCritical ? 'animate-breathe' : ''}`}
                    style={{ color }}>
                {entry.percent}%
              </span>
            </div>
            <div className="w-full h-[3px] rounded-full overflow-hidden"
                 style={{ background: 'rgba(148, 163, 242, 0.06)' }}>
              <div className="h-full rounded-full transition-[width] duration-700 ease-out"
                   style={{
                     width: `${Math.min(entry.percent, 100)}%`,
                     background: color,
                     boxShadow: entry.percent > 40 ? `0 0 6px ${glow}` : 'none',
                   }} />
            </div>
            {entry.resetsAt && (
              <span className="text-[7px] text-text-muted font-mono opacity-40">
                Resets {entry.resetsAt}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
