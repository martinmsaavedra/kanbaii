'use client';

import { useEffect } from 'react';
import { useRouterStore } from '@/stores/routerStore';
import { useProjectStore } from '@/stores/projectStore';

interface ShortcutCallbacks {
  onNewTask?: () => void;
  onToggleFilter?: () => void;
  onToggleHelp?: () => void;
  onToggleCommandPalette?: () => void;
  onEscape?: () => void;
}

export function useKeyboardShortcuts(callbacks: ShortcutCallbacks = {}) {
  const { projectSlug, workItemSlug, setView, goToProject } = useRouterStore();
  const projects = useProjectStore((s) => s.projects);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement).isContentEditable) return;

      // Ctrl/Cmd+K — command palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        callbacks.onToggleCommandPalette?.();
        return;
      }

      // Ctrl+F — toggle filter
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        callbacks.onToggleFilter?.();
        return;
      }

      // Don't process single-key shortcuts if modifiers are held
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        // ─── Project-level views ───
        case 'w':
          if (projectSlug && !workItemSlug) setView('work-items');
          break;
        case 'c':
          if (projectSlug && !workItemSlug) setView('console');
          break;
        case 't':
          if (projectSlug && !workItemSlug) setView('teams');
          break;
        case 's':
          if (projectSlug && !workItemSlug) setView('soul');
          break;

        // ─── Work-item-level views ───
        case 'b':
          if (workItemSlug) setView('board');
          break;
        case 'r':
          if (workItemSlug) setView('ralph');
          break;

        // New task
        case 'n':
          callbacks.onNewTask?.();
          break;

        // Help
        case 'h':
          callbacks.onToggleHelp?.();
          break;

        // Escape
        case 'escape':
          callbacks.onEscape?.();
          break;

        // Project navigation
        case 'arrowup': {
          e.preventDefault();
          const idx = projects.findIndex((p) => p.slug === projectSlug);
          if (idx > 0) goToProject(projects[idx - 1].slug);
          break;
        }
        case 'arrowdown': {
          e.preventDefault();
          const idx = projects.findIndex((p) => p.slug === projectSlug);
          if (idx < projects.length - 1) goToProject(projects[idx + 1].slug);
          break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [projectSlug, workItemSlug, projects, setView, goToProject, callbacks]);
}
