import { describe, expect, it } from 'vitest';

import { SESSION_SUBJECT } from '../src/config/constants.js';
import { createSessionToken, verifySessionToken } from '../src/lib/session.js';
import { randomCredential, TEST_SESSION_SECRET as SECRET } from './helpers/credentials.js';

const NOW = 1_790_000_000;

describe('session tokens', () => {
  it('round-trips the subject and expiry', () => {
    const token = createSessionToken(SECRET, SESSION_SUBJECT, NOW, 3600);
    const payload = verifySessionToken(SECRET, token, NOW);

    expect(payload).toEqual({ sub: SESSION_SUBJECT, iat: NOW, exp: NOW + 3600 });
  });

  it('expires', () => {
    const token = createSessionToken(SECRET, SESSION_SUBJECT, NOW, 3600);

    expect(verifySessionToken(SECRET, token, NOW + 3599)).not.toBeNull();
    expect(verifySessionToken(SECRET, token, NOW + 3600)).toBeNull();
    expect(verifySessionToken(SECRET, token, NOW + 99_999)).toBeNull();
  });

  it('rejects a token signed with a different secret, so rotating it logs everyone out', () => {
    const token = createSessionToken(SECRET, SESSION_SUBJECT, NOW, 3600);

    expect(verifySessionToken(randomCredential('rotated'), token, NOW)).toBeNull();
  });

  it('rejects an edited payload', () => {
    const token = createSessionToken(SECRET, SESSION_SUBJECT, NOW, 3600);
    const [, signature] = token.split('.');

    const forged = Buffer.from(JSON.stringify({ sub: SESSION_SUBJECT, iat: NOW, exp: NOW + 9_999_999 }), 'utf8').toString(
      'base64url',
    );

    expect(verifySessionToken(SECRET, `${forged}.${signature}`, NOW)).toBeNull();
  });

  it('rejects junk instead of throwing', () => {
    const payloadThatIsNotJson = Buffer.from('not-json', 'utf8').toString('base64url');

    expect(verifySessionToken(SECRET, undefined, NOW)).toBeNull();
    expect(verifySessionToken(SECRET, '', NOW)).toBeNull();
    expect(verifySessionToken(SECRET, 'no-separator', NOW)).toBeNull();
    expect(verifySessionToken(SECRET, '.', NOW)).toBeNull();
    expect(verifySessionToken(SECRET, `${payloadThatIsNotJson}.${'0'.repeat(16)}`, NOW)).toBeNull();
    expect(verifySessionToken(SECRET, `${'x'.repeat(50)}.${'y'.repeat(64)}`, NOW)).toBeNull();
  });

  it('carries no secret, only an audience and an expiry', () => {
    const token = createSessionToken(SECRET, SESSION_SUBJECT, NOW, 3600);
    const decoded = Buffer.from(token.split('.')[0] ?? '', 'base64url').toString('utf8');

    expect(JSON.parse(decoded)).toEqual({ sub: SESSION_SUBJECT, iat: NOW, exp: NOW + 3600 });
    expect(decoded).not.toContain(SECRET);
  });
});
