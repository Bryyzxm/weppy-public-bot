"""Evaluate a second publicly documented Kyio chat endpoint with saved fixtures.

Run: .venv/bin/python scripts/evaluate-kyio-alternate.py
No retries, credentials, deployment, or customer data; 10 calls >=25s apart.
"""
import importlib.util
import datetime as dt
import json
import time

from pathlib import Path

spec = importlib.util.spec_from_file_location("kyio_benchmark", Path(__file__).with_name("evaluate-kyio.py"))
if spec is None or spec.loader is None:
    raise RuntimeError("Cannot load benchmark helpers")
benchmark = importlib.util.module_from_spec(spec)
spec.loader.exec_module(benchmark)

benchmark.KYIO_URL = "https://api.kyio.web.id/api/ai/gpt-5"
chosen = [0, 1, 3, 5, 6, 8, 10, 12, 15, 16]
fixtures = [benchmark.CASES[index] for index in chosen]
report = {
    "started_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    "endpoint": benchmark.KYIO_URL,
    "source": "https://api.kyio.web.id/docs/api-keys regular-endpoint example",
    "limitations": ["Public GET q, not authenticated role-separated /v1/chat/completions.", "Diagnostic comparisons use the same production prompt, fixtures and scorer as main evaluation.", "Provider model labels do not verify actual upstream model identity.", "10 attempts, 9 distinct fixtures; not a load/reliability test."],
    "fixtures": fixtures,
    "records": [],
}
last_started = 0.0
for fixture in fixtures:
    time.sleep(max(0, 25 - (time.monotonic() - last_started)))
    last_started = time.monotonic()
    row = benchmark.execute("kyio_public", fixture)
    row["candidate"] = "kyio_gpt5_public"
    report["records"].append(row)
    report["summary"] = benchmark.summarize(report["records"])["kyio_public"]
    (benchmark.OUT / "alternate-results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({"case": fixture["id"], "status": row["http_status"], "ms": row["elapsed_ms"], "strict_json": row["score"].get("strict_json"), "mismatches": row["score"].get("mismatches", {})}, ensure_ascii=False), flush=True)
    if row["http_status"] in [401, 403, 429]:
        break
report["finished_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
report["summary"] = benchmark.summarize(report["records"])["kyio_public"]
(benchmark.OUT / "alternate-results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps(report["summary"], ensure_ascii=False, indent=2), flush=True)
