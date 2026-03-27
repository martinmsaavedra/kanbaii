'use client';

export default function SkeletonSidebar({ itemCount = 5 }: { itemCount?: number }) {
  return (
    <aside className="w-60 shrink-0 border-r border-border bg-surface flex flex-col overflow-hidden relative z-10">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between shrink-0 min-h-12 border-b border-border">
        <div className="skeleton-element h-3.5 w-20 rounded-xs" />
      </div>
      <div className="px-4 pt-4 pb-2">
        <div className="skeleton-element h-2.5 w-[60px] rounded-[3px]" />
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4">
        {Array.from({ length: itemCount }).map((_, i) => (
          <div key={i} className="p-2 mb-1 rounded-sm flex items-center gap-2 relative overflow-hidden">
            <div className="skeleton-shimmer" />
            <div className="skeleton-element w-2 h-2 rounded-full shrink-0" />
            <div className="flex-1 flex flex-col gap-1">
              <div className="skeleton-element h-[13px] w-4/5 rounded-xs" />
              <div className="skeleton-element h-2.5 w-1/2 rounded-[3px]" />
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border shrink-0 px-4 py-3">
        <div className="skeleton-element h-8 w-full rounded-md" />
      </div>
    </aside>
  );
}
