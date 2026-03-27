'use client';

import { useCallback } from 'react';
import { Cpu, Play, Square, Pause, RotateCcw } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useToastStore } from '@/stores/toastStore';
import { useWorkItemStore } from '@/stores/workItemStore';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';

export function RalphView({ projectSlug, wiSlug }: { projectSlug: string; wiSlug: string }) {
  const ralph = useAppStore((s) => s.ralph);
  const addToast = useToastStore((s) => s.addToast);
  const { workItems } = useWorkItemStore();

  const wi = workItems.find((w) => w.slug === wiSlug || w.id === wiSlug);
  const todoCount = wi?.columns['todo']?.length || 0;
  const isRunning = ralph.status === 'running' || ralph.status === 'paused';
  const isForThisWI = ralph.workItemSlug === wiSlug || ralph.projectSlug === projectSlug;

  const handleStart = useCallback(async () => {
    try {
      await fetch(`${API}/api/ralph/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectSlug, workItemSlug: wiSlug }),
      });
      addToast('Ralph started', 'success');
    } catch { addToast('Failed to start', 'error'); }
  }, [projectSlug, wiSlug, addToast]);

  const handleStop = useCallback(async () => {
    await fetch(`${API}/api/ralph/stop`, { method: 'POST' });
  }, []);

  const handlePause = useCallback(async () => {
    await fetch(`${API}/api/ralph/pause`, { method: 'POST' });
  }, []);

  const handleResume = useCallback(async () => {
    await fetch(`${API}/api/ralph/resume`, { method: 'POST' });
  }, []);

  const progress = ralph.stats.total > 0
    ? ((ralph.stats.completed + ralph.stats.failed) / ralph.stats.total) * 100
    : 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0 bg-gradient-to-b from-bg-subtle to-bg
                       relative after:content-[''] after:absolute after:bottom-0 after:left-[5%] after:right-[5%] after:h-px
                       after:bg-[linear-gradient(90deg,transparent,var(--border-glow),transparent)]">
        <div className="text-h2 font-semibold flex items-center gap-2">
          <Cpu size={18} />
          Ralph
          {isRunning && isForThisWI && (
            <span className="w-[7px] h-[7px] rounded-full bg-success animate-breathe shadow-[0_0_8px_rgba(52,211,153,0.4)]" />
          )}
        </div>
        <div className="flex-1" />

        {/* Controls */}
        {isRunning && isForThisWI ? (
          <div className="flex gap-1.5">
            {ralph.status === 'paused' ? (
              <button className="btn-primary" onClick={handleResume}>
                <Play size={14} /> Resume
              </button>
            ) : (
              <button className="btn-ghost" onClick={handlePause}>
                <Pause size={14} /> Pause
              </button>
            )}
            <button
              className="inline-flex items-center gap-[5px] px-3.5 py-1.5 border border-[rgba(248,113,113,0.2)] text-danger text-label font-semibold rounded-sm transition-all duration-150 ease-out-expo hover:bg-danger-dim"
              onClick={handleStop}
            >
              <Square size={14} /> Stop
            </button>
          </div>
        ) : (
          <button
            className="inline-flex items-center gap-[5px] px-4 py-1.5 text-white text-label font-semibold rounded-sm
                        bg-gradient-to-br from-emerald-600 to-emerald-400 relative overflow-hidden
                        before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/15 before:to-transparent before:pointer-events-none
                        transition-all duration-150 ease-out-expo
                        hover:enabled:shadow-[0_0_20px_rgba(52,211,153,0.25)] hover:enabled:-translate-y-px
                        disabled:opacity-20 disabled:cursor-not-allowed"
            onClick={handleStart}
            disabled={todoCount === 0}
          >
            <Play size={14} /> Run ({todoCount} tasks)
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Status panel */}
        <div className="w-[320px] shrink-0 border-r border-border p-5 overflow-y-auto bg-bg-subtle flex flex-col gap-4">
          {/* Progress */}
          <div className="p-4 bg-bg border border-border rounded-md shadow-inset">
            <div className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono mb-3">Progress</div>
            <div className="h-[4px] rounded-full bg-[rgba(148,163,242,0.06)] overflow-hidden mb-3">
              <div
                className="h-full rounded-full transition-[width] duration-[800ms] ease-out-expo"
                style={{ width: `${progress}%`, background: 'var(--accent-gradient)' }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-lg font-bold text-success font-mono">{ralph.stats.completed}</div>
                <div className="text-xxs text-text-muted font-mono uppercase">Done</div>
              </div>
              <div>
                <div className="text-lg font-bold text-danger font-mono">{ralph.stats.failed}</div>
                <div className="text-xxs text-text-muted font-mono uppercase">Failed</div>
              </div>
              <div>
                <div className="text-lg font-bold text-text font-mono">{ralph.stats.total}</div>
                <div className="text-xxs text-text-muted font-mono uppercase">Total</div>
              </div>
            </div>
          </div>

          {/* Current task */}
          {ralph.currentTaskTitle && (
            <div className="p-3 bg-bg border border-border rounded-md">
              <div className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono mb-2">Current Task</div>
              <div className="text-body text-accent font-mono animate-breathe">{ralph.currentTaskTitle}</div>
            </div>
          )}

          {/* Status */}
          <div className="p-3 bg-bg border border-border rounded-md">
            <div className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono mb-2">Status</div>
            <span className={`text-xxs font-semibold font-mono tracking-wide uppercase px-2 py-0.5 rounded-full
              ${ralph.status === 'running' ? 'text-success bg-success-dim border border-[rgba(52,211,153,0.15)]' :
                ralph.status === 'paused' ? 'text-warning bg-warning-dim border border-[rgba(251,191,36,0.15)]' :
                'text-text-muted bg-pill border border-border'}`}>
              {ralph.status}
            </span>
          </div>
        </div>

        {/* Output panel */}
        <div className="flex-1 flex flex-col p-5 overflow-hidden">
          <div className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono mb-2">Output</div>
          <div className="flex-1 overflow-y-auto bg-bg border border-border rounded-md p-3 px-4
                          font-mono text-data leading-relaxed text-text-muted
                          shadow-[inset_0_1px_4px_rgba(0,0,0,0.15)]">
            {ralph.output.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 opacity-30">
                <Cpu size={28} />
                <span className="text-label font-mono">Waiting for output...</span>
              </div>
            ) : (
              ralph.output.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
