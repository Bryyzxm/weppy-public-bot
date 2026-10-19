// Read the owner-only usage summary from the deployed Worker.
// Usage: npm run stats            (WORKER_URL and ANALYTICS_ADMIN_TOKEN override)
import { readFile } from "node:fs/promises";

const base = process.env.WORKER_URL || "https://weppy-public-bot.bryyzxm.workers.dev";
const fromEnv = process.env.ANALYTICS_ADMIN_TOKEN || "";
const fromFile = fromEnv ? "" : await readFile(new URL("../.analytics-admin-token", import.meta.url), "utf8").catch(() => "");
const token = (fromEnv || fromFile).trim();
if (!token) throw new Error("No analytics token: set ANALYTICS_ADMIN_TOKEN or write .analytics-admin-token");

const response = await fetch(`${base}/admin/stats`, { headers: { Authorization: `Bearer ${token}` } });
if (!response.ok) throw new Error(`stats request failed: HTTP ${response.status} ${await response.text()}`);
const stats = await response.json();

console.log(`Weppy — pemakaian bot Telegram (${base})`);
console.log(`Data per: ${stats.generated_at}\n`);

const rows = [
  ["Total pernah chat", stats.total_users],
  ["Dari web", stats.web_users],
  ["Aktif <=5 menit", stats.active_users],
  ["Aktif hari ini (WIB)", stats.active_today],
  ["Aktif 7 hari", stats.active_7d],
  ["Aktif 30 hari", stats.active_30d],
  ["Kembali di hari lain", stats.returning_users],
  ["Pernah simpan catatan", stats.note_users],
];
for (const [label, value] of rows) console.log(`${label.padEnd(23)}${String(value).padStart(4)}`);

console.log("\nAktif per hari (WIB, 14 hari terakhir):");
if (!stats.daily_active?.length) {
  console.log("  belum ada aktifitas tercatat");
} else {
  const peak = Math.max(...stats.daily_active.map((entry) => entry.users));
  for (const entry of stats.daily_active) {
    console.log(`  ${entry.day}  ${String(entry.users).padStart(3)}  ${"▇".repeat(Math.max(1, Math.round((entry.users / peak) * 20)))}`);
  }
}
