import { env } from "cloudflare:workers";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../src/worker";
import { network } from "./network";
import { telegramMocks } from "./telegram-mocks";

const database = env.DB;

const groqMocks = [
  http.post("https://api.groq.com/openai/v1/chat/completions", async ({ request }) => {
    const body = await request.json() as { messages?: { role: string; content: string }[] };
    const user = body.messages?.find((message) => message.role === "user")?.content ?? "";
    const lower = user.toLowerCase();
    const fields = {
      institusi: lower.includes("maju") ? "PT Maju Jaya" : "",
      kontak: lower.includes("sari") ? "Bu Sari" : "",
      role: "",
      produk: lower.includes("kopi") ? "kopi 100 kg" : "",
      tahap_deal: "Penawaran harga",
      followup_date: "2026-10-26",
    };
    return HttpResponse.json({ choices: [{ message: { content: JSON.stringify(fields) } }] });
  }),
  http.post("https://api.groq.com/openai/v1/audio/transcriptions", async () => {
    return HttpResponse.json({ text: "ketemu Bu Sari dari PT Maju Jaya bahas kopi 100 kg minta penawaran" });
  }),
];

const testEnv = {
  DB: database,
  TELEGRAM_BOT_TOKEN: "test-token",
  TELEGRAM_WEBHOOK_SECRET: "valid_secret_123",
  ANALYTICS_ADMIN_TOKEN: "stats_secret_456",
  GROQ_API_KEY: "test-groq-key",
};

