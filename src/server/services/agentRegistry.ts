import fs from 'fs';
import path from 'path';

export interface AgentProfile {
  name: string;
  description: string;
  model: 'opus' | 'sonnet' | 'haiku';
  skills: string[];        // tags this agent handles
  tools: string[];         // MCP tools available
  instructions: string;    // custom prompt/instructions
  builtIn: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const DATA_DIR = path.resolve(process.env.KANBAII_DATA_DIR || path.join(process.cwd(), 'data', 'projects'));
const AGENTS_DIR = path.join(DATA_DIR, '..', '.agents');

function ensureDir(): void {
  if (!fs.existsSync(AGENTS_DIR)) fs.mkdirSync(AGENTS_DIR, { recursive: true });
}

function agentFile(name: string): string {
  return path.join(AGENTS_DIR, `${name}.json`);
}

// Built-in agents
const BUILT_IN_AGENTS: AgentProfile[] = [
  {
    name: 'CoderAgent',
    description: 'Full-stack developer. Writes clean, tested code.',
    model: 'sonnet',
    skills: ['backend', 'frontend', 'api', 'implementation', 'coding', 'feature'],
    tools: ['Bash', 'Edit', 'Write', 'Read'],
    instructions: 'You are a senior full-stack developer. Write clean, well-structured code. Follow existing patterns. Include error handling.',
    builtIn: true,
  },
  {
    name: 'TesterAgent',
    description: 'QA specialist. Writes comprehensive tests.',
    model: 'sonnet',
    skills: ['testing', 'test', 'qa', 'unit-test', 'integration-test'],
    tools: ['Bash', 'Edit', 'Write', 'Read'],
    instructions: 'You are a QA engineer. Write comprehensive tests covering edge cases. Use the project\'s testing framework.',
    builtIn: true,
  },
  {
    name: 'ReviewerAgent',
    description: 'Code reviewer. Finds bugs, suggests improvements.',
    model: 'opus',
    skills: ['review', 'code-review', 'refactor', 'audit'],
    tools: ['Read', 'Bash'],
    instructions: 'You are a senior code reviewer. Analyze code for bugs, security issues, performance problems, and suggest improvements. Be thorough but constructive.',
    builtIn: true,
  },
  {
    name: 'DocAgent',
    description: 'Documentation writer. Clear, concise docs.',
    model: 'haiku',
    skills: ['docs', 'documentation', 'readme', 'comments'],
    tools: ['Read', 'Write', 'Edit'],
    instructions: 'You are a technical writer. Write clear, concise documentation. Include examples where helpful.',
    builtIn: true,
  },
  {
    name: 'SecurityAgent',
    description: 'Security analyst. Finds vulnerabilities.',
    model: 'opus',
    skills: ['security', 'vulnerability', 'audit', 'pentest'],
    tools: ['Read', 'Bash'],
    instructions: 'You are a security analyst. Scan for OWASP top 10 vulnerabilities, insecure patterns, and potential attack vectors. Report findings with severity and remediation.',
    builtIn: true,
  },
];

export function listAgents(): AgentProfile[] {
  ensureDir();
  const agents: AgentProfile[] = [...BUILT_IN_AGENTS];

  // Load custom agents
  if (fs.existsSync(AGENTS_DIR)) {
    const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, file), 'utf-8'));
        // Don't duplicate built-ins
        if (!agents.some((a) => a.name === raw.name)) {
          agents.push({ ...raw, builtIn: false });
        }
      } catch { /* skip invalid files */ }
    }
  }

  return agents;
}

export function getAgent(name: string): AgentProfile | null {
  const builtIn = BUILT_IN_AGENTS.find((a) => a.name === name);
  if (builtIn) return builtIn;

  const file = agentFile(name);
  if (!fs.existsSync(file)) return null;
  try {
    return { ...JSON.parse(fs.readFileSync(file, 'utf-8')), builtIn: false };
  } catch { return null; }
}

export function saveAgent(agent: Omit<AgentProfile, 'builtIn'>): AgentProfile {
  ensureDir();
  const now = new Date().toISOString();
  const existing = getAgent(agent.name);
  const profile: AgentProfile = {
    ...agent,
    builtIn: false,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  fs.writeFileSync(agentFile(agent.name), JSON.stringify(profile, null, 2), 'utf-8');
  return profile;
}

export function deleteAgent(name: string): void {
  const agent = getAgent(name);
  if (!agent) throw new Error(`Agent not found: ${name}`);
  if (agent.builtIn) throw new Error('Cannot delete built-in agent');
  const file = agentFile(name);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

/**
 * Suggest the best agent for a task based on tag matching.
 * Returns the agent with the highest match score.
 * Structural tags (column names) are ignored.
 */
const STRUCTURAL_TAGS = new Set(['backlog', 'todo', 'in-progress', 'review', 'done', 'planning', 'active']);

export function suggestAgent(taskTags: string[]): { agent: AgentProfile; score: number; matchCount: number } | null {
  const relevantTags = taskTags.filter((t) => !STRUCTURAL_TAGS.has(t.toLowerCase()));
  if (relevantTags.length === 0) return null;

  const agents = listAgents();
  let best: { agent: AgentProfile; score: number; matchCount: number } | null = null;

  for (const agent of agents) {
    const matchCount = relevantTags.filter((tag) =>
      agent.skills.some((skill) => skill.toLowerCase() === tag.toLowerCase())
    ).length;

    if (matchCount === 0) continue;

    // Score = matchCount / totalAgentSkills (precision — specialized agents win ties)
    const score = matchCount / agent.skills.length;

    if (!best || score > best.score || (score === best.score && matchCount > best.matchCount)) {
      best = { agent, score, matchCount };
    }
  }

  return best;
}
