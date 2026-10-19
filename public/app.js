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
  title.textContent = card.institusi || "Catatan kunjungan";
  const pill = document.createElement("span");
  pill.className = "pill" + (card.status === "draft" ? " draft" : "");
  pill.textContent = card.status === "draft" ? "Draf" : "Tersimpan";
  head.append(title, pill);

  const list = document.createElement("dl");
  list.className = "note-fields";
  const rows = [
    ["Institusi", card.institusi],
    ["Kontak", [card.kontak, card.role].filter(Boolean).join(" — ")],
    ["Produk", card.produk],
    ["Tahap deal", card.tahap_deal],
    ["Follow-up", card.followup],
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
      dd.textContent = "Belum ada";
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
  count.textContent = `${card.filled}/5 terisi`;
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
  name.textContent = file.filename || "catatan-pipeline.csv";
  const meta = document.createElement("span");
  meta.textContent = "CSV · semua catatanmu";
  text.append(name, meta);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-small";
  btn.textContent = "Unduh";
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
  bubble.setAttribute("aria-label", "Weppy sedang mengetik");
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
    const name = profile.nickname || "Tamu";
    el("profileName").textContent = name;
    el("profileAvatar").textContent = name.slice(0, 1).toUpperCase();
    const lang = profile.language === "en" ? "English" : "Bahasa Indonesia";
    el("profileMeta").textContent = `${lang} · rekap ${profile.recap_time} WIB`;
    el("headStatus").textContent = profile.onboarding_stage === "done" ? "online · siap membantu" : "menyiapkan profil…";
    el("dlgName").textContent = profile.nickname || "Belum diisi";
    el("dlgLang").textContent = lang;
    el("dlgTime").textContent = `${profile.recap_time} WIB`;
  }

  noteListEl.replaceChildren();
  if (!notes.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "Belum ada catatan. Kirim laporan kunjungan pertamamu untuk melihat pipeline di sini.";
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
    b.textContent = note.institusi || "Tanpa institusi";
    const sub = document.createElement("span");
    sub.textContent = [note.kontak, note.tahap_deal || "Belum ada tahap"].filter(Boolean).join(" · ");
    text.append(b, sub);
    btn.append(dot, text);
    if (note.status === "draft") {
      const due = document.createElement("span");
      due.className = "due";
      due.textContent = "draf";
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
  renderSidebar();
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
    appendEntry({ role: "system", text: "Pesan belum terkirim. Periksa koneksi lalu coba lagi." });
    toast("Gagal mengirim pesan. Periksa koneksi lalu coba lagi.", "error");
  } finally {
    state.busy = false;
    updateComposer();
  }
}

function displayText(value) {
  const map = {
    menu_lapor: "Laporan baru",
    menu_recap: "Rekap sekarang",
    menu_followup: "Cek follow-up",
    menu_export: "Ekspor CSV",
    menu_settings: "Pengaturan",
    menu_main: "Menu utama",
    settings_name: "Ubah nama",
    settings_lang: "Ganti bahasa",
    settings_time: "Ubah jam rekap",
    skip: "Skip",
    lang_id: "Bahasa Indonesia",
    lang_en: "English",
  };
  if (map[value]) return map[value];
  if (value.startsWith("stage_")) return "Pilih tahap deal";
  if (value.startsWith("view_")) return "Lihat detail catatan";
  if (value.startsWith("time_")) return `Jam rekap ${value.slice(5)}`;
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
    link.download = "catatan-pipeline.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast("CSV diunduh.");
  } catch {
    toast("Belum bisa mengunduh CSV. Coba lagi.", "error");
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
    toast("Perekam suara tidak didukung di browser ini. Ketik laporan sebagai teks.", "error");
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
    recStarted = Date.now();
    el("recTimer").textContent = "0:00";
    recTimer = setInterval(() => {
      const seconds = Math.floor((Date.now() - recStarted) / 1000);
      el("recTimer").textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    }, 500);
  } catch {
    toast("Izin mikrofon ditolak. Ketik laporan sebagai teks.", "error");
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
    toast("Rekaman terlalu pendek. Coba lagi.", "error");
    return;
  }
  state.busy = true;
  sendBtn.disabled = true;
  appendEntry({ role: "user", text: "🎙️ Voice note" });
  showTyping();
  try {
    const form = new FormData();
    form.set("token", state.token);
    form.set("audio", blob, "voice.webm");
    const response = await fetch("/api/voice", { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    hideTyping();
    if (!response.ok) {
      appendEntry({ role: "system", text: data.message || "Voice note belum bisa dipahami. Coba ketik laporannya." });
      toast(data.message || "Voice note gagal diproses.", "error");
      return;
    }
    if (data.transcript) appendEntry({ role: "system", text: `Transkrip: “${data.transcript}”` });
    applyResult(data);
  } catch {
    hideTyping();
    appendEntry({ role: "system", text: "Voice note gagal dikirim. Coba lagi atau ketik laporan." });
    toast("Voice note gagal dikirim.", "error");
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
const QUICK = [
  { label: "📝 Laporan baru", action: "menu_lapor" },
  { label: "📊 Rekap", action: "menu_recap" },
  { label: "🔔 Follow-up", action: "menu_followup" },
  { label: "⚙️ Pengaturan", action: "menu_settings" },
];
for (const item of QUICK) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "quick-action";
  btn.textContent = item.label;
  btn.addEventListener("click", () => sendMessage(item.action));
  quickActionsEl.appendChild(btn);
}

/* ---------- Side panel toggle ---------- */
const sideEl = el("side");
const sideToggle = el("sideToggle");
function openSide() {
  sideEl.classList.add("open");
  sideToggle.setAttribute("aria-expanded", "true");
}
function closeSide() {
  sideEl.classList.remove("open");
  sideToggle.setAttribute("aria-expanded", "false");
}
sideToggle.addEventListener("click", () => {
  if (sideEl.classList.contains("open")) closeSide();
  else openSide();
});

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
  toast("Sesi baru dimulai.");
});

el("exportBtn").addEventListener("click", downloadCsv);

/* ---------- Boot ---------- */
async function boot(fresh = false) {
  const stored = fresh ? null : loadStored();
  el("headStatus").textContent = "menghubungkan…";
  try {
    const data = await postJson("/api/session", stored ? { token: stored.token } : {});
    state.token = data.token;
    state.profile = data.profile;
    state.notes = data.notes || [];
    state.due = data.due || 0;
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
    el("headStatus").textContent = "offline";
    appendEntry({ role: "system", text: "Tidak bisa menghubungi server. Muat ulang halaman atau coba lagi nanti." });
    toast("Server tidak merespons.", "error");
  }
  updateComposer();
}

boot();
