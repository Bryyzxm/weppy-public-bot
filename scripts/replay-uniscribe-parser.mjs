// Offline replay of live UniScribe captures through production transcribe().
// No provider, Telegram, database or deployment traffic.
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { buildSync } from "esbuild";
const source = fs.readFileSync("src/worker.ts", "utf8");
const bundled = buildSync({ stdin: { contents: `${source}\nexport { transcribe };`, loader: "ts", resolveDir: path.resolve("src") }, bundle: true, write: false, format: "iife", globalName: "WorkerReplay", platform: "neutral", target: "es2022" }).outputFiles[0].text;
const captures = JSON.parse(fs.readFileSync("devpost/kyio-evaluation/uniscribe-results.json", "utf8"));
const records = [];
for (const capture of captures.records) {
  for (const adapter of capture.provider === "kyio_uniscribe" ? ["unchanged_response", "result_text_adapter"] : ["unchanged_response"]) {
    let calls = 0;
    const context = vm.createContext({
      File, FormData,
      fetch: async () => {
        calls += 1;
        if (calls === 1) return { ok: true, json: async () => ({ ok: true, result: { file_path: "synthetic/voice.ogg" } }) };
        if (calls === 2) return { ok: true, arrayBuffer: async () => new ArrayBuffer(128) };
        const payload = adapter === "result_text_adapter" ? { text: capture.response?.result?.text } : capture.response;
        return { ok: capture.http_status === 200, json: async () => payload };
      },
    });
    vm.runInContext(bundled, context);
    const record = { provider: capture.provider, fixture: capture.fixture, adapter, http_status: capture.http_status };
    try {
      record.transcript = await context.WorkerReplay.transcribe({ TELEGRAM_BOT_TOKEN: "synthetic-not-a-credential", GROQ_API_KEY: "synthetic-not-a-credential" }, "synthetic-file-id");
      record.matches_captured_transcript = record.transcript === (capture.transcript ?? "").trim();
      record.nonempty = Boolean(record.transcript);
    } catch (error) {
      record.error = error.message;
    }
    records.push(record);
  }
}
const result = { source: "Unmodified production transcribe() bundled in memory and invoked with saved provider responses", limitations: "Telegram getFile/download are offline test doubles; proves response parser behavior only, not real Telegram integration, media upload, timeout or deployed Worker egress.", records };
fs.writeFileSync("devpost/kyio-evaluation/uniscribe-parser-replay.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
