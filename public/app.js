/* Weppy web client: talks to the same conversation engine as Telegram. */
const STORAGE_KEY = "weppy.web.session.v1";
const LOG_LIMIT = 240;

const el = (id) => document.getElementById(id);
const messagesEl = el("messages");
const composerEl = el("composer");
const inputEl = el("input");
const sendBtn = el("sendBtn");
const micBtn = el("micBtn");
const quickActionsEl = el("quickActions");
const noteListEl = el("noteList");
const toastEl = el("toast");

let state = {
  token: "",
  profile: null,
  notes: [],
  due: 0,
  log: [],
  busy: false,
};

/* ---------- Locale (follows the profile language chosen in onboarding) ---------- */
const T = {
  id: {
    brandSub: "Demo web",
    ariaHome: "Kembali ke beranda Weppy",
    ariaActions: "Aksi",
    chatAria: "Percakapan dengan Weppy",
    statusConnecting: "menghubungkan…",
    statusReady: "online · siap membantu",
    statusPreparing: "menyiapkan profil…",
    statusOffline: "offline",
    settingsAria: "Pengaturan",
    sideAria: "Pipeline dan pengaturan",
    sideToggleAria: "Buka panel pipeline",
    sidePanelTitle: "Pipeline & pengaturan",
    closeSideAria: "Tutup panel",
    quickActionsAria: "Aksi cepat",
    recording: "Merekam…",
    recordingHint: "tekan mic untuk selesai",
    inputLabel: "Tulis laporan kunjungan atau balasan",
    inputPlaceholder: "Ceritakan hasil kunjungan… (mis. ketemu Bu Sari dari PT Maju Jaya, bahas kopi 100 kg, minta penawaran)",
    micAria: "Rekam voice note",
    sendAria: "Kirim pesan",
    footnoteKeys: "Enter untuk kirim · Shift+Enter baris baru",
    sessionNote: "Sesi tersimpan di browser ini",
    statNotes: "Catatan",
    statDrafts: "Draf",
    statDue: "Jatuh tempo",
    exportCsv: "Ekspor CSV",
    pipelineTitle: "Pipeline",
    aboutTitle: "Tentang demo",
    aboutBody: "Sesi web disimpan di browser ini saja. Bot Telegram tetap jalur utama dengan pengingat terjadwal. Layanan gratis best-effort.",
    settingsTitle: "Pengaturan",
    closeSettingsAria: "Tutup pengaturan",
    nameLabel: "Nama panggilan",
    notSet: "Belum diisi",
    changeName: "Ubah",
    langLabel: "Bahasa",
    changeLang: "Ganti",
    recapTimeLabel: "Jam rekap",
    changeTime: "Ubah",
    settingsNote: "Perubahan hanya berlaku untuk sesi browser ini. Buka bot Telegram untuk pengingat otomatis terjadwal.",
    newSession: "Mulai sesi baru",
    done: "Selesai",
    guest: "Tamu",
    langNameId: "Bahasa Indonesia",
    langNameEn: "English",
    recapMeta: "{lang} · rekap {time} WIB",
    draftPill: "Draf",
    savedPill: "Tersimpan",
    noteTitle: "Catatan kunjungan",
    fieldInstitusi: "Institusi",
    fieldKontak: "Kontak",
    fieldProduk: "Produk",
    fieldTahap: "Tahap deal",
    fieldFollowup: "Follow-up",
    missingValue: "Belum ada",
    filledCount: "{filled}/5 terisi",
    emptyState: "Belum ada catatan. Kirim laporan kunjungan pertamamu untuk melihat pipeline di sini.",
    noInstitution: "Tanpa institusi",
    noStage: "Belum ada tahap",
    draftTag: "draf",
    quickReport: "📝 Laporan baru",
    quickRecap: "📊 Rekap",
    quickFollowup: "🔔 Follow-up",
    quickSettings: "⚙️ Pengaturan",
    displayReport: "Laporan baru",
    displayRecap: "Rekap sekarang",
    displayFollowup: "Cek follow-up",
    displayExport: "Ekspor CSV",
    displaySettings: "Pengaturan",
    displayMain: "Menu utama",
    displayName: "Ubah nama",
    displayLanguage: "Ganti bahasa",
    displayTime: "Ubah jam rekap",
    viewDetail: "Lihat detail catatan",
    chooseStage: "Pilih tahap deal",
    recapTimeShort: "Jam rekap {time}",
    sendFail: "Pesan belum terkirim. Periksa koneksi lalu coba lagi.",
    sendFailToast: "Gagal mengirim pesan. Periksa koneksi lalu coba lagi.",
    csvDownloaded: "CSV diunduh.",
    csvFail: "Belum bisa mengunduh CSV. Coba lagi.",
    micUnsupported: "Perekam suara tidak didukung di browser ini. Ketik laporan sebagai teks.",
    micDenied: "Izin mikrofon ditolak. Ketik laporan sebagai teks.",
    recordingTooShort: "Rekaman terlalu pendek. Coba lagi.",
    voiceNote: "🎙️ Voice note",
    transcriptPrefix: "Transkrip",
    voiceUnclear: "Voice note belum bisa dipahami. Coba ketik laporannya.",
    voiceFailToast: "Voice note gagal diproses.",
    voiceSendFail: "Voice note gagal dikirim. Coba lagi atau ketik laporan.",
    voiceSendFailToast: "Voice note gagal dikirim.",
    newSessionToast: "Sesi baru dimulai.",
    serverNoResponse: "Server tidak merespons.",
    serverNoResponseMsg: "Tidak bisa menghubungi server. Muat ulang halaman atau coba lagi nanti.",
    typingAria: "Weppy sedang mengetik",
    fileMeta: "CSV · semua catatanmu",
    download: "Unduh",
  },
  en: {
    brandSub: "Web demo",
    ariaHome: "Back to Weppy home",
    ariaActions: "Actions",
    chatAria: "Chat with Weppy",
    statusConnecting: "connecting…",
    statusReady: "online · ready to help",
    statusPreparing: "preparing profile…",
    statusOffline: "offline",
    settingsAria: "Settings",
    sideAria: "Pipeline and settings",
    sideToggleAria: "Open pipeline panel",
    sidePanelTitle: "Pipeline & settings",
    closeSideAria: "Close panel",
    quickActionsAria: "Quick actions",
    recording: "Recording…",
    recordingHint: "tap the mic to finish",
    inputLabel: "Write a visit report or reply",
    inputPlaceholder: "Describe the visit… (e.g. met Ms Sari at PT Maju Jaya, discussed 100 kg of coffee, requested a quote)",
    micAria: "Record a voice note",
    sendAria: "Send message",
    footnoteKeys: "Enter to send · Shift+Enter for a new line",
    sessionNote: "Session stored in this browser",
    statNotes: "Notes",
    statDrafts: "Drafts",
    statDue: "Due",
    exportCsv: "Export CSV",
    pipelineTitle: "Pipeline",
    aboutTitle: "About the demo",
    aboutBody: "The web session lives only in this browser. The Telegram bot remains the main path with scheduled reminders. Free, best-effort service.",
    settingsTitle: "Settings",
    closeSettingsAria: "Close settings",
    nameLabel: "Nickname",
    notSet: "Not set",
    changeName: "Change",
    langLabel: "Language",
    changeLang: "Change",
    recapTimeLabel: "Recap time",
    changeTime: "Change",
    settingsNote: "Changes apply to this browser session only. Open the Telegram bot for scheduled reminders.",
    newSession: "Start new session",
    done: "Done",
    guest: "Guest",
    langNameId: "Indonesian",
    langNameEn: "English",
    recapMeta: "{lang} · recap {time} WIB",
    draftPill: "Draft",
    savedPill: "Saved",
    noteTitle: "Visit note",
    fieldInstitusi: "Institution",
    fieldKontak: "Contact",
    fieldProduk: "Product",
    fieldTahap: "Deal stage",
    fieldFollowup: "Follow-up",
    missingValue: "Not set",
    filledCount: "{filled}/5 filled",
    emptyState: "No notes yet. Send your first visit report to see the pipeline here.",
    noInstitution: "No institution",
    noStage: "No stage yet",
    draftTag: "draft",
    quickReport: "📝 New report",
    quickRecap: "📊 Recap",
    quickFollowup: "🔔 Follow-ups",
    quickSettings: "⚙️ Settings",
    displayReport: "New report",
    displayRecap: "Recap now",
    displayFollowup: "Check follow-ups",
    displayExport: "Export CSV",
    displaySettings: "Settings",
    displayMain: "Main menu",
    displayName: "Change name",
    displayLanguage: "Change language",
    displayTime: "Change recap time",
    viewDetail: "View note detail",
    chooseStage: "Choose deal stage",
    recapTimeShort: "Recap time {time}",
    sendFail: "Message not sent. Check your connection and try again.",
    sendFailToast: "Could not send the message. Check your connection and try again.",
    csvDownloaded: "CSV downloaded.",
    csvFail: "Could not download the CSV. Try again.",
    micUnsupported: "Voice recording is not supported in this browser. Type the report as text.",
    micDenied: "Microphone permission denied. Type the report as text.",
    recordingTooShort: "Recording too short. Try again.",
    voiceNote: "🎙️ Voice note",
    transcriptPrefix: "Transcript",
    voiceUnclear: "That voice note could not be understood. Try typing the report.",
    voiceFailToast: "Voice note could not be processed.",
    voiceSendFail: "Voice note failed to send. Try again or type the report.",
    voiceSendFailToast: "Voice note failed to send.",
    newSessionToast: "New session started.",
    serverNoResponse: "Server is not responding.",
    serverNoResponseMsg: "Could not reach the server. Reload the page or try again later.",
    typingAria: "Weppy is typing",
    fileMeta: "CSV · all your notes",
    download: "Download",
  },
};

