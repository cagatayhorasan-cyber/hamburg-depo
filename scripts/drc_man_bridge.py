from __future__ import annotations

import json
import os
import re
import shutil
import sys
import tempfile
import unicodedata
from pathlib import Path


CONSULT_HINTS = (
    "panel",
    "kapi",
    "kapı",
    "kompresor",
    "kompresör",
    "evaporator",
    "evaporatör",
    "valf",
    "kontrol",
    "split",
    "montaj",
    "danisman",
    "danışman",
    "hangi malzeme",
    "kritik malzeme",
)

FAQ_FILES = [
    Path(__file__).with_name("drc_man_product_faq.json"),
    Path(__file__).with_name("drc_man_training_faq.json"),
    Path(__file__).with_name("drc_man_pt_superheat_faq.json"),
    Path(__file__).with_name("drc_man_master_field_faq.json"),
    Path(__file__).with_name("drc_man_master_components_faq.json"),
    Path(__file__).with_name("drc_man_troubleshooting_faq.json"),
    Path(__file__).with_name("drc_man_electrical_faq.json"),
    Path(__file__).with_name("drc_man_refrigeration_faq.json"),
    Path(__file__).with_name("drc_man_gases_faq.json"),
]

FAQ_CACHE: dict[tuple[str, ...], dict[str, object]] = {}

SCENARIO_HINTS = (
    "ariza",
    "arıza",
    "senaryo",
    "sorun",
    "hata",
    "alarm",
    "neden",
    "niye",
    "why",
    "stoerung",
    "störung",
    "problem",
    "fault",
    "kompresor",
    "kompresör",
    "basinc",
    "basınç",
    "pressure",
    "defrost",
    "buz",
    "ice",
    "voltaj",
    "spannung",
    "kontaktor",
    "schuetz",
    "magnetventil",
    "solenoid",
    "txv",
    "tev",
)

PT_CONCEPT_HINTS = (
    "pt",
    "superheat",
    "subcool",
    "bubble",
    "dew",
    "saturation",
    "sattigung",
    "doyma sicakligi",
    "sattemperature",
)

MASTER_FIELD_HINTS = (
    "yag donusu",
    "oelrueck",
    "oil return",
    "suction line",
    "saugleitung",
    "boru capi",
    "oelfalle",
    "trap",
    "crankcase",
    "kurbelgehaeuse",
    "pump down",
    "pump-down",
    "head pressure",
    "hochdruckregelung",
    "low ambient",
    "kis calisma",
    "winterbetrieb",
    "defrost araligi",
    "abtautakt",
    "fan delay",
    "drain heater",
    "ablaufheizung",
    "kapi rezistansi",
    "tuerheizung",
    "sensor yeri",
    "probe yerlesimi",
    "fuehler",
    "kompresor koruma zinciri",
    "schutzkette",
    "devreye alma",
    "inbetriebnahme",
    "vibrasyon",
    "rohrabstuetzung",
    "nitrojen",
    "stickstoff",
)

MASTER_COMPONENT_HINTS = (
    "kompresor valf",
    "verdichterventil",
    "scroll",
    "piston",
    "sivi vur",
    "floodback",
    "slugging",
    "basma sicakligi",
    "druckgas",
    "contactor",
    "kontaktor",
    "schuetz",
    "presostat",
    "druckschalter",
    "low pressure switch",
    "high pressure switch",
    "hp switch",
    "lp switch",
    "phase sequence",
    "faz sirasi",
    "phase loss",
    "faz eksik",
    "txv",
    "tev",
    "genlesme valfi",
    "expansionsventil",
    "equalizer",
    "ampul",
    "bulb",
    "hunting",
    "avlaniyor",
    "coil voltage",
    "bobin gerilimi",
    "panel ariza",
    "pano ariza",
)

FOLLOW_UP_PATTERNS = {
    "tr": [
        "basma",
        "emis",
        "suction",
        "superheat",
        "subcool",
        "voltaj",
        "akim",
        "termik",
        "fan",
        "defrost",
        "kapi",
        "kapı",
        "buz",
        "evaporator",
        "kompresor",
        "kompresör",
    ],
    "de": [
        "hochdruck",
        "niederdruck",
        "saug",
        "druck",
        "spannung",
        "strom",
        "abtau",
        "ventilator",
        "tuer",
        "eis",
        "verdichter",
        "superheat",
        "subcool",
    ],
}

SCENARIO_FACTS = [
    (("yuksek basinc", "high pressure", "hochdruck"), {"tr": "yuksek basinç goruluyor", "de": "hochdruck wird beobachtet"}),
    (("dusuk basinc", "low pressure", "niederdruck"), {"tr": "dusuk basinç goruluyor", "de": "niederdruck wird beobachtet"}),
    (("buz", "icing", "vereis", "ice"), {"tr": "buzlanma veya buz geri geliyor", "de": "vereisung oder schnelles Rueckkommen von Eis ist sichtbar"}),
    (("defrost", "abtau"), {"tr": "defrost davranisi supheli", "de": "die abtauung wirkt verdaechtig"}),
    (("fan", "ventilator"), {"tr": "fan veya hava akisinda suphe var", "de": "es gibt einen Verdacht auf Ventilator- oder Luftstromproblem"}),
    (("kapi", "kapı", "tuer"), {"tr": "kapi kacagi veya kapi kullanimi etkili olabilir", "de": "Tuerleckage oder Tuernutzung kann mitwirken"}),
    (("voltaj", "spannung", "faz eksik", "faz sirasi", "phase"), {"tr": "enerji kalitesi veya elektrik beslemesi sorgulanmali", "de": "Energiequalitaet oder Einspeisung sollte geprueft werden"}),
    (("kontaktor", "schuetz", "termik", "motorschutz"), {"tr": "kumanda ve koruma zinciri etkilenmis olabilir", "de": "Schalt- und Schutzkette kann betroffen sein"}),
    (("solenoid", "magnetventil", "pump down"), {"tr": "solenoid veya pump-down sirasi sorgulanmali", "de": "Magnetventil oder Pump-Down-Sequenz sollte geprueft werden"}),
    (("txv", "tev", "genlesme valfi", "expansionsventil"), {"tr": "genlesme valfi veya besleme mantigi etkili olabilir", "de": "Expansionsventil oder Einspeiselogik kann die Ursache sein"}),
    (("kompresor", "kompresör", "verdichter"), {"tr": "kompresor davranisi semptomun merkezinde olabilir", "de": "das Verdichterverhalten kann zentral fuer das Fehlerbild sein"}),
]

GAS_COMPARE_HINTS = (
    "fark",
    "farki",
    "karsilastir",
    "karsilastirma",
    "vs",
    "versus",
    "compare",
    "vergleich",
    "unterschied",
)
GAS_SELECTION_HINTS = (
    "hangi gaz",
    "hangi sogutucu",
    "hangi kaeltemittel",
    "welches kaeltemittel",
    "uygun gaz",
    "secim",
    "auswahl",
    "suitable",
    "passend",
    "passt",
    "passt fuer",
)
GAS_RETROFIT_HINTS = ("retrofit", "yerine", "alternatif", "replace", "replacement", "ersatz", "statt", "umru bitti", "degistir")

PROMPT_ATTACK_PHRASES = (
    "system prompt",
    "developer prompt",
    "developer message",
    "developer instructions",
    "internal instructions",
    "hidden prompt",
    "hidden instructions",
    "ignore previous instructions",
    "ignore all previous instructions",
    "ignore system instructions",
    "bypass safety",
    "jailbreak",
    "chain of thought",
    "internal reasoning",
    "raw prompt",
    "prompt injection",
    "sistem talimati",
    "gizli talimat",
    "gelistirici mesaji",
)

RAW_ACCESS_HINTS = (
    "sql dump",
    "database dump",
    "raw database",
    "ham veri",
    "tum veritabani",
    "all users",
    "kullanici listesi",
    "musteri listesi",
    "source code",
    "kaynak kod",
    "server/app.js",
    "server/db.js",
    "drc_man_bridge.py",
    "package.json",
    "terminal output",
    "loglari goster",
    "backup dosyasi",
)

CUSTOMER_INTERNAL_HINTS = (
    "alis",
    "maliyet",
    "einkauf",
    "einkaufspreis",
    "purchase",
    "cost",
    "kar marj",
    "profit margin",
    "margin",
    "marj",
    "stok degeri",
    "stock value",
    "kasa",
    "cashbook",
    "masraf",
    "expense",
    "tedarikci",
    "supplier",
    "tum siparis",
    "all orders",
    "baska musteri",
    "other customer",
    "kullanici listesi",
    "musteri listesi",
    "internal note",
    "ic not",
    "internal data",
)

STAFF_INTERNAL_HINTS = (
    "alis",
    "maliyet",
    "einkauf",
    "einkaufspreis",
    "purchase",
    "cost",
    "kar marj",
    "profit margin",
    "margin",
    "marj",
    "stok degeri",
    "stock value",
    "tum kullanici",
    "all users",
    "musteri listesi",
    "user list",
    "admin sifresi",
    "password list",
    "sifre listesi",
    "database url",
    "database_url",
    "session secret",
    "jwt secret",
    "api key",
    "private key",
    "ssh key",
)

