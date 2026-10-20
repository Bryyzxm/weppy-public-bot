/* Weppy landing page locale. English is the default; the toggle persists a choice. */
const STORAGE_KEY = "weppy.landing.lang";
const SUPPORTED = ["en", "id"];

const COPY = {
  en: {
    title: "Weppy: B2B sales pipeline assistant",
    description: "Turn a visit story or voice note into a tidy pipeline note. Try Weppy right in your browser, no install.",
    brandSub: "Sales pipeline assistant",
    brandAria: "Weppy home",
    navAria: "Main navigation",
    toggleLabel: "🇮🇩 Indonesia",
    toggleAria: "Switch to Indonesian",
    telegram: "Telegram",
    navWeb: "Try it on web",
    eyebrow: "B2B sales assistant",
    headline: "From a visit story to a tidy <em>pipeline</em>.",
    lede: "Weppy listens to your visit report, typed or recorded as a voice note, then builds a note with the institution, contact, product, and deal stage. Fields it is unsure about are never invented; you can fill them in or <strong>Skip</strong>.",
    ctaWeb: "Start chatting in the browser",
    ctaTelegram: "Open Telegram bot",
    metaInstall: "No install",
    metaSession: "Per-session data",
    metaRecap: "Recap & CSV",
    previewStatus: "online · instant replies",
    previewReport: "Met Ms Sari at PT Maju Jaya, discussed 100 kg of coffee, requested a quote. Follow up next week.",
    previewCardTitle: "Visit note",
    previewInstitution: "Institution:",
    previewContact: "Contact:",
    previewProduct: "Product:",
    previewStage: "Stage:",
    previewFollowup: "Follow-up: 26 Oct 2026",
    previewAsk: "What is the contact person's role?",
    previewAskHint: "Answer it, or pick ⏭️ Skip.",
    previewAnswer: "Sales manager",
    chipRecap: "Recap",
    chipFollowup: "Follow-up",
    chipCsv: "CSV",
    featuresAria: "What Weppy does",
    featureVoiceTitle: "Text or voice note",
    featureVoiceBody: "Record right in the browser or paste your visit notes. Weppy extracts only the details you actually mentioned.",
    featureSkipTitle: "Clarify with Skip",
    featureSkipBody: "Missing fields are asked one by one. Nothing is invented; you can answer, pick a stage, or Skip.",
    featureRecapTitle: "Recap, follow-up, CSV",
    featureRecapBody: "See the pipeline by stage, check what is due, and download all your notes as CSV any time.",
    noteStrip: "Free best-effort demo: Cloudflare/Groq quotas or provider outages may delay the service. Do not enter sensitive customer data. Web chats are stored in this browser session; the Telegram bot remains the primary path.",
    footerTag: "Weppy · B2B sales pipeline assistant",
    footerStack: "Cloudflare Workers + D1 · Groq",
  },
  id: {
    title: "Weppy: Asisten pipeline sales B2B",
    description: "Ubah cerita atau voice note kunjungan jadi catatan pipeline yang rapi. Coba Weppy langsung di browser tanpa install.",
    brandSub: "Sales pipeline assistant",
    brandAria: "Beranda Weppy",
    navAria: "Navigasi utama",
    toggleLabel: "🇬🇧 English",
    toggleAria: "Ganti ke bahasa Inggris",
    telegram: "Telegram",
    navWeb: "Coba di web",
    eyebrow: "B2B sales assistant",
    headline: "Dari cerita kunjungan jadi <em>pipeline</em> yang rapi.",
    lede: "Weppy mendengar laporan kunjungan, baik teks maupun voice note, lalu menyusun catatan institusi, kontak, produk, dan tahap deal. Field yang belum pasti tidak dikarang; kamu bisa lengkapi atau <strong>Skip</strong>.",
    ctaWeb: "Mulai chat di browser",
    ctaTelegram: "Buka bot Telegram",
    metaInstall: "Tanpa install",
    metaSession: "Data per sesi",
    metaRecap: "Rekap & CSV",
    previewStatus: "online · balas instan",
    previewReport: "Ketemu Bu Sari dari PT Maju Jaya, bahas kopi 100 kg, minta penawaran. Follow-up minggu depan.",
    previewCardTitle: "Catatan kunjungan",
    previewInstitution: "Institusi:",
    previewContact: "Kontak:",
    previewProduct: "Produk:",
    previewStage: "Tahap:",
    previewFollowup: "Follow-up: 26 Okt 2026",
    previewAsk: "Apa role contact person?",
    previewAskHint: "Bisa jawab, atau pilih ⏭️ Skip.",
    previewAnswer: "Sales manager",
    chipRecap: "Rekap",
    chipFollowup: "Follow-up",
    chipCsv: "CSV",
    featuresAria: "Kemampuan Weppy",
    featureVoiceTitle: "Teks atau voice note",
    featureVoiceBody: "Rekam langsung di browser atau tempel catatan kunjungan. Weppy mengekstrak detail yang benar-benar disebut.",
    featureSkipTitle: "Klarifikasi dengan Skip",
    featureSkipBody: "Field yang belum ada ditanyakan satu per satu. Tidak ada data karangan; kamu bisa menjawab, memilih tahap, atau Skip.",
    featureRecapTitle: "Rekap, follow-up, CSV",
    featureRecapBody: "Lihat pipeline per tahap, cek yang jatuh tempo, dan unduh semua catatanmu sebagai CSV kapan saja.",
    noteStrip: "Demo gratis best-effort: kuota Cloudflare/Groq atau gangguan provider dapat menunda layanan. Jangan masukkan data pelanggan sensitif. Percakapan web tersimpan pada sesi browser ini; bot Telegram tetap tersedia sebagai jalur utama.",
    footerTag: "Weppy · asisten pipeline sales B2B",
    footerStack: "Cloudflare Workers + D1 · Groq",
  },
};

function preferredLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED.includes(stored)) return stored;
  } catch {
    /* Storage may be blocked; fall through to the default. */
  }
  return "en";
}

function applyLanguage(language) {
  const copy = COPY[language];
  document.documentElement.lang = language;
  document.title = copy.title;
  document.querySelector('meta[name="description"]').setAttribute("content", copy.description);
  for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = copy[node.dataset.i18n];
  for (const node of document.querySelectorAll("[data-i18n-html]")) node.innerHTML = copy[node.dataset.i18nHtml];
  for (const node of document.querySelectorAll("[data-i18n-attr]")) {
    const [attribute, key] = node.dataset.i18nAttr.split(":");
    node.setAttribute(attribute, copy[key]);
  }
  const toggle = document.getElementById("langToggle");
  const nameEl = toggle.querySelector(".lang-name");
  const codeEl = toggle.querySelector(".lang-code");
  if (nameEl) nameEl.textContent = copy.toggleLabel;
  if (codeEl) codeEl.textContent = language === "en" ? "ID" : "EN";
  toggle.setAttribute("aria-label", copy.toggleAria);
  toggle.dataset.next = language === "en" ? "id" : "en";
}

document.getElementById("langToggle").addEventListener("click", (event) => {
  const next = event.currentTarget.dataset.next || "id";
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* Storage may be blocked; the switch still applies for this page. */
  }
  applyLanguage(next);
});

applyLanguage(preferredLanguage());
