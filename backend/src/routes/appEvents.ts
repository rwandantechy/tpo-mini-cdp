import { Router } from 'express';
import { z } from 'zod';

import { listRecentAppEvents } from '../services/appEvents.js';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export function appEventsRouter(): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { limit } = querySchema.parse(req.query);
    res.json(await listRecentAppEvents(limit));
  });

  return router;
}