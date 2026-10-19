/** Trim + lowercase. Does not strip Gmail dots or +tags — that would merge distinct people. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const EMAIL_MAX_LENGTH = 254;

export type EmailRejection = 'missing' | 'malformed' | 'too_long';

export type EmailResult =
  | { ok: true; normalized: string; original: string }
  | { ok: false; reason: EmailRejection; original: string };

/** Returns '' when absent; callers must validate before using this as a key. */
export function normalizeEmail(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

export function isValidEmail(normalized: string): boolean {
  return normalized.length > 0 && normalized.length <= EMAIL_MAX_LENGTH && EMAIL_SHAPE.test(normalized);
}

export function parseEmail(raw: string | null | undefined): EmailResult {
  const original = typeof raw === 'string' ? raw : '';
  const normalized = normalizeEmail(raw);

  if (normalized.length === 0) return { ok: false, reason: 'missing', original };
  if (normalized.length > EMAIL_MAX_LENGTH) return { ok: false, reason: 'too_long', original };
  if (!EMAIL_SHAPE.test(normalized)) return { ok: false, reason: 'malformed', original };

  return { ok: true, normalized, original };
}

/** First character plus domain. Use this in logs instead of the raw address. */
export function maskEmail(raw: string | null | undefined): string {
  const normalized = normalizeEmail(raw);
  if (normalized.length === 0) return '(none)';

  const at = normalized.lastIndexOf('@');
  if (at <= 0) return '(malformed)';

  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  return `${local[0]}***@${domain}`;
}

export function emailDomain(normalized: string): string {
  const at = normalized.lastIndexOf('@');
  return at === -1 ? '' : normalized.slice(at + 1);
}
