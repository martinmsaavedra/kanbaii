import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { generateMcpConfigForClaude } from '../services/mcpConfig';

export interface RunnerOptions {
  prompt: string;
  workingDir: string;
  model?: string;
  systemPrompt?: string;
  timeout?: number;
  maxTurns?: number;
}

export interface RunnerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

/**
 * Spawn Claude CLI with -p + stream-json for real-time streaming output.
 *
 * Input/escalation is handled via MCP tool (escalate_to_human) — Claude calls
 * the KANBAII MCP server which POSTs to the backend, frontend shows modal,
 * user responds, MCP server returns response to Claude. No stdin needed.
 *
 * Events: 'output' (text), 'tool' (tool call info), 'cost' (usage data)
 */
export class ClaudeRunner extends EventEmitter {
  private proc: ChildProcess | null = null;
  private killed = false;

  async run(options: RunnerOptions): Promise<RunnerResult> {
    const { prompt, workingDir, model, systemPrompt, timeout = 600000 } = options;

    const maxTurns = options.maxTurns?.toString() || '50';
    const args = [
      '-p', '--verbose',
      '--dangerously-skip-permissions',
      '--output-format', 'stream-json',
      '--max-turns', maxTurns,
      '--disallowedTools', 'AskUserQuestion',
    ];
    if (model) args.push('--model', model);

    const mcpConfigPath = generateMcpConfigForClaude();
    if (mcpConfigPath) args.push('--mcp-config', mcpConfigPath);

    // Build combined system prompt — MUST include escalation instructions
    const escalationInstructions = [
      'CRITICAL TOOL RESTRICTION: You MUST NOT use the AskUserQuestion tool. It does NOT work in this execution mode — it auto-resolves without waiting for human input.',
      'When you need human input, approval, or a decision, you MUST use the "escalate_to_human" MCP tool (from the kanbaii MCP server). This tool blocks and waits for a real human response.',
      'NEVER ask questions in your text output. The user cannot see them. ONLY use escalate_to_human.',
    ].join('\n');
    const fullSystemPrompt = systemPrompt
      ? `${escalationInstructions}\n\n${systemPrompt}`
      : escalationInstructions;
    args.push('--append-system-prompt', fullSystemPrompt);

    const startTime = Date.now();

    return new Promise<RunnerResult>((resolve, reject) => {
      this.proc = spawn('claude', args, {
        cwd: workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout,
        env: { ...process.env },
        windowsHide: true,
      });

      let stdout = '', stderr = '', lineBuf = '', resultText = '';

      this.proc.stdout!.on('data', (chunk) => {
        const text = chunk.toString();
        stdout += text;
        lineBuf += text;
        const lines = lineBuf.split('\n');
        lineBuf = lines.pop() || '';
        for (const line of lines) {
          const t = line.trim();
          if (!t) continue;
          try {
            const ev = JSON.parse(t);
            this.handleEvent(ev);
            if (ev.type === 'result' && ev.result) resultText = ev.result;
          } catch {
            this.emit('output', t + '\n');
          }
        }
      });

      this.proc.stderr!.on('data', (chunk) => {
        const text = chunk.toString();
        stderr += text;
      });

      this.proc.on('close', (code) => {
        if (lineBuf.trim()) {
          try { this.handleEvent(JSON.parse(lineBuf.trim())); } catch {}
        }
        this.proc = null;
        resolve({ exitCode: code ?? 1, stdout: resultText || stdout.trim(), stderr: stderr.trim(), duration: Date.now() - startTime });
      });

      this.proc.on('error', (err) => { this.proc = null; reject(err); });

      // Write prompt and close stdin — Claude CLI -p mode needs EOF to start processing.
      // MCP tools communicate via their OWN stdio pipes, not through the main process stdin.
      this.proc.stdin!.write(prompt + '\n');
      this.proc.stdin!.end();
    });
  }

