/** Client-safe errors. Anything else is logged and answered generically. */

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown): AppError =>
  new AppError(400, 'bad_request', message, details);

export const unauthorized = (message = 'Sign in to continue.'): AppError =>
  new AppError(401, 'unauthorized', message);

export const forbidden = (message = 'You do not have access to this.'): AppError =>
  new AppError(403, 'forbidden', message);

export const notFound = (message = 'Not found.'): AppError => new AppError(404, 'not_found', message);

export const tooManyRequests = (message: string): AppError => new AppError(429, 'too_many_requests', message);

export const serviceUnavailable = (message: string, details?: unknown): AppError =>
  new AppError(503, 'service_unavailable', message, details);
