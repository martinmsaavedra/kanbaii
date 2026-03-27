// ============================================================
// KANBAII — Shared Types (Backend + Frontend)
// ============================================================

// --- Categories (hardcoded) ---

export type WorkItemCategory = 'feature' | 'bug' | 'refactor';

export const CATEGORIES: Record<WorkItemCategory, { color: string; icon: string; prefix: string; label: string }> = {
  feature: { color: '#6366f1', icon: '✦', prefix: 'feat-', label: 'Feature' },
  bug:     { color: '#ef4444', icon: '●', prefix: 'bug-',  label: 'Bug' },
  refactor:{ color: '#f59e0b', icon: '◆', prefix: 'ref-',  label: 'Refactor' },
};

// --- Work Item Status (kanban columns) ---

export type WorkItemStatus = 'planning' | 'active' | 'review' | 'done';

export const WORK_ITEM_COLUMNS: WorkItemStatus[] = ['planning', 'active', 'review', 'done'];

// --- Task Columns ---

export type TaskColumnName = 'backlog' | 'todo' | 'in-progress' | 'review' | 'done';

export const TASK_COLUMNS: TaskColumnName[] = ['backlog', 'todo', 'in-progress', 'review', 'done'];

export const TASK_COLUMN_LABELS: Record<TaskColumnName, string> = {
  'backlog': 'Backlog',
  'todo': 'To Do',
  'in-progress': 'In Progress',
  'review': 'Review',
  'done': 'Done',
};

// --- Priority ---

export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export const PRIORITY_ORDER: Record<Priority, number> = {
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

// --- Model ---

export type ClaudeModel = 'opus' | 'sonnet' | 'haiku';

// --- Core Entities ---

export interface Project {
  id: string;
  slug: string;
  title: string;
  description?: string;
  color: string;
  workingDir?: string;  // Filesystem path where the project code lives
  status: 'active' | 'archived' | 'deleted';
  createdAt: string;
  updatedAt: string;
}

export interface WorkItem {
  id: string;
  slug: string;
  title: string;
  category: WorkItemCategory;
  status: WorkItemStatus;
  linkedWorkItem?: string | null;   // ID of related work item (for bugs/refactors)
  plan: Plan;
  columns: Record<TaskColumnName, Task[]>;
  createdAt: string;
  updatedAt: string;
}

export interface Plan {
  prompt?: string;                   // Original user prompt
  content?: string;                  // Plan text (markdown)
  status: 'empty' | 'draft' | 'approved';
  generatedBy?: 'claude' | 'manual';
  createdAt?: string;
  updatedAt?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  model: ClaudeModel;
  priority?: Priority;
  tags?: string[];
  agent?: string | null;
  depends?: string[];
  due?: string;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
  previousColumn?: string;  // Column before moving to done — used to restore on uncheck
  output?: string;
  summary?: TaskSummary;
}

export interface TaskSummary {
  status: string;
  changes?: string[];
  tests?: string;
  notes?: string;
  filesCount?: number;
}

// --- Socket Events ---

export interface ServerToClientEvents {
  'project:updated': (data: { project: Project }) => void;
  'project:deleted': (data: { slug: string }) => void;
  'workItem:updated': (data: { projectSlug: string; workItem: WorkItem }) => void;
  'workItem:deleted': (data: { projectSlug: string; workItemId: string }) => void;
  'task:moved': (data: { projectSlug: string; workItemId: string; taskId: string; toColumn: TaskColumnName; toIndex: number }) => void;
  'ralph:started': (data: { projectSlug: string; workItemId: string; total: number; taskIds: string[] }) => void;
  'ralph:progress': (data: { current: number; total: number; currentTask: { id: string; title: string } | null }) => void;
  'ralph:output': (data: { taskId: string; message: string }) => void;
  'ralph:completed': (data: { stats: any; message: string }) => void;
  'ralph:error': (data: { taskId?: string; message?: string }) => void;
  'live:started': (data: { projectSlug: string; workItemSlugs: string[]; maxWorkers: number }) => void;
  'live:worker-assigned': (data: { workerId: string; taskId: string; taskTitle: string; agentName: string | null; workItemSlug: string }) => void;
  'live:worker-completed': (data: { workerId: string; taskId: string; status: 'completed' | 'failed' }) => void;
  'live:metrics': (data: { activeWorkers: number; totalCompleted: number; totalFailed: number; totalTasks: number }) => void;
  'live:output': (data: { workerId: string; taskId: string; message: string }) => void;
  'live:stopped': (data: { message: string }) => void;
  'planner:started': (data: { projectSlug: string }) => void;
  'planner:message': (data: { id: string; role: 'user' | 'assistant' | 'system' | 'escalation'; content: string }) => void;
  'planner:item-discovered': (data: { id: string; title: string; category: WorkItemCategory }) => void;
  'planner:item-updated': (data: { id: string; status: 'identified' | 'planning' | 'ready'; plan?: string; tasks?: Array<{ title: string; description: string; model: string; priority: string; tags: string[] }> }) => void;
  'planner:escalation': (data: { id: string; source: 'planner'; taskId: string; taskTitle: string; question: string; options: string[]; timeoutMs: number }) => void;
  'planner:item-approved': (data: { id: string; workItemSlug: string }) => void;
  'planner:stopped': (data: { message: string }) => void;
  'planner:output': (data: { message: string }) => void;
  'coordinator:started': (data: { projectSlug: string; total: number; parallelGroups: string[][] }) => void;
  'coordinator:progress': (data: { status: string; current: number; total: number; currentParallelTaskIds: string[]; stats: any; failedTasks: any[] }) => void;
  'coordinator:task-assigned': (data: { taskId: string; taskTitle: string; agentName: string; model: string; groupIndex: number }) => void;
  'coordinator:task-completed': (data: { taskId: string; taskTitle: string; status: string; exitCode?: number; retriesUsed?: number }) => void;
  'coordinator:task-blocked': (data: { taskId: string; taskTitle: string; blockedBy: string[] }) => void;
  'coordinator:retry': (data: { taskId: string; taskTitle: string; attempt: number; model: string }) => void;
  'coordinator:group-started': (data: { groupIndex: number; totalGroups: number; taskIds: string[]; parallel: boolean }) => void;
  'coordinator:completed': (data: { stats: any; message: string; interrupted?: boolean; failedTasks?: any[] }) => void;
  'coordinator:error': (data: { message: string }) => void;
  'coordinator:paused': (data: { current: number; total: number }) => void;
  'coordinator:thinking': (data: { text: string }) => void;
  'coordinator:tool_call': (data: { tool: string; input: any }) => void;
}

export interface ClientToServerEvents {
  'task:move': (data: { projectSlug: string; workItemId: string; taskId: string; toColumn: TaskColumnName; toIndex: number }) => void;
}

// --- API Response Wrappers ---

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
