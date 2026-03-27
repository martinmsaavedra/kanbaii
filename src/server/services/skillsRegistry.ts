import fs from 'fs';
import path from 'path';

export interface Skill {
  name: string;
  description: string;
  promptTemplate: string;
  tools?: string[];
  enabled: boolean;
  createdAt?: string;
}

const DATA_DIR = path.resolve(process.env.KANBAII_DATA_DIR || path.join(process.cwd(), 'data', 'projects'));
const SKILLS_FILE = path.join(DATA_DIR, '..', '.skills.json');

function ensureFile(): void {
  const dir = path.dirname(SKILLS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(SKILLS_FILE)) {
    fs.writeFileSync(SKILLS_FILE, JSON.stringify({ skills: [] }, null, 2), 'utf-8');
  }
}

function readSkills(): Skill[] {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(SKILLS_FILE, 'utf-8')).skills || [];
  } catch { return []; }
}

function writeSkills(skills: Skill[]): void {
  ensureFile();
  fs.writeFileSync(SKILLS_FILE, JSON.stringify({ skills }, null, 2), 'utf-8');
}

export function listSkills(): Skill[] {
  return readSkills();
}

export function getSkill(name: string): Skill | null {
  return readSkills().find((s) => s.name === name) || null;
}

export function saveSkill(skill: Skill): Skill {
  const skills = readSkills();
  const idx = skills.findIndex((s) => s.name === skill.name);
  const now = new Date().toISOString();
  const saved = { ...skill, createdAt: idx >= 0 ? skills[idx].createdAt : now };
  if (idx >= 0) skills[idx] = saved;
  else skills.push(saved);
  writeSkills(skills);
  return saved;
}

export function deleteSkill(name: string): void {
  const skills = readSkills().filter((s) => s.name !== name);
  writeSkills(skills);
}

export function toggleSkill(name: string, enabled: boolean): void {
  const skills = readSkills();
  const skill = skills.find((s) => s.name === name);
  if (skill) {
    skill.enabled = enabled;
    writeSkills(skills);
  }
}

/**
 * Build a system prompt from all enabled skills for Claude CLI --append-system-prompt
 */
export function buildSkillsPrompt(): string | null {
  const enabled = readSkills().filter((s) => s.enabled);
  if (enabled.length === 0) return null;

  const sections = enabled.map((s) =>
    `## Skill: ${s.name}\n${s.description}\n\n${s.promptTemplate}`
  );

  return `# Active Skills\n\n${sections.join('\n\n---\n\n')}`;
}
