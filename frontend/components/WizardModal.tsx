'use client';

import { useState, useMemo } from 'react';
import { X, ChevronRight, ChevronLeft, SkipForward, RefreshCw, Trash2, GripVertical } from 'lucide-react';
import { useWorkItemStore, WorkItem } from '@/stores/workItemStore';
import { useRouterStore } from '@/stores/routerStore';
import { useToastStore } from '@/stores/toastStore';
import { useModalOverlay } from '@/hooks/useModalOverlay';
import { api } from '@/lib/api';

type Category = 'feature' | 'bug' | 'refactor';

const CATEGORIES = [
  { key: 'feature' as const, icon: '\u2726', label: 'Feature', desc: 'New functionality', color: '#6366f1' },
  { key: 'bug' as const, icon: '\u25CF', label: 'Bug', desc: 'Fix a defect', color: '#ef4444' },
  { key: 'refactor' as const, icon: '\u25C6', label: 'Refactor', desc: 'Improve existing code', color: '#f59e0b' },
];

const STEP_LABELS = ['Category', 'Context', 'Prompt', 'Plan', 'Tasks'];

interface GeneratedTask {
  title: string;
  description: string;
  model: string;
  priority: string;
  tags: string[];
}

interface Props {
  projectSlug: string;
  onClose: () => void;
}

