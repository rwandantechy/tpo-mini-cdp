/** Assessment "today". Relative windows use this, not the server clock. */
export const REFERENCE_DATE = '2026-09-28';
export const COLD_WINDOW_DAYS = 30;

export const APP_EVENT_NAMES = ['app_open', 'read_story', 'link_click', 'login'] as const;
export type AppEventName = (typeof APP_EVENT_NAMES)[number];

export const ACQUISITION_SOURCES = [
  'Direct',
  'Facebook',
  'Google',
  'Instagram',
  'Podcast',
  'Referral',
  'X',
] as const;
export type AcquisitionSource = (typeof ACQUISITION_SOURCES)[number];

export const SUBSCRIBER_STATUSES = ['active', 'unsubscribed'] as const;
export type SubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number];

export const DEFAULT_PORT = 4000;
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
export const SECRET_MIN_LENGTH = 32;

export const SESSION_SUBJECT = 'growth';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;

export const WEBHOOK_REPLAY_WINDOW_SECONDS = 300;

export const SEARCH_LIMIT = 25;
export const ACTIVITY_LIMIT = 50;

export const JSON_BODY_LIMIT = '16kb';
export const SHUTDOWN_TIMEOUT_MS = 10_000;

export const DB_POOL_MAX = 10;
export const DB_IDLE_TIMEOUT_MS = 30_000;
export const DB_CONNECT_TIMEOUT_MS = 10_000;
export const SLOW_QUERY_MS = 500;

export const RATE_LIMITS = {
  login: { windowMs: 15 * 60_000, limit: 10 },
  api: { windowMs: 60_000, limit: 300 },
  webhook: { windowMs: 60_000, limit: 600 },
  assistant: { windowMs: 60_000, limit: 15 },
} as const;
