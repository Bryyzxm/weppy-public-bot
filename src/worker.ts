import { isRecord } from "./guards";
import { claimScheduledDelivery } from "./delivery";
interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ANALYTICS_ADMIN_TOKEN?: string;
  GROQ_API_KEY: string;
  GROQ_MODEL?: string;
  GROQ_WHISPER_MODEL?: string;
}

type Language = "id" | "en";
type Profile = {
  nickname: string;
  language: Language;
  recap_time: string;
  onboarding_stage: "new" | "ask_name" | "ask_language" | "ask_time" | "done";
  pending_setting: "" | "nickname" | "recap_time";
  recap_picklist: string[];
  last_recap_date: string;
  last_followup_date: string;
};
type Note = {
  id: string;
  created_at: string;
  institusi: string;
  kontak: string;
  role: string;
  produk: string;
  tahap_deal: string;
  followup_date: string;
  status: "saved" | "draft";
  pending_clarify: ("institusi" | "kontak" | "role" | "produk" | "tahap_deal")[];
};
type Button = { id: string; title: string };
type TelegramMessage = {
  chat: { id: number; type: string };
  text?: string;
  voice?: { file_id: string };
  audio?: { file_id: string };
};

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const DEAL_STAGES = ["Kunjungan awal", "Penawaran harga", "Negosiasi", "Deal", "Follow-up"];
const MISSING_FIELDS: Note["pending_clarify"] = ["institusi", "kontak", "role", "produk", "tahap_deal"];
const MONTHS: Record<Language, string[]> = {
  id: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
const STRINGS = {
  id: {
    welcome: "Halo! Aku Weppy, asisten pipeline sales. Catat hasil kunjungan lewat teks atau voice note.",
    askName: "Nama panggilanmu?",
    askLanguage: "Pilih bahasa balasan:",
    askTime: "Jam berapa kamu ingin menerima rekap harian? (WIB)",
    onboardingDone: "Siap, {name}! Kirim laporan kunjungan lewat teks atau voice note.",
    menu: "Apa yang ingin kamu lakukan?",
    help: "Kirim laporan teks/voice note, atau pilih Rekap, Follow-up, Ekspor CSV, atau Pengaturan.",
    reportPrompt: "Kirim hasil kunjungan sebagai teks atau voice note. Contoh: ketemu Bu Sari dari PT Maju Jaya, membahas kopi 100 kg, minta penawaran.",
    reportEmpty: "Aku belum menemukan detail kunjungan. Coba jelaskan perusahaan, kontak, produk, atau tahap deal.",
    aiBusy: "Layanan AI sedang sibuk. Coba lagi nanti atau ketik laporan dengan teks.",
    audioUnclear: "Voice note belum bisa kupahami. Coba kirim ulang atau ketik laporannya.",
    noteGone: "Catatan itu tidak ditemukan di akunmu.",
    exportEmpty: "Belum ada catatan untuk diekspor.",
    noFollowups: "Tidak ada follow-up yang jatuh tempo hari ini ({date}).",
    noNotes: "Belum ada catatan tersimpan. Kirim laporan kunjungan untuk memulai.",
    saved: "Catatan tersimpan. {filled} dari 5 bagian terisi.",
    missing: "Belum ada",
    skip: "⏭️ Skip",
    mainMenu: "🏠 Menu utama",
    recap: "📊 Rekap sekarang",
    followup: "🔔 Cek follow-up",
    report: "📝 Laporan baru",
    export: "📤 Ekspor CSV",
    settings: "⚙️ Pengaturan",
    changeName: "Ketik nama panggilan baru.",
    changeTime: "Ketik jam rekap format HH:MM, zona WIB.",
    badTime: "Format jam tidak valid. Gunakan HH:MM, misalnya 17:00.",
    nameSaved: "Nama diperbarui.",
    timeSaved: "Jam rekap diperbarui ke {time} WIB.",
    langSaved: "Bahasa diperbarui.",
    contact: "Kontak",
  },
  en: {
    welcome: "Hello! I'm Weppy, your sales pipeline assistant. Send a visit report as text or a voice note.",
    askName: "What should I call you?",
    askLanguage: "Choose your reply language:",
    askTime: "What time should I send your daily recap? (WIB)",
    onboardingDone: "Ready, {name}! Send a visit report as text or a voice note.",
    menu: "What would you like to do?",
    help: "Send a report as text/voice note, or choose Recap, Follow-ups, Export CSV, or Settings.",
    reportPrompt: "Send a visit report as text or a voice note. Example: met Ms Sari at PT Maju Jaya, discussed 100 kg of coffee, requested a quote.",
    reportEmpty: "I couldn't find visit details. Try describing the company, contact, product, or deal stage.",
    aiBusy: "The AI service is busy. Try again later or type your report as text.",
    audioUnclear: "I couldn't understand that voice note. Send it again or type the report.",
    noteGone: "That note was not found in your account.",
    exportEmpty: "There are no notes to export yet.",
    noFollowups: "No follow-ups are due today ({date}).",
    noNotes: "No notes stored yet. Send a visit report to start.",
    saved: "Note saved. {filled} of 5 fields filled.",
    missing: "Missing",
    skip: "⏭️ Skip",
    mainMenu: "🏠 Main menu",
    recap: "📊 Recap now",
    followup: "🔔 Check follow-ups",
    report: "📝 New report",
    export: "📤 Export CSV",
    settings: "⚙️ Settings",
    changeName: "Type your new nickname.",
    changeTime: "Type your recap time as HH:MM, WIB timezone.",
    badTime: "Invalid time. Use HH:MM, for example 17:00.",
    nameSaved: "Nickname updated.",
    timeSaved: "Recap time updated to {time} WIB.",
    langSaved: "Language updated.",
    contact: "Contact",
  },
};


function defaultProfile(): Profile {
  return {
    nickname: "",
    language: "id",
    recap_time: "17:00",
    onboarding_stage: "new",
    pending_setting: "",
    recap_picklist: [],
    last_recap_date: "",
    last_followup_date: "",
  };
}

function parseProfile(value: unknown): Profile {
  const source = isRecord(value) ? value : {};
  const language: Language = source.language === "en" ? "en" : "id";
  const stage = source.onboarding_stage;
  const onboardingStage: Profile["onboarding_stage"] =
    stage === "ask_name" || stage === "ask_language" || stage === "ask_time" || stage === "done" ? stage : "new";
  const setting = source.pending_setting;
  return {
    ...defaultProfile(),
    nickname: typeof source.nickname === "string" ? source.nickname : "",
    language,
    recap_time: typeof source.recap_time === "string" ? source.recap_time : "17:00",
    onboarding_stage: onboardingStage,
    pending_setting: setting === "nickname" || setting === "recap_time" ? setting : "",
    recap_picklist: Array.isArray(source.recap_picklist) ? source.recap_picklist.filter((id): id is string => typeof id === "string") : [],
    last_recap_date: typeof source.last_recap_date === "string" ? source.last_recap_date : "",
    last_followup_date: typeof source.last_followup_date === "string" ? source.last_followup_date : "",
  };
}

function parseNote(value: unknown): Note | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.created_at !== "string") return null;
  const stringField = (key: string) => {
    const field = value[key];
    return typeof field === "string" ? field : "";
  };
  const pending = Array.isArray(value.pending_clarify)
    ? value.pending_clarify.filter((field): field is Note["pending_clarify"][number] =>
      typeof field === "string" && MISSING_FIELDS.some((allowedField) => allowedField === field))
    : [];
  return {
    id: value.id,
    created_at: value.created_at,
    institusi: stringField("institusi"),
    kontak: stringField("kontak"),
    role: stringField("role"),
    produk: stringField("produk"),
    tahap_deal: stringField("tahap_deal"),
    followup_date: stringField("followup_date"),
    status: value.status === "draft" ? "draft" : "saved",
    pending_clarify: pending,
  };
}

