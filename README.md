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

Gemini receives a tool name, filters, and counts. It does not receive the question, earlier turns, emails, names, or subscriber rows. A question the app cannot map to those aggregates is answered in the app and is not sent. A model reply that contains an email or a two-word name is replaced before it reaches the UI.

Cold is last open before 29 August 2026, for every signup date. Adding a signup window is a separate filter. "Which pages do new subscribers hit first?" uses the first page view on or after the signup date.

## Limits

- A single given name, with no surname, is not treated as a person.
- Segment names are unique without regard to case; saving an existing name updates it.
- The API user owns the tables and bypasses row-level security. The session cookie closes the routes.
- Rate limits are per server instance and do not provide a deployment-wide quota.

## Local

Node 20. Copy `.env.example` to `.env`. Secrets: `openssl rand -hex 32`, then `npm run hash-password`.

```bash
npm install
npm run migrate
npm run import
npm run dev          # API  http://127.0.0.1:4000
npm run dev:web      # UI   http://localhost:5173
npm test
npm run send-event -- --event app_open --device d_test_001
npm run send-event -- --event login --device d_test_001 --user u_0d6f8a22
npm run send-event -- --event read_story --device d_test_001
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
