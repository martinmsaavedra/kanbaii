import crypto from 'crypto';

/**
 * Generate a 4-character hex suffix for IDs.
 */
function hexSuffix(): string {
  return crypto.randomBytes(2).toString('hex');
}

/**
 * Slugify a string: lowercase, replace non-alphanumeric with dashes, trim dashes.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
}

/**
 * Generate a stable ID from a title: `{prefix}{slugified-title}-{4hex}`
 * Example: "Auth System" with prefix "feat-" → "feat-auth-system-a7f2"
 */
export function generateId(title: string, prefix = ''): string {
  const slug = slugify(title);
  return `${prefix}${slug}-${hexSuffix()}`;
}

/**
 * Generate a project slug from title (no hex suffix, just slugified).
 * Caller must ensure uniqueness.
 */
export function projectSlug(title: string): string {
  return slugify(title);
}
