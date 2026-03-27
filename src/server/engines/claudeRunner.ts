import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { generateMcpConfigForClaude } from '../services/mcpConfig';

export interface RunnerOptions {
  prompt: string;
  workingDir: string;
  model?: string;
  systemPrompt?: string;
  timeout?: number;
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
 * Spawn Claude CLI with stream-json for real-time output.
 *
 * Events: 'output', 'tool', 'input-needed'
 */
export class ClaudeRunner extends EventEmitter {
  private proc: ChildProcess | null = null;
  private killed = false;
  private lastOutputTime = 0;
  private inputCheckTimer: ReturnType<typeof setInterval> | null = null;
  private recentOutput = '';

  async run(options: RunnerOptions): Promise<RunnerResult> {
    const { prompt, workingDir, model, systemPrompt, timeout = 600000 } = options;

    const args = [
      '-p',
      '--verbose',
      '--dangerously-skip-permissions',
      '--output-format', 'stream-json',
    ];

    if (model) args.push('--model', model);

    const mcpConfigPath = generateMcpConfigForClaude();
    if (mcpConfigPath) args.push('--mcp-config', mcpConfigPath);

    if (systemPrompt) args.push('--append-system-prompt', systemPrompt);

    const startTime = Date.now();

    return new Promise<RunnerResult>((resolve, reject) => {
      // Use array form (no shell) to avoid deprecation warning
      this.proc = spawn('claude', args, {
        cwd: workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout,
        env: { ...process.env },
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      let lineBuf = '';
      let resultText = '';

      this.proc.stdout!.on('data', (chunk) => {
        const text = chunk.toString();
        stdout += text;
        this.lastOutputTime = Date.now();

        lineBuf += text;
        const lines = lineBuf.split('\n');
        lineBuf = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed);
            this.handleEvent(event);
            // Capture result text for final output
            if (event.type === 'result' && event.result) resultText = event.result;
          } catch {
            this.recentOutput += trimmed + '\n';
            this.emit('output', trimmed + '\n');
          }
        }
      });

      this.proc.stderr!.on('data', (chunk) => {
        stderr += chunk.toString();
        this.lastOutputTime = Date.now();
      });

      this.inputCheckTimer = setInterval(() => {
        if (!this.proc || this.killed) return;
        const silence = Date.now() - this.lastOutputTime;
        if (silence > 8000 && this.recentOutput.trim()) {
          const last = this.recentOutput.trim().split('\n').slice(-3).join('\n');
          if (INPUT_PATTERNS.some(p => p.test(last))) {
            this.emit('input-needed', last);
            this.recentOutput = '';
          }
        }
      }, 3000);

      this.proc.on('close', (code) => {
        if (lineBuf.trim()) {
          try { this.handleEvent(JSON.parse(lineBuf.trim())); } catch {}
        }
        this.cleanup();
        resolve({
          exitCode: code ?? 1,
          stdout: resultText || stdout.trim(),
          stderr: stderr.trim(),
          duration: Date.now() - startTime,
        });
      });

      this.proc.on('error', (err) => {
        this.cleanup();
        reject(err);
      });

      // Write prompt and close stdin — -p mode requires EOF to start
      this.proc.stdin!.write(prompt);
      this.proc.stdin!.end();
    });
  }

  /**
   * Handle a stream-json event from Claude CLI.
   * Real format from Claude:
   *   {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}
   *   {"type":"system","subtype":"tool_use",...}
   *   {"type":"result","result":"..."}
   */
  private handleEvent(event: any): void {
    if (!event?.type) return;

    switch (event.type) {
      case 'assistant': {
        // Extract text from message.content array
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

      case 'result': {
        // Final result — emit if has text content
        if (event.result) {
          const text = typeof event.result === 'string' ? event.result : JSON.stringify(event.result);
          this.emit('output', '\n' + text + '\n');
        }
        // Extract cost info
        if (event.total_cost_usd) {
          this.emit('cost', {
            costUsd: event.total_cost_usd,
            inputTokens: event.usage?.input_tokens || 0,
            outputTokens: event.usage?.output_tokens || 0,
            cacheRead: event.usage?.cache_read_input_tokens || 0,
            cacheCreation: event.usage?.cache_creation_input_tokens || 0,
          });
        }
        break;
      }

      case 'system': {
        // System events: init, tool_use, api_retry, etc.
        if (event.subtype === 'api_retry') {
          this.emit('output', `⏳ API retry #${event.attempt} (${event.error || 'rate limit'})...\n`);
        }
        // Don't spam hooks, init, etc.
        break;
      }

      case 'rate_limit_event':
        // Silently ignore
        break;

      default:
        // Unknown event with content
        if (event.content) {
          const text = typeof event.content === 'string' ? event.content : '';
          if (text) { this.recentOutput += text; this.emit('output', text); }
        }
        break;
    }
  }

  sendInput(text: string): void {
    if (this.proc && !this.killed && this.proc.stdin && !this.proc.stdin.destroyed) {
      this.proc.stdin.write(text + '\n');
      this.recentOutput = '';
    }
  }

  stop(): void {
    if (this.proc && !this.killed) {
      this.killed = true;
      try { this.proc.stdin?.end(); } catch {}
      this.proc.kill('SIGTERM');
      setTimeout(() => { if (this.proc) this.proc.kill('SIGKILL'); }, 5000);
    }
    this.cleanup();
  }

  isRunning(): boolean {
    return this.proc !== null && !this.killed;
  }

  private cleanup(): void {
    if (this.inputCheckTimer) { clearInterval(this.inputCheckTimer); this.inputCheckTimer = null; }
    this.proc = null;
  }
}
