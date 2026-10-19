/** Express app, separate from listen() so tests can build it without a port. */

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { JSON_BODY_LIMIT } from './config/constants.js';
import { corsOrigins, getServerEnv } from './config/env.js';
import { forbidden } from './lib/errors.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createLimiters } from './middleware/rateLimit.js';
import { requireAuth } from './middleware/requireAuth.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { overviewRouter } from './routes/overview.js';

export function createApp(): Express {
  const env = getServerEnv();
  const app = express();

  app.disable('x-powered-by');

  if (env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const allowed = corsOrigins(env);
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowed.includes(origin)) callback(null, true);
        else callback(forbidden(`Origin ${origin} is not allowed.`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'DELETE'],
    }),
  );

  app.use(cookieParser());

  const limiters = createLimiters();

  app.use('/api/health', limiters.api, healthRouter());
  app.use('/api/auth', limiters.api, express.json({ limit: JSON_BODY_LIMIT }), authRouter(limiters));

  app.use('/api/overview', limiters.api, requireAuth, overviewRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
