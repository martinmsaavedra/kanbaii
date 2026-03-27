'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as TerminalIcon, Square, RotateCcw, Clock, ChevronDown, Command } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useToastStore } from '@/stores/toastStore';
import { getSocket } from '@/lib/socket';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';

const MODELS = [
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'opus', label: 'Opus' },
  { id: 'haiku', label: 'Haiku' },
];

const COMMANDS = [
  { cmd: '/help', desc: 'Show available commands' },
  { cmd: '/status', desc: 'Show server and project status' },
  { cmd: '/clear', desc: 'Clear terminal output' },
  { cmd: '/model <name>', desc: 'Switch Claude model' },
  { cmd: '/reset', desc: 'Reset terminal session' },
  { cmd: '/tasks', desc: 'List tasks in current work item' },
];

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function TerminalView({ projectSlug }: { projectSlug: string }) {
  const terminalStatus = useAppStore((s) => s.terminal.status);
  const setTerminalStatus = useAppStore((s) => s.setTerminalStatus);
  const resetTerminal = useAppStore((s) => s.resetTerminal);
  const addToast = useToastStore((s) => s.addToast);
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const fitRef = useRef<any>(null);
  const [spawned, setSpawned] = useState(false);
  const [model, setModel] = useState('sonnet');
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showPalette, setShowPalette] = useState(false);

  // Elapsed time
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) { setElapsed(0); return; }
    const iv = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(iv);
  }, [startedAt]);

  // Terminal starts off — user clicks "Start Claude" to spawn

  // Initialize xterm.js
  useEffect(() => {
    let term: any = null;
    let disposed = false;

    const init = async () => {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      // @ts-ignore - CSS import
      await import('@xterm/xterm/css/xterm.css').catch(() => {});

      if (disposed || !termRef.current) return;

      term = new Terminal({
        theme: {
          background: '#06060a',
          foreground: '#e8e8f0',
          cursor: '#6366f1',
          cursorAccent: '#06060a',
          selectionBackground: 'rgba(99, 102, 241, 0.3)',
          black: '#06060a', red: '#f87171', green: '#34d399', yellow: '#fbbf24',
          blue: '#818cf8', magenta: '#c084fc', cyan: '#22d3ee', white: '#e8e8f0',
          brightBlack: '#464654', brightRed: '#fca5a5', brightGreen: '#6ee7b7',
          brightYellow: '#fde68a', brightBlue: '#a5b4fc', brightMagenta: '#d8b4fe',
          brightCyan: '#67e8f9', brightWhite: '#ffffff',
        },
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Consolas', 'SF Mono', monospace",
        cursorBlink: true,
        scrollback: 3000,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(termRef.current);
      fitAddon.fit();

      xtermRef.current = term;
      fitRef.current = fitAddon;

      // Send keystrokes to backend
      term.onData((data: string) => {
        fetch(`${API}/api/terminal/input`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectSlug, data }),
        }).catch(() => {});
      });

      // Resize
      const resizeObs = new ResizeObserver(() => {
        if (fitAddon && !disposed) {
          fitAddon.fit();
          const dims = fitAddon.proposeDimensions();
          if (dims) {
            fetch(`${API}/api/terminal/resize`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ projectSlug, cols: dims.cols, rows: dims.rows }),
            }).catch(() => {});
          }
        }
      });
      if (termRef.current) resizeObs.observe(termRef.current);

      // Socket listeners
      const socket = getSocket();
      const onOutput = (ev: { projectSlug: string; text: string }) => {
        if (ev.projectSlug === projectSlug && term && !disposed) term.write(ev.text);
      };
      const onClosed = (ev: { projectSlug: string }) => {
        if (ev.projectSlug === projectSlug) { setTerminalStatus('idle'); setStartedAt(null); }
      };
      socket.on('terminal:output' as any, onOutput);
      socket.on('terminal:closed' as any, onClosed);

      return () => {
        disposed = true;
        socket.off('terminal:output' as any, onOutput);
        socket.off('terminal:closed' as any, onClosed);
        resizeObs.disconnect();
        term.dispose();
      };
    };

    const cleanupPromise = init();
    return () => { disposed = true; cleanupPromise.then((fn) => fn?.()); };
  }, [projectSlug, setTerminalStatus]);

  const handleSpawn = useCallback(async () => {
    try {
      const cols = fitRef.current?.proposeDimensions()?.cols || 120;
      const rows = fitRef.current?.proposeDimensions()?.rows || 30;
      await fetch(`${API}/api/terminal/spawn`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectSlug, model, cols, rows }),
      });
      setSpawned(true);
      setTerminalStatus('running');
      setStartedAt(Date.now());
    } catch { addToast('Failed to spawn terminal', 'error'); }
  }, [projectSlug, model, setTerminalStatus, addToast]);

  const handleStop = async () => {
    await fetch(`${API}/api/terminal/stop`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectSlug }),
    });
    setSpawned(false); setTerminalStatus('idle'); setStartedAt(null);
  };

  const handleReset = async () => {
    await fetch(`${API}/api/terminal/reset`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectSlug }),
    });
    resetTerminal(); setSpawned(false); setStartedAt(null);
    if (xtermRef.current) xtermRef.current.clear();
    addToast('Terminal reset', 'info');
  };

  const handlePaletteCmd = (cmd: string) => {
    setShowPalette(false);
    if (cmd === '/clear') {
      if (xtermRef.current) xtermRef.current.clear();
      return;
    }
    if (cmd === '/reset') {
      handleReset();
      return;
    }
    // Send command as input to terminal
    fetch(`${API}/api/terminal/input`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectSlug, data: cmd + '\r' }),
    }).catch(() => {});
  };

  // Keyboard shortcut for command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowPalette(p => !p);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const isRunning = terminalStatus === 'running';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header with title bar dots */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border shrink-0 bg-bg-subtle relative after:content-[''] after:absolute after:bottom-0 after:left-[5%] after:right-[5%] after:h-px after:bg-gradient-to-r after:from-transparent after:via-border-glow after:to-transparent">
        {/* Decorative traffic-light dots */}
        <div className="flex items-center gap-1.5 mr-2">
          <span className="w-2 h-2 rounded-full bg-[#ff5f57]" />
          <span className="w-2 h-2 rounded-full bg-[#febc2e]" />
          <span className="w-2 h-2 rounded-full bg-[#28c840]" />
        </div>

        <div className="text-[14px] font-semibold tracking-tight flex items-center gap-2">
          <TerminalIcon size={16} />
          Console
          <span className={`w-1.5 h-1.5 rounded-full ${
            isRunning ? 'bg-success animate-breathe shadow-[0_0_6px_rgba(52,211,153,0.4)]'
            : terminalStatus === 'error' ? 'bg-danger'
            : 'bg-text-muted'
          }`} />
        </div>

        {/* Session info */}
        <div className="flex items-center gap-3 ml-3">
          {/* Model selector */}
          <div className="relative">
            <button
              className="inline-flex items-center gap-1 px-2.5 py-1 text-data font-medium text-text-secondary bg-pill border border-border rounded-xs font-mono tracking-wide transition-all duration-150 ease-out-expo cursor-pointer hover:border-border-light hover:text-text disabled:opacity-50 disabled:cursor-default"
              onClick={() => setShowModelPicker(p => !p)}
              disabled={isRunning}
            >
              {model} <ChevronDown size={10} />
            </button>
            {showModelPicker && !isRunning && (
              <div className="absolute top-[calc(100%+4px)] left-0 bg-surface-elevated border border-border-light rounded-sm p-1 shadow-[0_8px_24px_rgba(0,0,0,0.4)] z-20 min-w-[100px] animate-fade-in-up">
                {MODELS.map(m => (
                  <button
                    key={m.id}
                    className={`block w-full px-2.5 py-1.5 text-label font-medium text-text-secondary rounded-xs font-mono text-left transition-all duration-120 ease-out-expo hover:bg-surface-hover hover:text-text ${
                      model === m.id ? 'text-accent bg-accent-muted' : ''
                    }`}
                    onClick={() => { setModel(m.id); setShowModelPicker(false); }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Elapsed time */}
          {isRunning && startedAt && (
            <div className="flex items-center gap-1 text-data text-text-muted font-mono font-medium px-2 py-[3px] bg-pill rounded-xs border border-[rgba(148,163,242,0.04)]">
              <Clock size={11} />
              {formatElapsed(elapsed)}
            </div>
          )}
        </div>

        <div className="flex gap-1.5 ml-auto">
          <button
            className="inline-flex items-center justify-center w-7 h-7 rounded-sm text-text-muted border border-border transition-all duration-150 ease-out-expo hover:text-accent hover:border-[rgba(99,102,241,0.2)] hover:bg-accent-muted"
            onClick={() => setShowPalette(p => !p)}
            title="Command Palette (Ctrl+K)"
          >
            <Command size={12} />
          </button>
          {!isRunning && (
            <button
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-br from-emerald-600 to-emerald-400 text-white text-label font-semibold rounded-sm transition-all duration-150 ease-out-expo relative overflow-hidden font-mono tracking-wide before:content-[''] before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/15 before:to-transparent before:pointer-events-none hover:shadow-[0_0_20px_rgba(52,211,153,0.25)] hover:-translate-y-px"
              onClick={handleSpawn}
            >
              Start Claude
            </button>
          )}
          {isRunning && (
            <button className="btn-ghost" onClick={handleStop}><Square size={12} /> Stop</button>
          )}
          <button className="btn-ghost" onClick={handleReset}><RotateCcw size={12} /> Reset</button>
        </div>
      </div>

      {/* Terminal area */}
      <div className="flex-1 relative overflow-hidden bg-[var(--terminal-bg,#06060a)]">
        <div ref={termRef} className="w-full h-full px-3 py-2" />

        {/* Command Palette Overlay */}
        {showPalette && (
          <div
            className="absolute inset-0 bg-[rgba(6,6,10,0.7)] backdrop-blur-sm flex items-start justify-center pt-[60px] z-10 animate-overlay-in"
            onClick={() => setShowPalette(false)}
          >
            <div
              className="bg-surface-elevated border border-border-light rounded-md shadow-[0_16px_48px_rgba(0,0,0,0.5),0_0_0_1px_rgba(99,102,241,0.05)] max-w-[400px] w-[90%] p-2 animate-fade-in-up"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-data font-semibold text-text-muted uppercase tracking-[0.08em] font-mono px-3 pt-2 pb-1.5">Command Palette</div>
              {COMMANDS.map(c => (
                <button
                  key={c.cmd}
                  className="flex items-center gap-3 px-3 py-2.5 w-full rounded-sm transition-all duration-120 ease-out-expo text-left hover:bg-surface-hover"
                  onClick={() => handlePaletteCmd(c.cmd)}
                >
                  <span className="text-xs font-semibold text-accent font-mono min-w-[110px]">{c.cmd}</span>
                  <span className="text-label text-text-muted">{c.desc}</span>
                </button>
              ))}
              <div className="text-xxs text-text-muted opacity-50 font-mono text-center py-2 tracking-wide">Press Ctrl+K to toggle</div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom status bar */}
      <div className="flex justify-between px-3 py-1 text-data font-mono text-text-muted border-t border-border bg-bg-subtle shrink-0">
        <span>{isRunning ? 'Connected' : 'Disconnected'}</span>
        <span>{model}</span>
      </div>
    </div>
  );
}
