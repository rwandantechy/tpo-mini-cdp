/** Keep in step with backend SEARCH_LIMIT. */
export const PAGE_SIZE = 25;
export const COLD_WINDOW_DAYS = 30;

export const ACQUISITION_SOURCES = [
  'Direct',
  'Facebook',
  'Google',
  'Instagram',
  'Podcast',
  'Referral',
  'X',
] as const;

export const INSTAGRAM_COLD_PRESET = {
  acquisitionSource: 'Instagram',
  lastOpen: 'cold',
} as const;
