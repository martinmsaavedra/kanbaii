'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Users, Play, Square, Zap, Plus, Trash2, X, Sparkles, Settings, Bot, Wrench, Radio } from 'lucide-react';
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
type RightPanel = 'orchestrator' | 'workers' | 'tools';

export function TeamsView({ projectSlug }: { projectSlug: string }) {
  const { workItems, fetchWorkItems } = useWorkItemStore();
  const teams = useAppStore((s) => s.teams);
  const addToast = useToastStore((s) => s.addToast);

  const [selectedWIs, setSelectedWIs] = useState<string[]>([]);
  const [maxWorkers, setMaxWorkers] = useState(3);
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [rightPanel, setRightPanel] = useState<RightPanel>('orchestrator');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const logsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchWorkItems(projectSlug); }, [projectSlug, fetchWorkItems]);
  useEffect(() => { fetchAgents(); }, []);
  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [teams.logs]);

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
        body: JSON.stringify({ projectSlug, workItemSlugs: selectedWIs, maxWorkers }),
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

        {/* ═══ Center: Worker Pool + Logs ═══ */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Sub-tabs: Orchestrator | Workers | Tools */}
          <div className="flex border-b border-border shrink-0 px-3 bg-bg">
            {([
              { key: 'orchestrator' as RightPanel, label: 'Orchestrator', icon: <Radio size={12} /> },
              { key: 'workers' as RightPanel, label: 'Worker Pool', icon: <Zap size={12} /> },
              { key: 'tools' as RightPanel, label: 'Tools & MCPs', icon: <Wrench size={12} /> },
            ]).map(t => (
              <button
                key={t.key}
                className={`flex items-center gap-1.5 px-3 py-2 text-data font-semibold font-mono tracking-wide uppercase border-b-2 transition-all duration-150
                  ${rightPanel === t.key ? 'text-text border-accent' : 'text-text-muted border-transparent hover:text-text-secondary'}`}
                onClick={() => setRightPanel(t.key)}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {/* ─── Orchestrator Logs ─── */}
            {rightPanel === 'orchestrator' && (
              <div className="flex flex-col h-full gap-3">
                <div className="text-xxs font-semibold text-text-muted uppercase tracking-[0.1em] font-mono">Execution Logs</div>
                <div ref={logsRef} className="flex-1 overflow-y-auto bg-bg border border-border rounded-md p-3 font-mono text-data leading-relaxed text-text-muted shadow-inset">
                  {teams.logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2 opacity-30">
                      <Radio size={24} />
                      <span className="text-label font-mono">Orchestrator logs will appear here...</span>
                    </div>
                  ) : (
                    teams.logs.map((line, i) => (
                      <div key={i} className={`whitespace-pre-wrap break-all py-0.5 ${
                        line.includes('✓') ? 'text-success' :
                        line.includes('✗') ? 'text-danger' :
                        line.includes('→') ? 'text-accent' : ''
                      }`}>{line}</div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ─── Worker Pool ─── */}
            {rightPanel === 'workers' && (
              <div className="flex flex-col gap-4">
                <div className="text-xxs font-semibold text-text-muted uppercase tracking-[0.1em] font-mono">Active Workers</div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
                  {Array.from({ length: maxWorkers }).map((_, i) => {
                    const worker = activeWorkers[i];
                    return (
                      <div
                        key={i}
                        className={`bg-card border rounded-md px-4 py-5 min-h-[100px] flex flex-col items-center justify-center gap-2 transition-all duration-300 ease-out-expo relative overflow-hidden
                          before:content-[''] before:absolute before:top-0 before:left-[15%] before:right-[15%] before:h-px before:pointer-events-none
                          ${worker
                            ? 'border-accent/20 bg-[rgba(99,102,241,0.03)] shadow-[0_0_20px_rgba(99,102,241,0.12)] before:bg-[linear-gradient(90deg,transparent,rgba(99,102,241,0.12),transparent)]'
                            : 'border-border before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.02),transparent)]'
                          }`}
                      >
                        {worker ? (
                          <>
                            <Zap size={14} className="text-accent animate-breathe drop-shadow-[0_0_6px_var(--accent-glow)]" />
                            <div className="text-label font-medium text-text text-center truncate max-w-full">{worker.taskTitle}</div>
                            <div className="text-xxs text-text-muted font-mono">{worker.agentName || 'Default'}</div>
                          </>
                        ) : (
                          <div className="text-data text-text-muted opacity-30 font-mono tracking-wide">Slot {i + 1}</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {completedWorkers.length > 0 && (
                  <>
                    <div className="text-xxs font-semibold text-text-muted uppercase tracking-[0.1em] font-mono mt-2">Completed</div>
                    <div className="flex flex-col gap-px">
                      {completedWorkers.map((w) => (
                        <div key={w.id} className={`flex items-center gap-1.5 text-label py-1 font-mono ${w.status === 'failed' ? 'text-danger' : 'text-text-secondary'}`}>
                          <span>{w.status === 'completed' ? '\u2713' : '\u2717'}</span>
                          <span className="flex-1 truncate">{w.taskTitle}</span>
                          <span className="text-xxs text-text-muted">{w.agentName || ''}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ─── Tools & MCPs ─── */}
            {rightPanel === 'tools' && (
              <ConfigPanel />
            )}
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

/* ═══ Create Agent Modal (moved from AgentsView) ═══ */
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
