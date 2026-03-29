'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { useModalOverlay } from '@/hooks/useModalOverlay';
import { useRouterStore } from '@/stores/routerStore';
import { api } from '@/lib/api';

const COLORS = ['#6366f1', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

interface Props {
  onClose: () => void;
}

export function CreateProjectModal({ onClose }: Props) {
  const goToProject = useRouterStore((s) => s.goToProject);
  const createProject = useProjectStore((s) => s.createProject);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [workingDir, setWorkingDir] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [loading, setLoading] = useState(false);
  const { overlayProps } = useModalOverlay(onClose, { disabled: loading });

  // Pre-fill workingDir with server's cwd
  useEffect(() => {
    api.getHealth().then((h) => {
      if (h.cwd && !workingDir) setWorkingDir(h.cwd);
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    try {
      const project = await createProject({
        title: title.trim(),
        description: description.trim() || undefined,
        color,
        workingDir: workingDir.trim() || undefined,
      });
      onClose();
      goToProject(project.slug);
    } catch {
      setLoading(false);
    }
  };

  return (
    <div className="glass-overlay" {...overlayProps}>
      <div className="modal-box w-[440px] max-w-[92%] p-7" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-7">
          <span className="text-h2 font-semibold tracking-tight">New Project</span>
          <button className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <div className="flex flex-col">
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2 font-mono">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Project name..."
              autoFocus
            />
          </div>

          <div className="flex flex-col">
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2 font-mono">Description (optional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description..."
            />
          </div>

          <div className="flex flex-col">
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2 font-mono">Working Directory</label>
            <input
              value={workingDir}
              onChange={(e) => setWorkingDir(e.target.value)}
              placeholder="C:\Users\...\my-project"
            />
            <span className="text-[10px] text-text-muted mt-1 opacity-60">Where Claude runs commands. Defaults to where kanbaii was started.</span>
          </div>

          <div className="flex flex-col">
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2 font-mono">Color</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`w-6 h-6 rounded-full border-2 cursor-pointer transition-all duration-150 ease-out-expo
                    ${color === c ? 'border-text shadow-[0_0_8px_currentColor]' : 'border-transparent shadow-[0_0_0_0_transparent]'}
                    hover:scale-[1.2] hover:shadow-[0_0_12px_currentColor]`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={!title.trim() || loading}>
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
