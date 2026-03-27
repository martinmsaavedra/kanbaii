'use client';

import { useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { useWorkItemStore, WorkItem } from '@/stores/workItemStore';
import { useModalOverlay } from '@/hooks/useModalOverlay';

const STATUSES = [
  { key: 'planning', label: 'Planning' },
  { key: 'active', label: 'Active' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
] as const;

interface Props { projectSlug: string; workItem: WorkItem; onClose: () => void; }

export function EditWorkItemModal({ projectSlug, workItem, onClose }: Props) {
  const { updateWorkItem, deleteWorkItem } = useWorkItemStore();
  const [title, setTitle] = useState(workItem.title);
  const [status, setStatus] = useState(workItem.status);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { overlayProps } = useModalOverlay(onClose, { disabled: loading });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    try {
      await updateWorkItem(projectSlug, workItem.slug, {
        ...(title.trim() !== workItem.title ? { title: title.trim() } : {}),
        ...(status !== workItem.status ? { status } : {}),
      });
      onClose();
    } catch { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setLoading(true);
    try { await deleteWorkItem(projectSlug, workItem.slug); onClose(); }
    catch { setLoading(false); }
  };

  return (
    <div className="glass-overlay" {...overlayProps}>
      <div className="modal-box w-[520px] max-w-[92%] p-7" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-7">
          <span className="text-h2 font-semibold tracking-tight text-text">Edit Work Item</span>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <form className="flex flex-col gap-[22px]" onSubmit={handleSave}>
          <div className="flex flex-col">
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2 font-mono">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>

          <div className="flex flex-col">
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2 font-mono">Status</label>
            <div className="grid grid-cols-4 gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={`flex items-center justify-center py-2.5 px-2 bg-transparent
                    border border-border rounded-md cursor-pointer transition-all duration-250 ease-out-expo
                    text-xs font-medium text-text-secondary
                    hover:border-border-light hover:bg-surface-hover
                    ${status === s.key ? 'border-[rgba(99,102,241,0.25)] bg-accent-muted text-accent' : ''}`}
                  onClick={() => setStatus(s.key as WorkItem['status'])}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col">
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2 font-mono">Category</label>
            <span className={`badge badge-${workItem.category} self-start`}>
              {workItem.category}
            </span>
          </div>

          <div className="flex justify-between gap-2 pt-1.5">
            <button type="button" className="btn-danger" onClick={handleDelete} disabled={loading}>
              <Trash2 size={14} />
              {confirmDelete ? 'Confirm delete?' : 'Delete'}
            </button>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={!title.trim() || loading}>
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
