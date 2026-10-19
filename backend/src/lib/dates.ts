/** Day-level dates against REFERENCE_DATE, not the server clock. */

import { REFERENCE_DATE } from '../config/constants.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function referenceDate(): string {
  return REFERENCE_DATE;
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** `daysBeforeReference(30)` is 2026-08-29. */
export function daysBeforeReference(days: number): string {
  if (!Number.isInteger(days) || days < 0) {
    throw new RangeError(`days must be a non-negative integer, got ${days}`);
  }

  const base = new Date(`${REFERENCE_DATE}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() - days);
  return base.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86_400_000);
}

/** CSV `2026-07-01 00:11:57` (read as UTC) or ISO-8601. Null for anything else. */
export function parseTimestamp(value: string | null | undefined): Date | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const csvForm = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(trimmed);
  const candidate = csvForm ? `${csvForm[1]}T${csvForm[2]}Z` : trimmed;

  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