export function WizardModal({ projectSlug, onClose }: Props) {
  const { workItems, createWorkItem, fetchWorkItems } = useWorkItemStore();
  const goToWorkItem = useRouterStore((s) => s.goToWorkItem);
  const addToast = useToastStore((s) => s.addToast);

  // Wizard state
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<Category>('feature');
  const [linkedWI, setLinkedWI] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [plan, setPlan] = useState('');
  const [planEditing, setPlanEditing] = useState(false);
  const [tasks, setTasks] = useState<GeneratedTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [planSource, setPlanSource] = useState<'claude' | 'fallback' | null>(null);
  const [tasksSource, setTasksSource] = useState<'claude' | 'fallback' | null>(null);
  const [sourceReason, setSourceReason] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { overlayProps } = useModalOverlay(onClose, { disabled: loading || creating });

  // Features for linking (step 2)
  const features = useMemo(
    () => workItems.filter((wi) => wi.category === 'feature'),
    [workItems]
  );

  const canNext = () => {
    if (step === 0) return true;
    if (step === 1) return true; // link is optional
    if (step === 2) return prompt.trim().length > 0;
    if (step === 3) return plan.trim().length > 0;
    if (step === 4) return tasks.length > 0;
    return false;
  };

  const handleNext = async () => {
    if (step === 0) {
      // Skip step 1 for features (no linking needed)
      setStep(category === 'feature' ? 2 : 1);
      return;
    }
    if (step === 1) {
      setStep(2);
      return;
    }
    if (step === 2) {
      // Generate plan
      setLoading(true);
      setPlanSource(null);
      setSourceReason(null);
      try {
        const res = await fetch(`http://localhost:5555/api/generate/plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, prompt, linkedWorkItem: linkedWI }),
        });
        const data = await res.json();
        setPlan(data.data?.plan || '');
        setPlanSource(data.data?.source || 'fallback');
        if (data.data?.reason) setSourceReason(data.data.reason);
      } catch {
        setPlan('');
        setPlanSource('fallback');
        setSourceReason('Network error — could not reach server');
      }
      setLoading(false);
      setStep(3);
      return;
    }
    if (step === 3) {
      // Generate tasks
      setLoading(true);
      setTasksSource(null);
      setSourceReason(null);
      try {
        const res = await fetch(`http://localhost:5555/api/generate/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, prompt, plan }),
        });
        const data = await res.json();
        setTasks(data.data?.tasks || generateFallbackTasks());
        setTasksSource(data.data?.source || 'fallback');
        if (data.data?.reason) setSourceReason(data.data.reason);
      } catch {
        setTasks(generateFallbackTasks());
        setTasksSource('fallback');
        setSourceReason('Network error — could not reach server');
      }
      setLoading(false);
      setStep(4);
      return;
    }
  };

  const handleBack = () => {
    if (step === 2 && category === 'feature') {
      setStep(0);
    } else {
      setStep(Math.max(0, step - 1));
    }
  };

  const handleSkip = () => {
    if (step === 2) {
      // Skip prompt -> go straight to create with single task
      setPlan('');
      setTasks([]);
      setStep(4);
      return;
    }
    if (step === 3) {
      // Skip plan -> create single task from prompt
      setTasks([{
        title: prompt.split('\n')[0].substring(0, 80) || 'Implement solution',
        description: prompt,
        model: 'sonnet',
        priority: 'medium',
        tags: [],
      }]);
      setStep(4);
      return;
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      // Derive title from prompt (first line or first 60 chars)
      const title = prompt.split('\n')[0].substring(0, 80) || 'Untitled';

      const wi = await createWorkItem(projectSlug, {
        title,
        category,
        linkedWorkItem: linkedWI,
        plan: {
          prompt,
          content: plan || undefined,
          status: plan ? 'approved' : 'empty',
          generatedBy: plan ? 'claude' : undefined,
        },
      });

      // Create tasks -- if none generated but prompt exists, create one from prompt
      const finalTasks = tasks.length > 0 ? tasks : (prompt.trim() ? [{
        title: prompt.split('\n')[0].substring(0, 80),
        description: prompt,
        model: 'sonnet',
        priority: 'medium',
        tags: [] as string[],
      }] : []);

      for (const task of finalTasks) {
        await api.createTask(projectSlug, wi.slug, {
          title: task.title,
          description: task.description,
          model: task.model,
          priority: task.priority,
          tags: task.tags.length > 0 ? task.tags : undefined,
          column: 'todo',
        });
      }

      await fetchWorkItems(projectSlug);
      addToast(`Work item created with ${tasks.length} tasks`, 'success');
      onClose();
      goToWorkItem(projectSlug, wi.slug);
    } catch (err) {
      addToast('Failed to create work item', 'error');
      setCreating(false);
    }
  };

  const generateFallbackTasks = (): GeneratedTask[] => {
    const lines = plan.split('\n').filter((l) => /^\d+\./.test(l.trim()));
    if (lines.length === 0) {
      return [{ title: 'Implement solution', description: '', model: 'sonnet', priority: 'medium', tags: [] }];
    }
    return lines.map((line) => ({
      title: line.replace(/^\d+\.\s*/, '').trim(),
      description: '',
      model: 'sonnet',
      priority: 'medium',
      tags: [],
    }));
  };

  const removeTask = (idx: number) => setTasks((t) => t.filter((_, i) => i !== idx));

  const updateTask = (idx: number, field: string, value: string) => {
    setTasks((t) => t.map((task, i) => i === idx ? { ...task, [field]: value } : task));
  };

  // --- Determine visual step index for the indicator (skip step 1 for features) ---
  const visualSteps = category === 'feature'
    ? ['Category', 'Prompt', 'Plan', 'Tasks']
    : STEP_LABELS;
  const visualStep = category === 'feature'
    ? (step === 0 ? 0 : step - 1)
    : step;

  return (
    <div className="glass-overlay" {...overlayProps}>
      <div className="modal-box w-[620px] max-w-[92%] min-h-[460px] flex flex-col max-h-[88vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-7 pt-6">
          <span className="text-h2 font-semibold tracking-tight">Create Work Item</span>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-7 px-7 pt-6 pb-4">
          {visualSteps.map((label, i) => (
            <div key={label} className="flex flex-col items-center gap-1.5">
              <div
                className={`w-2 h-2 rounded-full transition-all duration-300 ease-out-expo
                  ${i <= visualStep
                    ? 'bg-accent border-[1.5px] border-accent shadow-[0_0_8px_var(--accent-glow)]'
                    : 'bg-[rgba(148,163,242,0.1)] border-[1.5px] border-[rgba(148,163,242,0.1)]'
                  }
                  ${i === visualStep ? 'shadow-[0_0_0_4px_var(--accent-muted),0_0_12px_var(--accent-glow)]' : ''}`}
              />
              <span className={`text-xxs font-semibold uppercase tracking-widest font-mono transition-colors duration-200 ease-out-expo
                ${i === visualStep ? 'text-text' : 'text-text-muted'}`}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="flex-1 px-7 overflow-y-auto">
          {/* Step 0: Category */}
          {step === 0 && (
            <div>
              <p className="text-sm font-medium text-text mb-4 tracking-tight">What type of work item?</p>
              <div className="grid grid-cols-3 gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    className={`flex flex-col items-center gap-2 py-6 px-3.5 pb-5
                      bg-transparent border border-border rounded-md cursor-pointer
                      transition-all duration-[280ms] ease-out-expo text-center relative overflow-hidden
                      before:content-[''] before:absolute before:top-0 before:left-[20%] before:right-[20%] before:h-px
                      before:bg-gradient-to-r before:from-transparent before:via-white/[0.025] before:to-transparent before:pointer-events-none
                      hover:border-border-light hover:bg-surface-hover hover:-translate-y-[3px] hover:shadow-[0_8px_24px_rgba(0,0,0,0.25)]
                      ${category === cat.key ? 'border-[1.5px]' : ''}`}
                    style={category === cat.key ? { borderColor: cat.color, background: `${cat.color}12` } : {}}
                    onClick={() => setCategory(cat.key)}
                  >
                    <span className="text-2xl drop-shadow-[0_0_4px_currentColor]" style={{ color: cat.color }}>{cat.icon}</span>
                    <span className="text-body font-semibold text-text tracking-tight">{cat.label}</span>
                    <span className="text-[10px] text-text-muted leading-snug">{cat.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Context (bug/refactor only) */}
          {step === 1 && (
            <div>
              <p className="text-sm font-medium text-text mb-4 tracking-tight">Link to an existing feature? (optional)</p>
              <div className="flex flex-col gap-1 max-h-[280px] overflow-y-auto">
                {features.length === 0 ? (
                  <div className="text-center text-text-muted text-xs py-10 opacity-50">No features to link</div>
                ) : (
                  features.map((wi) => (
                    <button
                      key={wi.id}
                      className={`flex items-center gap-2.5 py-2.5 px-3.5 border border-border rounded-sm cursor-pointer
                        transition-all duration-200 ease-out-expo text-left w-full
                        hover:border-border-light hover:bg-surface-hover hover:translate-x-0.5
                        ${linkedWI === wi.id ? 'border-[rgba(99,102,241,0.2)] bg-[rgba(99,102,241,0.04)]' : ''}`}
                      onClick={() => setLinkedWI(linkedWI === wi.id ? null : wi.id)}
                    >
                      <span className="text-accent">{'\u2726'}</span>
                      <span className="text-body text-text">{wi.title}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Step 2: Prompt */}
          {step === 2 && (
            <div>
              <p className="text-sm font-medium text-text mb-4 tracking-tight">Describe what you need</p>
              <textarea
                className="w-full min-h-[140px] resize-y"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  category === 'feature' ? 'Describe the feature, its requirements, and expected behavior...' :
                  category === 'bug' ? 'Describe the bug, steps to reproduce, and expected vs actual behavior...' :
                  'Describe what needs improvement and the desired outcome...'
                }
                rows={6}
                autoFocus
              />
              <p className="text-[10px] text-text-muted mt-2 font-mono opacity-60">Be specific about requirements, constraints, and expected behavior.</p>
            </div>
          )}

          {/* Step 3: Plan */}
          {step === 3 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-text tracking-tight">{plan ? 'Generated Plan' : 'No plan'}</p>
                  {planSource && (
                    <span className={`inline-flex items-center gap-1 text-xxs font-semibold py-0.5 px-2 rounded-full font-mono tracking-wide border
                      ${planSource === 'claude'
                        ? 'text-accent bg-accent-muted border-[rgba(99,102,241,0.15)]'
                        : 'text-warning bg-warning-dim border-[rgba(251,191,36,0.15)]'
                      }`}>
                      {planSource === 'claude' ? '\u2B21 Claude' : '\u26A0 Fallback'}
                    </span>
                  )}
                </div>
                {plan && (
                  <button
                    className="text-label text-accent py-[3px] px-2.5 rounded-sm transition-all duration-150 ease-out-expo font-mono hover:bg-accent-muted"
                    onClick={() => setPlanEditing(!planEditing)}
                  >
                    {planEditing ? 'Preview' : 'Edit'}
                  </button>
                )}
              </div>
              {loading ? (
                <div className="flex flex-col gap-2.5 py-3">
                  {[80, 100, 60, 90, 70].map((w, i) => (
                    <div key={i} className="skeleton-element h-3.5 rounded" style={{ width: `${w}%` }} />
                  ))}
                </div>
              ) : planEditing ? (
                <textarea
                  className="w-full min-h-[140px] resize-y"
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  rows={10}
                />
              ) : (
                <div className="bg-bg border border-border rounded-md p-4 text-xs text-text-secondary leading-[1.7] whitespace-pre-wrap max-h-[280px] overflow-y-auto shadow-inset">
                  {plan || 'Skip to create without a plan.'}
                </div>
              )}
              {planSource === 'fallback' && sourceReason && (
                <p className="text-[10px] text-warning mb-2 py-2 px-3 bg-[rgba(251,191,36,0.04)] rounded-sm border-l-2 border-warning font-mono">
                  Claude CLI not available: {sourceReason}
                </p>
              )}
            </div>
          )}

          {/* Step 4: Tasks */}
          {step === 4 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <p className="text-sm font-medium text-text tracking-tight">
                  {tasks.length > 0 ? `${tasks.length} tasks generated` : 'No tasks'}
                </p>
                {tasksSource && (
                  <span className={`inline-flex items-center gap-1 text-xxs font-semibold py-0.5 px-2 rounded-full font-mono tracking-wide border
                    ${tasksSource === 'claude'
                      ? 'text-accent bg-accent-muted border-[rgba(99,102,241,0.15)]'
                      : 'text-warning bg-warning-dim border-[rgba(251,191,36,0.15)]'
                    }`}>
                    {tasksSource === 'claude' ? '\u2B21 Claude' : '\u26A0 Fallback'}
                  </span>
                )}
              </div>
              {tasksSource === 'fallback' && sourceReason && (
                <p className="text-[10px] text-warning mb-2 py-2 px-3 bg-[rgba(251,191,36,0.04)] rounded-sm border-l-2 border-warning font-mono">
                  Claude CLI not available: {sourceReason}
                </p>
              )}
              {loading ? (
                <div className="flex flex-col gap-2.5 py-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="skeleton-element h-12 w-full rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 max-h-[320px] overflow-y-auto">
                  {tasks.map((task, idx) => (
                    <div key={idx} className="group bg-card border border-border rounded-sm py-2.5 px-3 transition-all duration-200 ease-out-expo relative
                      before:content-[''] before:absolute before:top-0 before:left-2.5 before:right-2.5 before:h-px
                      before:bg-gradient-to-r before:from-transparent before:via-white/[0.02] before:to-transparent before:pointer-events-none">
                      <div className="flex items-center gap-2">
                        <GripVertical size={14} className="text-text-muted cursor-grab shrink-0 opacity-40 group-hover:opacity-100 transition-opacity duration-150" />
                        <input
                          className="flex-1 bg-transparent border-none text-body font-medium text-text py-0.5 px-0 shadow-none focus:outline-none focus:border-b focus:border-[rgba(99,102,241,0.3)] focus:shadow-none"
                          value={task.title}
                          onChange={(e) => updateTask(idx, 'title', e.target.value)}
                        />
                        <button
                          className="text-text-muted p-[3px] rounded opacity-0 group-hover:opacity-100 transition-all duration-120 ease-out-expo hover:text-danger hover:bg-danger-dim"
                          onClick={() => removeTask(idx)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5 ml-[22px] text-[10px] text-text-muted font-mono">
                        <span>&#x25C8; {task.model}</span>
                        <span>&#x25CF; {task.priority}</span>
                        {task.tags.map((t) => (
                          <span key={t} className="bg-pill py-px px-1.5 rounded-xs text-xxs border border-[rgba(148,163,242,0.03)]">#{t}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button
                    className="py-3 border border-dashed border-[rgba(148,163,242,0.08)] rounded-sm text-label text-text-muted text-center transition-all duration-200 ease-out-expo font-mono tracking-wide
                      hover:border-[rgba(99,102,241,0.2)] hover:text-accent hover:bg-accent-muted"
                    onClick={() => setTasks([...tasks, { title: '', description: '', model: 'sonnet', priority: 'medium', tags: [] }])}
                  >
                    + Add task manually
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2 px-7 py-5 border-t border-border relative
          before:content-[''] before:absolute before:top-0 before:left-[10%] before:right-[10%] before:h-px
          before:bg-gradient-to-r before:from-transparent before:via-[rgba(148,163,242,0.04)] before:to-transparent">
          {step > 0 && step < 4 && (
            <button
              className="inline-flex items-center gap-1 text-label text-text-muted py-[5px] px-2.5 rounded-sm transition-all duration-150 ease-out-expo font-mono hover:text-text-secondary hover:bg-surface-hover"
              onClick={handleSkip}
            >
              <SkipForward size={14} />
              Skip
            </button>
          )}
          <div className="flex-1" />
          {step > 0 && (
            <button className="btn-ghost" onClick={handleBack}>
              <ChevronLeft size={14} />
              Back
            </button>
          )}
          {step < 4 ? (
            <button className="btn-primary" onClick={handleNext} disabled={!canNext() || loading}>
              {loading ? 'Generating...' : 'Next'}
              {!loading && <ChevronRight size={14} />}
            </button>
          ) : (
            <button className="btn-primary" onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating...' : 'Create Work Item'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
