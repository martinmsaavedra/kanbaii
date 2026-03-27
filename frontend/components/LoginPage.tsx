'use client';

import { useState } from 'react';
import { useToastStore } from '@/stores/toastStore';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';

interface LoginPageProps {
  onAuthenticated: (token: string) => void;
}

export function LoginPage({ onAuthenticated }: LoginPageProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setLoading(true);

    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    try {
      const res = await fetch(`${API}${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (data.ok && data.data?.token) {
        localStorage.setItem('kanbaii-token', data.data.token);
        onAuthenticated(data.data.token);
        addToast(`Welcome, ${data.data.user.username}`, 'success');
      } else {
        addToast(data.error || 'Authentication failed', 'error');
      }
    } catch {
      addToast('Connection failed', 'error');
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center h-screen w-full bg-bg">
      <div className="flex flex-col items-center px-9 py-10 max-w-[360px] w-[90%] bg-surface-elevated border border-glass-border rounded-lg shadow-modal relative overflow-hidden animate-fade-in-up">
        {/* Luminescent top edge */}
        <div className="absolute top-0 left-[15%] right-[15%] h-px pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent, rgba(129, 140, 248, 0.2), transparent)' }} />

        <div className="mb-4 opacity-80">
          <svg width={40} height={40} viewBox="0 0 32 32">
            <defs>
              <linearGradient id="lg1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e0e7ff" />
                <stop offset="100%" stopColor="#c7d2fe" />
              </linearGradient>
            </defs>
            <rect x="7" y="10" width="4.5" height="12" fill="url(#lg1)" rx="1.5" />
            <rect x="13.75" y="7.5" width="4.5" height="17" fill="url(#lg1)" rx="1.5" />
            <rect x="20.5" y="11" width="4.5" height="10" fill="url(#lg1)" rx="1.5" />
          </svg>
        </div>
        <h1 className="text-h1 font-bold text-text tracking-[0.15em] font-mono mb-1">KANBAII</h1>
        <p className="text-xs text-text-muted mb-6">{isRegister ? 'Create your account' : 'Sign in to continue'}</p>

        <form className="flex flex-col gap-2.5 w-full" onSubmit={handleSubmit}>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Username"
            autoFocus
            autoComplete="username"
            className="w-full px-3.5 py-2.5 text-body"
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            className="w-full px-3.5 py-2.5 text-body"
          />
          <button
            type="submit"
            className="w-full py-2.5 text-white text-xs font-semibold rounded-sm font-mono tracking-wide relative overflow-hidden transition-all duration-150 ease-out-expo hover:shadow-glow-accent hover:-translate-y-px disabled:opacity-50"
            style={{ background: 'var(--accent-gradient)' }}
            disabled={!username.trim() || !password.trim() || loading}
          >
            <span className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 50%)' }} />
            {loading ? 'Loading...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <button
          className="mt-4 text-label text-accent font-mono transition-colors duration-150 hover:text-accent-hover"
          onClick={() => setIsRegister(!isRegister)}
        >
          {isRegister ? 'Already have an account? Sign in' : 'Need an account? Register'}
        </button>
      </div>
    </div>
  );
}
