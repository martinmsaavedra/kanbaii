import { getIO } from '../lib/typedEmit';

let pty: any = null;
try { pty = require('node-pty'); } catch { console.warn('[terminal] node-pty not available'); }

export interface TerminalSession {
  id: string;
  projectSlug: string;
  workingDir: string;
  status: 'idle' | 'running' | 'error';
  proc: any | null;
  pendingOutput: string;
}

const sessions: Map<string, TerminalSession> = new Map();

function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

export function getSessionState(projectSlug: string) {
  const session = sessions.get(projectSlug);
  return {
    status: session?.status || 'idle',
    projectSlug,
    id: session?.id || null,
    ptyAvailable: !!pty,
  };
}

export function spawnPty(projectSlug: string, workingDir: string, opts?: { model?: string; cols?: number; rows?: number }): string {
  killSession(projectSlug);

  const id = `term-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`;

  if (!pty) throw new Error('node-pty not available. Install: npm install node-pty');

  const isWindows = process.platform === 'win32';
  const shell = isWindows ? 'cmd.exe' : '/bin/bash';
  const claudeCmd = `claude${opts?.model ? ` --model ${opts.model}` : ''}`;
  const shellArgs = isWindows ? ['/c', claudeCmd] : ['-c', claudeCmd];

  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;

  const proc = pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cols: opts?.cols || 120,
    rows: opts?.rows || 30,
    cwd: workingDir,
    env: cleanEnv,
  });

  const session: TerminalSession = { id, projectSlug, workingDir, status: 'running', proc, pendingOutput: '' };
  sessions.set(projectSlug, session);

  proc.onData((data: string) => {
    session.pendingOutput += stripAnsi(data);
    if (session.pendingOutput.length > 524288) session.pendingOutput = session.pendingOutput.slice(-262144);
    getIO().emit('terminal:output' as any, { projectSlug, text: data });
  });

  proc.onExit(({ exitCode }: { exitCode: number }) => {
    session.status = 'idle';
    session.proc = null;
    getIO().emit('terminal:closed' as any, { projectSlug, code: exitCode });
  });

  return id;
}

export function sendInput(projectSlug: string, data: string): void {
  const session = sessions.get(projectSlug);
  if (session?.proc) session.proc.write(data);
}

export function resizeTerminal(projectSlug: string, cols: number, rows: number): void {
  const session = sessions.get(projectSlug);
  if (session?.proc) session.proc.resize(cols, rows);
}

export function killSession(projectSlug: string): void {
  const session = sessions.get(projectSlug);
  if (session?.proc) { session.proc.kill(); session.proc = null; session.status = 'idle'; }
}

export function resetSession(projectSlug: string): void {
  killSession(projectSlug);
  sessions.delete(projectSlug);
}
