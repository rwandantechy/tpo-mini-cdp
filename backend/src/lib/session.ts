/** Signed session token: `<base64url payload>.<hex HMAC>`. Tamper-evident, not encrypted. */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { SESSION_TTL_SECONDS } from '../config/constants.js';

export const SESSION_COOKIE = 'tpo_session';

export interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
  email?: string;
}

/** Only per-account sessions from the current login flow are accepted. */
export function isAccountSession(session: SessionPayload | null): session is SessionPayload & { email: string } {
  return Boolean(
    session?.email &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(session.sub),
  );
}

function sign(secret: string, encodedPayload: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('hex');
}

export function createSessionToken(
  secret: string,
  subject: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  ttlSeconds: number = SESSION_TTL_SECONDS,
  email?: string,
): string {
  const payload: SessionPayload = {
    sub: subject,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    ...(email ? { email } : {}),
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

  return `${encoded}.${sign(secret, encoded)}`;
}

/** Payload, or null if the token is missing, tampered with, or expired. */
export function verifySessionToken(
  secret: string,
  token: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): SessionPayload | null {
  if (!token) return null;

  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;

  const encoded = token.slice(0, separator);
  const provided = Buffer.from(token.slice(separator + 1), 'hex');
  const expected = Buffer.from(sign(secret, encoded), 'hex');

  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
  } catch {
    return null;
  }

  if (typeof payload?.sub !== 'string' || typeof payload?.exp !== 'number') return null;
  if (payload.email !== undefined && typeof payload.email !== 'string') return null;
  if (payload.exp <= nowSeconds) return null;

  return payload;
}