function lang() {
  return state.profile?.language === "id" ? "id" : "en";
}

function t(key, vars = {}) {
  const value = T[lang()][key] ?? T.en[key] ?? "";
  return Object.entries(vars).reduce((acc, [name, replacement]) => acc.replaceAll(`{${name}}`, replacement), value);
}

function langLabel(code) {
  return code === "id" ? t("langNameId") : t("langNameEn");
}

/** Apply the profile language to the static page chrome. */
function applyLocale() {
  document.documentElement.lang = lang();
  for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);
  for (const node of document.querySelectorAll("[data-i18n-attr]")) {
    const [attribute, key] = node.dataset.i18nAttr.split(":");
    node.setAttribute(attribute, t(key));
  }
  inputEl.placeholder = t("inputPlaceholder");
}

let toastTimer = 0;
function toast(message, tone = "info") {
  toastEl.textContent = message;
  toastEl.dataset.tone = tone;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3200);
}

function saveSession() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: state.token, log: state.log.slice(-LOG_LIMIT) }));
  } catch {
    /* Storage may be full or blocked; the session still works in memory. */
  }
}

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.token !== "string") return null;
    return { token: parsed.token, log: Array.isArray(parsed.log) ? parsed.log : [] };
  } catch {
    return null;
  }
}

/* ---------- Text rendering (safe, minimal markdown) ---------- */
function richText(text) {
  const fragment = document.createDocumentFragment();
  const lines = String(text ?? "").split("\n");
  lines.forEach((line, index) => {
    if (index > 0) fragment.appendChild(document.createElement("br"));
    let cursor = 0;
    const pattern = /\*([^*]+)\*/g;
    let match;
    while ((match = pattern.exec(line)) !== null) {
      if (match.index > cursor) fragment.appendChild(document.createTextNode(line.slice(cursor, match.index)));
      const strong = document.createElement("strong");
      strong.textContent = match[1];
      fragment.appendChild(strong);
      cursor = pattern.lastIndex;
    }
    if (cursor < line.length) fragment.appendChild(document.createTextNode(line.slice(cursor)));
  });
  return fragment;
}

