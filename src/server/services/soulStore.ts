import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.env.KANBAII_DATA_DIR || path.join(process.cwd(), 'data', 'projects'));

// ─── Types ───

export interface SoulDocument {
  name: string;       // SOUL.md, ME.md, HEALTH.md
  content: string;
  updatedAt: string;
}

export interface MemoryEntry {
  id: string;
  content: string;
  source: string;     // 'manual' | 'auto' | 'ralph' | 'teams'
  createdAt: string;
}

export interface DailyLog {
  date: string;       // YYYY-MM-DD
  entries: string[];
}

export interface SoulConfig {
  heartbeat: {
    enabled: boolean;
    intervalMinutes: number;
    model: string;
  };
}

export interface HealthMetrics {
  score: number;         // 0-100
  executionRate: number; // tasks/day
  successRate: number;   // %
  stuckTasks: number;
  lastRun: string | null;
  updatedAt: string;
}

// ─── Paths ───

function soulDir(projectSlug: string): string {
  return path.join(DATA_DIR, projectSlug, 'soul');
}

function logsDir(projectSlug: string): string {
  return path.join(soulDir(projectSlug), 'logs');
}

function memoryFile(projectSlug: string): string {
  return path.join(soulDir(projectSlug), 'memory.json');
}

function configFile(projectSlug: string): string {
  return path.join(soulDir(projectSlug), 'config.json');
}

function healthFile(projectSlug: string): string {
  return path.join(soulDir(projectSlug), 'health.json');
}

function ensureSoulDir(projectSlug: string): void {
  const dir = soulDir(projectSlug);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const logs = logsDir(projectSlug);
  if (!fs.existsSync(logs)) fs.mkdirSync(logs, { recursive: true });
}

// ─── Soul Documents ───

const SOUL_DOCS = ['SOUL.md', 'ME.md', 'HEALTH.md'];

export function listDocuments(projectSlug: string): SoulDocument[] {
  ensureSoulDir(projectSlug);
  return SOUL_DOCS.map(name => {
    const filePath = path.join(soulDir(projectSlug), name);
    let content = '';
    let updatedAt = new Date().toISOString();
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf-8');
      updatedAt = fs.statSync(filePath).mtime.toISOString();
    }
    return { name, content, updatedAt };
  });
}

export function getDocument(projectSlug: string, name: string): SoulDocument | null {
  if (!SOUL_DOCS.includes(name)) return null;
  ensureSoulDir(projectSlug);
  const filePath = path.join(soulDir(projectSlug), name);
  let content = '';
  let updatedAt = new Date().toISOString();
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf-8');
    updatedAt = fs.statSync(filePath).mtime.toISOString();
  }
  return { name, content, updatedAt };
}

export function updateDocument(projectSlug: string, name: string, content: string): SoulDocument {
  if (!SOUL_DOCS.includes(name)) throw new Error(`Invalid document: ${name}`);
  ensureSoulDir(projectSlug);
  const filePath = path.join(soulDir(projectSlug), name);
  fs.writeFileSync(filePath, content, 'utf-8');
  return { name, content, updatedAt: new Date().toISOString() };
}

// ─── Memory ───

function readMemory(projectSlug: string): MemoryEntry[] {
  ensureSoulDir(projectSlug);
  const file = memoryFile(projectSlug);
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {}
  return [];
}

function writeMemory(projectSlug: string, entries: MemoryEntry[]): void {
  ensureSoulDir(projectSlug);
  fs.writeFileSync(memoryFile(projectSlug), JSON.stringify(entries, null, 2), 'utf-8');
}

export function getMemory(projectSlug: string): MemoryEntry[] {
  return readMemory(projectSlug);
}

export function addMemory(projectSlug: string, content: string, source: string = 'manual'): MemoryEntry {
  const entries = readMemory(projectSlug);
  const entry: MemoryEntry = {
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    content,
    source,
    createdAt: new Date().toISOString(),
  };
  entries.push(entry);
  writeMemory(projectSlug, entries);
  return entry;
}

