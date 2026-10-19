
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

import { AppError } from '../lib/errors.js';
import { log } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'not_found',
      message: `No route for ${req.method} ${req.path}.`,
    },
  });
};

// Return known errors with safe messages. Log unexpected errors without exposing details.
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'invalid_request',
        message: 'Some fields need fixing.',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.') || '(body)',
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    (error as { type?: string }).type === 'entity.too.large'
  ) {
    res.status(413).json({
      error: {
        code: 'payload_too_large',
        message: 'That request body is too large.',
      },
    });
    return;
  }

  log.error('unhandled error', {
    method: req.method,
    path: req.path,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'Something broke on our side. Please try again.',
    },
  });
};
