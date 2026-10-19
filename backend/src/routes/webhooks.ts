import { Router } from 'express';
import { z } from 'zod';

import { APP_EVENT_NAMES, WEBHOOK_ID_MAX_LENGTH } from '../config/constants.js';
import { parseTimestamp } from '../lib/dates.js';
import { withTransaction } from '../lib/db.js';
import { badRequest } from '../lib/errors.js';
import { log } from '../lib/logger.js';
import { ingestAppEvent } from '../services/webhooks.js';

const id = z.string().trim().min(1).max(WEBHOOK_ID_MAX_LENGTH);

const payloadSchema = z
  .object({
    event_id: id,
    event: z.enum(APP_EVENT_NAMES),
    user_id: z.string().trim().max(WEBHOOK_ID_MAX_LENGTH).nullish(),
    device_id: id,
    timestamp: z.string().min(1),
    properties: z
      .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional()
      .default({}),
  })
  .superRefine((value, ctx) => {
    if (!parseTimestamp(value.timestamp)) {
      ctx.addIssue({ code: 'custom', path: ['timestamp'], message: 'Use an ISO timestamp.' });
    }

    if (value.event === 'login' && !value.user_id) {
      ctx.addIssue({ code: 'custom', path: ['user_id'], message: 'A login needs a user_id.' });
    }
  });

export function webhooksRouter(): Router {
  const router = Router();

  router.post('/app', async (req, res) => {
    const body = payloadSchema.parse(req.body);
    const occurredAt = parseTimestamp(body.timestamp);
    if (!occurredAt) throw badRequest('Use an ISO timestamp.');

    const result = await withTransaction((client) =>
      ingestAppEvent(client, {
        eventId: body.event_id,
        event: body.event,
        userId: body.user_id || null,
        deviceId: body.device_id,
        occurredAt,
        properties: body.properties,
      }),
    );

    log.info('app event ingested', {
      event: body.event,
      event_id: result.eventId,
      duplicate: result.duplicate,
    });

    res.status(result.duplicate ? 200 : 201).json(result);
  });

  return router;
}
