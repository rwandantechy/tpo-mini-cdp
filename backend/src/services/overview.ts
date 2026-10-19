import { query } from '../lib/db.js';
import { COLD_WINDOW_DAYS } from '../config/constants.js';
import { daysBeforeReference, referenceDate } from '../lib/dates.js';

export interface Overview {
  referenceDate: string;
  coldWindowDays: number;
  subscribers: {
    total: number;
    active: number;
    unsubscribed: number;
    neverOpened: number;
    coldSinceCutoff: number;
  };
  app: {
    accounts: number;
    linkedToSubscriber: number;
    withoutSubscriber: number;
    events: number;
  };
  web: {
    visitors: number;
    identified: number;
    anonymous: number;
    pageviews: number;
  };
  lastImports: ImportRunSummary[];
}

export interface ImportRunSummary {
  source: string;
  status: string;
  rowsRead: number;
  rowsInserted: number;
  rowsMerged: number;
  rowsSkipped: number;
  skipReasons: Record<string, number>;
  warnings: Record<string, number>;
  finishedAt: string | null;
}

interface CountsRow {
  subscribers: string;
  active: string;
  unsubscribed: string;
  never_opened: string;
  cold: string;
  app_accounts: string;
  app_linked: string;
  app_events: string;
  visitors: string;
  visitors_identified: string;
  pageviews: string;
}

export async function getOverview(): Promise<Overview> {
  const cutoff = daysBeforeReference(COLD_WINDOW_DAYS);

  const rows = await query<CountsRow>(
    `
    select
      (select count(*) from subscribers)                                        as subscribers,
      (select count(*) from subscribers where status = 'active')                as active,
      (select count(*) from subscribers where status = 'unsubscribed')          as unsubscribed,
      (select count(*) from subscribers where last_open_date is null)           as never_opened,
      (select count(*) from subscribers
        where last_open_date is null or last_open_date < $1::date)              as cold,
      (select count(*) from app_users)                                          as app_accounts,
      (select count(*) from app_users where subscriber_id is not null)           as app_linked,
      (select count(*) from app_events)                                          as app_events,
      (select count(*) from web_visitors)                                        as visitors,
      (select count(*) from web_visitors where subscriber_id is not null)        as visitors_identified,
      (select count(*) from web_events)                                          as pageviews
    `,
    [cutoff],
  );

  const row = rows[0];
  const number = (value: string | undefined): number => Number(value ?? 0);

  const accounts = number(row?.app_accounts);
  const linked = number(row?.app_linked);
  const visitors = number(row?.visitors);
  const identified = number(row?.visitors_identified);

  return {
    referenceDate: referenceDate(),
    coldWindowDays: COLD_WINDOW_DAYS,
    subscribers: {
      total: number(row?.subscribers),
      active: number(row?.active),
      unsubscribed: number(row?.unsubscribed),
      neverOpened: number(row?.never_opened),
      coldSinceCutoff: number(row?.cold),
    },
    app: {
      accounts,
      linkedToSubscriber: linked,
      withoutSubscriber: accounts - linked,
      events: number(row?.app_events),
    },
    web: {
      visitors,
      identified,
      anonymous: visitors - identified,
      pageviews: number(row?.pageviews),
    },
    lastImports: await getLastImports(),
  };
}

interface ImportRunRow {
  source: string;
  status: string;
  rows_read: number;
  rows_inserted: number;
  rows_merged: number;
  rows_skipped: number;
  skip_reasons: Record<string, number>;
  warnings: Record<string, number>;
  finished_at: Date | null;
}

async function getLastImports(): Promise<ImportRunSummary[]> {
  const rows = await query<ImportRunRow>(`
    select distinct on (source)
      source, status, rows_read, rows_inserted, rows_merged, rows_skipped,
      skip_reasons, warnings, finished_at
    from import_runs
    order by source, started_at desc
  `);

  return rows.map((row) => ({
    source: row.source,
    status: row.status,
    rowsRead: row.rows_read,
    rowsInserted: row.rows_inserted,
    rowsMerged: row.rows_merged,
    rowsSkipped: row.rows_skipped,
    skipReasons: row.skip_reasons,
    warnings: row.warnings,
    finishedAt: row.finished_at?.toISOString() ?? null,
  }));
}
