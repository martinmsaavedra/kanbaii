'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Plus, Pencil, Sparkles } from 'lucide-react';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { useWorkItemStore, WorkItem } from '@/stores/workItemStore';
import { useProjectStore } from '@/stores/projectStore';
import { useRouterStore } from '@/stores/routerStore';
import { api } from '@/lib/api';
import { CreateWorkItemModal } from './CreateWorkItemModal';
import { EditWorkItemModal } from './EditWorkItemModal';

const CATEGORIES = {
  feature: { color: '#6366f1', icon: '\u2726', label: 'FEAT' },
  bug:     { color: '#ef4444', icon: '\u25CF', label: 'BUG' },
  refactor:{ color: '#f59e0b', icon: '\u25C6', label: 'REF' },
} as const;

const WI_COLUMNS: { key: string; label: string }[] = [
  { key: 'planning', label: 'Planning' },
  { key: 'active',   label: 'Active' },
  { key: 'review',   label: 'Review' },
  { key: 'done',     label: 'Done' },
];

function getProgress(wi: WorkItem) {
  let total = 0, completed = 0;
  for (const col of Object.values(wi.columns)) {
    total += col.length;
    completed += col.filter((t: any) => t.completed).length;
  }
  return { completed, total, percent: total === 0 ? 0 : Math.round((completed / total) * 100) };
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// --- Draggable Work Item Card ---

function WICard({ wi, projectSlug, onClick, onEdit, index = 0 }: { wi: WorkItem; projectSlug: string; onClick: () => void; onEdit: () => void; index?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [flash, setFlash] = useState(false);
  const cat = CATEGORIES[wi.category];
  const progress = getProgress(wi);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => ({ type: 'work-item', wiId: wi.id, wiSlug: wi.slug, currentStatus: wi.status }),
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false),
    });
  }, [wi.id, wi.slug, wi.status]);

  // Flash on status change
  const prevStatus = useRef(wi.status);
  useEffect(() => {
    if (prevStatus.current !== wi.status) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 600);
      prevStatus.current = wi.status;
      return () => clearTimeout(t);
    }
  }, [wi.status]);

  return (
    <div
      ref={ref}
      className={[
        'group/card flex bg-card border border-border rounded-md cursor-pointer shadow-card',
        'transition-all duration-250 ease-out-expo overflow-hidden animate-stagger-in',
        'relative',
        'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:rounded-l-md before:bg-[var(--cat-color)]',
        'hover:-translate-y-[3px] hover:shadow-card-hover hover:border-border-light',
        dragging ? 'opacity-20 scale-95 rotate-[2deg] shadow-drag' : '',
        flash ? 'animate-post-move' : '',
      ].join(' ')}
      style={{
        '--cat-color': cat.color,
        animationDelay: `${index * 60}ms`,
      } as React.CSSProperties}
      onClick={onClick}
    >
      <div className="flex-1 p-3 pl-3.5 min-w-0">
        {/* Header: icon + title + badge + edit */}
        <div className="flex items-center gap-2 mb-2">
          <span
            className="shrink-0 text-body drop-shadow-[0_0_4px_currentColor]"
            style={{ color: cat.color }}
          >
            {cat.icon}
          </span>
          <span className="flex-1 text-body font-medium text-text overflow-hidden text-ellipsis whitespace-nowrap tracking-[-0.01em]">
            {wi.title}
          </span>
          <button
            className="inline-flex items-center justify-center w-5 h-5 rounded-xs text-text-muted opacity-0 transition-all duration-150 ease-out-expo group-hover/card:opacity-100 hover:bg-surface-hover hover:text-accent"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            title="Edit"
          >
            <Pencil size={11} />
          </button>
          <span className={`badge badge-${wi.category}`}>{cat.label}</span>
        </div>

        {/* Plan excerpt */}
        {wi.plan.content ? (
          <div className="text-[10.5px] text-text-muted leading-[1.5] line-clamp-2 mb-2.5">
            {wi.plan.content}
          </div>
        ) : (
          <div className="text-[10.5px] text-text-muted leading-[1.5] line-clamp-2 mb-2.5 italic opacity-40">
            No plan yet
          </div>
        )}

        {/* Progress bar + percentage */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-[3px] rounded-[3px] bg-[rgba(148,163,242,0.06)] overflow-hidden">
            <div
              className="h-full rounded-[3px] transition-[width] duration-[800ms] ease-out-expo"
              style={{ width: `${progress.percent}%`, background: cat.color }}
            />
          </div>
          <span className="text-data font-semibold text-text-secondary font-mono min-w-[28px] text-right">
            {progress.percent}%
          </span>
          <span className="text-xxs text-text-muted font-mono">
            {progress.completed}/{progress.total}
          </span>
        </div>

        {/* Footer: linked + time */}
        <div className="flex items-center gap-2 text-data text-text-muted font-mono">
          {wi.linkedWorkItem && <span className="text-accent-dim">&rarr; {wi.linkedWorkItem}</span>}
          <span className="ml-auto">{timeAgo(wi.updatedAt)}</span>
        </div>
      </div>
    </div>
  );
}

