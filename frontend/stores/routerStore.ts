'use client';

import { create } from 'zustand';
import { useAppStore } from './appStore';

export type ProjectView = 'work-items' | 'console' | 'teams' | 'soul' | 'planner';
export type WorkItemView = 'board' | 'ralph';
export type ViewTab = ProjectView | WorkItemView;

interface RouterState {
  projectSlug: string | null;
  workItemSlug: string | null;
  view: ViewTab;

  goToProject: (slug: string) => void;
  goToWorkItem: (projectSlug: string, wiSlug: string) => void;
  goBack: () => void;
  goHome: () => void;
  setView: (view: ViewTab) => void;
}

/**
 * Per-project state cache.
 * When switching projects, we save the current state and restore the new project's state.
 * This preserves terminal output, ralph progress, teams logs, etc. across project switches.
 */
interface ProjectStateSnapshot {
  terminal: { status: string; output: string[]; projectSlug: string | null };
  ralph: any;
  teams: any;
}

const _projectStateCache = new Map<string, ProjectStateSnapshot>();

function swapProjectState(fromSlug: string | null, toSlug: string): void {
  const app = useAppStore.getState();

  // Save current project's state
  if (fromSlug) {
    _projectStateCache.set(fromSlug, {
      terminal: { ...app.terminal },
      ralph: { ...app.ralph },
      teams: { ...app.teams },
    });
  }

  // Restore target project's state (or defaults)
  const saved = _projectStateCache.get(toSlug);
  if (saved) {
    useAppStore.setState({
      terminal: saved.terminal,
      ralph: saved.ralph,
      teams: saved.teams,
    });
  } else {
    // No saved state — reset to idle (new project)
    app.resetTerminal();
    app.resetRalph();
    app.resetTeams();
  }
}

export const useRouterStore = create<RouterState>((set, get) => ({
  projectSlug: null,
  workItemSlug: null,
  view: 'work-items',

  goToProject: (slug) => {
    const prev = get().projectSlug;
    if (prev !== slug) swapProjectState(prev, slug);
    set({ projectSlug: slug, workItemSlug: null, view: 'work-items' });
  },
  goToWorkItem: (projectSlug, wiSlug) => {
    const prev = get().projectSlug;
    if (prev !== projectSlug) swapProjectState(prev, projectSlug);
    set({ projectSlug, workItemSlug: wiSlug, view: 'board' });
  },
  goBack: () => {
    const state = get();
    if (state.workItemSlug) {
      set({ workItemSlug: null, view: 'work-items' });
    } else {
      set({ projectSlug: null, view: 'work-items' });
    }
  },
  goHome: () => set({ projectSlug: null, workItemSlug: null, view: 'work-items' }),
  setView: (view) => set({ view }),
}));
