# AI Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 5-step wizard modal with a dedicated full-screen Planner view that uses a persistent Claude CLI process to brainstorm, discover features, generate plans and tasks through conversation, with incremental user approval.

**Architecture:** New project-level "Planner" tab with split layout (chat left, mini discovery board right). Backend engine spawns Claude CLI like Ralph, using existing MCP escalation infrastructure for user Q&A. Discovered items live in engine state until approved, at which point they become real work items.

**Tech Stack:** Express + Socket.IO (backend engine/routes), React + Zustand + Tailwind (frontend view), Claude CLI with MCP (AI execution)

---

### Task 1: Backend — Planner Engine State & Types

**Files:**
- Create: `src/server/engines/plannerStore.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/server/services/escalationService.ts`

- [ ] **Step 1: Add planner Socket.IO event types to shared types**

Add to `src/shared/types.ts` after the `live:stopped` event in `ServerToClientEvents`:

```typescript
  'planner:started': (data: { projectSlug: string }) => void;
  'planner:message': (data: { id: string; role: 'user' | 'assistant' | 'system' | 'escalation'; content: string }) => void;
  'planner:item-discovered': (data: { id: string; title: string; category: WorkItemCategory }) => void;
  'planner:item-updated': (data: { id: string; status: 'identified' | 'planning' | 'ready'; plan?: string; tasks?: Array<{ title: string; description: string; model: string; priority: string; tags: string[] }> }) => void;
  'planner:escalation': (data: { id: string; source: 'planner'; taskId: string; taskTitle: string; question: string; options: string[]; timeoutMs: number }) => void;
  'planner:item-approved': (data: { id: string; workItemSlug: string }) => void;
  'planner:stopped': (data: { message: string }) => void;
  'planner:output': (data: { message: string }) => void;
```

- [ ] **Step 2: Update escalation service to support 'planner' source**

In `src/server/services/escalationService.ts`, change the `source` type:

```typescript
// Line 9 — change:
source: 'ralph' | 'teams';
// To:
source: 'ralph' | 'teams' | 'planner';

// Line 29 — change:
source: 'ralph' | 'teams';
// To:
source: 'ralph' | 'teams' | 'planner';
```

- [ ] **Step 3: Create plannerStore.ts**

```typescript
import fs from 'fs';
import path from 'path';

export interface PlannerTask {
  title: string;
  description: string;
  model: string;
  priority: string;
  tags: string[];
}

export interface PlannerDiscoveredItem {
  id: string;
  title: string;
  category: 'feature' | 'bug' | 'refactor';
  status: 'identified' | 'planning' | 'ready';
  plan: string | null;
  tasks: PlannerTask[];
  approvedAs: string | null;
}

export interface PlannerMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'escalation';
  content: string;
  options?: string[];
  respondedWith?: string;
  timestamp: string;
}

export interface PlannerState {
  active: boolean;
  projectSlug: string | null;
  messages: PlannerMessage[];
  discoveredItems: PlannerDiscoveredItem[];
  startedAt: string | null;
}

const IDLE: PlannerState = {
  active: false,
  projectSlug: null,
  messages: [],
  discoveredItems: [],
  startedAt: null,
};

class PlannerStore {
  private state: PlannerState = { ...IDLE };

  getState(): PlannerState {
    return { ...this.state, messages: [...this.state.messages], discoveredItems: [...this.state.discoveredItems] };
  }

  start(projectSlug: string, userPrompt: string): void {
    this.state = {
      active: true,
      projectSlug,
      messages: [{
        id: `msg-${Date.now()}`,
        role: 'user',
        content: userPrompt,
        timestamp: new Date().toISOString(),
      }],
      discoveredItems: [],
      startedAt: new Date().toISOString(),
    };
  }

  stop(): void {
    this.state.active = false;
  }

  reset(): void {
    this.state = { ...IDLE };
  }

  isActive(): boolean {
    return this.state.active;
  }

  addMessage(role: 'user' | 'assistant' | 'system' | 'escalation', content: string, options?: string[]): PlannerMessage {
    const msg: PlannerMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      role,
      content,
      options,
      timestamp: new Date().toISOString(),
    };
    this.state.messages.push(msg);
    return msg;
  }

  setEscalationResponse(messageId: string, response: string): void {
    const msg = this.state.messages.find(m => m.id === messageId);
    if (msg) msg.respondedWith = response;
  }

  addDiscoveredItem(item: { id: string; title: string; category: 'feature' | 'bug' | 'refactor' }): PlannerDiscoveredItem {
    const disc: PlannerDiscoveredItem = {
      id: item.id,
      title: item.title,
      category: item.category,
      status: 'identified',
      plan: null,
      tasks: [],
      approvedAs: null,
    };
    this.state.discoveredItems.push(disc);
    return disc;
  }

  updateItem(id: string, data: { status?: 'identified' | 'planning' | 'ready'; plan?: string; tasks?: PlannerTask[]; title?: string }): PlannerDiscoveredItem | null {
    const item = this.state.discoveredItems.find(i => i.id === id);
    if (!item) return null;
    if (data.status) item.status = data.status;
    if (data.plan !== undefined) item.plan = data.plan;
    if (data.tasks) item.tasks = data.tasks;
    if (data.title) item.title = data.title;
    return item;
  }

  getItem(id: string): PlannerDiscoveredItem | null {
    return this.state.discoveredItems.find(i => i.id === id) || null;
  }

  markApproved(id: string, workItemSlug: string): void {
    const item = this.state.discoveredItems.find(i => i.id === id);
    if (item) item.approvedAs = workItemSlug;
  }

  removeItem(id: string): void {
    this.state.discoveredItems = this.state.discoveredItems.filter(i => i.id !== id);
  }
}

export const plannerStore = new PlannerStore();
```

