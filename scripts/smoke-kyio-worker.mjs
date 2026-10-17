// Single real Kyio request from local workerd; no deployed Worker changes.
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import fs from "node:fs";
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true,
  compatibilityDate: "2026-10-14",
  script: `export default { async fetch() {
    const start = performance.now();
    try {
      const url = new URL("https://api.kyio.web.id/api/ai/gpt-5");
      url.searchParams.set("q", 'Synthetic runtime check. Reply only with JSON: {"ok":true}. No markdown.');
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
      return Response.json({ origin: "local workerd", http_status: response.status, elapsed_ms: Math.round(performance.now() - start), content_type: response.headers.get("content-type"), response_text: await response.text() });
    } catch (error) {
      return Response.json({ origin: "local workerd", error_name: error.name, error_message: error.message, elapsed_ms: Math.round(performance.now() - start) }, { status: 502 });
    }
  }};`,
}));
try {
  const response = await mf.dispatchFetch("http://localhost/runtime-smoke");
  const result = await response.json();
  result.scope = "Actual outbound HTTP from locally installed Cloudflare workerd; does not prove deployed edge egress, whitelist, D1, or Telegram operation.";
  fs.writeFileSync("devpost/kyio-evaluation/worker-smoke.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await mf.dispose();
}
