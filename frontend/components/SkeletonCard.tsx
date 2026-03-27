'use client';

export default function SkeletonCard() {
  return (
    <div className="bg-card border border-border rounded-md px-3.5 py-3 mb-2 relative overflow-hidden">
      <div className="skeleton-shimmer" />
      <div className="skeleton-element h-4 w-3/4 rounded-xs mb-2.5" />
      <div className="flex gap-1.5 mb-2.5">
        <div className="skeleton-element h-5 w-[50px] rounded-[10px]" />
        <div className="skeleton-element h-5 w-[60px] rounded-[10px]" />
      </div>
      <div className="flex justify-between items-center">
        <div className="skeleton-element h-3 w-10 rounded-[3px]" />
        <div className="skeleton-element h-3 w-[60px] rounded-[3px]" />
      </div>
    </div>
  );
}
