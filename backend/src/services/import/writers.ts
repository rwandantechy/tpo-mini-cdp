/** Dedupe and linking as SQL, so the result depends on the set of rows, not arrival order. */

import { APP_USER_ORIGIN } from '../../config/constants.js';
import type { Executor } from '../../lib/db.js';
import { buildValues, chunk, isUniqueViolation } from '../../lib/sql.js';
import type { AppUserRecord, SubscriberRecord, WebEventRecord } from './types.js';

const SUBSCRIBER_CHUNK = 500;
const APP_USER_CHUNK = 500;
const WEB_EVENT_CHUNK = 800;

interface InsertedRow {
  inserted: boolean;
}

export interface WriteResult {
  inserted: number;
  merged: number;
  rejected: Record<string, number>;
}

function reject(result: WriteResult, reason: string): void {
  result.rejected[reason] = (result.rejected[reason] ?? 0) + 1;
}

/** A unique-constraint failure retries the chunk row by row. */
async function writeInChunks<T>(
  exec: Executor,
  records: readonly T[],
  chunkSize: number,
  statement: (rows: readonly T[]) => { text: string; params: unknown[] },
  rejectionReason: string,
): Promise<WriteResult> {
  const result: WriteResult = { inserted: 0, merged: 0, rejected: {} };

  for (const batch of chunk(records, chunkSize)) {
    const { text, params } = statement(batch);
    try {
      const { rows } = await exec.query<InsertedRow>(text, params);
      result.inserted += rows.filter((row) => row.inserted).length;
      continue;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }

    for (const record of batch) {
      const single = statement([record]);
      try {
        const { rows } = await exec.query<InsertedRow>(single.text, single.params);
        result.inserted += rows.filter((row) => row.inserted).length;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        reject(result, rejectionReason);
      }
    }
  }

  const handled = records.length - Object.values(result.rejected).reduce((sum, count) => sum + count, 0);
  result.merged = handled - result.inserted;
  return result;
}

/**
 * Merge on normalized email:
 *   signup earliest, last_open latest, unsubscribed always wins,
 *   acquisition_source is first-touch, email_original is lowest byte order.
 * Text compares use collate "C" so the same input produces the same row anywhere.
 */
export function subscriberStatement(records: readonly SubscriberRecord[]): { text: string; params: unknown[] } {
  const { clause, params } = buildValues(
    records.map((record) => [
      record.emailNormalized,
      record.emailOriginal,
      record.signupDate,
      record.status,
      record.acquisitionSource,
      record.lastOpenDate,
    ]),
    ['text', 'text', 'date', 'text', 'text', 'date'],
  );

  const text = `
    insert into subscribers as s
      (email_normalized, email_original, signup_date, status, acquisition_source, last_open_date)
    select
      v.email_normalized,
      min(v.email_original collate "C"),
      min(v.signup_date),
      case when bool_or(v.status = 'unsubscribed') then 'unsubscribed' else 'active' end,
      (array_agg(v.acquisition_source order by v.signup_date asc nulls last, v.acquisition_source collate "C" asc)
        filter (where v.acquisition_source is not null))[1],
      max(v.last_open_date)
    from (values ${clause})
      as v (email_normalized, email_original, signup_date, status, acquisition_source, last_open_date)
    group by v.email_normalized
    on conflict (email_normalized) do update set
      email_original     = least(s.email_original collate "C", excluded.email_original collate "C"),
      signup_date        = least(s.signup_date, excluded.signup_date),
      last_open_date     = greatest(s.last_open_date, excluded.last_open_date),
      status             = case
                             when s.status = 'unsubscribed' or excluded.status = 'unsubscribed'
                               then 'unsubscribed'
                             else 'active'
                           end,
      acquisition_source = case
                             when excluded.signup_date is not null
                                  and (s.signup_date is null or excluded.signup_date < s.signup_date)
                               then coalesce(excluded.acquisition_source, s.acquisition_source)
                             when excluded.signup_date is not distinct from s.signup_date
                               then least(s.acquisition_source collate "C", excluded.acquisition_source collate "C")
                             else s.acquisition_source
                           end,
      updated_at         = now()
    returning (xmax = 0) as inserted
  `;

  return { text, params };
}

export function upsertSubscribers(exec: Executor, records: readonly SubscriberRecord[]): Promise<WriteResult> {
  return writeInChunks(exec, records, SUBSCRIBER_CHUNK, subscriberStatement, 'subscriber_conflict');
}

/** Link by email. Unmatched accounts keep a profile. `origin` is not overwritten. */
export function appUserStatement(records: readonly AppUserRecord[]): { text: string; params: unknown[] } {
  const { clause, params } = buildValues(
    records.map((record) => [record.userId, record.emailNormalized, record.emailOriginal, record.createdDate]),
    ['text', 'text', 'text', 'date'],
  );

  const text = `
    insert into app_users as a
      (user_id, email_normalized, email_original, created_date, origin, subscriber_id)
    select distinct on (v.user_id)
      v.user_id, v.email_normalized, v.email_original, v.created_date, '${APP_USER_ORIGIN.csv}', s.id
    from (values ${clause}) as v (user_id, email_normalized, email_original, created_date)
    left join subscribers s on s.email_normalized = v.email_normalized
    order by v.user_id, v.created_date asc nulls last
    on conflict (user_id) do update set
      email_normalized = coalesce(excluded.email_normalized, a.email_normalized),
      email_original   = coalesce(excluded.email_original, a.email_original),
      created_date     = least(a.created_date, excluded.created_date),
      subscriber_id    = coalesce(excluded.subscriber_id, a.subscriber_id)
    returning (xmax = 0) as inserted
  `;

  return { text, params };
}