function avatarNode() {
  const span = document.createElement("span");
  span.className = "avatar";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h10M4 18h7"/><circle cx="18" cy="16" r="2.4" fill="currentColor" stroke="none"/></svg>';
  return span;
}

function cardNode(card) {
  const wrap = document.createElement("div");
  wrap.className = "note-card";

  const head = document.createElement("div");
  head.className = "note-card-head";
  const title = document.createElement("b");
  title.textContent = card.institusi || t("noteTitle");
  const pill = document.createElement("span");
  pill.className = "pill" + (card.status === "draft" ? " draft" : "");
  pill.textContent = card.status === "draft" ? t("draftPill") : t("savedPill");
  head.append(title, pill);

  const list = document.createElement("dl");
  list.className = "note-fields";
  const rows = [
    [t("fieldInstitusi"), card.institusi],
    [t("fieldKontak"), [card.kontak, card.role].filter(Boolean).join(" · ")],
    [t("fieldProduk"), card.produk],
    [t("fieldTahap"), card.tahap_deal],
    [t("fieldFollowup"), card.followup],
  ];
  for (const [label, value] of rows) {
    const row = document.createElement("div");
    row.className = "note-field";
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    if (value) {
      dd.textContent = value;
    } else {
      dd.className = "empty";
      dd.textContent = t("missingValue");
    }
    row.append(dt, dd);
    list.appendChild(row);
  }

  const foot = document.createElement("div");
  foot.className = "note-card-foot";
  const progress = document.createElement("div");
  progress.className = "progress";
  const bar = document.createElement("span");
  bar.style.width = `${Math.round((card.filled / 5) * 100)}%`;
  progress.appendChild(bar);
  const count = document.createElement("span");
  count.className = "nums";
  count.textContent = t("filledCount", { filled: String(card.filled) });
  foot.append(progress, count);

  wrap.append(head, list, foot);
  return wrap;
}

