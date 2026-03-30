import { describe, it, expect } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { safePath } from '../lib/safePath';
import { validateSlugParam } from '../lib/validateSlug';
import { encrypt, decrypt, isEncrypted } from '../lib/secretsEncryption';
import {
  CreateProjectDto,
  CreateTaskDto,
  PlanSchema,
  MoveTaskDto,
} from '../lib/schemas';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockReqRes(paramName: string, value: string) {
  const req = { params: { [paramName]: value } } as unknown as Request;
  let statusCode = 200;
  const res = {
    status(code: number) { statusCode = code; return this; },
    json(_body: any) {},
  } as unknown as Response;
  let nextCalled = false;
  const next = () => { nextCalled = true; };
  return { req, res, next, getStatus: () => statusCode, wasNextCalled: () => nextCalled };
}

// ---------------------------------------------------------------------------
// safePath
// ---------------------------------------------------------------------------

describe('safePath', () => {
  const base = '/tmp/kanbaii-test-base';

  it('allows valid path segments', () => {
    const result = safePath(base, 'project-1', 'file.json');
    expect(result).toContain('project-1');
    expect(result).toContain('file.json');
  });

  it('allows a single valid segment', () => {
    const result = safePath(base, 'my-project');
    expect(result).toContain('my-project');
  });

  it('rejects ".." path traversal — throws Invalid path segment', () => {
    expect(() => safePath(base, '..')).toThrow('Invalid path segment');
  });

  it('rejects segment containing ".." — throws Invalid path segment', () => {
    expect(() => safePath(base, '..', 'etc')).toThrow('Invalid path segment');
  });

  it('rejects null byte — throws Invalid path segment', () => {
    expect(() => safePath(base, 'file\0name')).toThrow('Invalid path segment');
  });

  it('rejects "<" character — throws Invalid path segment', () => {
    expect(() => safePath(base, 'file<name')).toThrow('Invalid path segment');
  });

  it('rejects ">" character — throws Invalid path segment', () => {
    expect(() => safePath(base, 'file>name')).toThrow('Invalid path segment');
  });

  it('rejects "|" character — throws Invalid path segment', () => {
    expect(() => safePath(base, 'file|name')).toThrow('Invalid path segment');
  });

  it('rejects \'"\' character — throws Invalid path segment', () => {
    expect(() => safePath(base, 'file"name')).toThrow('Invalid path segment');
  });

  it('rejects "?" character — throws Invalid path segment', () => {
    expect(() => safePath(base, 'file?name')).toThrow('Invalid path segment');
  });
});

// ---------------------------------------------------------------------------
// validateSlugParam
// ---------------------------------------------------------------------------

