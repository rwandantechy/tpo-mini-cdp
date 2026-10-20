# Mini CDP

A small dashboard that brings newsletter subscribers, website visits, and mobile app events together. This is an assessment project, not an official Pour Over product.

The app uses a fixed reference date of **September 28, 2026**. “Quiet” means no email open in the previous 30 days.

## Run locally

You’ll need Node 20 and PostgreSQL. The hosted app uses Supabase. Copy `.env.example` to `.env`, then set `DATABASE_URL` and generate `SESSION_SECRET` and `WEBHOOK_SECRET` with `openssl rand -hex 32`.

```bash
cp .env.example .env
npm install
npm run migrate
npm run create-user
npm run import
```

`npm run migrate` creates the schema. `npm run create-user` creates a dashboard account interactively; the password is hidden while typing, hashed with scrypt, and stored in the database. There is no public signup page. Run the migration and account command against the same database the app will use. `npm run import` loads the CSV files in `data/`.

Start the API and UI in separate terminals. They run at `http://127.0.0.1:4000` and `http://localhost:5173` respectively:

```bash
npm run dev
```

```bash
npm run dev:web
```

The CSV files in `data/` contain subscriber, website, and app-account data. To send sample mobile events:

```bash
npm run send-event -- --event app_open --device d_test_001
npm run send-event -- --event login --device d_test_001 --user u_0d6f8a22
npm run send-event -- --event read_story --device d_test_001
```

## How identities work

Email addresses are trimmed and lowercased; Gmail dots and `+tags` are kept. Subscribers with the same normalized email merge: the earliest signup, latest open, unsubscribed status, and original signup source are kept. App accounts link by email. On a device’s first login, earlier anonymous events are linked too. Later logins claim events only from their own time forward. Website visits attach to the earliest email captured for that visitor; the email is not stored on each pageview.

The `POST /webhooks/app` endpoint accepts `app_open`, `read_story`, `link_click`, and `login`. Sign `timestamp.rawBody` with HMAC-SHA256 and send it in `x-tpo-signature`; send the timestamp in `x-tpo-timestamp`. Timestamps must be within five minutes. A new event returns `201`; a repeated `event_id` returns `200`.

## Assistant and deployment

The assistant sends Gemini aggregate tool names, filters, and counts. It does not send the question, conversation history, emails, names, or subscriber rows. Unsupported questions are answered without calling Gemini. Replies containing an email or a two-word name are filtered before display.

Vercel serves the UI and API on one domain; `/api` and `/webhooks` are routed to Express. Keep `VITE_API_BASE_URL` empty. Set the production environment variables in Vercel, then run `npm run migrate`, `npm run create-user`, and `npm run import` locally with `.env` pointing to the production database. Deploys do not run these setup commands. The health check is `GET /api/health`.

## Known limits

- Cold and quiet calculations use the fixed assessment date above.
- A given name without a surname is not treated as a person in assistant answers.
- The API database user bypasses row-level security; app routes rely on the session cookie for access control.
- Rate limits are local to each server instance.
