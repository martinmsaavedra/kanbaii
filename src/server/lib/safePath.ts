import path from 'path';

/**
 * Validate that a slug/filename doesn't escape the base directory.
 * Throws if path traversal detected.
 */
export function safePath(baseDir: string, ...segments: string[]): string {
  for (const seg of segments) {
    if (typeof seg !== 'string' || seg.includes('..') || seg.includes('\0') || /[<>:"|?*]/.test(seg)) {
      throw new Error(`Invalid path segment: ${seg}`);
    }
  }

  const resolved = path.resolve(baseDir, ...segments);
  const normalizedBase = path.resolve(baseDir);

  if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
    throw new Error(`Path escapes base directory`);
  }

  return resolved;
}
