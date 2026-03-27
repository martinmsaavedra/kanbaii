'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, Plus, LayoutGrid, Terminal, Bot, Users, Eye, Sun, Moon, Keyboard, Zap, FolderOpen } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { useWorkItemStore } from '@/stores/workItemStore';
import { useRouterStore, ViewTab } from '@/stores/routerStore';
import { useTheme } from '@/contexts/ThemeContext';

interface CommandItem {
  id: string;
  label: string;
  section: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  onClose: () => void;
  onShowCreateProject?: () => void;
  onShowCreateWorkItem?: () => void;
  onShowHelp?: () => void;
}

export function CommandPalette({ onClose, onShowCreateProject, onShowCreateWorkItem, onShowHelp }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const projects = useProjectStore((s) => s.projects);
  const workItems = useWorkItemStore((s) => s.workItems);
  const { goToProject, goToWorkItem, setView, projectSlug, workItemSlug } = useRouterStore();
  const { theme, toggleTheme } = useTheme();

  // Build command list
  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [];

    // Quick Actions
    items.push({
      id: 'create-project', label: 'Create Project', section: 'Actions',
      icon: <Plus size={14} />,
      action: () => { onClose(); onShowCreateProject?.(); },
    });
    if (projectSlug) {
      items.push({
        id: 'create-wi', label: 'Create Work Item', section: 'Actions',
        icon: <Plus size={14} />,
        action: () => { onClose(); onShowCreateWorkItem?.(); },
      });
    }
    items.push({
      id: 'toggle-theme', label: `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`, section: 'Actions',
      icon: theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />,
      action: () => { toggleTheme(); onClose(); },
    });
    items.push({
      id: 'keyboard-shortcuts', label: 'Keyboard Shortcuts', section: 'Actions',
      icon: <Keyboard size={14} />, shortcut: 'H',
      action: () => { onClose(); onShowHelp?.(); },
    });

    // Navigation
    if (projectSlug) {
      const views: { key: ViewTab; label: string; icon: React.ReactNode; shortcut: string }[] = workItemSlug
        ? [
            { key: 'board', label: 'Go to Board', icon: <LayoutGrid size={14} />, shortcut: 'B' },
            { key: 'ralph', label: 'Go to Ralph', icon: <Bot size={14} />, shortcut: 'R' },
          ]
        : [
            { key: 'work-items', label: 'Go to Work Items', icon: <LayoutGrid size={14} />, shortcut: 'W' },
            { key: 'console', label: 'Go to Console', icon: <Terminal size={14} />, shortcut: 'C' },
            { key: 'teams', label: 'Go to Teams', icon: <Users size={14} />, shortcut: 'T' },
            { key: 'soul', label: 'Go to Soul', icon: <Eye size={14} />, shortcut: 'S' },
          ];
      views.forEach((v) => {
        items.push({
          id: `nav-${v.key}`, label: v.label, section: 'Navigation',
          icon: v.icon, shortcut: v.shortcut,
          action: () => { setView(v.key); onClose(); },
        });
      });
    }

    // Projects
    projects.forEach((p) => {
      items.push({
        id: `project-${p.slug}`, label: p.title, section: 'Projects',
        icon: <FolderOpen size={14} />,
        action: () => { goToProject(p.slug); onClose(); },
      });
    });

    // Work Items
    if (projectSlug) {
      workItems.forEach((wi) => {
        items.push({
          id: `wi-${wi.slug}`, label: wi.title, section: 'Work Items',
          icon: <Zap size={14} />,
          action: () => { goToWorkItem(projectSlug, wi.slug); onClose(); },
        });
      });
    }

    return items;
  }, [projects, workItems, projectSlug, theme, onClose, onShowCreateProject, onShowCreateWorkItem, onShowHelp, goToProject, goToWorkItem, setView, toggleTheme]);

  // Filter
  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.section.toLowerCase().includes(q));
  }, [commands, query]);

  // Reset selection on filter change
  useEffect(() => { setSelectedIndex(0); }, [filtered.length]);

  // Auto-focus
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Keyboard nav
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].action();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [filtered, selectedIndex, onClose]);

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-selected="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Group by section
  const sections = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    filtered.forEach((item) => {
      const arr = map.get(item.section) || [];
      arr.push(item);
      map.set(item.section, arr);
    });
    return map;
  }, [filtered]);

  let globalIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[500] flex items-start justify-center pt-[20vh] animate-overlay-in"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] bg-modal rounded-xl overflow-hidden shadow-modal animate-spring-pop border border-glass-border relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Luminescent top edge */}
        <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(129,140,248,0.2)] to-transparent pointer-events-none z-10" />

        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search size={16} className="text-text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent border-none outline-none text-body text-text placeholder:text-text-muted p-0 shadow-none"
          />
          <kbd className="text-data font-mono text-text-muted bg-surface px-1.5 py-0.5 rounded border border-border">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[320px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-text-muted text-xs">
              No results found
            </div>
          ) : (
            Array.from(sections.entries()).map(([section, items]) => (
              <div key={section}>
                <div className="px-4 pt-2 pb-1 text-xxs font-semibold text-text-muted uppercase tracking-[0.08em]">
                  {section}
                </div>
                {items.map((item) => {
                  globalIndex++;
                  const isSelected = globalIndex === selectedIndex;
                  const idx = globalIndex;
                  return (
                    <button
                      key={item.id}
                      data-selected={isSelected}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-xs text-left transition-colors duration-75
                                  ${isSelected
                                    ? 'bg-accent-muted text-text'
                                    : 'text-text-secondary hover:bg-surface-hover hover:text-text'
                                  }`}
                      onClick={item.action}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <span className={`flex-shrink-0 ${isSelected ? 'text-accent' : 'text-text-muted'}`}>
                        {item.icon}
                      </span>
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.shortcut && (
                        <kbd className="text-data font-mono text-text-muted bg-surface px-1.5 py-0.5 rounded border border-border">
                          {item.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