- [ ] **Step 4: Commit**

```bash
git add src/server/engines/plannerStore.ts src/shared/types.ts src/server/services/escalationService.ts
git commit -m "feat(planner): add planner store, types, and escalation source"
```

---

### Task 2: Backend — Planner Engine

**Files:**
- Create: `src/server/engines/planner.ts`

- [ ] **Step 1: Create planner engine**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/server/engines/planner.ts
git commit -m "feat(planner): add planner engine with Claude CLI, notification parsing, and approval flow"
```

---

### Task 3: Backend — Planner API Routes

**Files:**
- Create: `src/server/routes/planner.ts`
- Modify: `src/server/index.ts`

- [ ] **Step 1: Create planner routes**

```typescript
import { Router, Request, Response } from 'express';
import { plannerStore } from '../engines/plannerStore';
import { startPlanner, stopPlanner, approveItem, discardItem } from '../engines/planner';

const router = Router();

// POST /api/planner/start
router.post('/start', async (req: Request, res: Response) => {
  const { projectSlug, prompt } = req.body;
  if (!projectSlug || !prompt) {
    return res.status(400).json({ ok: false, error: 'projectSlug and prompt are required' });
  }
  if (plannerStore.isActive()) {
    return res.status(409).json({ ok: false, error: 'Planner is already running. Stop it first.' });
  }

  try {
    startPlanner(projectSlug, prompt).catch((err) => {
      console.error('[planner] Error:', err);
    });
    res.json({ ok: true, data: { message: 'Planner started' } });
  } catch (err) {
    res.status(409).json({ ok: false, error: (err as Error).message });
  }
});

// POST /api/planner/stop
router.post('/stop', (_req: Request, res: Response) => {
  stopPlanner();
  res.json({ ok: true, data: { message: 'Planner stopped' } });
});

// GET /api/planner/state
router.get('/state', (_req: Request, res: Response) => {
  res.json({ ok: true, data: plannerStore.getState() });
});

// POST /api/planner/approve
router.post('/approve', async (req: Request, res: Response) => {
  const { itemId } = req.body;
  if (!itemId) return res.status(400).json({ ok: false, error: 'itemId is required' });

  try {
    const slug = await approveItem(itemId);
    res.json({ ok: true, data: { workItemSlug: slug } });
  } catch (err) {
    res.status(400).json({ ok: false, error: (err as Error).message });
  }
});

// POST /api/planner/discard
router.post('/discard', (req: Request, res: Response) => {
  const { itemId } = req.body;
  if (!itemId) return res.status(400).json({ ok: false, error: 'itemId is required' });

  discardItem(itemId);
  res.json({ ok: true, data: { message: 'Item discarded' } });
});

