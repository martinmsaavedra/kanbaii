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
import path from 'path';

let currentRunner: ClaudeRunner | null = null;

export interface RalphConfig {
  projectSlug: string;
  workItemSlug: string;
  maxErrors?: number;  // circuit breaker, default 3
}

export async function startRalph(config: RalphConfig): Promise<void> {
  const { projectSlug, workItemSlug, maxErrors = 3 } = config;

  // Validate
  const project = projectStore.getProject(projectSlug);
  if (!project) throw new Error(`Project not found: ${projectSlug}`);

  const wi = workItemStore.getWorkItem(projectSlug, workItemSlug);
  if (!wi) throw new Error(`Work item not found: ${workItemSlug}`);

  if (!project.workingDir) {
    throw new Error('Project has no working directory configured. Set it in project settings before running Ralph.');
  }
  const workingDir = project.workingDir;

  // Get tasks from Todo column
  const todoTasks = wi.columns['todo'];
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
    runner.on('output', (chunk: string) => {
      output += chunk;
      emit('ralph:output', { taskId: task.id, message: chunk });
    });

    try {
      const result = await runner.run({
        prompt,
        workingDir,
        model: task.model || 'sonnet',
        systemPrompt: skillsPrompt || undefined,
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
            inputTokens: 0, outputTokens: 0, cacheTokens: 0, status: 'success',
          });
        } catch {}

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
    `If you encounter issues, fix them. Do not ask for clarification — make reasonable assumptions.`,
  ].filter(Boolean);

  return lines.join('\n');
}
