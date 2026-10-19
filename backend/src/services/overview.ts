import {
  COLD_WINDOW_DAYS,
  ENGAGED_PRESET,
  INSTAGRAM_COLD_PRESET,
  OVERVIEW_PAGE_LIMIT,
} from '../config/constants.js';
import { daysBeforeReference, referenceDate } from '../lib/dates.js';
import { query } from '../lib/db.js';
import { countSegment } from './segments.js';

export interface SourceMixRow {
  source: string;
  total: number;
  active: number;
  unsubscribed: number;
  unsubRate: number;
  share: number;
}

export interface PageViewRow {
  page: string;
  views: number;
}

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
  sources: SourceMixRow[];
  pages: PageViewRow[];
  lists: {
    instagramCold: number;
    instagramColdActive: number;
    engaged: number;
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

  const [rows, sources, pages, lastImports, instagramCold, instagramColdActive, engaged] = await Promise.all([
    query<CountsRow>(
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
    ),
    loadSourceMix(),
    loadTopPages(OVERVIEW_PAGE_LIMIT),
    getLastImports(),
    countSegment({ ...INSTAGRAM_COLD_PRESET }),
    countSegment({ ...INSTAGRAM_COLD_PRESET, status: 'active' }),
    countSegment({ ...ENGAGED_PRESET }),
  ]);

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
    sources,
    pages,
    lists: {
      instagramCold: instagramCold.total,
      instagramColdActive: instagramColdActive.total,
      engaged: engaged.total,
    },
    lastImports,
  };
}

export async function loadSourceMix(): Promise<SourceMixRow[]> {
  const rows = await query<{ source: string | null; status: string; count: string }>(
    `
    select acquisition_source as source, status, count(*) as count
    from subscribers
    group by acquisition_source, status
    order by count(*) desc, acquisition_source
    `,
  );

  const bySource = new Map<string, { active: number; unsubscribed: number }>();
  for (const row of rows) {
    const source = row.source ?? '(none)';
    const current = bySource.get(source) ?? { active: 0, unsubscribed: 0 };
    if (row.status === 'unsubscribed') current.unsubscribed += Number(row.count);
    else current.active += Number(row.count);
    bySource.set(source, current);
  }

  const grouped = [...bySource.entries()].map(([source, counts]) => ({
    source,
    total: counts.active + counts.unsubscribed,
    active: counts.active,
    unsubscribed: counts.unsubscribed,
  }));
  grouped.sort((left, right) => right.total - left.total || left.source.localeCompare(right.source));
  const all = grouped.reduce((sum, row) => sum + row.total, 0);

  return grouped.map((row) => ({
    ...row,
    unsubRate: percent(row.unsubscribed, row.total),
    share: percent(row.total, all),
  }));
}

export async function loadTopPages(limit: number): Promise<PageViewRow[]> {
  const rows = await query<{ page: string; views: string }>(
    `
    select page, count(*) as views
    from web_events
    group by page
    order by count(*) desc, page
    limit $1
    `,
    [limit],
  );

  return rows.map((row) => ({ page: row.page, views: Number(row.views) }));
}

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
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
