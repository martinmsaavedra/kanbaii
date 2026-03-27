# AI Planner — Design Spec

## Overview

Redesign the project-level wizard from a 5-step modal into a dedicated full-screen view with conversational AI brainstorming. Claude runs as a persistent process (like Ralph), discovers features from user input, asks clarifying questions via escalations rendered as inline chat bubbles, and generates work items with plans and tasks. Users approve each feature individually, creating real work items incrementally.

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Where it lives | Dedicated project-level view ("Planner" tab) | Full screen gives space for chat + live preview |
| Communication model | Free chat, but Claude guides the discovery | Natural conversation with structured intent extraction |
| Progress visualization | Mini-board: Identified → Planning → Ready | Consistent with KANBAII kanban identity |
| Persistence timing | Incremental approval per feature | Granular control; approved items are real immediately |
| Backend execution | Persistent Claude CLI process with MCP escalations | Reuses Ralph/escalation infra; Claude keeps full context |
| Session interruption | Persists in background | Same behavior as Ralph — navigate away and return |

---

## 1. Frontend Architecture

### 1.1 New View: PlannerView

**Location:** `frontend/components/PlannerView.tsx`

A new project-level view added to the ViewSwitcher alongside Work Items, Console, Teams, Soul.

**Layout:** Split screen, flex row.
- **Left panel (flex-1):** Conversation area — chat messages + input bar
- **Right panel (320px fixed):** Discovery mini-board + approved section

