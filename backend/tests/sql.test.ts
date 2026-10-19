import { describe, expect, it } from 'vitest';

import { buildValues, chunk, isUniqueViolation } from '../src/lib/sql.js';

describe('buildValues', () => {
  it('numbers placeholders across rows and keeps values as parameters', () => {
    const { clause, params } = buildValues(
      [
        ['a@example.com', '2026-09-01'],
        ['b@example.com', null],
      ],
      ['text', 'date'],
    );

    expect(clause).toBe('($1::text, $2::date), ($3::text, $4::date)');
    expect(params).toEqual(['a@example.com', '2026-09-01', 'b@example.com', null]);
  });

  it('leaves injection attempts as data, never as SQL', () => {
    const { clause, params } = buildValues([["'; drop table subscribers; --"]], ['text']);

    expect(clause).toBe('($1::text)');
    expect(params).toEqual(["'; drop table subscribers; --"]);
  });

  it('refuses a row whose width does not match the casts', () => {
    expect(() => buildValues([['only-one']], ['text', 'date'])).toThrow(/2 casts/);
    expect(() => buildValues([], ['text'])).toThrow(/at least one row/);
  });
});

describe('chunk', () => {
  it('splits evenly and keeps the remainder', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
    expect(chunk([], 10)).toEqual([]);
    expect(() => chunk([1], 0)).toThrow(RangeError);
  });
});

describe('isUniqueViolation', () => {
  it('recognises only the Postgres unique-violation code', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(new Error('nope'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
