from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path("/Users/anilakbas/Desktop/Hamburg depo stok programı ")
REPORTS = ROOT / "data/reports"

MASTER_PATH = REPORTS / "kaynak-dokuman-konsolide-2026-04-17.json"
MASTER_CODES_PATH = REPORTS / "kaynak-dokuman-kod-master-2026-04-17.json"


PRICE_SOURCE_PRIORITY = [
    "ENDÜSTRİYEL SPLİT FİYAT LİSTESİ-2025-REV1.xlsx",
    "fiyat_listesi.xlsx",
    "DANFOSS HERMETİK SERİ-2025.xlsx",
    "DANFOSS SCROLL FRİGOCRAFT SERİ-2025.xlsx",
    "DANFOSS SCROLL FRİGOCRAFT  SESSİZ SERİ-2025.xlsx",
    "DANFOSS SCROLL MERKEZİ FİYAT LİSTESİ-2025.xlsx",
    "STANDART EVAP. FİYAT LİSTESİ-2025.xlsx",
    "YARI HERMETİK ŞOK CİHAZ SERİSİ -2025.xlsx",
    "yeni_liste.xlsx",
    "Kondenser Ünitesi Fiyat Listesi v1.3.pdf",
    "cantas_products.xlsx",
    "cantas_products.csv",
    "turkiye-fiyat-listesi.xlsx",
]

NAME_SOURCE_PRIORITY = [
    "ENDÜSTRİYEL SPLİT FİYAT LİSTESİ-2025-REV1.xlsx",
    "DANFOSS HERMETİK SERİ-2025.xlsx",
    "DANFOSS SCROLL FRİGOCRAFT SERİ-2025.xlsx",
    "DANFOSS SCROLL FRİGOCRAFT  SESSİZ SERİ-2025.xlsx",
    "STANDART EVAP. FİYAT LİSTESİ-2025.xlsx",
    "YARI HERMETİK ŞOK CİHAZ SERİSİ -2025.xlsx",
    "yeni_liste.xlsx",
    "Kondenser Ünitesi Fiyat Listesi v1.3.pdf",
    "cantas_products.xlsx",
    "Hamburg_Stok_Listesi_Full_Final_v2.xlsx",
    "Hamburg_Stok_Listesi_TekSayfa.xlsx",
]


def clean_text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def is_numeric_name(value: str) -> bool:
    value = clean_text(value)
    return bool(value) and re.fullmatch(r"[\d.,]+", value) is not None


def source_rank(source_name: str, ordering: list[str]) -> int:
    try:
        return ordering.index(source_name)
    except ValueError:
        return len(ordering) + 100


def name_score(name: str) -> tuple[int, int]:
    name = clean_text(name)
    if not name:
        return (999, 999)
    penalty = 0
    if is_numeric_name(name):
        penalty += 200
    if "Split Cihaz İç Ünitesi" in name or "Split Ch" in name or "Kontrol Ünitesi" in name:
        penalty -= 20
    return (penalty, -len(name))


data = json.loads(MASTER_PATH.read_text())
master_codes = json.loads(MASTER_CODES_PATH.read_text())

records_by_code = {}
for row in data["records"]:
    records_by_code.setdefault(row["code"], []).append(row)

canonical_rows = []
uncertain_rows = []

for master in master_codes["rows"]:
    code = master["code"]
    records = records_by_code.get(code, [])

    name_candidates = []
    price_candidates = []
    stock_rows = []
    for r in records:
        pname = clean_text(r.get("product_name"))
        if pname:
            name_candidates.append(
                {
                    "value": pname,
                    "source_name": r["source_name"],
                    "source_sheet": r.get("source_sheet", ""),
                    "score": (source_rank(r["source_name"], NAME_SOURCE_PRIORITY),) + name_score(pname),
                }
            )
        if r.get("price_eur") is not None:
            price_candidates.append(
                {
                    "value": round(float(r["price_eur"]), 4),
                    "source_name": r["source_name"],
                    "source_sheet": r.get("source_sheet", ""),
                    "score": source_rank(r["source_name"], PRICE_SOURCE_PRIORITY),
                }
            )
        if r.get("stock_quantity") is not None:
            stock_rows.append(
                {
                    "qty": r["stock_quantity"],
                    "unit": clean_text(r.get("stock_unit")),
                    "source_name": r["source_name"],
                }
            )

    name_candidates.sort(key=lambda x: x["score"])
    price_candidates.sort(key=lambda x: (x["score"], x["value"]))

    canonical_name = name_candidates[0]["value"] if name_candidates else (master["names"][0] if master["names"] else "")
    canonical_name_source = name_candidates[0]["source_name"] if name_candidates else ""
    canonical_price = price_candidates[0]["value"] if price_candidates else None
    canonical_price_source = price_candidates[0]["source_name"] if price_candidates else ""

    canonical = {
        "code": code,
        "canonical_name": canonical_name,
        "canonical_name_source": canonical_name_source,
        "brand": master["brands"][0] if master["brands"] else "",
        "category": master["categories"][0] if master["categories"] else "",
        "roles": master["roles"],
        "canonical_price_eur": canonical_price,
        "canonical_price_source": canonical_price_source,
        "all_prices": master["prices"],
        "capacity_w": master["capacities"][0] if len(master["capacities"]) == 1 else None,
        "all_capacities": master["capacities"],
        "refrigerants": master["refrigerants"],
        "stock_rows": stock_rows,
        "stock_total": round(sum(float(s["qty"]) for s in stock_rows), 4) if stock_rows else None,
        "stock_sources": sorted({s["source_name"] for s in stock_rows}),
        "source_files": master["source_files"],
        "name_variants": master["names"],
        "record_count": master["record_count"],
    }
    canonical_rows.append(canonical)

    if len(master["prices"]) > 1 or len(master["names"]) > 2 or len(master["capacities"]) > 1:
        uncertain_rows.append(
            {
                "code": code,
                "canonical_name": canonical_name,
                "canonical_price_eur": canonical_price,
                "all_prices": master["prices"],
                "all_capacities": master["capacities"],
                "name_variants": master["names"],
                "source_files": master["source_files"],
            }
        )


