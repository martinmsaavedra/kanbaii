'use client';

import { Terminal, Bot, Eye, BarChart3 } from 'lucide-react';
import { ViewTab } from '@/stores/routerStore';

const VIEW_INFO: Record<string, { icon: React.ReactNode; title: string; desc: string; fase: string }> = {
  terminal: { icon: <Terminal size={40} />, title: 'Terminal', desc: 'Claude CLI integration with PTY terminal', fase: 'Fase 12' },
  agents: { icon: <Bot size={40} />, title: 'Agents', desc: 'Ralph execution engine and agent management', fase: 'Fase 8-9' },
  soul: { icon: <Eye size={40} />, title: 'Soul', desc: 'Memory, daily logs, and project health', fase: 'Fase 13' },
  costs: { icon: <BarChart3 size={40} />, title: 'Costs & Analytics', desc: 'Execution costs, token tracking, and budgets', fase: 'Fase 15' },
};

export function PlaceholderView({ view }: { view: ViewTab }) {
  const info = VIEW_INFO[view];
  if (!info) return null;
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-text-muted animate-fade-in-up">
      <div className="opacity-15">{info.icon}</div>
      <div className="text-lg font-semibold text-text-secondary tracking-tight">{info.title}</div>
      <div className="text-body text-text-muted">{info.desc}</div>
      <div className="text-data text-accent bg-accent-muted px-3 py-1 rounded-full mt-2 font-mono tracking-wide border border-[rgba(99,102,241,0.1)]">
        Coming in {info.fase}
      </div>
    </div>
  );
}
