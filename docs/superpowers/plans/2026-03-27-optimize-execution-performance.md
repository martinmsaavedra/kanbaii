# Optimize Ralph/Teams Execution Performance

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce per-task execution overhead from ~19s to ~3s by eliminating unnecessary MCP server spawns, hooks, CLAUDE.md loading, and hardcoded config.

**Architecture:** The fix uses Claude CLI's `--bare` flag to skip hooks/plugins/CLAUDE.md auto-discovery, generates a minimal MCP config with only the servers the task actually needs, and makes max-turns and model configurable per task. The `--bare` flag replaces `--verbose` as the base mode — we add `--verbose` back alongside it since `stream-json` requires it.

**Tech Stack:** Claude CLI flags (`--bare`, `--disallowedTools`), Node.js child_process, Express settings API

---

## Root Cause Analysis (Benchmarked)

| Bottleneck | Overhead | Cause |
|------------|----------|-------|
| 4 MCP servers spawned per task | **+10-15s** | context7, brave-search, github all use `npx -y` which downloads/caches packages on Windows via `cmd /c npx` |
| SessionStart hooks (superpowers) | **+3-5s** | Claude CLI loads superpowers plugin, skill metadata, CLAUDE.md from working dir |
| CLAUDE.md auto-discovery | **+1-2s** | Reads + processes the project's full CLAUDE.md (design rules, state rules, etc.) — irrelevant for task execution |
| `--max-turns 200` hardcoded | waste | Most tasks need 5-15 turns. 200 allows runaway executions |

**Measured:** `19s` (current) → `3s` (with `--bare` + kanbaii-only MCP) = **6.3x faster**

---

### Task 1: Add `--bare` flag to ClaudeRunner

**Files:**
- Modify: `src/server/engines/claudeRunner.ts:36-51`

`--bare` skips hooks, LSP, plugin sync, attribution, auto-memory, background prefetches, keychain reads, and CLAUDE.md auto-discovery. We still need `--verbose` (required by `stream-json`), and we pass our own system prompt via `--append-system-prompt`.

- [ ] **Step 1: Replace args array in claudeRunner.ts**

Change line 36 from:
```typescript
const args = ['-p', '--verbose', '--dangerously-skip-permissions', '--output-format', 'stream-json', '--max-turns', '200', '--disallowedTools', 'AskUserQuestion'];
```

To:
```typescript
const maxTurns = options.maxTurns?.toString() || '50';
const args = [
  '-p', '--bare', '--verbose',
  '--dangerously-skip-permissions',
  '--output-format', 'stream-json',
  '--max-turns', maxTurns,
  '--disallowedTools', 'AskUserQuestion',
];
```

- [ ] **Step 2: Add `maxTurns` to RunnerOptions interface**

At line 5-11, add `maxTurns` field:
```typescript
export interface RunnerOptions {
  prompt: string;
  workingDir: string;
  model?: string;
  systemPrompt?: string;
  timeout?: number;
  maxTurns?: number;
}
```

- [ ] **Step 3: Remove debug console.logs**

Remove lines 55-56 (the debug logs added during troubleshooting):
```typescript
// DELETE these lines:
console.log('[claude-runner] Spawning claude with MCP config:', ...);
console.log('[claude-runner] Full args:', args.join(' '));
```

Also remove the verbose stderr log at line 91:
```typescript
// CHANGE from:
if (text.trim()) console.log('[claude-runner] STDERR:', text.trim());
// TO: nothing (just keep stderr += text)
```

And remove the close log at line 95:
```typescript
// DELETE:
console.log(`[claude-runner] Process exited with code ${code}, stderr: ${stderr.slice(0, 500)}`);
```

- [ ] **Step 4: Verify the file compiles**

Run: `npx tsc --noEmit src/server/engines/claudeRunner.ts`
Expected: No errors (or only pre-existing ones)

- [ ] **Step 5: Commit**

```bash
git add src/server/engines/claudeRunner.ts
git commit -m "perf: add --bare flag to ClaudeRunner, make maxTurns configurable"
```

---

