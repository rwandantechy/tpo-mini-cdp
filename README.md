# Mini CDP

Growth workspace: one record per person across the newsletter, website, and app. **Today is 28 September 2026** (`REFERENCE_DATE`). Cold means no newsletter open since 29 August 2026. The server clock is not used for those windows.

Not an official The Pour Over product.

The UI calls Express only. Express is the only thing that talks to Postgres and to Gemini.

## Data flow

`data/subscribers.csv`, `data/web_events.csv`, and `data/app_users.csv` are the inputs. `npm run import` validates each row, writes through `backend/src/services/import/`, and records the run in `import_runs`. Skipped rows stay in that report with a reason. The live database is not in git. `supabase/migrations/` is the empty schema.

People, Segments, and Overview read that database. Ask calls server tools that return counts and tables, then Gemini writes the prose.

## Identity

Every email goes through `parseEmail` in `backend/src/lib/email.ts`: trim and lowercase. Dots and `+tags` in Gmail addresses are kept, so two people are not merged by accident.

Subscribers are unique on `email_normalized`. A repeated address collapses in SQL, not by arrival order: earliest signup, latest open, unsubscribed wins over active, acquisition source is the earliest signup, and the stored original address is the one that sorts first under `collate "C"`. A blank or broken email is skipped. A bad date is dropped and the person is kept.

App accounts link on that same normalized email. An account with no match keeps its own profile. Re-import does not change `origin` (`csv` or `webhook`).

A website visitor is identified by the earliest captured email that matches a subscriber. The address is not stored on the pageview, only `email_captured`. Pageviews already on that visitor stay attached. This file has one captured email per visitor. If one visitor had two, and they fell in different 800-row batches, the first batch written would stick.

## Webhook

`POST /webhooks/app` accepts `app_open`, `read_story`, `link_click`, and `login`. The body is the raw bytes. `x-tpo-signature` is `sha256=` plus HMAC-SHA256 of `timestamp.rawBody`, using `WEBHOOK_SECRET`. `x-tpo-timestamp` must be within five minutes. A bad signature is 401. A login without `user_id` is 400.

`event_id` is the primary key. The same id again is a 200 and does not rewrite the row. A new id is 201.

An unknown `user_id` is stored as its own app profile (`origin = webhook`) with no subscriber link. An event with no `user_id` stays anonymous until a login on that device. The first login claims anonymous events before the next login. A later login claims only from its own timestamp forward. An event that already named a user is not moved. Logins can arrive out of order; the device windows are rebuilt from the login timestamps.

`npm run send-event` posts one signed `read_story` for the first linked app user. Set `WEBHOOK_URL` to hit a deployed API.

## Ask

Gemini receives the system prompt, the question, up to six earlier turns, and tool results: headline counts, source mix, page counts, segment totals. It does not receive subscriber rows, emails, or app ids.

A question that contains an email, a Title Case first and last name, or an `u_` / `d_` / `evt_` id is refused before any model call. The same check drops a bad history question or history answer, and the follow-up still runs. Product words (`Top Pages`, `Instagram`, `Facebook`) are not treated as names. If the model writes an email into its answer, the UI shows a refusal instead.

Saving a segment returns a count to the model. The app then loads those people itself for the signed-in user.

## Known limitations

- A lowercase name such as "claire collins" is not detected. The detector is Title Case so headings are not refused.
- Segment names are updated when the same name is saved again. Two simultaneous first saves can still insert two rows. There is no unique index on the name.
- Row-level security is on, and `anon` / `authenticated` have no grants. The API connects as the table owner, which bypasses RLS. The cookie session is what keeps those routes closed.
- There is no separate engagement-score feature.

## Local

Node 20. Copy `.env.example` to `.env` and fill secrets (`openssl rand -hex 32`, then `npm run hash-password`).

```bash
npm install
npm run migrate
npm run import
npm run dev          # API  http://127.0.0.1:4000
npm run dev:web      # UI   http://localhost:5173
npm test
```

`npm test` runs the backend suite. Import and overview tests read the imported database. Webhook cases and the subscriber merge checks run inside a transaction that rolls back. The segment-name test deletes the row it inserted. Without `DATABASE_URL`, the database tests are skipped.

Signed app event: `npm run send-event`. Override the URL with `WEBHOOK_URL`.

## Production

One Vercel project, two services, one domain. `vercel.json` sends `/api` and `/webhooks` to the Express service and everything else to the Vite app. The browser calls `/api` on that same domain. Leave `VITE_API_BASE_URL` unset. Do not put secrets in any `VITE_` variable.

The deploy build does not run `npm run migrate` or `npm run import`. Run those yourself against Supabase before the first request. `src/index.ts` is the local and VPS process. Vercel loads `src/server.ts`, which does not listen and does not connect until a request arrives.

Backend environment, Production (and Preview if you use it):

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

`COOKIE_SAMESITE=lax` is correct because the UI and API share a host. Vercel sets `VERCEL_URL`; that deployment's `https://` origin is allowed in addition to `CORS_ORIGINS`. Keep the database session pooler (port 5432). A pool of 10 on several instances can exhaust Supabase's session limit.

Health: `GET /api/health`  
Webhook: `POST /webhooks/app` with `x-tpo-timestamp` and `x-tpo-signature` (HMAC-SHA256 of `timestamp.rawBody`). Point `WEBHOOK_URL` at `https://<deployment>/webhooks/app` only on the machine that runs `npm run send-event`. The running app does not read it.

In-memory rate limits apply per instance, not across the whole project.
