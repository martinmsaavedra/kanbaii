import fs from 'fs';
import path from 'path';
import { Project } from '../../shared/types';
import { CreateProjectDto, UpdateProjectDto, ProjectSchema } from '../lib/schemas';
import { generateId, projectSlug } from '../lib/generateId';
import { safePath } from '../lib/safePath';

const DATA_DIR = path.resolve(process.env.KANBAII_DATA_DIR || path.join(process.cwd(), 'data', 'projects'));

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function projectDir(slug: string): string {
  return safePath(DATA_DIR, slug);
}

function projectFile(slug: string): string {
  return path.join(projectDir(slug), 'project.json');
}

function readProject(slug: string): Project | null {
  const file = projectFile(slug);
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return ProjectSchema.parse(raw);
}

function writeProject(project: Project): void {
  const dir = projectDir(project.slug);
  ensureDir(dir);
  ensureDir(path.join(dir, 'work-items'));
  fs.writeFileSync(projectFile(project.slug), JSON.stringify(project, null, 2), 'utf-8');
}

// --- Public API ---

export function listProjects(): Project[] {
  ensureDir(DATA_DIR);
  const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
  const projects: Project[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const p = readProject(entry.name);
    if (p) projects.push(p);
  }
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getProject(slug: string): Project | null {
  return readProject(slug);
}

export function createProject(input: unknown): Project {
  const dto = CreateProjectDto.parse(input);
  const slug = projectSlug(dto.title);

  // Ensure unique slug
  let finalSlug = slug;
  let counter = 1;
  while (fs.existsSync(projectDir(finalSlug))) {
    finalSlug = `${slug}-${counter}`;
    counter++;
  }

  const now = new Date().toISOString();
  const project: Project = {
    id: generateId(dto.title),
    slug: finalSlug,
    title: dto.title,
    description: dto.description,
    color: dto.color ?? '#6366f1',
    workingDir: dto.workingDir || process.cwd(),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  writeProject(project);
  return project;
}

export function updateProject(slug: string, input: unknown): Project {
  const existing = readProject(slug);
  if (!existing) throw new Error(`Project not found: ${slug}`);

  const dto = UpdateProjectDto.parse(input);
  const updated: Project = {
    ...existing,
    ...dto,
    updatedAt: new Date().toISOString(),
  };

  // Handle slug change if title changed
  if (dto.title && dto.title !== existing.title) {
    const newSlug = projectSlug(dto.title);
    if (newSlug !== existing.slug) {
      let finalSlug = newSlug;
      let counter = 1;
      while (fs.existsSync(projectDir(finalSlug)) && finalSlug !== existing.slug) {
        finalSlug = `${newSlug}-${counter}`;
        counter++;
      }
      // Rename directory
      fs.renameSync(projectDir(existing.slug), projectDir(finalSlug));
      updated.slug = finalSlug;
    }
  }

  writeProject(updated);
  return updated;
}

export function deleteProject(slug: string): Project {
  const existing = readProject(slug);
  if (!existing) throw new Error(`Project not found: ${slug}`);

  // Soft delete: mark as deleted (logical — never removes files)
  const updated: Project = {
    ...existing,
    status: 'deleted',
    updatedAt: new Date().toISOString(),
  };
  writeProject(updated);
  return updated;
}

export function permanentDeleteProject(slug: string): void {
  // Logical permanent delete — removes project.json dir only, never touches workingDir
  const dir = projectDir(slug);
  if (!fs.existsSync(dir)) throw new Error(`Project not found: ${slug}`);
  fs.rmSync(dir, { recursive: true, force: true });
}
