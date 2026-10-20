-- Dashboard accounts created from the terminal. Public signup is intentionally not exposed.
create table auth_accounts (
  id               uuid primary key default gen_random_uuid(),
  email_normalized text not null unique,
  email_original   text not null,
  password_hash    text not null,
  created_at       timestamptz not null default now()
);

alter table auth_accounts enable row level security;
revoke all on table auth_accounts from anon, authenticated;
