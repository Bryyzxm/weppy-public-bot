const base = process.env.WORKER_URL || "http://127.0.0.1:8787";

const health = await fetch(`${base}/healthz`);
if (!health.ok || !(await health.json()).ok) throw new Error(`health check failed: ${health.status}`);

const denied = await fetch(`${base}/telegram/webhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ update_id: 9001 }),
});
if (denied.status !== 403) throw new Error(`webhook without secret should return 403, got ${denied.status}`);

console.log("Worker smoke passed: health endpoint and unauthorized webhook rejection.");