function text(profile: Profile, key: keyof typeof STRINGS.id, vars: Record<string, string> = {}): string {
  return Object.entries(vars).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, replacement),
    STRINGS[profile.language][key],
  );
}

function localDateParts(date = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values: Record<string, string> = {};
  for (const part of parts) if (part.type !== "literal") values[part.type] = part.value;
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

function localDateString(date = new Date()): string {
  const { year, month, day } = localDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateAfter(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, "0")}-${String(result.getUTCDate()).padStart(2, "0")}`;
}

function formatDate(date: string, language: Language): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return date;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) return date;
  return `${String(day).padStart(2, "0")} ${MONTHS[language][month - 1]} ${year}`;
}

function missingFields(note: Pick<Note, "institusi" | "kontak" | "role" | "produk" | "tahap_deal">): Note["pending_clarify"] {
  return MISSING_FIELDS.filter((field) => !note[field].trim());
}

async function loadProfile(db: D1Database, owner: string): Promise<Profile> {
  const row = await db.prepare("SELECT profile_json FROM profiles WHERE owner_id = ?")
    .bind(owner).first<{ profile_json: string }>();
  if (!row) return defaultProfile();
  try {
    return parseProfile(JSON.parse(row.profile_json) as unknown);
  } catch {
    return defaultProfile();
  }
}

async function saveProfile(db: D1Database, owner: string, profile: Profile): Promise<void> {
  await db.prepare(
    "INSERT INTO profiles(owner_id, profile_json, onboarding_stage, recap_time, last_recap_date, last_followup_date) " +
    "VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(owner_id) DO UPDATE SET " +
    "profile_json = excluded.profile_json, onboarding_stage = excluded.onboarding_stage, " +
    "recap_time = excluded.recap_time, last_recap_date = excluded.last_recap_date, " +
    "last_followup_date = excluded.last_followup_date",
  ).bind(owner, JSON.stringify(profile), profile.onboarding_stage, profile.recap_time,
    profile.last_recap_date, profile.last_followup_date).run();
}

async function loadNotes(db: D1Database, owner: string): Promise<Note[]> {
  const result = await db.prepare(
    "SELECT note_json FROM notes WHERE owner_id = ? ORDER BY created_at, id",
  ).bind(owner).all<{ note_json: string }>();
  return result.results.flatMap((row) => {
    try {
      const note = parseNote(JSON.parse(row.note_json) as unknown);
      return note ? [note] : [];
    } catch {
      return [];
    }
  });
}

async function saveNote(db: D1Database, owner: string, note: Note): Promise<void> {
  await db.prepare(
    "INSERT INTO notes(owner_id, id, created_at, note_json) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(owner_id, id) DO UPDATE SET created_at = excluded.created_at, note_json = excluded.note_json",
  ).bind(owner, note.id, note.created_at, JSON.stringify(note)).run();
}

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

function mainMenuButton(profile: Profile): Button[] {
  return [{ id: "menu_main", title: profile.language === "en" ? "⬅️ Back" : "⬅️ Kembali" }];
}

async function sendMenu(env: Env, chatId: string, profile: Profile): Promise<void> {
  const copy = STRINGS[profile.language];
  await sendButtons(env, chatId, copy.menu, [
    [{ id: "menu_lapor", title: copy.report }],
    [{ id: "menu_recap", title: copy.recap }, { id: "menu_followup", title: copy.followup }],
    [{ id: "menu_export", title: copy.export }, { id: "menu_settings", title: copy.settings }],
  ]);
}

async function sendButtonsWithBack(env: Env, chatId: string, body: string, buttons: Button[][], profile: Profile): Promise<void> {
  await sendButtons(env, chatId, body, [...buttons, mainMenuButton(profile)]);
}

async function sendCsv(env: Env, chatId: string, notes: Note[], profile: Profile): Promise<void> {
  if (!notes.length) {
    await sendButtonsWithBack(env, chatId, text(profile, "exportEmpty"), [], profile);
    return;
  }
  const columns = ["id", "created_at", "institusi", "kontak", "role", "produk", "tahap_deal", "followup_date", "status"] as const;
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [columns.join(","), ...notes.map((note) => columns.map((key) => escape(note[key])).join(","))].join("\r\n");
  const form = new FormData();
  form.set("chat_id", chatId);
  form.set("caption", `Pipeline notes: ${notes.length}`);
  form.set("document", new File([csv], "catatan-pipeline.csv", { type: "text/csv" }));
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, { method: "POST", body: form });
  if (!response.ok) throw new Error("Telegram CSV delivery failed");
}

async function transcribe(env: Env, fileId: string): Promise<string> {
  const result = await telegram(env, "getFile", { file_id: fileId });
  if (!isRecord(result) || typeof result.file_path !== "string" || !result.file_path) throw new Error("Telegram voice file path missing");
  const audioResponse = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${result.file_path}`);
  if (!audioResponse.ok) throw new Error("Telegram voice download failed");
  const audio = await audioResponse.arrayBuffer();
  if (audio.byteLength > MAX_AUDIO_BYTES) return "";
  const form = new FormData();
  form.set("model", env.GROQ_WHISPER_MODEL || "whisper-large-v3");
  form.set("response_format", "json");
  form.set("file", new File([audio], "voice.ogg", { type: "audio/ogg" }));
  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: form,
  });
  if (!response.ok) throw new Error("Groq transcription failed");
  const decoded = await response.json<unknown>();
  return isRecord(decoded) && typeof decoded.text === "string" ? decoded.text.trim() : "";
}

