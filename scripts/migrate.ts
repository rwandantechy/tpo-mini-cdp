/** Apply each SQL file once. `npm run migrate` */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadDotenv } from '../backend/src/config/dotenv.js';
import { closePool, getPool } from '../backend/src/lib/db.js';

loadDotenv();

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../supabase/migrations');

async function main(): Promise<void> {
  const pool = getPool();

  await pool.query(`
    create table if not exists schema_migrations (
      filename   text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const { rows } = await pool.query<{ filename: string }>('select filename from schema_migrations');
  const applied = new Set(rows.map((row) => row.filename));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const filename of files) {
    if (applied.has(filename)) {
      console.log(`  already applied  ${filename}`);
      continue;
    }

    const sql = readFileSync(join(MIGRATIONS_DIR, filename), 'utf8');
    const client = await pool.connect();

    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations (filename) values ($1)', [filename]);
      await client.query('commit');
      console.log(`  applied          ${filename}`);
      count += 1;
    } catch (error) {
      await client.query('rollback');
      throw new Error(`${filename} failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      client.release();
    }
  }

  console.log(count === 0 ? '\nSchema already up to date.' : `\nApplied ${count} migration(s).`);
}

main()
  .catch((error: unknown) => {
    console.error(`\nMigration failed. ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(closePool);
