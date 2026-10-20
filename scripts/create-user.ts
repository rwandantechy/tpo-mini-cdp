/** Create a dashboard login without exposing public signup. */

import { createInterface } from 'node:readline/promises';
import { stdin, stderr } from 'node:process';
import { z } from 'zod';

import { loadDotenv } from '../backend/src/config/dotenv.js';
import { closePool } from '../backend/src/lib/db.js';
import { hashPassword } from '../backend/src/lib/password.js';
import { createAuthAccount } from '../backend/src/services/authAccounts.js';

loadDotenv();

function readSecret(label: string): Promise<string> {
  if (!stdin.isTTY) throw new Error('Run npm run create-user in an interactive terminal.');

  return new Promise((resolve, reject) => {
    stderr.write(label);
    stdin.setRawMode(true);
    stdin.resume();
    let value = '';

    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') {
          cleanup();
          stderr.write('\n');
          reject(new Error('Cancelled.'));
          return;
        }
        if (char === '\r' || char === '\n') {
          cleanup();
          stderr.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u007f' || char === '\b') {
          value = Array.from(value).slice(0, -1).join('');
        } else if (char >= ' ') {
          value += char;
        }
      }
    };

    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const prompt = createInterface({ input: stdin, output: stderr });
  let email: string;
  try {
    email = z.string().trim().email().max(254).parse(await prompt.question('Account email: '));
  } finally {
    prompt.close();
  }

  const password = await readSecret('Password (at least 12 characters): ');
  const confirmation = await readSecret('Confirm password: ');
  if (password !== confirmation) throw new Error('Passwords do not match.');

  await createAuthAccount(email, await hashPassword(password));
  stderr.write(`Created dashboard account for ${email.trim()}\n`);
}

main()
  .catch((error: unknown) => {
    const code = (error as { code?: string })?.code;
    if (code === '23505') {
      stderr.write('An account with that email already exists.\n');
      process.exitCode = 1;
      return;
    }
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(closePool);
