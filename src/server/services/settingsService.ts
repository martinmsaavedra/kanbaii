import fs from 'fs';
import path from 'path';
import { encrypt, decrypt, isEncrypted } from '../lib/secretsEncryption';

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
      const settings = deepMerge(DEFAULTS, saved);
      // Auto-decrypt sensitive fields
      if (settings.integrations.telegram.botToken) {
        try { settings.integrations.telegram.botToken = decrypt(settings.integrations.telegram.botToken); } catch {}
      }
      if (settings.integrations.voice.openaiApiKey) {
        try { settings.integrations.voice.openaiApiKey = decrypt(settings.integrations.voice.openaiApiKey); } catch {}
      }
      if (settings.auth.secret && isEncrypted(settings.auth.secret)) {
        try { settings.auth.secret = decrypt(settings.auth.secret); } catch {}
      }
      return settings;
    }
  } catch {}
  return { ...DEFAULTS };
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const merged = deepMerge(current, partial);
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // Auto-encrypt sensitive fields before saving
  const toSave = JSON.parse(JSON.stringify(merged)); // deep clone
  if (toSave.integrations?.telegram?.botToken && !isEncrypted(toSave.integrations.telegram.botToken)) {
    toSave.integrations.telegram.botToken = encrypt(toSave.integrations.telegram.botToken);
  }
  if (toSave.integrations?.voice?.openaiApiKey && !isEncrypted(toSave.integrations.voice.openaiApiKey)) {
    toSave.integrations.voice.openaiApiKey = encrypt(toSave.integrations.voice.openaiApiKey);
  }
  if (toSave.auth?.secret && !isEncrypted(toSave.auth.secret)) {
    toSave.auth.secret = encrypt(toSave.auth.secret);
  }
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(toSave, null, 2), 'utf-8');
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
