from __future__ import annotations

import json
from pathlib import Path


ROOT = Path("/Users/anilakbas/Desktop/Hamburg depo stok programı ")
REPORTS = ROOT / "data/reports"
COMPARE_PATH = REPORTS / "stok-kesin-liste-katalog-karsilastirma-2026-04-17.json"


MANUAL_RULES = {
    "Dcb 31": {"action": "merge", "target": "DCB31", "reason": "Ayni urunun tekli yazimi."},
    "Dcb 31 kutlu": {"action": "merge", "target": "DCB31", "reason": "Ayni urunun koli varyanti; ayri kart olmamali."},
    "Dcb 31 kutulu": {"action": "merge", "target": "DCB31", "reason": "Ayni urunun koli varyanti; ayri kart olmamali."},
    "Dcb 31 açık koli": {"action": "merge", "target": "DCB31", "reason": "Ayni urunun acik koli varyanti; stok notu olarak tutulmali."},
    "Dcb 31 100lü koli": {"action": "merge", "target": "DCB31", "reason": "Ayni urun; paket bilgisi stok notu olmali."},
    "R449": {"action": "merge", "target": "Soğutucu Gaz R-449A (10kg)", "reason": "Gaz karti zaten var."},
    "R290": {"action": "merge", "target": "R290 Propan Gazi 6 KG", "reason": "Gaz karti zaten var."},
    "Alkaterhm 30m2 tek fanlı": {"action": "merge", "target": "Alkatherm Kondanser Bataryasi 30 m2", "reason": "Yazim hatali ayni urun ailesi."},
    "Alkaterhm 30 m2": {"action": "merge", "target": "Alkatherm Kondanser Bataryasi 30 m2", "reason": "Yazim hatali ayni urun ailesi."},
    "TE2 068Z3415": {"action": "create", "target": "Danfoss 068Z3415 TE 2 / TES 2", "reason": "Katalogda dogrudan kart yok."},
    "TEN2 068z3348 134 gazlı": {"action": "create", "target": "Danfoss 068Z3348 TEN 2 R134a", "reason": "Katalogda dogrudan kart yok."},
    "Full gauge": {"action": "create", "target": "Full Gauge kontrol cihazi", "reason": "Katalogda dogrudan kart bulunmuyor."},
    "Sarbuz dml 030": {"action": "create", "target": "Sarbuz DML 030 drayer", "reason": "Marka/model bazli ayri kart gerekli."},
    "Frigocraft m012 motorsuz grup": {"action": "create", "target": "Frigocraft M012 motorsuz grup", "reason": "M012 ailesi mevcut katalogda yok."},
    "Frigo Craft M0012 motorsuz": {"action": "create", "target": "Frigocraft M012 motorsuz grup", "reason": "Ayni aile; standart kodla tek kart acilmali."},
    "Frigo Craft M006": {"action": "create", "target": "Frigocraft M006 motorsuz grup", "reason": "Dogrudan kart yok."},
    "Dunli ywf 300 s": {"action": "create", "target": "Dunli YWF 300 S fan motoru", "reason": "Marka/model bazli ayri kart gerekli."},
    "Dunli ywf 350 s": {"action": "create", "target": "Dunli YWF 350 S fan motoru", "reason": "Marka/model bazli ayri kart gerekli."},
    "Sanhua eu21": {"action": "create", "target": "Sanhua EU21", "reason": "Mevcut eslesmeler alakasiz."},
    "Sanhua eu22": {"action": "create", "target": "Sanhua EU22", "reason": "Mevcut eslesmeler alakasiz."},
    "Sanhua eu21 tek fanlı": {"action": "review", "target": "Sanhua EU21", "reason": "EU21 ailesine baglanmali; model teyidi gerekli."},
    "Sanhua eu22 2 fanlı": {"action": "review", "target": "Sanhua EU22", "reason": "EU22 ailesine baglanmali; model teyidi gerekli."},
    "Embraco 6215 gk": {"action": "merge", "target": "Embraco NEU6215GK (R404A)", "reason": "NEU6215GK ana karta baglanmali."},
    "Embraco 6220 gk": {"action": "merge", "target": "Embraco NEU6220GK (R404A)", "reason": "NEU6220GK ana karta baglanmali; NT6220GK degil."},
    "Embraco ff8.5 hbk": {"action": "merge", "target": "Embraco FF 8.5HBK (R134a)", "reason": "Dogru kompresor kartina baglanmali."},
    "Gvn filitre drayer 1/4": {"action": "merge", "target": "Filtre Drier GMH 1/4", "reason": "Ayni urun."},
    "Gvn filitre drayer 3/8": {"action": "merge", "target": "Filtre Drier GMH 3/8", "reason": "Ayni urun."},
    "Drc ex100 elk panosu": {"action": "merge", "target": "Elektrik Panosu EX-100", "reason": "Ayni urun."},
}


def main() -> None:
    data = json.loads(COMPARE_PATH.read_text(encoding="utf-8"))
    rows = data["rows"]

    planned = []
    for row in rows:
        name = row["reference_name"]
        rule = MANUAL_RULES.get(name)
        if rule:
            planned.append(
                {
                    "reference_code": row["reference_code"],
                    "reference_name": name,
                    "stock_total": row["reference_stock_total"],
                    "reference_price_eur": row["reference_price_eur"],
                    "catalog_match": row["match_name"],
                    "catalog_match_price": row["match_visible_price"],
                    "status": row["status"],
                    "action": rule["action"],
                    "target_card": rule["target"],
                    "reason": rule["reason"],
                }
            )

    planned.sort(key=lambda r: (r["action"], r["target_card"], r["reference_name"]))

    out_json = REPORTS / "stok-temizlik-plani-2026-04-17.json"
    out_md = REPORTS / "stok-temizlik-plani-2026-04-17.md"

    out_json.write_text(
        json.dumps(
            {
                "generatedAt": __import__("datetime").datetime.now().isoformat(),
                "items": planned,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    lines = [
        "# Stok Temizlik Plani",
        "",
        f"- Toplam plan kaydi: {len(planned)}",
        f"- Birlestir: {sum(1 for x in planned if x['action'] == 'merge')}",
        f"- Yeni kart ac: {sum(1 for x in planned if x['action'] == 'create')}",
        f"- Manuel inceleme: {sum(1 for x in planned if x['action'] == 'review')}",
        "",
        "## Birlestir",
        "",
    ]
    for item in [x for x in planned if x["action"] == "merge"]:
        lines.append(
            f"- {item['reference_name']} ({item['stock_total']}) -> {item['target_card']} | neden: {item['reason']}"
        )
    lines.extend(["", "## Yeni Kart Ac", ""])
    for item in [x for x in planned if x["action"] == "create"]:
        lines.append(
            f"- {item['reference_name']} ({item['stock_total']}) -> {item['target_card']} | neden: {item['reason']}"
        )
    lines.extend(["", "## Manuel Inceleme", ""])
    for item in [x for x in planned if x["action"] == "review"]:
        lines.append(
            f"- {item['reference_name']} ({item['stock_total']}) -> {item['target_card']} | neden: {item['reason']}"
        )

    out_md.write_text("\n".join(lines), encoding="utf-8")
    print(out_json)
    print(out_md)


if __name__ == "__main__":
    main()
