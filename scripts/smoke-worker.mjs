const base = process.env.WORKER_URL || "http://127.0.0.1:8787";

const health = await fetch(`${base}/healthz`);
if (!health.ok || !(await health.json()).ok) throw new Error(`health check failed: ${health.status}`);

const denied = await fetch(`${base}/telegram/webhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ update_id: 9001 }),
});
if (denied.status !== 403) throw new Error(`webhook without secret should return 403, got ${denied.status}`);

for (const path of ["/", "/app", "/styles.css", "/app.js"]) {
  const page = await fetch(`${base}${path}`);
  if (!page.ok) throw new Error(`${path} should be served, got ${page.status}`);
}

const session = await fetch(`${base}/api/session`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({}),
});
if (!session.ok) throw new Error(`web session should start, got ${session.status}`);
const body = await session.json();
if (!/^[A-Za-z0-9_-]{16,64}$/.test(body.token || "")) throw new Error("web session returned no usable token");
if (!Array.isArray(body.messages) || body.messages.length === 0) throw new Error("web session returned no onboarding messages");

const badToken = await fetch(`${base}/api/export`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ token: "short" }),
});
if (badToken.status !== 400) throw new Error(`short export token should be rejected, got ${badToken.status}`);

console.log("Worker smoke passed: health, unauthorized webhook rejection, web pages, web session and export guard.");
