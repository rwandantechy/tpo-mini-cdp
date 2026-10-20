/**
 * After the app is created, it is used to listen to the port and start the server.
 * 
 */

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';

import morganLogger from 'morgan';
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
import { appEventsRouter } from './routes/appEvents.js';
import type { AuthAccountLookup } from './routes/auth.js';

export function createApp(options: { authAccounts?: AuthAccountLookup } = {}): Express {
  const env = getServerEnv();
  const app = express();
  morganLogger.token('safe-url', (req) => (req.url ?? '').split('?')[0]);
  app.use(morganLogger(env.NODE_ENV === 'production'
    ? ':remote-addr :method :safe-url :status :res[content-length] - :response-time ms'
    : ':method :safe-url :status :response-time ms'));
// Disable the X-Powered-By header.
app.disable("x-powered-by");

// Trust the reverse proxy when configured or running on Vercel.
if (env.TRUST_PROXY || process.env.VERCEL === "1") {
  app.set("trust proxy", 1);
}


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
// Parse cookies.
  app.use(cookieParser());
// Create the rate limiters.
  const limiters = createLimiters();
// Use the health router.
  app.use('/api/health', limiters.api, healthRouter());
  app.use('/api/auth', limiters.api, express.json({ limit: JSON_BODY_LIMIT }), authRouter(limiters, options.authAccounts));
app.use('/api/app-events', limiters.api, requireAuth, appEventsRouter());
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
// Use the webhooks router. - this is used to handle the webhooks from the app.
  app.use(
    WEBHOOK_MOUNT,
    limiters.webhook,
    express.raw({ type: () => true, limit: JSON_BODY_LIMIT }),
    verifyWebhookRequest,
    webhooksRouter(),
  );

// Use the not found handler.
  app.use(notFoundHandler);
// Use the error handler.
  app.use(errorHandler);

  return app;
}

/**
 * To address the issue of CommonJS and crashes on these imports.
 * The default export is bundled to `app.mjs` on Vercel. A `.js`
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

/** This isn for the deployment origins, it is for the origins that are allowed to access the API. */
function deploymentOrigins(): string[] {
  return [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
    .filter((host): host is string => typeof host === 'string' && host.length > 0 && !host.includes('://'))
    .map((host) => `https://${host}`);
}
