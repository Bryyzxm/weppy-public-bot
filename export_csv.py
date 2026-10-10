"""Ekspor catatan pipeline ke CSV (slice 12).

Spec refs: Data Model (data/notes.json) — CSV adalah tampilan baca-saja
dari array yang sama, tanpa mengubah skema. Dipakai perintah chat
`ekspor csv` / `export csv` + tombol menu Ekspor.

Kolom stabil sesuai keys notes.json agar bisa dibuka di Excel/Sheets:
id, created_at, institusi, kontak, role, produk, tahap_deal,
followup_date, status.
"""

from __future__ import annotations

import csv
import io

CSV_HEADER = [
    "id",
    "created_at",
    "institusi",
    "kontak",
    "role",
    "produk",
    "tahap_deal",
    "followup_date",
    "status",
]

CSV_FILENAME = "catatan-pipeline.csv"


def notes_to_csv_text(notes: list) -> str:
    """Array notes -> teks CSV (header + baris, newline \\n)."""
    buf = io.StringIO(newline="")
    writer = csv.DictWriter(
        buf, fieldnames=CSV_HEADER, extrasaction="ignore", lineterminator="\n"
    )
    writer.writeheader()
    for n in notes or []:
        writer.writerow({k: (n.get(k, "") or "") for k in CSV_HEADER})
    return buf.getvalue()


def notes_to_csv_bytes(notes: list) -> bytes:
    """Teks CSV -> bytes utf-8-sig (BOM) agar Excel Indonesia langsung rapi."""
    return notes_to_csv_text(notes).encode("utf-8-sig")


def write_notes_csv(notes: list, path) -> None:
    """Tulis CSV ke path (dipakai verifikasi manual / unduh lokal)."""
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        f.write(notes_to_csv_text(notes))
