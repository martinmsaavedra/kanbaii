'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Users, Play, Square, Zap, Plus, Trash2, X, Sparkles, Settings, Bot, Wrench, Radio, Brain, MessageSquare, ChevronRight, ChevronDown, Terminal, CheckCircle2 } from 'lucide-react';
import { useWorkItemStore } from '@/stores/workItemStore';
import { useAppStore } from '@/stores/appStore';
import { useToastStore } from '@/stores/toastStore';
import { useModalOverlay } from '@/hooks/useModalOverlay';
import { ConfigPanel } from './ConfigPanel';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';

interface Agent {
  name: string; description: string; model: string; skills: string[];
  tools: string[]; instructions: string; builtIn: boolean;
}

type SidePanel = 'agents' | 'config' | null;

export function TeamsView({ projectSlug }: { projectSlug: string }) {
  const { workItems, fetchWorkItems } = useWorkItemStore();
  const teams = useAppStore((s) => s.teams);
  const addToast = useToastStore((s) => s.addToast);

  const [selectedWIs, setSelectedWIs] = useState<string[]>([]);
  const [maxWorkers, setMaxWorkers] = useState(3);
  const [teamsModel, setTeamsModel] = useState('sonnet');
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [expandedWorkerId, setExpandedWorkerId] = useState<string | null>(null);
  const thinkingRef = useRef<HTMLDivElement>(null);
  const logsRef = useRef<HTMLDivElement>(null);
  const workerLogRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchWorkItems(projectSlug); }, [projectSlug, fetchWorkItems]);
  useEffect(() => { fetchAgents(); }, []);
  useEffect(() => {
    if (thinkingRef.current) thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
  }, [teams.coordinatorThinking]);
  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [teams.logs]);
  useEffect(() => {
    if (workerLogRef.current) workerLogRef.current.scrollTop = workerLogRef.current.scrollHeight;
  }, [expandedWorkerId, teams.workerLogs]);

  // Toast notification when coordinator completes
  const prevStatusRef = useRef(teams.coordinatorStatus);
  useEffect(() => {
    if (prevStatusRef.current !== 'completed' && teams.coordinatorStatus === 'completed' && teams.completionMessage) {
      addToast(teams.completionMessage, 'success');
    }
    prevStatusRef.current = teams.coordinatorStatus;
  }, [teams.coordinatorStatus, teams.completionMessage, addToast]);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/agents`);
      const data = await res.json();
      if (data.ok) setAgents(data.data);
    } catch {}
  }, []);

  const runnableWIs = workItems.filter((wi) => wi.columns['todo']?.length > 0);

  const toggleWI = (slug: string) => {
    setSelectedWIs((s) => s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]);
  };

  const totalTodo = selectedWIs.reduce((sum, slug) => {
    const wi = workItems.find((w) => w.slug === slug);
    return sum + (wi?.columns['todo']?.length || 0);
  }, 0);

  const handleStart = async () => {
    if (selectedWIs.length === 0) { addToast('Select work items first', 'error'); return; }
    try {
      await fetch(`${API}/api/teams/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectSlug, workItemSlugs: selectedWIs, maxWorkers, model: teamsModel }),
      });
    } catch { addToast('Failed to start', 'error'); }
  };

  const handleStop = async () => {
    await fetch(`${API}/api/teams/stop`, { method: 'POST' });
  };

  const handleDeleteAgent = async (name: string) => {
    await fetch(`${API}/api/agents/${name}`, { method: 'DELETE' });
    fetchAgents();
    addToast(`${name} deleted`, 'success');
    if (selectedAgent?.name === name) setSelectedAgent(null);
  };

  const activeWorkers = teams.workers.filter((w) => w.status === 'running');
  const completedWorkers = teams.workers.filter((w) => w.status !== 'running');
  const hasThinking = teams.coordinatorThinking.length > 0;
  const lastToolCalls = teams.coordinatorToolCalls.slice(-8);

  const isCompleted = teams.coordinatorStatus === 'completed';
  const statusLabel = teams.coordinatorStatus === 'thinking' ? 'Thinking...'
    : teams.coordinatorStatus === 'calling-tool' ? 'Calling tool...'
    : teams.coordinatorStatus === 'waiting' ? 'Waiting...'
    : isCompleted ? 'Completed'
    : teams.active ? 'Active' : 'Idle';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ═══ Header ═══ */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0 bg-gradient-to-b from-bg-subtle to-bg
                       relative after:content-[''] after:absolute after:bottom-0 after:left-[5%] after:right-[5%] after:h-px
                       after:bg-[linear-gradient(90deg,transparent,var(--border-glow),transparent)]">
        <div className="text-h2 font-semibold flex items-center gap-2">
          <Users size={18} />
          Teams
          {teams.active && <span className="w-[7px] h-[7px] rounded-full bg-success animate-breathe shadow-[0_0_8px_rgba(52,211,153,0.4)]" />}
          {isCompleted && <span className="w-[7px] h-[7px] rounded-full bg-success shadow-[0_0_8px_rgba(52,211,153,0.4)]" />}
        </div>
        <div className="flex-1" />

        {/* Side panel toggles */}
        <button
          className={`btn-ghost ${sidePanel === 'agents' ? '!text-accent !border-accent/20 !bg-accent-muted' : ''}`}
          onClick={() => setSidePanel(sidePanel === 'agents' ? null : 'agents')}
        >
          <Bot size={14} /> Agents
        </button>
        <button
          className={`btn-ghost ${sidePanel === 'config' ? '!text-accent !border-accent/20 !bg-accent-muted' : ''}`}
          onClick={() => setSidePanel(sidePanel === 'config' ? null : 'config')}
        >
          <Settings size={14} /> Config
        </button>

        {/* Start/Stop */}
        {teams.active ? (
          <button
            className="inline-flex items-center gap-[5px] px-4 py-[7px] border border-[rgba(248,113,113,0.2)] text-danger text-xs font-semibold rounded-sm transition-all duration-150 ease-out-expo hover:bg-danger-dim"
            onClick={handleStop}
          >
            <Square size={14} /> Stop
          </button>
        ) : (
          <button
            className="inline-flex items-center gap-1.5 px-[18px] py-[7px] bg-gradient-to-br from-emerald-600 to-emerald-400 text-white text-xs font-semibold rounded-sm transition-all duration-150 ease-out-expo relative overflow-hidden
                        before:content-[''] before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/15 before:to-transparent before:pointer-events-none
                        hover:shadow-[0_0_24px_rgba(52,211,153,0.25)] hover:-translate-y-px disabled:opacity-25 disabled:cursor-not-allowed"
            onClick={handleStart}
            disabled={selectedWIs.length === 0}
          >
            <Play size={14} /> Start ({totalTodo} tasks)
          </button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ═══ Left: Config + Work Item Selection ═══ */}
        <div className="w-56 shrink-0 border-r border-border overflow-y-auto bg-bg-subtle p-3 flex flex-col gap-4">
          {/* Work Items */}
          <div>
            <div className="text-xxs font-semibold text-text-muted uppercase tracking-[0.1em] font-mono mb-2">Work Items</div>
            <div className="flex flex-col gap-px">
              {runnableWIs.length === 0 ? (
                <div className="text-text-muted text-data text-center py-6 font-mono opacity-40">No tasks in To Do</div>
              ) : (
                runnableWIs.map((wi) => (
                  <label key={wi.slug} className="flex items-center gap-2 py-[6px] px-2 rounded-sm text-xs text-text-secondary cursor-pointer transition-all duration-150 hover:bg-surface-hover">
                    <input type="checkbox" checked={selectedWIs.includes(wi.slug)} onChange={() => toggleWI(wi.slug)} disabled={teams.active} className="accent-accent w-3.5 h-3.5" />
                    <span className="flex-1 truncate">{wi.title}</span>
                    <span className="text-xxs text-text-muted bg-pill px-1 py-0.5 rounded-xs font-mono">{wi.columns['todo']?.length || 0}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Workers slider */}
          <div>
            <div className="text-xxs font-semibold text-text-muted uppercase tracking-[0.1em] font-mono mb-2">Workers</div>
            <div className="flex items-center gap-2">
              <input type="range" min={1} max={10} value={maxWorkers} onChange={(e) => setMaxWorkers(Number(e.target.value))} disabled={teams.active} className="flex-1 accent-accent h-[3px]" />
              <span className="text-base font-bold text-accent min-w-[24px] text-center font-mono">{maxWorkers}</span>
            </div>
          </div>

          {/* Model */}
          <div>
            <div className="text-xxs font-semibold text-text-muted uppercase tracking-[0.1em] font-mono mb-2">Coordinator Model</div>
            <div className="flex gap-1">
              {['haiku', 'sonnet', 'opus'].map(m => (
                <button
                  key={m}
                  className={`flex-1 py-1.5 text-xxs font-semibold rounded-sm font-mono tracking-wide uppercase transition-all duration-150
                    ${teamsModel === m
                      ? 'text-accent bg-accent-muted border border-accent/20'
                      : 'text-text-muted border border-border hover:text-text-secondary hover:bg-surface-hover'
                    }`}
                  onClick={() => setTeamsModel(m)}
                  disabled={teams.active}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Metrics */}
          {teams.metrics && (
            <div className="p-3 bg-bg border border-border rounded-md shadow-inset">
              <div className="text-xxs font-semibold text-text-muted uppercase tracking-[0.1em] font-mono mb-2">Metrics</div>
              <div className="flex justify-between text-label text-text-secondary py-0.5 font-mono"><span>Active</span><span>{teams.metrics.activeWorkers}</span></div>
              <div className="flex justify-between text-label text-text-secondary py-0.5 font-mono"><span className="text-success">Done</span><span>{teams.metrics.totalCompleted}</span></div>
              <div className="flex justify-between text-label text-text-secondary py-0.5 font-mono"><span className="text-danger">Failed</span><span>{teams.metrics.totalFailed}</span></div>
              <div className="flex justify-between text-label text-text-secondary py-0.5 font-mono"><span>Total</span><span>{teams.metrics.totalTasks}</span></div>
              <div className="h-[3px] rounded-full bg-[rgba(148,163,242,0.06)] overflow-hidden mt-2">
                <div className="h-full rounded-full transition-[width] duration-[800ms] ease-out-expo" style={{
                  width: `${teams.metrics.totalTasks > 0 ? ((teams.metrics.totalCompleted + teams.metrics.totalFailed) / teams.metrics.totalTasks) * 100 : 0}%`,
                  background: 'var(--accent-gradient)',
                }} />
              </div>
            </div>
          )}
        </div>

        {/* ═══ Center: Coordinator Brain (top) + Activity Log (bottom) ═══ */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* ─── Coordinator Brain (top — main focus) ─── */}
          <div className="flex-[3] min-h-0 flex flex-col p-4 overflow-hidden border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <Brain size={14} className={teams.active ? 'text-accent animate-breathe' : isCompleted ? 'text-success' : 'text-text-muted'} />
              <span className="text-xs font-semibold text-text uppercase tracking-[0.08em] font-mono">Coordinator</span>
              {(teams.active || isCompleted) && (
                <span className={`flex items-center gap-1.5 text-xxs font-mono font-medium ml-2 px-2 py-0.5 rounded-full border
                  ${isCompleted
                    ? 'text-success bg-success-dim border-success/20'
                    : teams.coordinatorStatus === 'thinking'
                    ? 'text-accent bg-accent-muted border-accent/20 animate-breathe'
                    : teams.coordinatorStatus === 'calling-tool'
                    ? 'text-warning bg-warning-dim border-warning/20'
                    : 'text-success bg-success-dim border-success/20 animate-breathe'
                  }`}>
                  {isCompleted
                    ? <CheckCircle2 size={10} className="text-success" />
                    : <span className={`w-1.5 h-1.5 rounded-full ${
                        teams.coordinatorStatus === 'thinking' ? 'bg-accent' :
                        teams.coordinatorStatus === 'calling-tool' ? 'bg-warning' : 'bg-success'
                      }`} />
                  }
                  {statusLabel}
                </span>
              )}
              {activeWorkers.length > 0 && (
                <span className="text-xxs text-success font-mono font-medium ml-auto">
                  {activeWorkers.length} worker{activeWorkers.length > 1 ? 's' : ''} active
                </span>
              )}
            </div>

            <div ref={thinkingRef} className="flex-1 overflow-y-auto bg-[var(--console-bg)] border border-border rounded-md p-4 font-mono text-[11px] leading-[1.8] shadow-[inset_0_2px_6px_rgba(0,0,0,0.3)]">
              {!hasThinking && teams.logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 opacity-20">
                  <Brain size={28} />
                  <span className="text-xs font-mono text-text-muted">
                    {teams.active ? 'Coordinator is starting...' : 'Select work items and start Teams'}
                  </span>
                  {teams.active && (
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Coordinator thinking — primary content */}
                  {teams.coordinatorThinking.map((text, i) => (
                    <div key={i} className="text-text-secondary whitespace-pre-wrap break-words py-px">{text}</div>
                  ))}

                  {/* Tool calls — inline badges */}
                  {lastToolCalls.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 mb-1">
                      {lastToolCalls.map((tc, i) => (
                        <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-mono border
                          ${tc.tool === 'assign_task' ? 'text-success bg-success-dim border-success/20' :
                            tc.tool === 'wait_for_completion' ? 'text-accent bg-accent-muted border-accent/20' :
                            tc.tool === 'check_workers' ? 'text-info bg-[rgba(96,165,250,0.08)] border-info/20' :
                            tc.tool === 'escalate_to_human' ? 'text-warning bg-warning-dim border-warning/20' :
                            'text-text-muted bg-pill border-border'
                          }`}>
                          <Wrench size={9} />
                          {tc.tool}
                          {tc.input?.taskId && <span className="opacity-60">({tc.input.taskId.slice(0, 12)})</span>}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Activity log — secondary */}
                  {teams.logs.length > 0 && !hasThinking && (
                    teams.logs.map((line, i) => (
                      <div key={i} className={`whitespace-pre-wrap break-all py-px ${
                        line.includes('✓') ? 'text-success' :
                        line.includes('✗') ? 'text-danger' :
                        line.startsWith('🔧') ? 'text-warning' :
                        line.startsWith('⚡') ? 'text-accent font-semibold' :
                        line.startsWith('🔔') ? 'text-warning font-semibold' :
                        line.includes('---') ? 'text-text-muted opacity-40 text-center' :
                        line.includes('Worker →') ? 'text-accent' : 'text-text-muted'
                      }`}>{line}</div>
                    ))
                  )}

                  {teams.active && <span className="inline-block w-[6px] h-[14px] bg-accent animate-blink ml-0.5 mt-1" />}

                  {/* Completion banner */}
                  {isCompleted && teams.completionMessage && (
                    <div className="mt-3 flex items-center gap-2 px-3 py-2.5 bg-success-dim border border-success/20 rounded-md animate-fade-in-up">
                      <CheckCircle2 size={14} className="text-success shrink-0" />
                      <span className="text-xs font-medium text-success font-mono">{teams.completionMessage}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ─── Worker Pool (bottom — compact grid + expandable log drawer) ─── */}
          <div className={`${expandedWorkerId ? 'flex-[3]' : 'flex-[2]'} min-h-[120px] shrink-0 flex flex-col overflow-hidden p-4 transition-all duration-300 ease-out-expo`}>
            <div className="flex items-center gap-2 mb-2 shrink-0">
              <Zap size={12} className={activeWorkers.length > 0 ? 'text-accent animate-breathe' : isCompleted ? 'text-success' : 'text-text-muted'} />
              <span className="text-xxs font-semibold text-text-muted uppercase tracking-[0.1em] font-mono">Workers</span>
              {activeWorkers.length > 0 && (
                <span className="text-xxs text-success font-mono font-medium ml-auto">{activeWorkers.length} active</span>
              )}
              {completedWorkers.length > 0 && (
                <span className="text-xxs text-text-muted font-mono">{completedWorkers.length} done</span>
              )}
            </div>

            {/* Worker cards grid */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-1.5 shrink-0">
              {/* Active worker slots */}
              {Array.from({ length: maxWorkers }).map((_, i) => {
                const worker = activeWorkers[i];
                const isExpanded = worker && expandedWorkerId === worker.id;
                return (
                  <div
                    key={i}
                    className={`bg-card border rounded-sm px-3 py-3 flex items-center gap-2 transition-all duration-300 ease-out-expo
                      ${worker
                        ? `cursor-pointer hover:border-accent/40 hover:shadow-[0_0_16px_rgba(99,102,241,0.12)] ${isExpanded ? 'border-accent/40 bg-[rgba(99,102,241,0.06)] shadow-[0_0_16px_rgba(99,102,241,0.12)] ring-1 ring-accent/20' : 'border-accent/20 bg-[rgba(99,102,241,0.03)] shadow-[0_0_12px_rgba(99,102,241,0.08)]'}`
                        : 'border-border opacity-30'
                      }`}
                    onClick={() => worker && setExpandedWorkerId(isExpanded ? null : worker.id)}
                  >
                    {worker ? (
                      <>
                        <Zap size={11} className="text-accent animate-breathe shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-text truncate leading-tight">{worker.taskTitle}</div>
                          <div className="text-xxs text-text-muted font-mono">{worker.agentName || 'Auto'}</div>
                        </div>
                        <Terminal size={10} className={`shrink-0 transition-colors duration-150 ${isExpanded ? 'text-accent' : 'text-text-muted/40'}`} />
                      </>
                    ) : (
                      <span className="text-data text-text-muted font-mono">Slot {i + 1}</span>
                    )}
                  </div>
                );
              })}

              {/* Completed workers — clickable to view final output */}
              {completedWorkers.map((w) => {
                const isExpanded = expandedWorkerId === w.id;
                const hasLogs = (teams.workerLogs[w.id]?.length || 0) > 0;
                return (
                  <div
                    key={w.id}
                    className={`bg-card border rounded-sm px-3 py-3 flex items-center gap-2 transition-all duration-300 ease-out-expo
                      ${hasLogs ? 'cursor-pointer hover:border-border-light hover:bg-surface-hover' : ''}
                      ${isExpanded ? 'border-accent/30 bg-[rgba(99,102,241,0.04)] ring-1 ring-accent/15' : 'border-border'}`}
                    onClick={() => hasLogs && setExpandedWorkerId(isExpanded ? null : w.id)}
                  >
                    <span className={`shrink-0 ${w.status === 'failed' ? 'text-danger' : 'text-success'}`}>
                      {w.status === 'completed' ? '✓' : '✗'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-text-secondary truncate leading-tight">{w.taskTitle?.slice(0, 30) || w.taskId}</div>
                      <div className="text-xxs text-text-muted font-mono">{w.agentName || 'Auto'}</div>
                    </div>
                    {hasLogs && <Terminal size={10} className={`shrink-0 transition-colors duration-150 ${isExpanded ? 'text-accent' : 'text-text-muted/40'}`} />}
                  </div>
                );
              })}
            </div>

            {/* ─── Worker Log Drawer (toggleable) ─── */}
            {expandedWorkerId && (() => {
              const w = teams.workers.find((w) => w.id === expandedWorkerId);
              const wLogs = teams.workerLogs[expandedWorkerId] || [];
              if (!w) return null;
              return (
                <div className="flex-1 min-h-0 mt-2 flex flex-col animate-fade-in-up">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-[rgba(99,102,241,0.04)] border border-accent/15 rounded-t-md shrink-0">
                    <Terminal size={12} className="text-accent" />
                    <span className="text-xxs font-semibold text-text uppercase tracking-[0.08em] font-mono truncate">
                      {w.taskTitle}
                    </span>
                    <span className="text-xxs text-text-muted font-mono">
                      {w.agentName || 'Auto'}
                    </span>
                    {w.status === 'running' && (
                      <span className="flex items-center gap-1 text-xxs text-accent font-mono animate-breathe">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent" /> live
                      </span>
                    )}
                    {w.status === 'completed' && <span className="text-xxs text-success font-mono">done</span>}
                    {w.status === 'failed' && <span className="text-xxs text-danger font-mono">failed</span>}
                    <div className="flex-1" />
                    <span className="text-xxs text-text-muted font-mono">{wLogs.length} lines</span>
                    <button
                      className="btn-icon !p-0.5 !w-5 !h-5"
                      onClick={(e) => { e.stopPropagation(); setExpandedWorkerId(null); }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <div
                    ref={workerLogRef}
                    className="flex-1 overflow-y-auto bg-[var(--console-bg)] border border-t-0 border-accent/10 rounded-b-md p-3 font-mono text-[11px] leading-[1.7] shadow-[inset_0_2px_6px_rgba(0,0,0,0.3)]"
                  >
                    {wLogs.length === 0 ? (
                      <div className="flex items-center justify-center h-full opacity-20">
                        <span className="text-xs text-text-muted font-mono">Waiting for output...</span>
                      </div>
                    ) : (
                      wLogs.map((line, i) => (
                        <div key={i} className="text-text-secondary whitespace-pre-wrap break-all py-px">{line}</div>
                      ))
                    )}
                    {w.status === 'running' && <span className="inline-block w-[6px] h-[14px] bg-accent animate-blink ml-0.5 mt-1" />}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* ═══ Side Panel: Agents or Config ═══ */}
        {sidePanel === 'agents' && (
          <div className="w-[320px] shrink-0 border-l border-border bg-bg-subtle overflow-y-auto flex flex-col animate-fade-in-up">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
              <span className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono">Agents</span>
              <button className="btn-primary text-xxs" onClick={() => setShowCreateAgent(true)}>
                <Plus size={12} /> New
              </button>
            </div>
            <div className="flex flex-col p-2 gap-1 flex-1 overflow-y-auto">
              {agents.map((agent) => (
                <div
                  key={agent.name}
                  className={`p-2.5 border rounded-sm cursor-pointer transition-all duration-200 ease-out-expo bg-card
                    hover:border-border-light hover:bg-surface-hover
                    ${selectedAgent?.name === agent.name ? 'border-accent/25 bg-accent-muted' : 'border-border'}`}
                  onClick={() => setSelectedAgent(selectedAgent?.name === agent.name ? null : agent)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-body font-semibold text-text">{agent.name}</span>
                    <span className="text-xxs text-text-muted bg-pill font-mono px-1 py-0.5 rounded-xs ml-auto">{agent.model}</span>
                  </div>
                  <div className="text-label text-text-muted mt-0.5 truncate">{agent.description}</div>
                  {selectedAgent?.name === agent.name && (
                    <div className="mt-2 pt-2 border-t border-border animate-fade-in-up">
                      <div className="flex gap-1 flex-wrap mb-2">
                        {agent.skills.map(s => (
                          <span key={s} className="text-xxs text-text-muted bg-pill font-mono px-1 py-0.5 rounded-xs">{s}</span>
                        ))}
                      </div>
                      {agent.instructions && (
                        <div className="text-xxs text-text-muted font-mono leading-relaxed whitespace-pre-wrap bg-bg p-2 rounded-sm border border-border max-h-[100px] overflow-y-auto">
                          {agent.instructions}
                        </div>
                      )}
                      {!agent.builtIn && (
                        <button className="text-xxs text-danger mt-2 flex items-center gap-1 font-mono" onClick={() => handleDeleteAgent(agent.name)}>
                          <Trash2 size={10} /> Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {sidePanel === 'config' && (
          <div className="w-[320px] shrink-0 border-l border-border bg-bg-subtle overflow-hidden animate-fade-in-up">
            <ConfigPanel />
          </div>
        )}
      </div>

      {/* Create Agent Modal */}
      {showCreateAgent && (
        <CreateAgentModal onClose={() => setShowCreateAgent(false)} onCreated={() => { setShowCreateAgent(false); fetchAgents(); }} />
      )}
    </div>
  );
}

/* ═══ Create Agent Modal ═══ */
function CreateAgentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const addToast = useToastStore((s) => s.addToast);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [model, setModel] = useState('sonnet');
  const [skills, setSkills] = useState('');
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgePrompt, setForgePrompt] = useState('');
  const [forging, setForging] = useState(false);
  const { overlayProps } = useModalOverlay(onClose, { disabled: forging || loading });

  const handleForge = async () => {
    if (!forgePrompt.trim()) return;
    setForging(true);
    try {
      const res = await fetch(`${API}/api/generate/plan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'feature', prompt: `Design an AI agent profile. User request: "${forgePrompt}"\n\nOutput ONLY valid JSON (no markdown fences):\n{"name":"PascalCaseName","description":"One sentence","model":"sonnet","skills":["tag1","tag2"],"instructions":"Detailed instructions"}` }),
      });
      const data = await res.json();
      const plan = data.data?.plan || '';
      const jsonMatch = plan.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.name) setName(parsed.name);
          if (parsed.description) setDescription(parsed.description);
          if (parsed.model) setModel(parsed.model);
          if (parsed.skills) setSkills(Array.isArray(parsed.skills) ? parsed.skills.join(', ') : parsed.skills);
          if (parsed.instructions) setInstructions(parsed.instructions);
          addToast('Agent forged — review and save', 'success');
        } catch { setInstructions(plan); setDescription(forgePrompt); addToast('Forged (raw)', 'info'); }
      } else { setInstructions(plan); setDescription(forgePrompt); addToast('Forged', 'info'); }
    } catch { addToast('Forge failed', 'error'); }
    setForging(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) return;
    setLoading(true);
    try {
      await fetch(`${API}/api/agents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), model, skills: skills.split(',').map((s) => s.trim()).filter(Boolean), instructions: instructions.trim() }),
      });
      addToast(`${name} created`, 'success');
      onCreated();
    } catch { setLoading(false); addToast('Failed', 'error'); }
  };

  return (
    <div className="glass-overlay" {...overlayProps}>
      <div className="modal-box max-w-[520px] w-[92%] p-7 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <span className="text-h2 font-semibold">New Agent</span>
          <button className="btn-icon" onClick={onClose} disabled={forging || loading}><X size={16} /></button>
        </div>

        <div className="mb-5 p-3.5 bg-bg rounded-md border border-border shadow-inset">
          <div className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono mb-2.5">Forge with Claude</div>
          <div className="flex gap-2">
            <input className="flex-1" value={forgePrompt} onChange={(e) => setForgePrompt(e.target.value)} placeholder="e.g. An agent that deploys to AWS..." />
            <button className="btn-primary" onClick={handleForge} disabled={forging || !forgePrompt.trim()}>
              {forging ? <><span className="inline-block w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Forging...</> : <><Sparkles size={12} /> Forge</>}
            </button>
          </div>
          {forging && <div className="text-data text-accent font-mono mt-2.5 animate-breathe">Claude is designing your agent...</div>}
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col"><label className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono">Name</label><input className="mt-1.5 w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="MyAgent" /></div>
          <div className="flex flex-col"><label className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono">Description</label><input className="mt-1.5 w-full" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this agent does..." /></div>
          <div className="flex flex-col"><label className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono">Skills</label><input className="mt-1.5 w-full" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="backend, api, testing..." /></div>
          <div className="flex flex-col">
            <label className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono">Model</label>
            <div className="flex gap-1.5 mt-1.5">
              {['haiku', 'sonnet', 'opus'].map((m) => (
                <button key={m} type="button"
                  className={`px-3 py-1.5 text-data font-medium rounded-full border font-mono tracking-wide cursor-pointer transition-all duration-150 ease-out-expo ${model === m ? 'border-accent/20 text-accent bg-accent-muted' : 'border-border text-text-muted hover:border-border-light hover:text-text-secondary'}`}
                  onClick={() => setModel(m)}>{m}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col"><label className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono">Instructions</label><textarea className="mt-1.5 w-full" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Custom instructions..." rows={4} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!name.trim() || !description.trim() || loading}>{loading ? 'Creating...' : 'Create Agent'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
