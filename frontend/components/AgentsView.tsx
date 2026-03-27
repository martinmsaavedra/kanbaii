'use client';

import { useEffect, useState, useCallback } from 'react';
import { Bot, Plus, Trash2, X, Sparkles, Settings } from 'lucide-react';
import { ConfigPanel } from './ConfigPanel';
import { useAppStore } from '@/stores/appStore';
import { useRouterStore } from '@/stores/routerStore';
import { useToastStore } from '@/stores/toastStore';
import { useModalOverlay } from '@/hooks/useModalOverlay';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';

interface Agent {
  name: string; description: string; model: string; skills: string[];
  tools: string[]; instructions: string; builtIn: boolean;
}

/* ── Avatar gradient based on agent skills/type ── */
const SKILL_GRADIENTS: Record<string, string> = {
  backend:  'from-indigo-500 to-violet-600',
  frontend: 'from-cyan-400 to-blue-500',
  api:      'from-emerald-400 to-teal-600',
  testing:  'from-pink-400 to-rose-600',
  devops:   'from-amber-400 to-orange-600',
  deploy:   'from-amber-400 to-orange-600',
  review:   'from-green-400 to-emerald-600',
  planning: 'from-yellow-400 to-amber-500',
  database: 'from-purple-400 to-indigo-600',
  security: 'from-red-400 to-rose-700',
};
const DEFAULT_GRADIENT = 'from-accent to-violet-600';

function getAvatarGradient(skills: string[]): string {
  for (const skill of skills) {
    const key = skill.toLowerCase();
    for (const [match, gradient] of Object.entries(SKILL_GRADIENTS)) {
      if (key.includes(match)) return gradient;
    }
  }
  return DEFAULT_GRADIENT;
}