GAS_PROFILES = {
    "r134a": {
        "aliases": ("r134a", "134a"),
        "tr_label": "R134a",
        "de_label": "R134a",
        "safety_tr": "A1; servis kolay ama yeni projede cevre baskisi dusunulur",
        "safety_de": "A1; servicefreundlich, aber bei neuen Projekten oekologisch kritisch zu bewerten",
        "pressure_tr": "orta basinc karakteri",
        "pressure_de": "mittleres Druckniveau",
        "use_tr": "arti muhafaza ve belirli legacy orta sicaklik projeleri",
        "use_de": "Pluskuehlung und bestimmte mittlere Bestandsanwendungen",
        "retrofit_tr": "mevcut sistemde kompresor, yag ve hedefe gore yeniden dusunulur; tek evrensel yerine gecen yoktur",
        "retrofit_de": "im Bestand nach Verdichter, Oel und Ziel neu zu bewerten; kein universeller 1:1-Ersatz",
    },
    "r404a": {
        "aliases": ("r404a", "404a"),
        "tr_label": "R404A",
        "de_label": "R404A",
        "safety_tr": "A1; legacy dusuk sicaklik referansi",
        "safety_de": "A1; klassischer Referenzstoff fuer Tiefkuehlung im Bestand",
        "pressure_tr": "negatifte tanidik ama cevresel baskisi yuksek bir karakter",
        "pressure_de": "bekanntes Tieftemperaturverhalten, aber oekologisch belastet",
        "use_tr": "negatif depo ve eski sok/derin sogutma sistemleri",
        "use_de": "Tiefkuehlraeume und aeltere Schock-/Tiefkuehlanlagen",
        "retrofit_tr": "bugun daha cok yerine aday gaz seciminin cikis noktasi olarak kullanilir",
        "retrofit_de": "heute oft eher Ausgangspunkt fuer Retrofit-Entscheidungen als Wunschziel",
    },
    "r448a": {
        "aliases": ("r448a", "448a"),
        "tr_label": "R448A",
        "de_label": "R448A",
        "safety_tr": "A1; alternatif karisim gaz",
        "safety_de": "A1; alternatives Mischkaeltemittel",
        "pressure_tr": "retrofitte glide ile birlikte okunmasi gereken alternatif karakter",
        "pressure_de": "als Retrofit-Alternative mit Gleitverhalten sauber zu deuten",
        "use_tr": "R404A yerine dusunulen muhafaza ve belirli dusuk sicaklik projeleri",
        "use_de": "als Alternative zu R404A in Lager- und bestimmten Tiefkuehlprojekten",
        "retrofit_tr": "valf, glide, yag ve etiketleme yeniden kontrol edilmelidir",
        "retrofit_de": "Ventil, Glide, Oel und Kennzeichnung muessen neu bewertet werden",
    },
    "r449a": {
        "aliases": ("r449a", "449a"),
        "tr_label": "R449A",
        "de_label": "R449A",
        "safety_tr": "A1; retrofit tarafinda sik dusunulen alternatiflerden biri",
        "safety_de": "A1; haeufige Retrofit-Alternative",
        "pressure_tr": "karisim karakteri nedeniyle tablo ve glide mantigi ister",
        "pressure_de": "erfordert wegen Mischungsverhalten klare Glide- und Tabellenlogik",
        "use_tr": "R404A legacy sistemlerden geciste sik dusunulur",
        "use_de": "wird oft bei der Umstellung von R404A-Bestandsanlagen betrachtet",
        "retrofit_tr": "saha davranisi R448A ile benzer ailede ama proje bazli farkli okunur",
        "retrofit_de": "gleiche Familie wie R448A, aber projektspezifisch getrennt zu bewerten",
    },
    "r452a": {
        "aliases": ("r452a", "452a"),
        "tr_label": "R452A",
        "de_label": "R452A",
        "safety_tr": "A1; dusuk sicaklik alternatiflerinde onemli aday",
        "safety_de": "A1; relevanter Kandidat fuer Tieftemperatur-Alternativen",
        "pressure_tr": "negatif ve sok oda tarafinda referansla karsilastirilarak okunur",
        "pressure_de": "wird besonders fuer Tiefkuehlung und Schockanwendungen verglichen",
        "use_tr": "negatif depo ve sok oda retrofit/proje secimleri",
        "use_de": "Tiefkuehl- und Schockraumprojekte im Neu- oder Retrofitbereich",
        "retrofit_tr": "mevcut dusuk sicaklik sistemlerinde kompresor stresi ve yag tarafiyla birlikte dusunulur",
        "retrofit_de": "im Bestand immer zusammen mit Verdichterstress und Oelthema zu pruefen",
    },
    "r290": {
        "aliases": ("r290", "propan"),
        "tr_label": "R290",
        "de_label": "R290",
        "safety_tr": "A3; yuksek yanici ama teknik olarak guclu",
        "safety_de": "A3; hoch entflammbar, aber thermodynamisch stark",
        "pressure_tr": "iyi verim veren fakat servis disiplini isteyen dogal gaz karakteri",
        "pressure_de": "effizient, aber mit hohem Anspruch an Service-Sicherheit",
        "use_tr": "kucuk ve orta sistemler, yeni nesil dogal gaz projeleri",
        "use_de": "kleine bis mittlere Neuanlagen mit Fokus auf natuerliche Kaeltemittel",
        "retrofit_tr": "eski sistemi rastgele R290'a cevirmek yerine proje guvenligi ve sarj limiti yeniden hesaplanmalidir",
        "retrofit_de": "kein blindes Retrofit; Sicherheitskonzept und Fuellgrenzen muessen neu geplant werden",
    },
    "r600a": {
        "aliases": ("r600a", "600a", "isobutane", "isobutan"),
        "tr_label": "R600a",
        "de_label": "R600a",
        "safety_tr": "A3; kompakt sistemlerde sik gorulur",
        "safety_de": "A3; haeufig in kompakten Anlagen",
        "pressure_tr": "daha kucuk sarjli ve kompakt sahalarda dusunulur",
        "pressure_de": "eher fuer kleine Fuellungen und kompakte Systeme",
        "use_tr": "kucuk dolaplar ve kompakt uygulamalar",
        "use_de": "kleine Geraete und kompakte Anwendungen",
        "retrofit_tr": "buyuk saha sistemine aynen tasinmaz; sistem olcegi kritik",
        "retrofit_de": "nicht 1:1 auf groessere Anlagen uebertragbar; die Systemgroesse ist entscheidend",
    },
    "r744": {
        "aliases": ("r744", "co2", "co 2"),
        "tr_label": "R744 / CO2",
        "de_label": "R744 / CO2",
        "safety_tr": "A1 sayilsa da yuksek basinc nedeniyle ayri disiplin ister",
        "safety_de": "formal A1, aber wegen sehr hoher Druecke mit eigener Sicherheitslogik",
        "pressure_tr": "cok yuksek basinc karakteri klasik HFC mantigindan ayridir",
        "pressure_de": "sehr hohes Druckniveau, klar getrennt von klassischer HFC-Logik",
        "use_tr": "endustriyel, market ve ozel projelerde",
        "use_de": "in industriellen, markt- und spezialisierten Projekten",
        "retrofit_tr": "rastgele retrofit degil, proje mimarisi ve ekipman seviyesinde yeniden tasarim ister",
        "retrofit_de": "kein spontaner Retrofit, sondern ein neues Systemdesign auf Projektebene",
    },
    "r717": {
        "aliases": ("r717", "amonyak", "ammonia", "nh3"),
        "tr_label": "R717 / Amonyak",
        "de_label": "R717 / Ammoniak",
        "safety_tr": "toksik; profesyonel endustriyel disiplin gerektirir",
        "safety_de": "toxisch; erfordert hohes industrielles Sicherheitsniveau",
        "pressure_tr": "guclu verim ama uzman saha ister",
        "pressure_de": "sehr effizient, aber nur fuer fachlich starke Umgebungen geeignet",
        "use_tr": "buyuk endustriyel tesisler",
        "use_de": "groessere industrielle Anlagen",
        "retrofit_tr": "normal saha retrofit konusu degil, tesis seviyesinde tasarim karari konusudur",
        "retrofit_de": "kein normales Feld-Retrofit, sondern eine Anlagenentscheidung auf Konzeptniveau",
    },
}


def _default_drc_man_dir() -> Path:
    return Path(os.environ.get("DRC_MAN_DIR") or (Path.home() / "Desktop" / "DRC_MAN")).expanduser()


def _load_payload() -> dict[str, object]:
    raw = sys.stdin.read().strip()
    if not raw:
        return {}
    try:
        loaded = json.loads(raw)
        return loaded if isinstance(loaded, dict) else {}
    except json.JSONDecodeError:
        return {}


def _json_out(payload: dict[str, object]) -> int:
    print(json.dumps(payload, ensure_ascii=False))
    return 0


def _normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    cleaned = []
    for char in normalized.lower():
      if char.isalnum() or char in {" ", "-", "/", "."}:
          cleaned.append(char)
      else:
          cleaned.append(" ")
    return " ".join("".join(cleaned).split())


def _tokenize(value: str) -> list[str]:
    return [token for token in _normalize_text(value).replace("-", " ").split() if token]


def _contains_normalized_phrase(text: str, needle: str) -> bool:
    normalized_text = f" {_normalize_text(text)} "
    normalized_needle = f" {_normalize_text(needle)} "
    return normalized_needle in normalized_text


