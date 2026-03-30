import { Request, Response, NextFunction } from 'express';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

/**
 * Express param middleware — validates that a route param is a valid slug.
 * Rejects path traversal, special chars, and anything not lowercase-alphanumeric-hyphen.
 */
export function validateSlugParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = req.params[paramName];
    if (!value || value.length > 100 || !SLUG_PATTERN.test(value)) {
      res.status(400).json({ ok: false, error: `Invalid ${paramName}: must be lowercase alphanumeric with hyphens` });
      return;
    }
    next();
  };
}
