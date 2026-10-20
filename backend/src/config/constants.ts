
// Fixed date used for the assessment. All relative dates are based on this,
// not the current server date.
export const REFERENCE_DATE = '2026-09-28';
export const COLD_WINDOW_DAYS = 30;

// Events the app accepts from incoming webhook requests.
export const APP_EVENT_NAMES = [
  'app_open',
  'read_story',
  'link_click',
  'login',
] as const;

export type AppEventName = (typeof APP_EVENT_NAMES)[number];

// Where an app user record originally came from.
export const APP_USER_ORIGIN = {
  csv: 'csv',
  webhook: 'webhook',
} as const;

export type AppUserOrigin =
  (typeof APP_USER_ORIGIN)[keyof typeof APP_USER_ORIGIN];

// Sample event provided in the assessment PDF.
export const SAMPLE_APP_EVENT = {
  event_id: 'evt_9f3a1c',
  event: 'read_story',
  user_id: 'u_2b6447a3',
  device_id: 'd_4b21e8',
  timestamp: '2026-09-28T14:22:05Z',
  properties: {
    story: 'supreme-court-ruling-explained',
  },
} as const;

// Webhook route used to receive app events.
export const WEBHOOK_MOUNT = '/webhooks';
export const WEBHOOK_APP_PATH = `${WEBHOOK_MOUNT}/app`;

// Supported sources for subscriber acquisition and filtering.
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

// Subscriber statuses used across imports, filters, and reports.
export const SUBSCRIBER_STATUSES = [
  'active',
  'unsubscribed',
] as const;

export type SubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number];

// Default server port and language models.
// Gemini is the current provider, but the assistant uses a general LLM interface.
export const DEFAULT_PORT = 4000;
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
export const DEFAULT_GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite';

// Minimum length required for application secrets.
export const SECRET_MIN_LENGTH = 32;

// Session settings. A session lasts 12 hours.
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

// Accepted password length.
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;

// Webhook requests must arrive within five minutes of their timestamp.
// Event IDs also have a maximum accepted length.
export const WEBHOOK_REPLAY_WINDOW_SECONDS = 300;
export const WEBHOOK_ID_MAX_LENGTH = 128;

// Limits for search results, activity history, and overview pages.
export const SEARCH_LIMIT = 25;
export const ACTIVITY_LIMIT = 50;
export const OVERVIEW_PAGE_LIMIT = 8;

// Assistant limits to keep requests and responses manageable.
export const ASSISTANT_QUESTION_MAX_LENGTH = 500;
export const ASSISTANT_ANSWER_MAX_LENGTH = 4000;
export const ASSISTANT_HISTORY_TURNS = 6;
export const ASSISTANT_TOOL_ROUNDS = 4;
export const ASSISTANT_DEADLINE_MS = 25_000;
export const ASSISTANT_TABLE_LIMIT = 15;

// Maximum length of a saved segment name.
export const SEGMENT_NAME_MAX_LENGTH = 120;

// Preset for Instagram subscribers who haven't opened recently.
// Cold is based on their last newsletter open, not their signup date.
export const INSTAGRAM_COLD_PRESET = {
  acquisitionSource: 'Instagram',
  lastOpen: 'cold',
} as const;

export const INSTAGRAM_COLD_SEGMENT_NAME =
"Instagram subscribers who haven't opened in 30 days";

// Preset for active subscribers who use both the website and app.
export const ENGAGED_PRESET = {
  status: 'active',
  hasWebsite: true,
  hasApp: true,
} as const;

export const ENGAGED_SEGMENT_NAME = 'Most engaged readers';

// Maximum JSON request size and time allowed for server shutdown.
export const JSON_BODY_LIMIT = '16kb';
export const SHUTDOWN_TIMEOUT_MS = 10_000;

// Database connection settings.
// Limit open connections and avoid waiting indefinitely for a connection.
// Keep each serverless instance's connection footprint small. Supabase transaction pooling
// multiplexes these clients across its smaller number of database connections.
export const DB_POOL_MAX = 2;
export const DB_IDLE_TIMEOUT_MS = 30_000;
export const DB_CONNECT_TIMEOUT_MS = 10_000;

// Log database queries that take longer than 500 milliseconds.
export const SLOW_QUERY_MS = 500;

// Request limits to protect login, API, webhook, and assistant endpoints.
// Each limit applies within its own time window.
export const RATE_LIMITS = {
  // Allow 10 login attempts every 15 minutes.
  login: {
    windowMs: 15 * 60_000,
    limit: 10,
  },

  // Allow 300 general API requests per minute.
  api: {
    windowMs: 60_000,
    limit: 300,
  },

  // Allow up to 600 incoming webhook requests per minute.
  webhook: {
    windowMs: 60_000,
    limit: 600,
  },

  // Limit assistant requests to reduce excessive LLM usage.
  assistant: {
    windowMs: 60_000,
    limit: 15,
  },
} as const;
