'use client';

import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useToastStore } from '@/stores/toastStore';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';

export function PlannerInput({ onRespondToEscalation }: { onRespondToEscalation: (response: string) => void }) {
  const active = useAppStore((s) => s.planner.active);
  const escalation = useAppStore((s) => s.planner.escalation);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasEscalation = !!escalation;
  const canType = hasEscalation;

  useEffect(() => {
    if (hasEscalation) inputRef.current?.focus();
  }, [hasEscalation]);

  const handleSubmit = () => {
    const text = value.trim();
    if (!text || !canType) return;
    onRespondToEscalation(text);
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!active) return null;

  return (
    <div className="px-4 py-3 border-t border-border/50 flex-shrink-0">
      <div className={`flex items-end gap-2 rounded-lg border px-3 py-2 transition-all duration-200
                        ${canType
                          ? 'border-accent/20 bg-surface/50 focus-within:border-accent/40 focus-within:shadow-[0_0_12px_rgba(99,102,241,0.06)]'
                          : 'border-border/30 bg-bg/50'}`}>
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!canType}
          placeholder={
            hasEscalation
              ? 'Type your response...'
              : 'Claude is working...'
          }
          className="flex-1 bg-transparent border-none text-body text-text resize-none max-h-[120px] min-h-[24px]
                     placeholder:text-text-muted/40 focus:outline-none disabled:opacity-40"
          rows={1}
        />
        <button
          onClick={handleSubmit}
          disabled={!canType || !value.trim()}
          className="w-7 h-7 flex items-center justify-center rounded-md flex-shrink-0
                     bg-accent/10 text-accent transition-all duration-150
                     hover:enabled:bg-accent/20 disabled:opacity-20"
        >
          <Send size={13} />
        </button>
      </div>
      {!hasEscalation && active && (
        <div className="flex items-center gap-2 mt-2 ml-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-breathe shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
          <span className="text-xxs font-mono text-emerald-400/60">Analyzing and planning — will ask when input is needed...</span>
        </div>
      )}
    </div>
  );
}
