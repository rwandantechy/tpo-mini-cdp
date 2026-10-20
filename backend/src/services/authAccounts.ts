import { query } from '../lib/db.js';
import { normalizeEmail } from '../lib/email.js';

export interface AuthAccount {
  id: string;
  email: string;
  emailNormalized: string;
  passwordHash: string;
}

interface AuthAccountRow {
  id: string;
  email_original: string;
  email_normalized: string;
  password_hash: string;
}

export async function findAuthAccountByEmail(email: string): Promise<AuthAccount | null> {
  const rows = await query<AuthAccountRow>(
    `select id, email_original, email_normalized, password_hash
     from auth_accounts where email_normalized = $1`,
    [normalizeEmail(email)],
  );
  const row = rows[0];
  return row ? {
    id: row.id,
    email: row.email_original,
    emailNormalized: row.email_normalized,
    passwordHash: row.password_hash,
  } : null;
}

export async function createAuthAccount(email: string, passwordHash: string): Promise<void> {
  await query(
    `insert into auth_accounts (email_normalized, email_original, password_hash)
     values ($1, $2, $3)`,
    [normalizeEmail(email), email.trim(), passwordHash],
  );
}
