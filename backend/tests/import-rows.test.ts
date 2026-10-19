import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readCsv } from '../src/services/import/csv.js';
import { parseAppUserRow, parseSubscriberRow, parseWebEventRow } from '../src/services/import/rows.js';

const DATA_DIR = resolve(import.meta.dirname, '../../data');

describe('parseSubscriberRow', () => {
  const valid = {
    email: 'aaron.moore592@yahoo.com',
    signup_date: '2026-09-11',
    status: 'unsubscribed',
    acquisition_source: 'Instagram',
    last_open_date: '2026-09-17',
  };

  it('accepts a clean row', () => {
    expect(parseSubscriberRow(valid)).toEqual({
      ok: true,
      warnings: [],
      record: {
        emailNormalized: 'aaron.moore592@yahoo.com',
        emailOriginal: 'aaron.moore592@yahoo.com',
        signupDate: '2026-09-11',
        status: 'unsubscribed',
        acquisitionSource: 'Instagram',
        lastOpenDate: '2026-09-17',
      },
    });
  });

  it('normalizes the email it stores as the identity key', () => {
    const outcome = parseSubscriberRow({ ...valid, email: '  EMILY.MILLER827@GMAIL.COM ' });
    expect(outcome).toMatchObject({ ok: true });
    if (!outcome.ok) return;

    expect(outcome.record.emailNormalized).toBe('emily.miller827@gmail.com');
    expect(outcome.record.emailOriginal).toBe('  EMILY.MILLER827@GMAIL.COM ');
  });

  it('treats a blank last_open_date as never opened, not as an error', () => {
    const outcome = parseSubscriberRow({ ...valid, last_open_date: '' });
    expect(outcome).toMatchObject({ ok: true });
    if (!outcome.ok) return;

    expect(outcome.record.lastOpenDate).toBeNull();
    expect(outcome.warnings).toEqual([]);
  });

  it('skips rows whose email cannot be an identity key', () => {
    expect(parseSubscriberRow({ ...valid, email: '' })).toEqual({ ok: false, reason: 'email_missing' });
    expect(parseSubscriberRow({ ...valid, email: 'not-an-email' })).toEqual({ ok: false, reason: 'email_malformed' });
    expect(parseSubscriberRow({ ...valid, email: '@gmail.com' })).toEqual({ ok: false, reason: 'email_malformed' });
  });

  it('skips rows with a status it cannot interpret', () => {
    expect(parseSubscriberRow({ ...valid, status: '' })).toEqual({ ok: false, reason: 'status_missing' });
    expect(parseSubscriberRow({ ...valid, status: 'bounced' })).toEqual({ ok: false, reason: 'status_unknown' });
  });

  it('accepts status in any case', () => {
    expect(parseSubscriberRow({ ...valid, status: 'ACTIVE' })).toMatchObject({
      ok: true,
      record: { status: 'active' },
    });
  });

  it('keeps the subscriber but drops an unusable date, and says so', () => {
    const outcome = parseSubscriberRow({ ...valid, signup_date: '31/09/2026' });
    expect(outcome).toMatchObject({ ok: true });
    if (!outcome.ok) return;

    expect(outcome.record.signupDate).toBeNull();
    expect(outcome.warnings).toEqual(['signup_date_invalid']);
  });

  it('keeps an unrecognised acquisition source verbatim rather than reassigning it', () => {
    expect(parseSubscriberRow({ ...valid, acquisition_source: 'TikTok' })).toMatchObject({
      ok: true,
      record: { acquisitionSource: 'TikTok' },
    });
  });
});

describe('parseAppUserRow', () => {
  const valid = { user_id: 'u_2b6447a3', email: 'julia.evans230@gmail.com', created_at: '2026-08-22' };

  it('accepts a clean row', () => {
    expect(parseAppUserRow(valid)).toEqual({
      ok: true,
      warnings: [],
      record: {
        userId: 'u_2b6447a3',
        emailNormalized: 'julia.evans230@gmail.com',
        emailOriginal: 'julia.evans230@gmail.com',
        createdDate: '2026-08-22',
      },
    });
  });

  it('normalizes the email, which is what links the account to a subscriber', () => {
    expect(parseAppUserRow({ ...valid, email: 'PAUL.GARCIA558@GMAIL.COM' })).toMatchObject({
      ok: true,
      record: { emailNormalized: 'paul.garcia558@gmail.com' },
    });
  });

  it('keeps the account when the email is unusable — the profile survives, the link does not', () => {
    const outcome = parseAppUserRow({ ...valid, email: 'nope' });
    expect(outcome).toMatchObject({ ok: true });
    if (!outcome.ok) return;

    expect(outcome.record.userId).toBe('u_2b6447a3');
    expect(outcome.record.emailNormalized).toBeNull();
    expect(outcome.warnings).toEqual(['email_unusable']);
  });

  it('skips only when there is no user_id at all', () => {
    expect(parseAppUserRow({ ...valid, user_id: '  ' })).toEqual({ ok: false, reason: 'user_id_missing' });
  });
});

