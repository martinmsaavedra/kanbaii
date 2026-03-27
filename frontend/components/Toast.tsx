'use client';

import { useToastStore } from '@/stores/toastStore';
import { X, Check, AlertTriangle, Info } from 'lucide-react';

const TYPE_CONFIG = {
  success: { accent: 'border-l-success', iconColor: 'text-success', icon: <Check size={14} /> },
  error:   { accent: 'border-l-danger',  iconColor: 'text-danger',  icon: <AlertTriangle size={14} /> },
  info:    { accent: 'border-l-accent',   iconColor: 'text-accent',  icon: <Info size={14} /> },
} as const;

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-1.5 z-[400] pointer-events-none">
      {toasts.map((toast, i) => {
        const cfg = TYPE_CONFIG[toast.type as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.info;
        const isStacked = i < toasts.length - 1;
        return (
          <div
            key={toast.id}
            className={`bg-glass backdrop-blur-[16px] backdrop-saturate-[160%] border border-glass-border rounded-md
                        px-3.5 py-2.5 text-xs font-medium text-text shadow-elevated
                        flex items-center gap-2.5 animate-toast-in pointer-events-auto min-w-[220px]
                        relative overflow-hidden border-l-2 ${cfg.accent}
                        transition-all duration-200 ease-out-expo
                        ${isStacked ? 'scale-[0.97] opacity-80' : ''}`}
          >
            {/* Top glow edge */}
            <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent pointer-events-none" />
            <span className={`flex flex-shrink-0 ${cfg.iconColor}`}>{cfg.icon}</span>
            <span className="flex-1">{toast.message}</span>
            <button
              className="text-text-muted p-0.5 flex rounded-xs transition-all duration-120 ease-out-expo hover:text-text hover:bg-surface-hover"
              onClick={() => removeToast(toast.id)}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
