import chokidar from 'chokidar';
import path from 'path';
import { EventEmitter } from 'events';

export type FileChangeEvent = {
  type: 'project' | 'workItem';
  event: 'add' | 'change' | 'unlink';
  projectSlug: string;
  workItemSlug?: string;
  filePath: string;
};

export class FileWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private dataDir: string;

  constructor(dataDir: string) {
    super();
    this.dataDir = path.resolve(dataDir);
  }

  start(): void {
    if (this.watcher) return;

    this.watcher = chokidar.watch(this.dataDir, {
      ignoreInitial: true,
      depth: 3,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    });

    this.watcher.on('add', (fp) => this.handleEvent('add', fp));
    this.watcher.on('change', (fp) => this.handleEvent('change', fp));
    this.watcher.on('unlink', (fp) => this.handleEvent('unlink', fp));
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  private handleEvent(event: 'add' | 'change' | 'unlink', filePath: string): void {
    if (!filePath.endsWith('.json')) return;

    const relative = path.relative(this.dataDir, filePath).replace(/\\/g, '/');
    const parts = relative.split('/');

    // project.json → parts: ["{projectSlug}", "project.json"]
    if (parts.length === 2 && parts[1] === 'project.json') {
      const change: FileChangeEvent = {
        type: 'project',
        event,
        projectSlug: parts[0],
        filePath,
      };
      this.emit('change', change);
      return;
    }

    // work-items/{slug}.json → parts: ["{projectSlug}", "work-items", "{slug}.json"]
    if (parts.length === 3 && parts[1] === 'work-items') {
      const change: FileChangeEvent = {
        type: 'workItem',
        event,
        projectSlug: parts[0],
        workItemSlug: parts[2].replace('.json', ''),
        filePath,
      };
      this.emit('change', change);
      return;
    }
  }
}

export function createFileWatcher(dataDir: string): FileWatcher {
  return new FileWatcher(dataDir);
}
