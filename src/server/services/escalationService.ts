import crypto from 'crypto';
import { emit } from '../lib/typedEmit';
import { sendMessageWithReplyKeyboard, waitForTelegramReply } from './telegramService';
import { getSection } from './settingsService';

// ─── Types ───

export interface Escalation {
  id: string;
  source: 'ralph' | 'teams' | 'planner';
  taskId: string;
  taskTitle: string;
  question: string;
  options: string[];
  response: string | null;
  status: 'pending' | 'responded' | 'timed_out';
  createdAt: string;
  respondedAt: string | null;
  timeoutMs: number;
}

// ─── State (queue of escalations — process one at a time) ───

let escalationQueue: Escalation[] = [];
let timeoutHandles: Map<string, ReturnType<typeof setTimeout>> = new Map();

// Source override — when planner is active, all escalations get source 'planner'
let sourceOverride: 'ralph' | 'teams' | 'planner' | null = null;
export function setSourceOverride(source: 'ralph' | 'teams' | 'planner' | null): void { sourceOverride = source; }

// ─── API ───

export function createEscalation(data: {
  source: 'ralph' | 'teams' | 'planner';
  taskId: string;
  taskTitle: string;
  question: string;
  options?: string[];
  timeoutSeconds?: number;
}): Escalation {
  const escalation: Escalation = {
    id: `esc-${crypto.randomBytes(12).toString('hex')}`,
    source: sourceOverride || data.source,
    taskId: data.taskId,
    taskTitle: data.taskTitle,
    question: data.question,
    options: data.options || [],
    response: null,
    status: 'pending',
    createdAt: new Date().toISOString(),
    respondedAt: null,
    timeoutMs: (data.timeoutSeconds || 1800) * 1000,
  };

  escalationQueue.push(escalation);

  // Only emit if this is the first (active) escalation — others wait in queue
  if (escalationQueue.filter(e => e.status === 'pending').length === 1) {
    emitEscalation(escalation);
  }

  // Auto-timeout
  const th = setTimeout(() => {
    const esc = escalationQueue.find(e => e.id === escalation.id);
    if (esc && esc.status === 'pending') {
      esc.status = 'timed_out';
      emit('escalation:timeout' as any, { id: escalation.id });
      advanceQueue();
    }
  }, escalation.timeoutMs);
  timeoutHandles.set(escalation.id, th);

  return escalation;
}

function emitEscalation(escalation: Escalation): void {
  emit('escalation:created' as any, {
    id: escalation.id,
    source: escalation.source,
    taskId: escalation.taskId,
    taskTitle: escalation.taskTitle,
    question: escalation.question,
    options: escalation.options,
    timeoutMs: escalation.timeoutMs,
  });

  // Telegram
  try {
    const telegram = getSection('integrations').telegram;
    if (telegram.enabled) {
      const taskInfo = escalation.taskTitle ? `\n📋 _${escalation.taskTitle}_` : '';
      const optsList = escalation.options.length > 0
        ? `\n\n${escalation.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`
        : '';
      sendMessageWithReplyKeyboard(
        `🔔 *${escalation.source === 'ralph' ? 'Ralph' : 'Teams'}*${taskInfo}\n\n${escalation.question}${optsList}`,
        escalation.options
      ).then(() => {
        waitForTelegramReply(escalation.timeoutMs).then((reply) => {
          const esc = escalationQueue.find(e => e.id === escalation.id);
          if (reply && esc?.status === 'pending') respondToEscalation(escalation.id, reply);
        });
      });
    }
  } catch {}
}

function advanceQueue(): void {
  const next = escalationQueue.find(e => e.status === 'pending');
  if (next) emitEscalation(next);
}

export function respondToEscalation(id: string, response: string): Escalation | null {
  const esc = escalationQueue.find(e => e.id === id);
  if (!esc || esc.status !== 'pending') return null;

  esc.response = response;
  esc.status = 'responded';
  esc.respondedAt = new Date().toISOString();

  const th = timeoutHandles.get(id);
  if (th) { clearTimeout(th); timeoutHandles.delete(id); }

  emit('escalation:responded' as any, { id, response });

  // Advance to next pending escalation
  advanceQueue();

  return esc;
}

export function getPendingEscalation(): Escalation | null {
  return escalationQueue.find(e => e.status === 'pending') || null;
}

export function getEscalationStatus(): { pending: boolean; escalation: Escalation | null; responded: boolean } {
  const active = escalationQueue.find(e => e.status === 'pending');
  const lastResponded = [...escalationQueue].reverse().find(e => e.status === 'responded');
  return {
    pending: !!active,
    escalation: active || lastResponded || null,
    responded: !!lastResponded && !active,
  };
}

export function clearEscalation(): void {
  // Remove responded/timed_out from queue
  escalationQueue = escalationQueue.filter(e => e.status === 'pending');
  for (const [id, th] of timeoutHandles) { clearTimeout(th); }
  timeoutHandles.clear();
}
