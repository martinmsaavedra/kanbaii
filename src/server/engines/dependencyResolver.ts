/**
 * Dependency Graph Resolver — Topological sort with parallel group detection.
 * Uses Kahn's algorithm. Tasks with no remaining dependencies form a parallel group.
 * Groups execute sequentially; tasks within a group run concurrently.
 */

export interface TaskNode {
  id: string;
  title: string;
  depends?: string[];
}

export interface ResolvedPlan {
  executionOrder: string[];
  parallelGroups: string[][];
  blocked: Map<string, string[]>;
}

export class CyclicDependencyError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`Cyclic dependency detected: ${cycle.join(' → ')}`);
    this.name = 'CyclicDependencyError';
  }
}

export function resolveDependencies(tasks: TaskNode[]): ResolvedPlan {
  const idSet = new Set(tasks.map(t => t.id));

  const inDeps = new Map<string, Set<string>>();
  const outDeps = new Map<string, Set<string>>();

  for (const task of tasks) {
    if (!inDeps.has(task.id)) inDeps.set(task.id, new Set());
    if (!outDeps.has(task.id)) outDeps.set(task.id, new Set());

    for (const depId of task.depends ?? []) {
      if (!idSet.has(depId)) continue;
      inDeps.get(task.id)!.add(depId);
      if (!outDeps.has(depId)) outDeps.set(depId, new Set());
      outDeps.get(depId)!.add(task.id);
    }
  }

  const executionOrder: string[] = [];
  const parallelGroups: string[][] = [];
  const queue: string[] = [];

  for (const task of tasks) {
    if (inDeps.get(task.id)!.size === 0) queue.push(task.id);
  }

  let visited = 0;
  while (queue.length > 0) {
    const group = [...queue];
    parallelGroups.push(group);
    queue.length = 0;

    for (const id of group) {
      executionOrder.push(id);
      visited++;
      for (const dependentId of outDeps.get(id) ?? []) {
        const deps = inDeps.get(dependentId)!;
        deps.delete(id);
        if (deps.size === 0) queue.push(dependentId);
      }
    }
  }

  if (visited !== tasks.length) {
    const cycle = findCycle(tasks, inDeps);
    throw new CyclicDependencyError(cycle);
  }

  return { executionOrder, parallelGroups, blocked: new Map() };
}

export function applyFailedDependencies(
  plan: ResolvedPlan,
  tasks: TaskNode[],
  failedIds: Set<string>
): ResolvedPlan {
  if (failedIds.size === 0) return plan;

  const blocked = new Map<string, string[]>(plan.blocked);
  const toBlock = new Set<string>();
  const queue = [...failedIds];

  while (queue.length > 0) {
    const failedId = queue.shift()!;
    for (const task of tasks) {
      if (task.depends?.includes(failedId) && !toBlock.has(task.id) && !failedIds.has(task.id)) {
        toBlock.add(task.id);
        blocked.set(task.id, [...(blocked.get(task.id) ?? []), failedId]);
        queue.push(task.id);
      }
    }
  }

  const executionOrder = plan.executionOrder.filter(id => !toBlock.has(id) && !failedIds.has(id));
  const parallelGroups = plan.parallelGroups
    .map(g => g.filter(id => !toBlock.has(id) && !failedIds.has(id)))
    .filter(g => g.length > 0);

  return { executionOrder, parallelGroups, blocked };
}

function findCycle(tasks: TaskNode[], inDeps: Map<string, Set<string>>): string[] {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  function dfs(id: string): boolean {
    if (stack.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    stack.add(id);
    path.push(id);
    for (const depId of inDeps.get(id) ?? []) {
      if (dfs(depId)) return true;
    }
    stack.delete(id);
    path.pop();
    return false;
  }

  for (const task of tasks) {
    if (!visited.has(task.id) && dfs(task.id)) {
      const cycleStart = path[path.length - 1];
      const idx = path.indexOf(cycleStart);
      return [...path.slice(idx), cycleStart];
    }
  }
  return ['(unknown cycle)'];
}