canonical_rows.sort(key=lambda r: (r["brand"], r["canonical_name"], r["code"]))
uncertain_rows.sort(key=lambda r: (len(r["all_prices"]), len(r["name_variants"]), r["code"]), reverse=True)

canonical_json = REPORTS / "kesin-referans-kod-listesi-2026-04-17.json"
canonical_csv = REPORTS / "kesin-referans-kod-listesi-2026-04-17.csv"
stock_json = REPORTS / "stok-eslesmeli-kesin-liste-2026-04-17.json"
uncertain_json = REPORTS / "referans-belirsiz-kodlar-2026-04-17.json"
summary_md = REPORTS / "kesin-referans-ozet-2026-04-17.md"

canonical_json.write_text(
    json.dumps(
        {
            "generatedAt": __import__("datetime").datetime.now().isoformat(),
            "totalCodes": len(canonical_rows),
            "rows": canonical_rows,
        },
        ensure_ascii=False,
        indent=2,
    )
)

import csv

csv_cols = [
    "code",
    "canonical_name",
    "brand",
    "category",
    "canonical_price_eur",
    "capacity_w",
    "roles",
    "refrigerants",
    "stock_total",
    "stock_sources",
    "source_files",
]
with canonical_csv.open("w", newline="", encoding="utf-8") as fh:
    writer = csv.DictWriter(fh, fieldnames=csv_cols)
    writer.writeheader()
    for row in canonical_rows:
        writer.writerow(
            {
                "code": row["code"],
                "canonical_name": row["canonical_name"],
                "brand": row["brand"],
                "category": row["category"],
                "canonical_price_eur": row["canonical_price_eur"],
                "capacity_w": row["capacity_w"],
                "roles": ", ".join(row["roles"]),
                "refrigerants": ", ".join(row["refrigerants"]),
                "stock_total": row["stock_total"],
                "stock_sources": ", ".join(row["stock_sources"]),
                "source_files": ", ".join(row["source_files"]),
            }
        )

stock_rows = [row for row in canonical_rows if row["stock_rows"]]
stock_json.write_text(
    json.dumps(
        {
            "generatedAt": __import__("datetime").datetime.now().isoformat(),
            "totalStockMatched": len(stock_rows),
            "rows": stock_rows,
        },
        ensure_ascii=False,
        indent=2,
    )
)

uncertain_json.write_text(
    json.dumps(
        {
            "generatedAt": __import__("datetime").datetime.now().isoformat(),
            "totalUncertain": len(uncertain_rows),
            "rows": uncertain_rows,
        },
        ensure_ascii=False,
        indent=2,
    )
)

summary = [
    "# Kesin Referans Ozet",
    "",
    f"- Toplam kanonik kod: {len(canonical_rows)}",
    f"- Stokla eslesen kod: {len(stock_rows)}",
    f"- Belirsiz inceleme gereken kod: {len(uncertain_rows)}",
    "",
    "## Ornek Kanonik Kodlar",
    "",
]
for row in canonical_rows[:30]:
    summary.append(
        f"- {row['code']} | {row['canonical_name']} | fiyat: {row['canonical_price_eur']} | stok: {row['stock_total']}"
    )
summary.extend(["", "## Belirsiz Kodlar", ""])
for row in uncertain_rows[:30]:
    summary.append(
        f"- {row['code']} | fiyatlar: {row['all_prices']} | isimler: {row['name_variants'][:4]}"
    )
summary_md.write_text("\n".join(summary), encoding="utf-8")

print(
    json.dumps(
        {
            "totalCodes": len(canonical_rows),
            "stockMatched": len(stock_rows),
            "uncertain": len(uncertain_rows),
            "canonicalJson": str(canonical_json),
            "canonicalCsv": str(canonical_csv),
            "stockJson": str(stock_json),
            "uncertainJson": str(uncertain_json),
            "summaryMd": str(summary_md),
        },
        ensure_ascii=False,
        indent=2,
    )
)