function fileNode(file) {
  const wrap = document.createElement("div");
  wrap.className = "file-card";
  const icon = document.createElement("span");
  icon.className = "file-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v5h5"/><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/></svg>';
  const text = document.createElement("div");
  const name = document.createElement("b");
  name.textContent = file.filename || "pipeline-notes.csv";
  const meta = document.createElement("span");
  meta.textContent = t("fileMeta");
  text.append(name, meta);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-small";
  btn.textContent = t("download");
  btn.addEventListener("click", downloadCsv);
  wrap.append(icon, text, btn);
  return wrap;
}

function actionsNode(rows) {
  const wrap = document.createElement("div");
  wrap.className = "actions";
  for (const row of rows) {
    for (const button of row) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "action";
      b.textContent = button.title;
      b.addEventListener("click", () => sendMessage(button.id));
      wrap.appendChild(b);
    }
  }
  return wrap;
}

function messageNode(entry, showAvatar = true) {
  if (entry.role === "system") {
    const wrap = document.createElement("div");
    wrap.className = "msg system";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = entry.text;
    wrap.appendChild(bubble);
    return wrap;
  }

  const wrap = document.createElement("div");
  wrap.className = "msg" + (entry.role === "user" ? " user" : "");
  if (entry.role !== "user" && showAvatar) wrap.appendChild(avatarNode());
  if (entry.role !== "user" && !showAvatar) wrap.classList.add("continued");
  const stack = document.createElement("div");
  stack.className = "msg-stack";

  if (entry.card) {
    stack.appendChild(cardNode(entry.card));
  } else if (entry.file) {
    stack.appendChild(fileNode(entry.file));
  } else {
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.appendChild(richText(entry.text));
    stack.appendChild(bubble);
  }
  if (entry.buttons && entry.buttons.length) stack.appendChild(actionsNode(entry.buttons));
  wrap.appendChild(stack);
  return wrap;
}

let lastRole = "";

function renderLog() {
  messagesEl.replaceChildren();
  lastRole = "";
  for (const entry of state.log) {
    messagesEl.appendChild(messageNode(entry, entry.role !== "bot" || lastRole !== "bot"));
    lastRole = entry.role;
  }
  scrollToBottom();
}

function appendEntry(entry) {
  state.log.push(entry);
  if (state.log.length > LOG_LIMIT) state.log = state.log.slice(-LOG_LIMIT);
  const node = messageNode(entry, entry.role !== "bot" || lastRole !== "bot");
  messagesEl.appendChild(node);
  lastRole = entry.role;
  scrollToBottom();
  saveSession();
  return node;
}

