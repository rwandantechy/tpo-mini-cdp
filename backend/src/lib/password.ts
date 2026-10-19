/** scrypt hash stored as `scrypt:<salt hex>:<key hex>`. */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { PASSWORD_MIN_LENGTH } from '../config/constants.js';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const SALT_BYTES = 16;
const KEY_BYTES = 64;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }

  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, KEY_BYTES);
  return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split(':');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;

  const expected = Buffer.from(keyHex, 'hex');
  if (expected.length !== KEY_BYTES) return false;

  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), KEY_BYTES);
  return timingSafeEqual(actual, expected);
}
