---
doc: spec
status: draft
---

# Weppy — Public Sales Assistant Technical Spec

## How This Works, In Plain Language

Weppy runs as a TypeScript Cloudflare Worker with D1 persistence. It does not depend on a laptop process staying awake. Two transports share one conversation engine (`src/chat.ts`): the Telegram webhook and a public browser app (`public/`, served as Worker static assets).

1. **Telegram inbox:** Telegram posts to an HTTPS Worker webhook. The Worker checks Telegram's secret-token header before processing updates and accepts only private chats.
2. **Web inbox:** The browser app asks for a session, stores the returned token in `localStorage`, and calls `/api/session`, `/api/message`, `/api/voice`, and `/api/export`. The Worker maps the token to owner `web:<token>`, which can never collide with a numeric Telegram chat ID.
3. **Shared engine:** Both transports call the same engine, which owns onboarding, extraction, clarification, recap, follow-ups, settings and CSV. Behavior cannot drift between web and Telegram.
4. **AI calls:** The Worker calls Groq for extraction and voice transcription. API credentials are Cloudflare secrets and never reach the browser. Groq rate limits apply.
5. **Private database:** D1 stores a profile per owner; each pipeline note is keyed by both its owner and note ID. A note ID alone never authorizes access.
6. **Scheduled messages:** A Cron Trigger checks schedules in `Asia/Jakarta`, skips `web:%` owners because a browser session cannot receive push messages, then reads and sends only that owner's notes.

Cloudflare Workers + D1 avoids a paid VM/card requirement for standard free use, but provider signup checks and policies can change. Free-tier quota exhaustion, outages, or Telegram/Groq limits can interrupt service. This is best-effort hosting, not guaranteed 24/7, managed backup, or an SLA.

## The Core Journey Through the System

1. A user opens the public Telegram bot and sends `/start`, or opens the web app at `/app`.
2. Telegram posts an update to `/telegram/webhook`; the Worker verifies `X-Telegram-Bot-Api-Secret-Token`. Web requests carry a `localStorage` session token instead.
3. D1 claims the Telegram `update_id` once; the Worker loads the profile for the private chat ID or the web owner and starts onboarding if required.
4. Text goes to Groq extraction. Telegram voice notes are downloaded from Telegram and transcribed with Groq; web recordings are uploaded to `/api/voice` and transcribed with Groq. Unclear, failed, empty, or over-20-MB audio receives an honest retry/type-text response.
5. Notes and clarification state are stored under the owner id. Answers and Skip update only that owner's draft.
6. Greetings, recap, follow-up, note-detail, and CSV read only the requesting owner. A foreign note ID is not found.
7. Cron evaluates schedules in Asia/Jakarta and sends only each Telegram owner's notes.

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
4. Check `http://localhost:8787/healthz`; open `http://localhost:8787/` for the landing page and `/app` for the web chat. `node scripts/smoke-worker.mjs` checks health, unauthenticated webhook rejection, served pages, and web-session startup. A reachable HTTPS tunnel is required for real Telegram local webhooks; the web app needs none.

### Public deployment

