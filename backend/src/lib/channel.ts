/** Maps utm_source onto subscriber channels. The files disagree: "twitter" vs "X". */

import { ACQUISITION_SOURCES, type AcquisitionSource } from '../config/constants.js';

const UTM_TO_SOURCE: Record<string, AcquisitionSource> = {
  direct: 'Direct',
  facebook: 'Facebook',
  google: 'Google',
  instagram: 'Instagram',
  podcast: 'Podcast',
  referral: 'Referral',
  twitter: 'X',
  x: 'X',
};

/** Null for a blank or unknown utm_source — never invents a channel. */
export function utmToChannel(utmSource: string | null | undefined): AcquisitionSource | null {
  if (typeof utmSource !== 'string') return null;

  const key = utmSource.trim().toLowerCase();
  if (key.length === 0) return null;

  return UTM_TO_SOURCE[key] ?? null;
}

export function isAcquisitionSource(value: unknown): value is AcquisitionSource {
  return typeof value === 'string' && (ACQUISITION_SOURCES as readonly string[]).includes(value);
}
