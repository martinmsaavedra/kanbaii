'use client';

import { LayoutGrid, Terminal, Users, Eye, Cpu } from 'lucide-react';
import { useRouterStore, ViewTab } from '@/stores/routerStore';
import { motion } from 'framer-motion';

interface TabDef { key: ViewTab; label: string; icon: React.ReactNode; shortcut: string }

const PROJECT_TABS: TabDef[] = [
  { key: 'work-items', label: 'Work Items', icon: <LayoutGrid size={15} />, shortcut: 'W' },
  { key: 'console',    label: 'Console',    icon: <Terminal size={15} />,   shortcut: 'C' },
  { key: 'teams',      label: 'Teams',      icon: <Users size={15} />,     shortcut: 'T' },
  { key: 'soul',       label: 'Soul',       icon: <Eye size={15} />,       shortcut: 'S' },
];

const WORK_ITEM_TABS: TabDef[] = [
  { key: 'board', label: 'Board', icon: <LayoutGrid size={15} />, shortcut: 'B' },
  { key: 'ralph', label: 'Ralph', icon: <Cpu size={15} />,        shortcut: 'R' },
];

export function ViewSwitcher() {
  const { view, setView, projectSlug, workItemSlug } = useRouterStore();
  if (!projectSlug) return null;

  const tabs = workItemSlug ? WORK_ITEM_TABS : PROJECT_TABS;
  const layoutId = workItemSlug ? 'wi-tab-indicator' : 'proj-tab-indicator';

  return (
    <nav className="flex relative">
      {tabs.map((tab) => {
        const isActive = view === tab.key;
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
                              ${isActive ? 'text-accent drop-shadow-[0_0_4px_var(--accent-glow)]' : ''}`}>
              {tab.icon}
            </span>
            <span className="font-mono text-xxs tracking-[0.06em] uppercase">
              {tab.label}
            </span>
            {isActive && (
              <motion.span
                layoutId={layoutId}
                className="absolute -bottom-px left-[20%] right-[20%] h-[2px] rounded-t-sm bg-accent shadow-[0_0_8px_var(--accent-glow)]"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
