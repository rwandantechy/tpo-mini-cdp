/** Sign and POST one app event. `npm run send-event` or pass a JSON body. */

import { randomUUID } from 'node:crypto';

import { SAMPLE_APP_EVENT, WEBHOOK_APP_PATH } from '../backend/src/config/constants.js';
import { loadDotenv } from '../backend/src/config/dotenv.js';
import { getServerEnv } from '../backend/src/config/env.js';
import { closePool, queryOne } from '../backend/src/lib/db.js';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, signPayload } from '../backend/src/lib/hmac.js';

loadDotenv();

interface LinkedUser {
  user_id: string;
  email_original: string | null;
}

async function sampleBody(): Promise<{ body: Record<string, unknown>; note?: string }> {
  const linked = await queryOne<LinkedUser>(
    `
    select user_id, email_original
    from app_users
    where subscriber_id is not null
    order by user_id
    limit 1
    `,
  );

  const userId = linked?.user_id ?? SAMPLE_APP_EVENT.user_id;
  const note = linked?.email_original
    ? `${SAMPLE_APP_EVENT.event} for ${linked.email_original} — search that person and hit Refresh`
    : 'unknown user (no linked app account in the database yet)';

  return {
    note,
    body: {
      ...SAMPLE_APP_EVENT,
      event_id: `evt_${randomUUID()}`,
      user_id: userId,
    },
  };
}

async function main(): Promise<void> {
  const env = getServerEnv();
  const url = env.WEBHOOK_URL ?? `http://127.0.0.1:${env.PORT}${WEBHOOK_APP_PATH}`;
  const prepared = process.argv[2]
    ? { body: JSON.parse(process.argv[2]) as unknown, note: undefined }
    : await sampleBody();
  const raw = JSON.stringify(prepared.body);
  const timestamp = String(Math.floor(Date.now() / 1000));

  if (prepared.note) process.stderr.write(`${prepared.note}\n`);

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
