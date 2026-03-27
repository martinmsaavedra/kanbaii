'use client';

import { create } from 'zustand';
import { api } from '@/lib/api';

export interface WorkItem {
  id: string;
  slug: string;
  title: string;
  category: 'feature' | 'bug' | 'refactor';
  status: 'planning' | 'active' | 'review' | 'done';
  linkedWorkItem?: string | null;
  plan: {
    prompt?: string;
    content?: string;
    status: 'empty' | 'draft' | 'approved';
    generatedBy?: 'claude' | 'manual';
    createdAt?: string;
    updatedAt?: string;
  };
  columns: Record<string, any[]>;
  createdAt: string;
  updatedAt: string;
}

interface WorkItemStore {
  workItems: WorkItem[];
  projectSlug: string | null;
  loading: boolean;
  error: string | null;

  fetchWorkItems: (projectSlug: string) => Promise<void>;
  createWorkItem: (projectSlug: string, data: Record<string, unknown>) => Promise<WorkItem>;
  updateWorkItem: (projectSlug: string, wiId: string, data: Record<string, unknown>) => Promise<void>;
  deleteWorkItem: (projectSlug: string, wiId: string) => Promise<void>;

  // Socket handlers
  onWorkItemUpdated: (projectSlug: string, workItem: WorkItem) => void;
  onWorkItemDeleted: (projectSlug: string, workItemId: string) => void;
  clear: () => void;
}

export const useWorkItemStore = create<WorkItemStore>((set, get) => ({
  workItems: [],
  projectSlug: null,
  loading: false,
  error: null,

  fetchWorkItems: async (projectSlug) => {
    set({ loading: true, error: null, projectSlug });
    try {
      const workItems = await api.listWorkItems(projectSlug);
      set({ workItems, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  createWorkItem: async (projectSlug, data) => {
    const wi = await api.createWorkItem(projectSlug, data);
    set((s) => ({ workItems: [wi, ...s.workItems] }));
    return wi;
  },

  updateWorkItem: async (projectSlug, wiId, data) => {
    const updated = await api.updateWorkItem(projectSlug, wiId, data);
    set((s) => ({
      workItems: s.workItems.map((wi) => (wi.id === updated.id || wi.slug === wiId ? updated : wi)),
    }));
  },

  deleteWorkItem: async (projectSlug, wiId) => {
    await api.deleteWorkItem(projectSlug, wiId);
    set((s) => ({
      workItems: s.workItems.filter((wi) => wi.slug !== wiId && wi.id !== wiId),
    }));
  },

  onWorkItemUpdated: (projectSlug, workItem) => {
    const state = get();
    if (state.projectSlug !== projectSlug) return;
    set((s) => {
      const exists = s.workItems.some((wi) => wi.id === workItem.id);
      if (exists) {
        return { workItems: s.workItems.map((wi) => (wi.id === workItem.id ? workItem : wi)) };
      }
      return { workItems: [workItem, ...s.workItems] };
    });
  },

  onWorkItemDeleted: (projectSlug, workItemId) => {
    const state = get();
    if (state.projectSlug !== projectSlug) return;
    set((s) => ({
      workItems: s.workItems.filter((wi) => wi.id !== workItemId && wi.slug !== workItemId),
    }));
  },

  clear: () => set({ workItems: [], projectSlug: null, loading: false, error: null }),
}));
