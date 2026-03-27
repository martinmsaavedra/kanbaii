import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { generateMcpConfigForClaude } from '../services/mcpConfig';

export interface RunnerOptions {
  prompt: string;
  workingDir: string;
  model?: string;
  systemPrompt?: string;  // injected from skills
  timeout?: number;  // ms, default 10 min
}

export interface RunnerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

/**
 * Spawn Claude CLI to execute a task autonomously.
 * Uses -p with --dangerously-skip-permissions so Claude can use tools
 * (create files, edit code, run bash) without asking for permission.
 *
 * -p = print mode (non-interactive, reads prompt from stdin, outputs result)
 * --dangerously-skip-permissions = bypass ALL permission checks for tool use
 */
export class ClaudeRunner extends EventEmitter {
  private proc: ChildProcess | null = null;
  private killed = false;

  async run(options: RunnerOptions): Promise<RunnerResult> {
    const { prompt, workingDir, model, systemPrompt, timeout = 600000 } = options;

    const args = [
      '-p',
      '--dangerously-skip-permissions',
      '--output-format', 'text',
    ];

    if (model) {
      args.push('--model', model);
    }

    // MCP servers
    const mcpConfigPath = generateMcpConfigForClaude();
    if (mcpConfigPath) {
      args.push('--mcp-config', mcpConfigPath);
    }

    // Skills as system prompt
    if (systemPrompt) {
      args.push('--append-system-prompt', systemPrompt);
    }

    const startTime = Date.now();

    return new Promise<RunnerResult>((resolve, reject) => {
      this.proc = spawn('claude', args, {
        cwd: workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
        timeout,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      this.proc.stdout!.on('data', (chunk) => {
        const text = chunk.toString();
        stdout += text;
        this.emit('output', text);
      });

      this.proc.stderr!.on('data', (chunk) => {
        const text = chunk.toString();
        stderr += text;
      });

      this.proc.on('close', (code) => {
        this.proc = null;
        const duration = Date.now() - startTime;
        resolve({
          exitCode: code ?? 1,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          duration,
        });
      });

      this.proc.on('error', (err) => {
        this.proc = null;
        reject(err);
      });

      // Write prompt via stdin and close to signal EOF
      this.proc.stdin!.write(prompt);
      this.proc.stdin!.end();
    });
  }

  stop(): void {
    if (this.proc && !this.killed) {
      this.killed = true;
      this.proc.kill('SIGTERM');
      setTimeout(() => {
        if (this.proc) {
          this.proc.kill('SIGKILL');
        }
      }, 5000);
    }
  }

  isRunning(): boolean {
    return this.proc !== null && !this.killed;
  }
}
