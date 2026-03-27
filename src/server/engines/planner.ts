import { ClaudeRunner } from './claudeRunner';
import { emit } from '../lib/typedEmit';
import { plannerStore } from './plannerStore';
import * as projectStore from '../services/projectStore';
import * as workItemStore from '../services/workItemStore';
import { createEscalation, setSourceOverride } from '../services/escalationService';

let currentRunner: ClaudeRunner | null = null;
let locked = false;

// Disallow tools that slow down the planner (superpowers skills, todo tracking, etc.)
const PLANNER_DISALLOWED_TOOLS = [
  'Skill', 'TodoWrite', 'TodoRead', 'ToolSearch',
  'EnterPlanMode', 'ExitPlanMode',
  'Agent', 'NotebookEdit',
];

const PLANNER_SYSTEM_PROMPT = `You are a fast, focused product planner. Your ONLY job: decompose what the user wants into work items with plans and tasks.

DO NOT use Skill, TodoWrite, ToolSearch, or any planning/brainstorming tools. DO NOT invoke superpowers. Work directly.

## How you work

1. Read the user's request. Identify every distinct feature, bug, or refactor.
2. For EACH item found, immediately call send_notification:
   {"type":"item:discovered","item":{"id":"disc-1","title":"Short Name","category":"feature"}}
3. For each item, ask the user 1-2 key questions via escalate_to_human. Only ask what you NEED to write a good plan. Don't ask obvious things.
4. Once clear, notify planning started, then deliver the plan + tasks:
   {"type":"item:updated","item":{"id":"disc-1","status":"planning"}}
   Then:
   {"type":"item:updated","item":{"id":"disc-1","status":"ready","plan":"## Objective\\n...","tasks":[{"title":"...","description":"...","model":"sonnet","priority":"medium","tags":["backend"]}]}}
5. Move to the next item. Repeat.

## send_notification format
The message field MUST be valid JSON. Types:
- item:discovered — register a new item
- item:updated — change status/plan/tasks
- status — progress message: {"type":"status","message":"Planning OAuth..."}

## Rules
- Be FAST. No unnecessary tool calls. No file exploration unless the user asks.
- Use send_notification for ALL structured output (items, plans, tasks).
- Use escalate_to_human for questions. ONE question at a time. Include options when possible.
- 3-8 tasks per work item. Each task: title, description, model (sonnet), priority, tags[].
- Plan: markdown with Objective, Approach, Key Decisions.
- If there's an existing spec/plan in the project, read it and use it — don't re-plan from scratch.`;

export async function startPlanner(projectSlug: string, prompt: string): Promise<void> {
  const project = projectStore.getProject(projectSlug);
  if (!project) throw new Error(`Project not found: ${projectSlug}`);
  if (!project.workingDir) throw new Error('Project has no working directory configured.');
  if (locked) throw new Error('Planner is already running.');

  locked = true;
  plannerStore.start(projectSlug, prompt);
  setSourceOverride('planner');

  emit('planner:started' as any, { projectSlug });

  const runner = new ClaudeRunner();
  currentRunner = runner;

  // Listen for Claude's text output → chat messages
  let currentAssistantMsg = '';

  const flushAssistantMsg = () => {
    const text = currentAssistantMsg.trim();
    if (!text) return;
    const msg = plannerStore.addMessage('assistant', text);
    emit('planner:message' as any, { id: msg.id, role: 'assistant', content: text });
    currentAssistantMsg = '';
  };

  runner.on('output', (chunk: string) => {
    // Skip notification/escalation echo lines (handled separately by tool handler)
    if (chunk.startsWith('📢') || chunk.startsWith('🔔')) return;
    if (chunk.startsWith('⚡') || chunk.startsWith('  →')) {
      // Flush any pending text before tool output
      flushAssistantMsg();
      emit('planner:output' as any, { message: chunk });
      return;
    }

    currentAssistantMsg += chunk;
    // Flush on any newline for smoother streaming
    if (chunk.includes('\n') || chunk.length > 200) {
      flushAssistantMsg();
    }
  });

  // Track discovered item counter for auto-ID
  let discoveredCount = 0;

  // Listen for tool calls — parse structured notifications + track progress
  runner.on('tool', (data: { tool: string; content: any }) => {
    const toolName = data.tool || '';
    console.log(`[planner] tool: ${toolName}`, JSON.stringify(data.content)?.slice(0, 200));

    // send_notification (with or without MCP prefix)
    if (toolName === 'send_notification' || toolName.endsWith('send_notification')) {
      const rawMessage = data.content?.message || '';
      try {
        const payload = JSON.parse(rawMessage);
        console.log(`[planner] notification parsed:`, payload.type);
        handleNotification(payload);
      } catch {
        if (rawMessage) {
          const msg = plannerStore.addMessage('system', rawMessage);
          emit('planner:message' as any, { id: msg.id, role: 'system', content: rawMessage });
        }
      }
    }

    // Skill calls — track what Claude is doing
    if (toolName === 'Skill') {
      const skill = data.content?.skill || '';
      const sysMsg = plannerStore.addMessage('system', `Using ${skill}...`);
      emit('planner:message' as any, { id: sysMsg.id, role: 'system', content: sysMsg.content });
    }
  });

  // Listen for escalations → add to chat history as escalation message
  // NOTE: The actual escalation is created by the MCP server via HTTP POST to /api/escalation/create
  // (with sourceOverride='planner'). We just need to add it to the planner's chat history.
  runner.on('escalation', (data: { tool: string; question: string; input: any }) => {
    const options = data.input?.options || [];
    console.log(`[planner] escalation detected: "${data.question.slice(0, 80)}..." options:`, options);

    // Add to chat as escalation message
    const msg = plannerStore.addMessage('escalation', data.question, options);
    emit('planner:message' as any, { id: msg.id, role: 'escalation', content: data.question });
  });

  try {
    await runner.run({
      prompt: `USER REQUEST:\n\n${prompt}\n\nIdentify all work items, send item:discovered for each, then clarify and plan. Be fast and direct.`,
      workingDir: project.workingDir,
      model: 'sonnet',
      maxTurns: 100,
      timeout: 900000, // 15 min
      disallowedTools: PLANNER_DISALLOWED_TOOLS,
    });
  } catch (err) {
    const msg = plannerStore.addMessage('system', `Error: ${(err as Error).message}`);
    emit('planner:message' as any, { id: msg.id, role: 'system', content: msg.content });
  }

  // Flush remaining text
  if (currentAssistantMsg.trim()) {
    const msg = plannerStore.addMessage('assistant', currentAssistantMsg.trim());
    emit('planner:message' as any, { id: msg.id, role: 'assistant', content: currentAssistantMsg.trim() });
  }

  currentRunner = null;
  plannerStore.stop();
  setSourceOverride(null);
  locked = false;

  emit('planner:stopped' as any, { message: 'Planner session ended' });
}

