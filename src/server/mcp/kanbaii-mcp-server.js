#!/usr/bin/env node

/**
 * KANBAII MCP Server — Orchestration tools for Claude agents.
 *
 * This runs as a stdio MCP server that Claude CLI connects to.
 * Tools available:
 *   - escalate_to_human   : blocking poll for human response via dashboard
 *   - send_notification   : fire-and-forget message to dashboard
 *   - list_tasks          : GET /api/teams/tasks → tasks grouped by column
 *   - assign_task         : POST /api/teams/assign → spin up a worker
 *   - check_workers       : GET /api/teams/workers → worker pool status
 *   - wait_for_completion : poll workers until taskIds complete (or timeout)
 *   - send_message        : POST /api/escalation/create (teams source, non-blocking)
 *
 * Supports both transports:
 *   - JSONL (newline-delimited JSON) — used by Claude CLI 2.x+
 *   - Content-Length (LSP-style)     — used by older MCP clients
 */

const http = require('http');

const KANBAII_PORT = process.env.KANBAII_PORT || '5555';
const KANBAII_HOST = process.env.KANBAII_HOST || 'localhost';
const POLL_INTERVAL = 3000;

// ─── HTTP helpers ───

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: KANBAII_HOST, port: KANBAII_PORT, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: KANBAII_HOST, port: KANBAII_PORT, path, method: 'GET',
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', reject);
    req.end();
  });
}

// ─── MCP Protocol (stdio JSON-RPC, auto-detect JSONL vs Content-Length) ───

let buffer = '';
let useJsonl = null; // Auto-detect on first message

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  processBuffer();
});

function processBuffer() {
  // Auto-detect format on first meaningful data
  if (useJsonl === null) {
    const trimmed = buffer.trimStart();
    if (trimmed.startsWith('{')) {
      useJsonl = true;
    } else if (trimmed.startsWith('Content-Length:')) {
      useJsonl = false;
    } else {
      return; // Wait for more data
    }
  }

  if (useJsonl) {
    processJsonl();
  } else {
    processContentLength();
  }
}

function processJsonl() {
  const lines = buffer.split('\n');
  buffer = lines.pop() || ''; // Keep incomplete line in buffer
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      handleMessage(JSON.parse(trimmed));
    } catch {}
  }
}

function processContentLength() {
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) return;
    const header = buffer.substring(0, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) { buffer = buffer.substring(headerEnd + 4); continue; }
    const contentLength = parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;
    if (buffer.length < bodyStart + contentLength) return;
    const body = buffer.substring(bodyStart, bodyStart + contentLength);
    buffer = buffer.substring(bodyStart + contentLength);
    try { handleMessage(JSON.parse(body)); } catch {}
  }
}

function sendResponse(msg) {
  const body = JSON.stringify(msg);
  if (useJsonl) {
    process.stdout.write(body + '\n');
  } else {
    process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  }
}

// ─── Tool Definitions ───

