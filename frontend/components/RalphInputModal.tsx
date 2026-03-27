'use client';

import { useState, useEffect, useRef } from 'react';
import { Cpu, Users, Send, SkipForward, Square } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useToastStore } from '@/stores/toastStore';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';

interface ParsedQuestion {
  question: string;
  options: { label: string; description?: string }[];
}

function parseEscalationQuestion(raw: string): ParsedQuestion {
  // Try to parse AskUserQuestion JSON format
  try {
    const data = JSON.parse(raw);
    if (data.questions && Array.isArray(data.questions) && data.questions.length > 0) {
      const q = data.questions[0];
      return {
        question: q.question || q.header || raw,
        options: (q.options || []).map((o: any) => ({
          label: typeof o === 'string' ? o : o.label || o.text || '',
          description: o.description,
        })),
      };
    }
    if (data.question) {
      return { question: data.question, options: (data.options || []).map((o: any) => ({ label: typeof o === 'string' ? o : o.label || '' })) };
    }
  } catch {}
  // Plain text
  return { question: raw, options: [] };
}

/**
 * Global escalation modal — appears when Claude calls `escalate_to_human` MCP tool.
 * Works for both Ralph and Teams.
 */
export function RalphInputModal() {
  const escalation = useAppStore((s) => s.escalation);
  const addToast = useToastStore((s) => s.addToast);
  const [response, setResponse] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (escalation) {
      setResponse('');
      setTimeout(() => inputRef.current?.focus(), 100);
      // Browser notification
      if (typeof Notification !== 'undefined') {
        if (Notification.permission === 'granted') {
          new Notification(`KANBAII — ${escalation.source === 'ralph' ? 'Ralph' : 'Teams'} needs input`, {
            body: escalation.question.slice(0, 120),
            icon: '/favicon.svg',
          });
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission();
        }
      }
    }
  }, [escalation]);

  if (!escalation) return null;
  // Planner escalations render inline in PlannerChat, not as a modal
  if ((escalation as any).source === 'planner') return null;

  const handleSend = async (text?: string) => {
    const value = text || response.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      await fetch(`${API}/api/escalation/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: escalation.id, response: value }),
      });
      addToast('Response sent to Claude', 'success');
    } catch {
      addToast('Failed to send response', 'error');
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const isRalph = escalation.source === 'ralph';
  const Icon = isRalph ? Cpu : Users;
  const label = isRalph ? 'Ralph' : 'Teams';

  // Parse AskUserQuestion JSON format
  const parsed = parseEscalationQuestion(escalation.question);
  const displayQuestion = parsed.question;
  const displayOptions = parsed.options.length > 0 ? parsed.options : escalation.options;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center animate-overlay-in"
         style={{ background: 'rgba(3, 3, 8, 0.85)', backdropFilter: 'blur(20px) saturate(180%)' }}>
      <div className="max-w-[520px] w-[94%] animate-spring-pop relative">
        {/* Pulsing border */}
        <div className="absolute -inset-px rounded-lg animate-breathe"
             style={{ background: isRalph
               ? 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(129,140,248,0.1), rgba(99,102,241,0.3))'
               : 'linear-gradient(135deg, rgba(16,185,129,0.3), rgba(52,211,153,0.1), rgba(16,185,129,0.3))',
             }} />

        <div className="relative bg-modal border border-glass-border rounded-lg shadow-modal overflow-hidden">
          {/* Top glow */}
          <div className="absolute top-0 left-[10%] right-[10%] h-px pointer-events-none"
               style={{ background: isRalph
                 ? 'linear-gradient(90deg, transparent, rgba(99,102,241,0.4), transparent)'
                 : 'linear-gradient(90deg, transparent, rgba(52,211,153,0.4), transparent)',
               }} />

          {/* Header */}
          <div className="flex items-center gap-3 px-6 pt-5 pb-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center animate-breathe
                             ${isRalph ? 'bg-accent-muted border border-accent/20' : 'bg-success-dim border border-success/20'}`}>
              <Icon size={16} className={isRalph ? 'text-accent' : 'text-success'} />
            </div>
            <div>
              <div className="text-sm font-semibold text-text tracking-tight">{label} needs your input</div>
              {escalation.taskTitle && (
                <div className="text-xxs text-text-muted font-mono mt-0.5">Task: {escalation.taskTitle}</div>
              )}
            </div>
          </div>

          {/* Question */}
          <div className="mx-6 mb-4 p-3 bg-bg border border-border rounded-md shadow-inset">
            <div className="text-sm text-text leading-relaxed">
              {displayQuestion}
            </div>
          </div>

          {/* Quick options (parsed from AskUserQuestion or manual) */}
          {displayOptions.length > 0 && (
            <div className="mx-6 mb-3 flex flex-col gap-1.5">
              {displayOptions.map((opt, i) => (
                <button
                  key={i}
                  className="flex flex-col gap-0.5 px-3 py-2.5 text-left rounded-sm border border-border
                             transition-all duration-150 hover:border-accent hover:bg-accent-muted group"
                  onClick={() => handleSend(typeof opt === 'string' ? opt : opt.label)}
                  disabled={sending}
                >
                  <span className="text-xs font-semibold text-text group-hover:text-accent transition-colors">
                    {typeof opt === 'string' ? opt : opt.label}
                  </span>
                  {typeof opt !== 'string' && opt.description && (
                    <span className="text-xxs text-text-muted leading-snug">{opt.description}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-6 pb-5">
            <textarea
              ref={inputRef}
              value={response}
              onChange={e => setResponse(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your response... (Enter to send)"
              rows={2}
              className="w-full resize-none text-xs"
              disabled={sending}
            />
            <div className="flex items-center gap-2 mt-3">
              <button
                className="inline-flex items-center gap-1.5 text-xxs text-text-muted font-mono px-3 py-1.5 rounded-sm border border-border
                           transition-all duration-150 hover:text-text-secondary hover:bg-surface-hover"
                onClick={() => handleSend('yes')}
                disabled={sending}
              >
                <SkipForward size={11} /> Skip (yes)
              </button>
              <button
                className="inline-flex items-center gap-1.5 text-xxs text-danger font-mono px-3 py-1.5 rounded-sm border border-danger/20
                           transition-all duration-150 hover:bg-danger-dim"
                onClick={async () => {
                  const endpoint = isRalph ? `${API}/api/ralph/stop` : `${API}/api/teams/stop`;
                  await fetch(endpoint, { method: 'POST' });
                  handleSend('STOP');
                  addToast(`${label} stopped`, 'info');
                }}
                disabled={sending}
              >
                <Square size={11} /> Stop {label}
              </button>
              <div className="flex-1" />
              <button
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-white text-xs font-semibold rounded-sm
                           bg-gradient-to-br ${isRalph ? 'from-indigo-600 to-indigo-400' : 'from-emerald-600 to-emerald-400'}
                           relative overflow-hidden
                           before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/15 before:to-transparent before:pointer-events-none
                           transition-all duration-150 hover:shadow-glow-accent hover:-translate-y-px disabled:opacity-40`}
                onClick={() => handleSend()}
                disabled={!response.trim() || sending}
              >
                {sending ? <span className="inline-block w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Send size={12} />}
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