async function extractReport(env: Env, report: string): Promise<Omit<Note, "id" | "created_at" | "status" | "pending_clarify">> {
  const today = localDateString();
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.GROQ_MODEL || "openai/gpt-oss-20b",
      temperature: 0,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `Extract one B2B sales visit report into strict JSON with keys institusi, kontak, role, produk, tahap_deal, followup_date. Empty string for facts not stated; never invent facts. Stage must be one of ${DEAL_STAGES.join(", ")} or empty. followup_date is YYYY-MM-DD; explicit dates win; tomorrow is +1 day, next week +7 days, otherwise +3 days from today ${today}. Keep each value <=80 chars.` },
        { role: "user", content: report },
      ],
    }),
  });
  if (!response.ok) throw new Error("Groq extraction failed");
  const decoded = await response.json<unknown>();
  if (!isRecord(decoded) || !Array.isArray(decoded.choices) || !isRecord(decoded.choices[0])) throw new Error("Groq response has no choices");
  const message = decoded.choices[0].message;
  if (!isRecord(message) || typeof message.content !== "string") throw new Error("Groq response has no JSON content");
  const parsed: unknown = JSON.parse(message.content);
  if (!isRecord(parsed)) throw new Error("Groq returned invalid report object");
  const field = (key: string) => typeof parsed[key] === "string" ? parsed[key].slice(0, 80) : "";
  const followup = field("followup_date");
  return {
    institusi: field("institusi"),
    kontak: field("kontak"),
    role: field("role"),
    produk: field("produk"),
    tahap_deal: DEAL_STAGES.includes(field("tahap_deal")) ? field("tahap_deal") : "",
    followup_date: /^\d{4}-\d{2}-\d{2}$/.test(followup) ? followup : dateAfter(today, 3),
  };
}

