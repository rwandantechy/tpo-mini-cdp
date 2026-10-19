import { Router } from 'express';

import { REFERENCE_DATE } from '../config/constants.js';
import { query } from '../lib/db.js';
import { serviceUnavailable } from '../lib/errors.js';

/** Unauthenticated liveness check. Hits Postgres so a paused project is noticed. */
export function healthRouter(): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const started = Date.now();

    try {
      await query('select 1 as ok');
    } catch {
      throw serviceUnavailable('The database is not reachable right now.');
    }

    res.json({
      status: 'ok',
      database_latency_ms: Date.now() - started,
      reference_date: REFERENCE_DATE,
    });
  });

  return router;
}
