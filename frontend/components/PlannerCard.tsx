'use client';

import { useState } from 'react';
import { Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { PlannerDiscoveredItem } from '@/stores/appStore';

const CATEGORY_COLORS: Record<string, string> = {
  feature: 'border-l-indigo-500',
  bug: 'border-l-red-500',
  refactor: 'border-l-amber-500',
};

const CATEGORY_BADGE: Record<string, string> = {
  feature: 'text-indigo-400 bg-indigo-500/10',
  bug: 'text-red-400 bg-red-500/10',
  refactor: 'text-amber-400 bg-amber-500/10',
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

  return (
    <div
      className={`rounded-md border border-l-2 transition-all duration-250 ease-out-expo animate-card-in
                   ${CATEGORY_COLORS[item.category] || 'border-l-indigo-500'}
                   ${isApproved
                     ? 'border-border/30 bg-surface/20 opacity-60'
                     : 'border-border/50 bg-surface/40 hover:bg-surface/60'}`}
    >
      {/* Compact header */}
      <button
        onClick={() => !isApproved && setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left"
      >
        {/* Status indicator */}
        {item.status === 'planning' && !isApproved && (
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-breathe flex-shrink-0" />
        )}
        {item.status === 'ready' && !isApproved && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
        )}
        {isApproved && (
          <Check size={10} className="text-emerald-400 flex-shrink-0" />
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
              <span className="text-[8px] font-mono text-text-muted/50">{item.tasks.length} tasks</span>
            )}
          </div>
        </div>

        {!isApproved && (
          expanded
            ? <ChevronUp size={10} className="text-text-muted/40 flex-shrink-0" />
            : <ChevronDown size={10} className="text-text-muted/40 flex-shrink-0" />
        )}
      </button>

      {/* Expanded details */}
      {expanded && !isApproved && (
        <div className="px-2.5 pb-2.5 border-t border-border/30 pt-2 flex flex-col gap-2">
          {/* Plan */}
          {item.plan && (
            <div>
              <div className="text-[8px] font-mono text-text-muted/50 uppercase tracking-wider mb-1">Plan</div>
              <div className="text-[10px] text-text-muted leading-relaxed max-h-[100px] overflow-y-auto whitespace-pre-wrap">
                {item.plan}
              </div>
            </div>
          )}

          {/* Tasks */}
          {item.tasks.length > 0 && (
            <div>
              <div className="text-[8px] font-mono text-text-muted/50 uppercase tracking-wider mb-1">Tasks</div>
              <div className="flex flex-col gap-0.5">
                {item.tasks.map((t, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px]">
                    <span className="text-accent/40">&#x25C8;</span>
                    <span className="text-text-muted truncate">{t.title}</span>
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
                           bg-emerald-500/10 border border-emerald-500/20 text-emerald-400
                           hover:bg-emerald-500/15 hover:border-emerald-500/30 transition-all duration-150"
              >
                <Check size={10} /> Approve
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDiscard(item.id); }}
                className="flex items-center justify-center gap-1 py-1.5 px-3 rounded-md text-[10px]
                           bg-transparent border border-border/30 text-text-muted/50
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
