'use client';

import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { ChevronLeft, ChevronDown, Plus, Pencil, Search, Play, Square } from 'lucide-react';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { attachClosestEdge, extractClosestEdge, type Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { useWorkItemStore, WorkItem } from '@/stores/workItemStore';
import { useRouterStore } from '@/stores/routerStore';
import { useToastStore } from '@/stores/toastStore';
import { api } from '@/lib/api';
import { TaskModal } from './TaskModal';
import { FilterBar, FilterState, EMPTY_FILTER, isFiltered, matchesFilter } from './FilterBar';
import { useAppStore } from '@/stores/appStore';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';

const CATEGORIES = {
  feature: { color: '#6366f1', icon: '\u2726', label: 'FEAT' },
  bug:     { color: '#ef4444', icon: '\u25CF', label: 'BUG' },
  refactor:{ color: '#f59e0b', icon: '\u25C6', label: 'REF' },
} as const;

const TASK_COLUMNS = [
  { key: 'backlog',     label: 'Backlog' },
  { key: 'todo',        label: 'To Do' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'review',      label: 'Review' },
  { key: 'done',        label: 'Done' },
];

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#f43f5e', high: '#f59e0b', medium: '#6366f1', low: '#71717a',
};

// --- Draggable Task Card ---

function TaskCard({ task, columnKey, projectSlug, wiSlug, onEdit, onToggle, index, onDropOnCard }: {
  task: any;
  columnKey: string;
  projectSlug: string;
  wiSlug: string;
  onEdit: () => void;
  onToggle: () => void;
  index: number;
  onDropOnCard: (taskId: string, fromColumn: string, toColumn: string, toIndex: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cleanupDrag = draggable({
      element: el,
      getInitialData: () => ({ type: 'task', taskId: task.id, fromColumn: columnKey, fromIndex: index }),
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false),
    });
    const cleanupDrop = dropTargetForElements({
      element: el,
      getData: ({ input, element }) => {
        return attachClosestEdge(
          { type: 'task-card', taskId: task.id, columnKey, index },
          { input, element, allowedEdges: ['top', 'bottom'] }
        );
      },
      canDrop: ({ source }) => source.data.type === 'task' && source.data.taskId !== task.id,
      onDragEnter: ({ self }) => setClosestEdge(extractClosestEdge(self.data)),
      onDrag: ({ self }) => setClosestEdge(extractClosestEdge(self.data)),
      onDragLeave: () => setClosestEdge(null),
      onDrop: ({ source, self }) => {
        setClosestEdge(null);
        const draggedTaskId = source.data.taskId as string;
        const fromColumn = source.data.fromColumn as string;
        const fromIndex = source.data.fromIndex as number;
        const edge = extractClosestEdge(self.data);

        // Calculate target index
        let targetIndex = index;
        if (edge === 'bottom') targetIndex = index + 1;

        // Adjust for same-column moves: if dragging from above, removing it shifts indices down
        if (fromColumn === columnKey && fromIndex < targetIndex) {
          targetIndex--;
        }

        onDropOnCard(draggedTaskId, fromColumn, columnKey, targetIndex);
      },
    });
    return () => { cleanupDrag(); cleanupDrop(); };
  }, [task.id, columnKey, index, onDropOnCard]);

  const priorityColor = PRIORITY_COLORS[task.priority] || 'transparent';
  const hasMeta = task.priority || task.model || task.agent || task.tags?.length || task.output;

  return (
    <div
      ref={ref}
      className={`
        flex bg-card border border-border rounded-md cursor-pointer
        shadow-card overflow-hidden
        hover:-translate-y-[3px] hover:shadow-card-hover hover:border-border-light
        transition-all duration-200 ease-out-expo
        animate-stagger-in
        before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]
        before:rounded-l-[3px] before:bg-[var(--priority-color)]
        before:transition-[background] before:duration-300 before:ease-out-expo
        relative
        ${task.completed ? 'opacity-40' : ''}
        ${dragging ? 'opacity-20 scale-95 rotate-2 shadow-drag' : ''}
      `}
      style={{ animationDelay: `${index * 60}ms`, '--priority-color': task.priority ? priorityColor : 'var(--border)' } as React.CSSProperties}
      onClick={onEdit}
    >
      {/* Drop edge indicators */}
      {closestEdge === 'top' && (
        <div className="absolute top-0 left-1 right-1 h-[2px] bg-accent rounded-full z-10 shadow-[0_0_6px_var(--accent-glow)]" style={{ transform: 'translateY(-1px)' }} />
      )}
      {closestEdge === 'bottom' && (
        <div className="absolute bottom-0 left-1 right-1 h-[2px] bg-accent rounded-full z-10 shadow-[0_0_6px_var(--accent-glow)]" style={{ transform: 'translateY(1px)' }} />
      )}
      <div className="flex-1 pl-[15px] pr-3 py-2.5 min-w-0">
        {/* Header row: checkbox + title */}
        <div className="flex items-start gap-2.5">
          <span
            className={`
              w-[15px] h-[15px] rounded-full shrink-0 mt-0.5
              flex items-center justify-center cursor-pointer
              transition-all duration-150 ease-out-expo
              ${task.completed
                ? 'bg-accent border-[1.5px] border-accent'
                : 'border-[1.5px] border-border-light hover:border-accent hover:bg-accent-muted'
              }
            `}
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
          >
            {task.completed && <span className="text-white text-[8px] leading-none">&#10003;</span>}
          </span>
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <span className={`
              text-[12.5px] font-medium text-text
              overflow-hidden text-ellipsis whitespace-nowrap
              leading-[1.4] tracking-[-0.01em]
              ${task.completed ? 'line-through !text-text-muted' : ''}
            `}>
              {task.title}
            </span>
            {task.description && (
              <span className="text-[10.5px] text-text-muted overflow-hidden text-ellipsis whitespace-nowrap mt-1.5 leading-[1.3]">
                {task.description}
              </span>
            )}
          </div>
        </div>

        {/* Footer: meta chips + tags */}
        {hasMeta && (
          <>
            <div
              className="h-px my-2"
              style={{ background: 'linear-gradient(90deg, var(--border), transparent 80%)' }}
            />
            <div className="flex items-center gap-1 flex-wrap">
              <span className="inline-flex items-center px-[7px] py-px rounded-xs text-xxs font-medium font-mono tracking-[0.02em] border text-accent bg-accent-muted border-[rgba(99,102,241,0.1)] uppercase">
                {task.model}
              </span>
              {task.priority && (
                <span
                  className="inline-flex items-center px-[7px] py-px rounded-xs text-xxs font-semibold font-mono tracking-[0.02em] border bg-transparent uppercase"
                  style={{ color: priorityColor, borderColor: `${priorityColor}30` }}
                >
                  {task.priority}
                </span>
              )}
              {task.agent && (
                <span className="inline-flex items-center px-[7px] py-px rounded-xs text-xxs font-medium font-mono tracking-[0.02em] border text-info bg-[rgba(96,165,250,0.05)] border-[rgba(96,165,250,0.08)]">
                  {task.agent}
                </span>
              )}
              {task.tags?.map((tag: string) => (
                <span key={tag} className="inline-flex items-center px-[7px] py-px rounded-xs text-xxs font-medium font-mono tracking-[0.02em] border border-border text-text-muted bg-pill">
                  {tag}
                </span>
              ))}
              {task.output && (
                <span className="inline-flex items-center px-[7px] py-px rounded-xs text-[8px] font-semibold font-mono tracking-[0.04em] border text-success bg-success-dim border-[rgba(52,211,153,0.08)] uppercase">
                  output
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// --- Drop Target Column ---

function TaskColumn({ columnKey, label, tasks, projectSlug, wiSlug, onDrop, onEditTask, onToggleTask, onAddTask }: {
  columnKey: string;
  label: string;
  tasks: any[];
  projectSlug: string;
  wiSlug: string;
  onDrop: (taskId: string, fromColumn: string, toColumn: string, toIndex: number) => void;
  onEditTask: (task: any) => void;
  onToggleTask: (taskId: string, completed: boolean, fromColumn: string) => void;
  onAddTask: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      getData: () => ({ columnKey, type: 'column' }),
      canDrop: ({ source }) => source.data.type === 'task',
      onDragEnter: () => setOver(true),
      onDragLeave: () => setOver(false),
      onDrop: ({ source, location }) => {
        setOver(false);
        // Only handle if NOT dropped on a card (card handles its own drop)
        const droppedOnCard = location.current.dropTargets.some(
          (t) => t.data.type === 'task-card'
        );
        if (droppedOnCard) return;

        const taskId = source.data.taskId as string;
        const fromColumn = source.data.fromColumn as string;
        // Drop at end of column
        onDrop(taskId, fromColumn, columnKey, tasks.length);
      },
    });
  }, [columnKey, tasks.length, onDrop]);

  return (
    <div className="flex flex-col min-w-[200px] gap-1.5 overflow-hidden group">
      <div className="flex items-center gap-2 px-1.5 py-2 mb-1">
        <span className="text-data font-semibold text-text-muted uppercase tracking-[0.08em] font-mono">
          {label}
        </span>
        <span className="text-xxs text-text-muted bg-pill px-1.5 py-0.5 rounded-xs font-mono font-medium">
          {tasks.length}
        </span>
        <button
          className="ml-auto inline-flex items-center justify-center w-5 h-5 rounded-xs text-text-muted opacity-0 group-hover:opacity-100 hover:bg-surface-hover hover:text-text-secondary transition-all duration-150"
          onClick={onAddTask}
          title="Add task"
        >
          <Plus size={14} />
        </button>
      </div>
      <div
        ref={ref}
        className={`
          flex-1 overflow-y-auto flex flex-col gap-1.5 p-0.5 rounded-sm
          transition-all duration-250 ease-out-expo
          ${over ? 'bg-[rgba(99,102,241,0.04)] outline outline-[1.5px] outline-dashed outline-[rgba(99,102,241,0.2)] -outline-offset-1' : ''}
        `}
      >
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center h-14 text-text-muted text-data border border-dashed border-[rgba(148,163,242,0.06)] rounded-sm font-mono tracking-[0.02em]">
            {over ? 'Drop here' : 'Empty'}
          </div>
        ) : (
          tasks.map((task: any, index: number) => (
            <TaskCard
              key={task.id}
              task={task}
              columnKey={columnKey}
              projectSlug={projectSlug}
              wiSlug={wiSlug}
              onEdit={() => onEditTask(task)}
              onToggle={() => onToggleTask(task.id, task.completed, columnKey)}
              index={index}
              onDropOnCard={onDrop}
            />
          ))
        )}
      </div>
    </div>
  );
}

// --- Main Board ---

interface Props {
  projectSlug: string;
  wiSlug: string;
}

export function TaskBoard({ projectSlug, wiSlug }: Props) {
  const goBack = useRouterStore((s) => s.goBack);
  const { workItems, fetchWorkItems } = useWorkItemStore();
  const addToast = useToastStore((s) => s.addToast);
  const ralph = useAppStore((s) => s.ralph);
  const [planOpen, setPlanOpen] = useState(false);
  const [planEditing, setPlanEditing] = useState(false);
  const [planDraft, setPlanDraft] = useState('');
  const [taskModal, setTaskModal] = useState<{ mode: 'create'; column: string } | { mode: 'edit'; task: any } | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [showOutput, setShowOutput] = useState(false);

  const isRalphRunning = ralph.status === 'running' || ralph.status === 'paused';
  const isRalphForThisWI = ralph.workItemSlug === wiSlug || ralph.projectSlug === projectSlug;

  useEffect(() => {
    fetchWorkItems(projectSlug);
  }, [projectSlug, fetchWorkItems]);

  const wi = useMemo(
    () => workItems.find((w) => w.slug === wiSlug || w.id === wiSlug),
    [workItems, wiSlug]
  );

  const handleRunRalph = useCallback(async () => {
    if (!wi) return;
    try {
      await fetch(`${API}/api/ralph/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectSlug, workItemSlug: wi.slug }),
      });
      setShowOutput(true);
      addToast('Ralph started', 'success');
    } catch { addToast('Failed to start', 'error'); }
  }, [wi, projectSlug, addToast]);

  const handleStopRalph = useCallback(async () => {
    await fetch(`${API}/api/ralph/stop`, { method: 'POST' });
  }, []);

  const handleMoveTask = useCallback(async (taskId: string, _fromColumn: string, toColumn: string, toIndex: number) => {
    if (!wi) return;
    try {
      await api.moveTask(projectSlug, wi.slug, taskId, { toColumn, toIndex });
      fetchWorkItems(projectSlug);
      addToast('Task moved', 'success');
    } catch (err) {
      console.error('Failed to move task:', err);
      addToast('Failed to move task', 'error');
    }
  }, [wi, projectSlug, fetchWorkItems, addToast]);

  const handleToggleComplete = useCallback(async (taskId: string, currentCompleted: boolean, fromColumn: string) => {
    if (!wi) return;
    try {
      if (!currentCompleted) {
        // Mark complete → move to done (backend saves previousColumn automatically)
        await api.moveTask(projectSlug, wi.slug, taskId, { toColumn: 'done', toIndex: 0 });
      } else {
        // Uncheck from done → find task to get previousColumn
        const task = (wi.columns['done'] || []).find((t: any) => t.id === taskId);
        const restoreColumn = task?.previousColumn || 'backlog';
        await api.moveTask(projectSlug, wi.slug, taskId, { toColumn: restoreColumn, toIndex: 0 });
      }
      fetchWorkItems(projectSlug);
    } catch (err) {
      console.error('Failed to toggle task:', err);
      addToast('Failed to move task', 'error');
    }
  }, [wi, projectSlug, fetchWorkItems, addToast]);

  const handleTaskSaved = useCallback(() => {
    setTaskModal(null);
    fetchWorkItems(projectSlug);
    addToast(taskModal?.mode === 'create' ? 'Task created' : 'Task updated', 'success');
  }, [projectSlug, fetchWorkItems, addToast, taskModal?.mode]);

  const handleTaskDeleted = useCallback(() => {
    setTaskModal(null);
    fetchWorkItems(projectSlug);
    addToast('Task deleted', 'success');
  }, [projectSlug, fetchWorkItems, addToast]);

  const handlePlanEdit = useCallback(() => {
    if (!wi) return;
    setPlanDraft(wi.plan.content || '');
    setPlanEditing(true);
    setPlanOpen(true);
  }, [wi]);

  const handlePlanSave = useCallback(async () => {
    if (!wi) return;
    try {
      await api.updateWorkItem(projectSlug, wi.slug, {
        plan: { content: planDraft, status: planDraft.trim() ? 'approved' : 'empty' },
      });
      fetchWorkItems(projectSlug);
      setPlanEditing(false);
      addToast('Plan updated', 'success');
    } catch {
      addToast('Failed to save plan', 'error');
    }
  }, [wi, projectSlug, planDraft, fetchWorkItems, addToast]);

  // Compute tags across all columns for filter dropdown
  const allTags = useMemo(() => {
    if (!wi) return [];
    const tagSet = new Set<string>();
    for (const col of Object.values(wi.columns)) {
      for (const task of col as any[]) {
        (task.tags || []).forEach((t: string) => tagSet.add(t));
      }
    }
    return Array.from(tagSet).sort();
  }, [wi]);

  // Count total vs filtered
  const { totalCount, filteredCount } = useMemo(() => {
    if (!wi) return { totalCount: 0, filteredCount: 0 };
    let total = 0, filtered = 0;
    const active = isFiltered(filter);
    for (const col of Object.values(wi.columns)) {
      for (const task of col as any[]) {
        total++;
        if (!active || matchesFilter(task, filter)) filtered++;
      }
    }
    return { totalCount: total, filteredCount: active ? filtered : total };
  }, [wi, filter]);

  if (!wi) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-body">
        Loading...
      </div>
    );
  }

  const cat = CATEGORIES[wi.category];
  const progress = (() => {
    let total = 0, completed = 0;
    for (const col of Object.values(wi.columns)) {
      total += col.length;
      completed += col.filter((t: any) => t.completed).length;
    }
    return { completed, total, percent: total === 0 ? 0 : Math.round((completed / total) * 100) };
  })();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0 bg-bg">
        <button
          className="inline-flex items-center gap-1 text-label text-text-muted px-2.5 py-[5px] rounded-sm transition-all duration-150 hover:bg-surface-hover hover:text-text"
          onClick={goBack}
        >
          <ChevronLeft size={16} />
          Back
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-h2 shrink-0" style={{ color: cat.color }}>{cat.icon}</span>
          <span className="text-h2 font-semibold whitespace-nowrap overflow-hidden text-ellipsis tracking-[-0.02em]">
            {wi.title}
          </span>
          <span className={`badge badge-${wi.category}`}>{cat.label}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="w-[100px] h-[3px] rounded-[3px] bg-[rgba(148,163,242,0.06)] overflow-hidden">
            <div
              className="h-full rounded-[3px] transition-[width] duration-[800ms] ease-out-expo"
              style={{ width: `${progress.percent}%`, background: cat.color }}
            />
          </div>
          <span className="text-data text-text-muted whitespace-nowrap font-mono">
            {progress.completed}/{progress.total}
          </span>
        </div>

        <button
          className={`
            inline-flex items-center gap-1 text-label font-medium text-text-muted
            px-2.5 py-[5px] rounded-sm border border-border
            transition-all duration-150 hover:bg-surface-hover hover:text-text-secondary
            ${planOpen ? '[&_svg]:rotate-180' : ''}
          `}
          onClick={() => { if (planEditing) return; setPlanOpen(!planOpen); }}
        >
          Plan <ChevronDown size={14} className="transition-transform duration-250 ease-out-expo" />
        </button>

        <button
          className={`btn-icon ${showFilter ? '!text-accent !bg-accent-muted' : ''}`}
          onClick={() => setShowFilter(!showFilter)}
          title="Filter (Ctrl+F)"
        >
          <Search size={16} />
        </button>

        <button className="btn-primary" onClick={() => setTaskModal({ mode: 'create', column: 'backlog' })}>
          <Plus size={16} />
          Task
        </button>

        {isRalphRunning && isRalphForThisWI ? (
          <button
            className="inline-flex items-center gap-[5px] px-3.5 py-1.5 border border-[rgba(248,113,113,0.2)] text-danger text-label font-semibold rounded-sm transition-all duration-150 ease-out-expo hover:bg-danger-dim hover:shadow-[0_0_16px_rgba(248,113,113,0.08)]"
            onClick={handleStopRalph}
          >
            <Square size={14} /> Stop
          </button>
        ) : (
          <button
            className="inline-flex items-center gap-[5px] px-3.5 py-1.5 text-white text-label font-semibold rounded-sm transition-all duration-150 ease-out-expo tracking-[0.01em] relative overflow-hidden
              bg-gradient-to-br from-emerald-600 to-emerald-400
              before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/15 before:to-transparent before:pointer-events-none
              hover:enabled:shadow-[0_0_20px_rgba(52,211,153,0.25)] hover:enabled:-translate-y-px
              disabled:opacity-20 disabled:cursor-not-allowed disabled:saturate-50 disabled:transform-none disabled:shadow-none"
            onClick={handleRunRalph}
            disabled={!wi.columns['todo'] || wi.columns['todo'].length === 0}
            title={wi.columns['todo']?.length ? `Run ${wi.columns['todo'].length} tasks` : 'No tasks in To Do'}
          >
            <Play size={14} /> Run
          </button>
        )}
      </div>

      {/* Filter bar */}
      {showFilter && (
        <FilterBar
          filter={filter}
          onChange={setFilter}
          allTags={allTags}
          totalCount={totalCount}
          filteredCount={filteredCount}
        />
      )}

      {/* Plan panel */}
      {planOpen && (
        <div className="border-b border-border bg-surface">
          {planEditing ? (
            <div className="px-5 py-3.5 flex flex-col gap-2">
              <textarea
                className="w-full min-h-[120px] resize-y"
                value={planDraft}
                onChange={(e) => setPlanDraft(e.target.value)}
                rows={8}
                placeholder="Write a plan for this work item..."
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button className="btn-ghost" onClick={() => setPlanEditing(false)}>Cancel</button>
                <button className="btn-primary" onClick={handlePlanSave}>Save Plan</button>
              </div>
            </div>
          ) : (
            <div className="relative max-h-[200px] overflow-y-auto">
              <div className="px-5 py-3.5 text-body text-text-secondary leading-[1.7] whitespace-pre-wrap">
                {wi.plan.content || <span className="italic text-text-muted opacity-50">No plan yet. Click edit to add one.</span>}
              </div>
              <button
                className="absolute top-2 right-3 inline-flex items-center gap-1 text-data text-text-muted px-2 py-[3px] rounded-xs transition-all duration-150 hover:bg-surface-hover hover:text-accent"
                onClick={handlePlanEdit}
              >
                <Pencil size={12} /> Edit
              </button>
            </div>
          )}
        </div>
      )}

      {/* Board */}
      <div className="grid grid-cols-5 gap-2.5 p-5 flex-1 overflow-x-auto overflow-y-hidden">
        {TASK_COLUMNS.map(({ key, label }) => (
          <TaskColumn
            key={key}
            columnKey={key}
            label={label}
            tasks={(wi.columns[key] || []).filter((t: any) => !isFiltered(filter) || matchesFilter(t, filter))}
            projectSlug={projectSlug}
            wiSlug={wi.slug}
            onDrop={handleMoveTask}
            onEditTask={(task) => setTaskModal({ mode: 'edit', task })}
            onToggleTask={(taskId, completed) => handleToggleComplete(taskId, completed, key)}
            onAddTask={() => setTaskModal({ mode: 'create', column: key })}
          />
        ))}
      </div>

      {/* Ralph Output Panel */}
      {(isRalphRunning || ralph.output.length > 0) && (
        <div className="border-t border-border bg-surface shrink-0">
          <button
            className="flex items-center justify-between w-full px-5 py-2 text-label font-medium text-text-secondary cursor-pointer transition-[background] duration-150 text-left hover:bg-surface-hover"
            onClick={() => setShowOutput(!showOutput)}
          >
            <span>
              Ralph {ralph.status !== 'idle' && (
                <span className="inline-block w-[5px] h-[5px] rounded-full bg-success ml-[5px] animate-breathe shadow-[0_0_6px_rgba(52,211,153,0.4)]" />
              )}
              {ralph.currentTaskTitle && ` — ${ralph.currentTaskTitle}`}
            </span>
            <span className="text-data text-text-muted font-mono">
              {ralph.stats.completed}/{ralph.stats.total} done
            </span>
          </button>
          {showOutput && (
            <div className="max-h-[180px] overflow-y-auto px-5 pb-2 font-mono text-data leading-[1.65] text-text-muted">
              {ralph.output.length === 0 ? (
                <div className="text-text-muted italic p-2 font-mono text-data opacity-50">Waiting for output...</div>
              ) : (
                ralph.output.map((line, i) => <div key={i} className="whitespace-pre-wrap break-all">{line}</div>)
              )}
            </div>
          )}
        </div>
      )}

      {/* Task Modal */}
      {taskModal && (
        <TaskModal
          projectSlug={projectSlug}
          wiSlug={wi.slug}
          mode={taskModal.mode}
          task={taskModal.mode === 'edit' ? taskModal.task : undefined}
          defaultColumn={taskModal.mode === 'create' ? taskModal.column : undefined}
          onSave={handleTaskSaved}
          onDelete={handleTaskDeleted}
          onClose={() => setTaskModal(null)}
        />
      )}
    </div>
  );
}
