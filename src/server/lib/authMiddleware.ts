import { Request, Response, NextFunction } from 'express';
import { isAuthEnabled, verifyToken } from '../services/authService';

/**
 * Auth middleware — only enforces when auth is enabled in settings.
 * Skips auth routes and health check.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Always allow these paths
  if (
    req.path.startsWith('/api/auth/') ||
    req.path === '/api/health' ||
    !req.path.startsWith('/api/')
  ) {
    return next();
  }

  // Skip if auth not enabled
  if (!isAuthEnabled()) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ ok: false, error: 'Authentication required' });
    return;
  }

  const payload = verifyToken(authHeader.slice(7));
  if (!payload) {
    res.status(401).json({ ok: false, error: 'Invalid or expired token' });
    return;
  }

  // Attach user info to request
  (req as any).userId = payload.userId;
  (req as any).username = payload.username;
  next();
}