const TOOLS = [
  {
    name: 'escalate_to_human',
    description: 'Escalate a question or decision to the human operator. Posts the question to the KANBAII dashboard and Telegram. If blocking=true (default), waits for the human response before returning. Use this whenever you need human input, approval, or a decision.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to present to the human' },
        options: { type: 'array', items: { type: 'string' }, description: 'Optional response options' },
        blocking: { type: 'boolean', description: 'If true (default), wait for response. If false, fire-and-forget.' },
        timeout_seconds: { type: 'number', description: 'Timeout in seconds (default 1800 = 30 min)' },
      },
      required: ['question'],
    },
  },
  {
    name: 'send_notification',
    description: 'Send a notification message to the KANBAII dashboard. Use for progress updates or important messages that do not require a response.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The message to display' },
        type: { type: 'string', enum: ['info', 'warning', 'error', 'success'], description: 'Message type' },
      },
      required: ['message'],
    },
  },
  {
    name: 'list_tasks',
    description: 'List all tasks in the Teams queue, grouped by column (Backlog, Todo, In Progress, Review, Done). Use this to understand what work is available or in progress before assigning tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        projectSlug: { type: 'string', description: 'Optional project slug to filter tasks' },
        workItemSlug: { type: 'string', description: 'Optional work item slug to filter tasks' },
      },
    },
  },
  {
    name: 'assign_task',
    description: 'Assign a task to an agent worker. Posts to the Teams engine to spin up a worker for the given task. Returns the workerId that can be tracked via check_workers or wait_for_completion.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task ID to assign' },
        agent: { type: 'string', description: 'Optional agent name to assign the task to' },
        model: { type: 'string', description: 'Optional model override (e.g. claude-opus-4-5)' },
        additionalContext: { type: 'string', description: 'Optional additional context or instructions for the worker' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'check_workers',
    description: 'Check the current worker pool status. Returns all active, completed, and failed workers with their task assignments and output summaries.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'wait_for_completion',
    description: 'Poll the worker pool every 3 seconds until the specified taskIds appear in completedResults, or until timeout. If no taskIds are provided, waits for the next ANY new completion. Returns the completed worker results.',
    inputSchema: {
      type: 'object',
      properties: {
        taskIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Task IDs to wait for. If omitted, waits for any new completion.',
        },
        timeout_seconds: {
          type: 'number',
          description: 'Max seconds to wait (default 900 = 15 min)',
        },
      },
    },
  },
  {
    name: 'send_message',
    description: 'Send a simple message or status update to the KANBAII dashboard from a teams agent. Unlike escalate_to_human, this never blocks — it is purely informational.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The message to send to the dashboard' },
      },
      required: ['message'],
    },
  },
  {
    name: 'report_work_item',
    description: 'Register a discovered work item (feature, bug, or refactor) in the KANBAII planner dashboard. The item appears on the discovery board for the user to see. Call this as soon as you identify a work item.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Unique ID for this item (e.g. disc-1, disc-2)' },
        title: { type: 'string', description: 'Short descriptive title' },
        category: { type: 'string', enum: ['feature', 'bug', 'refactor'], description: 'Type of work item' },
      },
      required: ['id', 'title', 'category'],
    },
  },
  {
    name: 'update_work_item',
    description: 'Update a work item with plan and/or tasks. Use status "planning" when you start working on it, and "ready" when plan + tasks are complete. The user can then approve it from the dashboard.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The item ID (e.g. disc-1) from report_work_item' },
        status: { type: 'string', enum: ['planning', 'ready'], description: '"planning" = working on it, "ready" = plan + tasks complete' },
        plan: { type: 'string', description: 'Markdown plan content (Objective, Approach, Key Decisions)' },
        tasks: {
          type: 'array',
          description: 'Array of tasks (required when status is "ready")',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              model: { type: 'string', description: 'Claude model: sonnet, opus, or haiku' },
              priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
              tags: { type: 'array', items: { type: 'string' } },
            },
            required: ['title', 'description'],
          },
        },
      },
      required: ['id', 'status'],
    },
  },
];

// ─── Message Handler ───

