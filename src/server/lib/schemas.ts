import { z } from 'zod';

// --- Enums ---

export const WorkItemCategorySchema = z.enum(['feature', 'bug', 'refactor']);
export const WorkItemStatusSchema = z.enum(['planning', 'active', 'review', 'done']);
export const TaskColumnSchema = z.enum(['backlog', 'todo', 'in-progress', 'review', 'done']);
export const PrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);
export const ClaudeModelSchema = z.enum(['opus', 'sonnet', 'haiku']);
export const ProjectStatusSchema = z.enum(['active', 'archived', 'deleted']);

// --- Plan ---

export const PlanSchema = z.object({
  prompt: z.string().max(50000).optional(),
  content: z.string().max(100000).optional(),
  status: z.enum(['empty', 'draft', 'approved']),
  generatedBy: z.enum(['claude', 'manual']).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// --- Task ---

export const TaskSummarySchema = z.object({
  status: z.string(),
  changes: z.array(z.string()).optional(),
  tests: z.string().optional(),
  notes: z.string().optional(),
  filesCount: z.number().optional(),
});

export const TaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(5000),
  completed: z.boolean(),
  model: ClaudeModelSchema,
  priority: PrioritySchema.optional(),
  tags: z.array(z.string()).optional(),
  agent: z.string().nullable().optional(),
  depends: z.array(z.string()).optional(),
  due: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  completedAt: z.string().optional(),
  previousColumn: z.string().optional(),
  output: z.string().max(100000).optional(),
  summary: TaskSummarySchema.optional(),
});

// --- Work Item ---

export const ColumnsSchema = z.object({
  'backlog': z.array(TaskSchema),
  'todo': z.array(TaskSchema),
  'in-progress': z.array(TaskSchema),
  'review': z.array(TaskSchema),
  'done': z.array(TaskSchema),
});

export const WorkItemSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1).max(200),
  category: WorkItemCategorySchema,
  status: WorkItemStatusSchema,
  linkedWorkItem: z.string().nullable().optional(),
  plan: PlanSchema,
  columns: ColumnsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

// --- Project ---

export const ProjectSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color'),
  workingDir: z.string().optional(),
  status: ProjectStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

// --- Create/Update DTOs ---

export const CreateProjectDto = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
  workingDir: z.string().optional(),
});

export const UpdateProjectDto = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  workingDir: z.string().optional(),
  status: ProjectStatusSchema.optional(),
});

export const CreateWorkItemDto = z.object({
  title: z.string().min(1).max(200),
  category: WorkItemCategorySchema,
  linkedWorkItem: z.string().nullable().optional(),
  plan: z.object({
    prompt: z.string().optional(),
    content: z.string().optional(),
    status: z.enum(['empty', 'draft', 'approved']).default('empty'),
    generatedBy: z.enum(['claude', 'manual']).optional(),
  }).optional(),
});

export const UpdateWorkItemDto = z.object({
  title: z.string().min(1).max(200).optional(),
  status: WorkItemStatusSchema.optional(),
  linkedWorkItem: z.string().nullable().optional(),
  plan: PlanSchema.partial().optional(),
});

export const CreateTaskDto = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  model: ClaudeModelSchema.default('sonnet'),
  priority: PrioritySchema.optional(),
  tags: z.array(z.string()).optional(),
  agent: z.string().nullable().optional(),
  depends: z.array(z.string()).optional(),
  column: TaskColumnSchema.default('backlog'),
});

export const UpdateTaskDto = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  completed: z.boolean().optional(),
  model: ClaudeModelSchema.optional(),
  priority: PrioritySchema.optional(),
  tags: z.array(z.string()).optional(),
  agent: z.string().nullable().optional(),
  depends: z.array(z.string()).optional(),
  due: z.string().optional(),
  output: z.string().max(100000).optional(),
  summary: TaskSummarySchema.optional(),
});

export const MoveTaskDto = z.object({
  toColumn: TaskColumnSchema,
  toIndex: z.number().int().min(0),
});
