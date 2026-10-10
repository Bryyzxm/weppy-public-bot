# Devpost Submission Sync

## Project
- **Name:** Weppy — AI Meeting Summarizer & Follow-up Tracker
- **Devpost URL:** https://weppy-project-sync.devpost.com/
- **Tagline:** Turn meetings into decisions, action items, and automated follow-ups — via WhatsApp, Telegram, or Web.

## What it does
Weppy converts meeting notes (typed text or voice notes) into structured summaries: decisions, action items with owners and deadlines, and follow-up reminders. Users interact via WhatsApp, Telegram, or a web dashboard. Daily recaps and automated follow-up nudges are delivered on schedule.

## Key features
- Multi-channel intake: WhatsApp, Telegram, Web dashboard
- Voice notes → Whisper transcription → structured summary
- Action item extraction with owner + deadline
- Automated follow-up reminders & daily recaps (scheduler)
- Multi-language (EN/ID) conversation flows
- Interactive inline buttons (skip, view details, complete draft) on Telegram

## Tech stack
- Python, Flask
- OpenAI (Whisper + GPT) via agent.py
- Telegram Bot API, WhatsApp integration
- APS-style scheduler (scheduler.py)
- Local storage (store.py)

## Architecture / files
- `app.py` — Flask web app + webhook endpoints
- `agent.py` — LLM agent: summarize, extract action items
- `scheduler.py` — recaps & follow-up reminders
- `telegram.py` / `telegram_poll.py` — Telegram transport
- `whatsapp.py` — WhatsApp transport
- `transcribe.py` — voice note transcription
- `store.py` — persistence layer
- `prompts.py` — LLM prompt templates
- `demo_chat.py` — demo CLI
- `test_telegram.py` — end-to-end Telegram transport tests (all passing)

## Submission checklist
- [x] Working prototype (Web + WhatsApp + Telegram)
- [x] Automated tests passing
- [x] Devpost project synced
- [ ] Demo video
- [ ] Screenshots for gallery