- Owner setup required: Cloudflare account, remote D1 database ID, BotFather Telegram bot/token, Telegram webhook secret, and Groq API key.
- Create remote schema with `npx wrangler d1 execute weppy-public-bot --remote --file schema.sql`.
- Set secrets with `npx wrangler secret put TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and `GROQ_API_KEY`.
- Deploy with `npx wrangler deploy`; the command uploads `public/` assets and binds them to the Worker.
- Anyone can then try the web app at `<WORKER_URL>/` without installing anything; the Telegram bot additionally needs `setWebhook` for `<WORKER_URL>/telegram/webhook` with the matching `secret_token`, verified with `getWebhookInfo`.
- Public deployment requires owner-authenticated Cloudflare access and owner-controlled secrets. Do not request or commit secrets.

### Legacy local prototype

`app.py`, `telegram_poll.py`, and Python JSON storage remain a local-only demo. The public service uses `src/worker.ts` and D1; Python tests do not validate Worker production setup.

## Look and Feel

- Inline button labels use concise emoji cues for quicker scanning; callback IDs and button actions remain unchanged.
- Cards show four pipeline fields and explicit missing values; never invent absent facts.
- Voice, text, details, recap and CSV are scoped to the owning session or Telegram chat.
- Sub-menu, detail, dan langkah input menyertakan tombol Back yang kembali ke menu utama tanpa menerapkan jawaban atau mengubah catatan yang belum selesai.
- The web client renders the same engine messages as chat bubbles, note cards, inline action buttons, and a file card; it never invents a parallel state machine.

## Components

### Webhook Router (`src/worker.ts`)

Implements `prd.md > 0. Onboarding per pengguna`, `prd.md > 1. Sapaan dan bantuan`, `prd.md > 2. Kirim laporan teks atau voice note`, and `prd.md > 4. Klarifikasi dengan Skip`.

Validates Telegram's secret header in constant time. Parses updates with a private `chat.id`; group chats are ignored. D1 claims `update_id` before processing retries. The same module serves the web API routes and renders every engine message through the Telegram transport.

### Conversation Engine (`src/chat.ts`)

Implements `prd.md > 0. Onboarding per pengguna` through `prd.md > 7. Pengaturan, menu, dan ekspor`.

Transport-agnostic: it takes an owner id and input, and returns ordered outbound messages (text, inline buttons, note card, file). It owns profile/note persistence, Groq extraction and transcription, clarification with Skip, recap, follow-ups, settings and CSV generation. Both transports therefore share identical behavior and copy.

### Web Client (`public/`)

Implements `prd.md > Screens and Layout` and `prd.md > Look and Feel`.

`public/index.html` is the public landing page; `public/app.html` plus `public/app.js` and `public/styles.css` are the browser app. The client stores the session token in `localStorage`, renders chat bubbles, note cards and action buttons, records voice notes with `MediaRecorder` and uploads them to `/api/voice`, and downloads CSV from `/api/export`. It sends no credentials and holds no conversation logic of its own.

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

`src/worker.ts` owns the web API, Telegram webhook, private admin stats, and scheduled handlers. `/admin/stats` returns active private-chat users (last five minutes), total distinct users with a profile or activity record (including `web_users`), distinct users active on the current WIB day and within 7/30 days, users active on two or more WIB days, note authors, and a 14-day per-day active series. It requires `Authorization: Bearer <ANALYTICS_ADMIN_TOKEN>` and returns aggregate counts only. `src/chat.ts` owns conversation and Groq logic; `src/delivery.ts` owns the atomic per-user schedule claim. `schema.sql` creates D1 tables/indexes; `wrangler.jsonc` binds D1, Cron, and the `public/` assets directory. `tests/worker.test.ts` covers Telegram isolation, stats, callbacks, and concurrent delivery claims; `tests/web.test.ts` covers web sessions, onboarding, report/clarification/recap, CSV export, session isolation, and voice upload.

## Failure Modes and Limits

- Missing/wrong Telegram secret: return 403 before update processing.
- Non-private chat: ignore; private chats only.
- Invalid or missing web session token: reject `/api/message`, `/api/voice`, and `/api/export` with 400 and create no data.
- Worker/D1 quota, outage, or maintenance: requests/jobs may fail until recovery; no SLA or managed backup. Admin statistics require a configured token and the updated D1 schema.
- Groq quota/model/key/response errors: ask to retry; do not store fabricated data.
- Telegram outbound failure: daily marker prevents duplicate delivery, but may skip that day's message.
- Web sessions cannot receive scheduled pushes; recaps are pulled from the app and reminders stay on the Telegram path.
- Duplicate webhook update: unique D1 `update_id` prevents replay processing.
- Foreign note ID: query requires both owner and ID, so it returns not found.
- Active-user count reflects recent private-chat or web interaction over a five-minute window; Telegram provides no live-online presence signal.

## Decisions and Open Questions

- **Cloudflare Workers + D1, TypeScript:** learner selected free best-effort hosting without a card for standard usage. This changes the Python/Flask public deployment; Python remains a local demo.
- **Shared engine, two transports:** the web app reuses `src/chat.ts` so the browser demo matches the Telegram bot exactly, rather than reimplementing the flow.
- **Composite note key `(owner_id, id)`:** tenant separation is structural; raw note IDs are not authorization tokens. Web owners are namespaced `web:<token>` so they cannot collide with Telegram chat IDs.
- **Atomic Cron claims:** per-user D1 conditional updates guarantee one winning send attempt for each schedule/date across concurrent Cron invocations. Failed delivery can be skipped for that day's slot.
- **Owner steps pending:** set real Telegram/Groq secrets and register the Telegram webhook to enable live bot delivery. Web delivery is live at the Worker URL.
