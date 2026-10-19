/** Express app, separate from listen() so tests can build it without a port. */

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';

import { JSON_BODY_LIMIT, WEBHOOK_MOUNT } from './config/constants.js';
import { corsOrigins, getServerEnv } from './config/env.js';
import { forbidden } from './lib/errors.js';
import { log } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createLimiters } from './middleware/rateLimit.js';
import { requireAuth } from './middleware/requireAuth.js';
import { verifyWebhookRequest } from './middleware/webhookAuth.js';
import { assistantRouter } from './routes/assistant.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { overviewRouter } from './routes/overview.js';
import { segmentsRouter } from './routes/segments.js';
import { subscribersRouter } from './routes/subscribers.js';
import { webhooksRouter } from './routes/webhooks.js';

export function createApp(): Express {
  const env = getServerEnv();
  const app = express();

  app.disable('x-powered-by');

  if (env.TRUST_PROXY || process.env.VERCEL === '1') app.set('trust proxy', 1);

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
        if (!origin || allowed.includes(origin) || deploymentOrigins().includes(origin)) callback(null, true);
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
  app.use('/api/subscribers', limiters.api, requireAuth, subscribersRouter());
  app.use('/api/segments', limiters.api, requireAuth, express.json({ limit: JSON_BODY_LIMIT }), segmentsRouter());
  app.use(
    '/api/assistant',
    limiters.api,
    requireAuth,
    express.json({ limit: JSON_BODY_LIMIT }),
    assistantRouter(limiters),
  );

  app.use(
    WEBHOOK_MOUNT,
    limiters.webhook,
    express.raw({ type: () => true, limit: JSON_BODY_LIMIT }),
    verifyWebhookRequest,
    webhooksRouter(),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/**
 * Default export bundled to `app.mjs` on Vercel. A `.js` build is loaded as
 * CommonJS and crashes on these imports.
 */
let vercelApp: Express | undefined;

const vercelEntry = express();

vercelEntry.use((req: Request, res: Response, next: NextFunction) => {
  try {
    vercelApp ??= createApp();
  } catch (error) {
    log.error('api failed to start', { message: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: { code: 'internal_error', message: 'The API is not configured.' } });
    return;
  }

  vercelApp(req, res, next);
});

export default vercelEntry;

/** Current Vercel deployment, so preview URLs work without editing CORS_ORIGINS. */
function deploymentOrigins(): string[] {
  return [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
    .filter((host): host is string => typeof host === 'string' && host.length > 0 && !host.includes('://'))
    .map((host) => `https://${host}`);
}
