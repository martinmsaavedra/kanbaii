'use client';

import { useEffect, useState, useCallback } from 'react';
import { Eye, FileText, Brain, Activity, Plus, Trash2, X, RotateCcw, Save, ChevronRight } from 'lucide-react';
import { useToastStore } from '@/stores/toastStore';
import { useModalOverlay } from '@/hooks/useModalOverlay';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';

interface SoulDocument { name: string; content: string; updatedAt: string; }
interface MemoryEntry { id: string; content: string; source: string; createdAt: string; }
interface DailyLog { date: string; entries: string[]; }
interface HealthMetrics { score: number; executionRate: number; successRate: number; stuckTasks: number; lastRun: string | null; updatedAt: string; }
interface SoulConfig { heartbeat: { enabled: boolean; intervalMinutes: number; model: string; }; }

type SoulTab = 'documents' | 'memory' | 'logs' | 'health';

const TABS: { key: SoulTab; label: string; icon: React.ReactNode }[] = [
  { key: 'documents', label: 'Documents', icon: <FileText size={13} /> },
  { key: 'memory',    label: 'Memory',    icon: <Brain size={13} /> },
  { key: 'logs',      label: 'Daily Logs', icon: <Activity size={13} /> },
  { key: 'health',    label: 'Health',     icon: <Eye size={13} /> },
];

