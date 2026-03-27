/**
 * Teams Engine — Thin wrapper over the Coordinator.
 * Preserves the existing API surface (startTeams, stopTeams, getTeamsState)
 * while delegating all orchestration to the coordinator singleton.
 */

import {
  startCoordinator,
  stopCoordinator,
  pauseCoordinator,
  resumeCoordinator,
  getCoordinatorState,
  CoordinatorConfig,
} from './coordinator';

export type TeamsConfig = CoordinatorConfig;

export async function startTeams(config: TeamsConfig): Promise<void> {
  return startCoordinator(config);
}

export function stopTeams(): void {
  stopCoordinator();
}

export function pauseTeams(): void {
  pauseCoordinator();
}

export function resumeTeams(): void {
  resumeCoordinator();
}

export function getTeamsState() {
  const state = getCoordinatorState();
  return {
    active: state.status === 'running' || state.status === 'paused',
    status: state.status,
    workers: state.currentParallelTaskIds.map(id => ({
      id,
      workItemSlug: '',
      taskId: id,
      taskTitle: '',
      agentName: null,
      status: 'running' as const,
    })),
    stats: state.stats,
    parallelGroups: state.parallelGroups,
    executionPlan: state.executionPlan,
    failedTasks: state.failedTasks,
    executedTasks: state.executedTasks,
  };
}
