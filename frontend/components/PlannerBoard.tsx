'use client';

import { useAppStore, PlannerDiscoveredItem } from '@/stores/appStore';
import { useRouterStore } from '@/stores/routerStore';
import { useToastStore } from '@/stores/toastStore';
import { PlannerCard } from './PlannerCard';
import { Check, ExternalLink } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';

function Column({ title, items, highlight, onApprove, onDiscard }: {
  title: string;
  items: PlannerDiscoveredItem[];
  highlight?: boolean;
  onApprove: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
      <div className={`text-[8px] font-mono uppercase tracking-wider text-center pb-1 border-b mb-0.5
                        ${highlight ? 'text-accent border-accent/30' : 'text-text-muted/40 border-border/40'}`}>
        {title} {items.length > 0 && <span className="text-text-muted/30">({items.length})</span>}
      </div>
      <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[calc(100%-24px)]">
        {items.map((item) => (
          <PlannerCard key={item.id} item={item} onApprove={onApprove} onDiscard={onDiscard} />
        ))}
      </div>
    </div>
  );
}

export function PlannerBoard({ projectSlug }: { projectSlug: string }) {
  const discoveredItems = useAppStore((s) => s.planner.discoveredItems);
  const addToast = useToastStore((s) => s.addToast);
  const goToWorkItem = useRouterStore((s) => s.goToWorkItem);

  const unapproved = discoveredItems.filter((i) => !i.approvedAs);
  const approved = discoveredItems.filter((i) => !!i.approvedAs);

  const identified = unapproved.filter((i) => i.status === 'identified');
  const planning = unapproved.filter((i) => i.status === 'planning');
  const ready = unapproved.filter((i) => i.status === 'ready');

  const handleApprove = async (itemId: string) => {
    try {
      const res = await fetch(`${API}/api/planner/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      const data = await res.json();
      if (data.ok) {
        addToast('Work item created', 'success');
      } else {
        addToast(data.error || 'Failed to approve', 'error');
      }
    } catch {
      addToast('Failed to connect', 'error');
    }
  };

  const handleDiscard = async (itemId: string) => {
    try {
      await fetch(`${API}/api/planner/discard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
    } catch {}
  };

  if (discoveredItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 opacity-30">
        <span className="text-[24px]">&#x25C7;</span>
        <span className="text-xxs font-mono text-text-muted">Items will appear here</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border/50 flex items-center justify-between flex-shrink-0">
        <span className="text-[9px] font-mono text-text-muted/60 uppercase tracking-widest">Discovery Board</span>
        <span className="text-[9px] font-mono text-text-muted/40">{discoveredItems.length} items</span>
      </div>

      {/* Columns */}
      <div className="flex gap-1.5 p-3 flex-1 overflow-hidden">
        <Column title="Identified" items={identified} onApprove={handleApprove} onDiscard={handleDiscard} />
        <Column title="Planning" items={planning} highlight onApprove={handleApprove} onDiscard={handleDiscard} />
        <Column title="Ready" items={ready} onApprove={handleApprove} onDiscard={handleDiscard} />
      </div>

      {/* Approved section */}
      {approved.length > 0 && (
        <div className="px-3 pb-3 border-t border-border/50 pt-2 flex-shrink-0">
          <div className="text-[8px] font-mono text-emerald-400/70 uppercase tracking-widest mb-1.5 flex items-center gap-1">
            <Check size={8} /> Approved
          </div>
          <div className="flex flex-col gap-1">
            {approved.map((item) => (
              <button
                key={item.id}
                onClick={() => item.approvedAs && goToWorkItem(projectSlug, item.approvedAs)}
                className="flex items-center gap-2 text-left py-1 px-2 rounded-sm text-[10px]
                           text-text-muted/60 hover:text-accent hover:bg-accent/5 transition-all duration-150"
              >
                <Check size={8} className="text-emerald-400/50 flex-shrink-0" />
                <span className="truncate flex-1">{item.title}</span>
                <ExternalLink size={8} className="opacity-0 group-hover:opacity-100 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
