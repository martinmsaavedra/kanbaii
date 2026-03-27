'use client';

import { useAppStore, PlannerDiscoveredItem } from '@/stores/appStore';
import { useRouterStore } from '@/stores/routerStore';
import { useToastStore } from '@/stores/toastStore';
import { PlannerCard } from './PlannerCard';
import { Check, ExternalLink, Sparkles } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';

export function PlannerBoard({ projectSlug }: { projectSlug: string }) {
  const discoveredItems = useAppStore((s) => s.planner.discoveredItems);
  const active = useAppStore((s) => s.planner.active);
  const addToast = useToastStore((s) => s.addToast);
  const goToWorkItem = useRouterStore((s) => s.goToWorkItem);

  const pending = discoveredItems.filter((i) => !i.approvedAs);
  const approved = discoveredItems.filter((i) => !!i.approvedAs);
  const readyCount = pending.filter((i) => i.status === 'ready').length;

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

  // Empty state
  if (discoveredItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
        <Sparkles size={20} className="text-text-muted/20" />
        <div className="text-center">
          <p className="text-xxs font-mono text-text-muted/40">Discovered items</p>
          <p className="text-xxs font-mono text-text-muted/25 mt-1">will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-mono text-text-muted uppercase tracking-widest">
            Discovered
          </span>
          <span className="text-[9px] font-mono text-text-muted/50">
            {pending.length} pending
          </span>
        </div>
        {readyCount > 0 && (
          <p className="text-[9px] text-accent dark:text-accent mt-1.5 leading-snug">
            {readyCount} item{readyCount > 1 ? 's' : ''} ready — approve to create on the board
          </p>
        )}
      </div>

      {/* Single list of all pending items */}
      <div className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-1.5">
        {pending.map((item) => (
          <PlannerCard key={item.id} item={item} onApprove={handleApprove} onDiscard={handleDiscard} />
        ))}

        {active && pending.length > 0 && (
          <div className="flex items-center justify-center py-2">
            <span className="text-[9px] font-mono text-text-muted/30">
              {pending.every((i) => i.status === 'ready') ? 'All items ready' : 'More items coming...'}
            </span>
          </div>
        )}
      </div>

      {/* Approved section */}
      {approved.length > 0 && (
        <div className="px-3 pb-3 border-t border-border pt-2.5 flex-shrink-0">
          <div className="text-[8px] font-mono text-accent dark:text-accent uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <Check size={8} /> Created ({approved.length})
          </div>
          <div className="flex flex-col gap-0.5">
            {approved.map((item) => (
              <button
                key={item.id}
                onClick={() => item.approvedAs && goToWorkItem(projectSlug, item.approvedAs)}
                className="group flex items-center gap-2 text-left py-1.5 px-2 rounded-sm text-[10px]
                           text-text-secondary hover:text-accent hover:bg-accent/5
                           dark:text-text-muted/60 dark:hover:text-accent
                           transition-all duration-150"
              >
                <Check size={8} className="text-accent/50 flex-shrink-0" />
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
