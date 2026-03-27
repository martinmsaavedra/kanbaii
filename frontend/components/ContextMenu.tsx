'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
  confirmLabel?: string;
}

export interface ContextMenuSection {
  items: ContextMenuItem[];
}

interface ContextMenuProps {
  x: number;
  y: number;
  sections: ContextMenuSection[];
  onClose: () => void;
}

export function ContextMenu({ x, y, sections, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Adjust position to stay within viewport
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const newX = x + rect.width > window.innerWidth ? x - rect.width : x;
    const newY = y + rect.height > window.innerHeight ? y - rect.height : y;
    setPos({ x: Math.max(4, newX), y: Math.max(4, newY) });
  }, [x, y]);

  // Close on click outside or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed min-w-[160px] bg-glass backdrop-blur-glass backdrop-saturate-[180%]
                 border border-glass-border rounded-lg shadow-elevated z-[500]
                 py-1 overflow-hidden animate-spring-pop"
      style={{ left: pos.x, top: pos.y }}
    >
      {/* Luminescent top edge */}
      <div className="absolute top-0 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-[rgba(129,140,248,0.12)] to-transparent pointer-events-none" />

      {sections.map((section, si) => (
        <div key={si}>
          {si > 0 && <div className="h-px mx-2 my-1 bg-border" />}
          {section.items.map((item, ii) => {
            const id = `${si}-${ii}`;
            const isConfirming = confirmId === id;
            const isDanger = item.variant === 'danger';

            return (
              <button
                key={id}
                className={`w-full flex items-center gap-2.5 px-3 py-[7px] text-xs text-left
                            transition-colors duration-75 ease-out-expo
                            ${isConfirming
                              ? 'text-danger bg-danger-dim'
                              : isDanger
                                ? 'text-danger hover:bg-danger-dim'
                                : 'text-text-secondary hover:bg-surface-hover hover:text-text'
                            }`}
                onClick={() => {
                  if (isDanger && item.confirmLabel && !isConfirming) {
                    setConfirmId(id);
                    setTimeout(() => setConfirmId(null), 3000);
                    return;
                  }
                  item.onClick();
                  onClose();
                }}
              >
                {item.icon && <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">{item.icon}</span>}
                <span>{isConfirming && item.confirmLabel ? item.confirmLabel : item.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// Hook for triggering context menu on right-click
export function useContextMenu() {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  return { menu, onContextMenu, closeMenu };
}
