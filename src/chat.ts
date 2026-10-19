import { isRecord } from "./guards";

/**
 * Transport-agnostic Weppy conversation engine.
 *
 * The engine owns onboarding, extraction, clarification, recap, follow-ups,
 * settings and CSV generation. It never talks to Telegram: callers pass an
 * owner id (Telegram private chat id or a derived web session owner) and
 * receive a list of outbound messages they can render however they like.
 */

export type Language = "id" | "en";

export type Profile = {
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

export type Button = { id: string; title: string };

export type NoteCard = {
  id: string;
  institusi: string;
  kontak: string;
  role: string;
  produk: string;
  tahap_deal: string;
  followup: string;
  status: Note["status"];
  filled: number;
  pending: Note["pending_clarify"];
};

export type OutFile = {
  filename: string;
  mime: string;
  content: string;
  caption: string;
};

export type OutMessage = {
  text: string;
  buttons?: Button[][];
  card?: NoteCard;
  file?: OutFile;
  tone?: "info" | "success" | "warn";
};

export interface CoreEnv {
  DB: D1Database;
  GROQ_API_KEY: string;
  GROQ_MODEL?: string;
  GROQ_WHISPER_MODEL?: string;
}

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

export function localDateParts(date = new Date()): { year: number; month: number; day: number } {
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

export function localDateString(date = new Date()): string {
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

export async function loadProfile(db: D1Database, owner: string): Promise<Profile> {
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

export async function loadNotes(db: D1Database, owner: string): Promise<Note[]> {
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

export async function transcribeAudio(
  env: CoreEnv,
  audio: ArrayBuffer,
  filename: string,
  mime: string,
): Promise<string> {
  if (audio.byteLength > MAX_AUDIO_BYTES) return "";
  const form = new FormData();
  form.set("model", env.GROQ_WHISPER_MODEL || "whisper-large-v3");
  form.set("response_format", "json");
  form.set("file", new File([audio], filename, { type: mime }));
  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: form,
  });
  if (!response.ok) throw new Error("Groq transcription failed");
  const decoded = await response.json<unknown>();
  return isRecord(decoded) && typeof decoded.text === "string" ? decoded.text.trim() : "";
}

async function extractReport(
  env: CoreEnv,
  report: string,
): Promise<Omit<Note, "id" | "created_at" | "status" | "pending_clarify">> {
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
        { role: "system", content: `Extract one B2B sales visit report into strict JSON with keys institusi, kontak, role, produk, tahap_deal, followup_date. Empty string for facts not stated; never invent facts. institusi is the company name only, kontak is the person's name only, and role is their job title only (never a sentence, never the report text). Stage must be one of ${DEAL_STAGES.join(", ")} or empty. followup_date is YYYY-MM-DD; explicit dates win; tomorrow is +1 day, next week +7 days, otherwise +3 days from today ${today}. Keep each value <=80 chars.` },
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

export function noteCard(note: Note, profile: Profile): NoteCard {
  return {
    id: note.id,
    institusi: note.institusi,
    kontak: note.kontak,
    role: note.role,
    produk: note.produk,
    tahap_deal: note.tahap_deal,
    followup: note.followup_date ? formatDate(note.followup_date, profile.language) : text(profile, "missing"),
    status: note.status,
    filled: MISSING_FIELDS.length - missingFields(note).length,
    pending: note.pending_clarify,
  };
}

function withBack(profile: Profile, buttons: Button[][]): Button[][] {
  return [...buttons, [{ id: "menu_main", title: profile.language === "en" ? "⬅️ Back" : "⬅️ Kembali" }]];
}

function menuMessage(profile: Profile): OutMessage {
  const copy = STRINGS[profile.language];
  return {
    text: copy.menu,
    buttons: [
      [{ id: "menu_lapor", title: copy.report }],
      [{ id: "menu_recap", title: copy.recap }, { id: "menu_followup", title: copy.followup }],
      [{ id: "menu_export", title: copy.export }, { id: "menu_settings", title: copy.settings }],
    ],
  };
}

function recapMessages(profile: Profile, notes: Note[]): OutMessage[] {
  if (!notes.length) {
    return [{ text: text(profile, "noNotes"), buttons: withBack(profile, []) }];
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
  const detailButtons = notes.slice(0, 20).map((note) => [{ id: `view_${note.id}`, title: `🔎 ${(note.institusi || "Detail").slice(0, 20)}` }]);
  return [
    { text: lines.join("\n") },
    {
      text: profile.language === "en" ? "View a full note:" : "Lihat catatan lengkap:",
      buttons: withBack(profile, detailButtons),
    },
  ];
}

function followupMessages(profile: Profile, notes: Note[]): OutMessage[] {
  const today = localDateString();
  const due = notes.filter((note) => note.followup_date && note.followup_date <= today);
  if (!due.length) {
    return [{ text: text(profile, "noFollowups", { date: formatDate(today, profile.language) }), buttons: withBack(profile, []) }];
  }
  const header = profile.language === "en" ? "*Follow-up reminders*" : "*Pengingat follow-up*";
  const lines = [header];
  for (const note of due) lines.push(`• ${note.institusi || "—"} — ${note.kontak || "—"} | ${note.produk || "—"} | ${formatDate(note.followup_date, profile.language)}`);
  return [{ text: lines.join("\n"), buttons: withBack(profile, []) }];
}

function askFieldMessage(profile: Profile, field: Note["pending_clarify"][number]): OutMessage {
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
  return { text: prompt, buttons: withBack(profile, options) };
}

function csvContent(notes: Note[]): string {
  const columns = ["id", "created_at", "institusi", "kontak", "role", "produk", "tahap_deal", "followup_date", "status"] as const;
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [columns.join(","), ...notes.map((note) => columns.map((key) => escape(note[key])).join(","))].join("\r\n");
}

async function handleReport(env: CoreEnv, owner: string, profile: Profile, report: string): Promise<OutMessage[]> {
  let fields: Omit<Note, "id" | "created_at" | "status" | "pending_clarify">;
  try {
    fields = await extractReport(env, report);
  } catch {
    return [{ text: text(profile, "aiBusy"), buttons: withBack(profile, []), tone: "warn" }];
  }
  if (![fields.institusi, fields.kontak, fields.role, fields.produk, fields.tahap_deal].some(Boolean)) {
    return [{ text: text(profile, "reportEmpty"), buttons: withBack(profile, []), tone: "warn" }];
  }
  const note: Note = {
    id: crypto.randomUUID().replaceAll("-", "").slice(0, 32),
    created_at: new Date().toISOString(),
    ...fields,
    status: "saved",
    pending_clarify: missingFields(fields),
  };
  if (note.pending_clarify.length) note.status = "draft";
  await saveNote(env.DB, owner, note);
  const messages: OutMessage[] = [{
    text: renderCard(note, profile),
    card: noteCard(note, profile),
    buttons: withBack(profile, []),
    tone: "success",
  }];
  messages.push(note.pending_clarify.length
    ? askFieldMessage(profile, note.pending_clarify[0])
    : menuMessage(profile));
  return messages;
}

async function handleClarification(
  env: CoreEnv,
  owner: string,
  profile: Profile,
  input: string,
  notes: Note[],
): Promise<OutMessage[] | null> {
  const draft = [...notes].reverse().find((note) => note.status === "draft" && note.pending_clarify.length);
  if (!draft) return null;
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
    await saveNote(env.DB, owner, draft);
    return [
      { text: text(profile, "saved", { filled: String(MISSING_FIELDS.length - missingFields(draft).length) }), tone: "success" },
      menuMessage(profile),
    ];
  }
  await saveNote(env.DB, owner, draft);
  return [askFieldMessage(profile, draft.pending_clarify[0])];
}

/**
 * Run one conversation turn. The caller is responsible for transcribing voice
 * input first and for ignoring group chats / duplicate updates.
 */
export async function processInput(env: CoreEnv, owner: string, rawInput: string): Promise<OutMessage[]> {
  const input = rawInput.trim();
  const profile = await loadProfile(env.DB, owner);

  if (profile.onboarding_stage !== "done") {
    if (profile.onboarding_stage === "new") {
      profile.onboarding_stage = "ask_name";
      await saveProfile(env.DB, owner, profile);
      return [
        { text: text(profile, "welcome") },
        { text: text(profile, "askName"), buttons: [[{ id: "skip", title: text(profile, "skip") }]] },
      ];
    }
    if (profile.onboarding_stage === "ask_name") {
      profile.nickname = input.toLowerCase() === "skip" ? "" : input.slice(0, 30);
      profile.onboarding_stage = "ask_language";
      await saveProfile(env.DB, owner, profile);
      return [{
        text: text(profile, "askLanguage"),
        buttons: [[{ id: "lang_id", title: "🇮🇩 Indonesia" }, { id: "lang_en", title: "🇬🇧 English" }]],
      }];
    }
    if (profile.onboarding_stage === "ask_language") {
      profile.language = input === "lang_en" || input.toLowerCase() === "english" ? "en" : "id";
      profile.onboarding_stage = "ask_time";
      await saveProfile(env.DB, owner, profile);
      return [{
        text: text(profile, "askTime"),
        buttons: [[
          { id: "time_08:00", title: "🕗 08:00" },
          { id: "time_17:00", title: "🕔 17:00" },
          { id: "skip", title: text(profile, "skip") },
        ]],
      }];
    }
    const time = input.match(/(?:time_)?(\d{1,2}):(\d{2})/);
    if (time && Number(time[1]) < 24 && Number(time[2]) < 60) {
      profile.recap_time = `${time[1].padStart(2, "0")}:${time[2]}`;
    }
    profile.onboarding_stage = "done";
    await saveProfile(env.DB, owner, profile);
    return [
      { text: text(profile, "onboardingDone", { name: profile.nickname }), tone: "success" },
      menuMessage(profile),
    ];
  }

  const low = input.toLowerCase();
  if (["/start", "halo", "hello", "hi"].includes(low)) {
    const notes = await loadNotes(env.DB, owner);
    const greeting = profile.language === "en"
      ? `Hello ${profile.nickname}! ${notes.length} note(s) stored.`
      : `Halo ${profile.nickname}! Tersimpan ${notes.length} catatan.`;
    return [{ text: greeting }, menuMessage(profile)];
  }
  if (["/help", "bantuan", "help"].includes(low)) {
    return [{ text: text(profile, "help") }, menuMessage(profile)];
  }
  if (input === "menu_main") {
    profile.pending_setting = "";
    await saveProfile(env.DB, owner, profile);
    return [menuMessage(profile)];
  }
  if (low === "menu") return [menuMessage(profile)];

  if (input === "menu_settings" || ["settings", "pengaturan"].includes(low)) {
    return [{
      text: text(profile, "settings"),
      buttons: withBack(profile, [[
        { id: "settings_name", title: profile.language === "en" ? "👤 Change name" : "👤 Ubah nama" },
        { id: "settings_lang", title: profile.language === "en" ? "🌐 Language" : "🌐 Bahasa" },
        { id: "settings_time", title: profile.language === "en" ? "🕒 Recap time" : "🕒 Jam rekap" },
      ]]),
    }];
  }
  if (["settings_name", "ubah nama", "change name"].includes(low)) {
    profile.pending_setting = "nickname";
    await saveProfile(env.DB, owner, profile);
    return [{ text: text(profile, "changeName") }];
  }
  if (["settings_time", "ubah jam rekap", "change recap time"].includes(low)) {
    profile.pending_setting = "recap_time";
    await saveProfile(env.DB, owner, profile);
    return [{ text: text(profile, "changeTime") }];
  }
  if (input === "settings_lang" || low === "ganti bahasa") {
    return [{
      text: text(profile, "askLanguage"),
      buttons: withBack(profile, [[{ id: "lang_id", title: "🇮🇩 Indonesia" }, { id: "lang_en", title: "🇬🇧 English" }]]),
    }];
  }
  if (profile.pending_setting === "nickname") {
    profile.nickname = input.slice(0, 30);
    profile.pending_setting = "";
    await saveProfile(env.DB, owner, profile);
    return [{ text: text(profile, "nameSaved"), buttons: withBack(profile, []), tone: "success" }];
  }
  if (profile.pending_setting === "recap_time") {
    const match = input.match(/^(\d{1,2}):(\d{2})$/);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
      return [{ text: text(profile, "badTime"), tone: "warn" }];
    }
    profile.recap_time = `${match[1].padStart(2, "0")}:${match[2]}`;
    profile.pending_setting = "";
    await saveProfile(env.DB, owner, profile);
    return [{ text: text(profile, "timeSaved", { time: profile.recap_time }), buttons: withBack(profile, []), tone: "success" }];
  }
  if (input === "lang_id" || input === "lang_en") {
    profile.language = input === "lang_en" ? "en" : "id";
    await saveProfile(env.DB, owner, profile);
    return [{ text: text(profile, "langSaved"), buttons: withBack(profile, []), tone: "success" }];
  }
  if (input.startsWith("time_")) {
    const match = input.slice(5).match(/^(\d{2}):(\d{2})$/);
    if (match && Number(match[1]) < 24 && Number(match[2]) < 60) {
      profile.recap_time = input.slice(5);
      await saveProfile(env.DB, owner, profile);
      return [{ text: text(profile, "timeSaved", { time: profile.recap_time }), buttons: withBack(profile, []), tone: "success" }];
    }
  }

  const notes = await loadNotes(env.DB, owner);
  if (input.startsWith("view_")) {
    const id = input.slice(5);
    const row = await env.DB.prepare("SELECT note_json FROM notes WHERE owner_id = ? AND id = ?")
      .bind(owner, id).first<{ note_json: string }>();
    const note = row ? parseNote(JSON.parse(row.note_json) as unknown) : null;
    if (!note) return [{ text: text(profile, "noteGone"), tone: "warn" }];
    return [{ text: renderCard(note, profile), card: noteCard(note, profile), buttons: withBack(profile, []) }];
  }
  if (input === "menu_recap" || ["rekap sekarang", "rekap", "recap", "recap now"].includes(low)) {
    return recapMessages(profile, notes);
  }
  if (input === "menu_followup" || ["cek follow-up", "follow-up", "check follow-ups"].includes(low)) {
    return followupMessages(profile, notes);
  }
  if (input === "menu_export" || ["ekspor csv", "export csv", "csv"].includes(low)) {
    if (!notes.length) return [{ text: text(profile, "exportEmpty"), buttons: withBack(profile, []) }];
    return [{
      text: `${profile.language === "en" ? "Pipeline notes" : "Catatan pipeline"}: ${notes.length}`,
      file: {
        filename: "catatan-pipeline.csv",
        mime: "text/csv",
        content: csvContent(notes),
        caption: `Pipeline notes: ${notes.length}`,
      },
    }];
  }
  if (input === "menu_lapor" || input === "laporan baru") {
    for (const draft of notes.filter((note) => note.status === "draft")) {
      draft.status = "saved";
      draft.pending_clarify = [];
      await saveNote(env.DB, owner, draft);
    }
    return [{ text: text(profile, "reportPrompt"), buttons: withBack(profile, []) }];
  }

  const clarified = await handleClarification(env, owner, profile, low === "skip" ? "skip" : input, notes);
  if (clarified) return clarified;
  return handleReport(env, owner, profile, input);
}

function onboardingPrompt(profile: Profile): OutMessage[] {
  if (profile.onboarding_stage === "ask_name") {
    return [{ text: text(profile, "askName"), buttons: [[{ id: "skip", title: text(profile, "skip") }]] }];
  }
  if (profile.onboarding_stage === "ask_language") {
    return [{
      text: text(profile, "askLanguage"),
      buttons: [[{ id: "lang_id", title: "🇮🇩 Indonesia" }, { id: "lang_en", title: "🇬🇧 English" }]],
    }];
  }
  if (profile.onboarding_stage === "ask_time") {
    return [{
      text: text(profile, "askTime"),
      buttons: [[
        { id: "time_08:00", title: "🕗 08:00" },
        { id: "time_17:00", title: "🕔 17:00" },
        { id: "skip", title: text(profile, "skip") },
      ]],
    }];
  }
  return [];
}

export async function initialState(
  env: CoreEnv,
  owner: string,
): Promise<{ profile: Profile; notes: Note[]; messages: OutMessage[] }> {
  let profile = await loadProfile(env.DB, owner);
  if (profile.onboarding_stage === "new") {
    const messages = await processInput(env, owner, "");
    profile = await loadProfile(env.DB, owner);
    return { profile, notes: [], messages };
  }
  if (profile.onboarding_stage !== "done") {
    return { profile, notes: [], messages: onboardingPrompt(profile) };
  }
  const notes = await loadNotes(env.DB, owner);
  return { profile, notes, messages: await processInput(env, owner, "/start") };
}

export type PublicProfile = Pick<Profile, "nickname" | "language" | "recap_time" | "onboarding_stage" | "pending_setting">;

export function publicProfile(profile: Profile): PublicProfile {
  return {
    nickname: profile.nickname,
    language: profile.language,
    recap_time: profile.recap_time,
    onboarding_stage: profile.onboarding_stage,
    pending_setting: profile.pending_setting,
  };
}

export function dueFollowups(notes: Note[], today = localDateString()): Note[] {
  return notes.filter((note) => note.followup_date && note.followup_date <= today);
}
