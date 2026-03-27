'use client';

import { useTheme } from '@/contexts/ThemeContext';
import { motion } from 'framer-motion';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      className="relative w-12 h-[26px] rounded-[13px] border border-border bg-surface cursor-pointer p-0 transition-all duration-250 ease-out-expo overflow-hidden shrink-0 hover:border-accent hover:bg-surface-hover hover:shadow-[0_0_8px_var(--accent-glow)]"
      onClick={toggleTheme}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      <motion.div
        className="absolute top-0.5 left-0.5 w-5 h-5 rounded-[10px] bg-accent shadow-[0_2px_6px_rgba(0,0,0,0.3)] flex items-center justify-center"
        initial={false}
        animate={{ x: theme === 'dark' ? 0 : 22 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {theme === 'dark' ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        )}
      </motion.div>

      <div className="absolute inset-0 flex items-center justify-between px-1.5 pointer-events-none">
        <div className={`ml-0.5 transition-opacity duration-250 ease-out-expo ${theme === 'dark' ? 'opacity-30' : 'opacity-0'}`}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </div>
        <div className={`mr-0.5 transition-opacity duration-250 ease-out-expo ${theme === 'light' ? 'opacity-30' : 'opacity-0'}`}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
          </svg>
        </div>
      </div>
    </button>
  );
}
