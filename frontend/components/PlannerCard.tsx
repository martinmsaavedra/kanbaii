'use client';

import { useState } from 'react';
import { Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { PlannerDiscoveredItem } from '@/stores/appStore';

const CATEGORY_COLORS: Record<string, string> = {
  feature: 'border-l-feature',
  bug: 'border-l-bug',
  refactor: 'border-l-refactor',
};

const CATEGORY_BADGE: Record<string, string> = {
  feature: 'text-feature bg-feature/10',
  bug: 'text-bug bg-bug/10',
  refactor: 'text-refactor bg-refactor/10',
};

const STATUS_LABEL: Record<string, { text: string; style: string }> = {
  identified: { text: 'Discovered', style: 'text-text-muted bg-surface' },
  planning: { text: 'Planning...', style: 'text-accent bg-accent-muted' },
  ready: { text: 'Ready to approve', style: 'text-accent bg-accent-muted font-semibold' },
};

export function PlannerCard({
  item,
  onApprove,
  onDiscard,
}: {
  item: PlannerDiscoveredItem;
  onApprove: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isApproved = !!item.approvedAs;
  const statusInfo = STATUS_LABEL[item.status] || STATUS_LABEL.identified;

  return (
    <div
      className={`rounded-md border border-l-2 transition-all duration-250 ease-out-expo animate-card-in
                   ${CATEGORY_COLORS[item.category] || 'border-l-accent'}
                   ${isApproved
                     ? 'border-border/30 bg-surface/20 opacity-50'
                     : 'border-border bg-card hover:bg-surface-hover'}`}
    >
      {/* Header */}
      <button
        onClick={() => !isApproved && setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left"
      >
        {/* Status dot */}
        {item.status === 'planning' && !isApproved && (
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-breathe flex-shrink-0" />
        )}
        {item.status === 'ready' && !isApproved && (
          <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0 shadow-[0_0_6px_var(--accent-glow)]" />
        )}
        {isApproved && (
          <Check size={10} className="text-accent flex-shrink-0" />
        )}
        {item.status === 'identified' && !isApproved && (
          <span className="w-1.5 h-1.5 rounded-full bg-text-muted/30 flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-text truncate">{item.title}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-[8px] font-mono px-1 py-px rounded ${CATEGORY_BADGE[item.category] || ''}`}>
              {item.category}
            </span>
            {item.tasks.length > 0 && (
              <span className="text-[8px] font-mono text-text-muted">{item.tasks.length} tasks</span>
            )}
            {!isApproved && (
              <span className={`text-[7px] font-mono px-1 py-px rounded ${statusInfo.style}`}>
                {statusInfo.text}
              </span>
            )}
          </div>
        </div>

        {!isApproved && (
          expanded
            ? <ChevronUp size={10} className="text-text-muted flex-shrink-0" />
            : <ChevronDown size={10} className="text-text-muted flex-shrink-0" />
        )}
      </button>

      {/* Expanded details */}
      {expanded && !isApproved && (
        <div className="px-2.5 pb-2.5 border-t border-border/50 pt-2 flex flex-col gap-2">
          {/* Plan */}
          {item.plan && (
            <div>
              <div className="text-[8px] font-mono text-text-muted uppercase tracking-wider mb-1">Plan</div>
              <div className="text-[10px] text-text-secondary leading-relaxed max-h-[100px] overflow-y-auto whitespace-pre-wrap
                              bg-bg/50 rounded p-2 border border-border/30">
                {item.plan}
              </div>
            </div>
          )}

          {/* Tasks */}
          {item.tasks.length > 0 && (
            <div>
              <div className="text-[8px] font-mono text-text-muted uppercase tracking-wider mb-1">Tasks</div>
              <div className="flex flex-col gap-0.5">
                {item.tasks.map((t, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px]">
                    <span className="text-accent/50">&#x25C8;</span>
                    <span className="text-text-secondary truncate">{t.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {item.status === 'ready' && (
            <div className="flex gap-1.5 mt-1">
              <button
                onClick={(e) => { e.stopPropagation(); onApprove(item.id); }}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] font-semibold
                           bg-accent/10 border border-accent/20 text-accent
                           hover:bg-accent/15 hover:border-accent/30 transition-all duration-150"
              >
                <Check size={10} /> Approve & Create
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDiscard(item.id); }}
                className="flex items-center justify-center gap-1 py-1.5 px-3 rounded-md text-[10px]
                           bg-transparent border border-border text-text-muted
                           hover:text-danger hover:border-danger/30 hover:bg-danger/5 transition-all duration-150"
              >
                <X size={10} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