function api(path: string, body: unknown): Promise<Response> {
  return worker.fetch(new Request(`https://weppy.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), testEnv);
}

async function onboard(token: string): Promise<void> {
  await api("/api/session", { token });
  await api("/api/message", { token, text: "Ayu" });
  await api("/api/message", { token, text: "lang_id" });
  await api("/api/message", { token, text: "time_17:00" });
}

beforeEach(async () => {
  await database.prepare("CREATE TABLE IF NOT EXISTS profiles (owner_id TEXT PRIMARY KEY, profile_json TEXT NOT NULL, onboarding_stage TEXT NOT NULL DEFAULT 'new', recap_time TEXT NOT NULL DEFAULT '17:00', last_recap_date TEXT NOT NULL DEFAULT '', last_followup_date TEXT NOT NULL DEFAULT '')").run();
  await database.prepare("CREATE TABLE IF NOT EXISTS notes (owner_id TEXT NOT NULL, id TEXT NOT NULL, created_at TEXT NOT NULL, note_json TEXT NOT NULL, PRIMARY KEY(owner_id, id), FOREIGN KEY(owner_id) REFERENCES profiles(owner_id))").run();
  await database.prepare("CREATE TABLE IF NOT EXISTS processed_updates (update_id INTEGER PRIMARY KEY, created_at TEXT NOT NULL)").run();
  await database.prepare("CREATE TABLE IF NOT EXISTS user_activity (owner_id TEXT PRIMARY KEY, last_seen_at TEXT NOT NULL)").run();
  await database.prepare("CREATE TABLE IF NOT EXISTS user_days (owner_id TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY(owner_id, day))").run();
  await database.prepare("DELETE FROM notes").run();
  await database.prepare("DELETE FROM profiles").run();
  await database.prepare("DELETE FROM processed_updates").run();
  await database.prepare("DELETE FROM user_activity").run();
  await database.prepare("DELETE FROM user_days").run();
  network.use(...groqMocks, ...telegramMocks);
});

describe("web API", () => {
  it("issues a session token and starts onboarding on first load", async () => {
    const response = await api("/api/session", {});
    expect(response.status).toBe(200);
    const data = await response.json() as { token: string; profile: { onboarding_stage: string }; messages: { text: string }[] };
    expect(data.token).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(data.profile.onboarding_stage).toBe("ask_name");
    expect(data.messages.some((message) => message.text.includes("Nama panggilanmu"))).toBe(true);
  });

  it("walks a full onboarding, report, clarification and recap in one session", async () => {
    const token = "session_abcdefghijklmnop";
    await onboard(token);

    const report = await api("/api/message", {
      token,
      text: "ketemu Bu Sari dari PT Maju Jaya, bahas kopi 100 kg, minta penawaran",
    });
    expect(report.status).toBe(200);
    const reportData = await report.json() as {
      profile: { onboarding_stage: string };
      notes: { institusi: string; status: string; pending: string[] }[];
      messages: { text: string; buttons?: { id: string }[][] }[];
    };
    expect(reportData.profile.onboarding_stage).toBe("done");
    expect(reportData.notes).toHaveLength(1);
    expect(reportData.notes[0].institusi).toBe("PT Maju Jaya");
    expect(reportData.notes[0].status).toBe("draft");
    expect(reportData.notes[0].pending).toContain("role");
    expect(reportData.messages.some((message) => message.text.includes("role contact person"))).toBe(true);

    const skip = await api("/api/message", { token, text: "skip" });
    const skipData = await skip.json() as { notes: { status: string }[] };
    expect(skipData.notes[0].status).toBe("saved");

    const recap = await api("/api/message", { token, text: "menu_recap" });
    const recapData = await recap.json() as { messages: { text: string }[] };
    expect(recapData.messages[0].text).toContain("Rekap pipeline");
    expect(recapData.messages[0].text).toContain("PT Maju Jaya");
  });

  it("exports only the session owner's notes as CSV", async () => {
    const token = "export_abcdefghijklmnop";
    await onboard(token);
    await api("/api/message", { token, text: "ketemu Bu Sari dari PT Maju Jaya, bahas kopi 100 kg" });

    const csv = await worker.fetch(new Request("https://weppy.test/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }), testEnv);
    expect(csv.status).toBe(200);
    expect(csv.headers.get("Content-Type")).toContain("text/csv");
    const body = await csv.text();
    expect(body).toContain("PT Maju Jaya");

    const forbidden = await worker.fetch(new Request("https://weppy.test/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "short" }),
    }), testEnv);
    expect(forbidden.status).toBe(400);
  });

  it("keeps two web sessions isolated", async () => {
    const tokenA = "aaaa_abcdefghijklmnop";
    const tokenB = "bbbb_abcdefghijklmnop";
    await onboard(tokenA);
    await onboard(tokenB);
    await api("/api/message", { token: tokenA, text: "ketemu Bu Sari dari PT Maju Jaya, bahas kopi 100 kg" });

    const sessionB = await api("/api/session", { token: tokenB });
    const data = await sessionB.json() as { notes: unknown[] };
    expect(data.notes).toHaveLength(0);

    const recapB = await api("/api/message", { token: tokenB, text: "menu_recap" });
    const recapData = await recapB.json() as { messages: { text: string }[] };
    expect(recapData.messages[0].text).not.toContain("PT Maju Jaya");
  });

  it("transcribes a voice upload and stores the extracted note", async () => {
    const token = "voice_abcdefghijklmnop";
    await onboard(token);
    const form = new FormData();
    form.set("token", token);
    form.set("audio", new File([new Uint8Array(2048)], "voice.webm", { type: "audio/webm" }));
    const response = await worker.fetch(new Request("https://weppy.test/api/voice", { method: "POST", body: form }), testEnv);
    expect(response.status).toBe(200);
    const data = await response.json() as { transcript: string; notes: { institusi: string }[] };
    expect(data.transcript).toContain("PT Maju Jaya");
    expect(data.notes[0].institusi).toBe("PT Maju Jaya");
  });

  it("rejects malformed web requests without creating data", async () => {
    const badToken = await api("/api/message", { token: "x", text: "halo" });
    expect(badToken.status).toBe(400);
    const emptyText = await api("/api/message", { token: "session_abcdefghijklmnop", text: "   " });
    expect(emptyText.status).toBe(400);
  });
});
