-- One subscriber per email. One app event per event_id.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table subscribers (
  id                 uuid primary key default gen_random_uuid(),
  email_normalized   text not null unique,
  email_original     text not null,
  signup_date        date,
  status             text not null check (status in ('active', 'unsubscribed')),
  acquisition_source text,
  last_open_date     date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index subscribers_source_idx     on subscribers (acquisition_source);
create index subscribers_status_idx     on subscribers (status);
create index subscribers_signup_idx     on subscribers (signup_date);
create index subscribers_last_open_idx  on subscribers (last_open_date);
create index subscribers_email_trgm_idx on subscribers using gin (email_normalized gin_trgm_ops);

create table web_visitors (
  visitor_id    text primary key,
  subscriber_id uuid references subscribers (id) on delete set null,
  identified_at timestamptz,
  first_seen_at timestamptz not null,
  last_seen_at  timestamptz not null
);

create index web_visitors_subscriber_idx on web_visitors (subscriber_id);

-- Natural key makes re-import a no-op.
create table web_events (
  id             bigserial primary key,
  visitor_id     text not null references web_visitors (visitor_id) on delete cascade,
  page           text not null,
  occurred_at    timestamptz not null,
  utm_source     text,
  channel        text,
  email_captured boolean not null default false,
  unique (visitor_id, page, occurred_at)
);

create index web_events_visitor_time_idx on web_events (visitor_id, occurred_at desc);
create index web_events_time_idx         on web_events (occurred_at desc);
create index web_events_page_idx         on web_events (page);

create table app_users (
  user_id          text primary key,
  email_normalized text,
  email_original   text,
  subscriber_id    uuid references subscribers (id) on delete set null,
  created_date     date,
  origin           text not null check (origin in ('csv', 'webhook')),
  first_seen_at    timestamptz not null default now()
);

create unique index app_users_email_key     on app_users (email_normalized) where email_normalized is not null;
create index        app_users_subscriber_idx on app_users (subscriber_id);

create table app_devices (
  device_id       text primary key,
  first_seen_at   timestamptz not null,
  last_seen_at    timestamptz not null,
  current_user_id text references app_users (user_id) on delete set null
);

-- claimed_from/to: which user owned the device when an anonymous event arrived.
create table device_user_sessions (
  id           bigserial primary key,
  device_id    text not null references app_devices (device_id) on delete cascade,
  user_id      text not null references app_users (user_id) on delete cascade,
  login_at     timestamptz not null,
  claimed_from timestamptz,
  claimed_to   timestamptz
);

create index device_user_sessions_device_idx on device_user_sessions (device_id, login_at);
create unique index device_user_sessions_login_key on device_user_sessions (device_id, user_id, login_at);

create table app_events (
  event_id         text primary key,
  event            text not null check (event in ('app_open', 'read_story', 'link_click', 'login')),
  raw_user_id      text,
  resolved_user_id text references app_users (user_id) on delete set null,
  device_id        text not null references app_devices (device_id) on delete cascade,
  occurred_at      timestamptz not null,
  received_at      timestamptz not null default now(),
  properties       jsonb not null default '{}'::jsonb
);

create index app_events_user_time_idx   on app_events (resolved_user_id, occurred_at desc);
create index app_events_device_time_idx on app_events (device_id, occurred_at);
create index app_events_time_idx        on app_events (occurred_at desc);
create index app_events_event_idx       on app_events (event);

create table segments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  definition jsonb not null,
  created_by text not null,
  created_at timestamptz not null default now()
);

create table import_runs (
  id             uuid primary key default gen_random_uuid(),
  source         text not null,
  status         text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  rows_read      integer not null default 0,
  rows_inserted  integer not null default 0,
  rows_merged    integer not null default 0,
  rows_skipped   integer not null default 0,
  skip_reasons   jsonb not null default '{}'::jsonb,
  warnings       jsonb not null default '{}'::jsonb,
  error          text,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz
);

create index import_runs_source_idx on import_runs (source, started_at desc);
