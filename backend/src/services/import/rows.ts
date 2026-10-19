import { SUBSCRIBER_STATUSES, type SubscriberStatus } from '../../config/constants.js';
import { utmToChannel } from '../../lib/channel.js';
import { isIsoDate, parseTimestamp } from '../../lib/dates.js';
import { parseEmail } from '../../lib/email.js';
import type { AppUserRecord, RowOutcome, SubscriberRecord, WebEventRecord } from './types.js';

export type CsvRow = Record<string, string | undefined>;

function trimmed(row: CsvRow, column: string): string {
  return (row[column] ?? '').trim();
}

/** Blank or unparseable dates become null; the row is kept. */
function optionalDate(value: string, warningKey: string, warnings: string[]): string | null {
  if (value.length === 0) return null;
  if (isIsoDate(value)) return value;

  warnings.push(warningKey);
  return null;
}

export function parseSubscriberRow(row: CsvRow): RowOutcome<SubscriberRecord> {
  const email = parseEmail(row.email);
  if (!email.ok) return { ok: false, reason: `email_${email.reason}` };

  const warnings: string[] = [];

  const rawStatus = trimmed(row, 'status').toLowerCase();
  if (rawStatus.length === 0) return { ok: false, reason: 'status_missing' };
  if (!(SUBSCRIBER_STATUSES as readonly string[]).includes(rawStatus)) {
    return { ok: false, reason: 'status_unknown' };
  }

  const acquisitionSource = trimmed(row, 'acquisition_source') || null;

  return {
    ok: true,
    warnings,
    record: {
      emailNormalized: email.normalized,
      emailOriginal: email.original,
      status: rawStatus as SubscriberStatus,
      acquisitionSource,
      signupDate: optionalDate(trimmed(row, 'signup_date'), 'signup_date_invalid', warnings),
      lastOpenDate: optionalDate(trimmed(row, 'last_open_date'), 'last_open_date_invalid', warnings),
    },
  };
}

/** An unusable email costs the subscriber link, not the profile. */
export function parseAppUserRow(row: CsvRow): RowOutcome<AppUserRecord> {
  const userId = trimmed(row, 'user_id');
  if (userId.length === 0) return { ok: false, reason: 'user_id_missing' };

  const warnings: string[] = [];
  const email = parseEmail(row.email);
  if (!email.ok && email.reason !== 'missing') warnings.push('email_unusable');

  return {
    ok: true,
    warnings,
    record: {
      userId,
      emailNormalized: email.ok ? email.normalized : null,
      emailOriginal: email.ok ? email.original : null,
      createdDate: optionalDate(trimmed(row, 'created_at'), 'created_at_invalid', warnings),
    },
  };
}

/** An unusable captured email costs identification, not the pageview. */
export function parseWebEventRow(row: CsvRow): RowOutcome<WebEventRecord> {
  const visitorId = trimmed(row, 'visitor_id');
  if (visitorId.length === 0) return { ok: false, reason: 'visitor_id_missing' };

  const page = trimmed(row, 'page');
  if (page.length === 0) return { ok: false, reason: 'page_missing' };

  const occurredAt = parseTimestamp(trimmed(row, 'timestamp'));
  if (!occurredAt) return { ok: false, reason: 'timestamp_invalid' };

  const warnings: string[] = [];
  const utmSource = trimmed(row, 'utm_source') || null;
  const channel = utmToChannel(utmSource);
  if (utmSource !== null && channel === null) warnings.push('utm_source_unmapped');

  const email = parseEmail(row.email);
  if (!email.ok && email.reason !== 'missing') warnings.push('captured_email_unusable');

  return {
    ok: true,
    warnings,
    record: {
      visitorId,
      page,
      occurredAt,
      utmSource,
      channel,
      capturedEmail: email.ok ? email.normalized : null,
    },
  };
}
