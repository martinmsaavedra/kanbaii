// Theme utilities for components that need programmatic access
// Most theming is done via CSS variables in globals.css

export const theme = {
  colors: {
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    urgent: '#f43f5e',
  },
  radius: {
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
  },
  font: {
    sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  transition: {
    fast: '150ms ease',
    normal: '250ms ease',
    slow: '350ms ease',
  },
} as const;

export const getCSSVar = (varName: string) => {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
};

export const priorityColors: Record<string, string> = {
  low: '#71717a',
  medium: '#6366f1',
  high: '#f59e0b',
  urgent: '#f43f5e',
};

export const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
  feature: {
    bg: 'rgba(99, 102, 241, 0.12)',
    text: '#6366f1',
    border: 'rgba(99, 102, 241, 0.25)',
  },
  bug: {
    bg: 'rgba(239, 68, 68, 0.12)',
    text: '#ef4444',
    border: 'rgba(239, 68, 68, 0.25)',
  },
  refactor: {
    bg: 'rgba(245, 158, 11, 0.12)',
    text: '#f59e0b',
    border: 'rgba(245, 158, 11, 0.25)',
  },
};

export const agentColors: Record<string, { bg: string; text: string; border: string }> = {
  CoderAgent: {
    bg: 'rgba(59, 130, 246, 0.12)',
    text: '#3b82f6',
    border: 'rgba(59, 130, 246, 0.25)',
  },
  TesterAgent: {
    bg: 'rgba(34, 197, 94, 0.12)',
    text: '#22c55e',
    border: 'rgba(34, 197, 94, 0.25)',
  },
  ReviewerAgent: {
    bg: 'rgba(168, 85, 247, 0.12)',
    text: '#a855f7',
    border: 'rgba(168, 85, 247, 0.25)',
  },
  DocAgent: {
    bg: 'rgba(107, 114, 128, 0.12)',
    text: '#6b7280',
    border: 'rgba(107, 114, 128, 0.25)',
  },
  SecurityAgent: {
    bg: 'rgba(239, 68, 68, 0.12)',
    text: '#ef4444',
    border: 'rgba(239, 68, 68, 0.25)',
  },
};