async function handleMessage(msg) {
  if (msg.method === 'initialize') {
    // Mirror the protocol version the client sends
    const clientVersion = msg.params?.protocolVersion || '2024-11-05';
    sendResponse({
      jsonrpc: '2.0', id: msg.id,
      result: {
        protocolVersion: clientVersion,
        serverInfo: { name: 'kanbaii', version: '1.0.0' },
        capabilities: { tools: { listChanged: false } },
      },
    });
  } else if (msg.method === 'notifications/initialized') {
    // No response needed
  } else if (msg.method === 'tools/list') {
    sendResponse({
      jsonrpc: '2.0', id: msg.id,
      result: { tools: TOOLS },
    });
  } else if (msg.method === 'tools/call') {
    const { name, arguments: args } = msg.params;
    try {
      const result = await dispatchTool(name, args || {});
      sendResponse({
        jsonrpc: '2.0', id: msg.id,
        result: { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] },
      });
    } catch (e) {
      sendResponse({
        jsonrpc: '2.0', id: msg.id,
        result: { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true },
      });
    }
  } else if (msg.id) {
    sendResponse({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Unknown method: ${msg.method}` } });
  }
}

// ─── Tool Dispatcher ───

async function dispatchTool(name, args) {
  switch (name) {
    case 'escalate_to_human':  return handleEscalation(args);
    case 'send_notification':  return handleSendNotification(args);
    case 'list_tasks':         return handleListTasks(args);
    case 'assign_task':        return handleAssignTask(args);
    case 'check_workers':      return handleCheckWorkers();
    case 'wait_for_completion': return handleWaitForCompletion(args);
    case 'send_message':       return handleSendMessage(args);
    case 'report_work_item':   return handleReportWorkItem(args);
    case 'update_work_item':   return handleUpdateWorkItem(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── Tool Implementations ───

async function handleEscalation(args) {
  const { question, options, blocking, timeout_seconds } = args;
  const isBlocking = blocking !== false;

  const createRes = await post('/api/escalation/create', {
    source: 'ralph', taskId: '', taskTitle: '',
    question, options: options || [], timeoutSeconds: timeout_seconds || 1800,
  });

  if (!createRes.ok) throw new Error('Failed to create escalation');

  const escalationId = createRes.data.escalationId;

  if (!isBlocking) {
    return { escalationId, status: 'sent', message: 'Escalation sent (non-blocking)' };
  }

  // Poll for response
  const deadline = Date.now() + (timeout_seconds || 1800) * 1000;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL);

    const status = await get('/api/escalation/status');
    if (status.ok && status.data?.responded && status.data.escalation?.response) {
      const response = status.data.escalation.response;
      await post('/api/escalation/clear', {});
      return { escalationId, status: 'responded', response, question };
    }

    if (status.ok && status.data?.escalation?.status === 'timed_out') {
      return { escalationId, status: 'timed_out', message: 'No response received', question };
    }
  }

  return { escalationId, status: 'timed_out', message: 'Timeout', question };
}

async function handleSendNotification(args) {
  await post('/api/escalation/create', {
    source: 'ralph', question: args.message, options: [],
    taskId: '', taskTitle: 'Notification', timeoutSeconds: 5,
  });
  return 'Notification sent';
}

async function handleListTasks(args) {
  let path = '/api/teams/tasks';
  const params = [];
  if (args.projectSlug) params.push(`projectSlug=${encodeURIComponent(args.projectSlug)}`);
  if (args.workItemSlug) params.push(`workItemSlug=${encodeURIComponent(args.workItemSlug)}`);
  if (params.length) path += '?' + params.join('&');

  const res = await get(path);
  if (!res.ok) throw new Error('Failed to fetch tasks');
  return res.data || res;
}

async function handleAssignTask(args) {
  const { taskId, agent, model, additionalContext } = args;

  const body = { taskId };
  if (agent !== undefined) body.agent = agent;
  if (model !== undefined) body.model = model;
  if (additionalContext !== undefined) body.additionalContext = additionalContext;

  const res = await post('/api/teams/assign', body);
  if (!res.ok) throw new Error(res.error || 'Failed to assign task');
  return res.data || res;
}

async function handleCheckWorkers() {
  const res = await get('/api/teams/workers');
  if (!res.ok) throw new Error('Failed to fetch workers');
  return res.data || res;
}

async function handleWaitForCompletion(args) {
  const { taskIds, timeout_seconds } = args;
  const timeoutMs = (timeout_seconds || 900) * 1000;
  const deadline = Date.now() + timeoutMs;
  const targetIds = taskIds && taskIds.length > 0 ? new Set(taskIds) : null;

  // Snapshot initial completed count for "any new completion" mode
  let initialCompletedCount = null;
  if (!targetIds) {
    try {
      const snapshot = await get('/api/teams/workers');
      if (snapshot.ok) {
        const data = snapshot.data || snapshot;
        const completed = data.completedResults || data.completed || [];
        initialCompletedCount = completed.length;
      }
    } catch {
      initialCompletedCount = 0;
    }
  }

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL);

    const res = await get('/api/teams/workers');
    if (!res.ok) continue;

    const data = res.data || res;
    const completed = data.completedResults || data.completed || [];

    if (targetIds) {
      // Wait for all specified taskIds to appear in completedResults
      const completedIds = new Set(completed.map(r => r.taskId || r.id).filter(Boolean));
      const allDone = [...targetIds].every(id => completedIds.has(id));
      if (allDone) {
        const matching = completed.filter(r => targetIds.has(r.taskId || r.id));
        return { status: 'completed', results: matching, allWorkers: data };
      }
    } else {
      // Wait for any new completion
      if (completed.length > initialCompletedCount) {
        const newResults = completed.slice(initialCompletedCount);
        return { status: 'completed', results: newResults, allWorkers: data };
      }
    }
  }

  // Timeout — return current state
  const finalRes = await get('/api/teams/workers');
  const finalData = finalRes.ok ? (finalRes.data || finalRes) : {};
  return {
    status: 'timed_out',
    message: `No completion after ${timeout_seconds || 900}s`,
    allWorkers: finalData,
  };
}

async function handleSendMessage(args) {
  await post('/api/escalation/create', {
    source: 'teams', question: args.message, options: [],
    taskId: '', taskTitle: 'Message', timeoutSeconds: 5,
  });
  return 'Message sent';
}

async function handleReportWorkItem(args) {
  const { id, title, category } = args;
  if (!id || !title) throw new Error('id and title are required');
  const res = await post('/api/planner/report-item', { id, title, category: category || 'feature' });
  if (!res.ok) throw new Error(res.error || 'Failed to report item');
  return res.data || { message: `Item "${title}" registered on the planner dashboard.` };
}

async function handleUpdateWorkItem(args) {
  const { id, status, plan, tasks } = args;
  if (!id || !status) throw new Error('id and status are required');
  const body = { id, status };
  if (plan) body.plan = plan;
  if (tasks) body.tasks = tasks.map(t => ({
    title: t.title,
    description: t.description || '',
    model: t.model || 'sonnet',
    priority: t.priority || 'medium',
    tags: t.tags || [],
  }));
  const res = await post('/api/planner/update-item', body);
  if (!res.ok) throw new Error(res.error || 'Failed to update item');
  return res.data || { message: `Item updated to "${status}".` };
}

// ─── Utilities ───

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Keep process alive
process.stdin.resume();
