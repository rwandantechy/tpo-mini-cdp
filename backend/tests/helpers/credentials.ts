import { randomBytes } from 'node:crypto';

/** Random per run so tests never ship a password-shaped literal. */
export function randomCredential(label: string): string {
  return `${label}-${randomBytes(24).toString('hex')}`;
}

export const TEST_PASSWORD = randomCredential('pw');
export const TEST_SESSION_SECRET = randomCredential('session');
export const TEST_WEBHOOK_SECRET = randomCredential('webhook');
