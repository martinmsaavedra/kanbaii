'use client';

/**
 * Living Room — Multi-agent coordination view.
 * ALL execution state comes from useAppStore (REGLA #1).
 * This component is a PURE VIEW of the store. No local execution state.
 */

import { useEffect, useState, useRef } from 'react';
import { Users, Play, Square, Zap } from 'lucide-react';
import { useWorkItemStore } from '@/stores/workItemStore';
import { useAppStore } from '@/stores/appStore';
import { useToastStore } from '@/stores/toastStore';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';

export function LivingRoom({ projectSlug }: { projectSlug: string }) {
  const { workItems, fetchWorkItems } = useWorkItemStore();
  const teams = useAppStore((s) => s.teams);
  const addToast = useToastStore((s) => s.addToast);

  // Only local state: UI config (not execution state)
  const [selectedWIs, setSelectedWIs] = useState<string[]>([]);
  const [maxWorkers, setMaxWorkers] = useState(3);
  const logsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchWorkItems(projectSlug); }, [projectSlug, fetchWorkItems]);

  // Auto-scroll logs
  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [teams.logs]);

  // Show work items that have ANY pending tasks (not done)
  const countPendingTasks = (wi: typeof workItems[0]) =>
    (wi.columns['backlog']?.length || 0) + (wi.columns['todo']?.length || 0) +
    (wi.columns['in-progress']?.length || 0) + (wi.columns['review']?.length || 0);

  const runnableWIs = workItems.filter((wi) => countPendingTasks(wi) > 0);

  const toggleWI = (slug: string) => {
    setSelectedWIs((s) => s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]);
  };

  const handleStart = async () => {
    if (selectedWIs.length === 0) { addToast('Select work items first', 'error'); return; }
    try {
      await fetch(`${API}/api/teams/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectSlug, workItemSlugs: selectedWIs, maxWorkers }),
      });
    } catch { addToast('Failed to start', 'error'); }
  };

  const handleStop = async () => {
    await fetch(`${API}/api/teams/stop`, { method: 'POST' });
  };

  const totalPending = selectedWIs.reduce((sum, slug) => {
    const wi = workItems.find((w) => w.slug === slug);
    return sum + (wi ? countPendingTasks(wi) : 0);
  }, 0);

  const activeWorkers = teams.workers.filter((w) => w.status === 'running');
  const completedWorkers = teams.workers.filter((w) => w.status !== 'running');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border shrink-0 bg-gradient-to-b from-bg-subtle to-bg relative after:content-[''] after:absolute after:bottom-0 after:left-[5%] after:right-[5%] after:h-px after:bg-gradient-to-r after:from-transparent after:via-border-glow after:to-transparent">
        <div className="text-[15px] font-semibold tracking-tight flex items-center gap-2">
          <Users size={18} />
          Living Room
          {teams.active && <span className="w-[7px] h-[7px] rounded-full bg-success animate-breathe shadow-[0_0_8px_rgba(52,211,153,0.4)]" />}
        </div>
        <div className="flex-1" />
        {teams.active ? (
          <button
            className="inline-flex items-center gap-[5px] px-4 py-[7px] border border-[rgba(248,113,113,0.2)] text-danger text-xs font-semibold rounded-sm transition-all duration-150 ease-out-expo hover:bg-danger-dim hover:shadow-[0_0_16px_rgba(248,113,113,0.08)]"
            onClick={handleStop}
          >
            <Square size={14} /> Stop
          </button>
        ) : (
          <button
            className="inline-flex items-center gap-1.5 px-[18px] py-[7px] bg-gradient-to-br from-emerald-600 to-emerald-400 text-white text-xs font-semibold rounded-sm transition-all duration-150 ease-out-expo relative overflow-hidden before:content-[''] before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/15 before:to-transparent before:pointer-events-none hover:shadow-[0_0_24px_rgba(52,211,153,0.25)] hover:-translate-y-px disabled:opacity-25 disabled:cursor-not-allowed disabled:saturate-50"
            onClick={handleStart}
            disabled={selectedWIs.length === 0}
          >
            <Play size={14} /> Start Teams ({totalPending} tasks)
          </button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Config */}
        <div className="w-60 shrink-0 border-r border-border p-3 overflow-y-auto bg-bg-subtle">
          <div className="text-xxs font-semibold text-text-muted uppercase tracking-[0.1em] font-mono mb-2.5">Work Items</div>
          <div className="flex flex-col gap-[3px]">
            {runnableWIs.length === 0 ? (
              <div className="text-text-muted text-data text-center py-8 px-4 font-mono tracking-wide opacity-40">No pending work items</div>
            ) : (
              runnableWIs.map((wi) => (
                <label key={wi.slug} className="flex items-center gap-2 py-[7px] px-2 rounded-sm text-xs text-text-secondary cursor-pointer transition-all duration-150 ease-out-expo border border-transparent hover:bg-surface-hover hover:border-border">
                  <input
                    type="checkbox"
                    checked={selectedWIs.includes(wi.slug)}
                    onChange={() => toggleWI(wi.slug)}
                    disabled={teams.active}
                    className="accent-accent w-3.5 h-3.5"
                  />
                  <span>{wi.title}</span>
                  <span className="ml-auto text-xxs text-text-muted bg-pill px-1.5 py-0.5 rounded-xs font-mono border border-[rgba(148,163,242,0.04)]">{countPendingTasks(wi)}</span>
                </label>
              ))
            )}
          </div>

          <div className="text-xxs font-semibold text-text-muted uppercase tracking-[0.1em] font-mono mb-2.5 mt-4">Workers</div>
          <div className="flex items-center gap-2 mt-1">
            <input type="range" min={1} max={10} value={maxWorkers} onChange={(e) => setMaxWorkers(Number(e.target.value))} disabled={teams.active} className="flex-1 accent-accent h-[3px]" />
            <span className="text-base font-bold text-accent min-w-[24px] text-center font-mono shadow-[0_0_12px_var(--accent-glow)]">{maxWorkers}</span>
          </div>

          {teams.metrics && (
            <div className="mt-4 p-3 bg-bg border border-border rounded-md shadow-inset">
              <div className="text-xxs font-semibold text-text-muted uppercase tracking-[0.1em] font-mono mb-2.5">Metrics</div>
              <div className="flex justify-between text-label text-text-secondary py-[3px] font-mono"><span>Active</span><span>{teams.metrics.activeWorkers}</span></div>
              <div className="flex justify-between text-label text-text-secondary py-[3px] font-mono"><span className="text-success">Completed</span><span>{teams.metrics.totalCompleted}</span></div>
              <div className="flex justify-between text-label text-text-secondary py-[3px] font-mono"><span className="text-danger">Failed</span><span>{teams.metrics.totalFailed}</span></div>
              <div className="flex justify-between text-label text-text-secondary py-[3px] font-mono"><span>Total</span><span>{teams.metrics.totalTasks}</span></div>
              <div className="h-[3px] rounded-[3px] bg-[rgba(148,163,242,0.06)] overflow-hidden mt-2.5">
                <div
                  className="h-full rounded-[3px] transition-[width] duration-[800ms] ease-out-expo"
                  style={{
                    width: `${teams.metrics.totalTasks > 0 ? ((teams.metrics.totalCompleted + teams.metrics.totalFailed) / teams.metrics.totalTasks) * 100 : 0}%`,
                    background: 'var(--accent-gradient)',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Center: Worker Pool */}
        <div className="flex-1 p-5 overflow-y-auto">
          <div className="text-xxs font-semibold text-text-muted uppercase tracking-[0.1em] font-mono mb-2.5">Worker Pool</div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
            {Array.from({ length: maxWorkers }).map((_, i) => {
              const worker = activeWorkers[i];
              return (
                <div
                  key={i}
                  className={`bg-card border rounded-md px-4 py-5 min-h-[90px] flex flex-col items-center justify-center gap-2 transition-all duration-300 ease-out-expo relative overflow-hidden before:content-[''] before:absolute before:top-0 before:left-[15%] before:right-[15%] before:h-px before:bg-gradient-to-r before:from-transparent before:via-[rgba(255,255,255,0.02)] before:to-transparent before:pointer-events-none ${
                    worker
                      ? 'border-[rgba(99,102,241,0.2)] bg-[rgba(99,102,241,0.03)] animate-running-glow shadow-[0_0_20px_rgba(99,102,241,0.15)] before:!via-[rgba(99,102,241,0.12)]'
                      : 'border-border'
                  }`}
                >
                  {worker ? (
                    <>
                      <Zap size={14} className="text-accent animate-breathe drop-shadow-[0_0_6px_var(--accent-glow)]" />
                      <div className="text-label font-medium text-text text-center overflow-hidden text-ellipsis whitespace-nowrap max-w-full tracking-tight">{worker.taskTitle}</div>
                      <div className="text-xxs text-text-muted font-mono">{worker.agentName || 'Default'}</div>
                    </>
                  ) : (
                    <div className="text-data text-text-muted opacity-35 font-mono tracking-wide">Idle</div>
                  )}
                </div>
              );
            })}
          </div>

          {completedWorkers.length > 0 && (
            <>
              <div className="text-xxs font-semibold text-text-muted uppercase tracking-[0.1em] font-mono mb-2.5 mt-4">Completed</div>
              <div className="flex flex-col gap-[3px]">
                {completedWorkers.map((w) => (
                  <div key={w.id} className={`flex items-center gap-1.5 text-label text-text-secondary py-1 font-mono ${w.status === 'failed' ? 'text-danger' : ''}`}>
                    <span>{w.status === 'completed' ? '\u2713' : '\u2717'}</span>
                    <span>{w.taskTitle}</span>
                    <span className="ml-auto text-xxs text-text-muted">{w.agentName || ''}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right: Logs */}
        <div className="w-[280px] shrink-0 border-l border-border p-3 flex flex-col bg-bg-subtle">
          <div className="text-xxs font-semibold text-text-muted uppercase tracking-[0.1em] font-mono mb-2.5">Execution Logs</div>
          <div ref={logsRef} className="flex-1 overflow-y-auto bg-bg border border-border rounded-md px-3 py-2.5 font-mono text-data leading-[1.65] text-text-muted shadow-inset">
            {teams.logs.length === 0 ? (
              <div className="text-text-muted text-data text-center py-8 px-4 font-mono tracking-wide opacity-40">Logs will appear here...</div>
            ) : (
              teams.logs.map((line, i) => <div key={i} className="whitespace-pre-wrap break-all">{line}</div>)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
