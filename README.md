# Mini CDP

One person across newsletter, site, and app. **Today is 28 September 2026.** Cold means no open since 29 August 2026. Not an official The Pour Over product.

The UI talks only to Express. Express is the only path to Postgres and Gemini.

## Data

`npm run import` loads `data/subscribers.csv`, `data/web_events.csv`, and `data/app_users.csv`. Skipped rows are recorded with a reason. Schema is `supabase/migrations/`. The database is not in git.

Emails are trimmed and lowercased. Gmail dots and `+tags` are kept. Subscribers merge on that email: earliest signup, latest open, unsubscribed wins, source from the earliest signup. App accounts link on the same email. A visitor attaches to the earliest captured email; the address is not stored on the pageview.

## Webhook

`POST /webhooks/app` takes `app_open`, `read_story`, `link_click`, and `login`. Sign `timestamp.rawBody` with HMAC-SHA256 (`x-tpo-signature: sha256=…`, `x-tpo-timestamp` within five minutes). Same `event_id` returns 200. A new one returns 201.

An unknown `user_id` is stored with no subscriber link. Anonymous device events attach at the first login. A later login claims only from its own time forward. A named event is not moved.

## Ask

Gemini sees counts and tables, not people, emails, or ids. An email, a Title Case name, or an `u_` / `d_` / `evt_` id is dropped before the call, including in earlier turns. The UI refuses an answer that contains an email.

## Limits

- Lowercase names are not detected.
- Two simultaneous first saves of one segment name can insert two rows.
- The API user owns the tables and bypasses row-level security. The session cookie closes the routes.
- Rate limits are per server instance.

## Local

Node 20. Copy `.env.example` to `.env`. Secrets: `openssl rand -hex 32`, then `npm run hash-password`.

```bash
npm install
npm run migrate
npm run import
npm run dev          # API  http://127.0.0.1:4000
npm run dev:web      # UI   http://localhost:5173
npm test
npm run send-event   # signed read_story; set WEBHOOK_URL for a deployed API
```

## Vercel

One project, two services, one domain. `/api` and `/webhooks` go to Express. Everything else goes to the Vite app. Leave `VITE_API_BASE_URL` empty. Leave Build Command, Start Command, and Output Directory empty.

Deploy does not migrate or import. The build bundles the API to `app.mjs`.

```
NODE_ENV=production
DATABASE_URL=
DATABASE_SSL=require
DATABASE_CA_CERT=certs/supabase-ca.crt
SESSION_SECRET=
APP_PASSWORD_HASH=
WEBHOOK_SECRET=
CORS_ORIGINS=http://localhost:5173
COOKIE_SAMESITE=lax
COOKIE_SECURE=true
TRUST_PROXY=true
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_FALLBACK_MODEL=gemini-3.1-flash-lite
```

Use the Supabase session pooler, port 5432. `GET /api/health`.
