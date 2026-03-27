'use client';

import React from 'react';
import { useEffect, useState, useCallback } from 'react';
import { X, Settings } from 'lucide-react';
import { useToastStore } from '@/stores/toastStore';
import { useModalOverlay } from '@/hooks/useModalOverlay';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';

type SettingsTab = 'general' | 'ralph' | 'scheduler' | 'terminal' | 'auth' | 'integrations';

interface AppSettings {
  general: { defaultModel: string; timezone: string; port: number };
  scheduler: { enabled: boolean; maxConcurrent: number; timeout: number; staleThreshold: number };
  terminal: { inactivityWarn: number; inactivityKill: number; maxTimeout: number };
  ralph: { maxIterations: number; circuitBreaker: number; taskFilter: string };
  auth: { enabled: boolean; secret: string; tokenExpiry: string };
  integrations: { telegram: { enabled: boolean; botToken: string; chatId: string }; voice: { enabled: boolean } };
}

const TABS: { key: SettingsTab; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'ralph', label: 'Ralph' },
  { key: 'scheduler', label: 'Scheduler' },
  { key: 'terminal', label: 'Terminal' },
  { key: 'auth', label: 'Auth' },
  { key: 'integrations', label: 'Integrations' },
];

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const addToast = useToastStore((s) => s.addToast);
  const [tab, setTab] = useState<SettingsTab>('general');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const { overlayProps } = useModalOverlay(onClose);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/settings`);
      const data = await res.json();
      if (data.ok) setSettings(data.data);
    } catch {}
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const save = async (section: string, value: any) => {
    setSaving(true);
    try {
      await fetch(`${API}/api/settings/${section}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
      addToast('Settings saved', 'success');
      fetchSettings();
    } catch { addToast('Failed to save', 'error'); }
    setSaving(false);
  };

  if (!settings) return null;

  return (
    <div className="glass-overlay" {...overlayProps}>
      <div className="modal-box max-w-[680px] w-[95%] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0">
          <div className="text-h2 font-semibold tracking-tight flex items-center gap-2">
            <Settings size={16} /> Settings
          </div>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-40 shrink-0 border-r border-border p-2 flex flex-col gap-0.5 bg-bg-subtle">
            {TABS.map(t => (
              <button
                key={t.key}
                className={`px-3 py-2 text-xs font-medium text-text-muted rounded-sm text-left transition-all duration-150 ease-out-expo hover:text-text-secondary hover:bg-surface-hover ${tab === t.key ? 'text-text bg-accent-muted' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {tab === 'general' && (
              <SettingsSection title="General" onSave={(v) => save('general', v)} saving={saving}>
                <Field label="Default Model" type="select" value={settings.general.defaultModel} options={['haiku', 'sonnet', 'opus']} field="defaultModel" />
                <Field label="Timezone" value={settings.general.timezone} field="timezone" />
                <Field label="Port" type="number" value={settings.general.port} field="port" />
              </SettingsSection>
            )}

            {tab === 'ralph' && (
              <SettingsSection title="Ralph" onSave={(v) => save('ralph', v)} saving={saving}>
                <Field label="Max Iterations" type="number" value={settings.ralph.maxIterations} field="maxIterations" />
                <Field label="Circuit Breaker (max errors)" type="number" value={settings.ralph.circuitBreaker} field="circuitBreaker" />
                <Field label="Task Filter" type="select" value={settings.ralph.taskFilter} options={['todo-only', 'all']} field="taskFilter" />
              </SettingsSection>
            )}

            {tab === 'scheduler' && (
              <SettingsSection title="Scheduler" onSave={(v) => save('scheduler', v)} saving={saving}>
                <Field label="Enabled" type="toggle" value={settings.scheduler.enabled} field="enabled" />
                <Field label="Max Concurrent" type="number" value={settings.scheduler.maxConcurrent} field="maxConcurrent" />
                <Field label="Timeout (ms)" type="number" value={settings.scheduler.timeout} field="timeout" />
                <Field label="Stale Threshold (min)" type="number" value={settings.scheduler.staleThreshold} field="staleThreshold" />
              </SettingsSection>
            )}

            {tab === 'terminal' && (
              <SettingsSection title="Terminal" onSave={(v) => save('terminal', v)} saving={saving}>
                <Field label="Inactivity Warn (min)" type="number" value={settings.terminal.inactivityWarn} field="inactivityWarn" />
                <Field label="Inactivity Kill (min)" type="number" value={settings.terminal.inactivityKill} field="inactivityKill" />
                <Field label="Max Timeout (min)" type="number" value={settings.terminal.maxTimeout} field="maxTimeout" />
              </SettingsSection>
            )}

            {tab === 'auth' && (
              <SettingsSection title="Authentication" onSave={(v) => save('auth', v)} saving={saving}>
                <Field label="Enabled" type="toggle" value={settings.auth.enabled} field="enabled" />
                <Field label="Secret Key" value={settings.auth.secret} field="secret" placeholder="auto-generated if empty" />
                <Field label="Token Expiry" value={settings.auth.tokenExpiry} field="tokenExpiry" placeholder="24h" />
              </SettingsSection>
            )}

            {tab === 'integrations' && (
              <div className="flex flex-col gap-6">
                <SettingsSection title="Telegram" onSave={(v) => save('integrations', { telegram: v })} saving={saving}>
                  <Field label="Enabled" type="toggle" value={settings.integrations.telegram.enabled} field="enabled" />
                  <Field label="Bot Token" value={settings.integrations.telegram.botToken} field="botToken" placeholder="123456:ABC-DEF..." />
                  <Field label="Chat ID" value={settings.integrations.telegram.chatId} field="chatId" placeholder="-100123456789" />
                </SettingsSection>
                <SettingsSection title="Voice Input" onSave={(v) => save('integrations', { voice: v })} saving={saving}>
                  <Field label="Enabled" type="toggle" value={settings.integrations.voice.enabled} field="enabled" />
                  <Field label="OpenAI API Key" value={(settings.integrations.voice as any).openaiApiKey || ''} field="openaiApiKey" placeholder="sk-... (for Whisper fallback)" />
                </SettingsSection>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══ Settings Section with auto-collect + save ═══ */
function SettingsSection({ title, children, onSave, saving }: {
  title: string; children: React.ReactNode; onSave: (values: any) => void; saving: boolean;
}) {
  const [values, setValues] = useState<Record<string, any>>({});

  // Collect initial values from children
  useEffect(() => {
    const initial: Record<string, any> = {};
    React.Children.forEach(children, (child: any) => {
      if (child?.props?.field) initial[child.props.field] = child.props.value;
    });
    setValues(initial);
  }, [children]);

  const handleChange = (field: string, value: any) => {
    setValues(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-body font-semibold text-text tracking-tight">{title}</span>
        <button className="btn-primary" onClick={() => onSave(values)} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {React.Children.map(children, (child: any) => {
          if (!child?.props?.field) return child;
          return React.cloneElement(child, {
            value: values[child.props.field] ?? child.props.value,
            onChange: (v: any) => handleChange(child.props.field, v),
          });
        })}
      </div>
    </div>
  );
}

/* ═══ Field Component ═══ */
function Field({ label, value, field, type, options, placeholder, onChange }: {
  label: string; value: any; field: string; type?: string;
  options?: string[]; placeholder?: string;
  onChange?: (value: any) => void;
}) {
  if (type === 'toggle') {
    return (
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-medium text-text-secondary min-w-[140px] shrink-0">{label}</span>
        <button
          className={`px-3 py-1 text-data font-semibold rounded-xs font-mono border transition-all duration-150 ease-out-expo tracking-wide ${value ? 'text-success border-success-dim bg-success-dim' : 'text-text-muted border-border'}`}
          onClick={() => onChange?.(!value)}
        >
          {value ? 'ON' : 'OFF'}
        </button>
      </div>
    );
  }

  if (type === 'select' && options) {
    return (
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-medium text-text-secondary min-w-[140px] shrink-0">{label}</span>
        <div className="flex gap-1">
          {options.map(o => (
            <button
              key={o}
              className={`px-2.5 py-1 text-data font-medium rounded-full border font-mono transition-all duration-150 ease-out-expo ${value === o ? 'border-accent-dim text-accent bg-accent-muted' : 'border-border text-text-muted hover:border-border-light hover:text-text-secondary'}`}
              onClick={() => onChange?.(o)}
            >
              {o}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs font-medium text-text-secondary min-w-[140px] shrink-0">{label}</span>
      <input
        type={type || 'text'}
        value={value ?? ''}
        onChange={e => onChange?.(type === 'number' ? Number(e.target.value) : e.target.value)}
        placeholder={placeholder}
        className="flex-1 max-w-[200px] text-right font-mono text-xs"
      />
    </div>
  );
}
