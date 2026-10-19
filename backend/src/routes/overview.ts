import { Router } from 'express';

import { getOverview } from '../services/overview.js';

export function overviewRouter(): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json(await getOverview());
  });

  return router;
}
