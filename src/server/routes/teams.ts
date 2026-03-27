import { Router, Request, Response } from 'express';
import { startTeams, stopTeams, getTeamsState } from '../engines/teams';
import { getPoolStatus, assignTask } from '../engines/workerPool';
import { getCoordinatorState } from '../engines/coordinator';
import { listWorkItems } from '../services/workItemStore';

const router = Router();

// POST /api/teams/start
router.post('/start', async (req: Request, res: Response) => {
  const { projectSlug, workItemSlugs, maxWorkers, model } = req.body;

  if (!projectSlug || !workItemSlugs?.length) {
    return res.status(400).json({ ok: false, error: 'projectSlug and workItemSlugs are required' });
  }

  try {
    startTeams({ projectSlug, workItemSlugs, maxWorkers, model }).catch((err) => {
      console.error('[teams] Error:', err);
    });
    res.json({ ok: true, data: { message: 'Teams started' } });
  } catch (err) {
    res.status(409).json({ ok: false, error: (err as Error).message });
  }
});

// POST /api/teams/stop
router.post('/stop', (_req: Request, res: Response) => {
  stopTeams();
  res.json({ ok: true, data: { message: 'Teams stopped' } });
});

// Input handling is now via MCP escalation endpoint (/api/escalation/*)

// GET /api/teams/state
router.get('/state', (_req: Request, res: Response) => {
  res.json({ ok: true, data: getTeamsState() });
});

// GET /api/teams/tasks — task board state for MCP list_tasks tool
router.get('/tasks', (_req: Request, res: Response) => {
  const { projectSlug } = getCoordinatorState();

  const tasks: Record<string, any[]> = {
    backlog: [],
    todo: [],
    'in-progress': [],
    review: [],
    done: [],
  };

  if (!projectSlug) {
    return res.json({ ok: true, data: { tasks } });
  }

  // Scan all work items for the project across all columns
  const workItems = listWorkItems(projectSlug);

  for (const wi of workItems) {
    for (const col of ['backlog', 'todo', 'in-progress', 'review', 'done'] as const) {
      const colTasks = wi.columns?.[col] ?? [];
      for (const task of colTasks) {
        tasks[col].push({
          id: task.id,
          title: task.title,
          description: task.description,
          workItemSlug: wi.slug,
          workItemTitle: wi.title,
          priority: task.priority,
          tags: task.tags,
          agent: task.agent,
          model: task.model,
          depends: task.depends,
          completed: task.completed,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        });
      }
    }
  }

  res.json({ ok: true, data: { tasks } });
});

// POST /api/teams/assign — spawn worker for MCP assign_task tool
router.post('/assign', async (req: Request, res: Response) => {
  const { taskId, agent, model, additionalContext } = req.body;

  if (!taskId) {
    return res.status(400).json({ ok: false, error: 'taskId is required' });
  }

  const result = await assignTask({ taskId, agent, model, additionalContext });

  if ('error' in result) {
    return res.status(409).json({ ok: false, error: result.error });
  }

  res.json({ ok: true, data: { workerId: result.workerId } });
});

// GET /api/teams/workers — worker pool status for MCP check_workers tool
router.get('/workers', (_req: Request, res: Response) => {
  res.json({ ok: true, data: getPoolStatus() });
});

export default router;