  private handleEvent(event: any): void {
    if (!event?.type) return;
    switch (event.type) {
      case 'assistant': {
        const content = event.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              this.emit('output', block.text);

            } else if (block.type === 'tool_use') {
              const name = block.name || 'tool';

              // Escalation tools — trigger modal (match MCP-prefixed names too)
              if (name === 'escalate_to_human' || name === 'AskUserQuestion' || name.endsWith('escalate_to_human')) {
                const parsed = this.parseAskInput(name, block.input);
                this.emit('output', `🔔 ${parsed.displayText}\n`);
                this.emit('escalation', { tool: name, question: parsed.question, input: { options: parsed.options } });
              } else if (name === 'send_notification' || name.endsWith('send_notification')) {
                this.emit('output', `📢 ${block.input?.message || ''}\n`);
              } else {
                // Show tool name + input preview for verbosity
                const inputPreview = this.formatToolInput(name, block.input);
                this.emit('output', `⚡ ${name}${inputPreview}\n`);
              }
              this.emit('tool', { tool: name, content: block.input });

            } else if (block.type === 'tool_result') {
              // Tool execution result — show preview
              const resultContent = typeof block.content === 'string'
                ? block.content
                : Array.isArray(block.content)
                  ? block.content.map((c: any) => c.text ?? '').join('')
                  : '';
              if (resultContent) {
                const preview = resultContent.length > 300 ? resultContent.slice(0, 300) + '...' : resultContent;
                this.emit('output', `  → ${preview}\n`);
              }
            }
          }
        }
        break;
      }
      case 'result': {
        if (event.total_cost_usd) {
          this.emit('cost', {
            costUsd: event.total_cost_usd,
            inputTokens: event.usage?.input_tokens || 0,
            outputTokens: event.usage?.output_tokens || 0,
          });
        }
        break;
      }
      case 'system':
        if (event.subtype === 'api_retry') {
          this.emit('output', `⏳ Retry #${event.attempt} (${event.error || 'rate limit'})...\n`);
        }
        break;
    }
  }

  /**
   * Parse AskUserQuestion / escalate_to_human input into clean question + options.
   * AskUserQuestion format: { question: "..." } or { questions: [{ question, options: [{ label, description }] }] }
   */
  private parseAskInput(tool: string, input: any): { question: string; options: string[]; displayText: string } {
    if (!input) return { question: '', options: [], displayText: 'Asking user...' };

    // escalate_to_human: simple { question, options }
    if (tool === 'escalate_to_human') {
      return {
        question: input.question || '',
        options: Array.isArray(input.options) ? input.options : [],
        displayText: `Asking: ${input.question || ''}`,
      };
    }

    // AskUserQuestion: { question: "..." } (simple)
    if (typeof input.question === 'string' && !input.questions) {
      return {
        question: input.question,
        options: Array.isArray(input.options) ? input.options.map((o: any) => typeof o === 'string' ? o : o.label || '') : [],
        displayText: `Asking: ${input.question}`,
      };
    }

    // AskUserQuestion: { questions: [{ question, header, options: [{ label, description }] }] }
    if (Array.isArray(input.questions)) {
      const allQuestions: string[] = [];
      const allOptions: string[] = [];

      for (const q of input.questions) {
        const qText = q.question || q.header || '';
        if (qText) allQuestions.push(qText);
        if (Array.isArray(q.options)) {
          for (const o of q.options) {
            allOptions.push(typeof o === 'string' ? o : o.label || '');
          }
        }
      }

      const questionText = allQuestions.join('\n\n');
      return {
        question: questionText,
        options: allOptions,
        displayText: `Asking: ${allQuestions[0] || ''}${allQuestions.length > 1 ? ` (+${allQuestions.length - 1} more)` : ''}`,
      };
    }

    // Fallback
    const raw = JSON.stringify(input);
    return { question: raw, options: [], displayText: `Asking user...` };
  }

  private formatToolInput(tool: string, input: any): string {
    if (!input) return '';
    switch (tool) {
      case 'Bash': return input.command ? ` $ ${input.command.slice(0, 80)}` : '';
      case 'Read': return input.file_path ? ` ${input.file_path}` : '';
      case 'Write': return input.file_path ? ` → ${input.file_path}` : '';
      case 'Edit': return input.file_path ? ` ✎ ${input.file_path}` : '';
      case 'Glob': return input.pattern ? ` ${input.pattern}` : '';
      case 'Grep': return input.pattern ? ` /${input.pattern}/` : '';
      case 'TodoWrite': return input.todos ? ` (${input.todos.length} items)` : '';
      case 'WebSearch': return input.query ? ` "${input.query}"` : '';
      case 'WebFetch': return input.url ? ` ${input.url.slice(0, 60)}` : '';
      default: return '';
    }
  }

  stop(): void {
    if (this.proc && !this.killed) {
      this.killed = true;
      try { this.proc.stdin?.end(); } catch {}
      this.proc.kill('SIGTERM');
      setTimeout(() => { if (this.proc) this.proc.kill('SIGKILL'); }, 5000);
    }
  }

  isRunning(): boolean {
    return this.proc !== null && !this.killed;
  }
}
