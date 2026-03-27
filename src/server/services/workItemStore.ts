import fs from 'fs';
import path from 'path';
import { WorkItem, Task, TaskColumnName, TASK_COLUMNS } from '../../shared/types';
import {
  CreateWorkItemDto,
  UpdateWorkItemDto,
  CreateTaskDto,
  UpdateTaskDto,
  MoveTaskDto,
  WorkItemSchema,
} from '../lib/schemas';
import { generateId, slugify } from '../lib/generateId';
import { CATEGORIES } from '../../shared/types';

const DATA_DIR = path.resolve(process.env.KANBAII_DATA_DIR || path.join(process.cwd(), 'data', 'projects'));

function workItemsDir(projectSlug: string): string {
  return path.join(DATA_DIR, projectSlug, 'work-items');
}

function workItemFile(projectSlug: string, wiSlug: string): string {
  return path.join(workItemsDir(projectSlug), `${wiSlug}.json`);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function emptyColumns(): Record<TaskColumnName, Task[]> {
  return {
    'backlog': [],
    'todo': [],
    'in-progress': [],
    'review': [],
    'done': [],
  };
}

function readWorkItem(projectSlug: string, wiSlug: string): WorkItem | null {
  const file = workItemFile(projectSlug, wiSlug);
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return WorkItemSchema.parse(raw);
}

function writeWorkItem(projectSlug: string, wi: WorkItem): void {
  ensureDir(workItemsDir(projectSlug));
  const file = workItemFile(projectSlug, wi.slug);
  fs.writeFileSync(file, JSON.stringify(wi, null, 2), 'utf-8');
}

function findWorkItemByIdOrSlug(projectSlug: string, idOrSlug: string): WorkItem | null {
  // Try direct slug match first
  const bySlug = readWorkItem(projectSlug, idOrSlug);
  if (bySlug) return bySlug;

  // Scan for ID match
  const dir = workItemsDir(projectSlug);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const slug = file.replace('.json', '');
    const wi = readWorkItem(projectSlug, slug);
    if (wi && wi.id === idOrSlug) return wi;
  }
  return null;
}

// Helper to find task across all columns
function findTask(wi: WorkItem, taskId: string): { task: Task; column: TaskColumnName; index: number } | null {
  for (const col of TASK_COLUMNS) {
    const idx = wi.columns[col].findIndex(t => t.id === taskId);
    if (idx !== -1) return { task: wi.columns[col][idx], column: col, index: idx };
  }
  return null;
}

// --- Work Item CRUD ---

