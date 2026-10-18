import { env } from "cloudflare:workers";
import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../src/worker";
import { network } from "./network";
import { requests, telegramMocks } from "./telegram-mocks";

const database = env.DB;
const jakartaDay = (offsetDays = 0): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(Date.now() + offsetDays * 86_400_000));
const testEnv = {
  DB: database,
  TELEGRAM_BOT_TOKEN: "test-token",
  TELEGRAM_WEBHOOK_SECRET: "valid_secret_123",
  ANALYTICS_ADMIN_TOKEN: "stats_secret_456",
  GROQ_API_KEY: "test-groq-key",
};
async function postUpdate(updateId: number, chatId: number, value: string): Promise<Response> {
  const context = createExecutionContext();
  const response = await worker.fetch(new Request("https://weppy.test/telegram/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": testEnv.TELEGRAM_WEBHOOK_SECRET,
    },
    body: JSON.stringify({ update_id: updateId, message: { chat: { id: chatId, type: "private" }, text: value } }),
  }), testEnv, context);
  await waitOnExecutionContext(context);
  return response;
}

async function sendForeignNoteCallback(updateId: number, chatId: number, noteId: string): Promise<Response> {
  const context = createExecutionContext();
  const response = await worker.fetch(new Request("https://weppy.test/telegram/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": testEnv.TELEGRAM_WEBHOOK_SECRET,
    },
    body: JSON.stringify({ update_id: updateId, callback_query: {
      id: `foreign-${updateId}`,
      from: { id: chatId },
      data: `view_${noteId}`,
      message: { chat: { id: chatId, type: "private" } },
    } }),
  }), testEnv, context);
  await waitOnExecutionContext(context);
  return response;
}

async function postCallback(updateId: number, chatId: number, data: string): Promise<Response> {
  const context = createExecutionContext();
  const response = await worker.fetch(new Request("https://weppy.test/telegram/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": testEnv.TELEGRAM_WEBHOOK_SECRET,
    },
    body: JSON.stringify({ update_id: updateId, callback_query: {
      id: `callback-${updateId}`,
      data,
      message: { chat: { id: chatId, type: "private" } },
    } }),
  }), testEnv, context);
  await waitOnExecutionContext(context);
  return response;
}

beforeEach(async () => {
  await database.prepare("CREATE TABLE IF NOT EXISTS profiles (owner_id TEXT PRIMARY KEY, profile_json TEXT NOT NULL, onboarding_stage TEXT NOT NULL DEFAULT 'new', recap_time TEXT NOT NULL DEFAULT '17:00', last_recap_date TEXT NOT NULL DEFAULT '', last_followup_date TEXT NOT NULL DEFAULT '')").run();
  await database.prepare("CREATE TABLE IF NOT EXISTS notes (owner_id TEXT NOT NULL, id TEXT NOT NULL, created_at TEXT NOT NULL, note_json TEXT NOT NULL, PRIMARY KEY(owner_id, id), FOREIGN KEY(owner_id) REFERENCES profiles(owner_id))").run();
  await database.prepare("CREATE INDEX IF NOT EXISTS notes_by_owner_created ON notes(owner_id, created_at)").run();
  await database.prepare("CREATE INDEX IF NOT EXISTS profiles_recap_schedule ON profiles(onboarding_stage, recap_time, last_recap_date)").run();
  await database.prepare("CREATE INDEX IF NOT EXISTS profiles_followup_schedule ON profiles(onboarding_stage, last_followup_date)").run();
  await database.prepare("CREATE TABLE IF NOT EXISTS processed_updates (update_id INTEGER PRIMARY KEY, created_at TEXT NOT NULL)").run();
  await database.prepare("CREATE TABLE IF NOT EXISTS user_activity (owner_id TEXT PRIMARY KEY, last_seen_at TEXT NOT NULL)").run();
  await database.prepare("CREATE TABLE IF NOT EXISTS user_days (owner_id TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY (owner_id, day))").run();
  await database.prepare("CREATE INDEX IF NOT EXISTS user_days_by_day ON user_days(day)").run();
  await database.prepare("DELETE FROM notes").run();
  await database.prepare("DELETE FROM profiles").run();
  await database.prepare("DELETE FROM processed_updates").run();
  await database.prepare("DELETE FROM user_activity").run();
  await database.prepare("DELETE FROM user_days").run();
  requests.length = 0;
  network.use(...telegramMocks);
});

