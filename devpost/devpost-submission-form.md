# Devpost Submission — Copy-Ready Answers

Project: **Weppy — Public Sales Pipeline Assistant** · Eureka Dev

Everything under "Paste" is ready to copy into the matching field. Fields marked **⚠️ you must supply** can't be generated for you.

---

## 1. Project name

**Paste:**

```
Weppy — Public Sales Pipeline Assistant
```

---

## 2. Project Story → *About the project* (Markdown)

**Paste everything below this line:**

---

## Inspiration

B2B sales reps spend the day moving between client visits. The five minutes right after a visit — while the details are still fresh — is exactly when nobody writes anything down. The admin gets postponed, details get forgotten, follow-ups get missed. CRMs make it worse: they're forms that feel like paperwork, so reps avoid them, and the pipeline goes stale.

I wanted to test whether an AI agent could remove the form entirely: let a rep just *tell the story* of the visit, in their own language, and have the agent turn it into structured pipeline data — without ever inventing a fact. It also became my way of learning how an agent really works end to end: taking text and voice, extracting structured information, running a clarification conversation, keeping durable state, and firing scheduled reminders.

## What it does

Send Weppy a text or a voice note after a sales visit — on Telegram ([@recap_sales_bot](https://t.me/recap_sales_bot)) or in the browser app. It transcribes the voice note, then extracts four things: the **institution/company**, the **contact person and their role**, the **product or service** discussed, and the **current deal stage**. It replies with a clean pipeline card.

The key behavior: fields it isn't sure about are left empty, never invented. Weppy asks for them one at a time, each with a **Skip** button — so a rep who genuinely doesn't know the contact's role can skip and move on. Once the note is saved, Weppy does the follow-up work: it works out a follow-up date, sends reminders and a daily recap at the time the user chose, and exports the whole pipeline as CSV a manager can open.

Every note is private to the account that sent it. Two people can use the same bot and neither sees the other's pipeline — Telegram notes are keyed to the sender's private chat ID, web sessions to a random token in the browser. Replies are in English or Indonesian, chosen during onboarding.

## How I built it

- **One Cloudflare Worker** (`src/worker.ts`, TypeScript) serves three things: the Telegram webhook, the web JSON API (`/api/session`, `/api/message`, `/api/voice`, `/api/export`), and the static web client in `public/` — no framework, no build step.
- **One shared conversation engine** (`src/chat.ts`) drives both transports, so Telegram and the web never drift apart.
- **Cloudflare D1 (SQLite)** stores profiles, owner-scoped notes, drafts, activity, and processed Telegram update IDs. Every query is scoped by `owner_id`.
- **Groq** does two jobs: `whisper-large-v3` transcribes voice notes, and an open model (`openai/gpt-oss-20b`) does strict-JSON extraction of the four pipeline fields.
- **A Worker Cron Trigger** runs every minute; `src/delivery.ts` makes an atomic D1 claim per owner / kind / date so overlapping cron runs can never send a duplicate recap or reminder.
- **Security:** Telegram webhook requests are checked against the bot's secret token, group chats are rejected, and all secrets live in Cloudflare — never in the repository.
- **Tests:** 21 Vitest tests covering owner isolation, foreign note-ID callback rejection, webhook-secret rejection, web session isolation, the voice/export flows, and concurrent cron claims — all passing.

## Challenges

- **Not inventing data.** The hardest part is making extraction honest. It's easy for an LLM to fill gaps confidently, so the guardrail lives in two places: a strict-JSON prompt that is told to leave unknown fields blank, and a UI that shows "not set" and routes missing fields into a clarification step with Skip.
- **Duplicate scheduled sends.** Cron triggers can overlap. I added conditional D1 date claims so each owner/kind/day is claimed at most once — a real race, with a concurrency test to prove it.
- **Two transports, one brain.** Pulling the conversation engine out of the Telegram handler so the web app behaves identically took refactoring, but it's what keeps the two surfaces honest.
- **Running free.** Workers + D1 + Groq free tiers keep it at zero cost; the trade-off is best-effort availability, which I document openly instead of pretending otherwise.

## Accomplishments

- A real Indonesian voice note becomes a structured note with missing fields flagged — the "oh, this is useful" moment.
- Owner isolation that holds: a second account sees an empty pipeline, and a foreign note ID can't open anyone's data.
- One engine, two surfaces (Telegram + web) with identical behavior.
- 21 passing tests including concurrency and isolation; deployed and verified live.

## What I learned

How an agent works as a *system*, not just a prompt: the loop of input → transcription → strict extraction → stateful clarification → durable storage → scheduled delivery. And how much of "making AI useful" is really guardrails — keeping the model from inventing, keeping users' data separate, and keeping scheduled jobs from double-firing.

## What's next

- WhatsApp as a second channel (the transport layer is already abstracted).
- A shared team view for sales managers.
- Calendar sync and richer follow-up rules.
- Production-grade reliability — backups, uptime, monitoring — beyond the free demo tier.

---

## 3. Built with (max 25 tags)

**Paste this line into the "Built with" field:**

```
TypeScript, Cloudflare Workers, Cloudflare D1, SQLite, Telegram Bot API, Groq, whisper-large-v3, LLM, AI Agent, Wrangler, Vitest, JavaScript, HTML, CSS, Web App, REST API, Cron, Speech-to-Text, Voice, JSON, Markdown, Edge Computing
```

(22 tags — under the 25 limit.)

---

## 4. "Try it out" links

Add these with **Add another link** (Devpost takes a URL per row; label optional):

| Label | URL |
|---|---|
| Live web app | `https://weppy-public-bot.bryyzxm.workers.dev/app` |
| GitHub repo | `https://github.com/Bryyzxm/weppy-public-bot` |
| Landing page | `https://weppy-public-bot.bryyzxm.workers.dev/` |
| Telegram bot ⚠️ | `https://t.me/recap_sales_bot` |

If the form only takes one URL, use the live web app first, then add the repo as a second link.

> ⚠️ **Verify the Telegram link before submitting.** I checked from this machine: `/healthz` and `/app` return 200, but `getMe` on the local `.dev.vars` token returns **404** (the local file holds a placeholder token, not the real bot token), and `devpost/PROJECT_SYNC.md` still lists "set real Telegram secrets and register the webhook" as unchecked. So **the web app is live; the Telegram bot is not confirmed live.** Before you paste the Telegram link:
> 1. On the owner machine: `npx wrangler secret put TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` / `GROQ_API_KEY`, then `npx wrangler deploy`.
> 2. Register the webhook: `setWebhook` to `https://weppy-public-bot.bryyzxm.workers.dev/telegram/webhook` with the same `secret_token`.
> 3. Confirm with `getWebhookInfo` (no `last_error_message`) and send a real voice note to the bot.
>
> If it still isn't live at submit time, drop the Telegram row and describe Telegram as an implemented, tested transport — don't link a dead bot.

---

## 5. Image gallery (up to 15 images, 3:2 ratio, JPG/PNG/GIF, ≤5 MB)

**Thumbnail (ready to upload):** `devpost/project-thumbnail.png` — 1500×1000, exactly 3:2, PNG. Upload this **first** as image #1 so it becomes the project card / thumbnail. Source is `devpost/project-thumbnail.svg` if you want to tweak colors or wording.

**Then capture these five real screenshots** — none exist yet as product shots. (The `slopcheck-*.png` in the repo is a tool output, not a product shot — do not use it.) Capture at 3:2 (e.g. 1500×1000) and upload after the thumbnail:

1. **Telegram — voice note → pipeline card.** Voice note sent, Weppy's reply card showing Institution / Contact / Product / Deal stage with one field marked "not set".
2. **Clarification with Skip.** The follow-up question ("What is the contact person's role?") with the **⏭️ Skip** button visible.
3. **Web app `/app`.** Chat + the pipeline side panel with note cards, counts, and CSV button.
4. **Recap + follow-ups.** "Recap now" output and "Check follow-ups" showing what's due.
5. **CSV in a spreadsheet.** The exported file opened in Excel/Sheets.

Optional 6th: the architecture diagram at `devpost/video-assets/architecture.png` (already in the repo).

---

## 6. Video demo link — **⚠️ you must supply**

Required field. Needs a YouTube/Vimeo URL.

- Record and edit per `devpost/video-script.md` (target ~3:30, hard max 4:00).
- Upload to YouTube as **Unlisted**, then paste the URL here.
- Suggested title: `Weppy — Turn sales visit voice notes into pipeline notes (Eureka Dev 2026)`

**Paste (replace with your URL):**

```
https://youtu.be/________
```

---

## Optional extras (if a field appears for them)

**One-line tagline / elevator pitch** (≤200 chars):

```
Weppy turns a sales rep's post-visit voice note into a clean, private pipeline note — asking for missing facts instead of inventing them — then handles follow-ups, recaps and CSV.
```

---

## Pre-submit checklist

- [ ] Project name filled
- [ ] About the project pasted (Inspiration → What's next)
- [ ] Built with tags pasted (≤25)
- [ ] At least one "Try it out" link (web app + repo recommended)
- [ ] Telegram bot verified live (`getMe` + a real voice note) before keeping `t.me/recap_sales_bot`; otherwise remove that link
- [ ] Image gallery: 5 screenshots uploaded, 3:2, under 5 MB each
- [ ] Video demo link: **required**, YouTube Unlisted, ≤4:00
- [ ] Click **Save & continue**, then finish **Additional info** and **Submit**
