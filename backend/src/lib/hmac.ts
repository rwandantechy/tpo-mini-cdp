/** HMAC-SHA256(secret, "<timestamp>.<raw body>"). Signs the raw bytes, not re-serialized JSON. */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { WEBHOOK_REPLAY_WINDOW_SECONDS } from '../config/constants.js';

export const SIGNATURE_HEADER = 'x-tpo-signature';
export const TIMESTAMP_HEADER = 'x-tpo-timestamp';

const SIGNATURE_PREFIX = 'sha256=';

export type SignatureFailure =
  | 'timestamp_missing'
  | 'timestamp_malformed'
  | 'timestamp_outside_window'
  | 'signature_missing'
  | 'signature_malformed'
  | 'signature_mismatch';

export interface VerifyInput {
  secret: string;
  rawBody: Buffer | string;
  timestamp: string | undefined;
  signature: string | undefined;
  nowSeconds?: number;
  windowSeconds?: number;
}

export function signPayload(secret: string, rawBody: Buffer | string, timestamp: number | string): string {
  const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  const digest = createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(body)
    .digest('hex');

  return `${SIGNATURE_PREFIX}${digest}`;
}

export function verifySignature(input: VerifyInput): { ok: true } | { ok: false; reason: SignatureFailure } {
  const {
    secret,
    rawBody,
    timestamp,
    signature,
    nowSeconds = Math.floor(Date.now() / 1000),
    windowSeconds = WEBHOOK_REPLAY_WINDOW_SECONDS,
  } = input;

  if (!timestamp) return { ok: false, reason: 'timestamp_missing' };
  if (!signature) return { ok: false, reason: 'signature_missing' };

  if (!/^\d{1,20}$/.test(timestamp)) return { ok: false, reason: 'timestamp_malformed' };

  if (Math.abs(nowSeconds - Number(timestamp)) > windowSeconds) {
    return { ok: false, reason: 'timestamp_outside_window' };
  }

  if (!signature.startsWith(SIGNATURE_PREFIX)) return { ok: false, reason: 'signature_malformed' };

  const provided = Buffer.from(signature.slice(SIGNATURE_PREFIX.length), 'hex');
  const expected = Buffer.from(signPayload(secret, rawBody, timestamp).slice(SIGNATURE_PREFIX.length), 'hex');

  if (provided.length !== expected.length) return { ok: false, reason: 'signature_malformed' };
  if (!timingSafeEqual(provided, expected)) return { ok: false, reason: 'signature_mismatch' };

  return { ok: true };
}
