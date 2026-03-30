import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';

// General API: 100 requests per minute
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isTest ? 10000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests, try again later' },
});

// Auth endpoints: 10 attempts per 15 minutes
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 10000 : 10,
  message: { ok: false, error: 'Too many login attempts' },
});

// Execution endpoints (ralph/teams/start): 5 per minute
export const executionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { ok: false, error: 'Too many execution requests' },
});

// Voice transcription: 10 per minute
export const voiceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { ok: false, error: 'Too many transcription requests' },
});
