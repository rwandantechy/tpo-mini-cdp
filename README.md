# Mini CDP

A small dashboard that brings newsletter subscribers, website visits, and mobile app events together. This is an assessment project, not an official Pour Over product.

The app uses a fixed reference date of **September 28, 2026**. “Quiet” means no email open in the previous 30 days.

## Run locally

You’ll need Node 20 and a PostgreSQL database. Supabase is used for the hosted setup.

```bash
cp .env.example .env
npm install
npm run hash-password
npm run migrate
npm run import
npm run dev          # API at http://127.0.0.1:4000
npm run dev:web      # UI at http://localhost:5173
```

Add your database URL and generated secrets to `.env`; see [.env.example](.env.example) for the full list. Run the password command in a separate terminal and copy its output into `.env`.

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

Vercel serves the UI and API on one domain; `/api` and `/webhooks` are routed to Express. Keep `VITE_API_BASE_URL` empty. Deploys do not run database migrations or import CSV data, so do those separately. The health check is `GET /api/health`.

## Known limits

- Cold and quiet calculations use the fixed assessment date above.
- A given name without a surname is not treated as a person in assistant answers.
- The API database user bypasses row-level security; app routes rely on the session cookie for access control.
- Rate limits are local to each server instance.
