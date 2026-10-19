/** Assessment "today". Relative windows use this, not the server clock. */
export const REFERENCE_DATE = '2026-09-28';
export const COLD_WINDOW_DAYS = 30;

export const APP_EVENT_NAMES = ['app_open', 'read_story', 'link_click', 'login'] as const;
export type AppEventName = (typeof APP_EVENT_NAMES)[number];

export const APP_USER_ORIGIN = {
  csv: 'csv',
  webhook: 'webhook',
} as const;
export type AppUserOrigin = (typeof APP_USER_ORIGIN)[keyof typeof APP_USER_ORIGIN];

/** Exact payload from the assessment PDF. */
export const SAMPLE_APP_EVENT = {
  event_id: 'evt_9f3a1c',
  event: 'read_story',
  user_id: 'u_2b6447a3',
  device_id: 'd_4b21e8',
  timestamp: '2026-09-28T14:22:05Z',
  properties: { story: 'supreme-court-ruling-explained' },
} as const;

export const WEBHOOK_MOUNT = '/webhooks';
export const WEBHOOK_APP_PATH = `${WEBHOOK_MOUNT}/app`;

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
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
export const DEFAULT_GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite';
export const SECRET_MIN_LENGTH = 32;

export const SESSION_SUBJECT = 'growth';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;

export const WEBHOOK_REPLAY_WINDOW_SECONDS = 300;
export const WEBHOOK_ID_MAX_LENGTH = 128;

export const SEARCH_LIMIT = 25;
export const ACTIVITY_LIMIT = 50;
export const OVERVIEW_PAGE_LIMIT = 8;

export const ASSISTANT_QUESTION_MAX_LENGTH = 500;
export const ASSISTANT_ANSWER_MAX_LENGTH = 4000;
export const ASSISTANT_HISTORY_TURNS = 6;
export const ASSISTANT_TOOL_ROUNDS = 4;
export const ASSISTANT_DEADLINE_MS = 25_000;
export const ASSISTANT_TABLE_LIMIT = 15;
export const SEGMENT_NAME_MAX_LENGTH = 120;

export const INSTAGRAM_COLD_PRESET = {
  acquisitionSource: 'Instagram',
  lastOpen: 'cold',
} as const;

export const INSTAGRAM_COLD_SEGMENT_NAME = "Instagram signups who haven't opened in 30 days";

export const ENGAGED_PRESET = {
  status: 'active',
  hasWebsite: true,
  hasApp: true,
} as const;

export const ENGAGED_SEGMENT_NAME = 'Most engaged readers';

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
