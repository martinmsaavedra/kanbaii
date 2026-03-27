// src/cli/banner.ts

import fs from 'fs';
import path from 'path';

export function getVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function printBanner(): void {
  const version = getVersion();
  console.log(`
  \x1b[38;5;99m◇\x1b[0m  \x1b[1mKANBAII\x1b[0m v${version}
     \x1b[2mAI-native kanban for software development\x1b[0m
`);
}
