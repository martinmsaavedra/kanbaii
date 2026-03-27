# Fix Teams/Ralph Escalation & Execution Flow

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Claude's MCP escalation tools (escalate_to_human, AskUserQuestion) actually block and wait for human response before continuing execution, in both Ralph and Teams.

**Architecture:** The fix is surgical — remove `stdin.end()` and add `--max-turns` so Claude keeps the process alive while MCP tools poll for human responses. The MCP server, escalation service, and frontend modal all work correctly already.

**Tech Stack:** Node.js child_process, Claude CLI stream-json, MCP stdio protocol

**Root Cause:** `claudeRunner.ts` calls `proc.stdin!.end()` immediately after writing the prompt. This closes stdin, which means MCP tool responses can never be delivered back to Claude. Claude exits, escalation is detected post-mortem, response is stored but never delivered.

---

### Task 1: Fix ClaudeRunner — keep stdin open, add --max-turns

**Files:**
- Modify: `src/server/engines/claudeRunner.ts:46-89`

The ONLY change needed is:
1. Add `--max-turns` to args
2. Remove `stdin.end()` — let the process exit naturally when work is done

- [ ] **Step 1: Modify claudeRunner.ts**

In the `runPrintMode` (or `run`) method:

```typescript
// Line ~46-52: Add --max-turns before other args
const args = [
  '-p',
  '--verbose',
  '--dangerously-skip-permissions',
  '--output-format', 'stream-json',
  '--max-turns', '200',  // <-- ADD: keeps process alive for MCP tool round-trips
];
```

```typescript
// Line ~87-89: REMOVE stdin.end(), keep stdin open
// BEFORE (broken):
this.proc.stdin!.write(prompt);
this.proc.stdin!.end();  // <-- REMOVE THIS LINE

// AFTER (fixed):
this.proc.stdin!.write(prompt + '\n');
// stdin stays open — MCP tools can deliver responses
```

- [ ] **Step 2: Update stop() to close stdin on explicit stop**

The `stop()` method already calls `stdin.end()` — this is correct for forced stops. No change needed.

- [ ] **Step 3: Verify the process still exits naturally**

With `--max-turns 200`, Claude will:
1. Process the prompt
2. Call tools (including MCP escalation if needed)
3. Receive MCP tool responses (because stdin is open)
4. Continue working
5. Exit naturally when done (stop_reason = "end_turn")

The `on('close')` handler resolves the Promise as before. No change needed there.

- [ ] **Step 4: Test manually**

```bash
# Test that Claude still exits after completing work:
echo "Say hello" | claude -p --verbose --max-turns 200 --dangerously-skip-permissions --output-format stream-json
# Should: output stream events and exit normally

# Test that MCP tools work:
echo "Use the escalate_to_human tool to ask me a question" | claude -p --verbose --max-turns 200 --dangerously-skip-permissions --output-format stream-json --mcp-config data/.mcp-runtime.json
# Should: call escalate_to_human, MCP server polls, waits for response
```

---

### Task 2: Remove auto-detection hacks (no longer needed)

**Files:**
- Modify: `src/server/engines/claudeRunner.ts:140-160`

The `result` event auto-detection of questions was a workaround for broken escalation. With MCP tools working, it creates false positives (detects rhetorical questions).

- [ ] **Step 1: Remove the auto-detect code from handleEvent**

Remove the section in the `case 'result'` handler that checks `lastTextBlock` for question patterns. Keep only the cost extraction.

```typescript
case 'result': {
  if (event.total_cost_usd) {
    this.emit('cost', { ... });
  }
  // REMOVE: the lastTextBlock question detection
  break;
}
```

- [ ] **Step 2: Remove the `lastTextBlock` property**

Remove `private lastTextBlock = '';` and the `this.lastTextBlock = block.text;` assignment.

---

### Task 3: Verify escalation round-trip works

No code changes — this is a verification task.

- [ ] **Step 1: Start the server**

```bash
npm run dev:server
```

- [ ] **Step 2: Create a task that will trigger escalation**

Create a task with a prompt that forces Claude to ask a question, e.g. "Ask me what framework I want to use before starting"

- [ ] **Step 3: Run the task via Ralph or Teams**

Click the Play button on the task.

- [ ] **Step 4: Verify the escalation modal appears**

Expected: Modal appears with the question from Claude.

- [ ] **Step 5: Respond to the escalation**

Type a response and click Send.

- [ ] **Step 6: Verify Claude continues**

Expected: The output panel shows Claude received the response and continued working.

- [ ] **Step 7: Verify the task completes**

Expected: Task moves to "review" column. Not marked as failed.

---

### Task 4: Fix MCP server path for production builds

**Files:**
- Modify: `src/server/services/mcpConfig.ts:162-170`

Currently the MCP server path uses `__dirname` which works in dev but breaks in production (compiled to dist/).

- [ ] **Step 1: Use a path that works in both dev and production**

```typescript
// Instead of:
const kanbaiiMcpPath = path.resolve(__dirname, '..', 'mcp', 'kanbaii-mcp-server.js');

// Use:
const kanbaiiMcpPath = path.resolve(__dirname, '..', '..', '..', 'src', 'server', 'mcp', 'kanbaii-mcp-server.js');
// OR copy the MCP server to a known location during build
```

Better approach: use the project root to find it:

```typescript
const projectRoot = path.resolve(__dirname, '..', '..', '..');
const kanbaiiMcpPath = path.join(projectRoot, 'src', 'server', 'mcp', 'kanbaii-mcp-server.js');
```

---

## Summary

The entire fix is **2 lines changed in claudeRunner.ts**:
1. Add `'--max-turns', '200'` to args array
2. Remove `this.proc.stdin!.end()` (keep stdin open)

Everything else (MCP server, escalation service, frontend modal, Telegram) already works correctly. They were just never reached because stdin was closed.