function renderCard(note: Note, profile: Profile): string {
  const copy = STRINGS[profile.language];
  const field = (label: string, value: string) => `${label}: ${value || copy.missing}`;
  const contact = [note.kontak, note.role].filter(Boolean).join(" — ");
  return [
    profile.language === "en" ? "*Visit note*" : "*Catatan kunjungan*",
    field(profile.language === "en" ? "Institution/company" : "Institusi/perusahaan", note.institusi),
    field(copy.contact, contact),
    field(profile.language === "en" ? "Product/service" : "Produk/layanan", note.produk),
    field(profile.language === "en" ? "Deal stage" : "Tahap deal", note.tahap_deal),
    `Follow-up: ${note.followup_date ? formatDate(note.followup_date, profile.language) : copy.missing}`,
  ].join("\n");
}

async function recap(env: Env, chatId: string, profile: Profile, notes: Note[]): Promise<void> {
  if (!notes.length) {
    await sendButtonsWithBack(env, chatId, text(profile, "noNotes"), [], profile);
    return;
  }
  const groups = new Map<string, Note[]>();
  for (const note of notes) {
    const stage = note.tahap_deal || (profile.language === "en" ? "No stage yet" : "Belum ada tahap");
    const group = groups.get(stage) || [];
    group.push(note);
    groups.set(stage, group);
  }
  const tomorrow = dateAfter(localDateString(), 1);
  const lines = [profile.language === "en" ? "*Pipeline recap*" : "*Rekap pipeline*"];
  for (const [stage, items] of groups) {
    lines.push(`*${stage} (${items.length}):*`);
    for (const note of items) lines.push(`• ${note.institusi || "—"} — ${note.kontak || "—"} | ${note.produk || "—"} | ${note.followup_date ? formatDate(note.followup_date, profile.language) : "—"}`);
  }
  const due = notes.filter((note) => note.followup_date === tomorrow);
  if (due.length) {
    lines.push(profile.language === "en" ? "*Follow-ups tomorrow:*" : "*Follow-up besok:*");
    for (const note of due) lines.push(`• ${note.institusi || "—"} — ${note.kontak || "—"}`);
  }
  await sendText(env, chatId, lines.join("\n"));
  await saveProfile(env.DB, chatId, profile);
  const detailButtons = notes.slice(0, 20).map((note) => [{ id: `view_${note.id}`, title: `🔎 ${(note.institusi || "Detail").slice(0, 20)}` }]);
  await sendButtonsWithBack(env, chatId, profile.language === "en" ? "View a full note:" : "Lihat catatan lengkap:", detailButtons, profile);
}