// --- Drop Target Column ---

function WIColumn({
  columnKey,
  label,
  items,
  projectSlug,
  onCardClick,
  onCardEdit,
  onDrop,
}: {
  columnKey: string;
  label: string;
  items: WorkItem[];
  projectSlug: string;
  onCardClick: (wi: WorkItem) => void;
  onCardEdit: (wi: WorkItem) => void;
  onDrop: (wiSlug: string, newStatus: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      getData: () => ({ columnKey }),
      canDrop: ({ source }) => source.data.type === 'work-item' && source.data.currentStatus !== columnKey,
      onDragEnter: () => setOver(true),
      onDragLeave: () => setOver(false),
      onDrop: ({ source }) => {
        setOver(false);
        onDrop(source.data.wiSlug as string, columnKey);
      },
    });
  }, [columnKey, onDrop]);

  return (
    <div className="flex flex-col min-w-[220px] gap-1.5 overflow-hidden">
      <div className="flex items-center gap-2 px-1.5 py-2 mb-1">
        <span className="text-data font-semibold text-text-muted uppercase tracking-[0.08em] font-mono">
          {label}
        </span>
        <span className="text-xxs text-text-muted bg-pill px-[7px] py-[2px] rounded-xs font-mono font-medium border border-[rgba(148,163,242,0.04)]">
          {items.length}
        </span>
      </div>
      <div
        ref={ref}
        className={[
          'flex-1 overflow-y-auto flex flex-col gap-1.5 p-0.5 rounded-sm transition-all duration-300 ease-out-expo',
          over ? 'bg-[rgba(99,102,241,0.03)] outline-[1.5px] outline-dashed outline-[rgba(99,102,241,0.2)] -outline-offset-1 shadow-[inset_0_0_30px_rgba(99,102,241,0.03)]' : '',
        ].join(' ')}
      >
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-[72px] text-text-muted text-data border border-dashed border-[rgba(148,163,242,0.06)] rounded-md font-mono tracking-[0.02em] transition-all duration-250 ease-out-expo">
            {over ? 'Drop here' : 'No items'}
          </div>
        ) : (
          items.map((wi, index) => (
            <WICard
              key={wi.id}
              wi={wi}
              projectSlug={projectSlug}
              onClick={() => onCardClick(wi)}
              onEdit={() => onCardEdit(wi)}
              index={index}
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
}

export function WorkItemsBoard({ projectSlug }: Props) {
  const goToWorkItem = useRouterStore((s) => s.goToWorkItem);
  const setView = useRouterStore((s) => s.setView);
  const { workItems, loading, fetchWorkItems } = useWorkItemStore();
  const project = useProjectStore((s) => s.projects.find((p) => p.slug === projectSlug));
  const [showCreate, setShowCreate] = useState(false);
  const [editingWI, setEditingWI] = useState<WorkItem | null>(null);

  useEffect(() => {
    fetchWorkItems(projectSlug);
  }, [projectSlug, fetchWorkItems]);

  const grouped = useMemo(() => {
    const map: Record<string, WorkItem[]> = { planning: [], active: [], review: [], done: [] };
    for (const wi of workItems) {
      if (map[wi.status]) map[wi.status].push(wi);
    }
    return map;
  }, [workItems]);

  const stats = useMemo(() => {
    const counts: Record<string, number> = { feature: 0, bug: 0, refactor: 0 };
    for (const wi of workItems) counts[wi.category]++;
    return counts;
  }, [workItems]);

  const handleDrop = useCallback(async (wiSlug: string, newStatus: string) => {
    try {
      await api.updateWorkItem(projectSlug, wiSlug, { status: newStatus });
      fetchWorkItems(projectSlug);
    } catch (err) {
      console.error('Failed to move work item:', err);
    }
  }, [projectSlug, fetchWorkItems]);

  if (loading && workItems.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-label font-mono tracking-[0.04em] animate-breathe">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-[var(--space-lg,24px)] py-4 border-b border-border shrink-0 bg-gradient-to-b from-bg-subtle to-bg relative after:content-[''] after:absolute after:bottom-0 after:left-[5%] after:right-[5%] after:h-px after:bg-gradient-to-r after:from-transparent after:via-border-glow after:to-transparent">
        <div className="flex flex-col gap-[3px]">
          <div className="text-[18px] font-semibold tracking-[-0.03em] text-text">
            {project?.title || projectSlug}
          </div>
          <div className="text-data text-text-muted flex gap-3 items-center font-mono">
            {stats.feature > 0 && (
              <span>
                <span
                  className="inline-block w-[5px] h-[5px] rounded-full mr-1 shadow-[0_0_6px_currentColor]"
                  style={{ background: CATEGORIES.feature.color }}
                />
                {stats.feature} feature{stats.feature !== 1 ? 's' : ''}
              </span>
            )}
            {stats.bug > 0 && (
              <span>
                <span
                  className="inline-block w-[5px] h-[5px] rounded-full mr-1 shadow-[0_0_6px_currentColor]"
                  style={{ background: CATEGORIES.bug.color }}
                />
                {stats.bug} bug{stats.bug !== 1 ? 's' : ''}
              </span>
            )}
            {stats.refactor > 0 && (
              <span>
                <span
                  className="inline-block w-[5px] h-[5px] rounded-full mr-1 shadow-[0_0_6px_currentColor]"
                  style={{ background: CATEGORIES.refactor.color }}
                />
                {stats.refactor} refactor{stats.refactor !== 1 ? 's' : ''}
              </span>
            )}
            {workItems.length === 0 && (
              <span>No work items</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setShowCreate(true)}>
            <Plus size={16} />
            Quick
          </button>
          <button className="btn-primary" onClick={() => setView('planner')}>
            <Sparkles size={16} />
            Planner
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2.5 p-5 px-[var(--space-lg,24px)] flex-1 overflow-x-auto overflow-y-hidden">
        {WI_COLUMNS.map(({ key, label }) => (
          <WIColumn
            key={key}
            columnKey={key}
            label={label}
            items={grouped[key] || []}
            projectSlug={projectSlug}
            onCardClick={(wi) => goToWorkItem(projectSlug, wi.slug)}
            onCardEdit={(wi) => setEditingWI(wi)}
            onDrop={handleDrop}
          />
        ))}
      </div>

      {showCreate && (
        <CreateWorkItemModal
          projectSlug={projectSlug}
          onClose={() => setShowCreate(false)}
        />
      )}


      {editingWI && (
        <EditWorkItemModal
          projectSlug={projectSlug}
          workItem={editingWI}
          onClose={() => setEditingWI(null)}
        />
      )}
    </div>
  );
}
