import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { generateMcpConfigForClaude } from '../services/mcpConfig';

let pty: any = null;
try { pty = require('node-pty'); } catch {}

export interface RunnerOptions {
  prompt: string;
  workingDir: string;
  model?: string;
  systemPrompt?: string;
  timeout?: number;
  interactive?: boolean;  // Use PTY for interactive mode (allows input)
}

export interface RunnerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

const INPUT_PATTERNS = [
  /\?\s*$/, /\(y\/n\)/i, /\(yes\/no\)/i, /do you want/i, /would you like/i,
  /please (choose|select|confirm)/i, /\[Y\/n\]/, /¿/, /quieres/i,
];

/**
 * Spawn Claude CLI to execute a task.
 *
 * Two modes:
 * - Default (interactive=false): Uses -p + stream-json for streaming output. Stdin closed.
 * - Interactive (interactive=true): Uses node-pty, keeps stdin open for user input.
 */
export class ClaudeRunner extends EventEmitter {
  private proc: ChildProcess | null = null;
  private ptyProc: any = null;
  private killed = false;
  private lastOutputTime = 0;
  private inputCheckTimer: ReturnType<typeof setInterval> | null = null;
  private recentOutput = '';
  private isInteractive = false;

  async run(options: RunnerOptions): Promise<RunnerResult> {
    this.isInteractive = !!options.interactive;

    if (this.isInteractive && pty) {
      return this.runInteractive(options);
    }
    return this.runPrintMode(options);
  }

  // ─── Print Mode (-p + stream-json) — no input possible ───
  private async runPrintMode(options: RunnerOptions): Promise<RunnerResult> {
    const { prompt, workingDir, model, systemPrompt, timeout = 600000 } = options;

    const args = ['-p', '--verbose', '--dangerously-skip-permissions', '--output-format', 'stream-json'];
    if (model) args.push('--model', model);
    const mcpConfigPath = generateMcpConfigForClaude();
    if (mcpConfigPath) args.push('--mcp-config', mcpConfigPath);
    if (systemPrompt) args.push('--append-system-prompt', systemPrompt);

    const startTime = Date.now();

    return new Promise<RunnerResult>((resolve, reject) => {
      this.proc = spawn('claude', args, {
        cwd: workingDir, stdio: ['pipe', 'pipe', 'pipe'],
        timeout, env: { ...process.env }, windowsHide: true,
      });

      let stdout = '', stderr = '', lineBuf = '', resultText = '';

      this.proc.stdout!.on('data', (chunk) => {
        const text = chunk.toString();
        stdout += text;
        this.lastOutputTime = Date.now();
        lineBuf += text;
        const lines = lineBuf.split('\n');
        lineBuf = lines.pop() || '';
        for (const line of lines) {
          const t = line.trim();
          if (!t) continue;
          try {
            const ev = JSON.parse(t);
            this.handleStreamEvent(ev);
            if (ev.type === 'result' && ev.result) resultText = ev.result;
          } catch { this.emit('output', t + '\n'); }
        }
      });

      this.proc.stderr!.on('data', (chunk) => { stderr += chunk.toString(); });

      this.proc.on('close', (code) => {
        if (lineBuf.trim()) try { this.handleStreamEvent(JSON.parse(lineBuf.trim())); } catch {}
        this.cleanup();
        resolve({ exitCode: code ?? 1, stdout: resultText || stdout.trim(), stderr: stderr.trim(), duration: Date.now() - startTime });
      });

      this.proc.on('error', (err) => { this.cleanup(); reject(err); });

      this.proc.stdin!.write(prompt);
      this.proc.stdin!.end();
    });
  }