describe('validateSlugParam', () => {
  const middleware = validateSlugParam('projectSlug');

  it('allows valid slug — calls next()', () => {
    const { req, res, next, wasNextCalled } = mockReqRes('projectSlug', 'my-project');
    middleware(req, res, next as unknown as NextFunction);
    expect(wasNextCalled()).toBe(true);
  });

  it('allows single-char slug — calls next()', () => {
    const { req, res, next, wasNextCalled } = mockReqRes('projectSlug', 'a');
    middleware(req, res, next as unknown as NextFunction);
    expect(wasNextCalled()).toBe(true);
  });

  it('rejects uppercase slug — status 400', () => {
    const { req, res, next, getStatus, wasNextCalled } = mockReqRes('projectSlug', 'MyProject');
    middleware(req, res, next as unknown as NextFunction);
    expect(getStatus()).toBe(400);
    expect(wasNextCalled()).toBe(false);
  });

  it('rejects path traversal "../etc" — status 400', () => {
    const { req, res, next, getStatus, wasNextCalled } = mockReqRes('projectSlug', '../etc');
    middleware(req, res, next as unknown as NextFunction);
    expect(getStatus()).toBe(400);
    expect(wasNextCalled()).toBe(false);
  });

  it('rejects empty string — status 400', () => {
    const { req, res, next, getStatus, wasNextCalled } = mockReqRes('projectSlug', '');
    middleware(req, res, next as unknown as NextFunction);
    expect(getStatus()).toBe(400);
    expect(wasNextCalled()).toBe(false);
  });

  it('rejects slug over 100 characters — status 400', () => {
    const longSlug = 'a'.repeat(101);
    const { req, res, next, getStatus, wasNextCalled } = mockReqRes('projectSlug', longSlug);
    middleware(req, res, next as unknown as NextFunction);
    expect(getStatus()).toBe(400);
    expect(wasNextCalled()).toBe(false);
  });

  it('rejects special characters "project;rm -rf" — status 400', () => {
    const { req, res, next, getStatus, wasNextCalled } = mockReqRes('projectSlug', 'project;rm -rf');
    middleware(req, res, next as unknown as NextFunction);
    expect(getStatus()).toBe(400);
    expect(wasNextCalled()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// secretsEncryption
// ---------------------------------------------------------------------------

describe('secretsEncryption', () => {
  it('roundtrip: encrypt then decrypt returns original', () => {
    const original = 'super-secret-api-key-12345';
    const encrypted = encrypt(original);
    expect(decrypt(encrypted)).toBe(original);
  });

  it('isEncrypted detects "enc:" prefix', () => {
    const encrypted = encrypt('some-value');
    expect(isEncrypted(encrypted)).toBe(true);
  });

  it('isEncrypted returns false for plaintext', () => {
    expect(isEncrypted('plaintext-value')).toBe(false);
  });

  it('decrypt returns plaintext as-is if not encrypted (passthrough)', () => {
    const plain = 'not-encrypted-value';
    expect(decrypt(plain)).toBe(plain);
  });

  it('handles empty string encryption roundtrip', () => {
    const encrypted = encrypt('');
    expect(isEncrypted(encrypted)).toBe(true);
    expect(decrypt(encrypted)).toBe('');
  });

  it('produces different ciphertexts for the same input (random IV)', () => {
    const value = 'same-input';
    const enc1 = encrypt(value);
    const enc2 = encrypt(value);
    expect(enc1).not.toBe(enc2);
    // Both decrypt correctly
    expect(decrypt(enc1)).toBe(value);
    expect(decrypt(enc2)).toBe(value);
  });
});

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

describe('CreateProjectDto', () => {
  it('accepts valid project input', () => {
    const result = CreateProjectDto.safeParse({ title: 'My Project', color: '#ff0000' });
    expect(result.success).toBe(true);
  });

  it('accepts valid project with defaults', () => {
    const result = CreateProjectDto.safeParse({ title: 'Minimal' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.color).toBe('#6366f1');
    }
  });

  it('rejects title longer than 100 characters', () => {
    const result = CreateProjectDto.safeParse({ title: 'a'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('rejects empty title', () => {
    const result = CreateProjectDto.safeParse({ title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid hex color', () => {
    const result = CreateProjectDto.safeParse({ title: 'Valid Title', color: 'not-a-color' });
    expect(result.success).toBe(false);
  });
});

describe('CreateTaskDto', () => {
  it('accepts valid task input', () => {
    const result = CreateTaskDto.safeParse({ title: 'Fix bug', model: 'sonnet', column: 'backlog' });
    expect(result.success).toBe(true);
  });

  it('accepts task with defaults applied', () => {
    const result = CreateTaskDto.safeParse({ title: 'Fix bug' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.model).toBe('sonnet');
      expect(result.data.column).toBe('backlog');
    }
  });

  it('rejects title longer than 200 characters', () => {
    const result = CreateTaskDto.safeParse({ title: 'a'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('rejects description longer than 2000 characters', () => {
    const result = CreateTaskDto.safeParse({ title: 'Valid', description: 'x'.repeat(2001) });
    expect(result.success).toBe(false);
  });

  it('rejects invalid model value', () => {
    const result = CreateTaskDto.safeParse({ title: 'Valid', model: 'gpt-4' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid column value', () => {
    const result = CreateTaskDto.safeParse({ title: 'Valid', column: 'invalid-column' });
    expect(result.success).toBe(false);
  });
});

describe('PlanSchema', () => {
  it('accepts valid plan', () => {
    const result = PlanSchema.safeParse({ status: 'draft', prompt: 'Build a feature' });
    expect(result.success).toBe(true);
  });

  it('rejects prompt longer than 50000 characters', () => {
    const result = PlanSchema.safeParse({ status: 'draft', prompt: 'x'.repeat(50001) });
    expect(result.success).toBe(false);
  });

  it('rejects content longer than 100000 characters', () => {
    const result = PlanSchema.safeParse({ status: 'draft', content: 'x'.repeat(100001) });
    expect(result.success).toBe(false);
  });

  it('rejects invalid status value', () => {
    const result = PlanSchema.safeParse({ status: 'pending' });
    expect(result.success).toBe(false);
  });
});

describe('MoveTaskDto', () => {
  it('accepts valid move with zero index', () => {
    const result = MoveTaskDto.safeParse({ toColumn: 'todo', toIndex: 0 });
    expect(result.success).toBe(true);
  });

  it('accepts valid move with positive index', () => {
    const result = MoveTaskDto.safeParse({ toColumn: 'in-progress', toIndex: 5 });
    expect(result.success).toBe(true);
  });

  it('rejects negative index', () => {
    const result = MoveTaskDto.safeParse({ toColumn: 'todo', toIndex: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid column', () => {
    const result = MoveTaskDto.safeParse({ toColumn: 'someplace-else', toIndex: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer index', () => {
    const result = MoveTaskDto.safeParse({ toColumn: 'todo', toIndex: 1.5 });
    expect(result.success).toBe(false);
  });
});