describe("public Telegram Worker", () => {
  it("rejects requests without the Telegram webhook secret", async () => {
    const context = createExecutionContext();
    const response = await worker.fetch(new Request("https://weppy.test/telegram/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ update_id: 1 }),
    }), testEnv, context);
    await waitOnExecutionContext(context);
    expect(response.status).toBe(403);
    expect(requests).toHaveLength(0);
  });

  it("reports active private-chat users and all known profiles only to the admin", async () => {
    await database.prepare("INSERT INTO profiles(owner_id, profile_json, onboarding_stage) VALUES (?, ?, ?)")
      .bind("historical-user", "{}", "done").run();
    await database.prepare("INSERT INTO user_activity(owner_id, last_seen_at) VALUES (?, ?)")
      .bind("historical-user", "2020-01-01T00:00:00.000Z").run();

    await postUpdate(30, 303, "/start");
    const forbidden = await worker.fetch(new Request("https://weppy.test/admin/stats"), testEnv, createExecutionContext());
    expect(forbidden.status).toBe(403);

    const response = await worker.fetch(new Request("https://weppy.test/admin/stats", {
      headers: { Authorization: `Bearer ${testEnv.ANALYTICS_ADMIN_TOKEN}` },
    }), testEnv, createExecutionContext());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const stats = await response.json() as Record<string, unknown> & { daily_active: { day: string; users: number }[] };
    expect(stats).toMatchObject({
      active_users: 1,
      active_window_minutes: 5,
      total_users: 2,
      active_today: 1,
      active_7d: 1,
      active_30d: 1,
      returning_users: 0,
      note_users: 0,
    });
    expect(stats.daily_active).toEqual([{ day: jakartaDay(), users: 1 }]);
    expect(JSON.stringify(stats)).not.toContain("303");
    expect(JSON.stringify(stats)).not.toContain("historical-user");

    await postUpdate(31, 303, "/start");
    const repeated = await worker.fetch(new Request("https://weppy.test/admin/stats", {
      headers: { Authorization: `Bearer ${testEnv.ANALYTICS_ADMIN_TOKEN}` },
    }), testEnv, createExecutionContext());
    const repeatedStats = await repeated.json() as { daily_active: { day: string; users: number }[] };
    expect(repeatedStats).toMatchObject({ active_users: 1, total_users: 2 });
    expect(repeatedStats.daily_active).toEqual([{ day: jakartaDay(), users: 1 }]);
  });

  it("counts note authors, returning users, and WIB day windows", async () => {
    const today = jakartaDay();
    const threeDaysAgo = jakartaDay(-3);
    await database.batch([
      // Pressed /start months ago and never came back: counted, never engaged.
      database.prepare("INSERT INTO user_activity(owner_id, last_seen_at) VALUES (?, ?)").bind("801", "2026-01-01T00:00:00.000Z"),
      database.prepare("INSERT INTO user_days(owner_id, day) VALUES (?, ?)").bind("801", "2026-01-01"),
      // Real user: stored a note, active today and three days ago, twice today.
      database.prepare("INSERT INTO profiles(owner_id, profile_json, onboarding_stage) VALUES (?, ?, ?)").bind("802", "{}", "done"),
      database.prepare("INSERT INTO user_activity(owner_id, last_seen_at) VALUES (?, ?)").bind("802", new Date().toISOString()),
      database.prepare("INSERT INTO user_days(owner_id, day) VALUES (?, ?)").bind("802", today),
      database.prepare("INSERT INTO user_days(owner_id, day) VALUES (?, ?)").bind("802", threeDaysAgo),
      database.prepare("INSERT INTO notes(owner_id, id, created_at, note_json) VALUES (?, ?, ?, ?)")
        .bind("802", "note-802", new Date().toISOString(), "{}"),
    ]);

    const response = await worker.fetch(new Request("https://weppy.test/admin/stats", {
      headers: { Authorization: `Bearer ${testEnv.ANALYTICS_ADMIN_TOKEN}` },
    }), testEnv, createExecutionContext());
    const stats = await response.json() as Record<string, unknown> & { daily_active: { day: string; users: number }[] };
    expect(stats).toMatchObject({
      active_users: 1,
      total_users: 2,
      active_today: 1,
      active_7d: 1,
      active_30d: 1,
      returning_users: 1,
      note_users: 1,
    });
    expect(stats.daily_active).toEqual([{ day: threeDaysAgo, users: 1 }, { day: today, users: 1 }]);
    expect(JSON.stringify(stats)).not.toContain("802");
  });

  it("does not expose the first account's pipeline in the second account greeting", async () => {
    const firstProfile = { nickname: "Ayu", language: "id", recap_time: "17:00", onboarding_stage: "done", pending_setting: "", recap_picklist: [], last_recap_date: "", last_followup_date: "" };
    const secondProfile = { nickname: "Bima", language: "en", recap_time: "17:00", onboarding_stage: "done", pending_setting: "", recap_picklist: [], last_recap_date: "", last_followup_date: "" };
    await database.batch([
      database.prepare("INSERT INTO profiles(owner_id, profile_json, onboarding_stage, recap_time) VALUES (?, ?, ?, ?)").bind("101", JSON.stringify(firstProfile), "done", "17:00"),
      database.prepare("INSERT INTO profiles(owner_id, profile_json, onboarding_stage, recap_time) VALUES (?, ?, ?, ?)").bind("202", JSON.stringify(secondProfile), "done", "17:00"),
      database.prepare("INSERT INTO notes(owner_id, id, created_at, note_json) VALUES (?, ?, ?, ?)").bind("101", "secret-note-id", "2026-10-14T10:00:00", JSON.stringify({
        id: "secret-note-id", created_at: "2026-10-14T10:00:00", institusi: "PT Rahasia A", kontak: "Bu A", role: "",
        produk: "kopi", tahap_deal: "Deal", followup_date: "2026-10-16", status: "saved", pending_clarify: [],
      })),
    ]);

    const response = await postUpdate(10, 202, "halo");
    expect(response.status).toBe(200);
    const greetings = requests.filter(({ method }) => method === "sendMessage");
    expect(greetings.some(({ payload }) => payload.chat_id === "202" && String(payload.text).includes("0 note(s) stored"))).toBe(true);
    expect(greetings.some(({ payload }) => payload.chat_id === "202" && JSON.stringify(payload).includes("Rahasia"))).toBe(false);
  });

  it("rejects another account's note ID in a detail callback", async () => {
    const firstProfile = { nickname: "Ayu", language: "id", recap_time: "17:00", onboarding_stage: "done", pending_setting: "", recap_picklist: [], last_recap_date: "", last_followup_date: "" };
    const secondProfile = { nickname: "Bima", language: "en", recap_time: "17:00", onboarding_stage: "done", pending_setting: "", recap_picklist: [], last_recap_date: "", last_followup_date: "" };
    await database.batch([
      database.prepare("INSERT INTO profiles(owner_id, profile_json, onboarding_stage, recap_time) VALUES (?, ?, ?, ?)").bind("101", JSON.stringify(firstProfile), "done", "17:00"),
      database.prepare("INSERT INTO profiles(owner_id, profile_json, onboarding_stage, recap_time) VALUES (?, ?, ?, ?)").bind("202", JSON.stringify(secondProfile), "done", "17:00"),
      database.prepare("INSERT INTO notes(owner_id, id, created_at, note_json) VALUES (?, ?, ?, ?)").bind("101", "secret-note-id", "2026-10-14T10:00:00", JSON.stringify({
        id: "secret-note-id", created_at: "2026-10-14T10:00:00", institusi: "PT Rahasia A", kontak: "Bu A", role: "",
        produk: "kopi", tahap_deal: "Deal", followup_date: "2026-10-16", status: "saved", pending_clarify: [],
      })),
    ]);

    const response = await sendForeignNoteCallback(11, 202, "secret-note-id");
    expect(response.status).toBe(200);
    const replies = requests.filter(({ method }) => method === "sendMessage");
    expect(replies.some(({ payload }) => payload.chat_id === "202" && String(payload.text).includes("That note was not found"))).toBe(true);
    expect(replies.some(({ payload }) => payload.chat_id === "202" && JSON.stringify(payload).includes("PT Rahasia A"))).toBe(false);
  });

  it("atomically sends at most one scheduled recap per owner per WIB date", async () => {
    const localTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(new Date());
    const profile = {
      nickname: "Ayu", language: "id", recap_time: localTime, onboarding_stage: "done", pending_setting: "",
      recap_picklist: [], last_recap_date: "", last_followup_date: "",
    };
    await database.prepare("INSERT INTO profiles(owner_id, profile_json, onboarding_stage, recap_time) VALUES (?, ?, ?, ?)")
      .bind("303", JSON.stringify(profile), "done", localTime).run();
    const controller = createScheduledController({ cron: "*/1 * * * *", scheduledTime: new Date() });
    const context = createExecutionContext();

    await worker.scheduled(controller, testEnv, context);
    await worker.scheduled(controller, testEnv, context);
    await waitOnExecutionContext(context);

    const saved = await database.prepare("SELECT last_recap_date FROM profiles WHERE owner_id = ?")
      .bind("303").first<{ last_recap_date: string }>();
    const recapCalls = requests.filter(({ method, payload }) => method === "sendMessage" && payload.chat_id === "303");
    expect(saved?.last_recap_date).not.toBe("");
    expect(recapCalls).toHaveLength(1);
  });
  it("shows a back button with recap note details", async () => {
    const profile = { nickname: "Ayu", language: "id", recap_time: "17:00", onboarding_stage: "done", pending_setting: "", recap_picklist: [], last_recap_date: "", last_followup_date: "" };
    const note = { id: "note-1", created_at: "2026-10-14T10:00:00", institusi: "PT Contoh", kontak: "Bu Sari", role: "", produk: "kopi", tahap_deal: "Deal", followup_date: "", status: "saved", pending_clarify: [] };
    await database.batch([
      database.prepare("INSERT INTO profiles(owner_id, profile_json, onboarding_stage, recap_time) VALUES (?, ?, ?, ?)").bind("606", JSON.stringify(profile), "done", "17:00"),
      database.prepare("INSERT INTO notes(owner_id, id, created_at, note_json) VALUES (?, ?, ?, ?)").bind("606", note.id, note.created_at, JSON.stringify(note)),
    ]);

    expect((await postUpdate(16, 606, "menu_recap")).status).toBe(200);
    const detailList = requests.filter(({ method, payload }) => method === "sendMessage" && payload.chat_id === "606").pop()?.payload;
    expect(detailList?.reply_markup).toEqual({ inline_keyboard: [
      [{ text: "🔎 PT Contoh", callback_data: "view_note-1" }],
      [{ text: "⬅️ Kembali", callback_data: "menu_main" }],
    ] });

    expect((await postCallback(17, 606, "view_note-1")).status).toBe(200);
    const detail = requests.filter(({ method, payload }) => method === "sendMessage" && payload.chat_id === "606").pop()?.payload;
    expect(detail?.reply_markup).toEqual({ inline_keyboard: [[{ text: "⬅️ Kembali", callback_data: "menu_main" }]] });
  });
  it("returns from a clarification prompt without consuming the pending draft", async () => {
    const profile = { nickname: "Ayu", language: "id", recap_time: "17:00", onboarding_stage: "done", pending_setting: "nickname", recap_picklist: [], last_recap_date: "", last_followup_date: "" };
    const note = { id: "draft-1", created_at: "2026-10-14T10:00:00", institusi: "PT Contoh", kontak: "", role: "", produk: "kopi", tahap_deal: "Deal", followup_date: "", status: "draft", pending_clarify: ["kontak"] };
    await database.batch([
      database.prepare("INSERT INTO profiles(owner_id, profile_json, onboarding_stage, recap_time) VALUES (?, ?, ?, ?)").bind("707", JSON.stringify(profile), "done", "17:00"),
      database.prepare("INSERT INTO notes(owner_id, id, created_at, note_json) VALUES (?, ?, ?, ?)").bind("707", note.id, note.created_at, JSON.stringify(note)),
    ]);

    expect((await postCallback(18, 707, "menu_main")).status).toBe(200);
    const menu = requests.filter(({ method, payload }) => method === "sendMessage" && payload.chat_id === "707").pop()?.payload;
    expect(menu?.reply_markup).toEqual({ inline_keyboard: [
      [{ text: "📝 Laporan baru", callback_data: "menu_lapor" }],
      [{ text: "📊 Rekap sekarang", callback_data: "menu_recap" }, { text: "🔔 Cek follow-up", callback_data: "menu_followup" }],
      [{ text: "📤 Ekspor CSV", callback_data: "menu_export" }, { text: "⚙️ Pengaturan", callback_data: "menu_settings" }],
    ] });
    const savedProfile = await database.prepare("SELECT profile_json FROM profiles WHERE owner_id = ?").bind("707").first<{ profile_json: string }>();
    const savedNote = await database.prepare("SELECT note_json FROM notes WHERE owner_id = ? AND id = ?").bind("707", note.id).first<{ note_json: string }>();
    expect(JSON.parse(savedProfile!.profile_json).pending_setting).toBe("");
    expect(JSON.parse(savedNote!.note_json).pending_clarify).toEqual(["kontak"]);
    expect(JSON.parse(savedNote!.note_json).kontak).toBe("");
  });
  it("shows emoji on menu and settings buttons without changing callback IDs", async () => {
    const profile = { nickname: "Ayu", language: "id", recap_time: "17:00", onboarding_stage: "done", pending_setting: "", recap_picklist: [], last_recap_date: "", last_followup_date: "" };
    await database.prepare("INSERT INTO profiles(owner_id, profile_json, onboarding_stage, recap_time) VALUES (?, ?, ?, ?)")
      .bind("404", JSON.stringify(profile), "done", "17:00").run();

    await postUpdate(12, 404, "menu");
    const menu = requests.filter(({ method, payload }) => method === "sendMessage" && payload.chat_id === "404").pop()?.payload;
    expect(menu?.reply_markup).toEqual({ inline_keyboard: [
      [{ text: "📝 Laporan baru", callback_data: "menu_lapor" }],
      [{ text: "📊 Rekap sekarang", callback_data: "menu_recap" }, { text: "🔔 Cek follow-up", callback_data: "menu_followup" }],
      [{ text: "📤 Ekspor CSV", callback_data: "menu_export" }, { text: "⚙️ Pengaturan", callback_data: "menu_settings" }],
    ] });
    await postUpdate(13, 404, "menu_settings");
    const settings = requests.filter(({ method, payload }) => method === "sendMessage" && payload.chat_id === "404").pop()?.payload;
    expect(settings?.reply_markup).toEqual({ inline_keyboard: [[
      { text: "👤 Ubah nama", callback_data: "settings_name" },
      { text: "🌐 Bahasa", callback_data: "settings_lang" },
      { text: "🕒 Jam rekap", callback_data: "settings_time" },
    ], [{ text: "⬅️ Kembali", callback_data: "menu_main" }]] });
  });
  it("returns to the main menu from settings using the inline back button", async () => {
    const profile = { nickname: "Ayu", language: "id", recap_time: "17:00", onboarding_stage: "done", pending_setting: "", recap_picklist: [], last_recap_date: "", last_followup_date: "" };
    await database.prepare("INSERT INTO profiles(owner_id, profile_json, onboarding_stage, recap_time) VALUES (?, ?, ?, ?)")
      .bind("505", JSON.stringify(profile), "done", "17:00").run();

    expect((await postUpdate(14, 505, "menu_settings")).status).toBe(200);
    const settings = requests.filter(({ method, payload }) => method === "sendMessage" && payload.chat_id === "505").pop()?.payload;
    expect(settings?.reply_markup).toEqual({ inline_keyboard: [
      [{ text: "👤 Ubah nama", callback_data: "settings_name" }, { text: "🌐 Bahasa", callback_data: "settings_lang" }, { text: "🕒 Jam rekap", callback_data: "settings_time" }],
      [{ text: "⬅️ Kembali", callback_data: "menu_main" }],
    ] });

    expect((await postCallback(15, 505, "menu_main")).status).toBe(200);
    const menu = requests.filter(({ method, payload }) => method === "sendMessage" && payload.chat_id === "505").pop()?.payload;
    expect(menu?.text).toBe("Apa yang ingin kamu lakukan?");
    expect(menu?.reply_markup).toEqual({ inline_keyboard: [
      [{ text: "📝 Laporan baru", callback_data: "menu_lapor" }],
      [{ text: "📊 Rekap sekarang", callback_data: "menu_recap" }, { text: "🔔 Cek follow-up", callback_data: "menu_followup" }],
      [{ text: "📤 Ekspor CSV", callback_data: "menu_export" }, { text: "⚙️ Pengaturan", callback_data: "menu_settings" }],
    ] });
  });
});
