import { runStore } from './runStore';
import { ClaudeRunner } from './claudeRunner';
import { emit } from '../lib/typedEmit';
import * as workItemStore from '../services/workItemStore';
import * as projectStore from '../services/projectStore';
import { buildSkillsPrompt } from '../services/skillsRegistry';
import { runHook } from '../services/pluginLoader';
import { appendDailyLog, updateHealth } from '../services/soulStore';
import { notifyRalphStarted, notifyRalphCompleted } from '../services/telegramService';
import { recordExecution } from '../services/costTracker';
import { createEscalation } from '../services/escalationService';
import path from 'path';

let currentRunner: ClaudeRunner | null = null;

export interface RalphConfig {
  projectSlug: string;
  workItemSlug: string;
  taskIds?: string[];    // If provided, only run these specific tasks from todo
  maxErrors?: number;
}

export async function startRalph(config: RalphConfig): Promise<void> {
  const { projectSlug, workItemSlug, taskIds: filterTaskIds, maxErrors = 3 } = config;

  // Validate
  const project = projectStore.getProject(projectSlug);
  if (!project) throw new Error(`Project not found: ${projectSlug}`);

  const wi = workItemStore.getWorkItem(projectSlug, workItemSlug);
  if (!wi) throw new Error(`Work item not found: ${workItemSlug}`);

  if (!project.workingDir) {
    throw new Error('Project has no working directory configured. Set it in project settings before running Ralph.');
  }
  const workingDir = project.workingDir;

  // Get tasks from Todo column (optionally filtered)
  let todoTasks = wi.columns['todo'];
  if (filterTaskIds?.length) {
    todoTasks = todoTasks.filter((t) => filterTaskIds.includes(t.id));
  }
  if (todoTasks.length === 0) throw new Error('No tasks in Todo column');

  // Acquire lock
  if (!runStore.acquire()) throw new Error('Another run is in progress');

  const taskIds = todoTasks.map((t) => t.id);
  const runId = runStore.start('ralph', projectSlug, workItemSlug, todoTasks.length);

  emit('ralph:started', {
    projectSlug,
    workItemId: wi.id,
    total: todoTasks.length,
    taskIds,
  });

  // Auto-move work item to 'active' if still in 'planning'
  const wiActivated = workItemStore.activateWorkItemIfNeeded(projectSlug, workItemSlug);
  if (wiActivated) emit('workItem:updated', { projectSlug, workItem: wiActivated });

  // Plugin: preRun hook + Telegram
  await runHook('preRun', { runType: 'ralph', projectSlug });
  notifyRalphStarted(projectSlug, todoTasks.length);

  // Execute sequentially
  let consecutiveErrors = 0;

  for (let i = 0; i < todoTasks.length; i++) {
    // Check for stop/pause
    if (runStore.isStopping()) break;

    while (runStore.isPaused()) {
      await new Promise((r) => setTimeout(r, 500));
      if (runStore.isStopping()) break;
    }
    if (runStore.isStopping()) break;

    const task = todoTasks[i];
    runStore.setCurrentTask(task.id, task.title);

    // Move task to In Progress
    workItemStore.moveTask(projectSlug, workItemSlug, task.id, {
      toColumn: 'in-progress',
      toIndex: 0,
    });
    const wiAfterMove = workItemStore.getWorkItem(projectSlug, workItemSlug);
    if (wiAfterMove) emit('workItem:updated', { projectSlug, workItem: wiAfterMove });

    emit('ralph:progress', {
      current: i + 1,
      total: todoTasks.length,
      currentTask: { id: task.id, title: task.title },
    });

    // Soul: log task start
    try { appendDailyLog(projectSlug, `Ralph: started "${task.title}" [${task.model}]`); } catch {}

    // Build prompt + skills
    const prompt = buildTaskPrompt(project, wi, task);
    const skillsPrompt = buildSkillsPrompt();

    // Plugin: preTask hook
    await runHook('preTask', { taskId: task.id, title: task.title, workingDir });

    // Run with Claude
    const runner = new ClaudeRunner();
    currentRunner = runner;

    let output = '';
    let costData = { costUsd: 0, inputTokens: 0, outputTokens: 0 };

    runner.on('output', (chunk: string) => {
      output += chunk;
      emit('ralph:output', { taskId: task.id, message: chunk });
    });

    runner.on('cost', (data: { costUsd: number; inputTokens: number; outputTokens: number }) => {
      costData = data;
    });

    runner.on('escalation', (data: { tool: string; question: string; input: any }) => {
      console.log(`[ralph] Escalation detected (${data.tool}): ${data.question.slice(0, 80)}`);
      createEscalation({
        source: 'ralph',
        taskId: task.id,
        taskTitle: task.title,
        question: data.question,
        options: data.input?.options || [],
      });
    });

    try {
      const result = await runner.run({
        prompt,
        workingDir,
        model: task.model || 'sonnet',
        systemPrompt: skillsPrompt || undefined,
        maxTurns: 50,
      });

      currentRunner = null;

      if (result.exitCode === 0) {
        // Success — move task to review
        workItemStore.moveTask(projectSlug, workItemSlug, task.id, {
          toColumn: 'review',
          toIndex: 0,
        });
        workItemStore.updateTask(projectSlug, workItemSlug, task.id, {
          output: output || result.stdout,
        });
        runStore.taskCompleted();
        consecutiveErrors = 0;
        await runHook('postTask', { taskId: task.id, title: task.title, exitCode: 0, output });

        // Cost tracking
        try {
          recordExecution({
            projectSlug, workItemSlug, taskId: task.id, taskTitle: task.title,
            model: task.model || 'sonnet', duration: result.duration,
            inputTokens: costData.inputTokens, outputTokens: costData.outputTokens,
            cacheTokens: 0, costUsd: costData.costUsd, status: 'success',
          });
        } catch (err) {
          console.error('[ralph] Failed to record execution cost:', (err as Error).message);
        }

        // Broadcast update
        const updatedWI = workItemStore.getWorkItem(projectSlug, workItemSlug);
        if (updatedWI) emit('workItem:updated', { projectSlug, workItem: updatedWI });

      } else {
        // Failed
        workItemStore.updateTask(projectSlug, workItemSlug, task.id, {
          output: `EXIT CODE: ${result.exitCode}\n\n${result.stderr || result.stdout}`,
        });
        runStore.taskFailed();
        consecutiveErrors++;

        // Cost tracking for failed tasks too
        try {
          recordExecution({
            projectSlug, workItemSlug, taskId: task.id, taskTitle: task.title,
            model: task.model || 'sonnet', duration: result.duration,
            inputTokens: costData.inputTokens, outputTokens: costData.outputTokens,
            cacheTokens: 0, costUsd: costData.costUsd, status: 'failed',
          });
        } catch (err) {
          console.error('[ralph] Failed to record execution cost:', (err as Error).message);
        }

        emit('ralph:error', { taskId: task.id, message: result.stderr || `Exit code ${result.exitCode}` });

        // Circuit breaker
        if (consecutiveErrors >= maxErrors) {
          emit('ralph:error', { message: `Circuit breaker: ${maxErrors} consecutive errors. Stopping.` });
          break;
        }
      }
    } catch (err) {
      currentRunner = null;
      runStore.taskFailed();
      consecutiveErrors++;
      emit('ralph:error', { taskId: task.id, message: (err as Error).message });

      if (consecutiveErrors >= maxErrors) {
        emit('ralph:error', { message: `Circuit breaker: ${maxErrors} consecutive errors. Stopping.` });
        break;
      }
    }
  }

  // Plugin: postRun hook + Soul logging
  const finalState = runStore.getState();
  await runHook('postRun', { runType: 'ralph', stats: finalState.stats });

  // Telegram notification
  notifyRalphCompleted(projectSlug, finalState.stats.completed, finalState.stats.failed);

  // Soul: log run summary + update health
  try {
    const { completed, failed, total } = finalState.stats;
    appendDailyLog(projectSlug, `Ralph: finished ${workItemSlug} — ${completed}/${total} done, ${failed} failed`);
    updateHealth(projectSlug, {
      lastRun: new Date().toISOString(),
      successRate: total > 0 ? (completed / total) * 100 : 100,
      executionRate: completed,
    });
  } catch {}

  // Auto-promote work item to 'review' if all tasks are done/review
  const wiAfterRun = workItemStore.promoteWorkItemIfComplete(projectSlug, workItemSlug);
  if (wiAfterRun) emit('workItem:updated', { projectSlug, workItem: wiAfterRun });

  // Done
  emit('ralph:completed', {
    stats: finalState.stats,
    message: `Completed: ${finalState.stats.completed} done, ${finalState.stats.failed} failed, ${finalState.stats.skipped} skipped`,
  });

  runStore.stop();
}

export function stopRalph(): void {
  runStore.requestStop();
  if (currentRunner) currentRunner.stop();
}

export function pauseRalph(): void {
  runStore.pause();
}

export function resumeRalph(): void {
  runStore.resume();
}

// Input handling is now via MCP escalation — no stdin needed

function buildTaskPrompt(project: any, wi: any, task: any): string {
  const lines = [
    `# Task: ${task.title}`,
    '',
    task.description ? `## Description\n${task.description}\n` : '',
    `## Context`,
    `- Project: ${project.title}`,
    `- Work Item: ${wi.title} (${wi.category})`,
    wi.plan?.content ? `- Plan:\n${wi.plan.content}\n` : '',
    `## Instructions`,
    `Implement this task. Write clean, working code. Run tests if applicable.`,
    `If blocked, use escalate_to_human MCP tool (not AskUserQuestion).`,
  ].filter(Boolean);

  return lines.join('\n');
}
