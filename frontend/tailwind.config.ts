import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './contexts/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './stores/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      /* ─── Colors ─── */
      colors: {
        bg: {
          DEFAULT: 'var(--bg)',
          subtle: 'var(--bg-subtle)',
        },
        surface: {
          DEFAULT: 'var(--surface)',
          hover: 'var(--surface-hover)',
          elevated: 'var(--surface-elevated)',
        },
        card: 'var(--card-bg)',
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          dim: 'var(--accent-dim)',
          muted: 'var(--accent-muted)',
          glow: 'var(--accent-glow)',
        },
        text: {
          DEFAULT: 'var(--text)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        border: {
          DEFAULT: 'var(--border)',
          light: 'var(--border-light)',
          focus: 'var(--border-focus)',
          glow: 'var(--border-glow)',
        },
        glass: {
          DEFAULT: 'var(--glass)',
          border: 'var(--glass-border)',
        },
        overlay: 'var(--overlay-bg)',
        modal: {
          DEFAULT: 'var(--modal-bg)',
          border: 'var(--modal-border)',
        },
        input: {
          DEFAULT: 'var(--input-bg)',
          border: 'var(--input-border)',
        },
        pill: 'var(--pill-bg)',
        success: {
          DEFAULT: 'var(--success)',
          dim: 'var(--success-dim)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          dim: 'var(--warning-dim)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          dim: 'var(--danger-dim)',
        },
        info: 'var(--info)',
        feature: 'var(--feature)',
        bug: 'var(--bug)',
        refactor: 'var(--refactor)',
        priority: {
          urgent: 'var(--priority-urgent)',
          high: 'var(--priority-high)',
          medium: 'var(--priority-medium)',
          low: 'var(--priority-low)',
        },
        agent: {
          coder: '#818cf8',
          reviewer: '#34d399',
          planner: '#fbbf24',
          tester: '#f472b6',
          default: '#a78bfa',
        },
      },

      /* ─── Font Family ─── */
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'SF Mono', 'monospace'],
      },

      /* ─── Font Size ─── */
      fontSize: {
        'xxs': ['9px', { lineHeight: '1.4', letterSpacing: '0.04em' }],
        'data': ['10px', { lineHeight: '1.6', letterSpacing: '0.02em' }],
        'label': ['11px', { lineHeight: '1.5', letterSpacing: '0.06em' }],
        'body': ['13px', { lineHeight: '1.55', letterSpacing: '-0.01em' }],
        'h2': ['15px', { lineHeight: '1.4', letterSpacing: '-0.02em' }],
        'h1': ['20px', { lineHeight: '1.3', letterSpacing: '-0.03em' }],
      },

      /* ─── Border Radius ─── */
      borderRadius: {
        xs: '4px',
        sm: '8px',
        md: '10px',
        lg: '14px',
        xl: '18px',
      },

      /* ─── Box Shadow (layered with indigo bleed) ─── */
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 1px var(--border), inset 0 1px 0 rgba(255,255,255,0.02)',
        'card-hover': '0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px var(--border-light), 0 0 40px -12px rgba(99,102,241,0.08), inset 0 1px 0 rgba(255,255,255,0.03)',
        elevated: '0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px var(--glass-border)',
        modal: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(148,163,242,0.08), 0 0 120px -40px rgba(99,102,241,0.1)',
        drag: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 2px var(--accent), 0 0 40px rgba(99,102,241,0.15)',
        glow: '0 0 40px -12px rgba(99,102,241,0.12)',
        'glow-accent': '0 0 20px rgba(99,102,241,0.3), 0 4px 12px rgba(0,0,0,0.3)',
        focus: '0 0 0 2px var(--bg), 0 0 0 4px var(--accent)',
        'input-focus': 'inset 0 1px 3px rgba(0,0,0,0.15), 0 0 0 3px var(--accent-muted), 0 0 16px -4px rgba(99,102,241,0.12)',
        inset: 'inset 0 1px 3px rgba(0,0,0,0.15)',
      },

      /* ─── Spacing (extras) ─── */
      spacing: {
        'sidebar': '260px',
        'sidebar-collapsed': '56px',
      },

      /* ─── Backdrop Blur ─── */
      backdropBlur: {
        glass: '20px',
      },

      /* ─── Transition Timing ─── */
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'spring-soft': 'cubic-bezier(0.22, 1.35, 0.55, 1)',
      },

      /* ─── Animations ─── */
      keyframes: {
        'card-slide-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'stagger-slide-in': {
          from: { opacity: '0', transform: 'translateY(12px) scale(0.97)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'spring-pop': {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '60%': { transform: 'scale(1.02)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'view-fade-in': {
          from: { opacity: '0', transform: 'translateX(8px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'overlay-fade-in': {
          from: { opacity: '0', backdropFilter: 'blur(0)' },
          to: { opacity: '1', backdropFilter: 'blur(20px) saturate(200%)' },
        },
        'toast-slide-in': {
          from: { opacity: '0', transform: 'translateX(40px) scale(0.95)' },
          to: { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        'ambient-orb': {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1) translateY(0)' },
          '33%': { opacity: '0.6', transform: 'scale(1.1) translateY(-4px)' },
          '66%': { opacity: '0.3', transform: 'scale(0.95) translateY(2px)' },
        },
        'running-glow': {
          '0%, 100%': { boxShadow: '0 0 6px rgba(99,102,241,0.08), inset 0 0 0 1px rgba(99,102,241,0.1)' },
          '50%': { boxShadow: '0 0 20px rgba(99,102,241,0.15), inset 0 0 0 1px rgba(99,102,241,0.2)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        breathe: {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-3px)' },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        'hold-progress': {
          from: { width: '0%' },
          to: { width: '100%' },
        },
        'status-ring': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        'post-move-flash': {
          '0%': { borderColor: 'rgba(99,102,241,0.4)', boxShadow: '0 0 20px rgba(99,102,241,0.15)' },
          '100%': { borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' },
        },
        'sidebar-dot-pulse': {
          '0%, 100%': {
            boxShadow: '0 0 4px rgba(var(--dot-r,99),var(--dot-g,102),var(--dot-b,241),0.5), 0 0 12px rgba(var(--dot-r,99),var(--dot-g,102),var(--dot-b,241),0.2)',
            transform: 'scale(1)',
          },
          '50%': {
            boxShadow: '0 0 8px rgba(var(--dot-r,99),var(--dot-g,102),var(--dot-b,241),0.7), 0 0 20px rgba(var(--dot-r,99),var(--dot-g,102),var(--dot-b,241),0.3)',
            transform: 'scale(1.25)',
          },
        },
        'filter-slide-down': {
          from: { opacity: '0', transform: 'translateY(-6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'agent-card-enter': {
          from: { opacity: '0', transform: 'translateY(10px) scale(0.97)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'progress-shimmer': {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        'error-blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.2' },
        },
        'waiting-pulse': {
          '0%, 100%': { boxShadow: '0 0 8px rgba(251,191,36,0.2)' },
          '50%': { boxShadow: '0 0 18px rgba(251,191,36,0.4)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 10px rgba(52,211,153,0.3)' },
          '50%': { boxShadow: '0 0 24px rgba(52,211,153,0.5)' },
        },
        'schedule-pulse': {
          '0%, 100%': { filter: 'drop-shadow(0 0 3px var(--accent))' },
          '50%': { filter: 'drop-shadow(0 0 10px var(--accent))' },
        },
      },
      animation: {
        'card-in': 'card-slide-in 250ms cubic-bezier(0.16,1,0.3,1) both',
        'stagger-in': 'stagger-slide-in 400ms cubic-bezier(0.16,1,0.3,1) both',
        'spring-pop': 'spring-pop 350ms cubic-bezier(0.34,1.56,0.64,1)',
        'fade-in-up': 'fade-in-up 250ms cubic-bezier(0.16,1,0.3,1)',
        'view-in': 'view-fade-in 200ms cubic-bezier(0.16,1,0.3,1)',
        'overlay-in': 'overlay-fade-in 250ms cubic-bezier(0.16,1,0.3,1)',
        'toast-in': 'toast-slide-in 300ms cubic-bezier(0.16,1,0.3,1)',
        'ambient-orb': 'ambient-orb 4s ease-in-out infinite',
        'running-glow': 'running-glow 2s ease-in-out infinite',
        shimmer: 'shimmer 1.5s ease-in-out infinite',
        breathe: 'breathe 2s ease-in-out infinite',
        float: 'float 3s ease-in-out infinite',
        spin: 'spin 1s linear infinite',
        pulse: 'pulse 2s ease-in-out infinite',
        'hold-fill': 'hold-progress 1.2s linear forwards',
        'status-ring': 'status-ring 2s linear infinite',
        'post-move': 'post-move-flash 1s ease-out',
        'dot-pulse': 'sidebar-dot-pulse 2.4s ease-in-out infinite',
        'filter-in': 'filter-slide-down 180ms cubic-bezier(0.16,1,0.3,1)',
        'agent-in': 'agent-card-enter 400ms cubic-bezier(0.16,1,0.3,1) both',
        'error-blink': 'error-blink 1s ease-in-out infinite',
        'waiting-pulse': 'waiting-pulse 2s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'schedule-pulse': 'schedule-pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
