'use client';

import { useEffect, useRef } from 'react';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { useProjectStore } from '@/stores/projectStore';
import { useWorkItemStore } from '@/stores/workItemStore';
import { useAppStore } from '@/stores/appStore';

/**
 * Central socket wiring. ALL events go to stores, NEVER to local state.
 * See CLAUDE.md REGLA #1.
 */
export function useSocket() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const socket = getSocket();
    const app = useAppStore.getState;
    const proj = useProjectStore.getState;
    const wi = useWorkItemStore.getState;

    // Project events
    socket.on('project:updated', ({ project }) => proj().onProjectUpdated(project));
    socket.on('project:deleted', ({ slug }) => proj().onProjectDeleted(slug));

    // Work item events
    socket.on('workItem:updated', ({ projectSlug, workItem }) => wi().onWorkItemUpdated(projectSlug, workItem));
    socket.on('workItem:deleted', ({ projectSlug, workItemId }) => wi().onWorkItemDeleted(projectSlug, workItemId));

    // Ralph events → appStore
    socket.on('ralph:started', (data) => app().onRalphStarted(data));
    socket.on('ralph:progress', (data) => app().onRalphProgress(data));
    socket.on('ralph:output', (data) => app().onRalphOutput(data));
    socket.on('ralph:completed', (data) => app().onRalphCompleted(data));
    socket.on('ralph:error', (data) => app().onRalphError(data));
    socket.on('ralph:input-needed' as any, (data: any) => app().onRalphInputNeeded(data));

    // Teams events → appStore (ALL of them, not just active flag)
    socket.on('live:started', (data) => app().onTeamsStarted(data));
    socket.on('live:worker-assigned', (data) => app().onTeamsWorkerAssigned(data));
    socket.on('live:worker-completed', (data) => app().onTeamsWorkerCompleted(data));
    socket.on('live:metrics', (data) => app().onTeamsMetrics(data));
    socket.on('live:output', (data) => app().onTeamsOutput(data));
    socket.on('live:stopped', (data) => app().onTeamsStopped(data));
    socket.on('teams:input-needed' as any, (data: any) => app().onTeamsInputNeeded(data));

    // Terminal events → appStore
    socket.on('terminal:output' as any, (data: any) => {
      app().appendTerminalOutput(data.text);
      app().setTerminalStatus('running');
    });
    socket.on('terminal:closed' as any, () => app().setTerminalStatus('idle'));
    socket.on('terminal:error' as any, (data: any) => {
      app().appendTerminalOutput(`ERROR: ${data.message}`);
      app().setTerminalStatus('error');
    });

    // Rehydrate on connect
    app().rehydrate();
    socket.on('connect', () => app().rehydrate());

    return () => {
      disconnectSocket();
      initialized.current = false;
    };
  }, []);
}
