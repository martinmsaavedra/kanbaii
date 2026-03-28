import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';

import { ServerToClientEvents, ClientToServerEvents } from '../shared/types';
import { setIO } from './lib/typedEmit';
import { createFileWatcher, FileChangeEvent } from './lib/fileWatcher';
import * as projectStore from './services/projectStore';
import * as workItemStore from './services/workItemStore';

import projectRoutes from './routes/projects';
import workItemRoutes from './routes/workItems';
import taskRoutes from './routes/tasks';
import generateRoutes from './routes/generate';
import ralphRoutes from './routes/ralph';
import systemRoutes from './routes/system';
import agentRoutes from './routes/agents';
import teamsRoutes from './routes/teams';
import mcpRoutes from './routes/mcp';
import skillsRoutes from './routes/skills';
import pluginsRoutes from './routes/plugins';
import terminalRoutes from './routes/terminal';
import soulRoutes from './routes/soul';
import schedulerRoutes from './routes/scheduler';
import costsRoutes from './routes/costs';
import settingsRoutes from './routes/settings';
import authRoutes from './routes/auth';
import voiceRoutes from './routes/voice';
import escalationRoutes from './routes/escalation';
import plannerRoutes from './routes/planner';
import { authMiddleware } from './lib/authMiddleware';
import { requestLogger } from './lib/requestLogger';
import { apiLimiter, authLimiter, executionLimiter, voiceLimiter } from './lib/rateLimiter';
import { startPolling as startUsagePolling } from './services/claudeUsage';
import { startSchedulerLoop } from './services/schedulerService';

const PORT = parseInt(process.env.KANBAII_PORT || '5555', 10);
const DATA_DIR = path.resolve(process.env.KANBAII_DATA_DIR || path.join(process.cwd(), 'data', 'projects'));

export function createApp() {
  const app = express();
  const httpServer = createServer(app);

  // Socket.IO
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5555',
    `http://localhost:${PORT}`,
  ];

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: allowedOrigins, methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
    serveClient: false,
  });
  setIO(io);

  // Middleware
  app.use(cors({ origin: allowedOrigins }));
  app.use(express.json({ limit: '2mb' }));
  app.use(requestLogger);

  // Auth middleware (only enforces when enabled in settings)
  app.use(authMiddleware);

  // Rate limiting
  app.use('/api/', apiLimiter);
  app.use('/api/auth', authLimiter);
  app.use('/api/ralph/start', executionLimiter);
  app.use('/api/teams/start', executionLimiter);
  app.use('/api/voice', voiceLimiter);

  // Health
  app.get('/api/health', (_req, res) => {
    const mem = process.memoryUsage();
    res.json({
      ok: true,
      version: require('../../package.json').version,
      uptime: Math.floor(process.uptime()),
      memory: {
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        rssMB: Math.round(mem.rss / 1024 / 1024),
      },
      node: process.version,
      platform: process.platform,
    });
  });

  // API Routes
  app.use('/api/projects', projectRoutes);
  app.use('/api/projects/:slug/work-items', workItemRoutes);
  app.use('/api/projects/:slug/work-items/:wiId/tasks', taskRoutes);
  app.use('/api/generate', generateRoutes);
  app.use('/api/ralph', ralphRoutes);
  app.use('/api/system', systemRoutes);
  app.use('/api/agents', agentRoutes);
  app.use('/api/teams', teamsRoutes);
  app.use('/api/mcp', mcpRoutes);
  app.use('/api/skills', skillsRoutes);
  app.use('/api/plugins', pluginsRoutes);
  app.use('/api/terminal', terminalRoutes);
  app.use('/api/projects/:slug/soul', soulRoutes);
  app.use('/api/scheduler', schedulerRoutes);
  app.use('/api/costs', costsRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/voice', voiceRoutes);
  app.use('/api/escalation', escalationRoutes);
  app.use('/api/planner', plannerRoutes);

  // Global error handler — catches unhandled errors in routes
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[server] Unhandled error:', err.message);
    res.status(500).json({ ok: false, error: 'Internal server error' });
  });

  // Static frontend (production)
  // Dashboard path: works in both dev (src/server/) and prod (dist/server/)
  const dashboardDir = path.resolve(__dirname, '..', '..', 'dashboard');
  const altDashboardDir = path.resolve(process.cwd(), 'dashboard');
  const effectiveDashboardDir = fs.existsSync(dashboardDir) ? dashboardDir : altDashboardDir;

  app.use(express.static(effectiveDashboardDir));
  app.get('*', (_req, res) => {
    const indexPath = path.join(effectiveDashboardDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ ok: false, error: 'Dashboard not built. Run: npm run build:frontend' });
    }
  });

  // Socket.IO events
  io.on('connection', (socket) => {
    // Client-initiated task move (drag & drop)
    socket.on('task:move', (data) => {
      try {
        const workItem = workItemStore.moveTask(
          data.projectSlug, data.workItemId, data.taskId,
          { toColumn: data.toColumn, toIndex: data.toIndex }
        );
        io.emit('task:moved', data);
        io.emit('workItem:updated', { projectSlug: data.projectSlug, workItem });
      } catch (err) {
        console.error('[socket] task:move error:', err);
      }
    });
  });

  // File watcher → broadcast changes from external edits
  const watcher = createFileWatcher(DATA_DIR);

  watcher.on('change', (event: FileChangeEvent) => {
    try {
      if (event.type === 'project') {
        if (event.event === 'unlink') {
          io.emit('project:deleted', { slug: event.projectSlug });
        } else {
          const project = projectStore.getProject(event.projectSlug);
          if (project) io.emit('project:updated', { project });
        }
      } else if (event.type === 'workItem' && event.workItemSlug) {
        if (event.event === 'unlink') {
          io.emit('workItem:deleted', {
            projectSlug: event.projectSlug,
            workItemId: event.workItemSlug,
          });
        } else {
          const wi = workItemStore.getWorkItem(event.projectSlug, event.workItemSlug);
          if (wi) io.emit('workItem:updated', { projectSlug: event.projectSlug, workItem: wi });
        }
      }
    } catch (err) {
      console.error('[watcher] error handling file change:', err);
    }
  });

  return { app, httpServer, io, watcher };
}

// Start server when run directly
if (require.main === module) {
  const { httpServer, io, watcher } = createApp();

  watcher.start();
  startUsagePolling(60000);
  startSchedulerLoop();

  httpServer.listen(PORT, () => {
    console.log(`\n  ⬡ KANBAII server running on http://localhost:${PORT}\n`);
  });

  // Graceful shutdown (guarded against multiple calls)
  let _shuttingDown = false;
  const shutdown = () => {
    if (_shuttingDown) { process.exit(1); return; } // Second Ctrl+C = force kill
    _shuttingDown = true;
    console.log('\n  Shutting down...');

    // Stop background services FIRST (prevents new work)
    try { require('./services/claudeUsage').stopPolling(); } catch {}
    try { require('./services/schedulerService').stopSchedulerLoop(); } catch {}

    // Stop active executions
    try { require('./engines/coordinator').stopCoordinator(); } catch {}
    try { require('./engines/workerPool').stopAllWorkers(); } catch {}
    try { require('./engines/ralph').stopRalph(); } catch {}

    watcher.stop();
    io.close();

    httpServer.close(() => {
      console.log('  Server closed.');
      process.exit(0);
    });

    // Force exit after 3 seconds
    setTimeout(() => { console.log('  Force exit.'); process.exit(1); }, 3000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