function removeEntry(node, entry) {
  node.remove();
  const index = state.log.indexOf(entry);
  if (index !== -1) state.log.splice(index, 1);
  saveSession();
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

function showTyping() {
  const wrap = document.createElement("div");
  wrap.className = "msg";
  wrap.id = "typingIndicator";
  wrap.appendChild(avatarNode());
  const stack = document.createElement("div");
  stack.className = "msg-stack";
  const bubble = document.createElement("div");
  bubble.className = "bubble typing";
  bubble.innerHTML = "<i></i><i></i><i></i>";
  bubble.setAttribute("aria-label", t("typingAria"));
  stack.appendChild(bubble);
  wrap.appendChild(stack);
  messagesEl.appendChild(wrap);
  scrollToBottom();
}

function hideTyping() {
  el("typingIndicator")?.remove();
}

/* ---------- Sidebar ---------- */
function renderSidebar() {
  const profile = state.profile;
  const notes = state.notes || [];
  const drafts = notes.filter((note) => note.status === "draft").length;

  el("statTotal").textContent = String(notes.length);
  el("statDraft").textContent = String(drafts);
  el("statDue").textContent = String(state.due || 0);
  el("noteCount").textContent = String(notes.length);

  if (profile) {
    const name = profile.nickname || t("guest");
    el("profileName").textContent = name;
    el("profileAvatar").textContent = name.slice(0, 1).toUpperCase();
    const langName = langLabel(profile.language);
    el("profileMeta").textContent = t("recapMeta", { lang: langName, time: profile.recap_time });
    el("headStatus").textContent = profile.onboarding_stage === "done" ? t("statusReady") : t("statusPreparing");
    el("dlgName").textContent = profile.nickname || t("notSet");
    el("dlgLang").textContent = langName;
    el("dlgTime").textContent = `${profile.recap_time} WIB`;
  }

  noteListEl.replaceChildren();
  if (!notes.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = t("emptyState");
    noteListEl.appendChild(empty);
    return;
  }
  for (const note of notes) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "note-item";
    const dot = document.createElement("span");
    dot.className = "stage-dot";
    const text = document.createElement("span");
    text.className = "note-text";
    const b = document.createElement("b");
    b.textContent = note.institusi || t("noInstitution");
    const sub = document.createElement("span");
    sub.textContent = [note.kontak, note.tahap_deal || t("noStage")].filter(Boolean).join(" · ");
    text.append(b, sub);
    btn.append(dot, text);
    if (note.status === "draft") {
      const due = document.createElement("span");
      due.className = "due";
      due.textContent = t("draftTag");
      btn.appendChild(due);
    }
    btn.addEventListener("click", () => {
      sendMessage(`view_${note.id}`);
      closeSide();
    });
    li.appendChild(btn);
    noteListEl.appendChild(li);
  }
}

function applyResult(data) {
  const previousLanguage = state.profile?.language;
  if (data.profile) state.profile = data.profile;
  if (Array.isArray(data.notes)) state.notes = data.notes;
  if (typeof data.due === "number") state.due = data.due;
  if (Array.isArray(data.messages)) {
    for (const message of data.messages) {
      appendEntry({
        role: "bot",
        text: message.text,
        buttons: message.buttons,
        card: message.card,
        file: message.file ? { filename: message.file.filename, mime: message.file.mime } : undefined,
      });
    }
  }
  if (previousLanguage !== state.profile?.language) {
    applyLocale();
    renderQuickActions();
  }
  renderSidebar();
  saveSession();
}

/* ---------- Networking ---------- */
async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || "request_failed"), { status: response.status, data });
  return data;
}

async function sendMessage(text) {
  if (state.busy || !state.token) return;
  const value = String(text ?? "").trim();
  if (!value) return;
  state.busy = true;
  sendBtn.disabled = true;
  const optimistic = { role: "user", text: displayText(value) };
  const node = appendEntry(optimistic);
  showTyping();
  try {
    const data = await postJson("/api/message", { token: state.token, text: value });
    hideTyping();
    applyResult(data);
  } catch {
    hideTyping();
    // The server never accepted this turn: drop the optimistic bubble instead
    // of leaving it in the persisted log as if it had been delivered.
    removeEntry(node, optimistic);
    if (!value.startsWith("menu_") && !value.startsWith("view_") && !value.startsWith("settings_")
      && !value.startsWith("lang_") && !value.startsWith("time_") && value !== "skip") {
      inputEl.value = value;
    }
    appendEntry({ role: "system", text: t("sendFail") });
    toast(t("sendFailToast"), "error");
  } finally {
    state.busy = false;
    updateComposer();
  }
}

