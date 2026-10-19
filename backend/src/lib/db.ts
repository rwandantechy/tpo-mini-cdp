import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

import { DB_CONNECT_TIMEOUT_MS, DB_IDLE_TIMEOUT_MS, DB_POOL_MAX, SLOW_QUERY_MS } from '../config/constants.js';
import { type DatabaseEnv, getDatabaseEnv } from '../config/env.js';
import { log } from './logger.js';

export interface Executor {
  query<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

let pool: Pool | null = null;

/** `no-verify` encrypts but trusts any certificate. */
function sslConfig(env: DatabaseEnv) {
  switch (env.DATABASE_SSL) {
    case 'disable':
      return false;
    case 'no-verify':
      log.warn('database TLS certificate verification is disabled');
      return { rejectUnauthorized: false };
    case 'require': {
      if (!env.DATABASE_CA_CERT) return { rejectUnauthorized: true };

      const here = dirname(fileURLToPath(import.meta.url));
      return {
        rejectUnauthorized: true,
        ca: readFileSync(resolve(here, '../../..', env.DATABASE_CA_CERT), 'utf8'),
      };
    }
  }
}

export function getPool(): Pool {
  if (pool) return pool;

  const env = getDatabaseEnv();
  pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: sslConfig(env),
    max: DB_POOL_MAX,
    idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: DB_CONNECT_TIMEOUT_MS,
  });

  pool.on('error', (error) => {
    log.error('idle database client error', { error: error.message });
  });

  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const started = Date.now();
  const result = await getPool().query<T>(text, params as unknown[]);

  const elapsed = Date.now() - started;
  if (elapsed > SLOW_QUERY_MS) log.warn('slow query', { elapsed_ms: elapsed, rows: result.rowCount });

  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch (rollbackError) {
      log.error('rollback failed', { error: (rollbackError as Error).message });
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  const closing = pool;
  pool = null;
  await closing.end();
}
