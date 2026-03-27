import fs from 'fs';
import path from 'path';

export interface PluginHooks {
  preTask?: (ctx: { taskId: string; title: string; workingDir: string }) => Promise<void> | void;
  postTask?: (ctx: { taskId: string; title: string; exitCode: number; output: string }) => Promise<void> | void;
  preRun?: (ctx: { runType: 'ralph' | 'teams'; projectSlug: string }) => Promise<void> | void;
  postRun?: (ctx: { runType: 'ralph' | 'teams'; stats: any }) => Promise<void> | void;
}

export interface Plugin {
  name: string;
  version: string;
  description?: string;
  hooks: PluginHooks;
}

export interface PluginEntry {
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  path: string;
  hooks: string[];
}

const DATA_DIR = path.resolve(process.env.KANBAII_DATA_DIR || path.join(process.cwd(), 'data', 'projects'));
const PLUGINS_DIR = path.join(DATA_DIR, '..', '.plugins');
const CONFIG_FILE = path.join(DATA_DIR, '..', '.plugins-config.json');

let loadedPlugins: Map<string, { plugin: Plugin; enabled: boolean }> = new Map();

function ensureDirs(): void {
  if (!fs.existsSync(PLUGINS_DIR)) fs.mkdirSync(PLUGINS_DIR, { recursive: true });
}

function readConfig(): Record<string, boolean> {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

function writeConfig(config: Record<string, boolean>): void {
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function scanPlugins(): PluginEntry[] {
  ensureDirs();
  const config = readConfig();
  const entries: PluginEntry[] = [];

  if (!fs.existsSync(PLUGINS_DIR)) return entries;

  const files = fs.readdirSync(PLUGINS_DIR).filter((f) => f.endsWith('.js') || f.endsWith('.ts'));

  for (const file of files) {
    try {
      const fullPath = path.join(PLUGINS_DIR, file);
      // Clear require cache for hot-reload
      delete require.cache[require.resolve(fullPath)];
      const mod = require(fullPath);
      const plugin: Plugin = mod.default || mod;

      if (!plugin.name || !plugin.hooks) continue;

      const enabled = config[plugin.name] !== false;
      const hookNames = Object.keys(plugin.hooks).filter((k) => typeof (plugin.hooks as any)[k] === 'function');

      loadedPlugins.set(plugin.name, { plugin, enabled });

      entries.push({
        name: plugin.name,
        version: plugin.version || '0.0.0',
        description: plugin.description || '',
        enabled,
        path: fullPath,
        hooks: hookNames,
      });
    } catch (err) {
      console.warn(`[plugins] Failed to load ${file}:`, (err as Error).message);
    }
  }

  return entries;
}

export function togglePlugin(name: string, enabled: boolean): void {
  const config = readConfig();
  config[name] = enabled;
  writeConfig(config);
  const entry = loadedPlugins.get(name);
  if (entry) entry.enabled = enabled;
}

export async function runHook(hookName: keyof PluginHooks, ctx: any): Promise<void> {
  for (const [name, { plugin, enabled }] of loadedPlugins) {
    if (!enabled) continue;
    const hook = plugin.hooks[hookName];
    if (!hook) continue;
    try {
      await (hook as any)(ctx);
    } catch (err) {
      console.error(`[plugin:${name}] ${hookName} error:`, (err as Error).message);
    }
  }
}

// Initial scan
scanPlugins();
