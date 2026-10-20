import { isRecord } from "./guards";
import { claimScheduledDelivery } from "./delivery";
import {
  csvContent,
  dueFollowups,
  initialState,
  loadNotes,
  loadProfile,
  localDateParts,
  localDateString,
  noteCard,
  processInput,
  publicProfile,
  transcribeAudio,
  type CoreEnv,
  type NoteCard,
  type OutFile,
  type OutMessage,
  type Profile,
  type PublicProfile,
} from "./chat";

interface Env extends CoreEnv {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ANALYTICS_ADMIN_TOKEN?: string;
}

type Button = { id: string; title: string };
type TelegramMessage = {
  chat: { id: number; type: string };
  text?: string;
  voice?: { file_id: string };
  audio?: { file_id: string };
};

/**
 * Web owners are stored under this prefix so they can never collide with
 * numeric Telegram private chat IDs and so the Cron sender can skip them.
 */
const WEB_OWNER_PREFIX = "web:";

const STRINGS = {
  id: { audioUnclear: "Voice note belum bisa kupahami. Coba kirim ulang atau ketik laporannya." },
  en: { audioUnclear: "I couldn't understand that voice note. Send it again or type the report." },
};

async function telegram(env: Env, method: string, payload: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const decoded = await response.json<unknown>();
  const result = isRecord(decoded) ? decoded : {};
  if (!response.ok || result.ok !== true || !("result" in result)) {
    throw new Error(`Telegram API ${method} failed with HTTP ${response.status}`);
  }
  return result.result;
}

async function sendText(env: Env, chatId: string, body: string): Promise<void> {
  await telegram(env, "sendMessage", { chat_id: chatId, text: body, parse_mode: "Markdown" });
}

async function sendButtons(env: Env, chatId: string, body: string, buttons: Button[][]): Promise<void> {
  await telegram(env, "sendMessage", {
    chat_id: chatId,
    text: body,
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons.map((row) => row.map((button) => ({
      text: button.title,
      callback_data: button.id,
    }))) },
  });
}

async function sendDocument(env: Env, chatId: string, file: OutFile): Promise<void> {
  const form = new FormData();
  form.set("chat_id", chatId);
  form.set("caption", file.caption);
  form.set("document", new File([file.content], file.filename, { type: file.mime }));
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, { method: "POST", body: form });
  if (!response.ok) throw new Error("Telegram file delivery failed");
}

/** Render one engine message through the Telegram transport. */
async function deliver(env: Env, chatId: string, message: OutMessage): Promise<void> {
  if (message.file) {
    await sendDocument(env, chatId, message.file);
    return;
  }
  if (message.buttons) {
    await sendButtons(env, chatId, message.text, message.buttons);
    return;
  }
  await sendText(env, chatId, message.text);
}