describe('parseWebEventRow', () => {
  const valid = {
    visitor_id: 'v_3322219cf8',
    page: '/subscribe',
    timestamp: '2026-07-01 00:11:57',
    utm_source: '',
    email: 'ISAAC.TAYLOR434@PROTONMAIL.COM',
  };

  it('accepts a clean row and normalizes the captured email', () => {
    const outcome = parseWebEventRow(valid);
    expect(outcome).toMatchObject({ ok: true });
    if (!outcome.ok) return;

    expect(outcome.record.visitorId).toBe('v_3322219cf8');
    expect(outcome.record.page).toBe('/subscribe');
    expect(outcome.record.occurredAt.toISOString()).toBe('2026-07-01T00:11:57.000Z');
    expect(outcome.record.capturedEmail).toBe('isaac.taylor434@protonmail.com');
    expect(outcome.record.channel).toBeNull();
  });

  it('maps utm_source onto the subscriber channel vocabulary', () => {
    expect(parseWebEventRow({ ...valid, utm_source: 'twitter' })).toMatchObject({
      ok: true,
      record: { utmSource: 'twitter', channel: 'X' },
    });
  });

  it('flags a utm it cannot map but keeps the pageview', () => {
    const outcome = parseWebEventRow({ ...valid, utm_source: 'tiktok' });
    expect(outcome).toMatchObject({ ok: true, record: { channel: null } });
    if (!outcome.ok) return;

    expect(outcome.warnings).toEqual(['utm_source_unmapped']);
  });

  it('leaves an anonymous pageview anonymous', () => {
    expect(parseWebEventRow({ ...valid, email: '' })).toMatchObject({
      ok: true,
      record: { capturedEmail: null },
    });
  });

  it('keeps a pageview whose captured email is unusable — it just identifies nobody', () => {
    const outcome = parseWebEventRow({ ...valid, email: '@gmail.com' });
    expect(outcome).toMatchObject({ ok: true, record: { capturedEmail: null } });
    if (!outcome.ok) return;

    expect(outcome.warnings).toEqual(['captured_email_unusable']);
  });

  it('skips a row with nothing to attach the pageview to', () => {
    expect(parseWebEventRow({ ...valid, visitor_id: '' })).toEqual({ ok: false, reason: 'visitor_id_missing' });
    expect(parseWebEventRow({ ...valid, page: '' })).toEqual({ ok: false, reason: 'page_missing' });
    expect(parseWebEventRow({ ...valid, timestamp: 'whenever' })).toEqual({ ok: false, reason: 'timestamp_invalid' });
  });
});

describe('the real source files', () => {
  it('subscribers.csv: 2,995 rows in, 2,900 distinct subscribers out, 10 rows unusable', () => {
    const rows = readCsv(resolve(DATA_DIR, 'subscribers.csv'));
    expect(rows).toHaveLength(2995);

    const outcomes = rows.map(parseSubscriberRow);
    const kept = outcomes.filter((outcome) => outcome.ok);
    const skipped = outcomes.filter((outcome) => !outcome.ok);

    expect(kept).toHaveLength(2985);
    expect(skipped).toHaveLength(10);

    const reasons = skipped.reduce<Record<string, number>>((tally, outcome) => {
      if (!outcome.ok) tally[outcome.reason] = (tally[outcome.reason] ?? 0) + 1;
      return tally;
    }, {});
    expect(reasons).toEqual({ email_missing: 8, email_malformed: 2 });

    const distinct = new Set(kept.map((outcome) => (outcome.ok ? outcome.record.emailNormalized : '')));
    expect(distinct.size).toBe(2900);
    expect(kept.length - distinct.size).toBe(85);

    expect(kept.filter((outcome) => outcome.ok && outcome.warnings.length > 0)).toHaveLength(0);
  });

  it('app_users.csv: all 930 accounts survive, each with a usable email', () => {
    const rows = readCsv(resolve(DATA_DIR, 'app_users.csv'));
    expect(rows).toHaveLength(930);

    const outcomes = rows.map(parseAppUserRow);
    expect(outcomes.every((outcome) => outcome.ok)).toBe(true);

    const emails = outcomes.map((outcome) => (outcome.ok ? outcome.record.emailNormalized : null));
    expect(emails.filter((email) => email === null)).toHaveLength(0);
    expect(new Set(emails).size).toBe(930);
  });

  it('web_events.csv: 10,000 pageviews, 1,400 identifying, 1,970 with a mappable channel', () => {
    const rows = readCsv(resolve(DATA_DIR, 'web_events.csv'));
    expect(rows).toHaveLength(10000);

    const outcomes = rows.map(parseWebEventRow);
    expect(outcomes.every((outcome) => outcome.ok)).toBe(true);

    const records = outcomes.flatMap((outcome) => (outcome.ok ? [outcome.record] : []));

    const identifying = records.filter((record) => record.capturedEmail !== null);
    expect(identifying).toHaveLength(1400);
    expect(identifying.every((record) => record.page === '/subscribe')).toBe(true);

    const visitors = new Set(records.map((record) => record.visitorId));
    const identified = new Set(identifying.map((record) => record.visitorId));
    expect(visitors.size).toBe(2028);
    expect(identified.size).toBe(1400);
    expect(visitors.size - identified.size).toBe(628);

    expect(records.filter((record) => record.channel !== null)).toHaveLength(1970);
    expect(outcomes.filter((outcome) => outcome.ok && outcome.warnings.includes('utm_source_unmapped'))).toHaveLength(0);
    expect(records.filter((record) => record.channel === 'X')).toHaveLength(50);

    const keys = new Set(records.map((record) => `${record.visitorId}|${record.page}|${record.occurredAt.toISOString()}`));
    expect(keys.size).toBe(10000);

    const firstIdentified = new Map<string, number>();
    for (const record of identifying) {
      const at = record.occurredAt.getTime();
      const existing = firstIdentified.get(record.visitorId);
      if (existing === undefined || at < existing) firstIdentified.set(record.visitorId, at);
    }
    const beforeIdentification = records.filter((record) => {
      const at = firstIdentified.get(record.visitorId);
      return at !== undefined && record.occurredAt.getTime() < at;
    });
    expect(beforeIdentification).toHaveLength(1930);
  });
});
