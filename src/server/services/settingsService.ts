import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.env.KANBAII_DATA_DIR || path.join(process.cwd(), 'data', 'projects'));
const SETTINGS_FILE = path.join(DATA_DIR, '..', '.settings.json');

export interface AppSettings {
  general: {
    defaultModel: 'opus' | 'sonnet' | 'haiku';
    timezone: string;
    port: number;
  };
  scheduler: {
    enabled: boolean;
    maxConcurrent: number;
    timeout: number;           // ms
    staleThreshold: number;    // minutes
  };
  terminal: {
    inactivityWarn: number;    // minutes
    inactivityKill: number;    // minutes
    maxTimeout: number;        // minutes
  };
  ralph: {
    maxIterations: number;
    circuitBreaker: number;
    taskFilter: 'all' | 'todo-only';
  };
  auth: {
    enabled: boolean;
    secret: string;
    tokenExpiry: string;       // e.g. "24h"
  };
  integrations: {
    telegram: {
      enabled: boolean;
      botToken: string;
      chatId: string;
    };
    voice: {
      enabled: boolean;
      openaiApiKey: string;  // For Whisper transcription fallback
    };
  };
}

const DEFAULTS: AppSettings = {
  general: {
    defaultModel: 'sonnet',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    port: 5555,
  },
  scheduler: {
    enabled: false,
    maxConcurrent: 2,
    timeout: 600000,
    staleThreshold: 30,
  },
  terminal: {
    inactivityWarn: 15,
    inactivityKill: 60,
    maxTimeout: 120,
  },
  ralph: {
    maxIterations: 50,
    circuitBreaker: 3,
    taskFilter: 'todo-only',
  },
  auth: {
    enabled: false,
    secret: '',
    tokenExpiry: '24h',
  },
  integrations: {
    telegram: { enabled: false, botToken: '', chatId: '' },
    voice: { enabled: false, openaiApiKey: '' },
  },
};

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export function getSettings(): AppSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      return deepMerge(DEFAULTS, saved);
    }
  } catch {}
  return { ...DEFAULTS };
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const merged = deepMerge(current, partial);
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

export function getSection<K extends keyof AppSettings>(key: K): AppSettings[K] {
  return getSettings()[key];
}

export function updateSection<K extends keyof AppSettings>(key: K, value: Partial<AppSettings[K]>): AppSettings {
  const current = getSettings();
  (current as any)[key] = deepMerge((current as any)[key], value);
  return updateSettings(current);
}
