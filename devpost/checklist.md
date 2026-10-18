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

- [x] Local Worker smoke: `/healthz` returned OK; webhook with no Telegram secret returned 403.
- [ ] Public Worker final kick-the-tires session after owner deployment.

## Final Review

- [ ] Public service checked live by the learner/owner; they confirm ready to share.

## Code Tour and App Map

- [ ] Learning activity complete — owner-scoped D1 SQL, webhook secret validation, and Cron delivery state.
- [ ] Optional edit and transfer reflection addressed.
- [ ] `devpost/app-map.html` generated from the final public Worker and shown.

Activity and evidence: `npm run test` passed 6 Worker/D1 tests, including concurrent per-owner Cron claims; `npm run typecheck` passed; local schema applied; actual local Worker smoke returned health OK and 403 for missing/invalid webhook secrets; deploy dry-run produced a 33.26 KiB bundle (9.09 KiB gzip). The legacy Python suite passed 8/8, but tests only the local prototype. Public Groq/Telegram delivery remains owner setup.
Route and stops: `src/worker.ts`; `src/delivery.ts`; `schema.sql`; `wrangler.jsonc`; `tests/worker.test.ts`; `tests/delivery.test.ts`; `scripts/smoke-worker.mjs`.
Edit outcome: No optional app edit attempted.
Reflection: Not yet offered; public service is not deployed.
Activity mode: Cloudflare local Worker with D1 emulator; no account credentials.

## Revisions

- Added real-usage statistics: the Worker records one `user_days` row per private-chat user per WIB day, and `/admin/stats` reports `total_users`, `active_users` (5 min), `active_today`, `active_7d`, `active_30d`, `returning_users`, `note_users`, and a 14-day `daily_active` series. `npm run stats` renders it; `schema.sql` backfills note days so pre-existing history counts. Verified locally (12 Worker tests, local Worker HTTP smoke with real D1 writes) and live after `npx wrangler d1 execute --remote --file schema.sql` + `npx wrangler deploy`.
- Replaced the local Python/JSON deploy plan with a TypeScript Cloudflare Worker + D1 public-service target after the learner accepted free, best-effort hosting without a payment card. Python remains a local prototype; public notes are owner-isolated.
- Added conditional D1 schedule claims and a concurrency regression test: overlapping Cron events can claim each owner/kind/date at most once.
- Verified locally: six Worker/D1 tests pass, typecheck passes, D1 schema applies, health/auth smoke passes, and deploy dry-run packages successfully.
- Still owner-dependent: Cloudflare signup/account verification, remote D1, secrets, Worker deployment, Telegram webhook registration, public username, and live Telegram/Groq/voice smoke. Do not mark the public slice, final review, or shipping gate complete before those real steps.
