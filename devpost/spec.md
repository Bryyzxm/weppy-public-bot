---
doc: spec
status: draft
---

# Weppy — Public Telegram Sales Assistant Technical Spec

## How This Works, In Plain Language

Weppy runs as a TypeScript Cloudflare Worker with D1 persistence. It does not depend on a laptop process staying awake.

1. **Telegram inbox:** Telegram posts to an HTTPS Worker webhook. The Worker checks Telegram's secret-token header before processing updates and accepts only private chats.
2. **AI calls:** The Worker calls Groq for extraction and voice transcription. API credentials are Cloudflare secrets, never repository values. Groq rate limits apply.
3. **Private database:** D1 stores a profile per Telegram `chat_id`; each pipeline note is keyed by both its owner and note ID. A note ID alone never authorizes access.
4. **Scheduled messages:** A Cron Trigger checks schedules in `Asia/Jakarta`, then reads and sends only that owner's notes.

Cloudflare Workers + D1 avoids a paid VM/card requirement for standard free use, but provider signup checks and policies can change. Free-tier quota exhaustion, outages, or Telegram/Groq limits can interrupt service. This is best-effort hosting, not guaranteed 24/7, managed backup, or an SLA.

## The Core Journey Through the System

1. A user opens the public Telegram bot and sends `/start`.
2. Telegram posts an update to `/telegram/webhook`; the Worker verifies `X-Telegram-Bot-Api-Secret-Token`.
3. D1 claims the `update_id` once, loads the profile for the private chat ID, and starts onboarding if required.
4. Text goes to Groq extraction. Voice notes are downloaded from Telegram and transcribed with Groq. Unclear, failed, empty, or over-20-MB audio receives an honest retry/type-text response.
5. Notes and clarification state are stored under `owner_id = chat_id`. Answers and Skip update only that owner's draft.
6. Greetings, recap, follow-up, note-detail callbacks, and CSV read only the requesting owner. A foreign note ID is not found.
7. Cron evaluates schedules in Asia/Jakarta and sends only each owner's notes.

## Stack and Constraints

- **Cloudflare Worker in TypeScript:** native Fetch handler; no resident poller or Flask process. Telegram/Groq calls use Worker `fetch`.
  - Docs: https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/ ; https://developers.cloudflare.com/workers/platform/limits/
- **Cloudflare D1:** SQLite with composite `PRIMARY KEY(owner_id, id)` for notes; every note lookup/update includes `owner_id`.
  - Docs: https://developers.cloudflare.com/d1/worker-api/ ; https://developers.cloudflare.com/d1/platform/pricing/
- **Cloudflare Cron Trigger:** checks each minute; cron schedules are UTC, while delivery comparisons use IANA `Asia/Jakarta`.
  - Docs: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- **Workers Free current documented limits:** 100,000 requests/day and 10 ms CPU per invocation. **D1 Free:** 5 million rows read/day, 100,000 rows written/day, 5 GB total storage. Quota exhaustion causes operations to fail; verify current provider terms before release.
- **Telegram Bot API:** HTTPS webhook, inline keyboards, document export and voice-file retrieval. Docs: https://core.telegram.org/bots/api
- **Groq REST:** chat completions and audio transcription; usage/rate limits and provider data terms apply. Docs: https://console.groq.com/docs
- **No card:** Cloudflare documents a free Workers plan for standard free usage; account signup checks and terms remain provider-controlled. Do not enable paid billing unless the owner decides to.

## Where It Runs and How Someone Tries It

### Local Worker

1. Install Node/npm and run `npm install`.
2. Create `.dev.vars` from `.dev.vars.example` and enter the three local secrets. `.dev.vars` is gitignored.
3. Create a local D1 database and run Wrangler:
   - `npx wrangler d1 create weppy-public-bot`
   - Copy the returned `database_id` into `wrangler.jsonc`.
   - `npx wrangler d1 execute weppy-public-bot --local --file schema.sql`
   - `npm run dev -- --local`
4. Check `http://localhost:8787/healthz`; `node scripts/smoke-worker.mjs` checks health and that an unauthenticated webhook is rejected. A reachable HTTPS tunnel is required for real Telegram local webhooks.

### Public deployment

