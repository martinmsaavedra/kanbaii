'use client';

import { useEffect, useState, useCallback } from 'react';
import { Clock, Play, Pause, X, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';

interface Schedule {
  id: string;
  projectSlug: string;
  workItemSlug: string;
  taskId: string;
  taskTitle: string;
  frequency: 'once' | 'daily' | 'weekly' | 'biweekly' | 'monthly';
  time: string;
  timezone: string;
  enabled: boolean;
  lastRun: string | null;
  lastStatus: 'success' | 'failed' | 'running' | null;
  nextRun: string | null;
  runCount: number;
}

function timeUntil(isoDate: string | null): string {
  if (!isoDate) return '—';
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff < 0) return 'due';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  return `${Math.floor(hours / 24)}d`;
}

function statusDot(s: Schedule): string {
  if (s.lastStatus === 'running') return 'bg-accent animate-breathe';
  if (!s.enabled) return 'bg-text-muted/30';
  if (s.lastStatus === 'failed') return 'bg-danger';
  if (s.lastStatus === 'success') return 'bg-success';
  return 'bg-warning';
}

/**
 * Global schedule bar — sits in the top navbar, shows across all views/projects.
 * Collapsed: icon + count. Expanded: full schedule list with controls.
 */
export function ScheduleBar() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/scheduler/schedules`);
      const data = await res.json();
      if (data.ok) setSchedules(data.data || []);
    } catch {}
  }, []);

  // Poll every 30s
  useEffect(() => {
    fetchSchedules();
    const iv = setInterval(fetchSchedules, 30000);
    return () => clearInterval(iv);
  }, [fetchSchedules]);

  const handleToggle = async (id: string, enabled: boolean) => {
    await fetch(`${API}/api/scheduler/schedules/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    fetchSchedules();
  };

  const handleRunNow = async (id: string) => {
    setLoading(true);
    await fetch(`${API}/api/scheduler/schedules/${id}/run`, { method: 'POST' });
    setTimeout(() => { fetchSchedules(); setLoading(false); }, 1000);
  };

  const handleDelete = async (id: string) => {
    await fetch(`${API}/api/scheduler/schedules/${id}`, { method: 'DELETE' });
    fetchSchedules();
  };

  const activeCount = schedules.filter(s => s.enabled).length;
  const runningCount = schedules.filter(s => s.lastStatus === 'running').length;

  if (schedules.length === 0) return null;

  return (
    <div className="relative">
      {/* Collapsed: pill button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xxs font-mono font-medium border transition-all duration-150
          ${runningCount > 0
            ? 'text-accent bg-accent-muted border-accent/20 animate-breathe'
            : activeCount > 0
            ? 'text-text-secondary bg-pill border-border hover:border-border-light hover:text-text'
            : 'text-text-muted bg-pill border-border/50'
          }`}
      >
        <Clock size={11} />
        {activeCount}/{schedules.length}
        {runningCount > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-breathe" />
        )}
        {expanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
      </button>

      {/* Expanded: dropdown panel */}
      {expanded && (
        <div className="absolute top-[calc(100%+6px)] right-0 z-50 w-[380px] bg-surface-elevated border border-border-light rounded-md shadow-[0_12px_40px_rgba(0,0,0,0.4)] animate-fade-in-up overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-bg-subtle">
            <span className="text-xxs font-semibold text-text-muted uppercase tracking-[0.1em] font-mono">
              Scheduled Tasks
            </span>
            <span className="text-xxs text-text-muted font-mono">
              {activeCount} active · {runningCount} running
            </span>
          </div>

          {/* Schedule list */}
          <div className="max-h-[320px] overflow-y-auto">
            {schedules.map(s => (
              <div key={s.id} className="flex items-center gap-2 px-3 py-2 border-b border-border/50 hover:bg-surface-hover transition-colors duration-100">
                {/* Status dot */}
                <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot(s)}`} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-text truncate">{s.taskTitle}</div>
                  <div className="text-xxs text-text-muted font-mono flex items-center gap-2">
                    <span>{s.projectSlug}</span>
                    <span className="text-text-muted/30">·</span>
                    <span>{s.frequency} {s.time}</span>
                    {s.nextRun && (
                      <>
                        <span className="text-text-muted/30">·</span>
                        <span className={s.lastStatus === 'running' ? 'text-accent' : ''}>
                          {s.lastStatus === 'running' ? 'running' : `next: ${timeUntil(s.nextRun)}`}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    className="btn-icon w-6 h-6"
                    onClick={() => handleRunNow(s.id)}
                    title="Run now"
                    disabled={loading || s.lastStatus === 'running'}
                  >
                    {loading ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
                  </button>
                  <button
                    className="btn-icon w-6 h-6"
                    onClick={() => handleToggle(s.id, !s.enabled)}
                    title={s.enabled ? 'Pause' : 'Enable'}
                  >
                    <Pause size={10} className={s.enabled ? 'text-warning' : 'text-success'} />
                  </button>
                  <button
                    className="btn-icon w-6 h-6 hover:!text-danger"
                    onClick={() => handleDelete(s.id)}
                    title="Delete"
                  >
                    <X size={10} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-3 py-1.5 border-t border-border bg-bg-subtle text-xxs text-text-muted font-mono text-center">
            Schedules run automatically · {schedules.reduce((s, x) => s + x.runCount, 0)} total executions
          </div>
        </div>
      )}
    </div>
  );
}
