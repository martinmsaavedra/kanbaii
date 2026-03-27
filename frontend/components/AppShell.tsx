'use client';

import { useState, useCallback } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { Sidebar } from './Sidebar';
import { Breadcrumb } from './Breadcrumb';
import { ToastContainer } from './Toast';
import { KeyboardHelp } from './KeyboardHelp';
import { CommandPalette } from './CommandPalette';
import { useSocket } from '@/hooks/useSocket';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

function ShellInner({ children }: { children: React.ReactNode }) {
  useSocket();
  const [showHelp, setShowHelp] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  const toggleHelp = useCallback(() => setShowHelp((v) => !v), []);
  const closeHelp = useCallback(() => setShowHelp(false), []);
  const toggleCommandPalette = useCallback(() => setShowCommandPalette((v) => !v), []);
  const closeCommandPalette = useCallback(() => setShowCommandPalette(false), []);

  useKeyboardShortcuts({
    onToggleHelp: toggleHelp,
    onToggleCommandPalette: toggleCommandPalette,
    onEscape: () => {
      if (showCommandPalette) closeCommandPalette();
      else closeHelp();
    },
  });

  return (
    <>
      <div className="flex h-screen w-screen overflow-hidden">
        <Sidebar />
        {/* Gradient glow separator */}
        <div className="w-px flex-shrink-0 bg-gradient-to-b from-transparent via-border-glow to-transparent" />
        <main className="flex-1 overflow-hidden flex flex-col surface-gradient">
          <Breadcrumb />
          {children}
        </main>
      </div>
      <ToastContainer />
      {showHelp && <KeyboardHelp onClose={closeHelp} />}
      {showCommandPalette && (
        <CommandPalette
          onClose={closeCommandPalette}
          onShowHelp={() => { closeCommandPalette(); toggleHelp(); }}
        />
      )}
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ShellInner>{children}</ShellInner>
    </ThemeProvider>
  );
}