def _load_faq_entries(files: list[Path] | None = None) -> list[dict[str, object]]:
    requested_files = [Path(file_path) for file_path in (files or FAQ_FILES)]
    cache_key = tuple(sorted(str(file_path.resolve()) for file_path in requested_files))
    signature: list[tuple[str, int, int]] = []

    for faq_file in requested_files:
        if not faq_file.exists():
            continue
        stat = faq_file.stat()
        signature.append((str(faq_file.resolve()), int(stat.st_mtime_ns), int(stat.st_size)))

    cached = FAQ_CACHE.get(cache_key)
    signature_key = tuple(signature)
    if cached and cached.get("signature") == signature_key:
        return list(cached.get("entries") or [])

    entries: list[dict[str, object]] = []
    for faq_file in requested_files:
        if not faq_file.exists():
            continue
        try:
            loaded = json.loads(faq_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if isinstance(loaded, list):
            entries.extend(_prepare_faq_entry(item) for item in loaded if isinstance(item, dict))

    FAQ_CACHE[cache_key] = {
        "signature": signature_key,
        "entries": entries,
    }
    return list(entries)


def _prepare_faq_entry(entry: dict[str, object]) -> dict[str, object]:
    prepared = dict(entry)
    tr_questions = [
        str(item).strip()
        for item in (entry.get("tr_questions") or [])
        if str(item).strip()
    ]
    de_questions = [
        str(item).strip()
        for item in (entry.get("de_questions") or [])
        if str(item).strip()
    ]
    keywords = [
        _normalize_text(str(item))
        for item in (entry.get("keywords") or [])
        if _normalize_text(str(item))
    ]
    prepared_prompts = {
        "tr": _prepare_prompt_list(tr_questions),
        "de": _prepare_prompt_list(de_questions),
    }
    search_tokens: set[str] = set()
    for prompt_group in prepared_prompts.values():
        for prompt in prompt_group:
            search_tokens.update(prompt["tokens"])
    for keyword in keywords:
        search_tokens.update(_tokenize(keyword))

    prepared["_keywords_normalized"] = keywords
    prepared["_prepared_prompts"] = prepared_prompts
    prepared["_search_tokens"] = search_tokens
    return prepared


def _prepare_prompt_list(prompts: list[str]) -> list[dict[str, object]]:
    prepared_prompts: list[dict[str, object]] = []
    seen_prompts: set[str] = set()
    for prompt in prompts:
        normalized_prompt = _normalize_text(prompt)
        if not normalized_prompt or normalized_prompt in seen_prompts:
            continue
        seen_prompts.add(normalized_prompt)
        prepared_prompts.append({
            "text": normalized_prompt,
            "tokens": set(_tokenize(normalized_prompt)),
        })
    return prepared_prompts


def _normalize_history(history: object) -> list[dict[str, str]]:
    if not isinstance(history, list):
        return []

    normalized: list[dict[str, str]] = []
    for item in history[-8:]:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip().lower()
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        normalized.append({"role": role, "text": text})
    return normalized


def _normalize_role(role: object) -> str:
    value = str(role or "").strip().lower()
    if value == "operator":
        return "staff"
    return value


def _contains_any_phrase(text: str, phrases: tuple[str, ...]) -> bool:
    normalized = _normalize_text(text)
    return any(_normalize_text(phrase) in normalized for phrase in phrases)


def _is_secret_disclosure_request(text: str) -> bool:
    normalized = _normalize_text(text)
    explicit_patterns = (
        r"postgres(?:ql)?:\/\/",
        r"\bdatabase url\b",
        r"\bdatabase_url\b",
        r"\bsession secret\b",
        r"\bjwt secret\b",
        r"\bapi key\b",
        r"\bapikey\b",
        r"\bprivate key\b",
        r"\bssh key\b",
        r"\bsupabase key\b",
        r"\bvercel token\b",
        r"\bgithub token\b",
        r"\bgmail app password\b",
        r"\bpassword list\b",
        r"\bsifre listesi\b",
        r"\badmin sifresi\b",
        r"\bpersonel sifresi\b",
        r"\bmusteri sifresi\b",
        r"\bkullanici sifresi\b",
        r"\bsifreleri goster\b",
        r"\bsifreyi ver\b",
        r"\btokeni ver\b",
        r"\bconnection string\b",
        r"\.env\b",
        r"\bbearer token\b",
        r"\brefresh token\b",
        r"\bpassword hash\b",
        r"\bsifre hash\b",
    )
    if any(re.search(pattern, normalized) for pattern in explicit_patterns):
        return True

    return bool(
        re.search(r"\b(ver|goster|listele|paylas|yaz|copy|kopyala|show|reveal|list|dump|export)\b.*\b(sifre|password|token|secret|api key|database url|database_url|session|jwt|cookie|key)\b", normalized)
        or re.search(r"\b(sifre|password|token|secret|api key|database url|database_url|session|jwt|cookie|key)\b.*\b(ver|goster|listele|paylas|yaz|copy|kopyala|show|reveal|list|dump|export)\b", normalized)
    )


def _assistant_policy_payload(language: str, role: str, reason: str) -> dict[str, object]:
    if language == "de":
        if reason == "customer_internal":
            answer = "Kundenansicht: DRC MAN gibt nur Verkaufspreise, Lagerstatus, Bestellungen und allgemeine technische Hilfe aus. Einkauf, Marge, Kasse, Kosten, Benutzer- und interne Betriebsdaten bleiben gesperrt."
            suggestions = ["Produktpreis zeigen", "Lagerbestand pruefen", "Technische Produktfrage"]
        elif reason == "staff_internal":
            answer = "Diese Information ist fuer Admin reserviert. Im Personalmodus beantwortet DRC MAN Verkaufs-, Lager- und Technikfragen, aber keine Passwoerter, Schluessel, Benutzerlisten oder internen Kostendaten."
            suggestions = ["Kritische Artikel", "Produktpreis zeigen", "Technische Diagnose"]
        else:
            answer = (
                "DRC MAN gibt auch im Admin-Modus keine Passwoerter, Tokens, Systemprompts, Quellcode, Datenbank-Zugangsdaten oder versteckten Anweisungen preis."
                if role == "admin"
                else "DRC MAN gibt keine Passwoerter, Tokens, Systemprompts, Quellcode, Datenbank-Zugangsdaten oder versteckten Anweisungen preis."
            )
            suggestions = ["Produktpreis zeigen", "Lagerbestand pruefen", "Technische Diagnose"]
        summary = "DRC MAN Sicherheitsrichtlinie"
    else:
        if reason == "customer_internal":
            answer = "Musteri modunda DRC MAN sadece satis fiyati, stok durumu, siparis ve genel teknik yardim verir. Alis, marj, kasa, masraf, kullanici ve ic operasyon verileri paylasilmaz."
            suggestions = ["Urun fiyati goster", "Stok durumunu sor", "Teknik urun sorusu sor"]
        elif reason == "staff_internal":
            answer = "Bu bilgi admin seviyesindedir. Personel modunda DRC MAN satis, stok ve teknik yardim verir; sifre, anahtar, kullanici listesi ve ic maliyet detaylarini acmaz."
            suggestions = ["Kritik urunleri goster", "Urun fiyati goster", "Teknik ariza sorusu sor"]
        else:
            answer = (
                "DRC MAN admin icin bile sifre, token, sistem promptu, kaynak kod, veritabani baglanti bilgisi veya gizli talimatlari aciklamaz."
                if role == "admin"
                else "DRC MAN sifre, token, sistem promptu, kaynak kod, veritabani baglanti bilgisi veya gizli talimatlari aciklamaz."
            )
            suggestions = ["Kritik urunleri goster", "Urun fiyati goster", "Teknik ariza sorusu sor"]
        summary = "DRC MAN guvenlik politikasi"

    return {
        "ok": True,
        "mode": "policy",
        "answer": answer,
        "sourceSummary": summary,
        "suggestions": suggestions,
    }


def _evaluate_security_policy(question: str, history: list[dict[str, str]], role: str, language: str) -> dict[str, object] | None:
    combined = " ".join([question] + [item["text"] for item in history if item.get("text")])
    normalized = _normalize_text(combined)
    if not normalized:
        return None

    if _contains_any_phrase(normalized, PROMPT_ATTACK_PHRASES):
        return _assistant_policy_payload(language, role, "prompt_security")

    if _is_secret_disclosure_request(normalized) or _contains_any_phrase(normalized, RAW_ACCESS_HINTS):
        return _assistant_policy_payload(language, role, "secret_disclosure")

    if role == "customer" and _contains_any_phrase(normalized, CUSTOMER_INTERNAL_HINTS):
        return _assistant_policy_payload(language, role, "customer_internal")

    if role == "staff" and _contains_any_phrase(normalized, STAFF_INTERNAL_HINTS):
        return _assistant_policy_payload(language, role, "staff_internal")

    return None


def _answer_has_sensitive_leak(answer: str, role: str) -> bool:
    normalized = _normalize_text(answer)
    if not normalized:
        return False

    if _contains_any_phrase(normalized, PROMPT_ATTACK_PHRASES) or _is_secret_disclosure_request(normalized) or _contains_any_phrase(normalized, RAW_ACCESS_HINTS):
        return True

    if role == "customer" and _contains_any_phrase(normalized, CUSTOMER_INTERNAL_HINTS):
        return True

    if role == "staff" and _contains_any_phrase(normalized, STAFF_INTERNAL_HINTS):
        return True

    return False


def _finalize_reply(payload: dict[str, object], role: str, language: str) -> dict[str, object]:
    if not isinstance(payload, dict) or not payload.get("ok") or payload.get("mode") == "policy":
        return payload

    answer = str(payload.get("answer") or "").strip()
    if _answer_has_sensitive_leak(answer, role):
        return _assistant_policy_payload(language, role, "secret_disclosure" if role == "admin" else f"{role}_internal" if role in {"customer", "staff"} else "secret_disclosure")

    finalized = dict(payload)
    finalized["answer"] = answer
    finalized["suggestions"] = [str(item).strip() for item in (payload.get("suggestions") or []) if str(item).strip()][:5]
    return finalized


def _resolve_answer_level(payload: dict[str, object]) -> str:
    explicit = str(payload.get("answerLevel") or "").strip().lower()
    if explicit in {"customer", "master"}:
        return explicit

    role = _normalize_role(payload.get("role"))
    if role == "customer":
        return "customer"
    return "master"


def _score_faq_entry(entry: dict[str, object], normalized_question: str, question_tokens: set[str], language: str) -> int:
    prompts = (entry.get("_prepared_prompts") or {}).get(language) or []
    if not prompts:
        prompts = (entry.get("_prepared_prompts") or {}).get("tr") or []
    keywords = entry.get("_keywords_normalized") or []
    search_tokens = entry.get("_search_tokens") or set()

    if question_tokens and search_tokens and not (question_tokens & search_tokens):
        prompt_phrase_match = any(
            prompt["text"] in normalized_question or normalized_question in prompt["text"]
            for prompt in prompts
        )
        if not prompt_phrase_match:
            return 0

    score = 0
    for prompt in prompts:
        normalized_prompt = str(prompt.get("text") or "").strip()
        prompt_tokens = set(prompt.get("tokens") or set())
        if not normalized_prompt:
            continue
        if normalized_question == normalized_prompt:
            score += 150
        elif normalized_prompt in normalized_question or normalized_question in normalized_prompt:
            score += 90

        score += len(question_tokens & prompt_tokens) * 18

    for keyword in keywords:
        if keyword in normalized_question:
            score += 22

    return score


def _rank_faq_entries(
    question: str,
    language: str,
    limit: int = 3,
    files: list[Path] | None = None,
) -> list[tuple[int, dict[str, object]]]:
    normalized_question = _normalize_text(question)
    question_tokens = set(_tokenize(question))
    ranked: list[tuple[int, dict[str, object]]] = []

    for entry in _load_faq_entries(files):
        score = _score_faq_entry(entry, normalized_question, question_tokens, language)
        if score > 0:
            ranked.append((score, entry))

    ranked.sort(key=lambda item: item[0], reverse=True)

    deduped: list[tuple[int, dict[str, object]]] = []
    seen_ids: set[str] = set()
    for score, entry in ranked:
        entry_id = str(entry.get("id") or "")
        if entry_id and entry_id in seen_ids:
            continue
        if entry_id:
            seen_ids.add(entry_id)
        deduped.append((score, entry))
        if len(deduped) >= limit:
            break
    return deduped


def _split_sentences(answer: str) -> list[str]:
    text = " ".join(str(answer or "").split())
    if not text:
        return []

    chunks = []
    current = []
    for char in text:
        current.append(char)
        if char in ".!?":
            sentence = "".join(current).strip()
            if sentence:
                chunks.append(sentence)
            current = []

    tail = "".join(current).strip()
    if tail:
        chunks.append(tail)
    return chunks


def _adapt_answer_level(answer: str, language: str, answer_level: str) -> str:
    text = " ".join(str(answer or "").split())
    if not text:
        return ""

    if answer_level != "customer":
        return text

    sentences = _split_sentences(text)
    shortened = " ".join(sentences[:3]) if sentences else text
    if language == "de":
        return f"Kurz und einfach: {shortened} Wenn Sie moechten, kann DRC MAN das auch im Meister-Niveau Schritt fuer Schritt erklaeren."
    return f"Kisa ve sade anlatim: {shortened} Isterseniz DRC MAN bunu usta seviyesinde adim adim da aciklayabilir."


def _extract_room_dimensions(question: str) -> tuple[float, float, float] | None:
    match = re.search(
        r"(\d+(?:[.,]\d+)?)\s*(?:x|\*|×)\s*(\d+(?:[.,]\d+)?)\s*(?:x|\*|×)\s*(\d+(?:[.,]\d+)?)",
        str(question or ""),
        flags=re.IGNORECASE,
    )
    if match is None:
        return None
    return tuple(float(part.replace(",", ".")) for part in match.groups())


def _is_cold_room_project_question(question: str) -> bool:
    normalized = _normalize_text(question)
    if _extract_room_dimensions(question) is None:
        return False
    room_tokens = (
        "soguk oda",
        "soğuk oda",
        "oda",
        "cold room",
        "kuehlraum",
        "kuhlraum",
        "kühlraum",
        "depo",
        "sebze",
        "meyve",
        "et",
        "donmus",
        "donmuş",
        "negatif",
        "arti",
        "artı",
        "plus",
        "pozitif",
        "taze",
    )
    return any(_normalize_text(token) in normalized for token in room_tokens)


def _resolve_room_profile(question: str, language: str) -> dict[str, object]:
    normalized = _normalize_text(question)
    if any(token in normalized for token in ("sok", "shock", "schock")):
        return {
            "kind_tr": "sok/soklama",
            "kind_de": "Schockraum",
            "target_c": -35.0,
            "panel_mm": 120,
            "door_tr": "surgulu ve isitma/rezistans detayli",
            "door_de": "Schiebetuer mit Heiz-/Dichtungsdetails",
            "application_tr": "SOK",
            "application_de": "Schockkuehlung",
            "refrigerant_tr": "R448A/R449A veya projeye gore R455A; R290 ancak sarj limiti ve cihaz mimarisi uygunsa",
            "refrigerant_de": "R448A/R449A oder projektspezifisch R455A; R290 nur bei passender Fuellmenge und Anlagenarchitektur",
        }
    if any(token in normalized for token in ("donmus", "negatif", "-18", "-20", "-25", "tiefkuhl", "tiefkuehl")):
        return {
            "kind_tr": "negatif/donmus muhafaza",
            "kind_de": "Tiefkuehlraum",
            "target_c": -18.0,
            "panel_mm": 100,
            "door_tr": "surgulu veya rezistansli negatif oda kapisi",
            "door_de": "Schiebetuer oder Tiefkuehltuer mit Heizung",
            "application_tr": "DONMUS",
            "application_de": "Tiefkuehlung",
            "refrigerant_tr": "R449A/R448A gibi negatif muhafaza gazlari; kucuk dogal gazli sistemde R290 sadece guvenlik ve sarj hesabiyla",
            "refrigerant_de": "R449A/R448A fuer Tiefkuehlung; R290 bei kleinen natuerlichen Systemen nur mit Sicherheits- und Fuellmengenpruefung",
        }
    if any(token in normalized for token in ("sebze", "meyve", "arti", "plus", "pozitif", "taze", "gemuse", "gemuese", "obst")):
        return {
            "kind_tr": "arti/taze muhafaza sebze odasi",
            "kind_de": "Pluskuehlraum fuer Gemuese",
            "target_c": 4.0,
            "panel_mm": 80,
            "door_tr": "menteşeli veya trafik yogunsa surgulu",
            "door_de": "Drehtuer oder bei viel Verkehr Schiebetuer",
            "application_tr": "TAZE",
            "application_de": "Pluskuehlung",
            "refrigerant_tr": "R290 dogal gazli kompakt/monoblokta guclu secenek; split/uzak kondenserde cihaz ailesine gore R134a/R513A/R449A alternatifi okunur",
            "refrigerant_de": "R290 ist bei kompakten/monoblockartigen Systemen stark; bei Split/externem Verfluessiger je nach Geraetefamilie R134a/R513A/R449A pruefen",
        }
    return {
        "kind_tr": "arti/taze muhafaza",
        "kind_de": "Pluskuehlraum",
        "target_c": 4.0,
        "panel_mm": 80,
        "door_tr": "menteşeli veya trafik yogunsa surgulu",
        "door_de": "Drehtuer oder bei viel Verkehr Schiebetuer",
        "application_tr": "TAZE",
        "application_de": "Pluskuehlung",
        "refrigerant_tr": "R290, R134a/R513A veya cihaz ailesine gore R449A",
        "refrigerant_de": "R290, R134a/R513A oder je nach Geraetefamilie R449A",
    }


def _build_cold_room_project_reply(question: str, language: str, answer_level: str) -> dict[str, object] | None:
    dimensions = _extract_room_dimensions(question)
    if dimensions is None:
        return None

    width_m, length_m, height_m = dimensions
    floor_m2 = width_m * length_m
    volume_m3 = width_m * length_m * height_m
    wall_m2 = 2 * ((width_m * height_m) + (length_m * height_m))
    panel_m2 = wall_m2 + floor_m2
    profile = _resolve_room_profile(question, language)
    target_c = float(profile["target_c"])
    delta_t = 32.0 - target_c
    base_kw = ((floor_m2 * 22.0) + (volume_m3 * delta_t * 1.75) + (volume_m3 * 6.0)) * 1.10 / 1000.0
    if profile["application_tr"] == "TAZE":
        practical_low_kw = max(base_kw * 1.10, 2.5)
        practical_high_kw = max(base_kw * 1.55, practical_low_kw + 0.8)
    elif profile["application_tr"] == "DONMUS":
        practical_low_kw = max(base_kw * 1.25, 3.5)
        practical_high_kw = max(base_kw * 1.80, practical_low_kw + 1.2)
    else:
        practical_low_kw = max(base_kw * 1.60, 5.0)
        practical_high_kw = max(base_kw * 2.40, practical_low_kw + 2.0)

    height_note_tr = (
        "5 m yukseklik normal kucuk odadan yuksek oldugu icin evaporator hava atisi, istif yuksekligi ve donus havasi ozellikle kontrol edilmeli."
        if height_m >= 4.0
        else "Yukseklik normal bantta; hava dagilimi yine de urunun ustune direkt vurmayacak sekilde ayarlanmali."
    )
    height_note_de = (
        "5 m Hoehe ist fuer kleine Raeume hoch; Luftwurf, Stapelhoehe und Rueckluft muessen besonders geprueft werden."
        if height_m >= 4.0
        else "Die Hoehe liegt im normalen Bereich; der Luftstrom darf trotzdem nicht direkt auf empfindliche Ware blasen."
    )

    if answer_level == "customer":
        if language == "de":
            answer = (
                f"Kurz: {width_m:.1f}x{length_m:.1f}x{height_m:.1f} m ergibt ca. {volume_m3:.1f} m3. "
                f"Fuer {profile['kind_de']} wuerde ich als erste Richtung {profile['panel_mm']} mm Paneel und etwa "
                f"{practical_low_kw:.1f}-{practical_high_kw:.1f} kW Kaelteleistung ansetzen. "
                "Fuer ein echtes Angebot brauche ich noch Solltemperatur, Tagesmenge, Eintrittstemperatur und Tuerverkehr."
            )
        else:
            answer = (
                f"Kisa yon: {width_m:.1f}x{length_m:.1f}x{height_m:.1f} m oda yaklasik {volume_m3:.1f} m3. "
                f"{profile['kind_tr']} icin ilk okuma {profile['panel_mm']} mm panel ve yaklasik "
                f"{practical_low_kw:.1f}-{practical_high_kw:.1f} kW sogutma kapasitesi olur. "
                "Net teklif icin hedef sicaklik, gunluk urun girisi, urun giris sicakligi ve kapi trafigi sorulmali."
            )
        return {
            "ok": True,
            "mode": "cold_room_project",
            "answer": answer,
            "sourceSummary": "DRC MAN soguk oda proje modu",
            "suggestions": ["hedef sicaklik kac olmali", "hangi panel secilir", "sebze odasi icin cihaz secimi"],
        }

    if language == "de":
        answer = (
            f"DRC MAN Projektlesung: {width_m:.1f}x{length_m:.1f}x{height_m:.1f} m bedeutet ca. {volume_m3:.1f} m3 Volumen "
            f"und {floor_m2:.1f} m2 Bodenflaeche. Das lese ich als {profile['kind_de']} mit etwa {target_c:+.0f} C Zieltemperatur.\n\n"
            f"1. Raumhuelle: Als Startwert {profile['panel_mm']} mm Paneel. Reine Wand+Deckenflaeche liegt bei ca. {panel_m2:.1f} m2; "
            "Boden nur dann getrennt bewerten, wenn Tiefkuehlung, Nassbereich oder schwere Lasten im Spiel sind. "
            f"{height_note_de}\n\n"
            f"2. Kaelteleistung: Die Schnellrechnung gibt ca. {base_kw:.1f} kW Grundlast. Fuer echte Gemueselagerung rechne ich nicht nur die leere Kammer, "
            f"sondern Ware, Tuerverkehr und Abkuehlreserve dazu. Praktisch wuerde ich zuerst {practical_low_kw:.1f}-{practical_high_kw:.1f} kW pruefen, "
            "danach mit Tagesmenge und Eintrittstemperatur nachschaerfen.\n\n"
            f"3. Technik: Tuer: {profile['door_de']}. Kaeltemittel/Anlagenfamilie: {profile['refrigerant_de']}. "
            "Bei Gemuese ist nicht maximale Luftgeschwindigkeit das Ziel, sondern stabile Temperatur, hohe relative Feuchte und schonende Luftverteilung.\n\n"
            "4. Vor Angebot klaeren: Zieltemperatur, gewuenschte Feuchte, kg Ware pro Tag, Eintrittstemperatur der Ware, Anzahl Tuergoeffnungen, Innen-/Aussenaufstellung, "
            "Abtauart, Ablauf und ob der Raum sofort heruntergekuehlt oder nur gelagert wird. Ohne diese Angaben verkauft man sonst entweder zu klein oder unnoetig zu gross."
        )
        suggestions = ["Solltemperatur fuer Gemuese", "Paneelstaerke waehlen", "Kaelteleistung genauer rechnen"]
    else:
        answer = (
            f"DRC MAN proje okuması: {width_m:.1f}x{length_m:.1f}x{height_m:.1f} m oda yaklaşık {volume_m3:.1f} m3 hacim, "
            f"{floor_m2:.1f} m2 taban alanı verir. Ben bunu {profile['kind_tr']} olarak okurum; hedef sıcaklık ilk varsayımda {target_c:+.0f} C civarıdır.\n\n"
            f"1. Panel ve oda kabuğu: Bu senaryoda başlangıç paneli {profile['panel_mm']} mm olur. Duvar+tavan alanı kabaca {panel_m2:.1f} m2 çıkar; "
            "negatif oda değilse zemini soğuk oda paneli gibi düşünmek şart değildir ama zemin yalıtımı, drenaj ve hijyen kullanım şekline göre ayrıca konuşulur. "
            f"{height_note_tr}\n\n"
            f"2. Kapasite: Hızlı ısı yükü hesabı boş oda için yaklaşık {base_kw:.1f} kW temel yük gösteriyor. Sebze odasında sadece boş odayı soğutmayız; "
            f"günlük ürün girişi, ürünün depoya kaç derecede girdiği, kapı açılma sayısı ve nem hedefi kapasiteyi büyütür. Bu yüzden ilk cihaz bandını "
            f"{practical_low_kw:.1f}-{practical_high_kw:.1f} kW aralığında kontrol ederim. Net seçim için ürün yüküyle ikinci hesap gerekir.\n\n"
            f"3. Cihaz ve tesisat mantığı: Kapı için {profile['door_tr']} mantıklı başlangıçtır. Gaz/cihaz ailesinde {profile['refrigerant_tr']}. "
            "Sebzede amaç sert hava basmak değil; ürünü kurutmadan homojen hava dolaştırmak, nemi korumak ve sıcaklığı stabil tutmaktır. Evaporatör seçerken fan debisi ve hava atışı bu yüzden kapasite kadar önemlidir.\n\n"
            "4. Tekliften önce sorulacak net bilgiler: hedef derece, saklanacak sebze tipi, günlük kaç kg ürün gireceği, ürün giriş sıcaklığı, kapı trafiği, cihaz dışarıda mı içeride mi, "
            "monoblok mu split mi isteniyor, drenaj ve elektrik hattı hazır mı. Bu bilgiler gelmeden kesin cihaz söylemek riskli olur; ama ön teklif yönü: 80 mm panel, artı oda kapısı, "
            f"yaklaşık {practical_low_kw:.1f}-{practical_high_kw:.1f} kW cihaz ve sebzeye uygun düşük/orta hava hızlı evaporatör."
        )
        suggestions = ["hedef sicaklik kac olmali", "sebze odasi icin hangi cihaz", "bu oda icin teklif bandi"]

    return {
        "ok": True,
        "mode": "cold_room_project",
        "answer": answer,
        "sourceSummary": "DRC MAN soguk oda proje modu",
        "suggestions": suggestions,
    }


def _scenario_subject(entry: dict[str, object], language: str) -> str:
    key = "de_subject" if language == "de" else "tr_subject"
    fallback_key = "tr_subject" if language == "de" else "de_subject"
    subject = str(entry.get(key) or entry.get(fallback_key) or "").strip()
    if subject:
        return subject

    questions = entry.get("de_questions") if language == "de" else entry.get("tr_questions")
    if isinstance(questions, list) and questions:
        return str(questions[0]).strip()
    return str(entry.get("id") or "bilinmeyen ariza")


def _extract_reason_from_answer(entry: dict[str, object], language: str) -> str:
    answer = entry.get("de_answer") if language == "de" else entry.get("tr_answer")
    parts = _split_sentences(str(answer or ""))
    if len(parts) >= 2:
        return parts[1]
    if parts:
        return parts[0]
    return ""


def _extract_scenario_facts(text: str, language: str) -> list[str]:
    normalized = _normalize_text(text)
    facts: list[str] = []
    for needles, labels in SCENARIO_FACTS:
        if any(_normalize_text(needle) in normalized for needle in needles):
            facts.append(labels["de" if language == "de" else "tr"])
    return facts[:5]


def _find_gas_keys(text: str) -> list[str]:
    normalized = _normalize_text(text)
    located: list[tuple[int, str]] = []
    for gas_key, profile in GAS_PROFILES.items():
        positions = []
        for alias in profile["aliases"]:
            index = normalized.find(_normalize_text(alias))
            if index >= 0:
                positions.append(index)
        if positions:
            located.append((min(positions), gas_key))

    located.sort(key=lambda item: item[0])
    seen: set[str] = set()
    ordered: list[str] = []
    for _, gas_key in located:
        if gas_key in seen:
            continue
        seen.add(gas_key)
        ordered.append(gas_key)
    return ordered


def _gas_label(gas_key: str, language: str) -> str:
    profile = GAS_PROFILES[gas_key]
    return str(profile["de_label"] if language == "de" else profile["tr_label"])


def _gas_project_context(text: str) -> tuple[str, dict[str, str]] | None:
    contexts = [
        (
            "shock",
            ("sok", "soklama", "shock", "blast", "schock"),
            {
                "tr": "sok oda veya hizli urun cekme senaryosu",
                "de": "Schockraum oder schnelle Produktabkuehlung",
            },
        ),
        (
            "negative",
            ("negatif", "donmus", "frozen", "freezer", "tiefkuehl", "tiefkuehlraum", "tiefkuehlung", "derin dondurma"),
            {
                "tr": "negatif depo veya donmus muhafaza senaryosu",
                "de": "Tiefkuehlraum oder Tiefkuehl-Lagerung",
            },
        ),
        (
            "positive",
            ("arti", "muhafaza", "plus", "pluskuehlung", "pluskuehlraum", "cool room", "pozitif depo"),
            {
                "tr": "arti muhafaza veya orta sicaklik senaryosu",
                "de": "Pluskuehlung oder mittlere Lagertemperatur",
            },
        ),
        (
            "compact",
            ("kucuk", "kompakt", "monoblok", "mini", "vitrin", "split"),
            {
                "tr": "kucuk veya kompakt sistem senaryosu",
                "de": "kleine oder kompakte Anlage",
            },
        ),
        (
            "industrial",
            ("endustriyel", "buyuk", "merkezi", "santral", "industrial", "zentral"),
            {
                "tr": "buyuk veya endustriyel tesis senaryosu",
                "de": "groessere oder industrielle Anlage",
            },
        ),
    ]

    for key, needles, labels in contexts:
        if any(_contains_normalized_phrase(text, needle) for needle in needles):
            return key, labels
    return None


def _selection_candidates(context_key: str) -> list[str]:
    mapping = {
        "shock": ["r452a", "r448a", "r744"],
        "negative": ["r452a", "r448a", "r449a"],
        "positive": ["r290", "r134a", "r744"],
        "compact": ["r290", "r600a", "r134a"],
        "industrial": ["r717", "r744", "r449a"],
    }
    return mapping.get(context_key, ["r290", "r448a", "r744"])


def _build_gas_compare_reply(gas_keys: list[str], language: str, answer_level: str) -> dict[str, object]:
    left_key, right_key = gas_keys[:2]
    left = GAS_PROFILES[left_key]
    right = GAS_PROFILES[right_key]
    left_label = _gas_label(left_key, language)
    right_label = _gas_label(right_key, language)

    if language == "de":
        if answer_level == "customer":
            answer = (
                f"Kurzvergleich {left_label} gegen {right_label}:\n"
                f"- Sicherheit: {left_label} -> {left['safety_de']}; {right_label} -> {right['safety_de']}.\n"
                f"- Druckcharakter: {left_label} -> {left['pressure_de']}; {right_label} -> {right['pressure_de']}.\n"
                f"- Typische Nutzung: {left_label} -> {left['use_de']}; {right_label} -> {right['use_de']}.\n"
                "Wenn Sie moechten, kann DRC MAN jetzt noch sagen, welche Variante fuer Ihr Projekt sinnvoller ist."
            )
        else:
            answer = (
                f"DRC MAN Gasvergleich aktiv: {left_label} gegen {right_label}.\n"
                f"1. Sicherheitslogik: {left_label} -> {left['safety_de']}. {right_label} -> {right['safety_de']}.\n"
                f"2. Druck- und Servicecharakter: {left_label} -> {left['pressure_de']}. {right_label} -> {right['pressure_de']}.\n"
                f"3. Typische Projektanwendung: {left_label} -> {left['use_de']}. {right_label} -> {right['use_de']}.\n"
                f"4. Retrofit-Denke: {left_label} -> {left['retrofit_de']}. {right_label} -> {right['retrofit_de']}.\n"
                "Die bessere Wahl entscheidet sich nicht ueber den Namen, sondern ueber Temperaturbereich, Sicherheitsklasse, Verdichterlogik und Projekttyp."
            )
        suggestions = [
            f"Welches Kaeltemittel passt fuer mein Projekt besser als {left_label} oder {right_label}?",
            f"Ist {left_label} ein sinnvoller Retrofit-Kandidat?",
            f"Ist {right_label} fuer Tiefkuehlung oder Pluskuehlung besser?",
        ]
    else:
        if answer_level == "customer":
            answer = (
                f"Kisa karsilastirma: {left_label} ve {right_label}.\n"
                f"- Guvenlik: {left_label} -> {left['safety_tr']}; {right_label} -> {right['safety_tr']}.\n"
                f"- Basinc karakteri: {left_label} -> {left['pressure_tr']}; {right_label} -> {right['pressure_tr']}.\n"
                f"- Tipik kullanim: {left_label} -> {left['use_tr']}; {right_label} -> {right['use_tr']}.\n"
                "Isterseniz bir sonraki adimda hangisinin sizin projeye daha uygun oldugunu da soyleyebilirim."
            )
        else:
            answer = (
                f"DRC MAN gaz karsilastirma modu aktif: {left_label} ile {right_label}.\n"
                f"1. Guvenlik mantigi: {left_label} -> {left['safety_tr']}. {right_label} -> {right['safety_tr']}.\n"
                f"2. Basinc ve servis karakteri: {left_label} -> {left['pressure_tr']}. {right_label} -> {right['pressure_tr']}.\n"
                f"3. Tipik proje kullanimi: {left_label} -> {left['use_tr']}. {right_label} -> {right['use_tr']}.\n"
                f"4. Retrofit mantigi: {left_label} -> {left['retrofit_tr']}. {right_label} -> {right['retrofit_tr']}.\n"
                "Burada dogru karar sadece gaz isminden cikmaz; sicaklik seviyesi, emniyet sinifi, kompresor zorlugu ve saha disiplini birlikte okunur."
            )
        suggestions = [
            f"{left_label} ile {right_label} arasinda proje icin hangisi mantikli",
            f"{left_label} retrofitte nasil dusunulur",
            f"{right_label} negatif depoda nasil okunur",
        ]

    return {
        "ok": True,
        "mode": "gas_compare",
        "answer": answer,
        "sourceSummary": "DRC MAN gaz karsilastirma modu",
        "suggestions": suggestions,
    }


def _build_gas_selection_reply(
    question: str,
    history: list[dict[str, str]],
    language: str,
    answer_level: str,
) -> dict[str, object]:
    combined = " ".join([item["text"] for item in history if item.get("role") == "user"] + [question])
    context = _gas_project_context(combined)
    context_key, labels = context or ("general", {"tr": "genel proje senaryosu", "de": "allgemeine Projektsituation"})
    candidates = _selection_candidates(context_key)
    labeled = [_gas_label(gas_key, language) for gas_key in candidates]

    if language == "de":
        if answer_level == "customer":
            answer = (
                f"Fuer {labels['de']} wuerde ich zuerst diese Richtung pruefen: {', '.join(labeled)}.\n"
                f"- {labeled[0]} ist der staerkste erste Kandidat.\n"
                f"- {labeled[1]} ist eine sinnvolle Alternative.\n"
                f"- {labeled[2]} ist eher fuer besondere Projektlogik gedacht.\n"
                "Wenn Sie Temperaturbereich und Anlagengroesse nennen, grenze ich es sauber ein."
            )
        else:
            first, second, third = candidates
            answer = (
                f"DRC MAN Projektauswahl aktiv. Ich lese hier: {labels['de']}.\n"
                f"1. Erste Wahl: {_gas_label(first, language)} -> {GAS_PROFILES[first]['use_de']}; {GAS_PROFILES[first]['safety_de']}.\n"
                f"2. Zweite Wahl: {_gas_label(second, language)} -> {GAS_PROFILES[second]['use_de']}; {GAS_PROFILES[second]['pressure_de']}.\n"
                f"3. Spezialfall: {_gas_label(third, language)} -> {GAS_PROFILES[third]['use_de']}; {GAS_PROFILES[third]['retrofit_de']}.\n"
                "Ich entscheide hier nach Temperaturbereich, Anlagengroesse, Sicherheitsklasse und danach, ob es Neubau oder Bestand ist."
            )
        suggestions = [
            "Ist das fuer Pluskuehlung oder Tiefkuehlung gedacht?",
            f"Ist {_gas_label(candidates[0], language)} fuer mein Projekt wirklich die erste Wahl?",
            "Soll ich Neubau oder Retrofit getrennt erklaeren?",
        ]
    else:
        if answer_level == "customer":
            answer = (
                f"{labels['tr']} icin ilk bakista su yon mantikli: {', '.join(labeled)}.\n"
                f"- {labeled[0]} birinci aday.\n"
                f"- {labeled[1]} ikinci guclu alternatif.\n"
                f"- {labeled[2]} daha ozel proje mantiginda dusunulur.\n"
                "Sicaklik araligini ve sistem olcegini yazarsaniz daha net daraltirim."
            )
        else:
            first, second, third = candidates
            answer = (
                f"DRC MAN proje icin gaz secim modu aktif. Burada okudugum senaryo: {labels['tr']}.\n"
                f"1. Birinci aday: {_gas_label(first, language)} -> {GAS_PROFILES[first]['use_tr']}; {GAS_PROFILES[first]['safety_tr']}.\n"
                f"2. Ikinci aday: {_gas_label(second, language)} -> {GAS_PROFILES[second]['use_tr']}; {GAS_PROFILES[second]['pressure_tr']}.\n"
                f"3. Ozel senaryo adayi: {_gas_label(third, language)} -> {GAS_PROFILES[third]['use_tr']}; {GAS_PROFILES[third]['retrofit_tr']}.\n"
                "Burada karari proje tipi verir: arti mi negatif mi, yeni sistem mi retrofit mi, sistem kompakt mi buyuk tesis mi."
            )
        suggestions = [
            "arti muhafaza icin hangisi daha mantikli",
            "negatif depo icin hangisini one alirsin",
            "retrofit ile yeni projeyi ayri anlat",
        ]

    return {
        "ok": True,
        "mode": "gas_selection",
        "answer": answer,
        "sourceSummary": "DRC MAN proje icin gaz secim modu",
        "suggestions": suggestions,
    }


def _build_gas_retrofit_reply(
    gas_keys: list[str],
    question: str,
    history: list[dict[str, str]],
    language: str,
    answer_level: str,
) -> dict[str, object]:
    combined = " ".join([item["text"] for item in history if item.get("role") == "user"] + [question])
    source_key = gas_keys[0]
    target_key = gas_keys[1] if len(gas_keys) > 1 else None
    source_label = _gas_label(source_key, language)
    target_label = _gas_label(target_key, language) if target_key else None
    project_context = _gas_project_context(combined)
    context_text = ""
    if project_context:
        context_text = project_context[1]["de" if language == "de" else "tr"]

    if source_key == "r404a":
        candidates = ["r448a", "r449a", "r452a"]
    elif source_key == "r134a":
        candidates = []
    elif source_key in {"r290", "r744", "r717"}:
        candidates = []
    else:
        candidates = [key for key in gas_keys[1:] if key != source_key][:2]

    if language == "de":
        if source_key == "r404a":
            decision = ", ".join(_gas_label(key, language) for key in candidates)
            target_line = (
                f"Der von Ihnen genannte Zielstoff {target_label} liegt in dieser Denkrichtung, muss aber sauber gegen Verdichterbereich, Oel, Ventil und Glide geprueft werden.\n"
                if target_label
                else ""
            )
            answer = (
                f"DRC MAN Retrofit-Entscheidungsbaum aktiv fuer {source_label}."
                f"{' Kontext: ' + context_text + '.' if context_text else ''}\n"
                f"Bei {source_label} denke ich heute zuerst an diese Kandidaten: {decision}.\n"
                "Warum: R404A ist meist nicht mehr das Ziel, sondern der Ausgangspunkt fuer eine saubere Umruestungsentscheidung.\n"
                f"{target_line}"
                "Pruefschritte in richtiger Reihenfolge: Verdichterfreigabe, Oel, Expansionsventil, Drucklage, Glide-Verhalten, Regler- und Etikettenanpassung.\n"
                "Wenn es klar um Tiefkuehlung oder Schock geht, gewinnt haeufig ein anderer Kandidat als bei normaler Lagerung."
            )
        elif source_key == "r134a":
            answer = (
                f"Bei {source_label} gebe ich bewusst keinen blinden 1:1-Ersatz aus.\n"
                "Der richtige Weg haengt an Temperaturbereich, Verdichterdaten, Oel und daran, ob die Anlage nur weiterlaufen oder konzeptionell verbessert werden soll.\n"
                "In kleinen Neuprojekten denkt man oft Richtung natuerliches Kaeltemittel wie R290, im Bestand aber nur nach sauberer Technikpruefung."
            )
        elif source_key in {"r290", "r744", "r717"}:
            answer = (
                f"Bei {source_label} ist die richtige Antwort fast nie 'einfach ersetzen'.\n"
                "Hier sprechen wir ueber Sicherheitskonzept, Druckniveau oder Anlagenphilosophie. Das ist eher Redesign als klassisches Retrofit.\n"
                "Ich wuerde zuerst die Projektziele und die vorhandene Sicherheitstechnik aufnehmen."
            )
        else:
            decision = ", ".join(_gas_label(key, language) for key in candidates) if candidates else "eine projektspezifische Neubewertung"
            answer = (
                f"Fuer {source_label} denke ich im Retrofit nicht blind, sondern ueber {decision} nach.\n"
                "Die Reihenfolge bleibt gleich: Temperaturziel, Verdichtergrenzen, Oel, Ventil, Druckniveau, Regelung und Kennzeichnung."
            )
        suggestions = [
            f"Welche Mess- und Umruestpunkte pruefe ich bei {source_label} zuerst?",
            "Ist das fuer Pluskuehlung oder Tiefkuehlung gedacht?",
            "Soll ich den Retrofit als Entscheidungsbaum Schritt fuer Schritt erklaeren?",
        ]
    else:
        if source_key == "r404a":
            decision = ", ".join(_gas_label(key, language) for key in candidates)
            target_line = (
                f"Yazdiginiz hedef gaz {target_label} bu ailede dusunulebilir ama kompresor araligi, yag, valf ve glide kontrol edilmeden karar verilmez.\n"
                if target_label
                else ""
            )
            answer = (
                f"DRC MAN retrofit karar modu aktif: kaynak gaz {source_label}."
                f"{' Baglam: ' + context_text + '.' if context_text else ''}\n"
                f"Ben burada ilk olarak su adaylara bakarim: {decision}.\n"
                "Sebep su: R404A artik hedef gaz gibi degil, yerine neyin daha dogru olacagini sectigimiz cikis noktasi gibi okunur.\n"
                f"{target_line}"
                "Dogru sira sunlar: kompresor uygun mu, yag uyumu nasil, expansion valf yeterli mi, basinc tablosu nasil degisiyor, glide saha ayarini etkiliyor mu, regulator ve etiketler guncellendi mi.\n"
                "Negatif depo ile normal muhafaza ayni retrofit kararini vermez."
            )
        elif source_key == "r134a":
            answer = (
                f"{source_label} tarafinda ben bilerek tek bir 'yerine bunu tak' cevabi vermem.\n"
                "Burada proje sicakligi, kompresor datasheet'i, yag tipi ve sistemin omur beklentisi belirleyicidir.\n"
                "Kucuk yeni projede R290 mantigi guclu olabilir ama mevcut sahada bunu ancak yeniden guvenlik hesabiyla dusunuruz."
            )
        elif source_key in {"r290", "r744", "r717"}:
            answer = (
                f"{source_label} icin retrofit konusu klasik drop-in mantigi degildir.\n"
                "Burada yanicilik, yuksek basinc veya tesis guvenligi gibi konular var; yani karar parca degistirmekten cok proje mimarisi karari olur.\n"
                "Ben once hedefi netlestiririm: ayni kapasite mi, ayni saha mi, yoksa komple yeniden tasarim mi."
            )
        else:
            decision = ", ".join(_gas_label(key, language) for key in candidates) if candidates else "proje bazli yeni bir degerlendirme"
            answer = (
                f"{source_label} retrofitinde ben otomatik cevap vermem; {decision} tarafina bakarim.\n"
                "Karari su sirayla veririm: hedef sicaklik, kompresor limiti, yag, valf, basinc karakteri, glide ve saha ayari."
            )
        suggestions = [
            f"{source_label} yerine neyi once elersin",
            "retrofit karar agacini adim adim anlat",
            "negatif ve arti muhafazada karar nasil degisir",
        ]

    if answer_level == "customer":
        answer = _adapt_answer_level(answer, language, "customer")

    return {
        "ok": True,
        "mode": "gas_retrofit",
        "answer": answer,
        "sourceSummary": "DRC MAN gaz retrofit karar modu",
        "suggestions": suggestions,
    }


def _build_gas_consulting_reply(
    question: str,
    history: list[dict[str, str]],
    language: str,
    answer_level: str,
) -> dict[str, object] | None:
    normalized_question = _normalize_text(question)
    combined_context = " ".join([item["text"] for item in history if item.get("role") == "user"] + [question]).strip()
    gas_keys = _find_gas_keys(combined_context)

    compare_trigger = any(_contains_normalized_phrase(normalized_question, hint) for hint in GAS_COMPARE_HINTS)
    selection_trigger = any(_contains_normalized_phrase(normalized_question, hint) for hint in GAS_SELECTION_HINTS)
    retrofit_trigger = any(_contains_normalized_phrase(normalized_question, hint) for hint in GAS_RETROFIT_HINTS)

    if compare_trigger and len(gas_keys) >= 2:
        return _build_gas_compare_reply(gas_keys, language, answer_level)

    if retrofit_trigger and gas_keys:
        return _build_gas_retrofit_reply(gas_keys, question, history, language, answer_level)

    if selection_trigger or (
        _gas_project_context(combined_context)
        and any(
            _contains_normalized_phrase(normalized_question, hint)
            for hint in ("hangi", "uygun", "passend", "passt", "suitable", "sec", "auswahl", "welches")
        )
    ):
        return _build_gas_selection_reply(question, history, language, answer_level)

    return None


def _scenario_domain(entries: list[dict[str, object]]) -> str:
    joined = " ".join(str(entry.get("source_summary") or "") for entry in entries).lower()
    if "elektrik" in joined:
      return "electrical"
    if "kompresor" in joined or "gaz devresi" in joined or "valf" in joined:
      return "refrigeration"
    return "general"


def _scenario_action_lines(language: str, domain: str) -> tuple[list[str], list[str]]:
    if language == "de":
        if domain == "electrical":
            return (
                [
                    "Zuerst echte Spannungswerte sichern: alle Phasen, Steuerstrom und Schaltspannung am Schuetz.",
                    "Danach die Schutz- und Schaltkette pruefen: Motorschutz, Druckschalter, Schuetz, Not-Aus und Freigaben.",
                    "Erst dann Motor, Verdichter oder Regler als Bauteilfehler bewerten.",
                ],
                [
                    "Phase-Phase- und Phase-N-Spannung",
                    "zieht das Schuetz wirklich an oder flattert es",
                    "ist Motorschutz oder Sicherung ausgeloest",
                ],
            )
        if domain == "refrigeration":
            return (
                [
                    "Zuerst reale Kaeltewerte sichern: Hochdruck, Niederdruck, Superheat/Subcooling soweit moeglich.",
                    "Danach Luft- und Lastseite pruefen: Vereisung, Ventilatoren, Tuer, Defrost und Warenlast.",
                    "Erst danach ueber Ventil, Fuellung, Oelruecklauf oder Verdichterzustand entscheiden.",
                ],
                [
                    "Hochdruck und Niederdruck",
                    "ob Vereisung sichtbar ist",
                    "ob Ventilatoren sauber laufen und ob Defrost normal arbeitet",
                ],
            )
        return (
            [
                "Zuerst echte Messwerte sichern: Drucke, Strom und sichtbare Vereisung.",
                "Danach Luftseite und Betrieb pruefen: Ventilatoren, Tuer, Defrost und Beladung.",
                "Erst danach das Problem auf Kaeltekreis oder Elektrik einengen.",
            ],
            [
                "Hoch-/Niederdruck",
                "Vereisung ja/nein",
                "Ventilatoren sauber laufend ja/nein",
            ],
        )

    if domain == "electrical":
        return (
            [
                "Once gercek elektrik olculerini alirim: tum fazlar, kumanda gerilimi ve kontaktor bobin gerilimi.",
                "Sonra koruma ve kumanda zincirine bakarim: termik, basinç switch, kontaktor, acil stop ve izin sinyali.",
                "Bunlar netlesmeden motoru veya kompresoru suclamam.",
            ],
            [
                "faz-faz ve faz-notr voltaj degerleri",
                "kontaktor gercekten cekiyor mu yoksa titriyor mu",
                "termik veya sigorta atmis mi",
            ],
        )
    if domain == "refrigeration":
        return (
            [
                "Once gaz devresi olculerini alirim: basma, emis, mumkunse superheat ve subcool.",
                "Sonra hava ve yuk tarafina bakarim: buzlanma, fan, kapi, defrost ve urun yuk durumu.",
                "Bu tabloyu gordukten sonra valf, sarj, yag donusu veya kompresor sagligini daraltirim.",
            ],
            [
                "basma ve emis basinci",
                "buzlanma var mi",
                "fanlar ve defrost normal mi",
            ],
        )
    return (
        [
            "Once olcu alirim: basma, emis, akim ve buzlanma var mi.",
            "Sonra hava tarafina bakarim: fan, kapi, defrost, istif ve hava donusu.",
            "Bu tabloyu gordukten sonra valf, gaz sarji veya elektrik koruma tarafini daraltirim.",
        ],
        [
            "basma-emis basinci",
            "buz var mi",
            "fanlar duzgun donuyor mu",
        ],
    )


def _is_scenario_mode(question: str, history: list[dict[str, str]], language: str) -> bool:
    normalized = _normalize_text(question)
    if any(_normalize_text(token) in normalized for token in SCENARIO_HINTS):
        return True
    if len(history) >= 2:
        history_text = " ".join(item["text"] for item in history if item.get("role") == "user")
        normalized_history = _normalize_text(history_text)
        follow_up_tokens = FOLLOW_UP_PATTERNS["de" if language == "de" else "tr"]
        if any(_normalize_text(token) in normalized for token in follow_up_tokens) and any(
            _normalize_text(token) in normalized_history for token in SCENARIO_HINTS
        ):
            return True
    return False


def _build_scenario_reply(question: str, history: list[dict[str, str]], language: str, answer_level: str) -> dict[str, object] | None:
    combined_user_context = " ".join([item["text"] for item in history if item.get("role") == "user"] + [question]).strip()
    ranked = _rank_faq_entries(combined_user_context, language, limit=3)
    if not ranked or ranked[0][0] < 45:
        return None

    top_entries = [entry for _, entry in ranked]
    facts = _extract_scenario_facts(combined_user_context, language)
    domain = _scenario_domain(top_entries)
    action_lines, requested_facts = _scenario_action_lines(language, domain)
    suggestions: list[str] = []
    for entry in top_entries:
        for item in entry.get("suggestions") or []:
            suggestion = str(item).strip()
            if suggestion and suggestion not in suggestions:
                suggestions.append(suggestion)
    suggestions = suggestions[:4]

    if answer_level == "customer":
        if language == "de":
            bullets = "\n".join(f"- { _scenario_subject(entry, language) }" for entry in top_entries[:2])
            fact_text = ", ".join(facts) if facts else "das aktuelle Fehlerbild"
            request_text = ", ".join(requested_facts)
            answer = (
                "Kurz und einfach: DRC MAN hat den Stoerungsmodus aktiviert.\n"
                f"Ich sehe im Moment vor allem: {fact_text}.\n"
                "Die wahrscheinlichsten Richtungen sind:\n"
                f"{bullets}\n"
                f"Senden Sie mir jetzt bitte drei Daten: {request_text}. "
                "Wenn Sie moechten, erklaere ich es danach im Meister-Niveau."
            )
        else:
            bullets = "\n".join(f"- {_scenario_subject(entry, language)}" for entry in top_entries[:2])
            fact_text = ", ".join(facts) if facts else "mevcut ariza semptomlari"
            request_text = ", ".join(requested_facts)
            answer = (
                "Kisa ve sade anlatim: DRC MAN ariza senaryo modunu acti.\n"
                f"Su an on plana cikan belirtiler: {fact_text}.\n"
                "En guclu yonler:\n"
                f"{bullets}\n"
                f"Simdi bana uc bilgi yazin: {request_text}. "
                "Isterseniz sonra bunu usta seviyesinde adim adim acarim."
            )
        return {
            "ok": True,
            "mode": "scenario_training",
            "answer": answer,
            "sourceSummary": "DRC MAN ariza senaryo modu",
            "suggestions": suggestions,
        }

    if language == "de":
        symptom_line = ", ".join(facts) if facts else "mehrere relevante Stoerungssymptome"
        hypotheses = "\n".join(
            f"{index}. {_scenario_subject(entry, language)}: {_extract_reason_from_answer(entry, language)}"
            for index, entry in enumerate(top_entries, start=1)
        )
        action_block = "\n".join(f"{index}. {line}" for index, line in enumerate(action_lines, start=1))
        request_text = ", ".join(requested_facts)
        answer = (
            "DRC MAN Stoerungsszenario aktiv.\n"
            f"Bis jetzt lese ich folgende Symptome heraus: {symptom_line}.\n"
            "Die aktuell staerksten Hypothesen sind:\n"
            f"{hypotheses}\n"
            "So wuerde ein Meister jetzt vorgehen:\n"
            f"{action_block}\n"
            f"Schicken Sie mir jetzt bitte die naechsten drei Fakten: {request_text}."
        )
    else:
        symptom_line = ", ".join(facts) if facts else "birden fazla anlamli ariza belirtisi"
        hypotheses = "\n".join(
            f"{index}. {_scenario_subject(entry, language)}: {_extract_reason_from_answer(entry, language)}"
            for index, entry in enumerate(top_entries, start=1)
        )
        action_block = "\n".join(f"{index}. {line}" for index, line in enumerate(action_lines, start=1))
        request_text = ", ".join(requested_facts)
        answer = (
            "DRC MAN ariza senaryo modu aktif.\n"
            f"Simdiye kadar gordugum semptomlar: {symptom_line}.\n"
            "Su an en guclu ihtimaller:\n"
            f"{hypotheses}\n"
            "Ben olsam simdi su sirayla giderim:\n"
            f"{action_block}\n"
            f"Simdi bana su uc bilgiyi yazin: {request_text}."
        )

    return {
        "ok": True,
        "mode": "scenario_training",
        "answer": answer,
        "sourceSummary": "DRC MAN ariza senaryo modu",
        "suggestions": suggestions,
    }


def _match_faq_entry(
    question: str,
    language: str,
    answer_level: str = "master",
    files: list[Path] | None = None,
) -> dict[str, object] | None:
    normalized_question = _normalize_text(question)
    question_tokens = set(_tokenize(question))
    if not normalized_question:
        return None

    best_entry: dict[str, object] | None = None
    best_score = 0

    for entry in _load_faq_entries(files):
        score = _score_faq_entry(entry, normalized_question, question_tokens, language)

        if score > best_score:
            best_score = score
            best_entry = entry

    if not best_entry or best_score < 45:
        return None

    answer = best_entry.get("de_answer") if language == "de" else best_entry.get("tr_answer")
    suggestions = best_entry.get("suggestions") or []
    return {
        "ok": True,
        "mode": "faq_training",
        "answer": _adapt_answer_level(str(answer or "").strip(), language, answer_level),
        "sourceSummary": str(best_entry.get("source_summary") or "DRC MAN yerel soru-cevap egitimi"),
        "suggestions": [str(item).strip() for item in suggestions if str(item).strip()],
    }


def _match_pt_concept_entry(question: str, language: str, answer_level: str) -> dict[str, object] | None:
    normalized = _normalize_text(question)
    if not any(hint in normalized for hint in PT_CONCEPT_HINTS):
        return None
    pt_file = Path(__file__).with_name("drc_man_pt_superheat_faq.json")
    return _match_faq_entry(question, language, answer_level, [pt_file])


def _match_master_field_entry(question: str, language: str, answer_level: str) -> dict[str, object] | None:
    normalized = _normalize_text(question)
    if not any(hint in normalized for hint in MASTER_FIELD_HINTS):
        return None
    master_file = Path(__file__).with_name("drc_man_master_field_faq.json")
    return _match_faq_entry(question, language, answer_level, [master_file])


def _match_master_component_entry(question: str, language: str, answer_level: str) -> dict[str, object] | None:
    normalized = _normalize_text(question)
    if not any(hint in normalized for hint in MASTER_COMPONENT_HINTS):
        return None
    component_file = Path(__file__).with_name("drc_man_master_components_faq.json")
    return _match_faq_entry(question, language, answer_level, [component_file])


def main() -> int:
    payload = _load_payload()
    question = str(payload.get("question") or "").strip()
    language = "de" if str(payload.get("language") or "").strip() == "de" else "tr"
    role = _normalize_role(payload.get("role"))
    answer_level = _resolve_answer_level(payload)
    history = _normalize_history(payload.get("history"))
    if not question:
        return _json_out({"ok": False, "error": "empty_question"})

    policy_reply = _evaluate_security_policy(question, history, role, language)
    if policy_reply:
        return _json_out(policy_reply)

    if _is_cold_room_project_question(question):
        project_reply = _build_cold_room_project_reply(question, language, answer_level)
        if project_reply:
            return _json_out(_finalize_reply(project_reply, role, language))

    product_faq = _match_faq_entry(
        question,
        language,
        answer_level,
        [Path(__file__).with_name("drc_man_product_faq.json")],
    )
    if product_faq:
        return _json_out(_finalize_reply(product_faq, role, language))

    pt_match = _match_pt_concept_entry(question, language, answer_level)
    if pt_match:
        return _json_out(_finalize_reply(pt_match, role, language))

    master_match = _match_master_field_entry(question, language, answer_level)
    if master_match:
        return _json_out(_finalize_reply(master_match, role, language))

    component_match = _match_master_component_entry(question, language, answer_level)
    if component_match:
        return _json_out(_finalize_reply(component_match, role, language))

    gas_reply = _build_gas_consulting_reply(question, history, language, answer_level)
    if gas_reply:
        return _json_out(_finalize_reply(gas_reply, role, language))

    if _is_scenario_mode(question, history, language):
        scenario_reply = _build_scenario_reply(question, history, language, answer_level)
        if scenario_reply:
            return _json_out(_finalize_reply(scenario_reply, role, language))

    faq_match = _match_faq_entry(question, language, answer_level)
    if faq_match:
        return _json_out(_finalize_reply(faq_match, role, language))

    drc_man_dir = Path(str(payload.get("drcManDir") or _default_drc_man_dir())).expanduser()
    if not drc_man_dir.exists():
        return _json_out({"ok": False, "error": "drc_man_missing", "path": str(drc_man_dir)})

    sys.path.insert(0, str(drc_man_dir))

    try:
        from init_db import DB_PATH as DRC_MAN_DB_PATH
        from material_consultant import answer_material_consulting
        from training_center import answer_training_question
    except Exception as error:  # pragma: no cover - runtime integration guard
        return _json_out({"ok": False, "error": "import_failed", "details": str(error)})

    normalized_question = question.casefold()
    use_consultant = any(token in normalized_question for token in CONSULT_HINTS)

    try:
        if use_consultant:
            result = answer_material_consulting(question, tone_code="simple")
            answer = str(result.get("answer") or "").strip()
            source_summary = str(result.get("source_summary") or "DRC MAN malzeme danismani")
            mode = "consulting"
        else:
            with tempfile.TemporaryDirectory(prefix="drc_man_bridge_") as temp_dir:
                temp_db_path = Path(temp_dir) / "materials.db"
                shutil.copy2(DRC_MAN_DB_PATH, temp_db_path)
                result = answer_training_question(
                    question,
                    preferred_topics=["malzeme", "proje", "hamburg_stok"],
                    full_spectrum=True,
                    db_path=str(temp_db_path),
                )
            answer = str(result.get("answer") or "").strip()
            topic = str(result.get("topic") or "malzeme")
            source_summary = str(result.get("source_summary") or f"DRC MAN {topic} ajanı")
            mode = "training"
    except Exception as error:  # pragma: no cover - runtime integration guard
        return _json_out({"ok": False, "error": "execution_failed", "details": str(error)})

    if not answer:
        return _json_out({"ok": False, "error": "empty_answer"})

    return _json_out(
        _finalize_reply(
            {
            "ok": True,
            "mode": mode,
            "answer": _adapt_answer_level(answer, language, answer_level),
            "sourceSummary": source_summary,
            "suggestions": [],
            },
            role,
            language,
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
