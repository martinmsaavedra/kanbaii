import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';

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
import { authMiddleware } from './lib/authMiddleware';
import { startPolling as startUsagePolling } from './services/claudeUsage';

const PORT = parseInt(process.env.KANBAII_PORT || '5555', 10);
const DATA_DIR = path.resolve(process.env.KANBAII_DATA_DIR || path.join(process.cwd(), 'data', 'projects'));

export function createApp() {
  const app = express();
  const httpServer = createServer(app);

  // Socket.IO
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
    serveClient: false,
  });
  setIO(io);

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Auth middleware (only enforces when enabled in settings)
  app.use(authMiddleware);

  // Health
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, version: '0.1.0', uptime: process.uptime() });
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

  // Static frontend (production)
  const dashboardDir = path.resolve(__dirname, '..', '..', 'dashboard');
  app.use(express.static(dashboardDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(dashboardDir, 'index.html'), (err) => {
      if (err) res.status(404).json({ ok: false, error: 'Not found' });
    });
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
  const { httpServer, watcher } = createApp();

  watcher.start();
  startUsagePolling(60000); // Poll Claude usage every 60s

  httpServer.listen(PORT, () => {
    console.log(`\n  ⬡ KANBAII server running on http://localhost:${PORT}\n`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n  Shutting down...');
    watcher.stop();
    httpServer.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
