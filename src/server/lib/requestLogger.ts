import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const id = crypto.randomBytes(4).toString('hex');
  const start = Date.now();

  (req as any).requestId = id;

  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path.startsWith('/api/') && req.path !== '/api/health') {
      const status = res.statusCode;
      const level = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO';
      if (level !== 'INFO' || duration > 1000) {
        console.log(`[${level}] ${id} ${req.method} ${req.path} ${status} ${duration}ms`);
      }
    }
  });

  next();
}
