'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const MODELS = ['haiku', 'sonnet', 'opus'] as const;

export interface FilterState {
  search: string;
  tags: string[];
  priorities: string[];
  models: string[];
}

const EMPTY_FILTER: FilterState = { search: '', tags: [], priorities: [], models: [] };

export function isFiltered(filter: FilterState): boolean {
  return filter.search !== '' || filter.tags.length > 0 || filter.priorities.length > 0 || filter.models.length > 0;
}

export function matchesFilter(task: any, filter: FilterState): boolean {
  if (filter.search) {
    const q = filter.search.toLowerCase();
    const matches = task.title?.toLowerCase().includes(q) || task.description?.toLowerCase().includes(q);
    if (!matches) return false;
  }
  if (filter.tags.length > 0) {
    const taskTags = task.tags || [];
    if (!filter.tags.some((t: string) => taskTags.includes(t))) return false;
  }
  if (filter.priorities.length > 0) {
    if (!filter.priorities.includes(task.priority)) return false;
  }
  if (filter.models.length > 0) {
    if (!filter.models.includes(task.model)) return false;
  }
  return true;
}

interface Props {
  filter: FilterState;
  onChange: (filter: FilterState) => void;
  allTags: string[];
  totalCount: number;
  filteredCount: number;
}

export function FilterBar({ filter, onChange, allTags, totalCount, filteredCount }: Props) {
  const [tagOpen, setTagOpen] = useState(false);

  const toggleTag = (tag: string) => {
    const tags = filter.tags.includes(tag)
      ? filter.tags.filter((t) => t !== tag)
      : [...filter.tags, tag];
    onChange({ ...filter, tags });
  };

  const togglePriority = (p: string) => {
    const priorities = filter.priorities.includes(p)
      ? filter.priorities.filter((x) => x !== p)
      : [...filter.priorities, p];
    onChange({ ...filter, priorities });
  };

  const toggleModel = (m: string) => {
    const models = filter.models.includes(m)
      ? filter.models.filter((x) => x !== m)
      : [...filter.models, m];
    onChange({ ...filter, models });
  };

  const clear = () => onChange(EMPTY_FILTER);
  const active = isFiltered(filter);

  return (
    <div className="flex items-center gap-3 px-4 py-2 animate-filter-in flex-wrap">
      {/* Search */}
      <div className="flex items-center gap-2 bg-input border border-input-border rounded-sm px-2.5 py-1.5 flex-1 min-w-[180px] max-w-[260px]">
        <Search size={14} className="text-text-muted flex-shrink-0" />
        <input
          className="bg-transparent border-none outline-none text-xs text-text placeholder:text-text-muted p-0 w-full shadow-none"
          value={filter.search}
          onChange={(e) => onChange({ ...filter, search: e.target.value })}
          placeholder="Search tasks..."
          autoFocus
        />
      </div>

      {/* Priority pills */}
      <div className="flex items-center gap-1">
        {PRIORITIES.map((p) => (
          <button
            key={p}
            className={`px-2.5 py-1 rounded-full text-xxs font-medium border capitalize transition-all duration-150 ease-out-expo
                         ${filter.priorities.includes(p)
                           ? 'bg-accent-muted border-accent/30 text-accent shadow-[0_0_8px_rgba(99,102,241,0.1)]'
                           : 'bg-surface border-border text-text-secondary hover:border-border-light hover:text-text'
                         }`}
            onClick={() => togglePriority(p)}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Model pills */}
      <div className="flex items-center gap-1">
        {MODELS.map((m) => (
          <button
            key={m}
            className={`px-2.5 py-1 rounded-full text-xxs font-medium border capitalize transition-all duration-150 ease-out-expo
                         ${filter.models.includes(m)
                           ? 'bg-accent-muted border-accent/30 text-accent shadow-[0_0_8px_rgba(99,102,241,0.1)]'
                           : 'bg-surface border-border text-text-secondary hover:border-border-light hover:text-text'
                         }`}
            onClick={() => toggleModel(m)}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Tags dropdown */}
      {allTags.length > 0 && (
        <div className="relative">
          <button
            className={`px-2.5 py-1 rounded-full text-xxs font-medium border transition-all duration-150 ease-out-expo
                         ${filter.tags.length > 0
                           ? 'bg-accent-muted border-accent/30 text-accent'
                           : 'bg-surface border-border text-text-secondary hover:border-border-light'
                         }`}
            onClick={() => setTagOpen(!tagOpen)}
          >
            Tags {filter.tags.length > 0 && `(${filter.tags.length})`}
          </button>
          {tagOpen && (
            <div className="absolute top-full mt-1 left-0 min-w-[140px] bg-glass backdrop-blur-glass border border-glass-border
                            rounded-md shadow-elevated z-50 py-1 animate-filter-in">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors duration-100
                              ${filter.tags.includes(tag)
                                ? 'text-accent bg-accent-muted'
                                : 'text-text-secondary hover:bg-surface-hover hover:text-text'
                              }`}
                  onClick={() => toggleTag(tag)}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Count + clear */}
      <div className="flex items-center gap-2 ml-auto">
        {active && (
          <>
            <span className="text-data font-mono text-text-muted">{filteredCount}/{totalCount}</span>
            <button
              className="flex items-center gap-1 text-xxs text-text-muted hover:text-danger transition-colors duration-120"
              onClick={clear}
            >
              <X size={12} /> Clear
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export { EMPTY_FILTER };
