'use client';

import { useEffect, useState, useCallback } from 'react';
import { BarChart3, DollarSign, Zap, Clock, Trash2 } from 'lucide-react';
import { useToastStore } from '@/stores/toastStore';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';

interface CostSummary {
  totalCost: number; totalTokens: number; totalExecutions: number;
  byModel: Record<string, { cost: number; tokens: number; count: number }>;
  todayCost: number; todayTokens: number; todayExecutions: number;
  monthlyCost: number; monthlyTokens: number; monthlyExecutions: number;
}

interface ExecutionRecord {
  id: string; timestamp: string; projectSlug: string; taskTitle?: string;
  model: string; duration: number; inputTokens: number; outputTokens: number;
  costUsd: number; status: string;
}

type TimeRange = '7d' | '30d' | 'all';

function formatCost(usd: number): string {
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return `${n}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function CostsPanel({ projectSlug }: { projectSlug?: string }) {
  const addToast = useToastStore((s) => s.addToast);
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [range, setRange] = useState<TimeRange>('30d');
  const [scope, setScope] = useState<'project' | 'global'>(projectSlug ? 'project' : 'global');

  const fetchData = useCallback(async () => {
    const slug = scope === 'project' && projectSlug ? projectSlug : undefined;
    const days = range === '7d' ? 7 : range === '30d' ? 30 : undefined;
    const [s, e] = await Promise.all([
      fetch(`${API}/api/costs/summary${slug ? `?projectSlug=${slug}` : ''}`).then(r => r.json()).catch(() => ({ data: null })),
      fetch(`${API}/api/costs/executions?limit=50${slug ? `&projectSlug=${slug}` : ''}${days ? `&days=${days}` : ''}`).then(r => r.json()).catch(() => ({ data: [] })),
    ]);
    setSummary(s.data || null);
    setExecutions(e.data || []);
  }, [projectSlug, scope, range]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleClear = async () => {
    const slug = scope === 'project' && projectSlug ? `?projectSlug=${projectSlug}` : '';
    await fetch(`${API}/api/costs/clear${slug}`, { method: 'DELETE' });
    addToast('Execution history cleared', 'info');
    fetchData();
  };

  const MODEL_COLORS: Record<string, string> = { opus: '#a855f7', sonnet: '#6366f1', haiku: '#22c55e' };

  return (
    <div className="flex flex-col h-full overflow-y-auto gap-5 p-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-h2 font-semibold tracking-tight flex items-center gap-2">
          <BarChart3 size={18} /> Costs & Analytics
        </div>
        <div className="flex gap-2">
          {projectSlug && (
            <div className="flex border border-border rounded-sm overflow-hidden">
              <button
                className={`px-2.5 py-1 text-xxs font-semibold font-mono tracking-wide uppercase text-text-muted transition-all duration-150 ease-out-expo hover:text-text-secondary hover:bg-surface-hover ${scope === 'project' ? 'text-accent bg-accent-muted' : ''}`}
                onClick={() => setScope('project')}
              >Project</button>
              <button
                className={`px-2.5 py-1 text-xxs font-semibold font-mono tracking-wide uppercase text-text-muted transition-all duration-150 ease-out-expo hover:text-text-secondary hover:bg-surface-hover ${scope === 'global' ? 'text-accent bg-accent-muted' : ''}`}
                onClick={() => setScope('global')}
              >Global</button>
            </div>
          )}
          <div className="flex border border-border rounded-sm overflow-hidden">
            {(['7d', '30d', 'all'] as TimeRange[]).map(r => (
              <button
                key={r}
                className={`px-2.5 py-1 text-xxs font-semibold font-mono tracking-wide uppercase text-text-muted transition-all duration-150 ease-out-expo hover:text-text-secondary hover:bg-surface-hover ${range === r ? 'text-accent bg-accent-muted' : ''}`}
                onClick={() => setRange(r)}
              >{r}</button>
            ))}
          </div>
        </div>
      </div>

      {summary && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-2 max-md:grid-cols-2">
            <div className="p-4 border border-border rounded-md bg-card text-center relative overflow-hidden">
              <div className="text-accent mb-1.5 flex justify-center"><DollarSign size={14} /></div>
              <div className="text-h1 font-bold text-text font-mono tracking-tight">{formatCost(summary.todayCost)}</div>
              <div className="text-xxs font-semibold text-text-muted uppercase tracking-widest font-mono mt-1">Today</div>
            </div>
            <div className="p-4 border border-border rounded-md bg-card text-center relative overflow-hidden">
              <div className="text-accent mb-1.5 flex justify-center"><DollarSign size={14} /></div>
              <div className="text-h1 font-bold text-text font-mono tracking-tight">{formatCost(summary.monthlyCost)}</div>
              <div className="text-xxs font-semibold text-text-muted uppercase tracking-widest font-mono mt-1">This Month</div>
            </div>
            <div className="p-4 border border-border rounded-md bg-card text-center relative overflow-hidden">
              <div className="text-accent mb-1.5 flex justify-center"><Zap size={14} /></div>
              <div className="text-h1 font-bold text-text font-mono tracking-tight">{formatTokens(summary.monthlyTokens)}</div>
              <div className="text-xxs font-semibold text-text-muted uppercase tracking-widest font-mono mt-1">Tokens (Month)</div>
            </div>
            <div className="p-4 border border-border rounded-md bg-card text-center relative overflow-hidden">
              <div className="text-accent mb-1.5 flex justify-center"><Clock size={14} /></div>
              <div className="text-h1 font-bold text-text font-mono tracking-tight">{summary.monthlyExecutions}</div>
              <div className="text-xxs font-semibold text-text-muted uppercase tracking-widest font-mono mt-1">Executions (Month)</div>
            </div>
          </div>

          {/* Model Breakdown */}
          {Object.keys(summary.byModel).length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono">Model Breakdown</div>
              <div className="flex flex-col gap-1.5">
                {Object.entries(summary.byModel).map(([model, data]) => (
                  <div key={model} className="flex items-center gap-2.5 px-3 py-2.5 border border-border rounded-sm bg-card">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: MODEL_COLORS[model] || '#6366f1' }} />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-text">{model}</span>
                      <span className="text-data text-text-muted font-mono ml-2">{data.count} runs — {formatCost(data.cost)}</span>
                    </div>
                    <div className="w-20 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(148, 163, 242, 0.06)' }}>
                      <div
                        className="h-full rounded-full transition-[width] duration-500 ease-out-expo"
                        style={{
                          width: `${summary.totalExecutions > 0 ? (data.count / summary.totalExecutions) * 100 : 0}%`,
                          background: MODEL_COLORS[model] || '#6366f1',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Execution Table */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono">Recent Executions</div>
          <button
            className="inline-flex items-center gap-[3px] text-xxs text-text-muted px-2 py-[3px] rounded-xs font-mono border border-border transition-all duration-120 ease-out-expo hover:text-danger hover:border-danger-dim"
            onClick={handleClear}
          >
            <Trash2 size={10} /> Clear
          </button>
        </div>
        {executions.length === 0 ? (
          <div className="text-text-muted text-label text-center py-8 font-mono opacity-50">No executions recorded yet</div>
        ) : (
          <div className="border border-border rounded-md overflow-hidden bg-card">
            <div className="grid grid-cols-[1fr_70px_70px_60px_40px] px-3.5 py-2 text-xxs font-semibold text-text-muted uppercase tracking-wide font-mono border-b border-border bg-bg-subtle">
              <span>Task</span><span>Model</span><span>Duration</span><span>Cost</span><span>Status</span>
            </div>
            {executions.map(e => (
              <div key={e.id} className="grid grid-cols-[1fr_70px_70px_60px_40px] px-3.5 py-2 text-label border-b border-b-[rgba(148,163,242,0.03)] last:border-b-0 transition-colors duration-120 ease-out-expo hover:bg-surface-hover">
                <span className="text-text overflow-hidden text-ellipsis whitespace-nowrap">{e.taskTitle || e.projectSlug}</span>
                <span className="font-mono text-data font-semibold" style={{ color: MODEL_COLORS[e.model] || '#6366f1' }}>{e.model}</span>
                <span className="text-text-muted font-mono text-data">{formatDuration(e.duration)}</span>
                <span className="text-text-secondary font-mono text-data font-medium">{formatCost(e.costUsd)}</span>
                <span className={`text-center ${e.status === 'success' ? 'text-success' : 'text-danger'}`}>{e.status === 'success' ? '✓' : '✗'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