export function SoulView({ projectSlug }: { projectSlug: string }) {
  const addToast = useToastStore((s) => s.addToast);
  const [tab, setTab] = useState<SoulTab>('documents');
  const [docs, setDocs] = useState<SoulDocument[]>([]);
  const [memory, setMemory] = useState<MemoryEntry[]>([]);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [health, setHealth] = useState<HealthMetrics | null>(null);
  const [config, setConfig] = useState<SoulConfig | null>(null);
  const [editingDoc, setEditingDoc] = useState<SoulDocument | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [newMemory, setNewMemory] = useState('');

  const base = `${API}/api/projects/${projectSlug}/soul`;

  const fetchAll = useCallback(async () => {
    const [d, m, l, h, c] = await Promise.all([
      fetch(`${base}/documents`).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`${base}/memory`).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`${base}/logs`).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`${base}/health`).then(r => r.json()).catch(() => ({ data: null })),
      fetch(`${base}/config`).then(r => r.json()).catch(() => ({ data: null })),
    ]);
    setDocs(d.data || []);
    setMemory(m.data || []);
    setLogs(l.data || []);
    setHealth(h.data || null);
    setConfig(c.data || null);
  }, [base]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const startEdit = (doc: SoulDocument) => { setEditingDoc(doc); setEditContent(doc.content); };

  const saveDoc = async () => {
    if (!editingDoc) return;
    await fetch(`${base}/documents/${editingDoc.name}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editContent }),
    });
    addToast(`${editingDoc.name} saved`, 'success');
    setEditingDoc(null);
    fetchAll();
  };

  const addMemoryEntry = async () => {
    if (!newMemory.trim()) return;
    await fetch(`${base}/memory`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newMemory.trim(), source: 'manual' }),
    });
    setNewMemory('');
    addToast('Memory added', 'success');
    fetchAll();
  };

  const deleteMemory = async (id: string) => {
    await fetch(`${base}/memory/${id}`, { method: 'DELETE' });
    fetchAll();
  };

  const resetAllMemory = async () => {
    await fetch(`${base}/memory/reset`, { method: 'POST' });
    setShowResetConfirm(false);
    addToast('Memory reset', 'success');
    fetchAll();
  };

  const toggleHeartbeat = async () => {
    if (!config) return;
    await fetch(`${base}/config`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ heartbeat: { ...config.heartbeat, enabled: !config.heartbeat.enabled } }),
    });
    fetchAll();
  };

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-h2 font-semibold text-text">
          <Eye size={18} /> Soul
        </div>
        <div className="flex-1" />
        {health && (
          <div className={`text-label font-semibold px-2 py-0.5 rounded-full font-mono
                           ${health.score >= 80
                             ? 'bg-success-dim text-success border border-success/20'
                             : health.score >= 50
                               ? 'bg-warning-dim text-warning border border-warning/20'
                               : 'bg-danger-dim text-danger border border-danger/20'
                           }`}>
            {health.score}/100
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-border">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-sm transition-all duration-150
                         ${tab === t.key
                           ? 'text-text border-b-2 border-accent'
                           : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
                         }`}
            onClick={() => setTab(t.key)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Documents */}
        {tab === 'documents' && (
          <div className="flex flex-col gap-2">
            {editingDoc ? (
              <div className="flex flex-col gap-3 h-full">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-text flex-1">{editingDoc.name}</span>
                  <button className="btn-ghost" onClick={() => setEditingDoc(null)}>Cancel</button>
                  <button className="btn-primary" onClick={saveDoc}><Save size={12} /> Save</button>
                </div>
                <textarea
                  className="flex-1 font-mono text-xs leading-relaxed min-h-[300px] resize-none"
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  spellCheck={false}
                />
              </div>
            ) : (
              docs.map(doc => (
                <button
                  key={doc.name}
                  className="flex flex-col gap-1.5 p-3.5 bg-card border border-border rounded-md text-left
                             transition-all duration-200 ease-out-expo hover:border-border-light hover:-translate-y-px"
                  onClick={() => startEdit(doc)}
                >
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-accent" />
                    <span className="text-body font-medium text-text flex-1">{doc.name}</span>
                    <ChevronRight size={12} className="text-text-muted" />
                  </div>
                  <div className="text-xs text-text-secondary leading-relaxed">
                    {doc.content ? doc.content.slice(0, 120) + (doc.content.length > 120 ? '...' : '') : 'Empty — click to edit'}
                  </div>
                  <div className="text-data text-text-muted font-mono">
                    Updated {new Date(doc.updatedAt).toLocaleDateString()}
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* Memory */}
        {tab === 'memory' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-label font-semibold uppercase tracking-[0.06em] text-text-muted">
                Memories ({memory.length})
              </span>
              <button
                className="flex items-center gap-1 text-label text-text-muted px-2 py-1 rounded-md
                           transition-all duration-150 hover:text-danger hover:bg-danger-dim disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={() => setShowResetConfirm(true)}
                disabled={memory.length === 0}
              >
                <RotateCcw size={11} /> Reset
              </button>
            </div>

            <div className="flex gap-2 items-end">
              <textarea
                className="flex-1 min-h-[60px]"
                value={newMemory}
                onChange={e => setNewMemory(e.target.value)}
                placeholder="Add a memory entry..."
                rows={2}
              />
              <button className="btn-primary" onClick={addMemoryEntry} disabled={!newMemory.trim()}>
                <Plus size={12} /> Add
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              {memory.length === 0 ? (
                <div className="text-center py-10 px-5 text-text-muted text-body">No memories yet. Add one above.</div>
              ) : (
                memory.map(entry => (
                  <div key={entry.id} className="p-2.5 bg-card border border-border rounded-sm">
                    <div className="text-xs text-text leading-relaxed">{entry.content}</div>
                    <div className="flex items-center gap-2 mt-1.5 text-data text-text-muted font-mono">
                      <span className="px-1.5 py-px bg-accent-muted text-accent rounded text-xxs">{entry.source}</span>
                      <span>{new Date(entry.createdAt).toLocaleDateString()}</span>
                      <button
                        className="flex items-center p-0.5 text-text-muted rounded-xs transition-all duration-150 ml-auto
                                   hover:text-danger hover:bg-danger-dim"
                        onClick={() => deleteMemory(entry.id)}
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Daily Logs */}
        {tab === 'logs' && (
          <div className="flex flex-col gap-3">
            {logs.length === 0 ? (
              <div className="text-center py-10 px-5 text-text-muted text-body">
                No daily logs yet. Logs are created automatically during execution.
              </div>
            ) : (
              logs.map(log => (
                <div key={log.date} className="p-3 bg-card border border-border rounded-sm">
                  <div className="text-label font-semibold text-text-muted font-mono mb-2">{log.date}</div>
                  <div className="flex flex-col gap-1">
                    {log.entries.map((entry, i) => (
                      <div key={i} className="text-xs text-text-secondary leading-relaxed pl-2 border-l-2 border-border">
                        {entry}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Health */}
        {tab === 'health' && health && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-2">
              <div className="w-20 h-20 rounded-full border-[3px] border-accent flex items-center justify-center">
                <span className="text-2xl font-bold text-text">{health.score}</span>
              </div>
              <span className="text-label font-medium text-text-muted uppercase tracking-[0.06em]">Health Score</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Execution Rate', value: health.executionRate.toFixed(1), unit: 'tasks/day' },
                { label: 'Success Rate', value: `${health.successRate.toFixed(0)}%`, unit: 'completion' },
                { label: 'Stuck Tasks', value: String(health.stuckTasks), unit: 'blocked' },
                { label: 'Last Run', value: health.lastRun ? new Date(health.lastRun).toLocaleDateString() : '\u2014', unit: health.lastRun ? new Date(health.lastRun).toLocaleTimeString() : 'never' },
              ].map((card) => (
                <div key={card.label} className="p-3 bg-card border border-border rounded-sm text-center">
                  <div className="text-data font-semibold text-text-muted uppercase tracking-wide mb-1">{card.label}</div>
                  <div className="text-xl font-bold text-text font-mono">{card.value}</div>
                  <div className="text-data text-text-muted">{card.unit}</div>
                </div>
              ))}
            </div>

            {config && (
              <div className="pt-4 border-t border-border">
                <div className="text-label font-semibold uppercase tracking-[0.06em] text-text-muted mb-2">Heartbeat</div>
                <div className="flex items-center justify-between py-2 text-body text-text">
                  <span>Auto health check</span>
                  <button
                    className="px-3 py-1 text-label font-semibold rounded-md border border-border bg-surface text-text-secondary
                               transition-all duration-150 hover:border-accent hover:text-accent"
                    onClick={toggleHeartbeat}
                  >
                    {config.heartbeat.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                {config.heartbeat.enabled && (
                  <div className="text-label text-text-muted py-1">
                    Every {config.heartbeat.intervalMinutes}m using {config.heartbeat.model}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reset Memory Dialog */}
      {showResetConfirm && (
        <ResetMemoryDialog
          onConfirm={resetAllMemory}
          onClose={() => setShowResetConfirm(false)}
        />
      )}
    </div>
  );
}

function ResetMemoryDialog({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  const { overlayProps } = useModalOverlay(onClose);

  return (
    <div className="glass-overlay" {...overlayProps}>
      <div className="modal-box w-[400px] max-w-[90vw] p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-h2 font-semibold text-text">Reset Memory</span>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <p className="text-body text-text-secondary leading-relaxed mb-4">
          This will permanently delete all memory entries for this project. This cannot be undone.
        </p>
        <div className="flex gap-2 justify-end">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-danger" onClick={onConfirm}><Trash2 size={12} /> Reset All</button>
        </div>
      </div>
    </div>
  );
}
