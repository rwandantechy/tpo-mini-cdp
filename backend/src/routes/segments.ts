import { Router } from 'express';
import { z } from 'zod';

import { SEARCH_LIMIT, SEGMENT_NAME_MAX_LENGTH } from '../config/constants.js';
import { notFound } from '../lib/errors.js';
import {
  deleteSegment,
  listSegments,
  previewSegment,
  saveSegment,
  segmentDefinitionSchema,
} from '../services/segments.js';

const previewSchema = z.object({
  definition: segmentDefinitionSchema,
  limit: z.number().int().min(1).max(100).optional().default(SEARCH_LIMIT),
  offset: z.number().int().min(0).optional().default(0),
});

const saveSchema = z.object({
  name: z.string().trim().min(1, 'Give the segment a name.').max(SEGMENT_NAME_MAX_LENGTH),
  definition: segmentDefinitionSchema,
});

const idSchema = z.object({
  id: z.string().uuid('That is not a segment id.'),
});

export function segmentsRouter(): Router {
  const router = Router();

  router.post('/preview', async (req, res) => {
    const { definition, limit, offset } = previewSchema.parse(req.body);
    res.json(await previewSegment(definition, { limit, offset }));
  });

  router.get('/', async (_req, res) => {
    res.json({ segments: await listSegments() });
  });

  router.post('/', async (req, res) => {
    const { name, definition } = saveSchema.parse(req.body);
    const createdBy = req.session?.sub ?? 'unknown';
    res.status(201).json(await saveSegment(name, definition, createdBy));
  });

  router.delete('/:id', async (req, res) => {
    const { id } = idSchema.parse(req.params);
    const removed = await deleteSegment(id);
    if (!removed) throw notFound('No segment with that id.');
    res.status(204).send();
  });

  return router;
}
