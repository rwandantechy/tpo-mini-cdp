import { describe, expect, it } from 'vitest';

import { SAMPLE_APP_EVENT, WEBHOOK_REPLAY_WINDOW_SECONDS } from '../src/config/constants.js';
import { signPayload, verifySignature } from '../src/lib/hmac.js';
import { randomCredential, TEST_WEBHOOK_SECRET as SECRET } from './helpers/credentials.js';

const NOW = 1_790_000_000;

const BODY = JSON.stringify(SAMPLE_APP_EVENT);

function verify(overrides: Partial<Parameters<typeof verifySignature>[0]> = {}) {
  return verifySignature({
    secret: SECRET,
    rawBody: BODY,
    timestamp: String(NOW),
    signature: signPayload(SECRET, BODY, NOW),
    nowSeconds: NOW,
    ...overrides,
  });
}

describe('signPayload', () => {
  it('is stable for the same inputs and prefixed with the algorithm', () => {
    const signature = signPayload(SECRET, BODY, NOW);

    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(signPayload(SECRET, BODY, NOW)).toBe(signature);
  });

  it('changes when the timestamp changes, which is what stops replay', () => {
    expect(signPayload(SECRET, BODY, NOW)).not.toBe(signPayload(SECRET, BODY, NOW + 1));
  });

  it('changes when the secret changes', () => {
    expect(signPayload(SECRET, BODY, NOW)).not.toBe(signPayload(randomCredential('other'), BODY, NOW));
  });

  it('treats a string body and the same bytes as a Buffer identically', () => {
    expect(signPayload(SECRET, Buffer.from(BODY, 'utf8'), NOW)).toBe(signPayload(SECRET, BODY, NOW));
  });
});

describe('verifySignature', () => {
  it('accepts a correctly signed request', () => {
    expect(verify()).toEqual({ ok: true });
  });

  it('rejects a body that changed after signing', () => {
    const tampered = BODY.replace('u_2b6447a3', 'u_someone_else');
    expect(verify({ rawBody: tampered })).toEqual({ ok: false, reason: 'signature_mismatch' });
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verify({ signature: signPayload(randomCredential('wrong'), BODY, NOW) })).toEqual({
      ok: false,
      reason: 'signature_mismatch',
    });
  });

  it('rejects a re-serialized body, because the signature covers raw bytes', () => {
    const reordered = JSON.stringify({
      event: 'read_story',
      event_id: 'evt_9f3a1c',
      user_id: 'u_2b6447a3',
      device_id: 'd_4b21e8',
      timestamp: '2026-09-28T14:22:05Z',
      properties: { story: 'supreme-court-ruling-explained' },
    });

    expect(verify({ rawBody: reordered })).toEqual({ ok: false, reason: 'signature_mismatch' });
  });

  it('accepts a request inside the replay window', () => {
    expect(verify({ nowSeconds: NOW + WEBHOOK_REPLAY_WINDOW_SECONDS })).toEqual({ ok: true });
    expect(verify({ nowSeconds: NOW - WEBHOOK_REPLAY_WINDOW_SECONDS })).toEqual({ ok: true });
  });

  it('rejects a captured request replayed later', () => {
    expect(verify({ nowSeconds: NOW + WEBHOOK_REPLAY_WINDOW_SECONDS + 1 })).toEqual({
      ok: false,
      reason: 'timestamp_outside_window',
    });
  });

  it('rejects a timestamp from the future, not just a stale one', () => {
    expect(verify({ nowSeconds: NOW - WEBHOOK_REPLAY_WINDOW_SECONDS - 1 })).toEqual({
      ok: false,
      reason: 'timestamp_outside_window',
    });
  });

  it('honours a caller-supplied window', () => {
    expect(
      verify({ nowSeconds: NOW + WEBHOOK_REPLAY_WINDOW_SECONDS + 1, windowSeconds: WEBHOOK_REPLAY_WINDOW_SECONDS * 2 }),
    ).toEqual({ ok: true });
  });

  it('rejects missing or malformed headers without comparing anything', () => {
    expect(verify({ timestamp: undefined })).toEqual({ ok: false, reason: 'timestamp_missing' });
    expect(verify({ signature: undefined })).toEqual({ ok: false, reason: 'signature_missing' });
    expect(verify({ timestamp: 'not-a-number' })).toEqual({ ok: false, reason: 'timestamp_malformed' });
    expect(verify({ timestamp: '' })).toEqual({ ok: false, reason: 'timestamp_missing' });
  });

  it('rejects a signature that is the wrong shape', () => {
    expect(verify({ signature: 'deadbeef' })).toEqual({ ok: false, reason: 'signature_malformed' });
    expect(verify({ signature: 'md5=deadbeef' })).toEqual({ ok: false, reason: 'signature_malformed' });
    expect(verify({ signature: 'sha256=' })).toEqual({ ok: false, reason: 'signature_malformed' });
    expect(verify({ signature: 'sha256=abcd' })).toEqual({ ok: false, reason: 'signature_malformed' });
  });

  it('would happily verify against an empty secret, which is why env validation demands a long one', () => {
    expect(verify({ secret: '', signature: signPayload('', BODY, NOW) })).toEqual({ ok: true });
  });
});
