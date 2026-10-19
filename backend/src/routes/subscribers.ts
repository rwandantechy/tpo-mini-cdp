import { Router } from 'express';
import { z } from 'zod';

import { SEARCH_LIMIT } from '../config/constants.js';
import { notFound } from '../lib/errors.js';
import { getSubscriberProfile, searchSubscribers } from '../services/subscribers.js';

const querySchema = z.object({
  q: z.string().trim().max(254).optional().default(''),
  limit: z.coerce.number().int().min(1).max(100).default(SEARCH_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

const idSchema = z.object({
  id: z.string().uuid('That is not a subscriber id.'),
});

export function subscribersRouter(): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { q, limit, offset } = querySchema.parse(req.query);
    res.json(await searchSubscribers(q, { limit, offset }));
  });

  router.get('/:id', async (req, res) => {
    const { id } = idSchema.parse(req.params);
    const profile = await getSubscriberProfile(id);
    if (!profile) throw notFound('No subscriber with that id.');

    res.json(profile);
  });

  return router;
}
