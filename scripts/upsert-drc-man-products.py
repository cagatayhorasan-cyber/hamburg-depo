from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import date
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: upsert-drc-man-products.py <products-json> [drc-man-dir]", file=sys.stderr)
        return 2

    products_path = Path(sys.argv[1]).expanduser().resolve()
    drc_man_dir = Path(sys.argv[2]).expanduser().resolve() if len(sys.argv) >= 3 else Path(
        os.environ.get("DRC_MAN_DIR", "~/Desktop/DRC_MAN")
    ).expanduser().resolve()
    db_path = drc_man_dir / "materials.db"

    rows = json.loads(products_path.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise ValueError("Products JSON must contain a list.")
    if not db_path.exists():
        raise FileNotFoundError(f"DRC MAN database not found: {db_path}")

    today = date.today().isoformat()
    normalized_rows = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        code = str(row.get("kod") or "").strip().upper()
        name = str(row.get("isim") or "").strip()
        if not code or not name:
            continue
        normalized_rows.append(
            {
                "kategori": str(row.get("kategori") or "Hamburg Depo").strip() or "Hamburg Depo",
                "isim": name,
                "kod": code,
                "fiyat": float(row.get("fiyat") or 0),
                "para_birimi": str(row.get("para_birimi") or "EUR").strip().upper() or "EUR",
                "birim": str(row.get("birim") or "adet").strip() or "adet",
                "watt": row.get("watt"),
                "hp": row.get("hp"),
                "boru_capi_inch": str(row.get("boru_capi_inch") or ""),
                "guncelleme_tarihi": today,
                "kaynak_dosya": str(row.get("kaynak_dosya") or "hamburg-live-supabase"),
                "aciklama": str(row.get("aciklama") or "")[:400],
            }
        )

    with sqlite3.connect(db_path) as connection:
        connection.executemany(
            """
            INSERT INTO "Genel_Malzemeler" (
                kategori,
                isim,
                kod,
                fiyat,
                para_birimi,
                birim,
                watt,
                hp,
                boru_capi_inch,
                guncelleme_tarihi,
                kaynak_dosya,
                aciklama
            ) VALUES (
                :kategori,
                :isim,
                :kod,
                :fiyat,
                :para_birimi,
                :birim,
                :watt,
                :hp,
                :boru_capi_inch,
                :guncelleme_tarihi,
                :kaynak_dosya,
                :aciklama
            )
            ON CONFLICT(kod) DO UPDATE SET
                kategori = excluded.kategori,
                isim = excluded.isim,
                fiyat = excluded.fiyat,
                para_birimi = excluded.para_birimi,
                birim = excluded.birim,
                watt = excluded.watt,
                hp = excluded.hp,
                boru_capi_inch = excluded.boru_capi_inch,
                guncelleme_tarihi = excluded.guncelleme_tarihi,
                kaynak_dosya = excluded.kaynak_dosya,
                aciklama = excluded.aciklama
            """,
            normalized_rows,
        )
        source_count = connection.execute(
            'SELECT COUNT(*) FROM "Genel_Malzemeler" WHERE kaynak_dosya = ?',
            ("hamburg-live-supabase",),
        ).fetchone()[0]

    print(
        json.dumps(
            {
                "dbPath": str(db_path),
                "inputRows": len(rows),
                "upsertedRows": len(normalized_rows),
                "hamburgLiveRowsInDrcMan": int(source_count),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
