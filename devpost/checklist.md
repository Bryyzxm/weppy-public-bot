---
doc: checklist
status: draft
---
<!-- `status` tracks the build-plan review. Keep it `draft` until the learner approves the revised plan. -->

# Build Checklist

Build mode: fast

## Slices

- [x] **1. Earlier local Python prototype (historical checkpoint)**
  Becomes usable: The earlier local prototype completed its original demo flow. It is no longer the public deployment target.
  Why now: Preserve prior work without treating local JSON and polling as a public, multi-user hosted service.
  PRD ref: `prd.md > What We're Building`
  Spec ref: `spec.md > Legacy Python demo only`
  Build: Existing prototype only; public bot code is the following slice.
  Verify (mechanical): Historical Python work remains in the repository. No new acceptance claim is inferred from this line.
  Learner check: Not applicable; this records the previous local prototype.
  Commit: Existing repository history.

- [ ] **2. Public Telegram Worker with owner-isolated D1 data**
  Becomes usable: Owner deploys a public bot. Any private Telegram account can onboard, send text/voice notes, clarify with Skip, view/export its own notes, and receive its own recaps/follow-ups. A different account cannot read a note by ID.
  Why now: Learner requested public access with free best-effort availability and accepted Cloudflare Workers + D1. This replaces local-only hosting; owner-scoped durable storage and a webhook deployment are required before sharing the bot.
  PRD ref: `prd.md > The Core Journey`; `prd.md > Features and Behavior` (0–8); `prd.md > States and Boundaries`.
  Spec ref: `spec.md > Stack and Constraints`; `spec.md > Where It Runs and How Someone Tries It`; `spec.md > D1 Storage`; `spec.md > Cron Scheduler`; `spec.md > Failure Modes and Limits`.
  Build: Deploy TypeScript Worker `src/worker.ts` with Telegram secret validation, private-chat-only routing, Groq report/voice processing, onboarding/settings, per-owner D1 profiles/notes/drafts/update dedupe, owner-scoped detail/export, and Cron recap/follow-up. Apply `schema.sql`, configure `wrangler.jsonc`, use owner secrets, and document free-tier limits. `src/delivery.ts` performs conditional D1 date claims so overlapping Cron triggers cannot duplicate a user's daily recap or reminder.
  Verify (mechanical): `npm run test` tests secret rejection, owner isolation, foreign-ID callback rejection, and atomic concurrent Cron claims; `npm run typecheck`; `npx wrangler d1 execute weppy-public-bot --local --file schema.sql`; start `npm run dev -- --local` and run `npm run smoke`. `npx wrangler deploy --dry-run` validates bundle, not public delivery. Online acceptance still needs owner D1/secrets/deploy and real Telegram/Groq smoke.
  Learner check: After owner deployment, try two private Telegram accounts; record an item in account A and confirm account B can't see it through recap, export, or a foreign note callback. Test Skip, voice, CSV, and scheduled delivery.
  Commit: `Deploy private Telegram sales bot on Cloudflare Workers and D1`

- [x] **3. Public web app on the same conversation engine**
  Becomes usable: Anyone can open the Worker URL in a browser, onboard, send text or record a voice note, clarify with Skip, view the pipeline, run a recap, and download CSV — with the same behavior as Telegram. Web data is isolated per browser session and never mixes with Telegram owners.
  Why now: The learner asked for a website so users can try the bot directly on the web and confirmed it must work as smoothly as Telegram. Reusing the existing engine avoids a second, drifting implementation.
  PRD ref: `prd.md > Screens and Layout`; `prd.md > Look and Feel`; `prd.md > What We're Building` (2).
  Spec ref: `spec.md > Components` (Conversation Engine, Web Client); `spec.md > Failure Modes and Limits`.
  Build: Extract `src/chat.ts` from the Telegram handler so both transports share onboarding, extraction, clarification, recap, follow-up, settings and CSV. Add `/api/session`, `/api/message`, `/api/voice`, `/api/export` with `web:<token>` owners, skip those owners in Cron, and serve `public/index.html`, `public/app.html`, `public/app.js`, `public/styles.css` as Worker assets.
  Verify (mechanical): `npm run test` (21 tests, including `tests/web.test.ts`); `npm run typecheck`; `npm run smoke` against local and deployed Worker; browser walkthrough of onboarding → report → Skip → recap → detail → settings → CSV on desktop and mobile.
  Learner check: Open the deployed `/app`, complete onboarding, send a text report and a voice note, Skip a field, run a recap, and download CSV.
  Commit: `Add public web app sharing the Weppy conversation engine`

