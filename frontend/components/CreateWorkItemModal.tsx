'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { useWorkItemStore } from '@/stores/workItemStore';
import { useRouterStore } from '@/stores/routerStore';
import { useModalOverlay } from '@/hooks/useModalOverlay';

const CATEGORIES = [
  { key: 'feature', icon: '\u2726', label: 'Feature', desc: 'New functionality', color: '#6366f1' },
  { key: 'bug',     icon: '\u25CF', label: 'Bug',     desc: 'Fix a defect',      color: '#ef4444' },
  { key: 'refactor',icon: '\u25C6', label: 'Refactor', desc: 'Improve existing code', color: '#f59e0b' },
] as const;

interface Props {
  projectSlug: string;
  onClose: () => void;
}

export function CreateWorkItemModal({ projectSlug, onClose }: Props) {
  const createWorkItem = useWorkItemStore((s) => s.createWorkItem);
  const goToWorkItem = useRouterStore((s) => s.goToWorkItem);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'feature' | 'bug' | 'refactor'>('feature');
  const [loading, setLoading] = useState(false);
  const { overlayProps } = useModalOverlay(onClose);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    try {
      const wi = await createWorkItem(projectSlug, { title: title.trim(), category });
      onClose();
      goToWorkItem(projectSlug, wi.slug);
    } catch {
      setLoading(false);
    }
  };

  return (
    <div className="glass-overlay" {...overlayProps}>
      <div className="modal-box w-[520px] max-w-[92%] p-7" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-7">
          <span className="text-h2 font-semibold tracking-tight text-text">New Work Item</span>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <form className="flex flex-col gap-[22px]" onSubmit={handleSubmit}>
          {/* Category selector */}
          <div className="flex flex-col">
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2 font-mono">Category</label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  className={`flex flex-col items-center gap-2 py-[22px] px-3 pb-[18px]
                    bg-transparent border border-border rounded-md cursor-pointer
                    transition-all duration-250 ease-out-expo text-center relative
                    before:content-[''] before:absolute before:top-0 before:left-[20%] before:right-[20%] before:h-px
                    before:bg-gradient-to-r before:from-transparent before:via-white/[0.03] before:to-transparent before:pointer-events-none
                    hover:border-border-light hover:bg-surface-hover hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.2)]
                    ${category === cat.key ? 'border-[1.5px]' : ''}`}
                  style={{
                    '--cat-color': cat.color,
                    borderColor: category === cat.key ? cat.color : undefined,
                    background: category === cat.key ? `${cat.color}12` : undefined,
                  } as React.CSSProperties}
                  onClick={() => setCategory(cat.key)}
                >
                  <span className="text-[22px]" style={{ color: cat.color }}>{cat.icon}</span>
                  <span className="text-body font-semibold text-text tracking-tight">{cat.label}</span>
                  <span className="text-[10px] text-text-muted leading-snug">{cat.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div className="flex flex-col">
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2 font-mono">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                category === 'feature' ? 'e.g. Auth System, Payment Integration...' :
                category === 'bug' ? 'e.g. Login fails on mobile, API timeout...' :
                'e.g. Extract API utils, Normalize DB schema...'
              }
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-2 pt-1.5">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!title.trim() || loading}>
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
