import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.env.KANBAII_DATA_DIR || path.join(process.cwd(), 'data', 'projects'));
const USAGE_FILE = path.join(DATA_DIR, '..', '.usage.json');

// ─── Types ───

export interface ExecutionRecord {
  id: string;
  timestamp: string;
  projectSlug: string;
  workItemSlug?: string;
  taskId?: string;
  taskTitle?: string;
  model: string;
  duration: number;          // ms
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  costUsd: number;
  status: 'success' | 'failed';
}

export interface UsageData {
  executions: ExecutionRecord[];
}

export interface CostSummary {
  totalCost: number;
  totalTokens: number;
  totalExecutions: number;
  byModel: Record<string, { cost: number; tokens: number; count: number }>;
  todayCost: number;
  todayTokens: number;
  todayExecutions: number;
  monthlyCost: number;
  monthlyTokens: number;
  monthlyExecutions: number;
}

// ─── Model pricing (approximate USD per 1M tokens) ───

const PRICING: Record<string, { input: number; output: number; cache: number }> = {
  opus:   { input: 15.0, output: 75.0, cache: 1.5 },
  sonnet: { input: 3.0,  output: 15.0, cache: 0.3 },
  haiku:  { input: 0.25, output: 1.25, cache: 0.03 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number, cacheTokens: number = 0): number {
  const pricing = PRICING[model] || PRICING.sonnet;
  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output +
    (cacheTokens / 1_000_000) * pricing.cache
  );
}

// ─── Persistence ───

function readUsage(): UsageData {
  try {
    if (fs.existsSync(USAGE_FILE)) {
      return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf-8'));
    }
  } catch {}
  return { executions: [] };
}

function writeUsage(data: UsageData): void {
  const dir = path.dirname(USAGE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ─── CRUD ───

export function recordExecution(data: Omit<ExecutionRecord, 'id' | 'timestamp' | 'costUsd'>): ExecutionRecord {
  const usage = readUsage();
  const record: ExecutionRecord = {
    ...data,
    id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    costUsd: estimateCost(data.model, data.inputTokens, data.outputTokens, data.cacheTokens),
  };
  usage.executions.push(record);
  // Keep last 1000 records
  if (usage.executions.length > 1000) usage.executions = usage.executions.slice(-1000);
  writeUsage(usage);
  return record;
}

export function listExecutions(opts?: {
  projectSlug?: string;
  days?: number;
  limit?: number;
}): ExecutionRecord[] {
  let records = readUsage().executions;

  if (opts?.projectSlug) {
    records = records.filter(r => r.projectSlug === opts.projectSlug);
  }

  if (opts?.days) {
    const cutoff = Date.now() - opts.days * 86400000;
    records = records.filter(r => new Date(r.timestamp).getTime() >= cutoff);
  }

  records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (opts?.limit) records = records.slice(0, opts.limit);

  return records;
}

export function getSummary(projectSlug?: string): CostSummary {
  const all = readUsage().executions;
  const filtered = projectSlug ? all.filter(r => r.projectSlug === projectSlug) : all;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const summary: CostSummary = {
    totalCost: 0, totalTokens: 0, totalExecutions: filtered.length,
    byModel: {},
    todayCost: 0, todayTokens: 0, todayExecutions: 0,
    monthlyCost: 0, monthlyTokens: 0, monthlyExecutions: 0,
  };

  for (const r of filtered) {
    const tokens = r.inputTokens + r.outputTokens + r.cacheTokens;
    const ts = new Date(r.timestamp).getTime();

    summary.totalCost += r.costUsd;
    summary.totalTokens += tokens;

    if (ts >= todayStart) {
      summary.todayCost += r.costUsd;
      summary.todayTokens += tokens;
      summary.todayExecutions++;
    }
    if (ts >= monthStart) {
      summary.monthlyCost += r.costUsd;
      summary.monthlyTokens += tokens;
      summary.monthlyExecutions++;
    }

    if (!summary.byModel[r.model]) {
      summary.byModel[r.model] = { cost: 0, tokens: 0, count: 0 };
    }
    summary.byModel[r.model].cost += r.costUsd;
    summary.byModel[r.model].tokens += tokens;
    summary.byModel[r.model].count++;
  }

  return summary;
}

export function clearExecutions(projectSlug?: string): void {
  if (projectSlug) {
    const usage = readUsage();
    usage.executions = usage.executions.filter(r => r.projectSlug !== projectSlug);
    writeUsage(usage);
  } else {
    writeUsage({ executions: [] });
  }
}
