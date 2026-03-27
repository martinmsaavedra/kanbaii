'use client';
import SkeletonCard from './SkeletonCard';

export default function SkeletonColumn({ cardCount = 3 }: { cardCount?: number }) {
  return (
    <div className="flex-1 min-w-[220px] flex flex-col gap-3">
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="skeleton-element h-3.5 w-20 rounded-xs" />
          <div className="skeleton-element h-[18px] w-6 rounded-[10px]" />
        </div>
      </div>
      <div className="flex flex-col">
        {Array.from({ length: cardCount }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  );
}