export function listWorkItems(projectSlug: string): WorkItem[] {
  const dir = workItemsDir(projectSlug);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const items: WorkItem[] = [];
  for (const file of files) {
    const slug = file.replace('.json', '');
    const wi = readWorkItem(projectSlug, slug);
    if (wi) items.push(wi);
  }
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getWorkItem(projectSlug: string, idOrSlug: string): WorkItem | null {
  return findWorkItemByIdOrSlug(projectSlug, idOrSlug);
}

export function createWorkItem(projectSlug: string, input: unknown): WorkItem {
  const dto = CreateWorkItemDto.parse(input);
  const prefix = CATEGORIES[dto.category].prefix;
  const slug = `${prefix}${slugify(dto.title)}`;

  // Ensure unique slug
  let finalSlug = slug;
  let counter = 1;
  while (fs.existsSync(workItemFile(projectSlug, finalSlug))) {
    finalSlug = `${slug}-${counter}`;
    counter++;
  }

  const now = new Date().toISOString();
  const wi: WorkItem = {
    id: generateId(dto.title, prefix),
    slug: finalSlug,
    title: dto.title,
    category: dto.category,
    status: 'planning',
    linkedWorkItem: dto.linkedWorkItem ?? null,
    plan: {
      prompt: dto.plan?.prompt,
      content: dto.plan?.content,
      status: dto.plan?.status ?? 'empty',
      generatedBy: dto.plan?.generatedBy,
      createdAt: now,
      updatedAt: now,
    },
    columns: emptyColumns(),
    createdAt: now,
    updatedAt: now,
  };

  writeWorkItem(projectSlug, wi);
  return wi;
}

export function updateWorkItem(projectSlug: string, idOrSlug: string, input: unknown): WorkItem {
  const existing = findWorkItemByIdOrSlug(projectSlug, idOrSlug);
  if (!existing) throw new Error(`Work item not found: ${idOrSlug}`);

  const dto = UpdateWorkItemDto.parse(input);
  const now = new Date().toISOString();

  const updated: WorkItem = {
    ...existing,
    ...(dto.title !== undefined && { title: dto.title }),
    ...(dto.status !== undefined && { status: dto.status }),
    ...(dto.linkedWorkItem !== undefined && { linkedWorkItem: dto.linkedWorkItem }),
    updatedAt: now,
  };

  // Merge plan updates
  if (dto.plan) {
    updated.plan = {
      ...existing.plan,
      ...dto.plan,
      updatedAt: now,
    };
  }

  writeWorkItem(projectSlug, updated);
  return updated;
}

export function deleteWorkItem(projectSlug: string, idOrSlug: string): void {
  const existing = findWorkItemByIdOrSlug(projectSlug, idOrSlug);
  if (!existing) throw new Error(`Work item not found: ${idOrSlug}`);
  const file = workItemFile(projectSlug, existing.slug);
  fs.unlinkSync(file);
}

// --- Task CRUD ---

export function createTask(projectSlug: string, wiIdOrSlug: string, input: unknown): { workItem: WorkItem; task: Task } {
  const wi = findWorkItemByIdOrSlug(projectSlug, wiIdOrSlug);
  if (!wi) throw new Error(`Work item not found: ${wiIdOrSlug}`);

  const dto = CreateTaskDto.parse(input);
  const now = new Date().toISOString();
  const task: Task = {
    id: generateId(dto.title),
    title: dto.title,
    description: dto.description ?? '',
    completed: false,
    model: dto.model ?? 'sonnet',
    priority: dto.priority,
    tags: dto.tags,
    agent: dto.agent ?? undefined,
    depends: dto.depends,
    createdAt: now,
  };

  const column = dto.column ?? 'backlog';
  wi.columns[column].push(task);
  wi.updatedAt = now;

  writeWorkItem(projectSlug, wi);
  return { workItem: wi, task };
}

export function updateTask(
  projectSlug: string,
  wiIdOrSlug: string,
  taskId: string,
  input: unknown
): { workItem: WorkItem; task: Task } {
  const wi = findWorkItemByIdOrSlug(projectSlug, wiIdOrSlug);
  if (!wi) throw new Error(`Work item not found: ${wiIdOrSlug}`);

  const found = findTask(wi, taskId);
  if (!found) throw new Error(`Task not found: ${taskId}`);

  const dto = UpdateTaskDto.parse(input);
  const now = new Date().toISOString();

  const updated: Task = {
    ...found.task,
    ...dto,
    updatedAt: now,
  };

  // Handle completed toggle
  if (dto.completed === true && !found.task.completed) {
    updated.completedAt = now;
  } else if (dto.completed === false) {
    updated.completedAt = undefined;
  }

  wi.columns[found.column][found.index] = updated;
  wi.updatedAt = now;

  writeWorkItem(projectSlug, wi);
  return { workItem: wi, task: updated };
}

export function moveTask(
  projectSlug: string,
  wiIdOrSlug: string,
  taskId: string,
  input: unknown
): WorkItem {
  const wi = findWorkItemByIdOrSlug(projectSlug, wiIdOrSlug);
  if (!wi) throw new Error(`Work item not found: ${wiIdOrSlug}`);

  const found = findTask(wi, taskId);
  if (!found) throw new Error(`Task not found: ${taskId}`);

  const dto = MoveTaskDto.parse(input);
  const now = new Date().toISOString();

  // Remove from source column
  wi.columns[found.column].splice(found.index, 1);

  // Update completed state based on target column
  const task = { ...found.task, updatedAt: now };
  if (dto.toColumn === 'done') {
    task.completed = true;
    task.completedAt = task.completedAt ?? now;
    task.previousColumn = found.column;  // Save where it came from
  } else if (found.column === 'done' && dto.toColumn !== 'done') {
    task.completed = false;
    task.completedAt = undefined;
    task.previousColumn = undefined;  // Clear after restoring
  }

  // Insert at target position
  const targetCol = wi.columns[dto.toColumn];
  const insertIdx = Math.min(dto.toIndex, targetCol.length);
  targetCol.splice(insertIdx, 0, task);

  wi.updatedAt = now;
  writeWorkItem(projectSlug, wi);
  return wi;
}

export function deleteTask(projectSlug: string, wiIdOrSlug: string, taskId: string): WorkItem {
  const wi = findWorkItemByIdOrSlug(projectSlug, wiIdOrSlug);
  if (!wi) throw new Error(`Work item not found: ${wiIdOrSlug}`);

  const found = findTask(wi, taskId);
  if (!found) throw new Error(`Task not found: ${taskId}`);

  wi.columns[found.column].splice(found.index, 1);
  wi.updatedAt = new Date().toISOString();

  writeWorkItem(projectSlug, wi);
  return wi;
}

// --- Utilities ---

export function getTaskCounts(wi: WorkItem): Record<TaskColumnName, number> {
  const counts = {} as Record<TaskColumnName, number>;
  for (const col of TASK_COLUMNS) {
    counts[col] = wi.columns[col].length;
  }
  return counts;
}

export function getProgress(wi: WorkItem): { completed: number; total: number; percent: number } {
  let total = 0;
  let completed = 0;
  for (const col of TASK_COLUMNS) {
    total += wi.columns[col].length;
    completed += wi.columns[col].filter(t => t.completed).length;
  }
  return { completed, total, percent: total === 0 ? 0 : Math.round((completed / total) * 100) };
}
