import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as projectStore from '../services/projectStore';

const TEST_DATA_DIR = process.env.KANBAII_DATA_DIR!;

function cleanup() {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

describe('ProjectStore', () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  describe('createProject', () => {
    it('creates a project with correct structure', () => {
      const project = projectStore.createProject({ title: 'Test Project' });

      expect(project.title).toBe('Test Project');
      expect(project.slug).toBe('test-project');
      expect(project.color).toBe('#6366f1');
      expect(project.status).toBe('active');
      expect(project.id).toMatch(/^test-project-[a-f0-9]{4}$/);
      expect(project.createdAt).toBeTruthy();
      expect(project.updatedAt).toBeTruthy();

      // Verify file exists
      const file = path.join(TEST_DATA_DIR, 'test-project', 'project.json');
      expect(fs.existsSync(file)).toBe(true);

      // Verify work-items dir created
      const wiDir = path.join(TEST_DATA_DIR, 'test-project', 'work-items');
      expect(fs.existsSync(wiDir)).toBe(true);
    });

    it('creates project with custom color', () => {
      const project = projectStore.createProject({ title: 'Red Project', color: '#ef4444' });
      expect(project.color).toBe('#ef4444');
    });

    it('handles slug collisions', () => {
      const p1 = projectStore.createProject({ title: 'My Project' });
      const p2 = projectStore.createProject({ title: 'My Project' });

      expect(p1.slug).toBe('my-project');
      expect(p2.slug).toBe('my-project-1');
    });

    it('rejects invalid input', () => {
      expect(() => projectStore.createProject({ title: '' })).toThrow();
      expect(() => projectStore.createProject({ title: 'X', color: 'not-hex' })).toThrow();
      expect(() => projectStore.createProject({})).toThrow();
    });
  });

  describe('getProject', () => {
    it('returns project by slug', () => {
      projectStore.createProject({ title: 'Findable' });
      const found = projectStore.getProject('findable');

      expect(found).not.toBeNull();
      expect(found!.title).toBe('Findable');
    });

    it('returns null for non-existent slug', () => {
      expect(projectStore.getProject('does-not-exist')).toBeNull();
    });
  });

  describe('listProjects', () => {
    it('returns empty array when no projects', () => {
      expect(projectStore.listProjects()).toEqual([]);
    });

    it('returns all active projects', () => {
      projectStore.createProject({ title: 'Alpha' });
      projectStore.createProject({ title: 'Beta' });
      projectStore.createProject({ title: 'Gamma' });

      const list = projectStore.listProjects();
      expect(list).toHaveLength(3);
      const titles = list.map((p) => p.title);
      expect(titles).toContain('Alpha');
      expect(titles).toContain('Beta');
      expect(titles).toContain('Gamma');
    });

    it('includes deleted projects (frontend filters by status)', () => {
      projectStore.createProject({ title: 'Active' });
      projectStore.createProject({ title: 'To Delete' });
      projectStore.deleteProject('to-delete');

      const list = projectStore.listProjects();
      expect(list).toHaveLength(2);
      const deleted = list.find(p => p.title === 'To Delete');
      expect(deleted?.status).toBe('deleted');
      const active = list.find(p => p.title === 'Active');
      expect(active?.status).toBe('active');
    });
  });

  describe('updateProject', () => {
    it('updates title and description', () => {
      projectStore.createProject({ title: 'Original' });
      const updated = projectStore.updateProject('original', {
        title: 'Updated',
        description: 'New desc',
      });

      expect(updated.title).toBe('Updated');
      expect(updated.description).toBe('New desc');
      // updatedAt should be >= createdAt (may be same ms)
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(updated.createdAt).getTime());
    });

    it('throws for non-existent project', () => {
      expect(() => projectStore.updateProject('nope', { title: 'X' })).toThrow('not found');
    });
  });

  describe('deleteProject', () => {
    it('soft-deletes project', () => {
      projectStore.createProject({ title: 'Will Die' });
      projectStore.deleteProject('will-die');

      // File still exists (soft delete)
      const file = path.join(TEST_DATA_DIR, 'will-die', 'project.json');
      expect(fs.existsSync(file)).toBe(true);

      // But status is deleted
      const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
      expect(raw.status).toBe('deleted');
    });

    it('throws for non-existent project', () => {
      expect(() => projectStore.deleteProject('nope')).toThrow('not found');
    });
  });
});
