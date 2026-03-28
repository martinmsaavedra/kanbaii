/**
 * Task Router — Agent selection + prompt building for coordinator workers.
 */

import { suggestAgent, getAgent } from '../services/agentRegistry';
import { sanitizeForPrompt } from '../lib/promptSanitizer';

export interface TaskForRouting {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  agent?: string;
  model?: string;
}

export function selectAgent(task: TaskForRouting) {
  // Explicit assignment wins
  if (task.agent) {
    const explicit = getAgent(task.agent);
    if (explicit) return { agent: explicit, selectionReason: `explicit: ${task.agent}` };
  }

  // Auto-select by tags
  const suggestion = suggestAgent(task.tags || []);
  if (suggestion) {
    return { agent: suggestion.agent, selectionReason: `auto: ${suggestion.agent.name} (score ${suggestion.score})` };
  }

  // Fallback: CoderAgent
  const fallback = getAgent('CoderAgent')!;
  return { agent: fallback, selectionReason: 'fallback: CoderAgent' };
}

export function buildPrompt(
  task: TaskForRouting,
  agent: { name: string; instructions?: string },
  soulSummary: string,
  completedTaskIds: string[],
  failedTaskIds: string[],
  projectTitle: string,
  workItemTitle: string,
): string {
  const parts: string[] = [];

  // Agent identity
  if (agent.instructions) {
    parts.push(`# Agent: ${agent.name}\n${agent.instructions}\n`);
  }

  // Soul/Constitution context
  if (soulSummary) {
    parts.push(`# Project Context\n${soulSummary}\n`);
  }

  // Task details
  parts.push(`# Task: ${sanitizeForPrompt(task.title)}`);
  if (task.description) parts.push(`\n## Description\n${sanitizeForPrompt(task.description)}`);

  parts.push(`\n## Project Info`);
  parts.push(`- Project: ${projectTitle}`);
  parts.push(`- Work Item: ${workItemTitle}`);

  // Dependency context
  if (completedTaskIds.length > 0) {
    parts.push(`\n## Previously Completed Tasks`);
    parts.push(`These tasks are done: ${completedTaskIds.map(id => '`' + id + '`').join(', ')}. Your work must be compatible.`);
  }
  if (failedTaskIds.length > 0) {
    parts.push(`\n## Failed Tasks (avoid their approach)`);
    parts.push(`These tasks failed: ${failedTaskIds.map(id => '`' + id + '`').join(', ')}.`);
  }

  parts.push(`\n## Instructions`);
  parts.push(`Implement this task. Write clean, working code. Run tests if applicable.`);
  parts.push(`If blocked, use escalate_to_human MCP tool (not AskUserQuestion).`);

  return parts.join('\n');
}

export function escalateModel(model: string): string {
  if (model === 'haiku') return 'sonnet';
  if (model === 'sonnet') return 'opus';
  return 'opus';
}
