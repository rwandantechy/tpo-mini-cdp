import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

/** Loads the repo-root `.env`. Already-set environment variables win. */
export function loadDotenv(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, '../../../.env');

  if (existsSync(envPath)) config({ path: envPath, override: false });
}
