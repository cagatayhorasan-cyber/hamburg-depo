from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path


ROOT = Path("/Users/anilakbas/Desktop/Hamburg depo stok programı ")
REPORTS = ROOT / "data/reports"
CATALOG_PATH = ROOT / "public/shared-admin-catalog.json"
REFERENCE_PATH = REPORTS / "stok-eslesmeli-kesin-liste-2026-04-17.json"


def normalize(value: str) -> str:
    value = str(value or "").lower()
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.replace('"', " ").replace("'", " ")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def shared_catalog_items(raw):
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        return raw.get("items") or raw.get("products") or next((v for v in raw.values() if isinstance(v, list)), [])
    return []


def tokenize(text: str) -> set[str]:
    return {tok for tok in normalize(text).split() if tok and tok not in {"split", "cihaz", "ic", "dis", "unitesi", "unitesi", "adet"}}


with open(CATALOG_PATH, "r", encoding="utf-8") as fh:
    catalog = shared_catalog_items(json.load(fh))
with open(REFERENCE_PATH, "r", encoding="utf-8") as fh:
    reference = json.load(fh)["rows"]

catalog_index = []
for item in catalog:
    name = item.get("name", "")
    brand = item.get("brand", "")
    code = item.get("productCode") or item.get("barcode") or ""
    codes = item.get("codes") or []
    search_blob = " ".join([name, brand, code, *codes])
    catalog_index.append(
        {
            "name": name,
            "brand": brand,
            "category": item.get("category", ""),
            "visiblePrice": item.get("visiblePrice"),
            "productCode": item.get("productCode", ""),
            "barcode": item.get("barcode", ""),
            "codes": codes,
            "norm": normalize(search_blob),
            "tokens": tokenize(search_blob),
        }
    )

def compact_text(text: str) -> str:
    return normalize(text).replace(" ", "")


matches = []
for row in reference:
    query = row["canonical_name"] or row["code"]
    brand = row.get("brand", "")
    qnorm = normalize(" ".join([query, brand, row["code"]]))
    qcompact = compact_text(" ".join([query, brand, row["code"]]))
    qtokens = tokenize(" ".join([query, brand, row["code"]]))

    best = None
    for item in catalog_index:
        overlap = len(qtokens & item["tokens"])
        containment = 1.0 if qcompact and (qcompact in item["norm"].replace(" ", "") or item["norm"].replace(" ", "") in qcompact) else 0.0
        token_base = overlap / max(len(qtokens), 1)
        score = (token_base * 0.65) + (containment * 0.2)
        if brand and normalize(brand) and normalize(brand) in item["norm"]:
            score += 0.1
        if normalize(row["code"]) and normalize(row["code"]) in item["norm"]:
            score += 0.35
        if item["name"] and normalize(item["name"]) == normalize(query):
            score += 0.2
        if best is None or score > best["score"]:
            best = {"item": item, "score": score, "overlap": overlap, "containment": containment}

    status = "eksik"
    if best:
        if best["score"] >= 0.92 or (best["overlap"] >= 3 and best["containment"] > 0):
            status = "tam"
        elif best["score"] >= 0.72 or best["overlap"] >= 2:
            status = "yakin"

    matches.append(
        {
            "reference_code": row["code"],
            "reference_name": row["canonical_name"],
            "reference_brand": row.get("brand", ""),
            "reference_price_eur": row.get("canonical_price_eur"),
            "reference_stock_total": row.get("stock_total"),
            "status": status,
            "match_score": round(best["score"], 4) if best else 0,
            "match_name": best["item"]["name"] if best else "",
            "match_brand": best["item"]["brand"] if best else "",
            "match_category": best["item"]["category"] if best else "",
            "match_visible_price": best["item"]["visiblePrice"] if best else None,
            "match_barcode": best["item"]["barcode"] if best else "",
            "match_productCode": best["item"]["productCode"] if best else "",
        }
    )

summary = {
    "tam": sum(1 for r in matches if r["status"] == "tam"),
    "yakin": sum(1 for r in matches if r["status"] == "yakin"),
    "eksik": sum(1 for r in matches if r["status"] == "eksik"),
}

matches.sort(key=lambda r: (r["status"], -r["match_score"], r["reference_name"]))

json_path = REPORTS / "stok-kesin-liste-katalog-karsilastirma-2026-04-17.json"
csv_path = REPORTS / "stok-kesin-liste-katalog-karsilastirma-2026-04-17.csv"
md_path = REPORTS / "stok-kesin-liste-katalog-karsilastirma-ozet-2026-04-17.md"

json_path.write_text(
    json.dumps(
        {
            "generatedAt": __import__("datetime").datetime.now().isoformat(),
            "total": len(matches),
            "summary": summary,
            "rows": matches,
        },
        ensure_ascii=False,
        indent=2,
    )
)

import csv

cols = [
    "status",
    "reference_code",
    "reference_name",
    "reference_brand",
    "reference_price_eur",
    "reference_stock_total",
    "match_score",
    "match_name",
    "match_brand",
    "match_category",
    "match_visible_price",
    "match_barcode",
    "match_productCode",
]
with csv_path.open("w", newline="", encoding="utf-8") as fh:
    writer = csv.DictWriter(fh, fieldnames=cols)
    writer.writeheader()
    writer.writerows(matches)

lines = [
    "# Stok Kesin Liste / Katalog Karsilastirma Ozeti",
    "",
    f"- Toplam referans stok kaydi: {len(matches)}",
    f"- Tam eslesme: {summary['tam']}",
    f"- Yakin eslesme: {summary['yakin']}",
    f"- Eksik kart: {summary['eksik']}",
    "",
    "## Eksik Kartlar",
    "",
]
for row in [r for r in matches if r["status"] == "eksik"][:60]:
    lines.append(f"- {row['reference_code']} | {row['reference_name']} | stok: {row['reference_stock_total']}")
lines.extend(["", "## Yakin Eslesmeler", ""])
for row in [r for r in matches if r["status"] == "yakin"][:60]:
    lines.append(f"- {row['reference_code']} | {row['reference_name']} => {row['match_name']} | skor: {row['match_score']}")
md_path.write_text("\n".join(lines), encoding="utf-8")

print(
    json.dumps(
        {
            "total": len(matches),
            "summary": summary,
            "jsonPath": str(json_path),
            "csvPath": str(csv_path),
            "mdPath": str(md_path),
        },
        ensure_ascii=False,
        indent=2,
    )
)
