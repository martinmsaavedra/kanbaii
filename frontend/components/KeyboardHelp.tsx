'use client';

import { X } from 'lucide-react';
import { useModalOverlay } from '@/hooks/useModalOverlay';

const SECTIONS = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['\u2191', '\u2193'], desc: 'Previous / next project' },
      { keys: ['B'], desc: 'Board view' },
      { keys: ['C'], desc: 'Console / Terminal' },
      { keys: ['R'], desc: 'Ralph / Agents' },
      { keys: ['S'], desc: 'Soul' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['N'], desc: 'New task' },
      { keys: ['Ctrl', 'F'], desc: 'Toggle filter bar' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: ['H'], desc: 'Show this help' },
      { keys: ['Esc'], desc: 'Close modal / go back' },
    ],
  },
];

interface Props {
  onClose: () => void;
}

export function KeyboardHelp({ onClose }: Props) {
  const { overlayProps } = useModalOverlay(onClose);

  return (
    <div className="glass-overlay" {...overlayProps}>
      <div className="modal-box w-[400px] max-w-[90%] p-7" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <span className="text-h2 font-semibold tracking-tight">Keyboard Shortcuts</span>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="flex flex-col gap-[22px]">
          {SECTIONS.map((section) => (
            <div key={section.title} className="flex flex-col gap-1.5">
              <div className="text-xxs font-semibold text-text-muted uppercase tracking-widest font-mono mb-1">{section.title}</div>
              {section.shortcuts.map((s) => (
                <div key={s.desc} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-[3px]">
                    {s.keys.map((k, i) => (
                      <span key={i}>
                        <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-[7px]
                          bg-[rgba(148,163,242,0.04)] border border-[rgba(148,163,242,0.08)] border-b-2 border-b-[rgba(148,163,242,0.1)]
                          rounded-[5px] text-[10px] font-semibold text-text font-mono">
                          {k}
                        </kbd>
                        {i < s.keys.length - 1 && <span className="text-xxs text-text-muted opacity-50">+</span>}
                      </span>
                    ))}
                  </div>
                  <span className="text-xs text-text-secondary">{s.desc}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
