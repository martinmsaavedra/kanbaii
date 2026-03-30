import { Router, Request, Response } from 'express';
import * as authService from '../services/authService';

const router = Router();

// GET /api/auth/status — check if auth is enabled + has users
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    data: {
      enabled: authService.isAuthEnabled(),
      hasUsers: authService.hasUsers(),
    },
  });
});

// POST /api/auth/register
router.post('/register', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'username and password required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters' });
  }
  try {
    const result = authService.register(username, password);
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(400).json({ ok: false, error: (err as Error).message });
  }
});

// POST /api/auth/login
router.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'username and password required' });
  }
  try {
    const result = authService.login(username, password);
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(401).json({ ok: false, error: (err as Error).message });
  }
});

// GET /api/auth/verify — verify a token
router.get('/verify', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'No token' });
  }
  const payload = authService.verifyToken(authHeader.slice(7));
  if (!payload) return res.status(401).json({ ok: false, error: 'Invalid token' });
  res.json({ ok: true, data: { userId: payload.userId, username: payload.username } });
});

export default router;
