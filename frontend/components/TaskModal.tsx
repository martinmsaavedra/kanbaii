'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Trash2, Clock, Play, Pause, Mic } from 'lucide-react';
import { api } from '@/lib/api';
import { useModalOverlay } from '@/hooks/useModalOverlay';
import { useToastStore } from '@/stores/toastStore';

const MODELS = ['haiku', 'sonnet', 'opus'] as const;
const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

const VOICE_API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';

/** Voice capture: MediaRecorder → backend → OpenAI Whisper */
function useSpeechToText(onResult: (text: string) => void, fieldName: string) {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const addToast = useToastStore((s) => s.addToast);

  const toggle = useCallback(async () => {
    if (listening && recorderRef.current) {
      recorderRef.current.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setListening(false);
        recorderRef.current = null;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size < 100) { addToast('Recording too short', 'error'); return; }

        setTranscribing(true);
        addToast('Transcribing with Whisper...', 'info');
        try {
          const buf = await blob.arrayBuffer();
          const res = await fetch(`${VOICE_API}/api/voice/transcribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream', 'X-Audio-Type': mimeType.split(';')[0] },
            body: buf,
          });
          const data = await res.json();
          if (data.ok && data.data?.text) {
            onResult(data.data.text);
            addToast(`${fieldName}: "${data.data.text.slice(0, 50)}..."`, 'success');
          } else {
            addToast(data.error || 'Transcription failed', 'error');
          }
        } catch { addToast('Failed to transcribe', 'error'); }
        setTranscribing(false);
      };

      recorderRef.current = recorder;
      recorder.start();
      setListening(true);
      addToast('Recording... click to stop', 'info');
    } catch (err) {
      addToast((err as Error).name === 'NotAllowedError' ? 'Microphone denied' : 'Mic error', 'error');
    }
  }, [listening, onResult, addToast, fieldName]);

  return { listening, toggle, supported: true, transcribing };
}

function MicButton({ listening, onClick, transcribing }: { listening: boolean; onClick: () => void; supported?: boolean; transcribing?: boolean }) {
  return (
    <button
      type="button"
      disabled={transcribing}
      className={`inline-flex items-center gap-1 rounded-full transition-all duration-150 ml-1.5
        ${transcribing
          ? 'w-6 h-6 justify-center text-accent border border-accent/20 bg-accent-muted animate-spin-slow'
          : listening
            ? 'bg-danger-dim text-danger border border-danger/30 px-2 py-0.5'
            : 'w-6 h-6 justify-center text-text-muted hover:text-accent hover:bg-accent-muted border border-transparent'
        }`}
      onClick={onClick}
      title={transcribing ? 'Transcribing...' : listening ? 'Stop recording' : 'Voice input'}
    >
      <Mic size={11} className={listening ? 'animate-breathe' : ''} />
      {listening && <span className="text-[8px] font-mono font-semibold tracking-wide">REC</span>}
      {transcribing && <span className="text-[8px] font-mono font-semibold tracking-wide">...</span>}
    </button>
  );
}
const COLUMNS = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'todo', label: 'To Do' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
];

const PRIORITY_COLORS: Record<string, string> = {
  low: '#71717a', medium: '#6366f1', high: '#f59e0b', urgent: '#f43f5e',
};

const MODEL_COLORS: Record<string, string> = {
  haiku: '#22c55e', sonnet: '#6366f1', opus: '#a855f7',
};

interface Props {
  projectSlug: string;
  wiSlug: string;
  mode: 'create' | 'edit';
  task?: any;
  defaultColumn?: string;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function TaskModal({ projectSlug, wiSlug, mode, task, defaultColumn, onSave, onDelete, onClose }: Props) {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [model, setModel] = useState<string>(task?.model || 'sonnet');
  const [priority, setPriority] = useState<string>(task?.priority || 'medium');
  const [tagsStr, setTagsStr] = useState<string>((task?.tags || []).join(', '));
  const [column, setColumn] = useState(defaultColumn || 'backlog');
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titleMic = useSpeechToText(useCallback((text: string) => setTitle((prev: string) => prev ? `${prev} ${text}` : text), []), 'title');
  const descMic = useSpeechToText(useCallback((text: string) => setDescription((prev: string) => prev ? `${prev} ${text}` : text), []), 'description');
  const { overlayProps } = useModalOverlay(onClose, { disabled: loading });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);

    const tags = tagsStr.split(',').map((t) => t.trim()).filter(Boolean);

    try {
      if (mode === 'create') {
        await api.createTask(projectSlug, wiSlug, {
          title: title.trim(),
          description: description.trim(),
          model,
          priority,
          tags: tags.length > 0 ? tags : undefined,
          column,
        });
      } else {
        await api.updateTask(projectSlug, wiSlug, task.id, {
          title: title.trim(),
          description: description.trim(),
          model,
          priority,
          tags: tags.length > 0 ? tags : undefined,
        });
      }
      onSave();
    } catch {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setLoading(true);
    try {
      await api.deleteTask(projectSlug, wiSlug, task.id);
      onDelete();
    } catch { setLoading(false); }
  };

  return (
    <div className="glass-overlay" {...overlayProps}>
      <div className="modal-box w-[540px] max-w-[92%] p-7 max-h-[88vh] overflow-y-auto overflow-x-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-7">
          <span className="text-h2 font-semibold tracking-tight">{mode === 'create' ? 'New Task' : 'Edit Task'}</span>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          {/* Title */}
          <div className="flex flex-col">
            <div className="flex items-center mb-2">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest font-mono">Title</label>
              <MicButton listening={titleMic.listening} onClick={titleMic.toggle} transcribing={titleMic.transcribing} />
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done..."
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="flex flex-col">
            <div className="flex items-center mb-2">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest font-mono">Description</label>
              <MicButton listening={descMic.listening} onClick={descMic.toggle} transcribing={descMic.transcribing} />
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Details, context, acceptance criteria..."
              rows={3}
            />
          </div>

          {/* Model + Priority row */}
          <div className="flex gap-4">
            <div className="flex flex-col flex-1">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2 font-mono">Model</label>
              <div className="flex gap-1 flex-wrap">
                {MODELS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`py-[5px] px-[11px] text-[10px] font-medium rounded-full border
                      cursor-pointer transition-all duration-150 ease-out-expo font-mono tracking-wide
                      ${model === m
                        ? 'shadow-[0_0_8px_rgba(99,102,241,0.06)]'
                        : 'border-border text-text-muted bg-transparent hover:border-border-light hover:text-text-secondary hover:bg-surface-hover'
                      }`}
                    style={model === m ? { background: `${MODEL_COLORS[m]}20`, color: MODEL_COLORS[m], borderColor: `${MODEL_COLORS[m]}40` } : {}}
                    onClick={() => setModel(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col flex-1">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2 font-mono">Priority</label>
              <div className="flex gap-1 flex-wrap">
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`py-[5px] px-[11px] text-[10px] font-medium rounded-full border
                      cursor-pointer transition-all duration-150 ease-out-expo font-mono tracking-wide
                      ${priority === p
                        ? 'shadow-[0_0_8px_rgba(99,102,241,0.06)]'
                        : 'border-border text-text-muted bg-transparent hover:border-border-light hover:text-text-secondary hover:bg-surface-hover'
                      }`}
                    style={priority === p ? { background: `${PRIORITY_COLORS[p]}20`, color: PRIORITY_COLORS[p], borderColor: `${PRIORITY_COLORS[p]}40` } : {}}
                    onClick={() => setPriority(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="flex flex-col">
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2 font-mono">Tags (comma separated)</label>
            <input
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="backend, auth, api..."
            />
          </div>

          {/* Column (create only) */}
          {mode === 'create' && (
            <div className="flex flex-col">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2 font-mono">Column</label>
              <div className="flex gap-1 flex-wrap">
                {COLUMNS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={`py-[5px] px-[11px] text-[10px] font-medium rounded-full border
                      cursor-pointer transition-all duration-150 ease-out-expo font-mono tracking-wide
                      ${column === c.key
                        ? 'border-[rgba(99,102,241,0.2)] text-accent bg-accent-muted shadow-[0_0_8px_rgba(99,102,241,0.06)]'
                        : 'border-border text-text-muted bg-transparent hover:border-border-light hover:text-text-secondary hover:bg-surface-hover'
                      }`}
                    onClick={() => setColumn(c.key)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Schedule (edit mode only) */}
          {mode === 'edit' && task && (
            <TaskScheduleSection projectSlug={projectSlug} wiSlug={wiSlug} task={task} />
          )}

          {/* Output (read-only, shown when task has output from Ralph) */}
          {mode === 'edit' && task?.output && (
            <div className="flex flex-col">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2 font-mono">Output</label>
              <div className="bg-bg border border-border rounded-md py-3 px-3.5 font-mono text-[10px] leading-relaxed text-text-muted max-h-[200px] overflow-y-auto whitespace-pre-wrap break-all shadow-inset">
                {task.output}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            {mode === 'edit' && (
              <button type="button" className="btn-danger" onClick={handleDelete} disabled={loading}>
                <Trash2 size={14} />
                {confirmDelete ? 'Confirm?' : 'Delete'}
              </button>
            )}
            <div className="flex-1" />
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!title.trim() || loading}>
              {loading ? 'Saving...' : mode === 'create' ? 'Create' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ═══ Task Schedule Section ═══ */

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';
const FREQUENCIES = ['once', 'daily', 'weekly', 'biweekly', 'monthly'] as const;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Schedule {
  id: string; frequency: string; time: string;
  dayOfWeek?: number; dayOfMonth?: number; enabled: boolean;
  lastRun: string | null; lastStatus: string | null; nextRun: string | null; runCount: number;
}

function TaskScheduleSection({ projectSlug, wiSlug, task }: { projectSlug: string; wiSlug: string; task: any }) {
  const addToast = useToastStore((s) => s.addToast);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [freq, setFreq] = useState<string>('daily');
  const [time, setTime] = useState('09:00');
  const [dow, setDow] = useState(1);
  const [dom, setDom] = useState(1);
  const [saving, setSaving] = useState(false);

  const fetchSchedule = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/scheduler/task/${projectSlug}/${wiSlug}/${task.id}`);
      const data = await res.json();
      if (data.ok && data.data) setSchedule(data.data);
    } catch {}
  }, [projectSlug, wiSlug, task.id]);

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/api/scheduler/schedules`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectSlug, workItemSlug: wiSlug, taskId: task.id, taskTitle: task.title,
          frequency: freq, time,
          dayOfWeek: (freq === 'weekly' || freq === 'biweekly') ? dow : undefined,
          dayOfMonth: freq === 'monthly' ? dom : undefined,
        }),
      });
      addToast('Schedule saved', 'success');
      setShowForm(false);
      fetchSchedule();
    } catch { addToast('Failed', 'error'); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!schedule) return;
    await fetch(`${API}/api/scheduler/schedules/${schedule.id}`, { method: 'DELETE' });
    setSchedule(null);
    addToast('Schedule removed', 'info');
  };

  const handleToggle = async () => {
    if (!schedule) return;
    await fetch(`${API}/api/scheduler/schedules/${schedule.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !schedule.enabled }),
    });
    fetchSchedule();
  };

  const handleRunNow = async () => {
    if (!schedule) return;
    await fetch(`${API}/api/scheduler/schedules/${schedule.id}/run`, { method: 'POST' });
    addToast('Triggered', 'success');
    fetchSchedule();
  };

  return (
    <div className="flex flex-col">
      <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2 font-mono">
        <Clock size={11} className="inline align-middle mr-1" />
        Schedule
      </label>

      {schedule && !showForm ? (
        <div className="p-3 px-3.5 border border-border rounded-sm bg-bg flex flex-col gap-2 shadow-inset">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-[10px] font-semibold text-accent py-0.5 px-2 rounded-xs bg-accent-muted font-mono uppercase tracking-wide border border-[rgba(99,102,241,0.1)]">
              {schedule.frequency}
            </span>
            <span className="text-xs font-medium text-text font-mono">{schedule.time}</span>
            {schedule.nextRun && (
              <span className="text-[10px] text-text-muted font-mono">Next: {new Date(schedule.nextRun).toLocaleString()}</span>
            )}
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              className="inline-flex items-center gap-[3px] text-xxs font-medium py-[3px] px-2 rounded-xs font-mono text-text-muted border border-border transition-all duration-120 ease-out-expo hover:text-accent hover:border-[rgba(99,102,241,0.2)] hover:bg-accent-muted"
              onClick={handleToggle}
            >
              {schedule.enabled ? <><Pause size={10} /> Pause</> : <><Play size={10} /> Enable</>}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-[3px] text-xxs font-medium py-[3px] px-2 rounded-xs font-mono text-text-muted border border-border transition-all duration-120 ease-out-expo hover:text-accent hover:border-[rgba(99,102,241,0.2)] hover:bg-accent-muted"
              onClick={handleRunNow}
            >
              <Play size={10} /> Run Now
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-[3px] text-xxs font-medium py-[3px] px-2 rounded-xs font-mono text-text-muted border border-border transition-all duration-120 ease-out-expo hover:text-accent hover:border-[rgba(99,102,241,0.2)] hover:bg-accent-muted"
              onClick={() => { setFreq(schedule.frequency); setTime(schedule.time); setShowForm(true); }}
            >
              Edit
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-[3px] text-xxs py-[3px] px-1.5 rounded-xs text-text-muted border border-border transition-all duration-120 ease-out-expo hover:text-danger hover:border-[rgba(248,113,113,0.2)] hover:bg-danger-dim"
              onClick={handleDelete}
            >
              <Trash2 size={10} />
            </button>
          </div>
          {schedule.lastRun && (
            <div className="text-xxs text-text-muted font-mono opacity-60">
              Last: {new Date(schedule.lastRun).toLocaleString()} ({schedule.lastStatus}) — {schedule.runCount} runs
            </div>
          )}
        </div>
      ) : showForm ? (
        <div className="p-3 px-3.5 border border-border rounded-sm bg-bg flex flex-col gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              {FREQUENCIES.map(f => (
                <button
                  key={f}
                  type="button"
                  className={`py-[5px] px-[11px] text-[10px] font-medium rounded-full border
                    cursor-pointer transition-all duration-150 ease-out-expo font-mono tracking-wide
                    ${freq === f
                      ? 'border-[rgba(99,102,241,0.2)] text-accent bg-accent-muted shadow-[0_0_8px_rgba(99,102,241,0.06)]'
                      : 'border-border text-text-muted bg-transparent hover:border-border-light hover:text-text-secondary hover:bg-surface-hover'
                    }`}
                  onClick={() => setFreq(f)}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="time" value={time} onChange={e => setTime(e.target.value)} className="!w-[100px] !font-mono !text-xs" />
            {(freq === 'weekly' || freq === 'biweekly') && (
              <div className="flex gap-1 flex-wrap">
                {DAYS.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    className={`py-[5px] px-[11px] text-[10px] font-medium rounded-full border
                      cursor-pointer transition-all duration-150 ease-out-expo font-mono tracking-wide
                      ${dow === i
                        ? 'border-[rgba(99,102,241,0.2)] text-accent bg-accent-muted shadow-[0_0_8px_rgba(99,102,241,0.06)]'
                        : 'border-border text-text-muted bg-transparent hover:border-border-light hover:text-text-secondary hover:bg-surface-hover'
                      }`}
                    onClick={() => setDow(i)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
            {freq === 'monthly' && (
              <input type="number" min={1} max={31} value={dom} onChange={e => setDom(Number(e.target.value))} className="!w-[100px] !font-mono !text-xs" placeholder="Day" />
            )}
          </div>
          <div className="flex justify-end gap-1.5">
            <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Schedule'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-label font-medium text-text-muted py-2 px-3 border border-dashed border-border rounded-sm w-full transition-all duration-150 ease-out-expo font-mono hover:border-accent hover:text-accent hover:bg-accent-muted"
          onClick={() => setShowForm(true)}
        >
          <Clock size={12} /> Add Schedule
        </button>
      )}
    </div>
  );
}