export default router;
```

- [ ] **Step 2: Mount routes in index.ts**

In `src/server/index.ts`, add the import after line 31 (escalation import):

```typescript
import plannerRoutes from './routes/planner';
```

Add the route mount after line 81 (escalation route):

```typescript
  app.use('/api/planner', plannerRoutes);
```

- [ ] **Step 3: Commit**

```bash
git add src/server/routes/planner.ts src/server/index.ts
git commit -m "feat(planner): add planner API routes and mount in server"
```

---

### Task 4: Frontend — AppStore Planner State

**Files:**
- Modify: `frontend/stores/appStore.ts`
- Modify: `frontend/stores/routerStore.ts`

- [ ] **Step 1: Add planner types and state to routerStore**

In `frontend/stores/routerStore.ts`, change line 6:

```typescript
export type ProjectView = 'work-items' | 'console' | 'teams' | 'soul' | 'planner';
```

- [ ] **Step 2: Add planner state to appStore**

In `frontend/stores/appStore.ts`, add these interfaces after the `TeamsState` interface (around line 76):

```typescript
export interface PlannerTask {
  title: string;
  description: string;
  model: string;
  priority: string;
  tags: string[];
}

export interface PlannerDiscoveredItem {
  id: string;
  title: string;
  category: 'feature' | 'bug' | 'refactor';
  status: 'identified' | 'planning' | 'ready';
  plan: string | null;
  tasks: PlannerTask[];
  approvedAs: string | null;
}

export interface PlannerMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'escalation';
  content: string;
  options?: string[];
  respondedWith?: string;
  timestamp: string;
}

export interface PlannerState {
  active: boolean;
  projectSlug: string | null;
  messages: PlannerMessage[];
  discoveredItems: PlannerDiscoveredItem[];
  escalation: EscalationRequest | null;
  escalationMessageId: string | null;
}
```

Add `IDLE_PLANNER` constant after `IDLE_TEAMS`:

```typescript
const IDLE_PLANNER: PlannerState = {
  active: false, projectSlug: null, messages: [], discoveredItems: [],
  escalation: null, escalationMessageId: null,
};
```

Add to the `AppStore` interface (after the escalation section):

```typescript
  // --- Planner (SSOT) ---
  planner: PlannerState;
  onPlannerStarted: (data: { projectSlug: string }) => void;
  onPlannerMessage: (data: { id: string; role: string; content: string }) => void;
  onPlannerItemDiscovered: (data: { id: string; title: string; category: string }) => void;
  onPlannerItemUpdated: (data: { id: string; status: string; plan?: string; tasks?: PlannerTask[] }) => void;
  onPlannerEscalation: (data: any) => void;
  onPlannerEscalationResponded: (response: string) => void;
  onPlannerItemApproved: (data: { id: string; workItemSlug: string }) => void;
  onPlannerStopped: () => void;
```

Add the implementation inside `create<AppStore>()`, after the escalation section:

```typescript
  // --- Planner ---
  planner: { ...IDLE_PLANNER },

  onPlannerStarted: (data) => set({
    planner: { ...IDLE_PLANNER, active: true, projectSlug: data.projectSlug },
  }),

  onPlannerMessage: (data) => set((s) => ({
    planner: {
      ...s.planner,
      messages: [...s.planner.messages.slice(-200), {
        id: data.id,
        role: data.role as PlannerMessage['role'],
        content: data.content,
        timestamp: new Date().toISOString(),
      }],
    },
  })),

  onPlannerItemDiscovered: (data) => set((s) => ({
    planner: {
      ...s.planner,
      discoveredItems: [...s.planner.discoveredItems, {
        id: data.id,
        title: data.title,
        category: data.category as PlannerDiscoveredItem['category'],
        status: 'identified' as const,
        plan: null,
        tasks: [],
        approvedAs: null,
      }],
    },
  })),

  onPlannerItemUpdated: (data) => set((s) => ({
    planner: {
      ...s.planner,
      discoveredItems: s.planner.discoveredItems.map((item) =>
        item.id === data.id
          ? { ...item, status: data.status as PlannerDiscoveredItem['status'], plan: data.plan ?? item.plan, tasks: data.tasks ?? item.tasks }
          : item
      ),
    },
  })),

  onPlannerEscalation: (data) => set((s) => ({
    planner: {
      ...s.planner,
      escalation: { id: data.id, source: 'planner' as const, taskId: data.taskId, taskTitle: data.taskTitle, question: data.question, options: data.options, timeoutMs: data.timeoutMs },
      escalationMessageId: data.messageId || null,
    },
  })),

  onPlannerEscalationResponded: (response) => set((s) => ({
    planner: {
      ...s.planner,
      escalation: null,
      escalationMessageId: null,
      messages: s.planner.messages.map((m) =>
        m.id === s.planner.escalationMessageId ? { ...m, respondedWith: response } : m
      ),
    },
  })),

  onPlannerItemApproved: (data) => set((s) => ({
    planner: {
      ...s.planner,
      discoveredItems: s.planner.discoveredItems.map((item) =>
        item.id === data.id ? { ...item, approvedAs: data.workItemSlug } : item
      ),
    },
  })),

  onPlannerStopped: () => set((s) => ({
    planner: { ...s.planner, active: false, escalation: null, escalationMessageId: null },
  })),
