/** Keep in step with backend SEARCH_LIMIT. */
export const PAGE_SIZE = 25;
export const REFERENCE_DATE = '2026-09-28';
export const COLD_WINDOW_DAYS = 30;
export const ASSISTANT_HISTORY_TURNS = 6;
export const ASSISTANT_ANSWER_MAX_LENGTH = 4000;
export const ASSISTANT_REQUEST_TIMEOUT_MS = 30_000;

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

export const INSTAGRAM_COLD_SEGMENT_NAME = "Instagram signups who haven't opened in 30 days";
