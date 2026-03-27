'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Activity } from 'lucide-react';
import { getSocket } from '@/lib/socket';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';

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

export function ClaudeUsageWidget({ isExpanded }: { isExpanded: boolean }) {
  const [usage, setUsage] = useState<UsageData | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem('kanbaii-claude-usage');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Date.now() - new Date(parsed.timestamp).getTime() < 5 * 60 * 1000) return parsed;
        }
      } catch {}
    }
    return null;
  });
  const [loading, setLoading] = useState(!usage);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/costs/claude-usage`);
      const json = await res.json();
      if (json.ok && json.data?.entries) {
        setUsage(json.data);
        setLoading(false);
        sessionStorage.setItem('kanbaii-claude-usage', JSON.stringify(json.data));
      }
    } catch {}
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    fetchUsage();
    const iv = setInterval(fetchUsage, 60000);
    return () => clearInterval(iv);
  }, [fetchUsage]);

  // Retry faster if no data
  useEffect(() => {
    if (usage) return;
    const retry = setInterval(fetchUsage, 5000);
    timeoutRef.current = setTimeout(() => setLoading(false), 30000);
    return () => { clearInterval(retry); if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [usage, fetchUsage]);

  // Socket.IO real-time updates
  useEffect(() => {
    const socket = getSocket();
    const handler = (data: UsageData) => {
      if (data?.entries) {
        setUsage(data);
        setLoading(false);
        sessionStorage.setItem('kanbaii-claude-usage', JSON.stringify(data));
      }
    };
    socket.on('claude-usage' as any, handler);
    socket.on('connect', fetchUsage);
    return () => { socket.off('claude-usage' as any, handler); socket.off('connect', fetchUsage); };
  }, [fetchUsage]);

  const maxPercent = usage ? Math.max(...usage.entries.map(e => e.percent), 0) : 0;

  // ─── Collapsed: mini vertical bar ───
  if (!isExpanded) {
    return (
      <div className="flex flex-col items-center gap-1 py-1" title={usage ? usage.entries.map(e => `${e.label}: ${e.percent}%`).join('\n') : 'Claude Usage'}>
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
      <div className="px-3 py-2 flex flex-col items-center gap-1">
        <div className="text-[8px] text-text-muted font-mono opacity-40 text-center">
          {loading ? 'Fetching usage...' : 'Usage unavailable'}
        </div>
        {!loading && (
          <button
            className="text-[7px] text-accent font-mono opacity-60 hover:opacity-100 transition-opacity"
            onClick={fetchUsage}
          >
            Retry
          </button>
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