export function updateMemoryEntry(projectSlug: string, id: string, content: string): MemoryEntry | null {
  const entries = readMemory(projectSlug);
  const entry = entries.find(e => e.id === id);
  if (!entry) return null;
  entry.content = content;
  writeMemory(projectSlug, entries);
  return entry;
}

export function deleteMemoryEntry(projectSlug: string, id: string): void {
  const entries = readMemory(projectSlug).filter(e => e.id !== id);
  writeMemory(projectSlug, entries);
}

export function resetMemory(projectSlug: string): void {
  writeMemory(projectSlug, []);
}

// ─── Daily Logs ───

export function listDailyLogs(projectSlug: string): DailyLog[] {
  ensureSoulDir(projectSlug);
  const dir = logsDir(projectSlug);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse();

  return files.map(f => {
    const date = f.replace('.md', '');
    const content = fs.readFileSync(path.join(dir, f), 'utf-8');
    const entries = content.split('\n').filter(l => l.trim());
    return { date, entries };
  });
}

export function getDailyLog(projectSlug: string, date: string): DailyLog | null {
  const filePath = path.join(logsDir(projectSlug), `${date}.md`);
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf-8');
  return { date, entries: content.split('\n').filter(l => l.trim()) };
}

export function appendDailyLog(projectSlug: string, entry: string, date?: string): void {
  ensureSoulDir(projectSlug);
  const d = date || new Date().toISOString().split('T')[0];
  const filePath = path.join(logsDir(projectSlug), `${d}.md`);
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const line = `- [${timestamp}] ${entry}\n`;
  fs.appendFileSync(filePath, line, 'utf-8');
}

// ─── Soul Config ───

const DEFAULT_CONFIG: SoulConfig = {
  heartbeat: { enabled: false, intervalMinutes: 60, model: 'haiku' },
};

export function getConfig(projectSlug: string): SoulConfig {
  ensureSoulDir(projectSlug);
  const file = configFile(projectSlug);
  try {
    if (fs.existsSync(file)) return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(file, 'utf-8')) };
  } catch {}
  return { ...DEFAULT_CONFIG };
}

export function updateConfig(projectSlug: string, config: Partial<SoulConfig>): SoulConfig {
  ensureSoulDir(projectSlug);
  const current = getConfig(projectSlug);
  const merged = {
    ...current,
    ...config,
    heartbeat: { ...current.heartbeat, ...(config.heartbeat || {}) },
  };
  fs.writeFileSync(configFile(projectSlug), JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

// ─── Health Metrics ───

export function getHealth(projectSlug: string): HealthMetrics {
  ensureSoulDir(projectSlug);
  const file = healthFile(projectSlug);
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {}
  return { score: 100, executionRate: 0, successRate: 100, stuckTasks: 0, lastRun: null, updatedAt: new Date().toISOString() };
}

export function updateHealth(projectSlug: string, metrics: Partial<HealthMetrics>): HealthMetrics {
  const current = getHealth(projectSlug);
  const updated = { ...current, ...metrics, updatedAt: new Date().toISOString() };
  ensureSoulDir(projectSlug);
  fs.writeFileSync(healthFile(projectSlug), JSON.stringify(updated, null, 2), 'utf-8');

  // Also update HEALTH.md
  const healthMd = [
    `# Health Report`,
    ``,
    `**Score:** ${updated.score}/100`,
    `**Execution Rate:** ${updated.executionRate.toFixed(1)} tasks/day`,
    `**Success Rate:** ${updated.successRate.toFixed(0)}%`,
    `**Stuck Tasks:** ${updated.stuckTasks}`,
    `**Last Run:** ${updated.lastRun || 'Never'}`,
    ``,
    `*Updated: ${updated.updatedAt}*`,
  ].join('\n');
  updateDocument(projectSlug, 'HEALTH.md', healthMd);

  return updated;
}
