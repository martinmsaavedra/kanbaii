'use client';

import { create } from 'zustand';
import { api } from '@/lib/api';

export interface Project {
  id: string;
  slug: string;
  title: string;
  description?: string;
  color: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface ProjectStore {
  projects: Project[];
  activeSlug: string | null;
  loading: boolean;
  error: string | null;

  setActiveSlug: (slug: string | null) => void;
  fetchProjects: () => Promise<void>;
  createProject: (data: { title: string; description?: string; color?: string; workingDir?: string }) => Promise<Project>;
  updateProject: (slug: string, data: Record<string, unknown>) => Promise<void>;
  deleteProject: (slug: string) => Promise<void>;
  permanentDeleteProject: (slug: string) => Promise<void>;

  // Socket handlers
  onProjectUpdated: (project: Project) => void;
  onProjectDeleted: (slug: string) => void;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  activeSlug: null,
  loading: false,
  error: null,

  setActiveSlug: (slug) => set({ activeSlug: slug }),

  fetchProjects: async () => {
    set({ loading: true, error: null });
    try {
      const projects = await api.listProjects();
      set({ projects, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  createProject: async (data) => {
    const project = await api.createProject(data);
    // Don't add optimistically — socket onProjectUpdated handles it.
    // But deduplicate in case socket arrives before this returns.
    set((s) => {
      const exists = s.projects.some((p) => p.id === project.id);
      if (exists) return {};
      return { projects: [project, ...s.projects] };
    });
    return project;
  },

  updateProject: async (slug, data) => {
    const updated = await api.updateProject(slug, data);
    set((s) => ({
      projects: s.projects.map((p) => (p.slug === slug ? updated : p)),
    }));
  },

  deleteProject: async (slug) => {
    const updated = await api.deleteProject(slug);
    set((s) => ({
      projects: s.projects.map((p) => (p.slug === slug ? updated : p)),
      activeSlug: s.activeSlug === slug ? null : s.activeSlug,
    }));
  },

  permanentDeleteProject: async (slug) => {
    await api.permanentDeleteProject(slug);
    set((s) => ({
      projects: s.projects.filter((p) => p.slug !== slug),
      activeSlug: s.activeSlug === slug ? null : s.activeSlug,
    }));
  },

  onProjectUpdated: (project) => {
    set((s) => {
      const exists = s.projects.some((p) => p.id === project.id);
      if (exists) {
        return { projects: s.projects.map((p) => (p.id === project.id ? project : p)) };
      }
      return { projects: [project, ...s.projects] };
    });
  },

  onProjectDeleted: (slug) => {
    set((s) => ({
      projects: s.projects.filter((p) => p.slug !== slug),
      activeSlug: s.activeSlug === slug ? null : s.activeSlug,
    }));
  },
}));
