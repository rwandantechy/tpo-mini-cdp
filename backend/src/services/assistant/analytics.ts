import { ASSISTANT_TABLE_LIMIT, COLD_WINDOW_DAYS } from '../../config/constants.js';
import { daysBeforeReference } from '../../lib/dates.js';
import { query } from '../../lib/db.js';
import { getOverview, loadSourceMix, loadTopPages } from '../overview.js';

export interface AggregateTable {
  title: string;
  rows: Array<Record<string, string | number>>;
}

export async function snapshotCounts(): Promise<Record<string, number | string>> {
  const overview = await getOverview();

  return {
    referenceDate: overview.referenceDate,
    coldWindowDays: overview.coldWindowDays,
    subscribers: overview.subscribers.total,
    active: overview.subscribers.active,
    unsubscribed: overview.subscribers.unsubscribed,
    neverOpened: overview.subscribers.neverOpened,
    coldSinceCutoff: overview.subscribers.coldSinceCutoff,
    instagramCold: overview.lists.instagramCold,
    instagramColdActive: overview.lists.instagramColdActive,
    appAccounts: overview.app.accounts,
    appLinked: overview.app.linkedToSubscriber,
    appEvents: overview.app.events,
    webVisitors: overview.web.visitors,
    webIdentified: overview.web.identified,
    pageviews: overview.web.pageviews,
  };
}

export async function subscriberBreakdown(): Promise<AggregateTable> {
  const rows = await loadSourceMix();

  return {
    title: 'Subscribers by source',
    rows: rows.map((row) => ({
      source: row.source,
      total: row.total,
      active: row.active,
      unsubscribed: row.unsubscribed,
      unsubRate: `${row.unsubRate}%`,
      share: `${row.share}%`,
    })),
  };
}

export async function topPages(limit = ASSISTANT_TABLE_LIMIT): Promise<AggregateTable> {
  const rows = await loadTopPages(limit);

  return {
    title: 'Top pages',
    rows: rows.map((row) => ({ page: row.page, views: row.views })),
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
        and e.occurred_at >= s.signup_date::timestamptz
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
