import { ClaudeRunner } from './claudeRunner';
import { emit } from '../lib/typedEmit';
import { plannerStore } from './plannerStore';
import * as projectStore from '../services/projectStore';
import * as workItemStore from '../services/workItemStore';
import { createEscalation } from '../services/escalationService';

let currentRunner: ClaudeRunner | null = null;
let locked = false;

const PLANNER_SYSTEM_PROMPT = `You are an AI Product Planner for the KANBAII project management system.

Your job is to have a conversation with the user to understand what they want to build, then decompose their request into discrete work items (features, bugs, or refactors), each with a plan and tasks.

## Your Process

1. UNDERSTAND — Read the user's initial prompt carefully. Identify all distinct features, bugs, or refactors they're describing.

2. DISCOVER — For each item you identify, use send_notification with a JSON payload to register it:
   {"type":"item:discovered","item":{"id":"disc-1","title":"Feature Name","category":"feature"}}
   Use incrementing IDs: disc-1, disc-2, etc. Category must be "feature", "bug", or "refactor".

3. CLARIFY — For each item, think about what you need to know to write a good plan. Use escalate_to_human to ask the user ONE question at a time. Focus on:
   - Technical decisions (JWT vs sessions, SQL vs NoSQL, etc.)
   - Scope boundaries (what's in, what's out)
   - Priority and dependencies between items
   - Integration requirements

4. PLAN — Once you have enough context for an item, first notify it's being planned:
   {"type":"item:updated","item":{"id":"disc-1","status":"planning"}}

   Then when plan + tasks are ready:
   {"type":"item:updated","item":{"id":"disc-1","status":"ready","plan":"## Objective\\n...markdown plan...","tasks":[{"title":"Task name","description":"What to do","model":"sonnet","priority":"medium","tags":["backend","api"]}]}}

5. ITERATE — Move to the next item. The user may also add new items or modify existing ones during the conversation.

## Rules
- Ask ONE question at a time via escalate_to_human. Wait for the answer before asking the next.
- Always identify ALL items first (send all item:discovered notifications) before deep-diving into any single one.
- Generate 3-8 tasks per work item.
- Tasks should be concrete and actionable.
- Each task needs: title, description, model (default "sonnet"), priority ("low"|"medium"|"high"|"urgent"), tags (string array).
- Use send_notification with type "status" for progress updates: {"type":"status","message":"Moving to plan OAuth Integration"}
- Plan content should be markdown with: Objective, Approach, Key Decisions, Considerations.`;

export async function startPlanner(projectSlug: string, prompt: string): Promise<void> {
  const project = projectStore.getProject(projectSlug);
  if (!project) throw new Error(`Project not found: ${projectSlug}`);
  if (!project.workingDir) throw new Error('Project has no working directory configured.');
  if (locked) throw new Error('Planner is already running.');

  locked = true;
  plannerStore.start(projectSlug, prompt);

  emit('planner:started' as any, { projectSlug });

  const runner = new ClaudeRunner();
  currentRunner = runner;

  // Listen for Claude's text output → chat messages
  let currentAssistantMsg = '';
  runner.on('output', (chunk: string) => {
    // Skip notification/escalation echo lines (handled separately)
    if (chunk.startsWith('📢') || chunk.startsWith('🔔')) return;
    if (chunk.startsWith('⚡') || chunk.startsWith('  →')) {
      emit('planner:output' as any, { message: chunk });
      return;
    }

    currentAssistantMsg += chunk;
    // Flush on newline boundaries for smoother streaming
    if (chunk.includes('\n')) {
      const msg = plannerStore.addMessage('assistant', currentAssistantMsg.trim());
      emit('planner:message' as any, { id: msg.id, role: 'assistant', content: currentAssistantMsg.trim() });
      currentAssistantMsg = '';
    }
  });

  // Listen for tool calls — parse structured notifications
  runner.on('tool', (data: { tool: string; content: any }) => {
    if (data.tool === 'send_notification' && data.content?.message) {
      try {
        const payload = JSON.parse(data.content.message);
        handleNotification(payload);
      } catch {
        // Plain text notification — show as system message
        const msg = plannerStore.addMessage('system', data.content.message);
        emit('planner:message' as any, { id: msg.id, role: 'system', content: data.content.message });
      }
    }
  });

  // Listen for escalations → inline chat questions
  runner.on('escalation', (data: { tool: string; question: string; input: any }) => {
    const options = data.input?.options || [];
    const esc = createEscalation({
      source: 'planner',
      taskId: 'planner',
      taskTitle: 'AI Planner',
      question: data.question,
      options,
    });

    // Store as escalation message in chat history
    const msg = plannerStore.addMessage('escalation', data.question, options);

    emit('planner:escalation' as any, {
      id: esc.id,
      source: 'planner',
      taskId: 'planner',
      taskTitle: 'AI Planner',
      question: data.question,
      options,
      timeoutMs: esc.timeoutMs,
      messageId: msg.id,
    });
  });

  try {
    await runner.run({
      prompt: `The user wants to build the following:\n\n${prompt}\n\nAnalyze this request and begin the discovery process. Identify all work items, then clarify and plan each one.`,
      workingDir: project.workingDir,
      model: 'sonnet',
      maxTurns: 200,
      timeout: 1800000, // 30 min
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
