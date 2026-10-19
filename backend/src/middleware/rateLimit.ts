import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';

import { RATE_LIMITS } from '../config/constants.js';
import { tooManyRequests } from '../lib/errors.js';
import { log } from '../lib/logger.js';

/** Built per app so each test starts with its own counters. */
function limiter(windowMs: number, limit: number, label: string, message: string): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, _res, next) => {
      log.warn('rate limit hit', { limiter: label, method: req.method, path: req.path });
      next(tooManyRequests(message));
    },
  });
}

export interface Limiters {
  login: RateLimitRequestHandler;
  api: RateLimitRequestHandler;
  webhook: RateLimitRequestHandler;
  assistant: RateLimitRequestHandler;
}

export function createLimiters(): Limiters {
  return {
    login: limiter(RATE_LIMITS.login.windowMs, RATE_LIMITS.login.limit, 'login', 'Too many sign-in attempts. Try again in a few minutes.'),
    api: limiter(RATE_LIMITS.api.windowMs, RATE_LIMITS.api.limit, 'api', 'Slow down a moment, then try again.'),
    webhook: limiter(RATE_LIMITS.webhook.windowMs, RATE_LIMITS.webhook.limit, 'webhook', 'Event rate limit exceeded.'),
    assistant: limiter(RATE_LIMITS.assistant.windowMs, RATE_LIMITS.assistant.limit, 'assistant', 'The assistant is busy. Give it a minute.'),
  };
}