  // ─── Interactive Mode (node-pty) — supports input ───
  private async runInteractive(options: RunnerOptions): Promise<RunnerResult> {
    const { prompt, workingDir, model, systemPrompt, timeout = 600000 } = options;

    const isWindows = process.platform === 'win32';
    const claudeArgs = ['--dangerously-skip-permissions'];
    if (model) claudeArgs.push('--model', model);
    const mcpConfigPath = generateMcpConfigForClaude();
    if (mcpConfigPath) claudeArgs.push('--mcp-config', mcpConfigPath);
    if (systemPrompt) claudeArgs.push('--append-system-prompt', systemPrompt);

    const shell = isWindows ? 'cmd.exe' : '/bin/bash';
    const claudeCmd = `claude ${claudeArgs.join(' ')}`;
    const shellArgs = isWindows ? ['/c', claudeCmd] : ['-c', claudeCmd];

    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDECODE;

    const startTime = Date.now();

    return new Promise<RunnerResult>((resolve) => {
      this.ptyProc = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color', cols: 120, rows: 30,
        cwd: workingDir, env: cleanEnv,
      });

      let output = '';
      const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

      this.ptyProc.onData((data: string) => {
        const clean = stripAnsi(data);
        output += clean;
        this.recentOutput += clean;
        this.lastOutputTime = Date.now();
        this.emit('output', clean);

        if (this.recentOutput.length > 2000) this.recentOutput = this.recentOutput.slice(-1000);
      });

      this.ptyProc.onExit(({ exitCode }: { exitCode: number }) => {
        this.cleanup();
        resolve({ exitCode, stdout: output, stderr: '', duration: Date.now() - startTime });
      });

      // Input detection — check for questions after silence
      this.inputCheckTimer = setInterval(() => {
        if (!this.ptyProc || this.killed) return;
        const silence = Date.now() - this.lastOutputTime;
        if (silence > 5000 && this.recentOutput.trim()) {
          const last = this.recentOutput.trim().split('\n').slice(-3).join('\n');
          if (INPUT_PATTERNS.some(p => p.test(last))) {
            this.emit('input-needed', last);
            this.recentOutput = '';
          }
        }
      }, 3000);

      // Send the prompt as first message after a short delay (let Claude init)
      setTimeout(() => {
        if (this.ptyProc && !this.killed) {
          this.ptyProc.write(prompt + '\r');
        }
      }, 2000);

      // Timeout
      setTimeout(() => {
        if (this.ptyProc && !this.killed) {
          this.stop();
        }
      }, timeout);
    });
  }

  private handleStreamEvent(event: any): void {
    if (!event?.type) return;
    switch (event.type) {
      case 'assistant': {
        const content = event.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              this.recentOutput += block.text;
              this.emit('output', block.text);
            } else if (block.type === 'tool_use') {
              this.emit('output', `⚡ ${block.name || 'tool'}\n`);
              this.emit('tool', { tool: block.name, content: block.input });
            }
          }
        }
        break;
      }
      case 'result':
        // Text already streamed. Extract cost only.
        if (event.total_cost_usd) {
          this.emit('cost', {
            costUsd: event.total_cost_usd,
            inputTokens: event.usage?.input_tokens || 0,
            outputTokens: event.usage?.output_tokens || 0,
          });
        }
        break;
      case 'system':
        if (event.subtype === 'api_retry') {
          this.emit('output', `⏳ Retry #${event.attempt} (${event.error || 'rate limit'})...\n`);
        }
        break;
    }
  }

  sendInput(text: string): void {
    if (this.ptyProc && !this.killed) {
      this.ptyProc.write(text + '\r');
      this.recentOutput = '';
    } else if (this.proc && !this.killed && this.proc.stdin && !this.proc.stdin.destroyed) {
      this.proc.stdin.write(text + '\n');
      this.recentOutput = '';
    }
  }

  stop(): void {
    this.killed = true;
    if (this.ptyProc) { try { this.ptyProc.kill(); } catch {} }
    if (this.proc) {
      try { this.proc.stdin?.end(); } catch {}
      this.proc.kill('SIGTERM');
      setTimeout(() => { if (this.proc) this.proc.kill('SIGKILL'); }, 5000);
    }
    this.cleanup();
  }

  isRunning(): boolean {
    return (this.proc !== null || this.ptyProc !== null) && !this.killed;
  }

  private cleanup(): void {
    if (this.inputCheckTimer) { clearInterval(this.inputCheckTimer); this.inputCheckTimer = null; }
    this.proc = null;
    this.ptyProc = null;
  }
}
