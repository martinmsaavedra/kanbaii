'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { getSocket } from '@/lib/socket';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';
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

function barColor(p: number) { return p >= 80 ? '#ef4444' : p >= 60 ? '#f59e0b' : '#6366f1'; }
function glowColor(p: number) { return p >= 80 ? 'rgba(239,68,68,0.3)' : p >= 60 ? 'rgba(245,158,11,0.2)' : 'rgba(99,102,241,0.15)'; }

function readCache(): UsageData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UsageData;
    if (parsed?.entries?.length > 0 && Date.now() - new Date(parsed.timestamp).getTime() < CACHE_TTL) return parsed;
  } catch {}
  return null;
}

export function ClaudeUsageWidget({ isExpanded }: { isExpanded: boolean }) {
  const [usage, setUsage] = useState<UsageData | null>(readCache);
  const [timedOut, setTimedOut] = useState(false);
  const mountedRef = useRef(true);

  const applyData = useCallback((data: UsageData) => {
    if (!mountedRef.current) return;
    setUsage(data);
    setTimedOut(false);
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
  }, []);

  const fetchOnce = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${API}/api/costs/claude-usage`);
      const json = await res.json();
      // Handle both { ok, data } wrapper and direct response
      const payload = json?.data || json;
      if (payload?.entries?.length > 0) {
        applyData(payload);
        return true;
      }
    } catch {}
    return false;
  }, [applyData]);

  useEffect(() => {
    mountedRef.current = true;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setInterval> | null = null;
    let giveUpTimer: ReturnType<typeof setTimeout> | null = null;

    // Phase 1: fast retries every 3s until we get data (max 30s)
    const startFastRetry = () => {
      retryTimer = setInterval(async () => {
        const ok = await fetchOnce();
        if (ok && retryTimer) { clearInterval(retryTimer); retryTimer = null; }
      }, 3000);

      giveUpTimer = setTimeout(() => {
        if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
        if (mountedRef.current && !usage) setTimedOut(true);
      }, 30000);
    };

    // Phase 2: slow poll every 60s (always runs)
    pollTimer = setInterval(fetchOnce, 60000);

    // Kick off
    fetchOnce().then((ok) => {
      if (!ok) startFastRetry();
    });

    return () => {
      mountedRef.current = false;
      if (pollTimer) clearInterval(pollTimer);
      if (retryTimer) clearInterval(retryTimer);
      if (giveUpTimer) clearTimeout(giveUpTimer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Socket.IO push
  useEffect(() => {
    const socket = getSocket();
    const handler = (data: any) => {
      if (data?.entries?.length > 0) applyData(data);
    };
    socket.on('claude-usage' as any, handler);
    socket.on('connect', () => { fetchOnce(); });
    return () => { socket.off('claude-usage' as any, handler); };
  }, [applyData, fetchOnce]);

  const maxPercent = usage ? Math.max(...usage.entries.map(e => e.percent), 0) : 0;

  // ─── Collapsed ───
  if (!isExpanded) {
    if (!usage) return null;
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
    if (timedOut) {
      return (
        <div className="px-3 py-2 flex items-center justify-center gap-2">
          <span className="text-[8px] text-text-muted font-mono opacity-40">Unavailable</span>
          <button
            className="text-[8px] text-accent font-mono opacity-60 hover:opacity-100 transition-opacity flex items-center gap-1"
            onClick={() => { setTimedOut(false); fetchOnce(); }}
          >
            <RefreshCw size={8} /> Retry
          </button>
        </div>
      );
    }
    return (
      <div className="px-3 py-2 flex items-center justify-center gap-2">
        <div className="w-2.5 h-2.5 border border-text-muted/20 border-t-accent/50 rounded-full animate-spin" />
        <span className="text-[8px] text-text-muted font-mono opacity-40">Loading usage...</span>
      </div>
    );
  }

  // ─── Expanded ───
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
        return (
          <div key={i} className="flex flex-col gap-[3px]">
            <div className="flex justify-between items-baseline">
              <span className="text-[9px] text-text-muted truncate max-w-[110px] font-mono">{entry.label}</span>
              <span className={`text-[10px] font-bold font-mono tabular-nums ${entry.percent >= 80 ? 'animate-breathe' : ''}`}
                    style={{ color }}>{entry.percent}%</span>
            </div>
            <div className="w-full h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(148,163,242,0.06)' }}>
              <div className="h-full rounded-full transition-[width] duration-700 ease-out"
                   style={{ width: `${Math.min(entry.percent, 100)}%`, background: color,
                            boxShadow: entry.percent > 40 ? `0 0 6px ${glow}` : 'none' }} />
            </div>
            {entry.resetsAt && (
              <span className="text-[7px] text-text-muted font-mono opacity-40">Resets {entry.resetsAt}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
