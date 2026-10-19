/** Reads the password from stdin so it stays out of shell history. */

import { createInterface } from 'node:readline/promises';

import { PASSWORD_MIN_LENGTH } from '../backend/src/config/constants.js';
import { hashPassword } from '../backend/src/lib/password.js';

async function main(): Promise<void> {
  const prompt = createInterface({ input: process.stdin, output: process.stderr });

  try {
    const password = (await prompt.question(`UI password (at least ${PASSWORD_MIN_LENGTH} characters): `)).trim();
    const hash = await hashPassword(password);

    process.stderr.write('\nAdd this line to your .env:\n\n');
    process.stdout.write(`APP_PASSWORD_HASH=${hash}\n`);
  } finally {
    prompt.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
