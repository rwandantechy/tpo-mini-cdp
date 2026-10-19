import { describe, expect, it } from 'vitest';

import { isAcquisitionSource, utmToChannel } from '../src/lib/channel.js';

describe('utmToChannel', () => {
  it('reconciles the vocabulary mismatch between the two files', () => {
    expect(utmToChannel('twitter')).toBe('X');
    expect(utmToChannel('x')).toBe('X');
  });

  it('title-cases the channels both files share', () => {
    expect(utmToChannel('instagram')).toBe('Instagram');
    expect(utmToChannel('facebook')).toBe('Facebook');
    expect(utmToChannel('google')).toBe('Google');
    expect(utmToChannel('referral')).toBe('Referral');
    expect(utmToChannel('podcast')).toBe('Podcast');
  });

  it('is case and whitespace insensitive', () => {
    expect(utmToChannel('  Instagram  ')).toBe('Instagram');
    expect(utmToChannel('INSTAGRAM')).toBe('Instagram');
  });

  it('returns null for a blank utm — 8,030 of the 10,000 pageviews have none', () => {
    expect(utmToChannel('')).toBeNull();
    expect(utmToChannel('   ')).toBeNull();
    expect(utmToChannel(null)).toBeNull();
    expect(utmToChannel(undefined)).toBeNull();
  });

  it('returns null for an unknown channel instead of inventing one', () => {
    expect(utmToChannel('tiktok')).toBeNull();
    expect(utmToChannel('newsletter-footer')).toBeNull();
  });
});

describe('isAcquisitionSource', () => {
  it('guards segment filters against arbitrary values', () => {
    expect(isAcquisitionSource('Instagram')).toBe(true);
    expect(isAcquisitionSource('X')).toBe(true);
    expect(isAcquisitionSource('instagram')).toBe(false); // wrong case is not a source
    expect(isAcquisitionSource('TikTok')).toBe(false);
    expect(isAcquisitionSource(null)).toBe(false);
    expect(isAcquisitionSource(42)).toBe(false);
  });
});