**State:** All planner state lives in `useAppStore` under `appStore.planner` (REGLA #1). No local component state for process data.

### 1.2 Left Panel — Conversation

**Components:**
- `PlannerChat.tsx` — scrollable message list
- `PlannerInput.tsx` — text input + send button at bottom

**Message types:**
1. **User message** — user avatar + text bubble (right-aligned or left with avatar)
2. **Claude message** — Claude avatar + text bubble with markdown rendering
3. **Escalation message** — highlighted card with question text + option buttons + free text input. This replaces the modal-based escalation for the planner context. Uses the same `escalate_to_human` MCP tool, but renders inline instead of as a modal.
4. **System message** — small centered text for events like "Feature identified: User Auth", "OAuth Integration moved to Ready"

**Escalation rendering:**
- When `appStore.planner.escalation` is set, the escalation renders as the last chat message (not a modal)
- Option buttons appear inline below the question
- User can click an option OR type a free response in the input bar
- Responding calls `POST /api/escalation/respond` (same endpoint as Ralph)
- After responding, the escalation message becomes static (options greyed out, selected one highlighted)

**Input bar:**
- Standard text input with send button
- Only active when planner is in `waiting_for_input` state (initial prompt) or when there's an active escalation
- Disabled with message "Claude is thinking..." when planner is processing
- Send fires: if no active escalation → starts the planner; if escalation active → responds to it

### 1.3 Right Panel — Discovery Board

**Component:** `PlannerBoard.tsx`

**Three columns:**
1. **Identified** — Claude found this feature but hasn't started planning it yet
2. **Planning** — Claude is actively working on plan + tasks for this feature (shows pulse indicator)
3. **Ready** — Plan + tasks complete, waiting for user approval

**Card anatomy:**
- Left accent bar colored by category (indigo=feature, red=bug, amber=refactor)
- Title (editable on click)
- Category badge + task count
- Pulse dot on the card currently being planned
- "Approve" button only on Ready cards

**Card expansion (click):**
- Expands card inline (or as a small overlay) to show:
  - Plan content (markdown, read-only)
  - Task list with title, model, priority, tags
  - Edit task titles, remove tasks, add tasks manually
  - Change category
  - "Approve" or "Discard" buttons

**Approved section:**
- Below the mini-board columns, separated by a border
- Shows approved items as compact rows: checkmark + title + "View on board" link
- Clicking navigates to the work item on the real board

### 1.4 ViewSwitcher Integration

Add `'planner'` to `ProjectView` type in `routerStore.ts`.

New tab in `PROJECT_TABS`:
```
{ key: 'planner', label: 'Planner', icon: <Sparkles size={15} />, shortcut: 'P' }
```

Running indicator: when `appStore.planner.active === true`, the Planner tab gets the same `animate-tab-process` treatment as Console/Teams/Ralph (emerald pulse + dot).

### 1.5 AppStore — Planner State

```typescript
interface PlannerDiscoveredItem {
  id: string;                    // temp ID, e.g. "disc-1"
  title: string;
  category: 'feature' | 'bug' | 'refactor';
  status: 'identified' | 'planning' | 'ready';
  plan: string | null;           // markdown plan content
  tasks: PlannerTask[];          // generated tasks
  approvedAs: string | null;     // work item slug after approval, null if not approved
}

interface PlannerTask {
  title: string;
  description: string;
  model: 'opus' | 'sonnet' | 'haiku';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  tags: string[];
}

interface PlannerMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'escalation';
  content: string;
  options?: string[];            // for escalation messages
  respondedWith?: string;        // after user responds to escalation
  timestamp: string;
}

interface PlannerState {
  active: boolean;
  projectSlug: string | null;
  messages: PlannerMessage[];
  discoveredItems: PlannerDiscoveredItem[];
  escalation: EscalationRequest | null;  // reuse existing type
  stats: {
    identified: number;
    planning: number;
    ready: number;
    approved: number;
  };
}
```

**Store actions:**
- `onPlannerStarted(data)` — set active, projectSlug
- `onPlannerMessage(data)` — append to messages
- `onPlannerItemDiscovered(data)` — add to discoveredItems as 'identified'
- `onPlannerItemUpdated(data)` — update item status/plan/tasks
- `onPlannerEscalation(data)` — set escalation (renders inline in chat)
- `onPlannerEscalationResponded()` — clear escalation, update message
- `onPlannerStopped()` — set active=false
- `approvePlannerItem(itemId)` — calls API, updates approvedAs
- `discardPlannerItem(itemId)` — removes from discoveredItems
- `updatePlannerItem(itemId, changes)` — edit title/tasks/plan locally

---

## 2. Backend Architecture

### 2.1 Planner Engine

**File:** `src/server/engines/planner.ts`

Similar to `ralph.ts` but with a different system prompt and output parsing.

**Lifecycle:**
1. `start(projectSlug, initialPrompt)` — validates project, acquires lock, spawns Claude CLI
2. Claude CLI runs with MCP (escalation + notification tools)
3. Claude's output is parsed for structured events (feature discovered, plan generated, tasks generated)
4. `stop()` — kills Claude process, cleans up

**System prompt for Claude:**

```
You are an AI Product Planner for the KANBAII project management system.

Your job is to have a conversation with the user to understand what they want to build, then decompose their request into discrete work items (features, bugs, or refactors), each with a plan and tasks.

## Your Process

1. UNDERSTAND — Read the user's initial prompt carefully. Identify all distinct features, bugs, or refactors they're describing.

2. DISCOVER — For each item you identify, use `send_notification` with a JSON payload `{"type":"item:discovered",...}` to register it. This makes it visible in the UI immediately.

3. CLARIFY — For each item, think about what you need to know to write a good plan. Use `escalate_to_human` to ask the user ONE question at a time. Focus on:
   - Technical decisions (JWT vs sessions, SQL vs NoSQL, etc.)
   - Scope boundaries (what's in, what's out)
   - Priority and dependencies between items
   - Integration requirements

4. PLAN — Once you have enough context for an item, generate a plan (markdown) and a task list. Use `send_notification` with a JSON payload `{"type":"item:updated",...}` to update the item with plan + tasks.

5. ITERATE — Move to the next item. The user may also add new items or modify existing ones during the conversation.

## Rules
- Ask ONE question at a time via escalate_to_human
- Always identify ALL features before deep-diving into any single one
- Generate 3-8 tasks per work item
- Tasks should be concrete and actionable
- Each task needs: title, description, model (sonnet default), priority, tags
- Use send_notification for status updates (e.g., "Moving to plan OAuth Integration")

## Output Format for Notifications
Use send_notification with structured JSON in the message field:

For discovered items:
{"type":"item:discovered","item":{"id":"disc-1","title":"User Auth","category":"feature"}}

For item updates (plan + tasks ready):
{"type":"item:updated","item":{"id":"disc-1","status":"planning|ready","plan":"...markdown...","tasks":[...]}}
```

**Claude output parsing:**
- The engine listens for `send_notification` tool calls from Claude
- Parses the JSON message to extract structured events
- Emits Socket.IO events: `planner:message`, `planner:item-discovered`, `planner:item-updated`, `planner:escalation`

**Process management:**
- Uses `claudeRunner.ts` like Ralph — spawns `claude -p` with MCP config
- Streams output via Socket.IO
- Escalations flow through the existing `escalationService`
- One planner process per project (mutex lock)

### 2.2 MCP Integration

Reuses the existing KANBAII MCP server (`src/server/mcp/kanbaii-mcp-server.js`).

Claude uses:
- `escalate_to_human` — for questions to the user (renders as inline chat escalation)
- `send_notification` — for structured events (item discovered, item updated, status messages)

No new MCP tools needed. The `send_notification` tool's message field carries structured JSON that the planner engine parses.

### 2.3 API Routes

**File:** `src/server/routes/planner.ts`

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/planner/start` | Start planner session `{ projectSlug, prompt }` |
| POST | `/api/planner/stop` | Stop planner process |
| GET | `/api/planner/state` | Get current planner state (for rehydration) |
| POST | `/api/planner/approve` | Approve a discovered item `{ itemId }` → creates real work item + tasks |
| POST | `/api/planner/discard` | Discard a discovered item `{ itemId }` |
| PATCH | `/api/planner/item` | Edit a discovered item `{ itemId, title?, tasks?, plan? }` |

**Approve flow (`POST /api/planner/approve`):**
1. Find item by `itemId` in planner state
2. Validate item status is 'ready'
3. Call `workItemStore.createWorkItem(projectSlug, { title, category, plan })` where plan maps to:
   ```typescript
   plan: {
     prompt: initialPrompt,          // the user's original planner prompt
     content: item.plan,             // markdown plan generated by Claude
     status: 'approved',
     generatedBy: 'claude',
   }
   ```
   This is the same `plan.content` field displayed in the TaskBoard "Plan" button and injected into Ralph's task prompts as context (ralph.ts:239).
4. For each task: `workItemStore.createTask(projectSlug, wiSlug, task)` with column='todo'
5. Update item's `approvedAs` to the created work item slug
6. Emit `planner:item-approved` Socket.IO event
7. Return created work item

### 2.4 Socket.IO Events

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `planner:started` | server→client | `{ projectSlug }` | Session started |
| `planner:message` | server→client | `{ role, content }` | Chat message (Claude or system) |
| `planner:item-discovered` | server→client | `PlannerDiscoveredItem` | New item found |
| `planner:item-updated` | server→client | `{ id, status, plan?, tasks? }` | Item progressed |
| `planner:escalation` | server→client | `EscalationRequest` | Question for user |
| `planner:item-approved` | server→client | `{ id, workItemSlug }` | Item approved and created |
| `planner:stopped` | server→client | `{ message }` | Session ended |
| `planner:output` | server→client | `{ message }` | Raw Claude output for debugging |

### 2.5 Planner State (Backend)

The planner engine maintains its own state object (similar to ralph's run state):

```typescript
interface PlannerSessionState {
  active: boolean;
  projectSlug: string;
  processId: string | null;      // Claude CLI process ID
  discoveredItems: PlannerDiscoveredItem[];
  messageHistory: PlannerMessage[];
  startedAt: string;
}
```

Exposed via `GET /api/planner/state` for rehydration on reconnection (F5 or navigate back to tab).

---

## 3. Escalation Flow (Planner-Specific)

The planner reuses the escalation infrastructure but with a different UI rendering:

1. Claude calls `escalate_to_human` → MCP server → `POST /api/escalation/create` with `source: 'planner'`
2. Backend emits `planner:escalation` (not generic `escalation:created`) so only the PlannerView listens
3. PlannerView renders the escalation as an inline chat message with option buttons
4. User clicks option or types response → `POST /api/escalation/respond`
5. Escalation clears, message becomes static with selected response highlighted
6. MCP server polling picks up response, Claude continues

**Key difference from Ralph:** No modal. The escalation IS a chat message. The PlannerView handles its own escalation rendering instead of using the global `RalphInputModal`.

To achieve this, the planner engine should emit `planner:escalation` instead of the generic `escalation:created` event. The `RalphInputModal` should ignore escalations with `source: 'planner'`.

---

## 4. UI/UX Details (Obsidian Cockpit)

### Chat messages
- User messages: subtle surface bg, left-aligned with avatar initial
- Claude messages: slight accent tint (`bg-accent/[0.03]`), accent border
- System messages: centered, `text-xxs font-mono text-text-muted/40`
- Escalation messages: highlighted card with `border-accent/15 bg-accent/[0.04]`, pulse dot, option buttons with hover glow

### Mini-board cards
- Compact height, dense information
- Left accent bar by category color (2px solid)
- Pulse animation on card being actively planned
- "Approve" button: `bg-success/10 border-success/20 text-success` → hover glow
- Approved cards: muted with checkmark, link to real board

### Animations
- Messages appear with `animate-fade-in-up` (staggered 60ms)
- Cards enter mini-board with `animate-card-in`
- Card column transitions with spring physics
- Approve action: card shrinks + moves down to approved section with `animate-spring-pop`
- Tab indicator uses existing `animate-tab-process` when active

### Empty state
- When planner is idle: centered prompt with large text area, "Describe what you want to build..." placeholder
- Animated diamond icon + subtle call to action
- No mini-board visible until first item is discovered

### Input states
- `idle`: Large prompt textarea centered (empty state)
- `waiting_for_escalation`: Input bar active, placeholder "Respond to Claude's question..."
- `processing`: Input bar disabled, "Claude is thinking..." with breathe animation
- `stopped`: Input bar shows "Session ended. Start a new one?" with restart button

---

## 5. Files to Create/Modify

### New files:
| File | Purpose |
|------|---------|
| `src/server/engines/planner.ts` | Planner engine (spawn Claude, parse output, manage state) |
| `src/server/routes/planner.ts` | API routes for planner |
| `frontend/components/PlannerView.tsx` | Main split-screen view |
| `frontend/components/PlannerChat.tsx` | Chat message list |
| `frontend/components/PlannerInput.tsx` | Text input bar |
| `frontend/components/PlannerBoard.tsx` | Mini discovery board |
| `frontend/components/PlannerCard.tsx` | Card component with expand/approve |

### Modified files:
| File | Change |
|------|--------|
| `frontend/stores/routerStore.ts` | Add `'planner'` to `ProjectView` type |
| `frontend/stores/appStore.ts` | Add `PlannerState` + all planner actions |
| `frontend/components/ViewSwitcher.tsx` | Add Planner tab + running indicator |
| `frontend/hooks/useSocket.ts` | Listen to `planner:*` events |
| `frontend/app/page.tsx` | Add `case 'planner'` to project view switch |
| `src/server/index.ts` | Mount planner routes, initialize engine |
| `src/server/services/escalationService.ts` | Support `source: 'planner'` |
| `frontend/components/RalphInputModal.tsx` | Ignore escalations with `source: 'planner'` |

### Removed/Replaced:
- `frontend/components/WizardModal.tsx` — replaced by PlannerView. The old wizard modal is removed. The "AI Wizard" button in WorkItemsBoard navigates to the Planner tab instead of opening a modal.
- Quick create (`CreateWorkItemModal.tsx`) stays as-is for simple manual creation.

---

## 6. Migration

- The existing `WizardModal` will be replaced, not gradually migrated
- The "AI Wizard" button in `WorkItemsBoard` will navigate to the Planner view (`setView('planner')`) instead of opening the wizard modal
- The existing `/api/generate/plan` and `/api/generate/tasks` endpoints can be deprecated but left in place for backwards compatibility
- Quick create modal (`CreateWorkItemModal`) remains unchanged for simple single-item creation without AI
