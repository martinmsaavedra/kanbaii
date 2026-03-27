'use client';

import { ChevronRight, Home } from 'lucide-react';
import { useRouterStore } from '@/stores/routerStore';
import { useProjectStore } from '@/stores/projectStore';
import { useWorkItemStore } from '@/stores/workItemStore';

export function Breadcrumb() {
  const { projectSlug, workItemSlug, goHome, goToProject } = useRouterStore();
  const projects = useProjectStore((s) => s.projects);
  const workItems = useWorkItemStore((s) => s.workItems);

  if (!projectSlug) return null;

  const project = projects.find((p) => p.slug === projectSlug);
  const workItem = workItemSlug ? workItems.find((wi) => wi.slug === workItemSlug) : null;

  return (
    <nav className="flex items-center gap-1 px-6 py-1.5 text-xs text-text-muted flex-shrink-0">
      <button
        className="flex items-center gap-1 hover:text-text-secondary transition-colors duration-120 ease-out-expo rounded-xs px-1 py-0.5 hover:bg-surface-hover"
        onClick={goHome}
      >
        <Home size={11} />
      </button>

      {project && (
        <>
          <ChevronRight size={10} className="text-text-muted/50" />
          <button
            className="hover:text-text-secondary transition-colors duration-120 ease-out-expo rounded-xs px-1 py-0.5 hover:bg-surface-hover font-medium truncate max-w-[160px]"
            onClick={() => goToProject(project.slug)}
          >
            {project.title}
          </button>
        </>
      )}

      {workItem && (
        <>
          <ChevronRight size={10} className="text-text-muted/50" />
          <span className="text-text-secondary font-medium truncate max-w-[200px]">
            {workItem.title}
          </span>
        </>
      )}
    </nav>
  );
}
