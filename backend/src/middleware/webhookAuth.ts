
import type { RequestHandler } from 'express';

import { getServerEnv } from '../config/env.js';
import { badRequest, unauthorized } from '../lib/errors.js';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifySignature } from '../lib/hmac.js';
import { log } from '../lib/logger.js';

// Check the webhook signature before reading the JSON body.
export const verifyWebhookRequest: RequestHandler = (req, _res, next) => {
  const env = getServerEnv();

  const rawBody = Buffer.isBuffer(req.body) ? req.body : null;

  if (!rawBody) {
    next(badRequest('Expected a raw request body.'));
    return;
  }

  const result = verifySignature({
    secret: env.WEBHOOK_SECRET,
    rawBody,
    timestamp: req.header(TIMESTAMP_HEADER),
    signature: req.header(SIGNATURE_HEADER),
  });

  if (!result.ok) {
    log.warn('webhook signature rejected', {
      reason: result.reason,
      bytes: rawBody.length,
    });

    next(unauthorized('Invalid webhook signature.'));
    return;
  }

  req.rawBody = rawBody;

  try {
    req.body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    next(badRequest('Body is not valid JSON.'));
    return;
  }

  next();
};
