/** Sign and POST one app event. `npm run send-event` or pass a JSON body. */

import { WEBHOOK_APP_PATH } from '../backend/src/config/constants.js';
import { loadDotenv } from '../backend/src/config/dotenv.js';
import { getServerEnv } from '../backend/src/config/env.js';
import { closePool } from '../backend/src/lib/db.js';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, signPayload } from '../backend/src/lib/hmac.js';
import { createEventBody, parseEventArgs } from './send-event-utils.js';

loadDotenv();

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write('Usage: npm run send-event -- --event <name> --device <id> [--user <id>] [--event-id <id>]\n');
    return;
  }
  const env = getServerEnv();
  const url = env.WEBHOOK_URL ?? `http://127.0.0.1:${env.PORT}${WEBHOOK_APP_PATH}`;
  const options = parseEventArgs(process.argv.slice(2));
  const body = createEventBody(options);
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [TIMESTAMP_HEADER]: timestamp,
      [SIGNATURE_HEADER]: signPayload(env.WEBHOOK_SECRET, raw, timestamp),
    },
    body: raw,
  });

  const text = await response.text();
  process.stdout.write(`${response.status} ${text}\n`);
  if (!response.ok) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => closePool());
