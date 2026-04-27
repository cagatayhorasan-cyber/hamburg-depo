const fs = require("fs");
const path = require("path");

loadEnv(path.join(process.cwd(), ".env"));

const { initDatabase, execute, query } = require("../server/db");

const PRICE_UPDATES = [
  {
    id: 22496,
    name: "Silikon Eco White",
    salePrice: 2.3,
    source: "Akakce Selsil 280 gr silikon 120 TL, EUR/TRY 52.006",
  },
  {
    id: 22495,
    name: "PU Kopuk NS88",
    salePrice: 2.9,
    source: "Hirdavatdepom Sibax NS88 149.90 TL, EUR/TRY 52.006",
  },
  {
    id: 22494,
    name: "Kaucuk Izolasyon Karisik",
    salePrice: 299,
    source: "Trendyol Ottocool 50 m 1/4-3/8 izolasyonlu bakir boru 15555.55 TL, EUR/TRY 52.006",
  },
  {
    id: 22493,
    name: "Servis Valfi Sanhua 1/4 ve 3/8 Karisik",
    salePrice: 3,
    source: "Karmakmarket Sanhua 1/4 123.74 TL ve 3/8 183.67 TL ortalama, EUR/TRY 52.006",
  },
  {
    id: 22492,
    name: "Filtre Drier RFD 052S",
    salePrice: 12.5,
    source: "KeepSupply RFD-052S 14.22 USD, USD/EUR 0.8611",
  },
  {
    id: 22491,
    name: "Filtre Drier GMH 3/8",
    salePrice: 12.5,
    source: "KeepSupply RFD-053S muadil 14.47 USD, USD/EUR 0.8611",
  },
  {
    id: 22490,
    name: "Filtre Drier GMH 1/4",
    salePrice: 12.5,
    source: "KeepSupply RFD-052S muadil 14.22 USD, USD/EUR 0.8611",
  },
  {
    id: 22489,
    name: "Drenaj Pompasi A1",
    salePrice: 37,
    source: "Value M1 24L/h 12m muadil 42.60 USD, USD/EUR 0.8611",
  },
  {
    id: 22488,
    name: "Fan Motoru YZF34-45",
    salePrice: 21.9,
    source: "n11/Frigoshop Weiguang YZF34-45 1138.09 TL, EUR/TRY 52.006",
  },
  {
    id: 22487,
    name: "Fan Motoru YZF18-30",
    salePrice: 13.9,
    source: "n11/Esen Sogutma Weiguang YZF18-30 722.65 TL, EUR/TRY 52.006",
  },
  {
    id: 22486,
    name: "Fan Motoru YZF25-40",
    salePrice: 15.45,
    source: "Frigoshop Weiguang YZF25-40 15.45 EUR + KDV",
  },
  {
    id: 22485,
    name: "Fan Motoru YZF10-20",
    salePrice: 13.31,
    source: "Frigoshop Weiguang YZF10-20 13.31 EUR + KDV",
  },
  {
    id: 22484,
    name: "Kontrol Unitesi DCB 100/300/350",
    salePrice: 75,
    source: "Teksogutan DRC DCB100 60 EUR ve DCB300 75 EUR; karisik kart icin ust fiyat",
  },
  {
    id: 22483,
    name: "Elektrik Panosu EX-100",
    salePrice: 79.99,
    source: "EMS/Mutfak Merkezi fiyat listesi DRC EX16T70SH muadil 79.99 EUR",
  },
  {
    id: 22481,
    name: "Genlesme Valfi RFKH022",
    salePrice: 57,
    source: "Sanhua TXVHE-22-3S muadil 65.95 USD, USD/EUR 0.8611",
  },
  {
    id: 22480,
    name: "VRF Ic Unite WALL 28 Q",
    salePrice: 549.95,
    source: "Fachklima24 Systemair SYSVRF2 WALL 28 Q net 549.95 EUR",
  },
  {
    id: 22477,
    name: "VRF Dis Unite SYSVRF2 260 AIR EVO",
    salePrice: 5856.5,
    source: "Fachklima24 Systemair SYSVRF 260 AIR EVO A HP R net 5856.50 EUR",
  },
  {
    id: 22420,
    name: "R290 Gazi (Sogutucu Gaz / Propan)",
    salePrice: 23.33,
    source: "DRC gercek fiyat: 6 kg tup 140 EUR, 23.33 EUR/kg",
  },
];

async function main() {
  await initDatabase();

  const updated = [];
  for (const item of PRICE_UPDATES) {
    const existing = await query("SELECT id, name, notes, sale_price AS \"salePrice\" FROM items WHERE id = ?", [item.id]);
    const row = existing[0];
    if (!row) {
      updated.push({ id: item.id, name: item.name, status: "missing" });
      continue;
    }

    const noteLine = `Fiyat kaynagi: ${item.source}`;
    const currentNotes = String(row.notes || "").trim();
    const nextNotes = currentNotes.includes("Fiyat kaynagi:")
      ? currentNotes.replace(/Fiyat kaynagi:.*$/m, noteLine)
      : [currentNotes, noteLine].filter(Boolean).join("\n");

    await execute(
      "UPDATE items SET sale_price = ?, notes = ? WHERE id = ?",
      [item.salePrice, nextNotes, item.id]
    );

    updated.push({
      id: item.id,
      name: row.name,
      previousSalePrice: Number(row.salePrice || 0),
      salePrice: item.salePrice,
      source: item.source,
    });
  }

  console.log(JSON.stringify({ updated: updated.filter((item) => item.status !== "missing").length, rows: updated }, null, 2));
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index === -1) {
      continue;
    }
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