async function followups(env: Env, chatId: string, profile: Profile, notes: Note[]): Promise<void> {
  const today = localDateString();
  const due = notes.filter((note) => note.followup_date && note.followup_date <= today);
  if (!due.length) {
    await sendButtonsWithBack(env, chatId, text(profile, "noFollowups", { date: formatDate(today, profile.language) }), [], profile);
    return;
  }
  const header = profile.language === "en" ? "*Follow-up reminders*" : "*Pengingat follow-up*";
  const lines = [header];
  for (const note of due) lines.push(`• ${note.institusi || "—"} — ${note.kontak || "—"} | ${note.produk || "—"} | ${formatDate(note.followup_date, profile.language)}`);
  await sendButtonsWithBack(env, chatId, lines.join("\n"), [], profile);
}

async function handleReport(env: Env, chatId: string, profile: Profile, report: string): Promise<void> {
  let fields: Omit<Note, "id" | "created_at" | "status" | "pending_clarify">;
  try {
    fields = await extractReport(env, report);
  } catch {
    await sendButtonsWithBack(env, chatId, text(profile, "aiBusy"), [], profile);
    return;
  }
  if (![fields.institusi, fields.kontak, fields.role, fields.produk, fields.tahap_deal].some(Boolean)) {
    await sendButtonsWithBack(env, chatId, text(profile, "reportEmpty"), [], profile);
    return;
  }
  const note: Note = {
    id: crypto.randomUUID().replaceAll("-", "").slice(0, 32),
    created_at: new Date().toISOString(),
    ...fields,
    status: "saved",
    pending_clarify: missingFields(fields),
  };
  if (note.pending_clarify.length) note.status = "draft";
  await saveNote(env.DB, chatId, note);
  await sendButtonsWithBack(env, chatId, renderCard(note, profile), [], profile);
  if (note.pending_clarify.length) await askField(env, chatId, profile, note.pending_clarify[0]);
  else await sendMenu(env, chatId, profile);
}

async function askField(env: Env, chatId: string, profile: Profile, field: Note["pending_clarify"][number]): Promise<void> {
  const label: Record<Note["pending_clarify"][number], [string, string]> = {
    institusi: ["nama perusahaan/institusi", "company/institution name"],
    kontak: ["nama contact person", "contact person's name"],
    role: ["role contact person", "contact person's role"],
    produk: ["produk/layanan yang dibahas", "product/service discussed"],
    tahap_deal: ["tahap deal", "deal stage"],
  };
  const prompt = profile.language === "en" ? `What is the ${label[field][1]}?` : `Apa ${label[field][0]}?`;
  const options: Button[][] = field === "tahap_deal"
    ? DEAL_STAGES.map((stage, index) => [{ id: `stage_${index}`, title: `📌 ${stage}` }])
    : [[{ id: "skip", title: text(profile, "skip") }]];
  await sendButtonsWithBack(env, chatId, prompt, options, profile);
}

