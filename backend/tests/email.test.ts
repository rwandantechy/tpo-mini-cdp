import { describe, expect, it } from 'vitest';

import { emailDomain, isValidEmail, maskEmail, normalizeEmail, parseEmail } from '../src/lib/email.js';

describe('normalizeEmail', () => {
  it('lowercases and trims, which is what collapses the duplicate rows in subscribers.csv', () => {
    expect(normalizeEmail('EMILY.MILLER827@GMAIL.COM')).toBe('emily.miller827@gmail.com');
    expect(normalizeEmail('  zoe.allen235@gmail.com ')).toBe('zoe.allen235@gmail.com');
    expect(normalizeEmail('Chloe.Reed603@Yahoo.Com')).toBe('chloe.reed603@yahoo.com');
  });

  it('treats tabs and newlines as surrounding whitespace', () => {
    expect(normalizeEmail('\tsam.mitchell35@gmail.com\n')).toBe('sam.mitchell35@gmail.com');
  });

  it('returns an empty string for anything missing', () => {
    expect(normalizeEmail('')).toBe('');
    expect(normalizeEmail('   ')).toBe('');
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
  });

  it('does not strip Gmail dots — a deliberate choice, so two real people never merge', () => {
    expect(normalizeEmail('john.turner61@gmail.com')).not.toBe(normalizeEmail('johnturner61@gmail.com'));
  });

  it('does not strip plus tags, for the same reason', () => {
    expect(normalizeEmail('reader+newsletter@gmail.com')).toBe('reader+newsletter@gmail.com');
  });
});

describe('isValidEmail', () => {
  it('accepts the shapes present in the source data', () => {
    expect(isValidEmail('aaron.moore592@yahoo.com')).toBe(true);
    expect(isValidEmail('leah.cooper965@protonmail.com')).toBe(true);
  });

  it('rejects the two malformed addresses in subscribers.csv', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('@gmail.com')).toBe(false);
  });

  it('rejects addresses with no domain dot, internal spaces, or doubled @', () => {
    expect(isValidEmail('reader@localhost')).toBe(false);
    expect(isValidEmail('first last@gmail.com')).toBe(false);
    expect(isValidEmail('a@@gmail.com')).toBe(false);
    expect(isValidEmail('reader@gmail..com')).toBe(false);
    expect(isValidEmail('reader@.com')).toBe(false);
  });

  it('rejects anything past the RFC length limit', () => {
    expect(isValidEmail(`${'a'.repeat(250)}@gmail.com`)).toBe(false);
  });
});

describe('parseEmail', () => {
  it('reports why a value was rejected, so the import summary can be specific', () => {
    expect(parseEmail('')).toMatchObject({ ok: false, reason: 'missing' });
    expect(parseEmail('   ')).toMatchObject({ ok: false, reason: 'missing' });
    expect(parseEmail('not-an-email')).toMatchObject({ ok: false, reason: 'malformed' });
    expect(parseEmail(`${'a'.repeat(250)}@gmail.com`)).toMatchObject({ ok: false, reason: 'too_long' });
  });

  it('keeps the original alongside the normalized form', () => {
    expect(parseEmail('  Zoe.Allen235@Gmail.com ')).toEqual({
      ok: true,
      normalized: 'zoe.allen235@gmail.com',
      original: '  Zoe.Allen235@Gmail.com ',
    });
  });
});

describe('maskEmail', () => {
  it('keeps a line diagnosable without writing the address', () => {
    expect(maskEmail('aaron.moore592@yahoo.com')).toBe('a***@yahoo.com');
    expect(maskEmail('ISAAC.TAYLOR434@PROTONMAIL.COM')).toBe('i***@protonmail.com');
  });

  it('never throws on junk', () => {
    expect(maskEmail('')).toBe('(none)');
    expect(maskEmail(null)).toBe('(none)');
    expect(maskEmail('@gmail.com')).toBe('(malformed)');
    expect(maskEmail('not-an-email')).toBe('(malformed)');
  });
});

describe('emailDomain', () => {
  it('returns the domain, or an empty string', () => {
    expect(emailDomain('aaron.moore592@yahoo.com')).toBe('yahoo.com');
    expect(emailDomain('nonsense')).toBe('');
  });
});
