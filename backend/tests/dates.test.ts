import { describe, expect, it } from 'vitest';

import { COLD_WINDOW_DAYS, REFERENCE_DATE } from '../src/config/constants.js';
import { daysBeforeReference, daysBetween, isIsoDate, parseTimestamp, referenceDate } from '../src/lib/dates.js';

describe('reference date', () => {
  it('is the date the assessment tells us to treat as today', () => {
    expect(referenceDate()).toBe('2026-09-28');
    expect(REFERENCE_DATE).toBe('2026-09-28');
  });
});

describe('daysBeforeReference', () => {
  it('produces the cutoff for the cold window', () => {
    expect(daysBeforeReference(COLD_WINDOW_DAYS)).toBe('2026-08-29');
  });

  it('crosses month and quarter boundaries correctly', () => {
    expect(daysBeforeReference(0)).toBe('2026-09-28');
    expect(daysBeforeReference(1)).toBe('2026-09-27');
    expect(daysBeforeReference(28)).toBe('2026-08-31');
    expect(daysBeforeReference(90)).toBe('2026-06-30');
    expect(daysBeforeReference(365)).toBe('2025-09-28');
  });

  it('refuses nonsense rather than returning a wrong date', () => {
    expect(() => daysBeforeReference(-1)).toThrow(RangeError);
    expect(() => daysBeforeReference(1.5)).toThrow(RangeError);
  });
});

describe('isIsoDate', () => {
  it('accepts real calendar dates only', () => {
    expect(isIsoDate('2026-09-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false); // February has no 30th
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-9-28')).toBe(false);
    expect(isIsoDate('28/09/2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });
});

describe('daysBetween', () => {
  it('counts whole days', () => {
    expect(daysBetween('2026-08-29', '2026-09-28')).toBe(30);
    expect(daysBetween('2026-09-28', '2026-09-28')).toBe(0);
    expect(daysBetween('2026-09-28', '2026-08-29')).toBe(-30);
  });
});

describe('parseTimestamp', () => {
  it('reads the CSV form, which has no timezone, as UTC', () => {
    expect(parseTimestamp('2026-07-01 00:11:57')?.toISOString()).toBe('2026-07-01T00:11:57.000Z');
  });

  it('reads the webhook form from the assessment payload', () => {
    expect(parseTimestamp('2026-09-28T14:22:05Z')?.toISOString()).toBe('2026-09-28T14:22:05.000Z');
  });

  it('honours a non-UTC offset instead of ignoring it', () => {
    expect(parseTimestamp('2026-09-28T14:22:05+02:00')?.toISOString()).toBe('2026-09-28T12:22:05.000Z');
  });

  it('returns null rather than guessing', () => {
    expect(parseTimestamp('')).toBeNull();
    expect(parseTimestamp('yesterday')).toBeNull();
    expect(parseTimestamp(null)).toBeNull();
  });
});
