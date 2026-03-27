'use client';

import { ChevronRight, Home as HomeIcon } from 'lucide-react';
import { useRouterStore } from '@/stores/routerStore';
import { useProjectStore } from '@/stores/projectStore';
import { WorkItemsBoard } from '@/components/WorkItemsBoard';
import { TaskBoard } from '@/components/TaskBoard';
import { RalphView } from '@/components/RalphView';
import { TeamsView } from '@/components/TeamsView';
import { TerminalView } from '@/components/TerminalView';
import { SoulView } from '@/components/SoulView';
import { PlannerView } from '@/components/PlannerView';
import { ViewSwitcher } from '@/components/ViewSwitcher';
import { WelcomeLanding } from '@/components/WelcomeLanding';

function Breadcrumb() {
  const { projectSlug, workItemSlug, goHome, goBack } = useRouterStore();
  const projects = useProjectStore((s) => s.projects);

  const project = projects.find((p) => p.slug === projectSlug);

  return (
    <nav className="flex items-center gap-1 text-xxs font-mono tracking-wide mr-auto">
      <button
        onClick={goHome}
        className="flex items-center gap-1.5 text-text-muted hover:text-accent transition-colors duration-150 group"
      >
        <HomeIcon size={11} className="opacity-50 group-hover:opacity-100 transition-opacity duration-150" />
        <span className="uppercase tracking-widest">Kanbaii</span>
      </button>

      {project && (
        <>
          <ChevronRight size={10} className="text-text-muted/30" />
          {workItemSlug ? (
            <button
              onClick={goBack}
              className="text-text-muted hover:text-accent transition-colors duration-150 truncate max-w-[160px]"
            >
              {project.title}
            </button>
          ) : (
            <span className="text-text-secondary truncate max-w-[160px]">{project.title}</span>
          )}
        </>
      )}

      {workItemSlug && (
        <>
          <ChevronRight size={10} className="text-text-muted/30" />
          <span className="text-text-secondary truncate max-w-[160px]">{workItemSlug}</span>
        </>
      )}
    </nav>
  );
}

export default function Home() {
  const { projectSlug, workItemSlug, view } = useRouterStore();

  // No project selected — show landing
  if (!projectSlug) {
    return <WelcomeLanding />;
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
        case 'planner':
          return <PlannerView projectSlug={projectSlug} />;
        default:
          return <WorkItemsBoard projectSlug={projectSlug} />;
      }
    };

    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center px-4 py-2 border-b border-border flex-shrink-0 bg-bg gap-4">
          <Breadcrumb />
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
      <div className="flex items-center px-4 py-2 border-b border-border flex-shrink-0 bg-bg gap-4">
        <Breadcrumb />
        <ViewSwitcher />
      </div>
      <div className="flex-1 overflow-hidden">
        {renderWorkItemView()}
      </div>
    </div>
  );
}