function displayText(value) {
  const map = {
    menu_lapor: t("displayReport"),
    menu_recap: t("displayRecap"),
    menu_followup: t("displayFollowup"),
    menu_export: t("displayExport"),
    menu_settings: t("displaySettings"),
    menu_main: t("displayMain"),
    settings_name: t("displayName"),
    settings_lang: t("displayLanguage"),
    settings_time: t("displayTime"),
    skip: "Skip",
    lang_id: t("langNameId"),
    lang_en: t("langNameEn"),
  };
  if (map[value]) return map[value];
  if (value.startsWith("stage_")) return t("chooseStage");
  if (value.startsWith("view_")) return t("viewDetail");
  if (value.startsWith("time_")) return t("recapTimeShort", { time: value.slice(5) });
  return value;
}

async function downloadCsv() {
  if (!state.token) return;
  try {
    const response = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: state.token }),
    });
    if (!response.ok) throw new Error("export_failed");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = lang() === "id" ? "catatan-pipeline.csv" : "pipeline-notes.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast(t("csvDownloaded"));
  } catch {
    toast(t("csvFail"), "error");
  }
}

/* ---------- Voice recording ---------- */
let recorder = null;
let chunks = [];
let recTimer = 0;
let recStarted = 0;

function pickMime() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const type of candidates) if (window.MediaRecorder && MediaRecorder.isTypeSupported(type)) return type;
  return "";
}

async function startRecording() {
  if (state.busy) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    toast(t("micUnsupported"), "error");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = pickMime();
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      recorder = null;
      uploadVoice(blob);
    });
    recorder.start();
    micBtn.setAttribute("aria-pressed", "true");
    el("recordingBar").hidden = false;
    el("recLabel").textContent = t("recording");
    el("recHint").textContent = t("recordingHint");
    recStarted = Date.now();
    el("recTimer").textContent = "0:00";
    recTimer = setInterval(() => {
      const seconds = Math.floor((Date.now() - recStarted) / 1000);
      el("recTimer").textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    }, 500);
  } catch {
    toast(t("micDenied"), "error");
  }
}

function stopRecording() {
  clearInterval(recTimer);
  el("recordingBar").hidden = true;
  micBtn.setAttribute("aria-pressed", "false");
  if (recorder && recorder.state !== "inactive") recorder.stop();
}