export function AgentsView({ projectSlug }: { projectSlug: string }) {
  const ralph = useAppStore((s) => s.ralph);
  const goToWorkItem = useRouterStore((s) => s.goToWorkItem);
  const addToast = useToastStore((s) => s.addToast);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/agents`);
      const data = await res.json();
      if (data.ok) setAgents(data.data);
    } catch {}
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const handleDelete = async (name: string) => {
    try {
      await fetch(`${API}/api/agents/${name}`, { method: 'DELETE' });
      fetchAgents();
      addToast(`${name} deleted`, 'success');
      if (selectedAgent?.name === name) setSelectedAgent(null);
    } catch { addToast('Failed to delete', 'error'); }
  };

  const isRunning = ralph.status === 'running' || ralph.status === 'paused';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center px-5 py-3.5 border-b border-border shrink-0 relative bg-gradient-to-b from-bg-subtle to-bg
                       after:content-[''] after:absolute after:bottom-0 after:left-[5%] after:right-[5%] after:h-px
                       after:bg-[linear-gradient(90deg,transparent,var(--border-glow),transparent)]">
        <div className="text-h2 font-semibold flex items-center gap-2">
          <Bot size={18} /> Agents
        </div>
        <div className="flex-1" />
        <button
          className={`btn-ghost ${showConfig ? '!text-accent !border-accent/20 !bg-accent-muted' : ''}`}
          onClick={() => setShowConfig(!showConfig)}
        >
          <Settings size={14} /> Config
        </button>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={14} /> New Agent
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Config sidebar */}
        {showConfig && (
          <div className="w-80 shrink-0 border-r border-border bg-bg-subtle overflow-hidden animate-fade-in-up">
            <ConfigPanel />
          </div>
        )}

        {/* Agent list panel */}
        <div className="w-[300px] shrink-0 border-r border-border flex flex-col p-3 gap-1.5 overflow-y-auto bg-bg-subtle">
          <div className="flex flex-col gap-1">
            {agents.map((agent, index) => (
              <div
                key={agent.name}
                className={`p-3 px-3.5 border rounded-md cursor-pointer
                  transition-all duration-250 ease-out-expo relative overflow-hidden bg-card
                  before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[2px] before:rounded-t-md
                  before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.02),transparent)] before:pointer-events-none
                  hover:border-border-light hover:bg-surface-hover hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]
                  animate-agent-in
                  ${selectedAgent?.name === agent.name
                    ? 'border-l-2 border-accent shadow-[inset_3px_0_8px_rgba(99,102,241,0.1)] bg-accent-muted'
                    : 'border-border'
                  }`}
                style={{ animationDelay: `${index * 80}ms` }}
                onClick={() => setSelectedAgent(agent)}
              >
                <div className="flex items-center gap-2.5 mb-1.5">
                  {/* Agent avatar */}
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarGradient(agent.skills)}
                                   flex items-center justify-center text-white text-body font-bold shrink-0
                                   shadow-[0_0_12px_rgba(99,102,241,0.15)]`}>
                    {agent.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <span className="text-body font-semibold text-text">{agent.name}</span>
                      <span className="text-xxs text-text-muted bg-pill font-mono font-medium px-1.5 py-0.5 rounded-xs border border-[rgba(148,163,242,0.04)]">
                        {agent.model}
                      </span>
                    </div>
                    <div className="text-label text-text-secondary leading-snug mt-0.5">{agent.description}</div>
                  </div>
                </div>
                <div className="flex gap-1 flex-wrap ml-[52px]">
                  {agent.skills.slice(0, 4).map((s) => (
                    <span key={s} className="text-xxs text-text-muted bg-pill font-mono px-1.5 py-0.5 rounded-xs border border-[rgba(148,163,242,0.03)]">
                      {s}
                    </span>
                  ))}
                  {agent.skills.length > 4 && (
                    <span className="text-xxs text-text-muted bg-pill font-mono px-1.5 py-0.5 rounded-xs border border-[rgba(148,163,242,0.03)]">
                      +{agent.skills.length - 4}
                    </span>
                  )}
                </div>
                {agent.builtIn && (
                  <span className="text-[8px] text-accent-dim font-mono tracking-wide uppercase opacity-50 mt-1.5 ml-[52px] block">
                    built-in
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <div className="flex-1 overflow-y-auto p-5 bg-bg">
          {selectedAgent ? (
            <div className="flex flex-col gap-5 animate-fade-in-up">
              {/* Detail header with avatar */}
              <div className="flex justify-between items-start">
                <div className="flex gap-4 items-start">
                  <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${getAvatarGradient(selectedAgent.skills)}
                                   flex items-center justify-center text-white text-xl font-bold shrink-0
                                   shadow-[0_0_20px_rgba(99,102,241,0.2)]`}>
                    {selectedAgent.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-h1 font-semibold text-text">{selectedAgent.name}</div>
                    <div className="text-body text-text-secondary mt-1 leading-relaxed">{selectedAgent.description}</div>
                  </div>
                </div>
                {!selectedAgent.builtIn && (
                  <button className="btn-danger" onClick={() => handleDelete(selectedAgent.name)}>
                    <Trash2 size={12} /> Delete
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono">Model</div>
                <div className="text-body text-text">{selectedAgent.model}</div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono">Skills</div>
                <div className="flex gap-1.5 flex-wrap">
                  {selectedAgent.skills.map((s) => (
                    <span key={s} className="text-xxs text-text-muted bg-pill font-mono px-1.5 py-0.5 rounded-xs border border-[rgba(148,163,242,0.03)]">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono">Tools</div>
                <div className="text-body text-text">{selectedAgent.tools.join(', ')}</div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono">Instructions</div>
                <div className="text-label text-text-secondary leading-relaxed whitespace-pre-wrap
                                bg-bg p-3.5 px-4 rounded-md border border-border font-mono
                                shadow-[inset_0_1px_4px_rgba(0,0,0,0.15)]">
                  {selectedAgent.instructions}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col p-5 gap-2 overflow-hidden">
              <div className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono mb-1">
                Ralph Status
              </div>
              {isRunning ? (
                <div className="flex flex-col gap-3 p-4 bg-surface border border-border rounded-md relative overflow-hidden animate-fade-in-up
                                before:content-[''] before:absolute before:top-0 before:left-[15%] before:right-[15%] before:h-px
                                before:bg-[linear-gradient(90deg,transparent,rgba(52,211,153,0.15),transparent)]">
                  <div className="flex items-center gap-2">
                    <span className="text-xxs font-semibold font-mono tracking-wide uppercase
                                     text-success bg-success-dim border border-[rgba(52,211,153,0.15)]
                                     px-2 py-0.5 rounded-full animate-breathe shadow-[0_0_8px_rgba(52,211,153,0.1)]">
                      {ralph.status}
                    </span>
                    <span className="text-body font-medium text-text">{ralph.workItemSlug}</span>
                  </div>
                  {ralph.currentTaskTitle && (
                    <div className="text-label text-accent font-mono animate-breathe">
                      Running: {ralph.currentTaskTitle}
                    </div>
                  )}
                  <div className="flex flex-col gap-2 p-3 bg-bg rounded-sm border border-border shadow-inset">
                    <div className="progress-bar">
                      <div
                        className="progress-bar-fill"
                        style={{
                          width: `${ralph.stats.total > 0 ? ((ralph.stats.completed + ralph.stats.failed) / ralph.stats.total) * 100 : 0}%`,
                          background: 'var(--accent-gradient)',
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-label text-text-secondary font-mono">
                      <span className="text-success">Done: {ralph.stats.completed}</span>
                      <span className="text-danger">Failed: {ralph.stats.failed}</span>
                      <span>Total: {ralph.stats.total}</span>
                    </div>
                  </div>
                  <button
                    className="text-label font-medium text-accent font-mono tracking-wide text-left
                               py-1.5 transition-all duration-150 ease-out-expo hover:text-accent-hover hover:translate-x-0.5"
                    onClick={() => ralph.workItemSlug && goToWorkItem(projectSlug, ralph.workItemSlug)}
                  >
                    View Work Item &rarr;
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-12 px-6 text-text-muted text-center text-body animate-fade-in-up">
                  <Bot size={32} className="opacity-20" />
                  <p>No active runs</p>
                  <p className="text-label text-text-muted opacity-60 leading-relaxed">
                    Select an agent to view details, or go to a work item and click &quot;Run&quot;
                  </p>
                </div>
              )}
              {ralph.output.length > 0 && (
                <>
                  <div className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono mb-1 mt-5">
                    Output
                  </div>
                  <div className="flex-1 overflow-y-auto bg-bg border border-border rounded-md p-3 px-3.5
                                  font-mono text-data leading-relaxed text-text-muted
                                  shadow-[inset_0_1px_4px_rgba(0,0,0,0.15)]">
                    {ralph.output.map((line, i) => (
                      <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showCreate && <CreateAgentModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); fetchAgents(); }} />}
    </div>
  );
}

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
    <div className="fixed inset-0 flex items-center justify-center z-[100] animate-overlay-in
                     bg-overlay backdrop-blur-[16px] backdrop-saturate-[180%]"
         {...overlayProps}>
      <div
        className="bg-modal border border-glass-border rounded-lg shadow-modal
                   max-w-[520px] w-[92%] p-7 max-h-[90vh] overflow-y-auto
                   animate-spring-pop relative overflow-x-hidden
                   before:content-[''] before:absolute before:top-0 before:left-[15%] before:right-[15%] before:h-px before:pointer-events-none
                   before:bg-[linear-gradient(90deg,transparent,rgba(129,140,248,0.15),transparent)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex justify-between items-center mb-6">
          <span className="text-h2 font-semibold">New Agent</span>
          <button className="btn-icon" onClick={onClose} disabled={forging || loading}><X size={16} /></button>
        </div>

        {/* Forge section */}
        <div className="mb-5 p-3.5 bg-bg rounded-md border border-border shadow-inset">
          <div className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono mb-2.5">
            Forge with Claude
          </div>
          <div className="flex gap-2">
            <input className="flex-1" value={forgePrompt} onChange={(e) => setForgePrompt(e.target.value)} placeholder="e.g. An agent that deploys to AWS..." />
            <button className="btn-primary" onClick={handleForge} disabled={forging || !forgePrompt.trim()}>
              {forging ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  Forging...
                </>
              ) : (
                <><Sparkles size={12} /> Forge</>
              )}
            </button>
          </div>
          {forging && (
            <div className="text-data text-accent font-mono mt-2.5 animate-breathe">
              Claude is designing your agent...
            </div>
          )}
        </div>

        {/* Form */}
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col">
            <label className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono">Name</label>
            <input className="mt-1.5 w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="MyAgent" />
          </div>
          <div className="flex flex-col">
            <label className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono">Description</label>
            <input className="mt-1.5 w-full" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this agent does..." />
          </div>
          <div className="flex flex-col">
            <label className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono">Skills (comma-separated)</label>
            <input className="mt-1.5 w-full" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="backend, api, testing..." />
          </div>
          <div className="flex flex-col">
            <label className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono">Model</label>
            <div className="flex gap-1.5 mt-1.5">
              {['haiku', 'sonnet', 'opus'].map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`px-3 py-1.5 text-data font-medium rounded-full border font-mono tracking-wide
                    cursor-pointer transition-all duration-150 ease-out-expo
                    ${model === m
                      ? 'border-accent/20 text-accent bg-accent-muted shadow-[0_0_8px_rgba(99,102,241,0.06)]'
                      : 'border-border text-text-muted bg-transparent hover:border-border-light hover:text-text-secondary'
                    }`}
                  onClick={() => setModel(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col">
            <label className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono">Instructions</label>
            <textarea className="mt-1.5 w-full" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Custom instructions..." rows={4} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!name.trim() || !description.trim() || loading}>
              {loading ? 'Creating...' : 'Create Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
