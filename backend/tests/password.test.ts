import { describe, expect, it } from 'vitest';

import { PASSWORD_MIN_LENGTH } from '../src/config/constants.js';
import { hashPassword, verifyPassword } from '../src/lib/password.js';
import { randomCredential } from './helpers/credentials.js';

const PASSWORD = randomCredential('pw');
const WRONG_PASSWORD = randomCredential('pw');

describe('password hashing', () => {
  it('accepts the right password and rejects a wrong one', async () => {
    const stored = await hashPassword(PASSWORD);

    await expect(verifyPassword(PASSWORD, stored)).resolves.toBe(true);
    await expect(verifyPassword(WRONG_PASSWORD, stored)).resolves.toBe(false);
    await expect(verifyPassword('', stored)).resolves.toBe(false);
  });

  it('never stores the password, and salts so two hashes differ', async () => {
    const first = await hashPassword(PASSWORD);
    const second = await hashPassword(PASSWORD);

    expect(first).not.toBe(second);
    expect(first).not.toContain(PASSWORD);
    expect(first).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
  });

  it('refuses a password too short to be worth hashing', async () => {
    await expect(hashPassword('short')).rejects.toThrow(new RegExp(`at least ${PASSWORD_MIN_LENGTH}`));
  });

  it('returns false for a malformed stored hash instead of throwing', async () => {
    await expect(verifyPassword(PASSWORD, '')).resolves.toBe(false);
    await expect(verifyPassword(PASSWORD, 'not-a-hash-at-all')).resolves.toBe(false);
    await expect(verifyPassword(PASSWORD, 'bcrypt:abc:def')).resolves.toBe(false);
    await expect(verifyPassword(PASSWORD, 'scrypt:abc:tooshort')).resolves.toBe(false);
  });
});