function handleNotification(payload: any): void {
  if (!payload?.type) return;

  switch (payload.type) {
    case 'item:discovered': {
      const { id, title, category } = payload.item || {};
      if (!id || !title) return;
      const item = plannerStore.addDiscoveredItem({ id, title, category: category || 'feature' });
      emit('planner:item-discovered' as any, { id: item.id, title: item.title, category: item.category });

      const msg = plannerStore.addMessage('system', `Identified: ${title} (${category || 'feature'})`);
      emit('planner:message' as any, { id: msg.id, role: 'system', content: msg.content });
      break;
    }
    case 'item:updated': {
      const { id, status, plan, tasks } = payload.item || {};
      if (!id) return;
      const item = plannerStore.updateItem(id, { status, plan, tasks });
      if (item) {
        emit('planner:item-updated' as any, { id, status: item.status, plan: item.plan, tasks: item.tasks });

        if (status === 'ready') {
          const msg = plannerStore.addMessage('system', `Ready for approval: ${item.title} (${item.tasks.length} tasks)`);
          emit('planner:message' as any, { id: msg.id, role: 'system', content: msg.content });
        }
      }
      break;
    }
    case 'status': {
      const msg = plannerStore.addMessage('system', payload.message || '');
      emit('planner:message' as any, { id: msg.id, role: 'system', content: msg.content });
      break;
    }
  }
}

export function stopPlanner(): void {
  if (currentRunner) currentRunner.stop();
  plannerStore.stop();
  setSourceOverride(null);
  locked = false;
}

export async function approveItem(itemId: string): Promise<string> {
  const state = plannerStore.getState();
  if (!state.projectSlug) throw new Error('No active planner session');

  const item = plannerStore.getItem(itemId);
  if (!item) throw new Error(`Item not found: ${itemId}`);
  if (item.status !== 'ready') throw new Error(`Item not ready: ${item.status}`);
  if (item.approvedAs) throw new Error(`Item already approved as: ${item.approvedAs}`);

  // Create real work item
  const wi = workItemStore.createWorkItem(state.projectSlug, {
    title: item.title,
    category: item.category,
    plan: {
      prompt: state.messages[0]?.content || '',
      content: item.plan || undefined,
      status: item.plan ? 'approved' : 'empty',
      generatedBy: 'claude',
    },
  });

  // Create tasks in todo column
  for (const task of item.tasks) {
    workItemStore.createTask(state.projectSlug, wi.slug, {
      title: task.title,
      description: task.description,
      model: task.model as any || 'sonnet',
      priority: task.priority as any || 'medium',
      tags: task.tags,
      column: 'todo',
    });
  }

  plannerStore.markApproved(itemId, wi.slug);

  // Broadcast
  const updatedWI = workItemStore.getWorkItem(state.projectSlug, wi.slug);
  if (updatedWI) emit('workItem:updated', { projectSlug: state.projectSlug, workItem: updatedWI });
  emit('planner:item-approved' as any, { id: itemId, workItemSlug: wi.slug });

  return wi.slug;
}

export function discardItem(itemId: string): void {
  plannerStore.removeItem(itemId);
}
