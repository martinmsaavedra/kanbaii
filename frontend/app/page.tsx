'use client';

import { useRouterStore } from '@/stores/routerStore';
import { WorkItemsBoard } from '@/components/WorkItemsBoard';
import { TaskBoard } from '@/components/TaskBoard';
import { RalphView } from '@/components/RalphView';
import { TeamsView } from '@/components/TeamsView';
import { TerminalView } from '@/components/TerminalView';
import { SoulView } from '@/components/SoulView';
import { ViewSwitcher } from '@/components/ViewSwitcher';

export default function Home() {
  const { projectSlug, workItemSlug, view } = useRouterStore();

  // No project selected
  if (!projectSlug) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-text-secondary text-center animate-fade-in-up">
        <span className="text-[44px] text-accent opacity-25">&#x2B21;</span>
        <h2 className="text-h1 font-semibold text-text tracking-tight">Welcome to KANBAII</h2>
        <p className="text-body text-text-muted max-w-[360px] leading-relaxed">
          Select a project from the sidebar or create a new one to get started.
        </p>
      </div>
    );
  }

  // ─── Project Level Views ───
  if (!workItemSlug) {
    const renderProjectView = () => {
      switch (view) {
        case 'work-items':
          return <WorkItemsBoard projectSlug={projectSlug} />;
        case 'console':
          return <TerminalView projectSlug={projectSlug} />;
        case 'teams':
          return <TeamsView projectSlug={projectSlug} />;
        case 'soul':
          return <SoulView projectSlug={projectSlug} />;
        default:
          return <WorkItemsBoard projectSlug={projectSlug} />;
      }
    };

    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-center px-6 py-2 border-b border-border flex-shrink-0 bg-bg">
          <ViewSwitcher />
        </div>
        <div className="flex-1 overflow-hidden">
          {renderProjectView()}
        </div>
      </div>
    );
  }

  // ─── Work Item Level Views ───
  const renderWorkItemView = () => {
    switch (view) {
      case 'board':
        return <TaskBoard projectSlug={projectSlug} wiSlug={workItemSlug} />;
      case 'ralph':
        return <RalphView projectSlug={projectSlug} wiSlug={workItemSlug} />;
      default:
        return <TaskBoard projectSlug={projectSlug} wiSlug={workItemSlug} />;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-center px-6 py-2 border-b border-border flex-shrink-0 bg-bg">
        <ViewSwitcher />
      </div>
      <div className="flex-1 overflow-hidden">
        {renderWorkItemView()}
      </div>
    </div>
  );
}