async function handleClarification(
  env: Env,
  chatId: string,
  profile: Profile,
  input: string,
  notes: Note[],
): Promise<boolean> {
  const draft = [...notes].reverse().find((note) => note.status === "draft" && note.pending_clarify.length);
  if (!draft) return false;
  const field = draft.pending_clarify[0];
  if (input !== "skip") {
    const stageMatch = input.match(/^stage_(\d+)$/);
    if (stageMatch && field === "tahap_deal") {
      const stage = DEAL_STAGES[Number(stageMatch[1])];
      if (stage) draft.tahap_deal = stage;
    } else {
      const target: Record<Note["pending_clarify"][number], (value: string) => void> = {
        institusi: (value) => { draft.institusi = value; },
        kontak: (value) => { draft.kontak = value; },
        role: (value) => { draft.role = value; },
        produk: (value) => { draft.produk = value; },
        tahap_deal: (value) => { draft.tahap_deal = value; },
      };
      target[field](input.slice(0, 80));
    }
  }
  draft.pending_clarify.shift();
  if (!draft.pending_clarify.length) {
    draft.status = "saved";
    await saveNote(env.DB, chatId, draft);
    await sendText(env, chatId, text(profile, "saved", { filled: String(MISSING_FIELDS.length - missingFields(draft).length) }));
    await sendMenu(env, chatId, profile);
  } else {
    await saveNote(env.DB, chatId, draft);
    await askField(env, chatId, profile, draft.pending_clarify[0]);
  }
  return true;
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
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO user_activity(owner_id, last_seen_at) VALUES (?, ?) " +
      "ON CONFLICT(owner_id) DO UPDATE SET last_seen_at = excluded.last_seen_at",
    ).bind(chatId, new Date().toISOString()),
    env.DB.prepare(
      "INSERT INTO user_days(owner_id, day) VALUES (?, ?) ON CONFLICT(owner_id, day) DO NOTHING",
    ).bind(chatId, localDateString()),
  ]);
  const profile = await loadProfile(env.DB, chatId);
  let input = callback && typeof callback.data === "string" ? callback.data.trim() : (message.text || "").trim();

  const voice = message.voice || message.audio;
  if (voice) {
    try {
      input = await transcribe(env, voice.file_id);
    } catch {
      await sendText(env, chatId, text(profile, "audioUnclear"));
      return;
    }
    if (!input) {
      await sendText(env, chatId, text(profile, "audioUnclear"));
      return;
    }
  }

  if (profile.onboarding_stage !== "done") {
    if (profile.onboarding_stage === "new") {
      profile.onboarding_stage = "ask_name";
      await saveProfile(env.DB, chatId, profile);
      await sendText(env, chatId, text(profile, "welcome"));
      await sendButtons(env, chatId, text(profile, "askName"), [[{ id: "skip", title: text(profile, "skip") }]]);
      return;
    }
    if (profile.onboarding_stage === "ask_name") {
      profile.nickname = input.toLowerCase() === "skip" ? "" : input.slice(0, 30);
      profile.onboarding_stage = "ask_language";
      await saveProfile(env.DB, chatId, profile);
      await sendButtons(env, chatId, text(profile, "askLanguage"), [[{ id: "lang_id", title: "🇮🇩 Indonesia" }, { id: "lang_en", title: "🇬🇧 English" }]]);
      return;
    }
    if (profile.onboarding_stage === "ask_language") {
      profile.language = input === "lang_en" || input.toLowerCase() === "english" ? "en" : "id";
      profile.onboarding_stage = "ask_time";
      await saveProfile(env.DB, chatId, profile);
      await sendButtons(env, chatId, text(profile, "askTime"), [[{ id: "time_08:00", title: "🕗 08:00" }, { id: "time_17:00", title: "🕔 17:00" }, { id: "skip", title: text(profile, "skip") }]]);
      return;
    }
    if (profile.onboarding_stage === "ask_time") {
      const time = input.match(/(?:time_)?(\d{1,2}):(\d{2})/);
      if (time && Number(time[1]) < 24 && Number(time[2]) < 60) {
        profile.recap_time = `${time[1].padStart(2, "0")}:${time[2]}`;
      }
      profile.onboarding_stage = "done";
      await saveProfile(env.DB, chatId, profile);
      await sendText(env, chatId, text(profile, "onboardingDone", { name: profile.nickname }));
      await sendMenu(env, chatId, profile);
      return;
    }
  }

  const low = input.toLowerCase();
  if (["/start", "halo", "hello", "hi"].includes(low)) {
    const notes = await loadNotes(env.DB, chatId);
    const greeting = profile.language === "en"
      ? `Hello ${profile.nickname}! ${notes.length} note(s) stored.`
      : `Halo ${profile.nickname}! Tersimpan ${notes.length} catatan.`;
    await sendText(env, chatId, greeting);
    await sendMenu(env, chatId, profile);
    return;
  }
  if (["/help", "bantuan", "help"].includes(low)) {
    await sendText(env, chatId, text(profile, "help"));
    await sendMenu(env, chatId, profile);
    return;
  }
  if (input === "menu_main") {
    profile.pending_setting = "";
    await saveProfile(env.DB, chatId, profile);
    await sendMenu(env, chatId, profile);
    return;
  }

  if (low === "menu") {
    await sendMenu(env, chatId, profile);
    return;
  }
  if (input === "menu_settings" || ["settings", "pengaturan"].includes(low)) {
    await sendButtonsWithBack(env, chatId, text(profile, "settings"), [[
      { id: "settings_name", title: profile.language === "en" ? "👤 Change name" : "👤 Ubah nama" },
      { id: "settings_lang", title: profile.language === "en" ? "🌐 Language" : "🌐 Bahasa" },
      { id: "settings_time", title: profile.language === "en" ? "🕒 Recap time" : "🕒 Jam rekap" },
    ]], profile);
    return;
  }
  if (["settings_name", "ubah nama", "change name"].includes(low)) {
    profile.pending_setting = "nickname";
    await saveProfile(env.DB, chatId, profile);
    await sendText(env, chatId, text(profile, "changeName"));
    return;
  }
  if (["settings_time", "ubah jam rekap", "change recap time"].includes(low)) {
    profile.pending_setting = "recap_time";
    await saveProfile(env.DB, chatId, profile);
    await sendText(env, chatId, text(profile, "changeTime"));
    return;
  }
  if (input === "settings_lang" || low === "ganti bahasa") {
    await sendButtonsWithBack(env, chatId, text(profile, "askLanguage"), [[{ id: "lang_id", title: "🇮🇩 Indonesia" }, { id: "lang_en", title: "🇬🇧 English" }]], profile);
    return;
  }
  if (profile.pending_setting === "nickname") {
    profile.nickname = input.slice(0, 30);
    profile.pending_setting = "";
    await saveProfile(env.DB, chatId, profile);
    await sendButtonsWithBack(env, chatId, text(profile, "nameSaved"), [], profile);
    return;
  }
  if (profile.pending_setting === "recap_time") {
    const match = input.match(/^(\d{1,2}):(\d{2})$/);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
      await sendText(env, chatId, text(profile, "badTime"));
      return;
    }
    profile.recap_time = `${match[1].padStart(2, "0")}:${match[2]}`;
    profile.pending_setting = "";
    await saveProfile(env.DB, chatId, profile);
    await sendButtonsWithBack(env, chatId, text(profile, "timeSaved", { time: profile.recap_time }), [], profile);
    return;
  }
  if (input === "lang_id" || input === "lang_en") {
    profile.language = input === "lang_en" ? "en" : "id";
    await saveProfile(env.DB, chatId, profile);
    await sendButtonsWithBack(env, chatId, text(profile, "langSaved"), [], profile);
    return;
  }
  if (input.startsWith("time_")) {
    const match = input.slice(5).match(/^(\d{2}):(\d{2})$/);
    if (match && Number(match[1]) < 24 && Number(match[2]) < 60) {
      profile.recap_time = input.slice(5);
      await saveProfile(env.DB, chatId, profile);
      await sendText(env, chatId, text(profile, "timeSaved", { time: profile.recap_time }));
      await sendButtonsWithBack(env, chatId, text(profile, "timeSaved", { time: profile.recap_time }), [], profile);
    }
  }

  const notes = await loadNotes(env.DB, chatId);
  if (input.startsWith("view_")) {
    const id = input.slice(5);
    const row = await env.DB.prepare("SELECT note_json FROM notes WHERE owner_id = ? AND id = ?")
      .bind(chatId, id).first<{ note_json: string }>();
    const note = row ? parseNote(JSON.parse(row.note_json) as unknown) : null;
    if (!note) {
      await sendText(env, chatId, text(profile, "noteGone"));
      return;
    }
    await sendButtonsWithBack(env, chatId, renderCard(note, profile), [], profile);
  }
  if (input === "menu_recap" || ["rekap sekarang", "rekap", "recap", "recap now"].includes(low)) {
    await recap(env, chatId, profile, notes);
    return;
  }
  if (input === "menu_followup" || ["cek follow-up", "follow-up", "check follow-ups"].includes(low)) {
    await followups(env, chatId, profile, notes);
    return;
  }
  if (input === "menu_export" || ["ekspor csv", "export csv", "csv"].includes(low)) {
    await sendCsv(env, chatId, notes, profile);
    return;
  }
  if (input === "menu_lapor" || input === "laporan baru") {
    for (const draft of notes.filter((note) => note.status === "draft")) {
      draft.status = "saved";
      draft.pending_clarify = [];
      await saveNote(env.DB, chatId, draft);
    }
    await sendButtonsWithBack(env, chatId, text(profile, "reportPrompt"), [], profile);
    return;
  }
  if (await handleClarification(env, chatId, profile, input.toLowerCase() === "skip" ? "skip" : input, notes)) return;
  await handleReport(env, chatId, profile, input);
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

