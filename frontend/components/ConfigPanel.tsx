'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, ToggleLeft, ToggleRight, RefreshCw, X, Zap, Edit3, Download } from 'lucide-react';
import { useToastStore } from '@/stores/toastStore';
import { useModalOverlay } from '@/hooks/useModalOverlay';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';

interface McpServer { name: string; command: string; args?: string[]; env?: Record<string, string>; enabled: boolean; }
interface Skill { name: string; description: string; promptTemplate: string; tools?: string[]; enabled: boolean; createdAt?: string; }
interface PluginEntry { name: string; version: string; description: string; enabled: boolean; hooks: string[]; }

type Tab = 'mcp' | 'skills' | 'plugins';

export function ConfigPanel() {
  const addToast = useToastStore((s) => s.addToast);
  const [tab, setTab] = useState<Tab>('mcp');
  const [mcps, setMcps] = useState<McpServer[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [plugins, setPlugins] = useState<PluginEntry[]>([]);
  const [presets, setPresets] = useState<McpServer[]>([]);

  // Modal state
  const [showMcpModal, setShowMcpModal] = useState(false);
  const [editingMcp, setEditingMcp] = useState<McpServer | null>(null);
  const [showSkillModal, setShowSkillModal] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [showPresetsModal, setShowPresetsModal] = useState(false);
  const [testingMcp, setTestingMcp] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const [m, s, p, pr] = await Promise.all([
      fetch(`${API}/api/mcp/servers`).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`${API}/api/skills`).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`${API}/api/plugins`).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`${API}/api/mcp/presets`).then(r => r.json()).catch(() => ({ data: [] })),
    ]);
    setMcps(m.data || []);
    setSkills(s.data || []);
    setPlugins(p.data || []);
    setPresets(pr.data || []);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // MCP actions
  const removeMcp = async (name: string) => {
    await fetch(`${API}/api/mcp/servers/${name}`, { method: 'DELETE' });
    addToast(`${name} removed`, 'success');
    fetchAll();
  };

  const toggleMcp = async (name: string, enabled: boolean) => {
    await fetch(`${API}/api/mcp/servers/${name}/toggle`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    fetchAll();
  };

  const testMcp = async (name: string) => {
    setTestingMcp(name);
    try {
      const res = await fetch(`${API}/api/mcp/servers/${name}/test`, { method: 'POST' });
      const data = await res.json();
      addToast(data.data?.message || (data.ok ? 'OK' : 'Failed'), data.ok ? 'success' : 'error');
    } catch { addToast('Test failed', 'error'); }
    setTestingMcp(null);
  };

  const addPreset = async (preset: McpServer) => {
    await fetch(`${API}/api/mcp/servers`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preset),
    });
    addToast(`${preset.name} added`, 'success');
    fetchAll();
  };

  // Skill actions
  const toggleSkill = async (name: string, enabled: boolean) => {
    await fetch(`${API}/api/skills/${name}/toggle`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    fetchAll();
  };

  const removeSkill = async (name: string) => {
    await fetch(`${API}/api/skills/${name}`, { method: 'DELETE' });
    addToast(`${name} removed`, 'success');
    fetchAll();
  };

  // Plugin actions
  const togglePlugin = async (name: string, enabled: boolean) => {
    await fetch(`${API}/api/plugins/toggle`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, enabled }),
    });
    fetchAll();
  };

  const rescanPlugins = async () => {
    await fetch(`${API}/api/plugins/rescan`, { method: 'POST' });
    addToast('Plugins rescanned', 'info');
    fetchAll();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex gap-0 border-b border-border shrink-0">
        {(['mcp', 'skills', 'plugins'] as Tab[]).map(t => (
          <button
            key={t}
            className={`px-4 py-2.5 text-data font-semibold font-mono tracking-[0.06em] border-b-2 transition-all duration-[180ms] ease-out-expo flex items-center gap-1.5 ${
              tab === t
                ? 'text-text border-b-accent'
                : 'text-text-muted border-b-transparent hover:text-text-secondary'
            }`}
            onClick={() => setTab(t)}
          >
            {t.toUpperCase()}
            <span className="text-xxs bg-pill px-[5px] py-px rounded-xs border border-[rgba(148,163,242,0.04)]">
              {t === 'mcp' ? mcps.length : t === 'skills' ? skills.length : plugins.length}
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* MCP Tab */}
        {tab === 'mcp' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-data font-semibold text-text-muted uppercase tracking-[0.08em] font-mono">MCP Servers</span>
              <div className="flex gap-1.5">
                <button
                  className="inline-flex items-center gap-1 text-data font-medium text-accent px-2.5 py-1 rounded-xs border border-[rgba(99,102,241,0.12)] bg-accent-muted transition-all duration-150 ease-out-expo font-mono hover:shadow-[0_0_8px_var(--accent-glow)]"
                  onClick={() => setShowPresetsModal(true)}
                >
                  <Download size={11} /> Presets
                </button>
                <button
                  className="inline-flex items-center gap-1 text-data font-medium text-accent px-2.5 py-1 rounded-xs border border-[rgba(99,102,241,0.12)] bg-accent-muted transition-all duration-150 ease-out-expo font-mono hover:shadow-[0_0_8px_var(--accent-glow)]"
                  onClick={() => { setEditingMcp(null); setShowMcpModal(true); }}
                >
                  <Plus size={11} /> Add
                </button>
              </div>
            </div>
            {mcps.length === 0 ? (
              <div className="text-text-muted text-label text-center py-8 font-mono opacity-50">No MCP servers configured</div>
            ) : (
              <div className="flex flex-col gap-1">
                {mcps.map(m => (
                  <div key={m.name} className="group flex items-center gap-2.5 px-3 py-2.5 border border-border rounded-sm transition-all duration-200 ease-out-expo hover:border-border-light hover:bg-surface-hover">
                    <button className="shrink-0 text-text-muted transition-colors duration-150 ease-out-expo" onClick={() => toggleMcp(m.name, !m.enabled)}>
                      {m.enabled ? <ToggleRight size={16} className="text-success" /> : <ToggleLeft size={16} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-text block">{m.name}</span>
                      <span className="text-data text-text-muted block mt-0.5 font-mono overflow-hidden text-ellipsis whitespace-nowrap">{m.command} {(m.args || []).join(' ')}</span>
                    </div>
                    <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-out-expo">
                      <button className="text-text-muted p-1 rounded-xs transition-all duration-120 ease-out-expo hover:text-accent hover:bg-accent-muted" onClick={() => testMcp(m.name)} disabled={testingMcp === m.name} title="Test connection">
                        {testingMcp === m.name ? <span className="inline-block w-[11px] h-[11px] border-[1.5px] border-[rgba(99,102,241,0.2)] border-t-accent rounded-full animate-spin" /> : <Zap size={11} />}
                      </button>
                      <button className="text-text-muted p-1 rounded-xs transition-all duration-120 ease-out-expo hover:text-accent hover:bg-accent-muted" onClick={() => { setEditingMcp(m); setShowMcpModal(true); }} title="Edit">
                        <Edit3 size={11} />
                      </button>
                      <button className="text-text-muted p-1 rounded-xs transition-all duration-120 ease-out-expo hover:text-danger hover:bg-danger-dim" onClick={() => removeMcp(m.name)} title="Remove">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Skills Tab */}
        {tab === 'skills' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-data font-semibold text-text-muted uppercase tracking-[0.08em] font-mono">Skills</span>
              <button
                className="inline-flex items-center gap-1 text-data font-medium text-accent px-2.5 py-1 rounded-xs border border-[rgba(99,102,241,0.12)] bg-accent-muted transition-all duration-150 ease-out-expo font-mono hover:shadow-[0_0_8px_var(--accent-glow)]"
                onClick={() => { setEditingSkill(null); setShowSkillModal(true); }}
              >
                <Plus size={11} /> Add
              </button>
            </div>
            {skills.length === 0 ? (
              <div className="text-text-muted text-label text-center py-8 font-mono opacity-50">No skills defined</div>
            ) : (
              <div className="flex flex-col gap-1">
                {skills.map(s => (
                  <div key={s.name} className="group flex items-center gap-2.5 px-3 py-2.5 border border-border rounded-sm transition-all duration-200 ease-out-expo hover:border-border-light hover:bg-surface-hover">
                    <button className="shrink-0 text-text-muted transition-colors duration-150 ease-out-expo" onClick={() => toggleSkill(s.name, !s.enabled)}>
                      {s.enabled ? <ToggleRight size={16} className="text-success" /> : <ToggleLeft size={16} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-text block">{s.name}</span>
                      <span className="text-data text-text-muted block mt-0.5 font-mono overflow-hidden text-ellipsis whitespace-nowrap">{s.description}</span>
                      {s.promptTemplate && (
                        <span className="text-xxs text-accent-dim block mt-[3px] font-mono opacity-60 overflow-hidden text-ellipsis whitespace-nowrap">
                          {s.promptTemplate.length > 60 ? s.promptTemplate.slice(0, 60) + '...' : s.promptTemplate}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-out-expo">
                      <button className="text-text-muted p-1 rounded-xs transition-all duration-120 ease-out-expo hover:text-accent hover:bg-accent-muted" onClick={() => { setEditingSkill(s); setShowSkillModal(true); }} title="Edit">
                        <Edit3 size={11} />
                      </button>
                      <button className="text-text-muted p-1 rounded-xs transition-all duration-120 ease-out-expo hover:text-danger hover:bg-danger-dim" onClick={() => removeSkill(s.name)} title="Remove">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Plugins Tab */}
        {tab === 'plugins' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-data font-semibold text-text-muted uppercase tracking-[0.08em] font-mono">Plugins</span>
              <button
                className="inline-flex items-center gap-1 text-data font-medium text-accent px-2.5 py-1 rounded-xs border border-[rgba(99,102,241,0.12)] bg-accent-muted transition-all duration-150 ease-out-expo font-mono hover:shadow-[0_0_8px_var(--accent-glow)]"
                onClick={rescanPlugins}
              >
                <RefreshCw size={11} /> Rescan
              </button>
            </div>
            {plugins.length === 0 ? (
              <div className="text-text-muted text-label text-center py-8 font-mono opacity-50">No plugins found in data/.plugins/</div>
            ) : (
              <div className="flex flex-col gap-1">
                {plugins.map(p => (
                  <div key={p.name} className="group flex items-center gap-2.5 px-3 py-2.5 border border-border rounded-sm transition-all duration-200 ease-out-expo hover:border-border-light hover:bg-surface-hover">
                    <button className="shrink-0 text-text-muted transition-colors duration-150 ease-out-expo" onClick={() => togglePlugin(p.name, !p.enabled)}>
                      {p.enabled ? <ToggleRight size={16} className="text-success" /> : <ToggleLeft size={16} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-text block">{p.name} <span className="text-xxs text-text-muted font-mono">v{p.version}</span></span>
                      <span className="text-data text-text-muted block mt-0.5 font-mono overflow-hidden text-ellipsis whitespace-nowrap">{p.description || 'No description'}</span>
                      <div className="flex gap-1 flex-wrap mt-1">
                        {p.hooks.map(h => (
                          <span key={h} className="text-[8px] text-accent-dim bg-accent-muted px-[5px] py-px rounded-xs font-mono border border-[rgba(99,102,241,0.06)]">{h}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {showMcpModal && (
        <McpModal
          server={editingMcp}
          onClose={() => setShowMcpModal(false)}
          onSaved={() => { setShowMcpModal(false); fetchAll(); }}
        />
      )}
      {showSkillModal && (
        <SkillModal
          skill={editingSkill}
          onClose={() => setShowSkillModal(false)}
          onSaved={() => { setShowSkillModal(false); fetchAll(); }}
        />
      )}
      {showPresetsModal && (
        <PresetsModal
          presets={presets}
          installed={mcps.map(m => m.name)}
          onAdd={addPreset}
          onClose={() => setShowPresetsModal(false)}
        />
      )}
    </div>
  );
}

/* MCP Create/Edit Modal */
function McpModal({ server, onClose, onSaved }: { server: McpServer | null; onClose: () => void; onSaved: () => void }) {
  const addToast = useToastStore((s) => s.addToast);
  const [name, setName] = useState(server?.name || '');
  const [command, setCommand] = useState(server?.command || '');
  const [args, setArgs] = useState((server?.args || []).join(' '));
  const [envStr, setEnvStr] = useState(server?.env ? Object.entries(server.env).map(([k, v]) => `${k}=${v}`).join('\n') : '');
  const [loading, setLoading] = useState(false);
  const { overlayProps } = useModalOverlay(onClose);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !command.trim()) return;
    setLoading(true);
    const env: Record<string, string> = {};
    envStr.split('\n').filter(Boolean).forEach(line => {
      const idx = line.indexOf('=');
      if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    });
    try {
      await fetch(`${API}/api/mcp/servers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), command: command.trim(), args: args.trim() ? args.trim().split(/\s+/) : [], env, enabled: true }),
      });
      addToast(`${name} ${server ? 'updated' : 'added'}`, 'success');
      onSaved();
    } catch { setLoading(false); addToast('Failed', 'error'); }
  };

  return (
    <div className="fixed inset-0 bg-overlay backdrop-blur-[16px] saturate-[180%] flex items-center justify-center z-[200] animate-overlay-in" {...overlayProps}>
      <div className="bg-[var(--modal-bg,var(--surface-elevated))] border border-glass-border rounded-lg shadow-modal max-w-[520px] w-[92%] p-6 max-h-[85vh] overflow-y-auto animate-spring-pop relative before:content-[''] before:absolute before:top-0 before:left-[15%] before:right-[15%] before:h-px before:bg-gradient-to-r before:from-transparent before:via-[rgba(129,140,248,0.15)] before:to-transparent before:pointer-events-none" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <span className="text-h2 font-semibold tracking-tight">{server ? 'Edit' : 'Add'} MCP Server</span>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <form className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
          <div className="flex flex-col">
            <label className="text-data font-semibold text-text-muted uppercase tracking-[0.08em] font-mono">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="context7" disabled={!!server} className="mt-1.5" />
          </div>
          <div className="flex flex-col">
            <label className="text-data font-semibold text-text-muted uppercase tracking-[0.08em] font-mono">Command</label>
            <input value={command} onChange={e => setCommand(e.target.value)} placeholder="npx" className="mt-1.5" />
          </div>
          <div className="flex flex-col">
            <label className="text-data font-semibold text-text-muted uppercase tracking-[0.08em] font-mono">Arguments (space-separated)</label>
            <input value={args} onChange={e => setArgs(e.target.value)} placeholder="-y @upstash/context7-mcp@latest" className="mt-1.5" />
          </div>
          <div className="flex flex-col">
            <label className="text-data font-semibold text-text-muted uppercase tracking-[0.08em] font-mono">Environment Variables (KEY=value, one per line)</label>
            <textarea value={envStr} onChange={e => setEnvStr(e.target.value)} placeholder="BRAVE_API_KEY=your-key" rows={3} className="mt-1.5" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!name.trim() || !command.trim() || loading}>
              {loading ? 'Saving...' : server ? 'Update' : 'Add Server'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* Skill Create/Edit Modal */
function SkillModal({ skill, onClose, onSaved }: { skill: Skill | null; onClose: () => void; onSaved: () => void }) {
  const addToast = useToastStore((s) => s.addToast);
  const [name, setName] = useState(skill?.name || '');
  const [description, setDescription] = useState(skill?.description || '');
  const [promptTemplate, setPromptTemplate] = useState(skill?.promptTemplate || '');
  const [tools, setTools] = useState((skill?.tools || []).join(', '));
  const [loading, setLoading] = useState(false);
  const { overlayProps } = useModalOverlay(onClose);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) return;
    setLoading(true);
    try {
      await fetch(`${API}/api/skills`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), description: description.trim(),
          promptTemplate: promptTemplate.trim(),
          tools: tools.split(',').map(t => t.trim()).filter(Boolean),
          enabled: true,
        }),
      });
      addToast(`${name} ${skill ? 'updated' : 'created'}`, 'success');
      onSaved();
    } catch { setLoading(false); addToast('Failed', 'error'); }
  };

  return (
    <div className="fixed inset-0 bg-overlay backdrop-blur-[16px] saturate-[180%] flex items-center justify-center z-[200] animate-overlay-in" {...overlayProps}>
      <div className="bg-[var(--modal-bg,var(--surface-elevated))] border border-glass-border rounded-lg shadow-modal max-w-[520px] w-[92%] p-6 max-h-[85vh] overflow-y-auto animate-spring-pop relative before:content-[''] before:absolute before:top-0 before:left-[15%] before:right-[15%] before:h-px before:bg-gradient-to-r before:from-transparent before:via-[rgba(129,140,248,0.15)] before:to-transparent before:pointer-events-none" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <span className="text-h2 font-semibold tracking-tight">{skill ? 'Edit' : 'New'} Skill</span>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <form className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
          <div className="flex flex-col">
            <label className="text-data font-semibold text-text-muted uppercase tracking-[0.08em] font-mono">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="code-review" disabled={!!skill} className="mt-1.5" />
          </div>
          <div className="flex flex-col">
            <label className="text-data font-semibold text-text-muted uppercase tracking-[0.08em] font-mono">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Reviews code for quality and security..." className="mt-1.5" />
          </div>
          <div className="flex flex-col">
            <label className="text-data font-semibold text-text-muted uppercase tracking-[0.08em] font-mono">Prompt Template</label>
            <textarea value={promptTemplate} onChange={e => setPromptTemplate(e.target.value)} placeholder="You are a code reviewer. When reviewing code, focus on..." rows={6} className="mt-1.5 !font-mono !text-label !leading-[1.6]" />
          </div>
          <div className="flex flex-col">
            <label className="text-data font-semibold text-text-muted uppercase tracking-[0.08em] font-mono">Required Tools (comma-separated)</label>
            <input value={tools} onChange={e => setTools(e.target.value)} placeholder="bash, read, edit" className="mt-1.5" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!name.trim() || !description.trim() || loading}>
              {loading ? 'Saving...' : skill ? 'Update' : 'Create Skill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* MCP Presets Modal */
function PresetsModal({ presets, installed, onAdd, onClose }: {
  presets: McpServer[]; installed: string[];
  onAdd: (preset: McpServer) => void; onClose: () => void;
}) {
  const { overlayProps } = useModalOverlay(onClose);

  return (
    <div className="fixed inset-0 bg-overlay backdrop-blur-[16px] saturate-[180%] flex items-center justify-center z-[200] animate-overlay-in" {...overlayProps}>
      <div className="bg-[var(--modal-bg,var(--surface-elevated))] border border-glass-border rounded-lg shadow-modal max-w-[520px] w-[92%] p-6 max-h-[85vh] overflow-y-auto animate-spring-pop relative before:content-[''] before:absolute before:top-0 before:left-[15%] before:right-[15%] before:h-px before:bg-gradient-to-r before:from-transparent before:via-[rgba(129,140,248,0.15)] before:to-transparent before:pointer-events-none" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <span className="text-h2 font-semibold tracking-tight">MCP Presets</span>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="flex flex-col gap-1.5">
          {presets.map(p => {
            const isInstalled = installed.includes(p.name);
            return (
              <div key={p.name} className="flex items-center gap-3 px-4 py-3.5 border border-border rounded-sm transition-all duration-200 ease-out-expo hover:border-border-light hover:bg-surface-hover">
                <div className="flex-1 min-w-0">
                  <span className="text-body font-semibold text-text block">{p.name}</span>
                  <span className="text-data text-text-muted block mt-[3px] font-mono">{p.command} {(p.args || []).join(' ')}</span>
                  {p.env && Object.keys(p.env).length > 0 && (
                    <span className="text-xxs text-warning block mt-[3px] font-mono">Requires: {Object.keys(p.env).join(', ')}</span>
                  )}
                </div>
                {isInstalled ? (
                  <span className="text-xxs text-success px-2 py-[3px] rounded-xs border border-[rgba(52,211,153,0.15)] bg-success-dim font-mono font-medium tracking-wide">Installed</span>
                ) : (
                  <button
                    className="inline-flex items-center gap-1 text-data font-medium text-accent px-2.5 py-1 rounded-xs border border-[rgba(99,102,241,0.12)] bg-accent-muted transition-all duration-150 ease-out-expo font-mono hover:shadow-[0_0_8px_var(--accent-glow)]"
                    onClick={() => { onAdd(p); onClose(); }}
                  >
                    <Plus size={11} /> Add
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
