// Replay real saved provider responses through the bundled production extractReport.
// No network, database, Telegram traffic, deployment, or production source edits.
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { buildSync } from "esbuild";

const source = fs.readFileSync("src/worker.ts", "utf8");
// Expose an existing function only in this in-memory bundle; source is unchanged.
const compiled = buildSync({
  stdin: { contents: `${source}\nexport { extractReport };`, loader: "ts", resolveDir: path.resolve("src") },
  bundle: true, write: false, format: "iife", globalName: "WorkerEvaluation", platform: "neutral", target: "es2022",
}).outputFiles[0].text;
const captures = ["chat-results.json", "edge-results.json", "alternate-results.json"].filter((name) => fs.existsSync(`devpost/kyio-evaluation/${name}`));
const records = [];
const normalize = (value) => value.trim().replace(/\.+$/, "").replace(/\s+/g, " ").toLocaleLowerCase("en-US");
for (const file of captures) {
  const captureSet = JSON.parse(fs.readFileSync(`devpost/kyio-evaluation/${file}`, "utf8"));
  if (!captureSet.finished_at) throw new Error(`Capture is still running: ${file}`);
  const fixtures = new Map(captureSet.fixtures.map((fixture) => [fixture.id, fixture]));
  for (const capture of captureSet.records) {
    const fixture = fixtures.get(capture.case);
    const today = fixture.today;
    class FixtureDate extends Date {
      constructor(...args) { super(...(args.length ? args : [`${today}T05:00:00Z`])); }
    }
    for (const adapter of capture.provider === "groq" ? ["unchanged"] : ["unchanged", "envelope_only", "envelope_and_markdown_strip", "envelope_and_fenced_object"]) {
      let payload = capture.response;
      if (adapter !== "unchanged") {
        let content = capture.content ?? "";
        if (adapter === "envelope_and_markdown_strip") content = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        if (adapter === "envelope_and_fenced_object") content = content.match(/^\s*```(?:json)?\s*\n([\s\S]*?)\n```/i)?.[1] ?? content;
        payload = { choices: [{ message: { content } }] };
      }
      const context = vm.createContext({ Date: FixtureDate, fetch: async () => ({ ok: capture.http_status === 200, json: async () => payload }) });
      vm.runInContext(compiled, context);
      const record = { capture_file: file, provider: file === "alternate-results.json" ? "kyio_gpt5_public" : capture.provider, case: capture.case, adapter, parser_accepts: false };
      try {
        record.note = await context.WorkerEvaluation.extractReport({ GROQ_API_KEY: "replay-not-a-credential" }, fixture.report);
        record.parser_accepts = true;
        record.production_note_checks = Object.fromEntries(Object.entries(fixture.expected).map(([key, expected]) => {
          const options = Array.isArray(expected) ? expected : [expected];
          const actual = record.note[key];
          return [key, typeof actual === "string" && options.some((option) => normalize(actual) === normalize(option))];
        }));
        record.production_note_mismatches = Object.fromEntries(Object.entries(record.production_note_checks).filter(([, correct]) => !correct).map(([key]) => [key, { expected: fixture.expected[key], actual: record.note[key] }]));
      } catch (error) {
        record.error = error.message;
      }
      records.push(record);
    }
  }
}
const summary = {};
for (const record of records) {
  const key = `${record.provider}:${record.adapter}`;
  const group = summary[key] ??= { attempts: 0, accepted: 0 };
  group.attempts += 1;
  group.accepted += Number(record.parser_accepts);
}
const correctnessSummary = {};
for (const record of records) {
  const key = `${record.provider}:${record.adapter}`;
  const group = correctnessSummary[key] ??= { attempts: 0, accepted: 0, correct_reports: 0, correct_fields: 0, mismatches: [] };
  group.attempts += 1;
  if (!record.parser_accepts) continue;
  group.accepted += 1;
  group.correct_reports += Number(Object.values(record.production_note_checks).every(Boolean));
  group.correct_fields += Object.values(record.production_note_checks).filter(Boolean).length;
  if (Object.keys(record.production_note_mismatches).length) group.mismatches.push({ case: record.case, values: record.production_note_mismatches });
}
const output = { source: "src/worker.ts actual entire module bundled in memory with esbuild; existing extractReport exported only in memory", replay_only: true, note: "Validates production parser with live saved responses, not Worker egress, D1 or Telegram. Diagnostic adapters are not production changes. FixtureDate freezes Jakarta date to each fixture.", summary, correctness_summary: correctnessSummary, records };
fs.writeFileSync("devpost/kyio-evaluation/parser-replay.json", JSON.stringify(output, null, 2));
console.log(JSON.stringify(summary, null, 2));