async function uploadVoice(blob) {
  if (!state.token) return;
  if (blob.size < 1200) {
    toast(t("recordingTooShort"), "error");
    return;
  }
  state.busy = true;
  sendBtn.disabled = true;
  appendEntry({ role: "user", text: t("voiceNote") });
  showTyping();
  try {
    const form = new FormData();
    form.set("token", state.token);
    form.set("audio", blob, "voice.webm");
    const response = await fetch("/api/voice", { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    hideTyping();
    if (!response.ok) {
      appendEntry({ role: "system", text: data.message || t("voiceUnclear") });
      toast(data.message || t("voiceFailToast"), "error");
      return;
    }
    if (data.transcript) appendEntry({ role: "system", text: `${t("transcriptPrefix")}: “${data.transcript}”` });
    applyResult(data);
  } catch {
    hideTyping();
    appendEntry({ role: "system", text: t("voiceSendFail") });
    toast(t("voiceSendFailToast"), "error");
  } finally {
    state.busy = false;
    updateComposer();
  }
}

/* ---------- Composer ---------- */
function updateComposer() {
  const hasText = inputEl.value.trim().length > 0;
  sendBtn.disabled = state.busy || !hasText;
  inputEl.style.height = "auto";
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, 132)}px`;
}

composerEl.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = inputEl.value.trim();
  if (!value || state.busy) return;
  inputEl.value = "";
  updateComposer();
  sendMessage(value);
});

inputEl.addEventListener("input", updateComposer);
inputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    composerEl.requestSubmit();
  }
});

micBtn.addEventListener("click", () => {
  if (recorder) stopRecording();
  else startRecording();
});

/* ---------- Quick actions ---------- */
function quickItems() {
  return [
    { label: t("quickReport"), action: "menu_lapor" },
    { label: t("quickRecap"), action: "menu_recap" },
    { label: t("quickFollowup"), action: "menu_followup" },
    { label: t("quickSettings"), action: "menu_settings" },
  ];
}

function renderQuickActions() {
  quickActionsEl.replaceChildren();
  for (const item of quickItems()) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quick-action";
    btn.textContent = item.label;
    btn.addEventListener("click", () => sendMessage(item.action));
    quickActionsEl.appendChild(btn);
  }
}

/* ---------- Side panel toggle ---------- */
const sideEl = el("side");
const sideToggle = el("sideToggle");
const sideScrim = el("sideScrim");
const sideClose = el("sideClose");
const desktopMq = window.matchMedia("(min-width: 961px)");

function openSide() {
  sideEl.classList.add("open");
  sideEl.removeAttribute("inert");
  sideScrim.classList.add("show");
  sideToggle.setAttribute("aria-expanded", "true");
  if (sideClose) sideClose.focus({ preventScroll: true });
}
function closeSide() {
  const wasOpen = sideEl.classList.contains("open");
  sideEl.classList.remove("open");
  sideScrim.classList.remove("show");
  sideToggle.setAttribute("aria-expanded", "false");
  if (!desktopMq.matches) sideEl.setAttribute("inert", "");
  if (wasOpen) sideToggle.focus({ preventScroll: true });
}
sideToggle.addEventListener("click", () => {
  if (sideEl.classList.contains("open")) closeSide();
  else openSide();
});
if (sideClose) sideClose.addEventListener("click", closeSide);
sideScrim.addEventListener("click", closeSide);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && sideEl.classList.contains("open")) closeSide();
});
// Keep the off-canvas drawer out of the tab order and reset state on resize.
function syncSideMode() {
  if (desktopMq.matches) {
    sideEl.removeAttribute("inert");
    if (sideEl.classList.contains("open")) {
      sideEl.classList.remove("open");
      sideScrim.classList.remove("show");
      sideToggle.setAttribute("aria-expanded", "false");
    }
  } else if (!sideEl.classList.contains("open")) {
    sideEl.setAttribute("inert", "");
  }
}
desktopMq.addEventListener("change", syncSideMode);
syncSideMode();

/* ---------- Settings dialog ---------- */
const settingsDialog = el("settingsDialog");
el("settingsBtn").addEventListener("click", () => settingsDialog.showModal());
el("closeSettings").addEventListener("click", () => settingsDialog.close());
el("doneSettings").addEventListener("click", () => settingsDialog.close());
settingsDialog.addEventListener("click", (event) => {
  if (event.target === settingsDialog) settingsDialog.close();
});
for (const btn of document.querySelectorAll("[data-setting]")) {
  btn.addEventListener("click", () => {
    const setting = btn.dataset.setting;
    settingsDialog.close();
    if (setting === "nickname") sendMessage("settings_name");
    else if (setting === "language") sendMessage("settings_lang");
    else if (setting === "recap_time") sendMessage("settings_time");
  });
}
el("newSessionBtn").addEventListener("click", async () => {
  settingsDialog.close();
  localStorage.removeItem(STORAGE_KEY);
  state = { token: "", profile: null, notes: [], due: 0, log: [], busy: false };
  messagesEl.replaceChildren();
  lastRole = "";
  await boot(true);
  toast(t("newSessionToast"));
});

el("exportBtn").addEventListener("click", downloadCsv);

/* ---------- Boot ---------- */
async function boot(fresh = false) {
  const stored = fresh ? null : loadStored();
  el("headStatus").textContent = t("statusConnecting");
  try {
    const data = await postJson("/api/session", stored ? { token: stored.token } : {});
    state.token = data.token;
    state.profile = data.profile;
    state.notes = data.notes || [];
    state.due = data.due || 0;
    applyLocale();
    renderQuickActions();
    if (stored && stored.log.length) {
      state.log = stored.log;
      renderLog();
      renderSidebar();
    } else {
      state.log = [];
      renderSidebar();
      for (const message of data.messages || []) {
        appendEntry({
          role: "bot",
          text: message.text,
          buttons: message.buttons,
          card: message.card,
          file: message.file ? { filename: message.file.filename, mime: message.file.mime } : undefined,
        });
      }
    }
    saveSession();
  } catch {
    el("headStatus").textContent = t("statusOffline");
    appendEntry({ role: "system", text: t("serverNoResponseMsg") });
    toast(t("serverNoResponse"), "error");
  }
  updateComposer();
}

boot();
