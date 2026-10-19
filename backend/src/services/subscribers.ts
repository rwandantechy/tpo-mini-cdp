import { ACTIVITY_LIMIT, SEARCH_LIMIT } from '../config/constants.js';
import { query, queryOne } from '../lib/db.js';
import { normalizeEmail } from '../lib/email.js';

export interface SubscriberHit {
  id: string;
  email: string;
  status: string;
  acquisitionSource: string | null;
  signupDate: string | null;
  lastOpenDate: string | null;
}

export interface SubscriberProfile {
  subscriber: SubscriberHit & { emailNormalized: string };
  website: {
    visitors: number;
    pageviews: WebVisit[];
  };
  app: {
    accounts: AppAccount[];
    events: AppEvent[];
  };
}

interface SubscriberRow {
  id: string;
  email_original: string;
  email_normalized: string;
  status: string;
  acquisition_source: string | null;
  signup_date: Date | string | null;
  last_open_date: Date | string | null;
}

interface WebVisitRow {
  visitor_id: string;
  page: string;
  occurred_at: Date;
  utm_source: string | null;
  channel: string | null;
  email_captured: boolean;
}

interface AppAccountRow {
  user_id: string;
  email_original: string | null;
  created_date: Date | string | null;
  origin: string;
}

interface AppEventRow {
  event_id: string;
  event: string;
  device_id: string;
  occurred_at: Date;
  received_at: Date;
  properties: Record<string, unknown>;
  resolved_user_id: string | null;
}

export interface WebVisit {
  visitorId: string;
  page: string;
  occurredAt: string;
  utmSource: string | null;
  channel: string | null;
  emailCaptured: boolean;
}

export interface AppAccount {
  userId: string;
  email: string | null;
  createdDate: string | null;
  origin: string;
}

export interface AppEvent {
  eventId: string;
  event: string;
  deviceId: string;
  occurredAt: string;
  receivedAt: string;
  properties: Record<string, unknown>;
  userId: string | null;
}

function isoDate(value: Date | string | null): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function isoTime(value: Date): string {
  return value.toISOString();
}

function toHit(row: SubscriberRow): SubscriberHit {
  return {
    id: row.id,
    email: row.email_original,
    status: row.status,
    acquisitionSource: row.acquisition_source,
    signupDate: isoDate(row.signup_date),
    lastOpenDate: isoDate(row.last_open_date),
  };
}

export interface SubscriberPage {
  results: SubscriberHit[];
  total: number;
  limit: number;
  offset: number;
}

export async function searchSubscribers(
  rawQuery: string,
  options: { limit?: number; offset?: number } = {},
): Promise<SubscriberPage> {
  const needle = normalizeEmail(rawQuery);
  const limit = options.limit ?? SEARCH_LIMIT;
  const offset = options.offset ?? 0;

  const rows = await query<SubscriberRow & { total: string }>(
    `
    select id, email_original, email_normalized, status, acquisition_source, signup_date, last_open_date,
           count(*) over() as total
    from subscribers
    where position($1 in email_normalized) > 0
       or position($1 in lower(email_original)) > 0
    order by
      case
        when email_normalized = $1 then 0
        when starts_with(email_normalized, $1) then 1
        else 2
      end,
      email_normalized
    limit $2
    offset $3
    `,
    [needle, limit, offset],
  );

  return {
    results: rows.map(toHit),
    total: Number(rows[0]?.total ?? 0),
    limit,
    offset,
  };
}

export async function getSubscriberProfile(id: string): Promise<SubscriberProfile | null> {
  const row = await queryOne<SubscriberRow>(
    `
    select id, email_original, email_normalized, status, acquisition_source, signup_date, last_open_date
    from subscribers
    where id = $1
    `,
    [id],
  );

  if (!row) return null;

  const [visits, accounts, events] = await Promise.all([
    query<WebVisitRow>(
      `
      select e.visitor_id, e.page, e.occurred_at, e.utm_source, e.channel, e.email_captured
      from web_events e
      join web_visitors v on v.visitor_id = e.visitor_id
      where v.subscriber_id = $1
      order by e.occurred_at desc
      limit $2
      `,
      [id, ACTIVITY_LIMIT],
    ),
    query<AppAccountRow>(
      `
      select user_id, email_original, created_date, origin
      from app_users
      where subscriber_id = $1
      order by user_id
      `,
      [id],
    ),
    query<AppEventRow>(
      `
      select event_id, event, device_id, occurred_at, received_at, properties, resolved_user_id
      from app_events
      where resolved_user_id in (select user_id from app_users where subscriber_id = $1)
      order by occurred_at desc
      limit $2
      `,
      [id, ACTIVITY_LIMIT],
    ),
  ]);

  const visitorIds = new Set(visits.map((visit) => visit.visitor_id));

  return {
    subscriber: { ...toHit(row), emailNormalized: row.email_normalized },
    website: {
      visitors: visitorIds.size,
      pageviews: visits.map((visit) => ({
        visitorId: visit.visitor_id,
        page: visit.page,
        occurredAt: isoTime(visit.occurred_at),
        utmSource: visit.utm_source,
        channel: visit.channel,
        emailCaptured: visit.email_captured,
      })),
    },
    app: {
      accounts: accounts.map((account) => ({
        userId: account.user_id,
        email: account.email_original,
        createdDate: isoDate(account.created_date),
        origin: account.origin,
      })),
      events: events.map((event) => ({
        eventId: event.event_id,
        event: event.event,
        deviceId: event.device_id,
        occurredAt: isoTime(event.occurred_at),
        receivedAt: isoTime(event.received_at),
        properties: event.properties,
        userId: event.resolved_user_id,
      })),
    },
  };
}