- [x] Local Worker smoke: `/healthz` returned OK; webhook with no Telegram secret returned 403; `/`, `/app`, and `/api/session` served.
- [x] Deployed Worker: pages, `/api/session`, real Groq extraction, and CSV export verified against `https://weppy-public-bot.bryyzxm.workers.dev`.

## Final Review

- [ ] Public service checked live by the learner/owner; they confirm ready to share.

## Code Tour and App Map

- [ ] Learning activity complete — owner-scoped D1 SQL, webhook secret validation, and Cron delivery state.
- [ ] Optional edit and transfer reflection addressed.
- [ ] `devpost/app-map.html` generated from the final public Worker and shown.

Activity and evidence: `npm run test` passed 18 tests (12 Telegram/D1 + 6 web), including concurrent per-owner Cron claims and web session isolation; `npm run typecheck` passed; local schema applied; local and deployed Worker smoke passed for health, webhook rejection, served pages, and web-session startup; deploy produced a 45.90 KiB bundle (11.80 KiB gzip) with 5 uploaded assets. Browser walkthrough on the deployed Worker completed onboarding, a text report, Skip, recap, detail, settings, CSV export, and a real Groq voice upload. The legacy Python suite passed 8/8 but tests only the local prototype. Live Telegram delivery remains owner setup.
Route and stops: `src/worker.ts`; `src/chat.ts`; `public/`; `src/delivery.ts`; `schema.sql`; `wrangler.jsonc`; `tests/worker.test.ts`; `tests/web.test.ts`; `tests/delivery.test.ts`; `scripts/smoke-worker.mjs`.
Edit outcome: Added a public web client that shares the conversation engine with Telegram.
Reflection: Not yet offered.
Activity mode: Cloudflare local Worker with D1 emulator plus deployed Worker; real Groq calls during QA; no Telegram credentials.

## Revisions

- Added a public web app: `src/chat.ts` now holds the transport-agnostic conversation engine used by both the Telegram webhook and `/api/session` · `/api/message` · `/api/voice` · `/api/export`. `public/index.html` is the landing page and `public/app.html` + `app.js` + `styles.css` are the chat client (voice recording, note cards, quick actions, pipeline side panel, settings dialog, CSV). Web owners are namespaced `web:<token>` and skipped by Cron. 18 tests pass; deployed and verified end-to-end at the Worker URL.
- Added real-usage statistics: the Worker records one `user_days` row per private-chat user per WIB day, and `/admin/stats` reports `total_users`, `active_users` (5 min), `active_today`, `active_7d`, `active_30d`, `returning_users`, `note_users`, and a 14-day `daily_active` series. `npm run stats` renders it; `schema.sql` backfills note days so pre-existing history counts. Verified locally (12 Worker tests, local Worker HTTP smoke with real D1 writes) and live after `npx wrangler d1 execute --remote --file schema.sql` + `npx wrangler deploy`.
- Replaced the local Python/JSON deploy plan with a TypeScript Cloudflare Worker + D1 public-service target after the learner accepted free, best-effort hosting without a payment card. Python remains a local prototype; public notes are owner-isolated.
- Added conditional D1 schedule claims and a concurrency regression test: overlapping Cron events can claim each owner/kind/date at most once.
- Verified locally: six Worker/D1 tests pass, typecheck passes, D1 schema applies, health/auth smoke passes, and deploy dry-run packages successfully.
- Still owner-dependent: set real Telegram secrets and register the Telegram webhook to enable live bot delivery. Web delivery is already live.
