import crypto from 'crypto';
import os from 'os';

const ALGORITHM = 'aes-256-gcm';

if (!process.env.KANBAII_SECRET) {
  console.warn('[kanbaii] \u26a0 KANBAII_SECRET not set \u2014 using machine-specific encryption key. Set KANBAII_SECRET env var for portable encryption.');
}

function deriveKey(): Buffer {
  const envSecret = process.env.KANBAII_SECRET;
  if (envSecret) {
    return crypto.scryptSync(envSecret, 'kanbaii-env-salt', 32);
  }
  // Fallback: machine-specific key
  const material = [os.hostname(), os.homedir(), 'kanbaii-v1'].join(':');
  return crypto.scryptSync(material, 'kanbaii-salt', 32);
}

export function encrypt(text: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `enc:${iv.toString('hex')}:${tag}:${encrypted}`;
}

export function decrypt(encoded: string): string {
  if (!encoded.startsWith('enc:')) return encoded;
  const [, ivHex, tagHex, data] = encoded.split(':');
  const key = deriveKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let decrypted = decipher.update(data, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');
  return decrypted;
}

export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith('enc:');
}
