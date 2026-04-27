#!/usr/bin/env node

const {
  ENV_PATH,
  loadEnvFile,
} = require("./lib/database-tools");

loadEnvFile(ENV_PATH);

const { initDatabase, get, execute, withTransaction } = require("../server/db");

const PRICE_FIXES = [
  {
    key: "ERRECOM-POE68-20L",
    name: "Errecom Endustriyel POE 68 Yag Bidonu 20L",
    defaultPrice: 125,
    salePrice: 125,
    listPrice: 150,
  },
  {
    key: "ERRECOM-POE170-1L",
    defaultPrice: 5.3,
    salePrice: 9,
    listPrice: 10.8,
  },
  {
    key: "ERRECOM-POE170-4L",
    defaultPrice: 22,
    salePrice: 45,
    listPrice: 54,
  },
  {
    key: "ERRECOM-POE68-4L",
    defaultPrice: 22,
    salePrice: 45,
    listPrice: 54,
  },
  {
    key: "NS88PU",
    defaultPrice: 1.74,
    salePrice: 2.18,
    listPrice: 2.62,
  },
  {
    key: "80-CM",
    defaultPrice: 2.36,
    salePrice: 2.83,
    listPrice: 3.4,
  },
  {
    key: "100-CM",
    defaultPrice: 2.59,
    salePrice: 3.11,
    listPrice: 3.73,
  },
  {
    key: "120-CM",
    defaultPrice: 2.95,
    salePrice: 3.54,
    listPrice: 4.25,
  },
  {
    key: "13-CM",
    defaultPrice: 3.13,
    salePrice: 3.91,
    listPrice: 4.69,
  },
  {
    key: "DCB-100-PLUS",
    name: "DRC DCB 100 Plus Kontrol Unitesi",
    defaultPrice: 50,
    salePrice: 55,
    listPrice: 65,
  },
  {
    key: "ECOLINE-POMPA",
    name: "Siccom Eco Line Kanal Tipi Drenaj Pompasi",
    defaultPrice: 70.54,
    salePrice: 84.65,
    listPrice: 101.58,
  },
  {
    key: "GMH-052-F-1-4",
    name: "GVN GMH 052F 1/4 Likit Filtre Dryer",
    defaultPrice: 3.2,
    salePrice: 3.2,
    listPrice: 3.84,
  },
  {
    key: "GMH-052-F-3-8",
    name: "GVN GMH 052F 3/8 Likit Filtre Dryer",
    defaultPrice: 7.68,
    salePrice: 7.68,
    listPrice: 9.22,
  },
  {
    key: "SYJ6ODF-1-4-SHOULDER",
    name: "Sanhua SYJ6ODF 1/4 Gozetleme Cami",
    defaultPrice: 10,
    salePrice: 10,
    listPrice: 12,
  },
  {
    key: "GZF18-30-18-70W",
    name: "Weiguang YZF18-30 18/70W Fan Motoru",
    defaultPrice: 10.58,
    salePrice: 12.7,
    listPrice: 15.24,
  },
  {
    key: "G-BOX-15C1-135",
    name: "Gunay G-BOX 15C1-135 Kondanser Kabini",
    defaultPrice: 330,
    salePrice: 412.5,
    listPrice: 495,
  },
  {
    key: "GENEL-ELEKTRIK-PANOSU",
    name: "Genel Sogutucu Elektrik Panosu",
    defaultPrice: 75,
    salePrice: 90,
    listPrice: 108,
  },
  {
    key: "HLRGR33B05B3B3",
    name: "GVN Yatay Likit Tanki HLR.GR.33B.05",
    defaultPrice: 110.85,
    salePrice: 110.85,
    listPrice: 133.02,
  },
  {
    key: "VLRA33B06B3C3",
    name: "GVN Dikey Likit Tanki VLR.A.33B.06",
    defaultPrice: 133.37,
    salePrice: 133.37,
    listPrice: 160.04,
  },
  {
    key: "QQR3-74",
    name: "Zingfa QQR3-74 3.5 HP Trifaze Kompresor",
    defaultPrice: 315,
    salePrice: 350,
    listPrice: 380,
  },
  {
    key: "FRIGOCRAFT-ACIK-GRUP-KOMPRESOR",
    name: "Frigocraft Acik Grup Kompresor 1 HP R290",
    defaultPrice: 1800.37,
    salePrice: 2196.45,
    listPrice: 2635.74,
  },
  {
    key: "BYS-TEA-1168",
    name: "Buz Yapsam BYS TEA 1168 Evaporator",
    defaultPrice: 482,
    salePrice: 578.4,
    listPrice: 694.08,
  },
  {
    key: "KAPI-MENTESELI-100MM-POLY",
    defaultPrice: 275,
    salePrice: 350,
    listPrice: 400,
  },
  {
    key: "KAPI-GENEL-SOGUK-HAVA-DEPO",
    defaultPrice: 220,
    salePrice: 350,
    listPrice: 400,
  },
  {
    key: "SYSVRF2260AIR-EWAHPR",
    name: "Systemair VRF Dis Unite SYSVRF2 260 AIR EVO",
    defaultPrice: 4685.2,
    salePrice: 5856.5,
    listPrice: 7027.8,
  },
  {
    key: "SYSVRF3VOL28Q",
    name: "Systemair VRF Ic Unite WALL 28 Q",
    defaultPrice: 439.96,
    salePrice: 549.95,
    listPrice: 659.94,
  },
  {
    key: "SYSVRF3VOL36Q",
    name: "Systemair VRF Ic Unite WALL 36 Q",
    defaultPrice: 228,
    salePrice: 228,
    listPrice: 273.6,
  },
  {
    key: "SYSVRF3VOL56Q",
    name: "Systemair VRF Ic Unite WALL 56 Q",
    defaultPrice: 265,
    salePrice: 265,
    listPrice: 318,
  },
  {
    key: "SYSVRF3VOL71Q",
    name: "Systemair VRF Ic Unite WALL 71 Q",
    defaultPrice: 275,
    salePrice: 275,
    listPrice: 330,
  },
  {
    key: "SYSVRF3WGC86S",
    name: "Systemair VRF Kumanda WGC86S",
  },
];

async function main() {
  await initDatabase();

  const summary = {
    updated: [],
    missing: [],
  };

  await withTransaction(async (tx) => {
    for (const fix of PRICE_FIXES) {
      const item = await tx.get(
        "SELECT id, name, product_code, default_price, sale_price, list_price FROM items WHERE product_code = ? LIMIT 1",
        [fix.key],
      );

      if (!item) {
        summary.missing.push(fix.key);
        continue;
      }

      const nextName = fix.name || item.name;
      const nextDefaultPrice = fix.defaultPrice ?? Number(item.default_price || item.defaultPrice || 0);
      const nextSalePrice = fix.salePrice ?? Number(item.sale_price || item.salePrice || 0);
      const nextListPrice = fix.listPrice ?? Number(item.list_price || item.listPrice || 0);

      await tx.execute(
        `
          UPDATE items
          SET name = ?, default_price = ?, sale_price = ?, list_price = ?
          WHERE id = ?
        `,
        [
          nextName,
          nextDefaultPrice,
          nextSalePrice,
          nextListPrice,
          Number(item.id),
        ]
      );

      summary.updated.push({
        id: Number(item.id),
        productCode: fix.key,
        name: nextName,
        defaultPrice: nextDefaultPrice,
        salePrice: nextSalePrice,
        listPrice: nextListPrice,
      });
    }
  });

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
