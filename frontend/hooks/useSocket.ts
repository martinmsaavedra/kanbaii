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

    // Coordinator AI events → appStore
    socket.on('coordinator:thinking' as any, (data: any) => app().onCoordinatorThinking(data));
    socket.on('coordinator:tool_call' as any, (data: any) => app().onCoordinatorToolCall(data));
    socket.on('coordinator:completed' as any, (data: any) => app().onCoordinatorCompleted(data));

    // Escalation events (MCP-based)
    socket.on('escalation:created' as any, (data: any) => app().onEscalationCreated(data));
    socket.on('escalation:responded' as any, (data: any) => {
      app().onEscalationResponded();
      // Also clear planner escalation if it was a planner source (e.g. Telegram response)
      if (app().planner.escalation) {
        app().onPlannerEscalationResponded(data?.response || 'responded');
      }
    });
    socket.on('escalation:timeout' as any, () => {
      app().onEscalationTimeout();
      // Also clear planner escalation on timeout
      if (app().planner.escalation) {
        app().onPlannerEscalationResponded('(timed out)');
      }
    });

    // Planner events → appStore
    socket.on('planner:started' as any, (data: any) => app().onPlannerStarted(data));
    socket.on('planner:message' as any, (data: any) => app().onPlannerMessage(data));
    socket.on('planner:item-discovered' as any, (data: any) => app().onPlannerItemDiscovered(data));
    socket.on('planner:item-updated' as any, (data: any) => app().onPlannerItemUpdated(data));
    socket.on('planner:escalation' as any, (data: any) => app().onPlannerEscalation(data));
    socket.on('planner:item-approved' as any, (data: any) => app().onPlannerItemApproved(data));
    socket.on('planner:stopped' as any, () => app().onPlannerStopped());

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
