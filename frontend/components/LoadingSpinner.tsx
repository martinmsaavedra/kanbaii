'use client';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'small' | 'medium' | 'large';
  variant?: 'spinner' | 'bar' | 'dots';
}

const SIZE_CLASSES = {
  small:  { container: 'min-h-20', spinner: 'w-6 h-6', fontSize: 'text-data' },
  medium: { container: 'min-h-[120px]', spinner: 'w-8 h-8', fontSize: 'text-xs' },
  large:  { container: 'min-h-40', spinner: 'w-12 h-12', fontSize: 'text-sm' },
};

export default function LoadingSpinner({ message = 'Loading...', size = 'medium', variant = 'spinner' }: LoadingSpinnerProps) {
  const cls = SIZE_CLASSES[size];

  if (variant === 'spinner') {
    return (
      <div className={`flex flex-col items-center justify-center gap-4 px-5 py-10 ${cls.container}`}>
        <div className={`relative ${cls.spinner}`}>
          <div className="absolute w-full h-full rounded-full border-2 border-transparent border-t-[var(--accent-hover)] border-r-[var(--accent-hover)] animate-spin" />
          <div className="absolute top-[15%] left-[15%] w-[70%] h-[70%] rounded-full border-2 border-transparent border-t-accent border-l-accent animate-[spin_0.8s_cubic-bezier(0.4,0,0.2,1)_infinite_reverse]" />
          <div className="absolute top-[35%] left-[35%] w-[30%] h-[30%] rounded-full bg-gradient-to-br from-[var(--accent-hover)] to-accent animate-pulse shadow-[0_0_20px_rgba(99,102,241,0.4)]" />
        </div>
        {message && <div className={`font-semibold text-[var(--accent-hover)] tracking-[0.08em] uppercase animate-pulse text-center font-mono ${cls.fontSize}`}>{message}</div>}
      </div>
    );
  }

  if (variant === 'bar') {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 px-5 py-10 ${cls.container}`}>
        <div className="w-full max-w-60 h-[3px] rounded-[3px] bg-[rgba(99,102,241,0.08)] overflow-hidden relative">
          <div className="absolute top-0 left-0 h-full w-[40%] bg-gradient-to-r from-transparent via-[var(--accent-hover)] to-transparent rounded-[3px] animate-[barSlide_1.5s_ease-in-out_infinite] shadow-[0_0_12px_rgba(99,102,241,0.5)]" />
        </div>
        {message && <div className={`font-semibold text-[var(--accent-hover)] tracking-[0.08em] uppercase animate-pulse text-center font-mono ${cls.fontSize}`}>{message}</div>}
      </div>
    );
  }

  if (variant === 'dots') {
    return (
      <div className={`flex flex-col items-center justify-center gap-4 px-5 py-10 ${cls.container}`}>
        <div className="flex gap-2.5 items-center">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-[var(--accent-hover)] to-accent animate-[dotBounce_1.4s_ease-in-out_infinite] shadow-[0_0_10px_rgba(99,102,241,0.4)]"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
        {message && <div className={`font-semibold text-[var(--accent-hover)] tracking-[0.08em] uppercase animate-pulse text-center font-mono ${cls.fontSize}`}>{message}</div>}
      </div>
    );
  }

  return null;
}
