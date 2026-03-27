'use client';

import { useState, useEffect, useRef } from 'react';
import { Cpu, Users, Send, SkipForward } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useToastStore } from '@/stores/toastStore';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';

/**
 * Global modal that appears when Ralph OR Teams Claude process asks a question.
 * Detects source automatically and sends response to correct endpoint.
 */
export function RalphInputModal() {
  const ralphInput = useAppStore((s) => s.ralph.inputNeeded);
  const teamsInput = useAppStore((s) => s.teams.inputNeeded);
  const clearRalphInput = useAppStore((s) => s.clearRalphInput);
  const clearTeamsInput = useAppStore((s) => s.clearTeamsInput);
  const addToast = useToastStore((s) => s.addToast);
  const [response, setResponse] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Determine which input request to show (Ralph takes priority if both)
  const inputNeeded = ralphInput || teamsInput;
  const source: 'ralph' | 'teams' = ralphInput ? 'ralph' : 'teams';
  const workerId = teamsInput?.workerId || '';

  useEffect(() => {
    if (inputNeeded) {
      setResponse('');
      setTimeout(() => inputRef.current?.focus(), 100);
      // Browser notification
      if (typeof Notification !== 'undefined') {
        if (Notification.permission === 'granted') {
          new Notification(`KANBAII — ${source === 'ralph' ? 'Ralph' : 'Teams'} needs input`, {
            body: inputNeeded.context.slice(0, 100),
            icon: '/favicon.svg',
          });
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission();
        }
      }
    }
  }, [inputNeeded, source]);

  if (!inputNeeded) return null;

  const handleSend = async () => {
    if (!response.trim() || sending) return;
    setSending(true);
    try {
      const endpoint = source === 'ralph'
        ? `${API}/api/ralph/input`
        : `${API}/api/teams/input`;
      const body = source === 'ralph'
        ? { text: response.trim() }
        : { workerId, text: response.trim() };

      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      addToast('Response sent', 'success');
      source === 'ralph' ? clearRalphInput() : clearTeamsInput();
    } catch {
      addToast('Failed to send response', 'error');
    }
    setSending(false);
  };

  const handleSkip = async () => {
    setSending(true);
    try {
      const endpoint = source === 'ralph' ? `${API}/api/ralph/input` : `${API}/api/teams/input`;
      const body = source === 'ralph' ? { text: 'yes' } : { workerId, text: 'yes' };
      await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      source === 'ralph' ? clearRalphInput() : clearTeamsInput();
    } catch {}
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const Icon = source === 'ralph' ? Cpu : Users;
  const label = source === 'ralph' ? 'Ralph' : 'Teams';
  const accentFrom = source === 'ralph' ? 'from-indigo-600' : 'from-emerald-600';
  const accentTo = source === 'ralph' ? 'to-indigo-400' : 'to-emerald-400';

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center animate-overlay-in"
         style={{ background: 'rgba(3, 3, 8, 0.85)', backdropFilter: 'blur(20px) saturate(180%)' }}>
      <div className="max-w-[520px] w-[94%] animate-spring-pop relative">
        {/* Pulsing border */}
        <div className="absolute -inset-px rounded-lg animate-breathe"
             style={{ background: source === 'ralph'
               ? 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(129,140,248,0.1), rgba(99,102,241,0.3))'
               : 'linear-gradient(135deg, rgba(16,185,129,0.3), rgba(52,211,153,0.1), rgba(16,185,129,0.3))',
             }} />

        <div className="relative bg-modal border border-glass-border rounded-lg shadow-modal overflow-hidden">
          {/* Top glow */}
          <div className="absolute top-0 left-[10%] right-[10%] h-px pointer-events-none"
               style={{ background: source === 'ralph'
                 ? 'linear-gradient(90deg, transparent, rgba(99,102,241,0.4), transparent)'
                 : 'linear-gradient(90deg, transparent, rgba(52,211,153,0.4), transparent)',
               }} />

          {/* Header */}
          <div className="flex items-center gap-3 px-6 pt-5 pb-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center animate-breathe
                             ${source === 'ralph' ? 'bg-accent-muted border border-accent/20' : 'bg-success-dim border border-success/20'}`}>
              <Icon size={16} className={source === 'ralph' ? 'text-accent' : 'text-success'} />
            </div>
            <div>
              <div className="text-sm font-semibold text-text tracking-tight">{label} needs your input</div>
              <div className="text-xxs text-text-muted font-mono mt-0.5">Task: {inputNeeded.taskTitle}</div>
            </div>
          </div>

          {/* Context */}
          <div className="mx-6 mb-4 p-3 bg-bg border border-border rounded-md shadow-inset">
            <div className="text-xs text-text-secondary font-mono leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-y-auto">
              {inputNeeded.context}
            </div>
          </div>

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
                onClick={handleSkip}
                disabled={sending}
              >
                <SkipForward size={11} /> Skip (yes)
              </button>
              <div className="flex-1" />
              <button
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-white text-xs font-semibold rounded-sm
                           bg-gradient-to-br ${accentFrom} ${accentTo} relative overflow-hidden
                           before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/15 before:to-transparent before:pointer-events-none
                           transition-all duration-150 hover:shadow-glow-accent hover:-translate-y-px disabled:opacity-40`}
                onClick={handleSend}
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
