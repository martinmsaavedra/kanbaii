'use client';

import { useEffect, useState, useRef } from 'react';
import { Plus, Trash2, Archive, FolderOpen, Pin, BarChart3, Settings, ChevronRight, RotateCcw } from 'lucide-react';
import { useProjectStore, Project } from '@/stores/projectStore';
import { useRouterStore } from '@/stores/routerStore';
import { useAppStore } from '@/stores/appStore';
import { useToastStore } from '@/stores/toastStore';
import ThemeToggle from './ThemeToggle';
import { CreateProjectModal } from './CreateProjectModal';
import { SettingsModal } from './SettingsModal';
import { CostsPanel } from './CostsPanel';
import { ClaudeUsageWidget } from './ClaudeUsageWidget';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 99, g: 102, b: 241 };
}

export function Sidebar() {
  const { projects, fetchProjects, setActiveSlug, deleteProject, permanentDeleteProject, updateProject } = useProjectStore();
  const { projectSlug, goToProject, goHome } = useRouterStore();
  const ralph = useAppStore((s) => s.ralph);
  const teams = useAppStore((s) => s.teams);
  const addToast = useToastStore((s) => s.addToast);
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCosts, setShowCosts] = useState(false);
  const [folderModal, setFolderModal] = useState<{ slug: string; current: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [hovered, setHovered] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isExpanded = pinned || hovered;
  const terminalStatus = useAppStore((s) => s.terminal.status);
  const plannerActive = useAppStore((s) => s.planner.active);
  const isSystemBusy = ralph.status === 'running' || ralph.status === 'paused' || teams.active || terminalStatus === 'running' || plannerActive;

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      // Don't close if clicking inside the menu itself (e.g. confirm delete)
      const target = e.target as HTMLElement;
      if (target.closest('[data-context-menu]')) return;
      setMenuOpen(null);
    };
    const timer = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => { clearTimeout(timer); document.removeEventListener('click', handler); };
  }, [menuOpen]);

  const handleMouseEnter = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setHovered(true);
  };
  const handleMouseLeave = () => {
    hoverTimeout.current = setTimeout(() => setHovered(false), 200);
  };

  const handleProjectClick = (project: Project) => {
    setActiveSlug(project.slug);
    goToProject(project.slug);
  };

  const handleArchive = async (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setMenuOpen(null);
    try {
      await updateProject(project.slug, { status: 'archived' });
      if (projectSlug === project.slug) goHome();
      addToast(`${project.title} archived`, 'success');
    } catch { addToast('Failed to archive', 'error'); }
  };

  const handleMoveToTrash = async (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setMenuOpen(null);
    try {
      await deleteProject(project.slug);
      if (projectSlug === project.slug) goHome();
      addToast(`${project.title} moved to trash`, 'success');
    } catch { addToast('Failed to move to trash', 'error'); }
  };

  const handlePermanentDelete = async (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    if (confirmDelete !== project.slug) {
      setConfirmDelete(project.slug);
      setTimeout(() => setConfirmDelete(null), 3000);
      return;
    }
    setMenuOpen(null);
    try {
      await permanentDeleteProject(project.slug);
      addToast(`${project.title} permanently deleted`, 'success');
      setConfirmDelete(null);
    } catch { addToast('Failed to delete', 'error'); }
  };

  const handleRestore = async (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setMenuOpen(null);
    try {
      await updateProject(project.slug, { status: 'active' });
      addToast(`${project.title} restored`, 'success');
    } catch { addToast('Failed to restore', 'error'); }
  };

  const handleOpenFolder = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    fetch(`${API}/api/system/open-folder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: (project as any).workingDir }) })
      .catch(() => addToast('Failed to open folder', 'error'));
  };

  const activeProjects = projects.filter((p) => p.status === 'active');
  const archivedProjects = projects.filter((p) => p.status === 'archived');
  const trashedProjects = projects.filter((p) => p.status === 'deleted');

  return (
    <>
      <aside
        className={`flex-shrink-0 border-r border-border bg-bg-subtle flex flex-col overflow-hidden relative z-10
                     transition-all duration-300 ease-out-expo ${isExpanded ? 'w-sidebar' : 'w-sidebar-collapsed'}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Header */}
        <div className={`flex items-center flex-shrink-0 min-h-[48px]
                          ${isExpanded ? 'px-3 pt-3.5 pb-2.5 justify-between' : 'px-0 pt-3.5 pb-[18px] justify-center'}`}>
          <div className={`flex items-center ${isExpanded ? 'gap-2.5' : 'gap-0'}`}>
            <div className={`rounded-sm flex items-center justify-center flex-shrink-0 overflow-hidden relative
                              transition-all duration-400
                              ${isExpanded ? 'w-[26px] h-[26px]' : 'w-7 h-7'}
                              ${isSystemBusy
                                ? 'bg-gradient-to-br from-emerald-800 to-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3),0_0_20px_rgba(16,185,129,0.1)] border border-emerald-500/35 animate-breathe'
                                : 'bg-gradient-to-br from-indigo-800 to-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.15),inset_0_0_6px_rgba(99,102,241,0.06)] border border-indigo-500/12'
                              }`}
            >
              <svg width={isExpanded ? 26 : 28} height={isExpanded ? 26 : 28} viewBox="0 0 32 32" className="block">
                <defs>
                  <linearGradient id="kc1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={isSystemBusy ? '#d1fae5' : '#e0e7ff'} />
                    <stop offset="100%" stopColor={isSystemBusy ? '#a7f3d0' : '#c7d2fe'} />
                  </linearGradient>
                  <linearGradient id="kc2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={isSystemBusy ? '#f0fdf4' : '#f5f3ff'} />
                    <stop offset="100%" stopColor={isSystemBusy ? '#d1fae5' : '#e0e7ff'} />
                  </linearGradient>
                  <filter id="kglow"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                </defs>
                <g filter="url(#kglow)">
                  <rect x="7" y="10" width="4.5" height="12" fill="url(#kc1)" rx="1.5" />
                  <rect x="13.75" y="7.5" width="4.5" height="17" fill="url(#kc2)" rx="1.5" />
                  <rect x="20.5" y="11" width="4.5" height="10" fill="url(#kc1)" rx="1.5" />
                </g>
              </svg>
            </div>
            {isExpanded && (
              <span className="text-[17px] font-light tracking-[0.15em] uppercase text-gradient opacity-90">
                KANBAII
              </span>
            )}
          </div>
          {isExpanded && (
            <button
              className={`w-[26px] h-[26px] flex items-center justify-center rounded-md transition-all duration-200
                           ${pinned
                             ? 'text-accent bg-accent-muted'
                             : 'text-text-muted bg-transparent opacity-50 hover:opacity-100 hover:bg-surface hover:text-text'
                           }`}
              onClick={() => setPinned(!pinned)}
              title={pinned ? 'Unpin sidebar' : 'Pin sidebar'}
            >
              <Pin size={13} fill={pinned ? 'currentColor' : 'none'} className={`transition-transform duration-300 ${pinned ? 'rotate-0' : '-rotate-45'}`} />
            </button>
          )}
        </div>

        {/* Divider */}
        <div className={`h-px flex-shrink-0 opacity-50 ${isExpanded ? 'mx-3 my-[2px_12px_6px]' : 'mx-2.5 my-[2px_10px_6px]'}`}
             style={{ background: 'linear-gradient(90deg, transparent 10%, var(--border-glow) 50%, transparent 90%)', margin: isExpanded ? '2px 12px 6px' : '2px 10px 6px' }} />

        {/* Add Project */}
        <div className="flex-shrink-0 px-2 py-1">
          <button
            className={`w-full rounded-sm border border-dashed border-border-light bg-transparent text-text-muted text-xs font-medium
                         flex items-center gap-2 cursor-pointer transition-all duration-200 ease-out-expo
                         hover:bg-accent-muted hover:border-accent/25 hover:text-accent
                         ${isExpanded ? 'py-2 px-2.5 justify-start' : 'py-2 px-0 justify-center'}`}
            onClick={() => setShowCreate(true)}
          >
            <Plus size={14} />
            {isExpanded && 'New Project'}
          </button>
        </div>

        {/* Project list */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-1 pb-4">
          {activeProjects.length === 0 && archivedProjects.length === 0 && trashedProjects.length === 0 ? (
            <div className={`text-center text-text-muted text-body py-8 px-3 transition-opacity duration-150 ${isExpanded ? 'opacity-100' : 'opacity-0'}`}>
              No projects yet
            </div>
          ) : (
            <>
              {/* Active projects */}
              {activeProjects.map((project) => {
                const isActive = projectSlug === project.slug;
                const isRalphRunning = ralph.projectSlug === project.slug && (ralph.status === 'running' || ralph.status === 'paused');
                const isTeamsRunning = teams.active && teams.projectSlug === project.slug;
                const isPlannerRunning = plannerActive && useAppStore.getState().planner.projectSlug === project.slug;
                const isRunning = isRalphRunning || isTeamsRunning || isPlannerRunning;
                const rgb = hexToRgb(project.color);

                return (
                  <div key={project.id} className={`relative mb-0.5 group ${menuOpen === project.slug ? 'z-[200]' : ''}`}>
                    <button
                      className={`w-full rounded-sm text-left flex items-center transition-all duration-200 cursor-pointer
                                  ${isExpanded ? 'py-3 px-3.5 justify-start gap-3' : 'py-2.5 px-0 justify-center gap-0'}
                                  ${isActive
                                    ? 'bg-surface border border-border'
                                    : 'bg-transparent border border-transparent hover:bg-surface'
                                  }`}
                      onClick={() => handleProjectClick(project)}
                    >
                      <div
                        className={`rounded-full flex-shrink-0 transition-all duration-400
                                    ${isExpanded ? 'w-2.5 h-2.5' : 'w-3 h-3'}
                                    ${isRunning ? '!bg-emerald-500 animate-dot-pulse' : ''}`}
                        style={{
                          '--dot-r': rgb.r, '--dot-g': rgb.g, '--dot-b': rgb.b,
                          ...(!isRunning ? { background: project.color, boxShadow: isActive ? `0 0 8px ${project.color}50` : 'none' } : {}),
                        } as React.CSSProperties}
                      />
                      {isExpanded && (
                        <div className="flex-1 min-w-0 pr-6">
                          <div className={`text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis tracking-tight
                                           ${isActive ? 'text-text' : 'text-text-secondary'}`}>
                            {project.title}
                          </div>
                          {(project as any).workingDir ? (
                            <button
                              className="text-label flex items-center gap-1 mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis text-text-muted hover:text-accent transition-colors duration-150"
                              onClick={(e) => handleOpenFolder(e, project)}
                              title="Open folder in explorer"
                            >
                              <FolderOpen size={10} />{(project as any).workingDir.split(/[/\\]/).slice(-2).join('/')}
                            </button>
                          ) : (
                            <button
                              className="text-label flex items-center gap-1 mt-0.5 text-warning hover:text-accent transition-colors duration-150"
                              onClick={(e) => { e.stopPropagation(); setFolderModal({ slug: project.slug, current: '' }); }}
                              title="Click to set project folder"
                            >
                              <FolderOpen size={10} /> Set folder
                            </button>
                          )}
                        </div>
                      )}
                    </button>

                    {/* Action buttons */}
                    {isExpanded && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                        {(project as any).workingDir && (
                          <button
                            className="w-[22px] h-[22px] flex items-center justify-center rounded-sm text-text-muted bg-transparent
                                       transition-all duration-150 opacity-0 group-hover:opacity-100 hover:bg-surface hover:text-accent"
                            onClick={(e) => handleOpenFolder(e, project)}
                            title="Open folder"
                          >
                            <FolderOpen size={11} />
                          </button>
                        )}
                        <button
                          className="w-[22px] h-[22px] flex items-center justify-center rounded-sm text-text-muted bg-transparent
                                     transition-all duration-150 opacity-0 group-hover:opacity-100 hover:bg-surface hover:text-text-secondary"
                          onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === project.slug ? null : project.slug); setConfirmDelete(null); }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                          </svg>
                        </button>
                      </div>
                    )}

                    {/* Context menu */}
                    {menuOpen === project.slug && isExpanded && (
                      <div
                        className="absolute right-1 top-full mt-0.5 min-w-[160px] bg-glass backdrop-blur-[12px] backdrop-saturate-[160%]
                                   border border-glass-border rounded-md shadow-elevated z-[100] py-1 overflow-hidden animate-filter-in" data-context-menu
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="w-full py-2 px-3 flex items-center gap-2 bg-transparent text-text-secondary text-xs text-left transition-colors duration-100 hover:bg-surface-hover"
                          onClick={(e) => { e.stopPropagation(); setMenuOpen(null); setFolderModal({ slug: project.slug, current: (project as any).workingDir || '' }); }}
                        >
                          <FolderOpen size={14} /> {(project as any).workingDir ? 'Change Folder' : 'Set Folder'}
                        </button>
                        {(project as any).workingDir && (
                          <button
                            className="w-full py-2 px-3 flex items-center gap-2 bg-transparent text-text-secondary text-xs text-left transition-colors duration-100 hover:bg-surface-hover"
                            onClick={(e) => { e.stopPropagation(); setMenuOpen(null); handleOpenFolder(e, project); }}
                          >
                            <FolderOpen size={14} /> Open Folder
                          </button>
                        )}
                        <button
                          className="w-full py-2 px-3 flex items-center gap-2 bg-transparent text-text-secondary text-xs text-left transition-colors duration-100 hover:bg-surface-hover"
                          onClick={(e) => handleArchive(e, project)}
                        >
                          <Archive size={14} /> Archive
                        </button>
                        <button
                          className="w-full py-2 px-3 flex items-center gap-2 text-danger text-xs text-left transition-colors duration-100 bg-transparent hover:bg-danger-dim"
                          onClick={(e) => handleMoveToTrash(e, project)}
                        >
                          <Trash2 size={14} /> Move to Trash
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Archived section */}
              {archivedProjects.length > 0 && isExpanded && (
                <div className="mt-3 pt-2 border-t border-border/20">
                  <button
                    className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted/50 hover:text-text-muted transition-colors"
                    onClick={() => setShowArchived(!showArchived)}
                  >
                    <ChevronRight size={10} className={`transition-transform duration-200 ${showArchived ? 'rotate-90' : ''}`} />
                    <Archive size={10} />
                    Archived ({archivedProjects.length})
                  </button>
                  {showArchived && archivedProjects.map((project) => (
                    <div key={project.id} className={`relative mb-0.5 group opacity-50 hover:opacity-70 transition-opacity ${menuOpen === project.slug ? 'z-[200]' : ''}`}>
                      <button
                        className="w-full rounded-sm text-left flex items-center transition-all duration-200 cursor-pointer py-2 px-3.5 justify-start gap-3
                                   bg-transparent border border-transparent hover:bg-surface"
                        onClick={() => handleProjectClick(project)}
                      >
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: project.color }} />
                        <span className="text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis tracking-tight text-text-secondary flex-1 min-w-0">
                          {project.title}
                        </span>
                      </button>
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <button
                          className="w-[22px] h-[22px] flex items-center justify-center rounded-sm text-text-muted bg-transparent
                                     transition-all duration-150 opacity-0 group-hover:opacity-100 hover:bg-surface hover:text-text-secondary"
                          onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === project.slug ? null : project.slug); setConfirmDelete(null); }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                          </svg>
                        </button>
                      </div>
                      {menuOpen === project.slug && (
                        <div
                          className="absolute right-1 top-full mt-0.5 min-w-[160px] bg-glass backdrop-blur-[12px] backdrop-saturate-[160%]
                                     border border-glass-border rounded-md shadow-elevated z-[100] py-1 overflow-hidden animate-filter-in" data-context-menu
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="w-full py-2 px-3 flex items-center gap-2 bg-transparent text-text-secondary text-xs text-left transition-colors duration-100 hover:bg-surface-hover"
                            onClick={(e) => handleRestore(e, project)}
                          >
                            <RotateCcw size={14} /> Unarchive
                          </button>
                          <button
                            className="w-full py-2 px-3 flex items-center gap-2 text-danger text-xs text-left transition-colors duration-100 bg-transparent hover:bg-danger-dim"
                            onClick={(e) => handleMoveToTrash(e, project)}
                          >
                            <Trash2 size={14} /> Move to Trash
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Trash section */}
              {trashedProjects.length > 0 && isExpanded && (
                <div className="mt-2 pt-2 border-t border-border/20">
                  <button
                    className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted/50 hover:text-text-muted transition-colors"
                    onClick={() => setShowTrash(!showTrash)}
                  >
                    <ChevronRight size={10} className={`transition-transform duration-200 ${showTrash ? 'rotate-90' : ''}`} />
                    <Trash2 size={10} />
                    Trash ({trashedProjects.length})
                  </button>
                  {showTrash && trashedProjects.map((project) => (
                    <div key={project.id} className={`relative mb-0.5 group opacity-40 hover:opacity-60 transition-opacity ${menuOpen === project.slug ? 'z-[200]' : ''}`}>
                      <div className="w-full rounded-sm text-left flex items-center py-2 px-3.5 justify-start gap-3">
                        <div className="w-2 h-2 rounded-full flex-shrink-0 opacity-50" style={{ background: project.color }} />
                        <span className="text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis tracking-tight text-text-muted line-through flex-1 min-w-0">
                          {project.title}
                        </span>
                      </div>
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <button
                          className="w-[22px] h-[22px] flex items-center justify-center rounded-sm text-text-muted bg-transparent
                                     transition-all duration-150 opacity-0 group-hover:opacity-100 hover:bg-surface hover:text-text-secondary"
                          onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === project.slug ? null : project.slug); setConfirmDelete(null); }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                          </svg>
                        </button>
                      </div>
                      {menuOpen === project.slug && (
                        <div
                          className="absolute right-1 top-full mt-0.5 min-w-[160px] bg-glass backdrop-blur-[12px] backdrop-saturate-[160%]
                                     border border-glass-border rounded-md shadow-elevated z-[100] py-1 overflow-hidden animate-filter-in" data-context-menu
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="w-full py-2 px-3 flex items-center gap-2 bg-transparent text-text-secondary text-xs text-left transition-colors duration-100 hover:bg-surface-hover"
                            onClick={(e) => handleRestore(e, project)}
                          >
                            <RotateCcw size={14} /> Restore
                          </button>
                          <button
                            className={`w-full py-2 px-3 flex items-center gap-2 text-xs text-left transition-colors duration-100
                                        ${confirmDelete === project.slug ? 'text-danger bg-danger-dim' : 'text-danger bg-transparent hover:bg-danger-dim'}`}
                            onClick={(e) => handlePermanentDelete(e, project)}
                          >
                            <Trash2 size={14} /> {confirmDelete === project.slug ? 'Confirm Delete?' : 'Delete Permanently'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Claude Usage Widget */}
        <div className="border-t border-[rgba(148,163,242,0.03)] flex-shrink-0">
          <ClaudeUsageWidget isExpanded={isExpanded} />
        </div>

        {/* Bottom */}
        <div className={`border-t border-[rgba(148,163,242,0.03)] flex-shrink-0 flex items-center
                          ${isExpanded ? 'px-3 py-2.5 flex-row gap-1 justify-center' : 'px-0 py-3 flex-col gap-3 justify-center'}`}>
          <button
            className="inline-flex items-center justify-center w-7 h-7 rounded-sm text-text-muted transition-all duration-150 hover:text-accent hover:bg-accent-muted"
            onClick={() => setShowCosts(true)}
            title="Costs & Analytics"
          >
            <BarChart3 size={14} />
          </button>
          <button
            className="inline-flex items-center justify-center w-7 h-7 rounded-sm text-text-muted transition-all duration-150 hover:text-text-secondary hover:bg-surface-hover"
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            <Settings size={14} />
          </button>
          <ThemeToggle />
          {isExpanded && (
            <span className="text-data text-text-muted opacity-30 font-mono ml-auto">H</span>
          )}
        </div>
      </aside>

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} />}
      {folderModal && (
        <SetFolderModal
          currentPath={folderModal.current}
          onSave={async (path) => {
            try {
              await updateProject(folderModal.slug, { workingDir: path });
              addToast('Folder linked', 'success');
            } catch { addToast('Failed to set folder', 'error'); }
            setFolderModal(null);
          }}
          onClose={() => setFolderModal(null)}
        />
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showCosts && (
        <div className="fixed inset-0 z-[200] bg-overlay backdrop-blur-[16px] backdrop-saturate-[180%] flex items-center justify-center animate-overlay-in"
             onClick={() => setShowCosts(false)}>
          <div className="bg-modal border border-glass-border rounded-lg shadow-modal max-w-[800px] w-[95%] max-h-[85vh] overflow-hidden animate-spring-pop"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <span className="text-h2 font-semibold flex items-center gap-2"><BarChart3 size={16} /> Costs & Analytics</span>
              <button className="btn-icon" onClick={() => setShowCosts(false)}>
                <span className="text-text-muted">&times;</span>
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(85vh-52px)]">
              <CostsPanel projectSlug={projectSlug || undefined} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ═══ Set Folder Modal ═══ */
function SetFolderModal({ currentPath, onSave, onClose }: {
  currentPath: string;
  onSave: (path: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(currentPath);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) onSave(value.trim());
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-overlay backdrop-blur-[16px] backdrop-saturate-[180%] flex items-center justify-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="bg-modal border border-glass-border rounded-lg shadow-modal max-w-[440px] w-[92%] animate-spring-pop relative overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Top edge glow */}
        <div className="absolute top-0 left-[15%] right-[15%] h-px pointer-events-none"
             style={{ background: 'linear-gradient(90deg, transparent, rgba(129, 140, 248, 0.2), transparent)' }} />

        <div className="px-6 pt-5 pb-4">
          <div className="flex items-center gap-2 mb-1">
            <FolderOpen size={16} className="text-accent" />
            <span className="text-h2 font-semibold tracking-tight">
              {currentPath ? 'Change Folder' : 'Link Project Folder'}
            </span>
          </div>
          <p className="text-label text-text-muted leading-relaxed">
            Set the local directory where this project's code lives. Ralph and the terminal will use this path.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-data font-semibold text-text-muted uppercase tracking-widest font-mono">
              Folder Path
            </label>
            <input
              ref={inputRef}
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="C:\Users\marti\projects\my-app"
              className="w-full font-mono text-xs"
              spellCheck={false}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="btn-primary"
              disabled={!value.trim()}
            >
              <FolderOpen size={12} /> {currentPath ? 'Update' : 'Link Folder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
