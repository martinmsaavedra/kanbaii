'use client';

import { useEffect, useRef } from 'react';
import { useAppStore, PlannerMessage } from '@/stores/appStore';

function MessageBubble({ msg }: { msg: PlannerMessage }) {
  if (msg.role === 'system') {
    return (
      <div className="flex justify-center animate-fade-in-up">
        <span className="text-xxs font-mono text-text-muted/40 bg-surface/50 px-3 py-1 rounded-full">
          {msg.content}
        </span>
      </div>
    );
  }

  if (msg.role === 'escalation') {
    const isResponded = !!msg.respondedWith;
    return (
      <div className="animate-fade-in-up">
        <div className={`rounded-lg border p-4 transition-all duration-300
                         ${isResponded
                           ? 'border-border/50 bg-surface/30'
                           : 'border-accent/15 bg-accent/[0.04] shadow-[0_0_12px_rgba(99,102,241,0.06)]'}`}>
          <div className="flex items-center gap-2 mb-2.5">
            {!isResponded && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-breathe" />
            )}
            <span className="text-[9px] font-mono text-accent/70 uppercase tracking-widest">
              {isResponded ? 'Answered' : 'Claude needs your input'}
            </span>
          </div>
          <p className="text-body text-text leading-relaxed mb-3">{msg.content}</p>
          {msg.options && msg.options.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {msg.options.map((opt) => (
                <span
                  key={opt}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all duration-150
                              ${msg.respondedWith === opt
                                ? 'border-accent/30 bg-accent/10 text-accent'
                                : isResponded
                                  ? 'border-border/30 bg-transparent text-text-muted/40'
                                  : 'border-accent/20 bg-accent/[0.06] text-accent/80 cursor-pointer hover:bg-accent/10 hover:border-accent/30'}`}
                >
                  {opt}
                </span>
              ))}
            </div>
          )}
          {isResponded && msg.respondedWith && !msg.options?.includes(msg.respondedWith) && (
            <div className="mt-2 text-xs text-accent/70 font-mono">
              → {msg.respondedWith}
            </div>
          )}
        </div>
      </div>
    );
  }

  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-2.5 items-start animate-fade-in-up ${isUser ? '' : ''}`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-semibold
                        ${isUser
                          ? 'bg-accent/15 text-accent'
                          : 'bg-accent/20 text-accent'}`}>
        {isUser
          ? 'U'
          : <div className="w-2.5 h-2.5 bg-gradient-to-br from-indigo-400 to-indigo-600 rounded-sm" />
        }
      </div>
      <div className={`rounded-lg border px-3.5 py-2.5 max-w-[85%] text-body leading-relaxed
                        ${isUser
                          ? 'bg-surface/50 border-border/50 text-text'
                          : 'bg-accent/[0.03] border-accent/10 text-text-secondary'}`}>
        <div className="whitespace-pre-wrap">{msg.content}</div>
      </div>
    </div>
  );
}

export function PlannerChat({ onRespondToEscalation }: { onRespondToEscalation: (response: string) => void }) {
  const messages = useAppStore((s) => s.planner.messages);
  const escalation = useAppStore((s) => s.planner.escalation);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} msg={msg} />
      ))}
      {/* Active escalation — clickable options */}
      {escalation && (
        <div className="animate-fade-in-up">
          <div className="flex flex-wrap gap-1.5 mt-1 ml-8">
            {escalation.options.map((opt) => (
              <button
                key={opt}
                onClick={() => onRespondToEscalation(opt)}
                className="px-3 py-1.5 rounded-md text-xs font-medium border
                           border-accent/20 bg-accent/[0.06] text-accent/80
                           cursor-pointer hover:bg-accent/10 hover:border-accent/30
                           transition-all duration-150 ease-out-expo"
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
