'use client';

import { useState, useRef, useCallback } from 'react';
import { Sparkles, Square, Play } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useToastStore } from '@/stores/toastStore';
import { PlannerChat } from './PlannerChat';
import { PlannerInput } from './PlannerInput';
import { PlannerBoard } from './PlannerBoard';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';

function EmptyState({ projectSlug }: { projectSlug: string }) {
  const [prompt, setPrompt] = useState('');
  const [starting, setStarting] = useState(false);
  const addToast = useToastStore((s) => s.addToast);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleStart = async () => {
    if (!prompt.trim() || starting) return;
    setStarting(true);
    try {
      const res = await fetch(`${API}/api/planner/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectSlug, prompt: prompt.trim() }),
      });
      const data = await res.json();
      if (!data.ok) {
        addToast(data.error || 'Failed to start planner', 'error');
        setStarting(false);
      }
    } catch {
      addToast('Failed to connect to server', 'error');
      setStarting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleStart();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 animate-fade-in-up px-8">
      {/* Icon */}
      <div className="relative">
        <Sparkles size={36} className="text-accent/20 animate-breathe" />
        <div className="absolute inset-0 blur-[20px] bg-accent/5 rounded-full" />
      </div>

      {/* Title */}
      <div className="flex flex-col items-center gap-1.5 text-center">
        <h2 className="text-lg font-semibold text-text tracking-tight">AI Planner</h2>
        <p className="text-body text-text-muted max-w-[400px] leading-relaxed">
          Describe what you want to build. Claude will discover features, ask questions, and generate plans with tasks.
        </p>
      </div>

      {/* Prompt */}
      <div className="w-full max-w-[520px] flex flex-col gap-3">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="I need a user authentication system with login, signup, password reset, and OAuth for Google and GitHub..."
          className="w-full min-h-[140px] resize-y rounded-lg border border-border/60 bg-surface/40 px-4 py-3
                     text-body text-text placeholder:text-text-muted/30
                     focus:border-accent/30 focus:shadow-[0_0_16px_rgba(99,102,241,0.06)] focus:outline-none
                     transition-all duration-200"
          rows={5}
          autoFocus
        />
        <div className="flex items-center justify-between">
          <span className="text-xxs font-mono text-text-muted/30">Ctrl+Enter to start</span>
          <button
            onClick={handleStart}
            disabled={!prompt.trim() || starting}
            className="inline-flex items-center gap-2 px-5 py-2 text-white text-label font-semibold rounded-md
                       bg-gradient-to-br from-indigo-600 to-indigo-400 relative overflow-hidden
                       before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/15 before:to-transparent before:pointer-events-none
                       transition-all duration-200 ease-out-expo
                       hover:enabled:shadow-[0_0_24px_rgba(99,102,241,0.3)] hover:enabled:-translate-y-px
                       disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {starting ? (
              <>
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play size={13} />
                Start Planning
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActiveHeader() {
  const active = useAppStore((s) => s.planner.active);
  const stats = useAppStore((s) => {
    const items = s.planner.discoveredItems;
    return {
      identified: items.filter((i) => i.status === 'identified' && !i.approvedAs).length,
      planning: items.filter((i) => i.status === 'planning' && !i.approvedAs).length,
      ready: items.filter((i) => i.status === 'ready' && !i.approvedAs).length,
      approved: items.filter((i) => !!i.approvedAs).length,
    };
  });

  const handleStop = async () => {
    await fetch(`${API}/api/planner/stop`, { method: 'POST' });
  };

  return (
    <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border flex-shrink-0
                     bg-gradient-to-b from-bg-subtle to-bg relative
                     after:content-[''] after:absolute after:bottom-0 after:left-[5%] after:right-[5%] after:h-px
                     after:bg-[linear-gradient(90deg,transparent,var(--border-glow),transparent)]">
      <div className="flex items-center gap-2 text-h2 font-semibold">
        <Sparkles size={16} className="text-accent" />
        Planner
        {active && (
          <span className="w-[7px] h-[7px] rounded-full bg-success animate-breathe shadow-[0_0_8px_rgba(52,211,153,0.4)]" />
        )}
      </div>

      {/* Stats pills */}
      <div className="flex items-center gap-1.5 ml-2">
        {stats.identified > 0 && (
          <span className="text-[9px] font-mono text-text-muted/50 bg-surface px-1.5 py-0.5 rounded">{stats.identified} found</span>
        )}
        {stats.planning > 0 && (
          <span className="text-[9px] font-mono text-accent/70 bg-accent/5 px-1.5 py-0.5 rounded">{stats.planning} planning</span>
        )}
        {stats.ready > 0 && (
          <span className="text-[9px] font-mono text-emerald-400/70 bg-emerald-500/5 px-1.5 py-0.5 rounded">{stats.ready} ready</span>
        )}
        {stats.approved > 0 && (
          <span className="text-[9px] font-mono text-emerald-400/50 bg-emerald-500/5 px-1.5 py-0.5 rounded">&#x2713; {stats.approved}</span>
        )}
      </div>

      <div className="flex-1" />

      {active && (
        <button
          onClick={handleStop}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[rgba(248,113,113,0.2)] text-danger text-label font-semibold rounded-sm
                     transition-all duration-150 ease-out-expo hover:bg-danger-dim"
        >
          <Square size={12} /> Stop
        </button>
      )}
    </div>
  );
}

export function PlannerView({ projectSlug }: { projectSlug: string }) {
  const active = useAppStore((s) => s.planner.active);
  const messages = useAppStore((s) => s.planner.messages);
  const escalation = useAppStore((s) => s.planner.escalation);
  const addToast = useToastStore((s) => s.addToast);

  const hasSession = active || messages.length > 0;

  const handleRespondToEscalation = useCallback(async (response: string) => {
    if (!escalation) return;
    try {
      await fetch(`${API}/api/escalation/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: escalation.id, response }),
      });
      useAppStore.getState().onPlannerEscalationResponded(response);
      addToast('Response sent', 'success');
    } catch {
      addToast('Failed to send response', 'error');
    }
  }, [escalation, addToast]);

  // Empty state — no session started
  if (!hasSession) {
    return <EmptyState projectSlug={projectSlug} />;
  }

  // Active session — split layout
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ActiveHeader />

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Chat */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-border/50">
          <PlannerChat onRespondToEscalation={handleRespondToEscalation} />
          <PlannerInput onRespondToEscalation={handleRespondToEscalation} />
        </div>

        {/* Right: Discovery Board */}
        <div className="w-[300px] flex-shrink-0 overflow-hidden bg-bg-subtle/30">
          <PlannerBoard projectSlug={projectSlug} />
        </div>
      </div>
    </div>
  );
}
