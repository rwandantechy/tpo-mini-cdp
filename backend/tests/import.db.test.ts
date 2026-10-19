import { afterAll, describe, expect, it } from 'vitest';

import { closePool, query, withTransaction } from '../src/lib/db.js';
import { subscriberStatement } from '../src/services/import/writers.js';
import type { SubscriberRecord } from '../src/services/import/types.js';
import { hasDatabase, RollbackSignal } from './helpers/database.js';

const describeDb = hasDatabase ? describe : describe.skip;

async function count(sql: string, params: readonly unknown[] = []): Promise<number> {
  const rows = await query<{ count: string }>(sql, params);
  return Number(rows[0]?.count ?? -1);
}

afterAll(closePool);

describeDb('subscribers after import', () => {
  it('holds one row per person: 2,995 source rows became 2,900 subscribers', async () => {
    expect(await count('select count(*) as count from subscribers')).toBe(2900);
  });

  it('cannot hold a duplicate normalized email, because the constraint forbids it', async () => {
    expect(await count('select count(*) as count from (select 1 from subscribers group by email_normalized having count(*) > 1) d')).toBe(0);
  });

  it('stores every email already normalized', async () => {
    expect(await count("select count(*) as count from subscribers where email_normalized <> lower(trim(email_normalized))")).toBe(0);
  });

  it('merged the case variant of emily.miller827 into a single row, keeping the field values', async () => {
    const rows = await query<{
      email_original: string;
      signup_date: Date;
      status: string;
      acquisition_source: string;
      last_open_date: Date;
    }>(
      `select email_original, signup_date, status, acquisition_source, last_open_date
       from subscribers where email_normalized = $1`,
      ['emily.miller827@gmail.com'],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('active');
    expect(rows[0]?.acquisition_source).toBe('Instagram');
    expect(rows[0]?.signup_date.toISOString().slice(0, 10)).toBe('2026-07-04');
    expect(rows[0]?.last_open_date.toISOString().slice(0, 10)).toBe('2026-09-04');
    expect(rows[0]?.email_original).toBe('EMILY.MILLER827@GMAIL.COM');
  });

  it('collapsed the whitespace-padded duplicate of zoe.allen235', async () => {
    expect(await count('select count(*) as count from subscribers where email_normalized = $1', ['zoe.allen235@gmail.com'])).toBe(1);
  });

  it('did not invent subscribers for the unusable rows', async () => {
    expect(await count('select count(*) as count from subscribers where email_normalized in ($1, $2)', ['not-an-email', '@gmail.com'])).toBe(0);
    expect(await count("select count(*) as count from subscribers where email_normalized = ''")).toBe(0);
  });

  it('recorded the import honestly, including the skipped rows', async () => {
    const rows = await query<{ rows_read: number; rows_skipped: number; skip_reasons: Record<string, number> }>(
      `select rows_read, rows_skipped, skip_reasons from import_runs
       where source = 'subscribers.csv' and status = 'succeeded'
       order by started_at asc limit 1`,
    );

    expect(rows[0]?.rows_read).toBe(2995);
    expect(rows[0]?.rows_skipped).toBe(10);
    expect(rows[0]?.skip_reasons).toEqual({ email_missing: 8, email_malformed: 2 });
  });
});

describeDb('app accounts after import', () => {
  it('kept all 930 accounts', async () => {
    expect(await count('select count(*) as count from app_users')).toBe(930);
  });

  it('linked the 900 whose email matches a subscriber', async () => {
    expect(await count('select count(*) as count from app_users where subscriber_id is not null')).toBe(900);
  });

  it('gave the 30 unmatched accounts a profile instead of dropping them', async () => {
    expect(await count('select count(*) as count from app_users where subscriber_id is null')).toBe(30);
    expect(
      await count("select count(*) as count from app_users where subscriber_id is null and email_normalized ~ '^appuser[0-9]+@gmail\\.com$'"),
    ).toBe(30);
  });

  it('links by normalized email, so an uppercase CSV row still matches', async () => {
    const rows = await query<{ linked: boolean }>(
      `select (a.subscriber_id = s.id) as linked
       from app_users a join subscribers s on s.email_normalized = a.email_normalized
       where a.email_normalized = $1`,
      ['paul.garcia558@gmail.com'],
    );

    expect(rows[0]?.linked).toBe(true);
  });
});

describeDb('website activity after import', () => {
  it('kept every pageview', async () => {
    expect(await count('select count(*) as count from web_events')).toBe(10000);
  });

  it('identified 1,400 visitors and left 628 anonymous', async () => {
    expect(await count('select count(*) as count from web_visitors')).toBe(2028);
    expect(await count('select count(*) as count from web_visitors where subscriber_id is not null')).toBe(1400);
    expect(await count('select count(*) as count from web_visitors where subscriber_id is null')).toBe(628);
  });

  it('attached the 1,930 pageviews that happened before identification', async () => {
    expect(
      await count(`
        select count(*) as count
        from web_events e
        join web_visitors v on v.visitor_id = e.visitor_id
        where v.subscriber_id is not null and e.occurred_at < v.identified_at
      `),
    ).toBe(1930);
  });

  it('never stored a captured email on an event row', async () => {
    const columns = await query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'web_events'`,
    );

    expect(columns.map((column) => column.column_name)).not.toContain('email');
    expect(await count('select count(*) as count from web_events where email_captured')).toBe(1400);
  });

  it('mapped twitter to X so channel filters agree across both files', async () => {
    expect(await count("select count(*) as count from web_events where utm_source = 'twitter' and channel = 'X'")).toBe(50);
    expect(await count('select count(*) as count from web_events where utm_source is not null and channel is null')).toBe(0);
  });
});

describeDb('segment arithmetic against the reference date', () => {
  it('finds 229 Instagram signups who have not opened in 30 days, 174 of them still active', async () => {
    const cold = `
      from subscribers
      where acquisition_source = 'Instagram'
        and (last_open_date is null or last_open_date < date '2026-08-29')
    `;

    expect(await count(`select count(*) as count ${cold}`)).toBe(229);
    expect(await count(`select count(*) as count ${cold} and status = 'active'`)).toBe(174);
    expect(await count(`select count(*) as count ${cold} and last_open_date is null`)).toBe(146);
  });
});

describeDb('merge rules, proven inside a rolled-back transaction', () => {
  const base: SubscriberRecord = {
    emailNormalized: 'merge.rule.probe@example.com',
    emailOriginal: 'merge.rule.probe@example.com',
    signupDate: '2026-08-01',
    status: 'active',
    acquisitionSource: 'Google',
    lastOpenDate: '2026-09-01',
  };

  async function mergeTwo(second: Partial<SubscriberRecord>) {
    let merged: Record<string, unknown> = {};

    await expect(
      withTransaction(async (client) => {
        for (const record of [base, { ...base, ...second }]) {
          const { text, params } = subscriberStatement([record]);
          await client.query(text, params);
        }

        const { rows } = await client.query(
          'select signup_date, last_open_date, status, acquisition_source from subscribers where email_normalized = $1',
          [base.emailNormalized],
        );
        merged = rows[0] as Record<string, unknown>;

        throw new RollbackSignal();
      }),
    ).rejects.toThrow(RollbackSignal);

    return merged;
  }

  it('keeps the earliest signup date and the latest open date', async () => {
    const merged = await mergeTwo({ signupDate: '2026-07-15', lastOpenDate: '2026-09-20' });

    expect((merged.signup_date as Date).toISOString().slice(0, 10)).toBe('2026-07-15');
    expect((merged.last_open_date as Date).toISOString().slice(0, 10)).toBe('2026-09-20');
  });

  it('lets unsubscribed win, in either arrival order', async () => {
    expect((await mergeTwo({ status: 'unsubscribed' })).status).toBe('unsubscribed');
    expect((await mergeTwo({ status: 'unsubscribed', signupDate: '2026-07-01' })).status).toBe('unsubscribed');
  });

  it('attributes the source to the earliest signup, not the last row seen', async () => {
    const merged = await mergeTwo({ signupDate: '2026-07-15', acquisitionSource: 'Instagram' });
    expect(merged.acquisition_source).toBe('Instagram');

    const later = await mergeTwo({ signupDate: '2026-09-15', acquisitionSource: 'Instagram' });
    expect(later.acquisition_source).toBe('Google');
  });

  it('fills a missing date from the other row rather than nulling it', async () => {
    const merged = await mergeTwo({ signupDate: null, lastOpenDate: null });

    expect((merged.signup_date as Date).toISOString().slice(0, 10)).toBe('2026-08-01');
    expect((merged.last_open_date as Date).toISOString().slice(0, 10)).toBe('2026-09-01');
  });
});

describeDb('Supabase HTTP roles are locked out', () => {
  it('has row-level security enabled on every table', async () => {
    const unprotected = await query<{ tablename: string }>(`
      select c.relname as tablename
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
    `);

    expect(unprotected.map((row) => row.tablename)).toEqual([]);
  });

  it('grants the anon and authenticated roles nothing', async () => {
    expect(
      await count(`
        select count(*) as count
        from information_schema.role_table_grants
        where table_schema = 'public' and grantee in ('anon', 'authenticated')
      `),
    ).toBe(0);
  });

  it('would return no rows to anon even if a grant reappeared', async () => {
    expect(await count("select count(*) as count from pg_policies where schemaname = 'public'")).toBe(0);
  });
});
