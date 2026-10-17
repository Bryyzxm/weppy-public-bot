"""Compare synthetic voice-to-report chaining and two production boundary cases.

Run after audio baseline: .venv/bin/python scripts/evaluate-kyio-edges.py
Real provider calls only; no retries, Telegram traffic, deployment or user data.
"""
import datetime as dt
import importlib.util
import json
from pathlib import Path
import time

spec = importlib.util.spec_from_file_location("kyio_benchmark", Path(__file__).with_name("evaluate-kyio.py"))
if spec is None or spec.loader is None:
    raise RuntimeError("Cannot load benchmark helpers")
benchmark = importlib.util.module_from_spec(spec)
spec.loader.exec_module(benchmark)
audio = json.loads((benchmark.OUT / "audio-results.json").read_text())
fixtures = []
for row in audio["records"]:
    if row["fixture"] == "voice-id.ogg":
        fixtures.append(benchmark.case("voice_id_chained", row["transcript"], [["Contoh Nusantara", "perusahaan Contoh Nusantara"], "Sari", "manajer pembelian", "mesin kopi", "Negosiasi", "2026-10-20"]))
    elif row["fixture"] == "voice-en.ogg":
        fixtures.append(benchmark.case("voice_en_chained", row["transcript"], ["Example North Limited", "Alice", "procurement manager", "coffee machines", "Negosiasi", "2026-10-20"]))
long_name = "PT " + "Contoh" * 16
fixtures.append(benchmark.case("field_length_80", f"Institusi persis: {long_name}. Kontak Budi, jabatan pemilik, produk kopi, tahap Deal, follow-up 20 Oktober 2026.", [long_name[:80], "Budi", "pemilik", "kopi", "Deal", "2026-10-20"]))
fixtures.append(benchmark.case("unknown_stage", "Institusi PT Contoh Baru. Kontak Ana. Jabatan pemilik. Produk teh. Tahap tidak diketahui, tidak ada informasi apakah kunjungan, penawaran, negosiasi, deal atau follow-up. Tidak disebutkan jadwal lanjutan.", ["PT Contoh Baru", "Ana", "pemilik", "teh", "", "2026-10-18"]))
report = {"started_at": dt.datetime.now(dt.timezone.utc).isoformat(), "description": "Two actual Groq audio transcripts chained into real report extraction for both providers, plus 80-character and unknown-stage boundaries", "limitations": ["Voice chain starts from real Groq STT, not Kyio STT; cannot prove full Kyio voice replacement.", "Long-field exact truncation is a deliberately stricter check than any possible semantic shortening.", "Kyio uses public q adapter, not paid OpenAI-compatible API."], "fixtures": fixtures, "records": []}
last_started = 0.0
for fixture in fixtures:
    for provider in ["groq", "kyio_public"]:
        if provider == "kyio_public":
            time.sleep(max(0, 25 - (time.monotonic() - last_started)))
            last_started = time.monotonic()
        row = benchmark.execute(provider, fixture)
        report["records"].append(row)
        (benchmark.OUT / "edge-results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(json.dumps({"provider": provider, "case": fixture["id"], "status": row["http_status"], "ms": row["elapsed_ms"], "strict_json": row["score"].get("strict_json"), "mismatches": row["score"].get("mismatches", {})}, ensure_ascii=False), flush=True)
        if row["http_status"] in [401, 403, 429]:
            raise SystemExit("Provider rejected access or quota; stopped without retry")
report["finished_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
report["summary"] = benchmark.summarize(report["records"])
(benchmark.OUT / "edge-results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps(report["summary"], ensure_ascii=False, indent=2), flush=True)
