'use client';

import { create } from 'zustand';

// Project-level views (no work item selected)
export type ProjectView = 'work-items' | 'console' | 'teams' | 'soul';

// Work-item-level views (inside a work item)
export type WorkItemView = 'board' | 'ralph';

// Union type for all views
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

export const useRouterStore = create<RouterState>((set, get) => ({
  projectSlug: null,
  workItemSlug: null,
  view: 'work-items',

  goToProject: (slug) => set({ projectSlug: slug, workItemSlug: null, view: 'work-items' }),
  goToWorkItem: (projectSlug, wiSlug) => set({ projectSlug, workItemSlug: wiSlug, view: 'board' }),
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