### Task 2: Generate minimal MCP config (kanbaii-only by default)

**Files:**
- Modify: `src/server/services/mcpConfig.ts:159-187`

Currently `generateMcpConfigForClaude()` always includes ALL enabled user MCP servers. Most tasks don't need context7, brave-search, or github — they just add 10-15s startup time. Change to only include kanbaii by default, with an option to include extras.

- [ ] **Step 1: Add `onlyKanbaii` parameter to generateMcpConfigForClaude**

```typescript
/**
 * Generate the MCP config JSON that Claude CLI expects for --mcp-config flag.
 * @param onlyKanbaii If true, only include the KANBAII escalation server (fast). Default: true.
 */
export function generateMcpConfigForClaude(onlyKanbaii: boolean = true): string | null {
  const mcpConfig: Record<string, { command: string; args?: string[]; env?: Record<string, string> }> = {};

  // Always include KANBAII's own MCP server (escalation + notifications)
  const kanbaiiMcpPath = path.resolve(__dirname, '..', 'mcp', 'kanbaii-mcp-server.js');
  mcpConfig['kanbaii'] = {
    command: 'node',
    args: [kanbaiiMcpPath],
    env: {
      KANBAII_PORT: process.env.KANBAII_PORT || '5555',
      KANBAII_HOST: 'localhost',
    },
  };

  // Only add user-configured servers if requested
  if (!onlyKanbaii) {
    const servers = listServers().filter((s) => s.enabled);
    for (const s of servers) {
      mcpConfig[s.name] = {
        command: s.command,
        ...(s.args?.length ? { args: s.args } : {}),
        ...(s.env && Object.keys(s.env).length ? { env: s.env } : {}),
      };
    }
  }

  const tmpFile = path.join(DATA_DIR, '..', onlyKanbaii ? '.mcp-runtime-minimal.json' : '.mcp-runtime.json');
  fs.writeFileSync(tmpFile, JSON.stringify({ mcpServers: mcpConfig }, null, 2), 'utf-8');
  return tmpFile;
}
```

- [ ] **Step 2: Update claudeRunner.ts to use minimal MCP by default**

In `claudeRunner.ts`, the import is already there. Change line 39:
```typescript
// BEFORE:
const mcpConfigPath = generateMcpConfigForClaude();

// AFTER (no change needed — default is now true = minimal):
const mcpConfigPath = generateMcpConfigForClaude();
```

No code change needed here since the default parameter handles it.

- [ ] **Step 3: Commit**

```bash
git add src/server/services/mcpConfig.ts
git commit -m "perf: generate minimal MCP config (kanbaii-only) by default"
```

---

### Task 3: Pass maxTurns from Ralph and Teams

**Files:**
- Modify: `src/server/engines/ralph.ts:124-129`
- Modify: `src/server/engines/teams.ts:105-109`

Add configurable `maxTurns` to both engines. Default to 50 (enough for most tasks, prevents runaway).

- [ ] **Step 1: Update Ralph runner.run() call**

In `ralph.ts`, change lines 124-129:
```typescript
const result = await runner.run({
  prompt,
  workingDir,
  model: task.model || 'sonnet',
  systemPrompt: skillsPrompt || undefined,
  maxTurns: 50,
});
```

- [ ] **Step 2: Update Teams runner.run() call**

In `teams.ts`, change lines 105-109:
```typescript
const result = await worker.runner!.run({
  prompt,
  workingDir: project.workingDir!,
  model: agent?.model || task.model || defaultModel || 'sonnet',
  maxTurns: 50,
});
```

- [ ] **Step 3: Commit**

```bash
git add src/server/engines/ralph.ts src/server/engines/teams.ts
git commit -m "perf: set maxTurns=50 default for Ralph and Teams"
```

---

### Task 4: Remove duplicate escalation instructions from prompts

**Files:**
- Modify: `src/server/engines/ralph.ts:243-249`
- Modify: `src/server/engines/teams.ts:194-200`