/** Download a Telegram voice note and transcribe it with Groq. */
async function transcribeTelegramVoice(env: Env, fileId: string): Promise<string> {
  const result = await telegram(env, "getFile", { file_id: fileId });
  if (!isRecord(result) || typeof result.file_path !== "string" || !result.file_path) {
    throw new Error("Telegram voice file path missing");
  }
  const audioResponse = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${result.file_path}`);
  if (!audioResponse.ok) throw new Error("Telegram voice download failed");
  const audio = await audioResponse.arrayBuffer();
  return transcribeAudio(env, audio, "voice.ogg", "audio/ogg");
}

function telegramMessage(value: unknown): TelegramMessage | null {
  if (!isRecord(value) || !isRecord(value.chat)) return null;
  if (typeof value.chat.id !== "number" || typeof value.chat.type !== "string") return null;
  const message: TelegramMessage = { chat: { id: value.chat.id, type: value.chat.type } };
  if (typeof value.text === "string") message.text = value.text;
  if (isRecord(value.voice) && typeof value.voice.file_id === "string") message.voice = { file_id: value.voice.file_id };
  if (isRecord(value.audio) && typeof value.audio.file_id === "string") message.audio = { file_id: value.audio.file_id };
  return message;
}

async function recordActivity(env: Env, owner: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO user_activity(owner_id, last_seen_at) VALUES (?, ?) " +
      "ON CONFLICT(owner_id) DO UPDATE SET last_seen_at = excluded.last_seen_at",
    ).bind(owner, new Date().toISOString()),
    env.DB.prepare(
      "INSERT INTO user_days(owner_id, day) VALUES (?, ?) ON CONFLICT(owner_id, day) DO NOTHING",
    ).bind(owner, localDateString()),
  ]);
}

async function handleUpdate(env: Env, update: unknown): Promise<void> {
  if (!isRecord(update) || typeof update.update_id !== "number") return;
  const claimed = await env.DB.prepare(
    "INSERT INTO processed_updates(update_id, created_at) VALUES (?, ?) ON CONFLICT(update_id) DO NOTHING",
  ).bind(update.update_id, new Date().toISOString()).run();
  if (!claimed.meta.changes) return;

  const callback = isRecord(update.callback_query) ? update.callback_query : null;
  if (callback && typeof callback.id === "string") {
    try {
      await telegram(env, "answerCallbackQuery", { callback_query_id: callback.id });
    } catch {
      // Acknowledgment failure must not prevent the callback action.
    }
  }
  const message = telegramMessage(callback ? callback.message : update.message);
  if (!message || message.chat.type !== "private") return;
  const chatId = String(message.chat.id);
  await recordActivity(env, chatId);

  let input = callback && typeof callback.data === "string" ? callback.data.trim() : (message.text || "").trim();
  const voice = message.voice || message.audio;
  if (voice) {
    try {
      input = await transcribeTelegramVoice(env, voice.file_id);
    } catch {
      const profile = await loadProfile(env.DB, chatId);
      await sendText(env, chatId, STRINGS[profile.language].audioUnclear);
      return;
    }
    if (!input) {
      const profile = await loadProfile(env.DB, chatId);
      await sendText(env, chatId, STRINGS[profile.language].audioUnclear);
      return;
    }
  }

  const messages = await processInput(env, chatId, input);
  for (const outgoing of messages) await deliver(env, chatId, outgoing);
}

async function runCron(env: Env): Promise<void> {
  const dateParts = localDateParts();
  const today = `${dateParts.year}-${String(dateParts.month).padStart(2, "0")}-${String(dateParts.day).padStart(2, "0")}`;
  const clockParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const time = `${clockParts.find((part) => part.type === "hour")?.value}:${clockParts.find((part) => part.type === "minute")?.value}`;
  // Web owners never receive Telegram pushes; their recaps are pulled from the
  // web app, so the scheduled sender only targets Telegram chat IDs.
  const rows = await env.DB.prepare(
    "SELECT owner_id FROM profiles WHERE onboarding_stage = 'done' AND owner_id NOT LIKE ? AND ((recap_time = ? " +
    "AND last_recap_date != ?) OR (? = '08:00' AND last_followup_date != ?))",
  ).bind(`${WEB_OWNER_PREFIX}%`, time, today, time, today).all<{ owner_id: string }>();

  for (const row of rows.results) {
    const owner = row.owner_id;
    const profile = await loadProfile(env.DB, owner);
    if (profile.recap_time === time && await claimScheduledDelivery(env.DB, owner, "recap", today)) {
      profile.last_recap_date = today;
      for (const message of await processInput(env, owner, "menu_recap")) await deliver(env, owner, message);
    }
    if (time === "08:00" && await claimScheduledDelivery(env.DB, owner, "followup", today)) {
      profile.last_followup_date = today;
      for (const message of await processInput(env, owner, "menu_followup")) await deliver(env, owner, message);
    }
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index++) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const expected = env.TELEGRAM_WEBHOOK_SECRET;
  const provided = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
  if (!expected || !constantTimeEqual(provided, expected)) return new Response("Forbidden", { status: 403 });
  const update = await request.json<unknown>();
  await handleUpdate(env, update);
  return Response.json({ ok: true });
}

const WEB_TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function newWebToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let token = "";
  for (const byte of bytes) token += WEB_TOKEN_ALPHABET[byte & 63];
  return token;
}

function validWebToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(token);
}

function webOwner(token: string): string {
  return `${WEB_OWNER_PREFIX}${token}`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

type WebSession = {
  token: string;
  profile: PublicProfile;
  notes: NoteCard[];
  due: number;
  messages: OutMessage[];
};

async function webSession(env: Env, token: string): Promise<WebSession> {
  const owner = webOwner(token);
  const { profile, notes, messages } = await initialState(env, owner);
  return {
    token,
    profile: publicProfile(profile),
    notes: notes.map((note) => noteCard(note, profile)),
    due: dueFollowups(notes).length,
    messages,
  };
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const decoded = await request.json<unknown>();
    return isRecord(decoded) ? decoded : {};
  } catch {
    return {};
  }
}

async function handleWebApi(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;

  if (path === "/api/session" && request.method === "POST") {
    const body = await readJsonBody(request);
    const token = validWebToken(body.token) ? body.token : newWebToken();
    const session = await webSession(env, token);
    await recordActivity(env, webOwner(token));
    return jsonResponse(session);
  }

  if (path === "/api/message" && request.method === "POST") {
    const body = await readJsonBody(request);
    if (!validWebToken(body.token)) return jsonResponse({ error: "invalid_token" }, 400);
    if (typeof body.text !== "string" || !body.text.trim()) return jsonResponse({ error: "empty_text" }, 400);
    const owner = webOwner(body.token);
    await recordActivity(env, owner);
    const messages = await processInput(env, owner, body.text);
    const profile = await loadProfile(env.DB, owner);
    const notes = await loadNotes(env.DB, owner);
    return jsonResponse({
      profile: publicProfile(profile),
      notes: notes.map((note) => noteCard(note, profile)),
      due: dueFollowups(notes).length,
      messages,
    });
  }

  if (path === "/api/voice" && request.method === "POST") {
    const form = await request.formData().catch(() => null);
    const token = form?.get("token");
    const audio = form?.get("audio");
    if (!validWebToken(token)) return jsonResponse({ error: "invalid_token" }, 400);
    if (!(audio instanceof File)) return jsonResponse({ error: "empty_audio" }, 400);
    const owner = webOwner(token);
    const profile = await loadProfile(env.DB, owner);
    await recordActivity(env, owner);
    let transcript = "";
    try {
      transcript = await transcribeAudio(env, await audio.arrayBuffer(), audio.name || "voice.webm", audio.type || "audio/webm");
    } catch {
      return jsonResponse({ error: "transcribe_failed", message: STRINGS[profile.language].audioUnclear }, 502);
    }
    if (!transcript) {
      return jsonResponse({ error: "empty_transcript", message: STRINGS[profile.language].audioUnclear }, 422);
    }
    const messages = await processInput(env, owner, transcript);
    const notes = await loadNotes(env.DB, owner);
    return jsonResponse({
      transcript,
      profile: publicProfile(profile),
      notes: notes.map((note) => noteCard(note, profile)),
      due: dueFollowups(notes).length,
      messages,
    });
  }

  if (path === "/api/export" && request.method === "POST") {
    const body = await readJsonBody(request);
    if (!validWebToken(body.token)) return jsonResponse({ error: "invalid_token" }, 400);
    const owner = webOwner(body.token);
    const profile = await loadProfile(env.DB, owner);
    const notes = await loadNotes(env.DB, owner);
    return new Response(csvContent(notes, profile.language), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${profile.language === "en" ? "pipeline-notes.csv" : "catatan-pipeline.csv"}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return jsonResponse({ error: "not_found" }, 404);
}

async function handleAdminStats(request: Request, env: Env): Promise<Response> {
  const token = env.ANALYTICS_ADMIN_TOKEN;
  const provided = request.headers.get("Authorization") || "";
  if (!token || !constantTimeEqual(provided, `Bearer ${token}`)) {
    return new Response("Forbidden", { status: 403 });
  }

  const now = new Date();
  const today = localDateString(now);
  const cutoff = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const [active, total, todayActive, weekActive, monthActive, returning, noteAuthors, daily, webUsers] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM user_activity WHERE last_seen_at >= ?")
      .bind(cutoff).first<{ count: number }>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS count FROM (SELECT owner_id FROM profiles UNION SELECT owner_id FROM user_activity)",
    ).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(DISTINCT owner_id) AS count FROM user_days WHERE day = ?")
      .bind(today).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(DISTINCT owner_id) AS count FROM user_days WHERE day >= ?")
      .bind(localDateAfter(today, -6)).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(DISTINCT owner_id) AS count FROM user_days WHERE day >= ?")
      .bind(localDateAfter(today, -29)).first<{ count: number }>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS count FROM (SELECT owner_id FROM user_days GROUP BY owner_id HAVING COUNT(*) > 1)",
    ).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(DISTINCT owner_id) AS count FROM notes").first<{ count: number }>(),
    env.DB.prepare("SELECT day, COUNT(*) AS users FROM user_days WHERE day >= ? GROUP BY day ORDER BY day DESC LIMIT 14")
      .bind(localDateAfter(today, -13)).all<{ day: string; users: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM user_activity WHERE owner_id LIKE ?")
      .bind(`${WEB_OWNER_PREFIX}%`).first<{ count: number }>(),
  ]);
  const count = (row: { count: number } | null): number => row?.count ?? 0;
  return Response.json({
    active_users: count(active),
    active_window_minutes: 5,
    total_users: count(total),
    web_users: count(webUsers),
    active_today: count(todayActive),
    active_7d: count(weekActive),
    active_30d: count(monthActive),
    returning_users: count(returning),
    note_users: count(noteAuthors),
    daily_active: [...daily.results].reverse(),
    generated_at: now.toISOString(),
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

function localDateAfter(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, "0")}-${String(result.getUTCDate()).padStart(2, "0")}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleWebApi(request, env, url);
      if (url.pathname === "/admin/stats" && request.method === "GET") return await handleAdminStats(request, env);
      if (url.pathname === "/healthz") return Response.json({ ok: true });
      if (url.pathname === "/telegram/webhook" && request.method === "POST") return await handleWebhook(request, env);
      return new Response("Not found", { status: 404 });
    } catch (error) {
      console.error("request error", url.pathname, error);
      if (url.pathname.startsWith("/api/")) return jsonResponse({ error: "internal_error" }, 500);
      return Response.json({ ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }
  },
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await runCron(env);
  },
};
