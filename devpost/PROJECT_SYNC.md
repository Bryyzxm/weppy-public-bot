# Devpost Submission Sync

## Project
- **Name:** Weppy — Public Sales Pipeline Assistant (Telegram + Web)
- **Web app:** <https://weppy-public-bot.bryyzxm.workers.dev/app> — chat with the same assistant in the browser, no install.
- **Public bot:** [@recap_sales_bot](https://t.me/recap_sales_bot) — same Worker at `https://weppy-public-bot.bryyzxm.workers.dev` (health `/healthz`)
- **Tagline:** Turn sales visit voice notes into private pipeline notes, follow-ups and recaps — on Telegram or in the browser.

## What it does
Weppy turns a sales visit message or voice note into a structured personal pipeline note, asks for missing fields with Skip, then offers owner-only follow-up reminders, daily recaps, detail views and CSV exports. One conversation engine (`src/chat.ts`) serves both the public Telegram bot and the public web app; each private Telegram `chat_id` and each web session token is its own owner boundary.

## Key features
- Public Telegram bot with onboarding per private account
- Public web app: same flow, voice recording in the browser, pipeline side panel, CSV download
- Voice notes (Telegram or browser) → Groq transcription → structured four-field report
- Clarification prompts and Skip, with persistent private drafts
- User-specific follow-up reminders and daily recaps (Telegram push; web pulls a recap on demand)
- Owner-only usage statistics (distinct users, web users, 7/30-day actives, returning users, note authors) via `/admin/stats`
- Owner-scoped note detail and CSV export
- Indonesia / English replies
- Cloudflare Worker + D1 persistence, best-effort free tier

## Tech stack
- TypeScript, Cloudflare Workers
- Cloudflare D1 (SQLite)
- Telegram Bot API
- Groq Chat Completions + audio transcription
- Worker Cron Trigger in Asia/Jakarta schedule logic
- Worker static assets for the web client (no framework, no build step)
- Wrangler, Vitest and `@cloudflare/vitest-plugin`

## Architecture / files
- `src/chat.ts` — transport-agnostic conversation engine: onboarding, extraction, clarification, recap, follow-ups, settings, CSV
- `src/worker.ts` — web API, Telegram webhook, per-owner routing, Cron jobs, admin stats
- `public/index.html`, `public/app.html`, `public/app.js`, `public/styles.css`, `public/favicon.svg` — landing page and web chat client
- `src/delivery.ts` — atomic per-owner/per-date scheduled-delivery claims
- `schema.sql` — D1 profiles, owner-scoped notes, activity, processed updates
- `wrangler.jsonc` — Worker entrypoint, assets binding, D1 binding, one-minute Cron Trigger
- `tests/worker.test.ts`, `tests/web.test.ts`, `tests/delivery.test.ts` — D1 isolation, foreign callback, webhook secret, web session/report/voice/export, concurrent scheduled-delivery claims
- Legacy `app.py`, `telegram_poll.py`, `store.py`, `test_telegram.py` — local Python POC only; not the deployed public Worker

## Operational and privacy limits
- Best-effort availability, no 24/7 SLA; free plan quota exhaustion or provider outage can interrupt the service.
- No shared notes, group chats, public data endpoints or managed backups.
- Web sessions live in browser `localStorage`; clearing storage or starting a new session starts fresh data. Web sessions never receive scheduled pushes.
- Do not invite customers to enter sensitive data in the free/demo service.
- Real Telegram delivery needs owner-controlled Cloudflare secrets and BotFather/Groq credentials; none are committed. Web delivery is live.

## Revisions

- Added a public web app on the same engine: `/` is the landing page, `/app` the chat client. New routes `/api/session`, `/api/message`, `/api/voice`, `/api/export` map a `localStorage` token to owner `web:<token>`, and Cron skips those owners. Verified end-to-end on the deployed Worker, including a real Groq voice upload.
- Usage statistics now cover real usage, not just a 5-minute window: `user_days` records one row per user per WIB day, and `/admin/stats` reports `active_today`, `active_7d`, `active_30d`, `returning_users`, `note_users`, `web_users`, and a 14-day `daily_active` series. `npm run stats` prints it for humans; applying `schema.sql` backfills note-creation days.

## Submission checklist
- [x] Public-service scope and isolation documented
- [x] Worker + D1 schema implemented
- [x] Local D1 schema, Worker health and secret-rejection smoke exercised
- [x] Worker integration tests pass for account isolation and private note callbacks
- [x] Web integration tests pass for session isolation, report/clarification/recap, CSV export, voice upload
- [x] TypeScript typecheck, deploy dry-run, and deployed web smoke pass
- [ ] Owner sets real Telegram secrets and registers the Telegram webhook for live bot delivery
- [ ] Real public Telegram/Groq smoke check and bot username republished
- [ ] Demo video
- [ ] Screenshots for gallery