```

Update `isSystemBusy` to include planner:

```typescript
  isSystemBusy: () => {
    const s = get();
    return s.ralph.status === 'running' || s.ralph.status === 'paused' || s.teams.active || s.terminal.status === 'running' || s.planner.active;
  },
```

Update `rehydrate` to fetch planner state:

Add after the teamsRes fetch inside the `Promise.all`:

```typescript
fetch(`${API}/api/planner/state`).then((r) => r.json()).catch(() => null),
```

And add the rehydration logic:

```typescript
if (plannerRes?.ok && plannerRes.data?.active) {
  set({ planner: { ...get().planner, active: true, projectSlug: plannerRes.data.projectSlug, messages: plannerRes.data.messages || [], discoveredItems: plannerRes.data.discoveredItems || [] } });
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/stores/appStore.ts frontend/stores/routerStore.ts
git commit -m "feat(planner): add planner state to appStore and routerStore"
```

---

### Task 5: Frontend — Socket.IO Wiring & ViewSwitcher

**Files:**
- Modify: `frontend/hooks/useSocket.ts`
- Modify: `frontend/components/ViewSwitcher.tsx`
- Modify: `frontend/components/RalphInputModal.tsx`

- [ ] **Step 1: Wire planner socket events in useSocket.ts**

Add after the escalation event listeners (around line 53):

```typescript
    // Planner events → appStore
    socket.on('planner:started' as any, (data: any) => app().onPlannerStarted(data));
    socket.on('planner:message' as any, (data: any) => app().onPlannerMessage(data));
    socket.on('planner:item-discovered' as any, (data: any) => app().onPlannerItemDiscovered(data));
    socket.on('planner:item-updated' as any, (data: any) => app().onPlannerItemUpdated(data));
    socket.on('planner:escalation' as any, (data: any) => app().onPlannerEscalation(data));
    socket.on('planner:item-approved' as any, (data: any) => app().onPlannerItemApproved(data));
    socket.on('planner:stopped' as any, () => app().onPlannerStopped());
```

- [ ] **Step 2: Add Planner tab to ViewSwitcher**

In `frontend/components/ViewSwitcher.tsx`, add the import:

```typescript
import { LayoutGrid, Terminal, Users, Eye, Cpu, Sparkles } from 'lucide-react';
```

Add to `PROJECT_TABS` array after the `soul` entry:

```typescript
  { key: 'planner',  label: 'Planner',  icon: <Sparkles size={15} />, shortcut: 'P' },
```

Add `'planner'` to the `useRunningTabs` hook:

```typescript
  const plannerActive = useAppStore((s) => s.planner.active);
  // ...
  if (plannerActive) running.add('planner');
```

- [ ] **Step 3: Ignore planner escalations in RalphInputModal**

In `frontend/components/RalphInputModal.tsx`, at the top where it reads the escalation from the store, add a guard:

```typescript
  const escalation = useAppStore((s) => s.escalation);
  // Don't show modal for planner escalations — they render inline in PlannerChat
  if (escalation?.source === 'planner') return null;
```

- [ ] **Step 4: Commit**

```bash
git add frontend/hooks/useSocket.ts frontend/components/ViewSwitcher.tsx frontend/components/RalphInputModal.tsx
git commit -m "feat(planner): wire socket events, add ViewSwitcher tab, filter escalation modal"
```

---

### Task 6: Frontend — PlannerView (Main Layout + Empty State)

**Files:**
- Create: `frontend/components/PlannerView.tsx`
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Create PlannerView with split layout and empty state**

Create `frontend/components/PlannerView.tsx`. This is the main view component with:
- Split layout: left panel (chat) + right panel (mini board)
- Empty state when planner is idle: large textarea for initial prompt
- Active state: renders PlannerChat (left) and PlannerBoard (right)
- Header with status and stop button

The component reads from `useAppStore((s) => s.planner)` for all state. The initial prompt submission posts to `POST /api/planner/start`. This file should follow the Obsidian Cockpit design: dark surfaces, accent glows, mono fonts for labels, spring animations.

**Key structure:**
```
PlannerView
├── idle state → centered prompt input (large textarea + start button)
└── active state → split layout
    ├── left: PlannerChat (Task 7) + PlannerInput (Task 7)
    └── right: PlannerBoard (Task 8)
```

- [ ] **Step 2: Add planner case to page.tsx**

In `frontend/app/page.tsx`, add the import:

```typescript
import { PlannerView } from '@/components/PlannerView';
```

Add a case in `renderProjectView()`:

```typescript
        case 'planner':
          return <PlannerView projectSlug={projectSlug} />;
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/PlannerView.tsx frontend/app/page.tsx
git commit -m "feat(planner): add PlannerView with split layout and empty state"
```

---

### Task 7: Frontend — PlannerChat & PlannerInput

**Files:**
- Create: `frontend/components/PlannerChat.tsx`
- Create: `frontend/components/PlannerInput.tsx`

- [ ] **Step 1: Create PlannerChat**

Scrollable message list that renders 4 message types:
- **User messages**: avatar with initial + text bubble, `bg-surface border-border`
- **Assistant messages**: Claude icon + text bubble, `bg-accent/[0.03] border-accent/10`
- **System messages**: centered, `text-xxs font-mono text-text-muted/40`
- **Escalation messages**: highlighted card with `border-accent/15 bg-accent/[0.04]`, pulse dot, option buttons. If `respondedWith` is set, show as static with selected option highlighted.

Auto-scrolls on new messages. Messages enter with `animate-fade-in-up`.

Reads from `useAppStore((s) => s.planner.messages)`.

For escalation messages that are still active (no `respondedWith`), the option buttons call the parent's `onRespond` handler.

- [ ] **Step 2: Create PlannerInput**

Input bar at the bottom of the chat panel. States:
- `idle` + no active session: hidden (empty state handles this in PlannerView)
- Active + no escalation: disabled with "Claude is working..." + breathe animation
- Active + escalation: enabled textarea + send button. Placeholder: "Respond to Claude's question..."
- Stopped: "Session ended" message

When user submits during an escalation: posts `POST /api/escalation/respond` with the escalation ID and response text, then calls `appStore.onPlannerEscalationResponded(response)`.

Option buttons in PlannerChat also call this same flow.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/PlannerChat.tsx frontend/components/PlannerInput.tsx
git commit -m "feat(planner): add PlannerChat and PlannerInput components"
```

---

### Task 8: Frontend — PlannerBoard & PlannerCard

**Files:**
- Create: `frontend/components/PlannerBoard.tsx`
- Create: `frontend/components/PlannerCard.tsx`

- [ ] **Step 1: Create PlannerCard**

Card component for a discovered item. Props: `item: PlannerDiscoveredItem`, `onApprove`, `onDiscard`, `onExpand`.

**Compact view:**
- Left accent bar (2px) colored by category (feature=#6366f1, bug=#ef4444, refactor=#f59e0b)
- Title text
- Category badge + task count (e.g. "feature · 4 tasks")
- Pulse dot when `status === 'planning'`
- "Approve" button when `status === 'ready'` — calls `POST /api/planner/approve`
- Checkmark + muted when `approvedAs` is set

**Expanded view (on click):**
- Plan content (rendered as markdown or preformatted text)
- Task list showing title, model, priority, tags per task
- "Approve" and "Discard" buttons

Uses `animate-card-in` on mount. Approve triggers `animate-spring-pop`.

- [ ] **Step 2: Create PlannerBoard**

Right panel with 3 columns + approved section.

Reads from `useAppStore((s) => s.planner.discoveredItems)`.

**Columns:**
- **Identified** — items with `status === 'identified'`, `approvedAs === null`
- **Planning** — items with `status === 'planning'`, `approvedAs === null`
- **Ready** — items with `status === 'ready'`, `approvedAs === null`

**Approved section** (below columns, separated by border):
- Items with `approvedAs !== null`
- Compact rows: checkmark + title + "View" link (navigates to work item via `goToWorkItem`)

Column headers: `text-[8px] font-mono uppercase tracking-wider`. Active column (Planning) gets accent color on header border.

Approve handler: `POST /api/planner/approve { itemId }` → on success, toast "Work item created".
Discard handler: `POST /api/planner/discard { itemId }` → removes from list.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/PlannerBoard.tsx frontend/components/PlannerCard.tsx
git commit -m "feat(planner): add PlannerBoard and PlannerCard components"
```

---

### Task 9: Integration — Wire PlannerView Children & WorkItemsBoard Navigation

**Files:**
- Modify: `frontend/components/PlannerView.tsx`
- Modify: `frontend/components/WorkItemsBoard.tsx`

- [ ] **Step 1: Wire PlannerChat, PlannerInput, and PlannerBoard into PlannerView**

Update `PlannerView.tsx` to import and render:
- Left panel: `<PlannerChat />` + `<PlannerInput />`
- Right panel: `<PlannerBoard projectSlug={projectSlug} />`
- Header: title "Planner" with Sparkles icon + stop button when active + status indicator

- [ ] **Step 2: Update WorkItemsBoard wizard button**

In `frontend/components/WorkItemsBoard.tsx`, find the "AI Wizard" button that opens `WizardModal`. Change it to navigate to the Planner view instead:

```typescript
// Replace: onClick={() => setShowWizard(true)}
// With: onClick={() => setView('planner')}
```

Import `useRouterStore` and get `setView` from it. Remove the WizardModal import and state if it's only used for the wizard.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/PlannerView.tsx frontend/components/WorkItemsBoard.tsx
git commit -m "feat(planner): wire all planner components and redirect wizard button to planner view"
```

---

### Task 10: Final Integration — Test & Polish

**Files:**
- Possibly modify: any file from Tasks 1-9 that needs fixes

- [ ] **Step 1: Start dev servers and verify planner tab appears**

```bash
npm run dev:server &
npm run dev:frontend
```

Navigate to a project → verify "Planner" tab appears in ViewSwitcher with Sparkles icon.

- [ ] **Step 2: Test empty state**

Click Planner tab → verify large textarea appears with "Describe what you want to build..." placeholder.

- [ ] **Step 3: Test planner start flow**

Type a prompt and submit → verify:
- User message appears in chat
- Claude starts processing (input disabled, "Claude is working..." shown)
- `planner:started` event received

- [ ] **Step 4: Test notification parsing**

Verify that as Claude sends `send_notification` with `item:discovered` payloads, cards appear in the mini-board's Identified column.

- [ ] **Step 5: Test escalation inline**

When Claude calls `escalate_to_human`, verify:
- Escalation appears as a chat message (not the global modal)
- Option buttons are clickable
- Input bar activates for free text response
- After responding, message becomes static with selected option highlighted

- [ ] **Step 6: Test approval flow**

When an item reaches Ready status, verify:
- "Approve" button appears on the card
- Clicking approve creates a real work item (check WorkItemsBoard)
- Card moves to Approved section
- Toast confirms creation

- [ ] **Step 7: Test navigation persistence**

While planner is running:
- Navigate to Work Items tab → verify planner tab shows green indicator
- Navigate back to Planner → verify conversation is preserved
- F5 → verify rehydration restores active state

- [ ] **Step 8: Test stop**

Click Stop → verify Claude process ends, session shows "Session ended", input shows restart option.

- [ ] **Step 9: Commit any fixes**

```bash
git add -p  # stage specific fixes only
git commit -m "fix(planner): integration fixes from end-to-end testing"
```