export function upsertAppUsers(exec: Executor, records: readonly AppUserRecord[]): Promise<WriteResult> {
  return writeInChunks(exec, records, APP_USER_CHUNK, appUserStatement, 'app_user_email_conflict');
}

export function webVisitorStatement(records: readonly WebEventRecord[]): { text: string; params: unknown[] } {
  const { clause, params } = buildValues(
    records.map((record) => [record.visitorId, record.occurredAt]),
    ['text', 'timestamptz'],
  );

  const text = `
    insert into web_visitors as w (visitor_id, first_seen_at, last_seen_at)
    select v.visitor_id, min(v.occurred_at), max(v.occurred_at)
    from (values ${clause}) as v (visitor_id, occurred_at)
    group by v.visitor_id
    on conflict (visitor_id) do update set
      first_seen_at = least(w.first_seen_at, excluded.first_seen_at),
      last_seen_at  = greatest(w.last_seen_at, excluded.last_seen_at)
    returning (xmax = 0) as inserted
  `;

  return { text, params };
}

export function upsertWebVisitors(exec: Executor, records: readonly WebEventRecord[]): Promise<WriteResult> {
  return writeInChunks(exec, records, WEB_EVENT_CHUNK, webVisitorStatement, 'web_visitor_conflict');
}

/** Natural key is (visitor_id, page, occurred_at). The captured email is not stored here. */
export function webEventStatement(records: readonly WebEventRecord[]): { text: string; params: unknown[] } {
  const { clause, params } = buildValues(
    records.map((record) => [
      record.visitorId,
      record.page,
      record.occurredAt,
      record.utmSource,
      record.channel,
      record.capturedEmail !== null,
    ]),
    ['text', 'text', 'timestamptz', 'text', 'text', 'boolean'],
  );

  const text = `
    insert into web_events (visitor_id, page, occurred_at, utm_source, channel, email_captured)
    select distinct on (v.visitor_id, v.page, v.occurred_at)
      v.visitor_id, v.page, v.occurred_at, v.utm_source, v.channel, v.email_captured
    from (values ${clause}) as v (visitor_id, page, occurred_at, utm_source, channel, email_captured)
    order by v.visitor_id, v.page, v.occurred_at, v.email_captured desc
    on conflict (visitor_id, page, occurred_at) do nothing
    returning true as inserted
  `;

  return { text, params };
}

export function insertWebEvents(exec: Executor, records: readonly WebEventRecord[]): Promise<WriteResult> {
  return writeInChunks(exec, records, WEB_EVENT_CHUNK, webEventStatement, 'web_event_conflict');
}

export interface IdentificationResult {
  identified: number;
  unmatchedEmails: number;
}

/** Earliest captured email wins. Linking a visitor attaches every pageview it already has. */
export async function identifyWebVisitors(
  exec: Executor,
  records: readonly WebEventRecord[],
): Promise<IdentificationResult> {
  const identifying = records.filter(
    (record): record is WebEventRecord & { capturedEmail: string } => record.capturedEmail !== null,
  );
  if (identifying.length === 0) return { identified: 0, unmatchedEmails: 0 };

  let identified = 0;
  let unmatchedEmails = 0;

  for (const batch of chunk(identifying, WEB_EVENT_CHUNK)) {
    const { clause, params } = buildValues(
      batch.map((record) => [record.visitorId, record.capturedEmail, record.occurredAt]),
      ['text', 'text', 'timestamptz'],
    );

    const linked = await exec.query<{ linked: boolean }>(
      `
      with owner as (
        select distinct on (v.visitor_id) v.visitor_id, s.id as subscriber_id, v.occurred_at
        from (values ${clause}) as v (visitor_id, email_normalized, occurred_at)
        join subscribers s on s.email_normalized = v.email_normalized
        order by v.visitor_id, v.occurred_at asc, s.id asc
      )
      insert into web_visitors as w (visitor_id, subscriber_id, identified_at, first_seen_at, last_seen_at)
      select visitor_id, subscriber_id, occurred_at, occurred_at, occurred_at from owner
      on conflict (visitor_id) do update set
        subscriber_id = case
          when w.subscriber_id is null
            or excluded.identified_at < w.identified_at
            or (excluded.identified_at = w.identified_at and excluded.subscriber_id < w.subscriber_id)
            then excluded.subscriber_id
          else w.subscriber_id
        end,
        identified_at = least(w.identified_at, excluded.identified_at)
      where w.subscriber_id is null
         or excluded.identified_at < w.identified_at
         or (excluded.identified_at = w.identified_at and excluded.subscriber_id < w.subscriber_id)
      returning true as linked
      `,
      params,
    );
    identified += linked.rows.length;

    const unmatched = await exec.query<{ count: string }>(
      `
      select count(distinct v.email_normalized) as count
      from (values ${clause}) as v (visitor_id, email_normalized, occurred_at)
      left join subscribers s on s.email_normalized = v.email_normalized
      where s.id is null
      `,
      params,
    );
    unmatchedEmails += Number(unmatched.rows[0]?.count ?? 0);
  }

  return { identified, unmatchedEmails };
}