- Owner setup required: Cloudflare account, remote D1 database ID, BotFather Telegram bot/token, Telegram webhook secret, and Groq API key.
- Create remote schema with `npx wrangler d1 execute weppy-public-bot --remote --file schema.sql`.
- Set secrets with `npx wrangler secret put TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and `GROQ_API_KEY`.
- Deploy with `npx wrangler deploy`.
- Register Telegram `setWebhook` for `<WORKER_URL>/telegram/webhook`, providing the matching `secret_token`; verify with `getWebhookInfo`.
- Public deployment requires owner-authenticated Cloudflare access and owner-controlled secrets. Do not request or commit secrets.

### Legacy local prototype

`app.py`, `telegram_poll.py`, and Python JSON storage remain a local-only demo. The public service uses `src/worker.ts` and D1; Python tests do not validate Worker production setup.

## Look and Feel

- Inline button labels use concise emoji cues for quicker scanning; callback IDs and button actions remain unchanged.
- Cards show four pipeline fields and explicit missing values; never invent absent facts.
- Voice, text, details, recap and CSV are scoped to the Telegram chat owner.
- Sub-menu, detail, dan langkah input menyertakan tombol Back yang kembali ke menu utama tanpa menerapkan jawaban atau mengubah catatan yang belum selesai.

## Components

### Webhook Router (`src/worker.ts`)

Implements `prd.md > 0. Onboarding per pengguna`, `prd.md > 1. Sapaan dan bantuan`, `prd.md > 2. Kirim laporan teks atau voice note`, and `prd.md > 4. Klarifikasi dengan Skip`.

Validates Telegram's secret header in constant time. Parses updates with a private `chat.id`; group chats are ignored. D1 claims `update_id` before processing retries.

### Telegram Transport

Implements `prd.md > 1. Sapaan dan bantuan`, `prd.md > 4. Klarifikasi dengan Skip`, and `prd.md > 7. Pengaturan, menu, dan ekspor`.

Worker `fetch` sends messages, callbacks, files, and voice downloads through Bot API. The bot token comes from a secret. Production does not poll a long-running process.

### Groq Agent and Transcription

Implements `prd.md > 2. Kirim laporan teks atau voice note` and `prd.md > 3. Kartu laporan hasil ekstraksi`.

Strict JSON extraction yields note fields and follow-up date; unknown facts stay empty. Voice transcription uses Groq; failed/unclear transcription returns a retry prompt. No local Whisper model is loaded in the Worker.

### D1 Storage (`schema.sql`)

Implements `prd.md > 3. Kartu laporan hasil ekstraksi`, `prd.md > 4. Klarifikasi dengan Skip`, and `prd.md > 8. Persistensi dan operasi layanan publik`.

```sql
CREATE TABLE profiles (
  owner_id TEXT PRIMARY KEY,
  profile_json TEXT NOT NULL,
  onboarding_stage TEXT NOT NULL DEFAULT 'new',
  recap_time TEXT NOT NULL DEFAULT '17:00',
  last_recap_date TEXT NOT NULL DEFAULT '',
  last_followup_date TEXT NOT NULL DEFAULT ''
);
CREATE INDEX profiles_recap_schedule ON profiles(onboarding_stage, recap_time, last_recap_date);
CREATE INDEX profiles_followup_schedule ON profiles(onboarding_stage, last_followup_date);
CREATE TABLE notes (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  note_json TEXT NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id) REFERENCES profiles(owner_id)
);
CREATE INDEX notes_by_owner_created ON notes(owner_id, created_at);
CREATE TABLE processed_updates (
  update_id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL
);
CREATE INDEX processed_updates_by_created ON processed_updates(created_at);
CREATE TABLE user_activity (
  owner_id TEXT PRIMARY KEY,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX user_activity_by_last_seen ON user_activity(last_seen_at);
CREATE TABLE user_days (
  owner_id TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (owner_id, day)
);
CREATE INDEX user_days_by_day ON user_days(day);
-- Applying the schema also backfills one row per owner per note-creation day.
```

Every note query includes the owner ID. D1 has no public read endpoint; CSV is generated in memory and sent to its owner. The owner-only `/admin/stats` endpoint requires the `ANALYTICS_ADMIN_TOKEN` secret and returns aggregate counts only, never chat IDs or profiles. “Active” means a private chat interaction in the last five minutes, not a Telegram online-presence signal; per-day actives, returning users, and note authors come from aggregate counts in `user_days`. Legacy Python JSON is not migrated into D1 automatically.

### Cron Scheduler

Implements `prd.md > 5. Pengingat follow-up`, `prd.md > 6. Rekap pipeline`, and `prd.md > 8. Persistensi dan operasi layanan publik`.

Cron `*/1 * * * *` selects due onboarded profiles through indexed schedule fields; it reads notes only after selecting the owner. `src/delivery.ts` claims `last_recap_date`/`last_followup_date` using an atomic conditional D1 update. Only the invocation that changes an empty/different marker sends; overlapping invocations cannot send a second notification for the same owner/kind/date. The marker is written before Telegram delivery to avoid retry duplicates, so a failed send may miss that day's message. Manual commands remain available.

### Worker Configuration and Tests

`src/worker.ts` owns webhook, private admin stats, and scheduled handlers. `/admin/stats` returns active private-chat users (last five minutes), total distinct users with a profile or activity record, distinct users active on the current WIB day and within 7/30 days, users active on two or more WIB days, note authors, and a 14-day per-day active series. It requires `Authorization: Bearer <ANALYTICS_ADMIN_TOKEN>` and returns aggregate counts only. `src/delivery.ts` owns the atomic per-user schedule claim. `schema.sql` creates D1 tables/indexes; `wrangler.jsonc` binds D1 and Cron. `tests/worker.test.ts` covers the real D1 runtime, owner isolation, protected aggregate stats, callbacks, and concurrent delivery claims.

## Failure Modes and Limits

- Missing/wrong Telegram secret: return 403 before update processing.
- Non-private chat: ignore; private chats only.
- Worker/D1 quota, outage, or maintenance: requests/jobs may fail until recovery; no SLA or managed backup. Admin statistics require a configured token and the updated D1 schema.
- Groq quota/model/key/response errors: ask to retry; do not store fabricated data.
- Telegram outbound failure: daily marker prevents duplicate delivery, but may skip that day's message.
- Duplicate webhook update: unique D1 `update_id` prevents replay processing.
- Foreign note ID: query requires both owner and ID, so it returns not found.
- Active-user count reflects recent private-chat interaction over a five-minute window; Telegram provides no live-online presence signal.

## Decisions and Open Questions

- **Cloudflare Workers + D1, TypeScript:** learner selected free best-effort hosting without a card for standard usage. This changes the Python/Flask public deployment; Python remains a local demo.
- **Composite note key `(owner_id, id)`:** tenant separation is structural; raw note IDs are not authorization tokens.
- **Atomic Cron claims:** per-user D1 conditional updates guarantee one winning send attempt for each schedule/date across concurrent Cron invocations. Failed delivery can be skipped for that day's slot.
- **Owner steps pending:** remote D1/account creation, secret provisioning, Worker deployment, Telegram webhook registration, and live Telegram/Groq smoke. Public availability and bot username are not yet verified.
