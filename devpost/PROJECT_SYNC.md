# Devpost Submission Sync

## Project
- **Name:** Weppy — Public Telegram Sales Pipeline Assistant
- **Public bot:** [@recap_sales_bot](https://t.me/recap_sales_bot) — live Worker at `https://weppy-public-bot.bryyzxm.workers.dev` (health `/healthz`)
- **Tagline:** Turn sales visit voice notes into private pipeline notes, follow-ups and recaps in Telegram.

## What it does
Weppy turns a sales visit message or voice note into a structured personal pipeline note, asks for missing fields with Skip, then sends owner-only follow-up reminders, daily recaps, detail views and CSV exports through a public Telegram bot. Each private Telegram `chat_id` is an owner boundary for its profile and notes.

## Key features
- Public Telegram bot with onboarding per private account
- Voice notes → Groq transcription → structured four-field report
- Clarification prompts and Skip, with persistent private drafts
- User-specific follow-up reminders and daily recaps
- Owner-only usage statistics (distinct users, 7/30-day actives, returning users, note authors) via `/admin/stats`
- Owner-scoped note detail callbacks and CSV export
- Indonesia / English replies
- Cloudflare Worker + D1 persistence, best-effort free tier

## Tech stack
- TypeScript, Cloudflare Workers
- Cloudflare D1 (SQLite)
- Telegram Bot API
- Groq Chat Completions + audio transcription
- Worker Cron Trigger in Asia/Jakarta schedule logic
- Wrangler, Vitest and `@cloudflare/vitest-plugin`

## Architecture / files
- `src/worker.ts` — public Telegram webhook, private per-owner routing, Groq/Telegram APIs, Cron jobs
- `src/delivery.ts` — atomic per-owner/per-date scheduled-delivery claims
- `schema.sql` — D1 profiles, owner-scoped notes, processed updates
- `wrangler.jsonc` — Worker entrypoint, D1 binding, one-minute Cron Trigger
- `tests/worker.test.ts`, `tests/delivery.test.ts` — D1 isolation, foreign callback, webhook secret, concurrent scheduled-delivery claims
- Legacy `app.py`, `telegram_poll.py`, `store.py`, `test_telegram.py` — local Python POC only; not the deployed public Worker

## Operational and privacy limits
- Best-effort availability, no 24/7 SLA; free plan quota exhaustion or provider outage can interrupt the bot.
- No shared notes, group chats, public data endpoints or managed backups.
- Do not invite customers to enter sensitive data in the free/demo service.
- Real deploy needs owner-controlled Cloudflare account/secrets and BotFather/Groq credentials; none are committed.

## Revisions

- Usage statistics now cover real usage, not just a 5-minute window: `user_days` records one row per user per WIB day, and `/admin/stats` reports `active_today`, `active_7d`, `active_30d`, `returning_users`, `note_users`, and a 14-day `daily_active` series. `npm run stats` prints it for humans; applying `schema.sql` backfills note-creation days.

## Submission checklist
- [x] Public-service scope and isolation documented
- [x] Worker + D1 schema implemented
- [x] Local D1 schema, Worker health and secret-rejection smoke exercised
- [x] Worker integration tests pass for account isolation and private note callbacks
- [x] TypeScript typecheck and deploy dry-run pass
- [ ] Owner creates Cloudflare account/database, bot token and Groq key
- [ ] Owner deploys Worker and registers Telegram webhook
- [ ] Real public Telegram/Groq smoke check and bot username published
- [ ] Demo video
- [ ] Screenshots for gallery
