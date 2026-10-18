# Weppy — Public Telegram Sales Assistant

Weppy turns a B2B sales visit message or voice note into a structured personal pipeline note, asks for missing facts with **Skip**, and sends private follow-up reminders, recaps, and CSV exports.

## Try it

- **Live demo bot:** [@recap_sales_bot](https://t.me/recap_sales_bot) — private chats only; send `/start`.
- **Health check:** <https://weppy-public-bot.bryyzxm.workers.dev/healthz> returns `{"ok":true}`.
- **Status:** best-effort free tier (Cloudflare Workers + D1 free plan, Telegram, Groq). No SLA, no managed backups.

## Stack

TypeScript Cloudflare Worker (`src/worker.ts`) + Cloudflare D1 (SQLite) + Telegram Bot API + Groq (chat extraction and audio transcription), with a Worker Cron Trigger scheduled in `Asia/Jakarta` (`*/1 * * * *`). Integration tests use Vitest with `@cloudflare/vitest-plugin` against a local D1 emulator (`npm run test`, 12 tests covering owner isolation, webhook-secret rejection, atomic Cron claims, and usage statistics). The earlier Flask/polling prototype (`app.py`, `telegram_poll.py`) is kept as a local demo only.

## Public deployment (Cloudflare Workers + D1)

The demo bot runs as this Cloudflare Worker (`https://weppy-public-bot.bryyzxm.workers.dev`) with D1 storing profiles, notes, drafts, schedules, and processed update IDs. Every profile/note query is scoped to the sender's private Telegram `chat_id`; group chats are rejected. No shared customer data or allowlist.

This repository contains no credentials or API keys. Deploying a separate instance requires a Cloudflare account, a `@BotFather` bot, and a Groq API key; the steps below create the database, set secrets, and deploy. The free service is best-effort, not an uptime guarantee. Quota exhaustion, provider outages, Telegram or Groq limits may interrupt service. No managed backups or SLA are promised; do not enter sensitive customer data in a demo account.

### Required accounts and local tools

- A Cloudflare account on the Workers Free plan. Do not upgrade or enable billing unless you explicitly choose to.
- `@BotFather` bot token and Telegram webhook secret (1–256 ASCII letters, digits, `_` or `-`).
- Groq API key. Groq usage/rate limits are independent of Cloudflare quotas.
- Node.js/npm for the public Worker. Python/`uv` are only needed for the separate legacy local prototype.

### Local Worker development

1. Run `npm install`.
2. Create `.dev.vars` from `.dev.vars.example` and enter the three local secrets. `.dev.vars` is gitignored; Wrangler reads this file separately from the legacy Python `.env`.
3. Create a local D1 database and apply the schema:

   ```bash
   npx wrangler d1 create weppy-public-bot
   # Copy database_id into wrangler.jsonc, then apply schema locally:
   npx wrangler d1 execute weppy-public-bot --local --file schema.sql
   npm run dev -- --local
   ```
4. Health is available at `http://localhost:8787/healthz`; run `node scripts/smoke-worker.mjs` to verify health and webhook-secret rejection. A reachable HTTPS tunnel is needed to receive real Telegram webhooks locally.


### Public deploy (owner-authenticated)

1. Authenticate interactively: `npx wrangler login`.
2. Create remote D1: `npx wrangler d1 create weppy-public-bot`; put the returned database ID in `wrangler.jsonc`.
3. Apply schema: `npx wrangler d1 execute weppy-public-bot --remote --file schema.sql`.
4. Set secrets via Wrangler prompts (never put real values in git, chat, or logs):

   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
   npx wrangler secret put GROQ_API_KEY
   ```

5. Deploy: `npx wrangler deploy`.
6. Configure Telegram `setWebhook` for `<WORKER_URL>/telegram/webhook` with the same webhook `secret_token`. Verify with Telegram `getWebhookInfo` and `npx wrangler tail`; then share the BotFather username.
7. Cron `*/1 * * * *` runs in UTC and sends messages at per-user Asia/Jakarta schedules. The service stores each user's daily send marker before calling Telegram to prevent duplicate retries. A failed delivery can therefore miss that day's scheduled message; manual `rekap sekarang` / `cek follow-up` remains available.

### User activity statistics

An owner-only JSON endpoint reports distinct Telegram private-chat users, without exposing chat IDs or profile data. Configure a long random bearer token as `ANALYTICS_ADMIN_TOKEN` with `npx wrangler secret put ANALYTICS_ADMIN_TOKEN` (enter the value at Wrangler's prompt; do not put tokens in shell history), then deploy. Each `wrangler secret put` immediately deploys a Worker version, so apply the updated D1 schema first:

```bash
npx wrangler d1 execute weppy-public-bot --remote --file schema.sql
npx wrangler secret put ANALYTICS_ADMIN_TOKEN
npx wrangler deploy
```

Token admin yang dibuat untuk deployment ini tersimpan lokal di `.analytics-admin-token` (jangan commit atau bagikan file itu). Dari root repository, jalankan `npm run stats` untuk ringkasan yang mudah dibaca:

```bash
npm run stats                                            # pakai Worker publik + .analytics-admin-token
WORKER_URL=http://127.0.0.1:8787 npm run stats           # Worker lokal (ANALYTICS_ADMIN_TOKEN dari .dev.vars)
```

Untuk JSON mentah:

```bash
curl -sS -H "Authorization: Bearer $(cat .analytics-admin-token)" "https://weppy-public-bot.bryyzxm.workers.dev/admin/stats"
```

Jika token dibuat ulang, simpan token barunya di file tersebut sebelum memakai perintah di atas. Jangan mengetikkan token langsung ke command line atau membagikan output yang memuatnya.

Response shape:

```json
{"active_users":0,"active_window_minutes":5,"total_users":2,"active_today":1,"active_7d":2,"active_30d":2,"returning_users":1,"note_users":2,"daily_active":[{"day":"2026-10-14","users":2},{"day":"2026-10-18","users":1}],"generated_at":"2026-10-18T11:10:50.484Z"}
```

- `active_users` — distinct private-chat users who sent a message or callback in the last five minutes. Telegram offers no online/presence signal, so this is recent activity, not a live-online count.
- `total_users` — distinct users with a stored profile or recorded activity, i.e. everyone who ever contacted the bot.
- `active_today` / `active_7d` / `active_30d` — distinct users with at least one message or callback on the current WIB day, or within the last 7 / 30 days.
- `returning_users` — distinct users active on two or more different WIB days, i.e. people who came back.
- `note_users` — distinct users with at least one stored pipeline note, i.e. people who used the core flow rather than only `/start`.
- `daily_active` — per-day distinct users for the last 14 WIB days, oldest first.

`user_days` stores one row per user per active WIB day; applying `schema.sql` also backfills note-creation days, so history from before that table existed stays countable. No chat IDs, names, or note contents are returned. Keep the token private. Omitting `ANALYTICS_ADMIN_TOKEN` disables the endpoint, and unauthorized requests return 403.

Never put a token directly into command history. If a bot or API token was exposed, revoke/rotate it at its provider; rotate `ANALYTICS_ADMIN_TOKEN` with `npx wrangler secret put ANALYTICS_ADMIN_TOKEN`.

### Free-plan limits

Current Cloudflare documentation lists Workers Free at 100,000 requests/day and 10 ms CPU per invocation; D1 Free at 5 million rows read/day, 100,000 rows written/day, and 5 GB total storage. Reaching limits makes requests/queries fail until reset or storage is freed. Provider signup checks and plan terms can change; verify current Cloudflare terms. Free-plan access does not imply a 24/7 SLA or managed backup. Telegram and Groq quotas also apply. Voice files over 20 MB are not transcribed.

## Local Python demo (legacy prototype)

The earlier Flask/polling bot remains a local demo only. It uses local JSON and does not run the public D1 service.

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python test_telegram.py
python telegram_poll.py
```

Configure `GROQ_API_KEY`, `CHAT_TRANSPORT=telegram`, and `TELEGRAM_BOT_TOKEN` in `.env`. This Python regression verifies only the retained local prototype, not the deployed Worker or D1 tenant isolation.
