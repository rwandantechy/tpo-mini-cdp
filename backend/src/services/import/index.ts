/** Subscribers first — app accounts and visitors link to them by email. */

import { join } from 'node:path';

import { type Executor, getPool } from '../../lib/db.js';
import { log } from '../../lib/logger.js';
import { readCsv } from './csv.js';
import { type CsvRow, parseAppUserRow, parseSubscriberRow, parseWebEventRow } from './rows.js';
import {
  countInto,
  emptyReport,
  type ImportReport,
  type ImportSummary,
  type RowOutcome,
} from './types.js';
import {
  identifyWebVisitors,
  insertWebEvents,
  upsertAppUsers,
  upsertSubscribers,
  upsertWebVisitors,
  type WriteResult,
} from './writers.js';

export interface ImportOptions {
  dataDir: string;
  exec?: Executor;
}

function validateRows<T>(
  rows: readonly CsvRow[],
  source: string,
  validate: (row: CsvRow) => RowOutcome<T>,
): { records: T[]; report: ImportReport } {
  const report = emptyReport(source);
  const records: T[] = [];

  for (const row of rows) {
    report.rowsRead += 1;
    const outcome = validate(row);

    if (!outcome.ok) {
      report.rowsSkipped += 1;
      countInto(report.skipReasons, outcome.reason);
      continue;
    }

    for (const warning of outcome.warnings) countInto(report.warnings, warning);
    records.push(outcome.record);
  }

  return { records, report };
}

function applyWriteResult(report: ImportReport, result: WriteResult): void {
  report.rowsInserted += result.inserted;
  report.rowsMerged += result.merged;

  for (const [reason, count] of Object.entries(result.rejected)) {
    report.rowsSkipped += count;
    report.skipReasons[reason] = (report.skipReasons[reason] ?? 0) + count;
  }
}

async function startRun(exec: Executor, source: string): Promise<string> {
  const { rows } = await exec.query<{ id: string }>(
    'insert into import_runs (source) values ($1) returning id',
    [source],
  );

  const id = rows[0]?.id;
  if (!id) throw new Error(`could not record the start of the ${source} import`);
  return id;
}

async function finishRun(exec: Executor, id: string, report: ImportReport): Promise<void> {
  await exec.query(
    `
    update import_runs set
      status         = 'succeeded',
      rows_read      = $2,
      rows_inserted  = $3,
      rows_merged    = $4,
      rows_skipped   = $5,
      skip_reasons   = $6::jsonb,
      warnings       = $7::jsonb,
      finished_at    = now()
    where id = $1
    `,
    [
      id,
      report.rowsRead,
      report.rowsInserted,
      report.rowsMerged,
      report.rowsSkipped,
      JSON.stringify(report.skipReasons),
      JSON.stringify(report.warnings),
    ],
  );
}

async function failRun(exec: Executor, id: string, error: unknown): Promise<void> {
  await exec.query(
    `update import_runs set status = 'failed', error = $2, finished_at = now() where id = $1`,
    [id, error instanceof Error ? error.message : String(error)],
  );
}

async function importFile<T>(
  exec: Executor,
  source: string,
  filePath: string,
  validate: (row: CsvRow) => RowOutcome<T>,
  write: (records: readonly T[], report: ImportReport) => Promise<void>,
): Promise<ImportReport> {
  const runId = await startRun(exec, source);

  try {
    const { records, report } = validateRows(readCsv(filePath), source, validate);
    await write(records, report);
    await finishRun(exec, runId, report);

    log.info('import finished', {
      source,
      rows_read: report.rowsRead,
      rows_inserted: report.rowsInserted,
      rows_merged: report.rowsMerged,
      rows_skipped: report.rowsSkipped,
    });

    return report;
  } catch (error) {
    await failRun(exec, runId, error);
    throw error;
  }
}

async function linkingStats(exec: Executor): Promise<ImportSummary['linking']> {
  const { rows } = await exec.query<{
    app_users_linked: string;
    app_users_without_subscriber: string;
    visitors_identified: string;
    visitors_anonymous: string;
  }>(`
    select
      (select count(*) from app_users   where subscriber_id is not null) as app_users_linked,
      (select count(*) from app_users   where subscriber_id is null)     as app_users_without_subscriber,
      (select count(*) from web_visitors where subscriber_id is not null) as visitors_identified,
      (select count(*) from web_visitors where subscriber_id is null)     as visitors_anonymous
  `);

  const row = rows[0];
  return {
    appUsersLinked: Number(row?.app_users_linked ?? 0),
    appUsersWithoutSubscriber: Number(row?.app_users_without_subscriber ?? 0),
    visitorsIdentified: Number(row?.visitors_identified ?? 0),
    visitorsAnonymous: Number(row?.visitors_anonymous ?? 0),
  };
}

export async function runImport(options: ImportOptions): Promise<ImportSummary> {
  const exec = options.exec ?? getPool();
  const { dataDir } = options;

  const subscribers = await importFile(
    exec,
    'subscribers.csv',
    join(dataDir, 'subscribers.csv'),
    parseSubscriberRow,
    async (records, report) => {
      applyWriteResult(report, await upsertSubscribers(exec, records));
    },
  );

  const appUsers = await importFile(
    exec,
    'app_users.csv',
    join(dataDir, 'app_users.csv'),
    parseAppUserRow,
    async (records, report) => {
      applyWriteResult(report, await upsertAppUsers(exec, records));
    },
  );

  const webEvents = await importFile(
    exec,
    'web_events.csv',
    join(dataDir, 'web_events.csv'),
    parseWebEventRow,
    async (records, report) => {
      await upsertWebVisitors(exec, records);
      applyWriteResult(report, await insertWebEvents(exec, records));

      const identification = await identifyWebVisitors(exec, records);
      if (identification.unmatchedEmails > 0) {
        report.warnings.captured_email_unmatched = identification.unmatchedEmails;
      }
    },
  );

  return { subscribers, appUsers, webEvents, linking: await linkingStats(exec) };
}
