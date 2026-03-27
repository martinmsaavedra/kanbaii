import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as projectStore from '../services/projectStore';
import * as workItemStore from '../services/workItemStore';

const TEST_DATA_DIR = process.env.KANBAII_DATA_DIR!;

function cleanup() {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

describe('WorkItemStore', () => {
  beforeEach(() => {
    cleanup();
    projectStore.createProject({ title: 'Test Project' });
  });
  afterEach(() => cleanup());

  const PROJECT = 'test-project';

  describe('createWorkItem', () => {
    it('creates a feature work item', () => {
      const wi = workItemStore.createWorkItem(PROJECT, {
        title: 'Auth System',
        category: 'feature',
      });

      expect(wi.title).toBe('Auth System');
      expect(wi.category).toBe('feature');
      expect(wi.slug).toBe('feat-auth-system');
      expect(wi.id).toMatch(/^feat-auth-system-[a-f0-9]{4}$/);
      expect(wi.status).toBe('planning');
      expect(wi.plan.status).toBe('empty');
      expect(wi.columns.backlog).toEqual([]);
      expect(wi.columns.todo).toEqual([]);
    });

    it('creates a bug with prefix', () => {
      const wi = workItemStore.createWorkItem(PROJECT, {
        title: 'Login Crash',
        category: 'bug',
      });
      expect(wi.slug).toBe('bug-login-crash');
    });

    it('creates a refactor with prefix', () => {
      const wi = workItemStore.createWorkItem(PROJECT, {
        title: 'Clean API',
        category: 'refactor',
      });
      expect(wi.slug).toBe('ref-clean-api');
    });

    it('creates with linked work item', () => {
      const feature = workItemStore.createWorkItem(PROJECT, {
        title: 'Auth',
        category: 'feature',
      });
      const bug = workItemStore.createWorkItem(PROJECT, {
        title: 'Auth Bug',
        category: 'bug',
        linkedWorkItem: feature.id,
      });
      expect(bug.linkedWorkItem).toBe(feature.id);
    });

    it('creates with initial plan', () => {
      const wi = workItemStore.createWorkItem(PROJECT, {
        title: 'Planned Feature',
        category: 'feature',
        plan: {
          prompt: 'Build a thing',
          content: '## Plan\n\nDo stuff',
          status: 'draft',
          generatedBy: 'claude',
        },
      });
      expect(wi.plan.status).toBe('draft');
      expect(wi.plan.prompt).toBe('Build a thing');
      expect(wi.plan.generatedBy).toBe('claude');
    });

    it('handles slug collisions', () => {
      const w1 = workItemStore.createWorkItem(PROJECT, { title: 'Dup', category: 'feature' });
      const w2 = workItemStore.createWorkItem(PROJECT, { title: 'Dup', category: 'feature' });

      expect(w1.slug).toBe('feat-dup');
      expect(w2.slug).toBe('feat-dup-1');
    });

    it('rejects invalid input', () => {
      expect(() => workItemStore.createWorkItem(PROJECT, { title: '', category: 'feature' })).toThrow();
      expect(() => workItemStore.createWorkItem(PROJECT, { title: 'X', category: 'invalid' as any })).toThrow();
    });
  });

  describe('listWorkItems', () => {
    it('returns empty array when no work items', () => {
      expect(workItemStore.listWorkItems(PROJECT)).toEqual([]);
    });

    it('returns all work items', () => {
      workItemStore.createWorkItem(PROJECT, { title: 'A', category: 'feature' });
      workItemStore.createWorkItem(PROJECT, { title: 'B', category: 'bug' });

      const list = workItemStore.listWorkItems(PROJECT);
      expect(list).toHaveLength(2);
    });
  });

  describe('getWorkItem', () => {
    it('finds by slug', () => {
      workItemStore.createWorkItem(PROJECT, { title: 'By Slug', category: 'feature' });
      const found = workItemStore.getWorkItem(PROJECT, 'feat-by-slug');
      expect(found).not.toBeNull();
      expect(found!.title).toBe('By Slug');
    });

    it('finds by id', () => {
      const wi = workItemStore.createWorkItem(PROJECT, { title: 'By Id', category: 'feature' });
      const found = workItemStore.getWorkItem(PROJECT, wi.id);
      expect(found).not.toBeNull();
      expect(found!.title).toBe('By Id');
    });

    it('returns null for non-existent', () => {
      expect(workItemStore.getWorkItem(PROJECT, 'nope')).toBeNull();
    });
  });

  describe('updateWorkItem', () => {
    it('updates status and title', () => {
      const wi = workItemStore.createWorkItem(PROJECT, { title: 'Original', category: 'feature' });
      const updated = workItemStore.updateWorkItem(PROJECT, wi.slug, {
        title: 'Updated',
        status: 'active',
      });

      expect(updated.title).toBe('Updated');
      expect(updated.status).toBe('active');
    });

    it('updates plan', () => {
      const wi = workItemStore.createWorkItem(PROJECT, { title: 'With Plan', category: 'feature' });
      const updated = workItemStore.updateWorkItem(PROJECT, wi.slug, {
        plan: { content: '## New Plan', status: 'approved' },
      });

      expect(updated.plan.content).toBe('## New Plan');
      expect(updated.plan.status).toBe('approved');
    });
  });

  describe('deleteWorkItem', () => {
    it('removes work item file', () => {
      const wi = workItemStore.createWorkItem(PROJECT, { title: 'Delete Me', category: 'feature' });
      workItemStore.deleteWorkItem(PROJECT, wi.slug);

      expect(workItemStore.getWorkItem(PROJECT, wi.slug)).toBeNull();
    });

    it('throws for non-existent', () => {
      expect(() => workItemStore.deleteWorkItem(PROJECT, 'nope')).toThrow('not found');
    });
  });

  // --- Task Operations ---

  describe('createTask', () => {
    it('creates a task in backlog by default', () => {
      const wi = workItemStore.createWorkItem(PROJECT, { title: 'Feature', category: 'feature' });
      const { task, workItem } = workItemStore.createTask(PROJECT, wi.slug, {
        title: 'Research libs',
      });

      expect(task.title).toBe('Research libs');
      expect(task.model).toBe('sonnet');
      expect(task.completed).toBe(false);
      expect(workItem.columns.backlog).toHaveLength(1);
      expect(workItem.columns.backlog[0].id).toBe(task.id);
    });

    it('creates task in specific column', () => {
      const wi = workItemStore.createWorkItem(PROJECT, { title: 'Feature', category: 'feature' });
      const { workItem } = workItemStore.createTask(PROJECT, wi.slug, {
        title: 'Urgent fix',
        column: 'todo',
        priority: 'high',
        model: 'opus',
      });

      expect(workItem.columns.todo).toHaveLength(1);
      expect(workItem.columns.todo[0].priority).toBe('high');
      expect(workItem.columns.todo[0].model).toBe('opus');
    });

    it('creates task with tags and depends', () => {
      const wi = workItemStore.createWorkItem(PROJECT, { title: 'Feature', category: 'feature' });
      const { task } = workItemStore.createTask(PROJECT, wi.slug, {
        title: 'Task with meta',
        tags: ['backend', 'api'],
        depends: ['some-task-id'],
      });

      expect(task.tags).toEqual(['backend', 'api']);
      expect(task.depends).toEqual(['some-task-id']);
    });
  });

  describe('updateTask', () => {
    it('updates task fields', () => {
      const wi = workItemStore.createWorkItem(PROJECT, { title: 'Feature', category: 'feature' });
      const { task } = workItemStore.createTask(PROJECT, wi.slug, { title: 'Task 1' });

      const { task: updated } = workItemStore.updateTask(PROJECT, wi.slug, task.id, {
        title: 'Task 1 Updated',
        priority: 'urgent',
      });

      expect(updated.title).toBe('Task 1 Updated');
      expect(updated.priority).toBe('urgent');
      expect(updated.updatedAt).toBeTruthy();
    });

    it('sets completedAt when marking completed', () => {
      const wi = workItemStore.createWorkItem(PROJECT, { title: 'Feature', category: 'feature' });
      const { task } = workItemStore.createTask(PROJECT, wi.slug, { title: 'Task' });

      const { task: completed } = workItemStore.updateTask(PROJECT, wi.slug, task.id, {
        completed: true,
      });

      expect(completed.completed).toBe(true);
      expect(completed.completedAt).toBeTruthy();
    });

    it('clears completedAt when uncompleting', () => {
      const wi = workItemStore.createWorkItem(PROJECT, { title: 'Feature', category: 'feature' });
      const { task } = workItemStore.createTask(PROJECT, wi.slug, { title: 'Task' });
      workItemStore.updateTask(PROJECT, wi.slug, task.id, { completed: true });

      const { task: uncompleted } = workItemStore.updateTask(PROJECT, wi.slug, task.id, {
        completed: false,
      });

      expect(uncompleted.completed).toBe(false);
      expect(uncompleted.completedAt).toBeUndefined();
    });
  });

  describe('moveTask', () => {
    it('moves task between columns', () => {
      const wi = workItemStore.createWorkItem(PROJECT, { title: 'Feature', category: 'feature' });
      const { task } = workItemStore.createTask(PROJECT, wi.slug, { title: 'Movable' });

      const updated = workItemStore.moveTask(PROJECT, wi.slug, task.id, {
        toColumn: 'todo',
        toIndex: 0,
      });

      expect(updated.columns.backlog).toHaveLength(0);
      expect(updated.columns.todo).toHaveLength(1);
      expect(updated.columns.todo[0].id).toBe(task.id);
    });

    it('auto-completes task when moved to done', () => {
      const wi = workItemStore.createWorkItem(PROJECT, { title: 'Feature', category: 'feature' });
      const { task } = workItemStore.createTask(PROJECT, wi.slug, { title: 'Will complete' });

      const updated = workItemStore.moveTask(PROJECT, wi.slug, task.id, {
        toColumn: 'done',
        toIndex: 0,
      });

      expect(updated.columns.done[0].completed).toBe(true);
      expect(updated.columns.done[0].completedAt).toBeTruthy();
    });

    it('uncompletes task when moved out of done', () => {
      const wi = workItemStore.createWorkItem(PROJECT, { title: 'Feature', category: 'feature' });
      const { task } = workItemStore.createTask(PROJECT, wi.slug, { title: 'Back and forth' });

      workItemStore.moveTask(PROJECT, wi.slug, task.id, { toColumn: 'done', toIndex: 0 });
      const updated = workItemStore.moveTask(PROJECT, wi.slug, task.id, { toColumn: 'review', toIndex: 0 });

      expect(updated.columns.review[0].completed).toBe(false);
      expect(updated.columns.review[0].completedAt).toBeUndefined();
    });

    it('handles index clamping', () => {
      const wi = workItemStore.createWorkItem(PROJECT, { title: 'Feature', category: 'feature' });
      const { task } = workItemStore.createTask(PROJECT, wi.slug, { title: 'Task' });

      // toIndex=999 should clamp to end of column
      const updated = workItemStore.moveTask(PROJECT, wi.slug, task.id, {
        toColumn: 'todo',
        toIndex: 999,
      });
      expect(updated.columns.todo).toHaveLength(1);
    });
  });

  describe('deleteTask', () => {
    it('removes task from column', () => {
      const wi = workItemStore.createWorkItem(PROJECT, { title: 'Feature', category: 'feature' });
      const { task } = workItemStore.createTask(PROJECT, wi.slug, { title: 'To Delete' });

      const updated = workItemStore.deleteTask(PROJECT, wi.slug, task.id);
      expect(updated.columns.backlog).toHaveLength(0);
    });

    it('throws for non-existent task', () => {
      const wi = workItemStore.createWorkItem(PROJECT, { title: 'Feature', category: 'feature' });
      expect(() => workItemStore.deleteTask(PROJECT, wi.slug, 'fake-id')).toThrow('not found');
    });
  });

  describe('getProgress', () => {
    it('calculates progress correctly', () => {
      const wi = workItemStore.createWorkItem(PROJECT, { title: 'Feature', category: 'feature' });
      workItemStore.createTask(PROJECT, wi.slug, { title: 'T1' });
      workItemStore.createTask(PROJECT, wi.slug, { title: 'T2' });
      const { task: t3 } = workItemStore.createTask(PROJECT, wi.slug, { title: 'T3' });

      // Complete one task
      workItemStore.moveTask(PROJECT, wi.slug, t3.id, { toColumn: 'done', toIndex: 0 });

      const latest = workItemStore.getWorkItem(PROJECT, wi.slug)!;
      const progress = workItemStore.getProgress(latest);

      expect(progress.total).toBe(3);
      expect(progress.completed).toBe(1);
      expect(progress.percent).toBe(33);
    });

    it('returns 0% for empty work item', () => {
      const wi = workItemStore.createWorkItem(PROJECT, { title: 'Empty', category: 'feature' });
      const progress = workItemStore.getProgress(wi);
      expect(progress).toEqual({ completed: 0, total: 0, percent: 0 });
    });
  });
});
