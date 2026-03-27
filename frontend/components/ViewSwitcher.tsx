'use client';

import { LayoutGrid, Terminal, Users, Eye, Cpu, Sparkles } from 'lucide-react';
import { useRouterStore, ViewTab } from '@/stores/routerStore';
import { useAppStore } from '@/stores/appStore';
import { motion } from 'framer-motion';

interface TabDef { key: ViewTab; label: string; icon: React.ReactNode; shortcut: string }

const PROJECT_TABS: TabDef[] = [
  { key: 'work-items', label: 'Work Items', icon: <LayoutGrid size={15} />, shortcut: 'W' },
  { key: 'console',    label: 'Console',    icon: <Terminal size={15} />,   shortcut: 'C' },
  { key: 'teams',      label: 'Teams',      icon: <Users size={15} />,     shortcut: 'T' },
  { key: 'soul',       label: 'Soul',       icon: <Eye size={15} />,       shortcut: 'S' },
  { key: 'planner',   label: 'Planner',   icon: <Sparkles size={15} />,  shortcut: 'P' },
];

const WORK_ITEM_TABS: TabDef[] = [
  { key: 'board', label: 'Board', icon: <LayoutGrid size={15} />, shortcut: 'B' },
  { key: 'ralph', label: 'Ralph', icon: <Cpu size={15} />,        shortcut: 'R' },
];

/** Map tab key → whether its process is running */
function useRunningTabs(): Set<ViewTab> {
  const ralphStatus = useAppStore((s) => s.ralph.status);
  const teamsActive = useAppStore((s) => s.teams.active);
  const terminalStatus = useAppStore((s) => s.terminal.status);
  const plannerActive = useAppStore((s) => s.planner.active);

  const running = new Set<ViewTab>();
  if (terminalStatus === 'running') running.add('console');
  if (teamsActive) running.add('teams');
  if (ralphStatus === 'running' || ralphStatus === 'paused') running.add('ralph');
  if (plannerActive) running.add('planner');
  return running;
}

export function ViewSwitcher() {
  const { view, setView, projectSlug, workItemSlug } = useRouterStore();
  const runningTabs = useRunningTabs();
  if (!projectSlug) return null;

  const tabs = workItemSlug ? WORK_ITEM_TABS : PROJECT_TABS;
  const layoutId = workItemSlug ? 'wi-tab-indicator' : 'proj-tab-indicator';

  return (
    <nav className="flex relative">
      {tabs.map((tab) => {
        const isActive = view === tab.key;
        const isRunning = runningTabs.has(tab.key);
        return (
          <button
            key={tab.key}
            className={`flex flex-col items-center gap-[3px] px-5 pt-2 pb-2.5 text-data font-medium relative
                         border-b-2 border-transparent transition-all duration-180 ease-out-expo
                         ${isActive ? 'text-text' : 'text-text-muted hover:text-text-secondary hover:bg-[rgba(148,163,242,0.02)]'}`}
            onClick={() => setView(tab.key)}
            title={`${tab.label} (${tab.shortcut})`}
          >
            <span className={`flex transition-colors duration-180 ease-out-expo
                              ${isRunning ? 'animate-tab-process' : ''}
                              ${isActive && !isRunning ? 'text-accent drop-shadow-[0_0_4px_var(--accent-glow)]' : ''}`}>
              {tab.icon}
            </span>
            <span className={`font-mono text-xxs tracking-[0.06em] uppercase
                              ${isRunning ? 'text-emerald-400' : ''}`}>
              {tab.label}
            </span>
            {/* Running dot indicator */}
            {isRunning && (
              <span className="absolute top-1.5 right-2.5 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-breathe shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
            )}
            {isActive && (
              <motion.span
                layoutId={layoutId}
                className={`absolute -bottom-px left-[20%] right-[20%] h-[2px] rounded-t-sm
                            ${isRunning
                              ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                              : 'bg-accent shadow-[0_0_8px_var(--accent-glow)]'}`}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