async function runCron(env: Env): Promise<void> {
  const dateParts = localDateParts();
  const today = `${dateParts.year}-${String(dateParts.month).padStart(2, "0")}-${String(dateParts.day).padStart(2, "0")}`;
  const clockParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const time = `${clockParts.find((part) => part.type === "hour")?.value}:${clockParts.find((part) => part.type === "minute")?.value}`;
  const rows = await env.DB.prepare(
    "SELECT owner_id FROM profiles WHERE onboarding_stage = 'done' AND ((recap_time = ? " +
    "AND last_recap_date != ?) OR (? = '08:00' AND last_followup_date != ?))",
  ).bind(time, today, time, today).all<{ owner_id: string }>();

  for (const row of rows.results) {
    const owner = row.owner_id;
    const profile = await loadProfile(env.DB, owner);
    if (profile.recap_time === time && await claimScheduledDelivery(env.DB, owner, "recap", today)) {
      profile.last_recap_date = today;
      await recap(env, owner, profile, await loadNotes(env.DB, owner));
    }
    if (time === "08:00" && await claimScheduledDelivery(env.DB, owner, "followup", today)) {
      profile.last_followup_date = today;
      await followups(env, owner, profile, await loadNotes(env.DB, owner));
    }
  }
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
  const [active, total, todayActive, weekActive, monthActive, returning, noteAuthors, daily] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM user_activity WHERE last_seen_at >= ?")
      .bind(cutoff).first<{ count: number }>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS count FROM (SELECT owner_id FROM profiles UNION SELECT owner_id FROM user_activity)",
    ).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(DISTINCT owner_id) AS count FROM user_days WHERE day = ?")
      .bind(today).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(DISTINCT owner_id) AS count FROM user_days WHERE day >= ?")
      .bind(dateAfter(today, -6)).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(DISTINCT owner_id) AS count FROM user_days WHERE day >= ?")
      .bind(dateAfter(today, -29)).first<{ count: number }>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS count FROM (SELECT owner_id FROM user_days GROUP BY owner_id HAVING COUNT(*) > 1)",
    ).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(DISTINCT owner_id) AS count FROM notes").first<{ count: number }>(),
    env.DB.prepare("SELECT day, COUNT(*) AS users FROM user_days WHERE day >= ? GROUP BY day ORDER BY day DESC LIMIT 14")
      .bind(dateAfter(today, -13)).all<{ day: string; users: number }>(),
  ]);
  const count = (row: { count: number } | null): number => row?.count ?? 0;
  return Response.json({
    active_users: count(active),
    active_window_minutes: 5,
    total_users: count(total),
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/admin/stats" && request.method === "GET") {
      try {
        return await handleAdminStats(request, env);
      } catch (error) {
        console.error("admin stats error", error);
        return Response.json({ ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
      }
    }
    if (url.pathname === "/healthz") return Response.json({ ok: true });
    if (url.pathname === "/telegram/webhook" && request.method === "POST") {
      try {
        return await handleWebhook(request, env);
      } catch (error) {
        console.error("telegram webhook error", error);
        return Response.json({ ok: false }, { status: 500 });
      }
    }
    return new Response("Not found", { status: 404 });
  },
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await runCron(env);
  },
};