The escalation instructions are now in `--append-system-prompt` (claudeRunner.ts:43-47). The duplicated text in `buildTaskPrompt()` and `buildPrompt()` wastes ~100 tokens per task. Remove the duplicates and keep only a one-liner reminder.

- [ ] **Step 1: Trim ralph.ts buildTaskPrompt escalation section**

Replace lines 243-249 in `ralph.ts`:
```typescript
// BEFORE (6 lines of escalation warnings):
`## CRITICAL: Human Communication`,
`WARNING: The AskUserQuestion tool DOES NOT WORK...`,
// ... etc

// AFTER (1 line):
`If blocked, use escalate_to_human MCP tool (not AskUserQuestion).`,
```

Full updated function:
```typescript
function buildTaskPrompt(project: any, wi: any, task: any): string {
  const lines = [
    `# Task: ${task.title}`,
    '',
    task.description ? `## Description\n${task.description}\n` : '',
    `## Context`,
    `- Project: ${project.title}`,
    `- Work Item: ${wi.title} (${wi.category})`,
    wi.plan?.content ? `- Plan:\n${wi.plan.content}\n` : '',
    `## Instructions`,
    `Implement this task. Write clean, working code. Run tests if applicable.`,
    `If blocked, use escalate_to_human MCP tool (not AskUserQuestion).`,
  ].filter(Boolean);

  return lines.join('\n');
}
```

- [ ] **Step 2: Trim teams.ts buildPrompt escalation section**

Same change in `teams.ts`:
```typescript
function buildPrompt(project: any, wi: any, task: any, agent: any): string {
  const lines = [
    agent?.instructions ? `# Agent: ${agent.name}\n${agent.instructions}\n` : '',
    `# Task: ${task.title}`,
    task.description ? `\n## Description\n${task.description}` : '',
    `\n## Context`,
    `- Project: ${project.title}`,
    `- Work Item: ${wi?.title || 'Unknown'} (${wi?.category || 'unknown'})`,
    wi?.plan?.content ? `- Plan:\n${wi.plan.content}` : '',
    `\n## Instructions`,
    `Implement this task. Write clean, working code. Run tests if applicable.`,
    `If blocked, use escalate_to_human MCP tool (not AskUserQuestion).`,
  ].filter(Boolean);
  return lines.join('\n');
}
```

- [ ] **Step 3: Commit**

```bash
git add src/server/engines/ralph.ts src/server/engines/teams.ts
git commit -m "perf: remove duplicate escalation instructions from task prompts"
```

---

### Task 5: Clean up temp files and verify

**Files:**
- Delete: `data/.mcp-kanbaii-only.json` (test file)
- Delete: `data/.test-*` (any leftover test files)

- [ ] **Step 1: Remove temp test files**

```bash
rm -f data/.mcp-kanbaii-only.json data/.test-*.json data/.test-*.js data/.mcp-test-log.txt
```

- [ ] **Step 2: Restart server and test Ralph**

```bash
npm run dev:server
```

Start a task via Ralph. Expected:
- Server logs should NOT show `hook_started` or `SessionStart` events
- MCP servers init should show only `kanbaii: connected`
- Task should start outputting within ~3-5 seconds (not 15-20s)

- [ ] **Step 3: Test Teams**

Start a Teams execution. Expected:
- Same fast startup
- Escalation tool available if needed
- Task completes and moves to review

- [ ] **Step 4: Commit cleanup**

```bash
git add -u
git commit -m "chore: clean up temp test files from MCP debugging"
```

---

## Summary

| Change | File | Impact |
|--------|------|--------|
| Add `--bare` flag | claudeRunner.ts | **-5-10s** (skips hooks, plugins, CLAUDE.md) |
| Kanbaii-only MCP | mcpConfig.ts | **-10-15s** (no npx spawns for context7/brave/github) |
| `maxTurns: 50` | ralph.ts, teams.ts | Prevents runaway, minor perf gain |
| Trim prompt | ralph.ts, teams.ts | ~100 tokens saved per task |
| Remove debug logs | claudeRunner.ts | Cleaner output |

**Total expected improvement: 19s → 3-5s per task (4-6x faster)**
