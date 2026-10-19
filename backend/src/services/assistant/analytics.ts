import { ASSISTANT_TABLE_LIMIT, COLD_WINDOW_DAYS, INSTAGRAM_COLD_PRESET } from '../../config/constants.js';
import { daysBeforeReference } from '../../lib/dates.js';
import { query } from '../../lib/db.js';
import { getOverview } from '../overview.js';
import { countSegment } from '../segments.js';

export interface AggregateTable {
  title: string;
  rows: Array<Record<string, string | number>>;
}

export async function snapshotCounts(): Promise<Record<string, number | string>> {
  const [overview, instagramCold, instagramColdActive] = await Promise.all([
    getOverview(),
    countSegment({ ...INSTAGRAM_COLD_PRESET }),
    countSegment({ ...INSTAGRAM_COLD_PRESET, status: 'active' }),
  ]);

  return {
    referenceDate: overview.referenceDate,
    coldWindowDays: overview.coldWindowDays,
    subscribers: overview.subscribers.total,
    active: overview.subscribers.active,
    unsubscribed: overview.subscribers.unsubscribed,
    neverOpened: overview.subscribers.neverOpened,
    coldSinceCutoff: overview.subscribers.coldSinceCutoff,
    instagramCold: instagramCold.total,
    instagramColdActive: instagramColdActive.total,
    appAccounts: overview.app.accounts,
    appLinked: overview.app.linkedToSubscriber,
    appEvents: overview.app.events,
    webVisitors: overview.web.visitors,
    webIdentified: overview.web.identified,
    pageviews: overview.web.pageviews,
  };
}

export async function subscriberBreakdown(): Promise<AggregateTable> {
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

  return {
    title: 'Subscribers by source',
    rows: grouped.map((row) => ({
      source: row.source,
      total: row.total,
      active: row.active,
      unsubscribed: row.unsubscribed,
      unsubRate: percent(row.unsubscribed, row.total),
      share: percent(row.total, all),
    })),
  };
}

function percent(part: number, whole: number): string {
  if (whole <= 0) return '0%';
  return `${Math.round((part / whole) * 100)}%`;
}

export async function topPages(limit = ASSISTANT_TABLE_LIMIT): Promise<AggregateTable> {
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

  return {
    title: 'Top pages',
    rows: rows.map((row) => ({ page: row.page, views: Number(row.views) })),
  };
}

/** First identified pageview after signup, grouped. No visitor or email fields. */
export async function firstPagesForNewSubscribers(
  days = COLD_WINDOW_DAYS,
  limit = ASSISTANT_TABLE_LIMIT,
): Promise<AggregateTable> {
  const from = daysBeforeReference(days);
  const rows = await query<{ page: string; readers: string }>(
    `
    with first_hit as (
      select distinct on (v.subscriber_id) e.page
      from web_events e
      join web_visitors v on v.visitor_id = e.visitor_id
      join subscribers s on s.id = v.subscriber_id
      where s.signup_date is not null
        and s.signup_date >= $1::date
      order by v.subscriber_id, e.occurred_at
    )
    select page, count(*) as readers
    from first_hit
    group by page
    order by count(*) desc, page
    limit $2
    `,
    [from, limit],
  );

  return {
    title: `First pages for people who signed up since ${from}`,
    rows: rows.map((row) => ({ page: row.page, readers: Number(row.readers) })),
  };
}
