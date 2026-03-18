const { db } = require("../server/db");

const userId = 1;

const entries = [
  invoice("AKF UG", "RE0350", "2025-09-01", [
    item("Kältemittel R449a", "Sogutucu Gaz", "kg", 1000, 27.5),
    item("Kältemittel R134A", "Sogutucu Gaz", "kg", 1800, 21.0),
  ]),
  invoice("CoolPak", "908", "2024-08-02", [
    item("Kältemittel R290 - 370G / 750ml Propan Einwegdose", "Sogutucu Gaz", "stk", 2, 10.0),
    item("Gasfüllstütze", "Servis Ekipmani", "stk", 1, 15.0),
    item("Kältemittel R600A Einwegdose 370g", "Sogutucu Gaz", "stk", 1, 10.0),
  ]),
  invoice("CoolPak", "918", "2024-08-05", [
    item("Vakuum Pumpe VE115N", "Servis Ekipmani", "stk", 1, 120.0),
    item("Schlauchleitung Manomete Value 150 cm", "Servis Ekipmani", "stk", 1, 40.0),
  ]),
  invoice("ZMT COOLING EOOD", "0000000005", "2025-01-08", [
    item("Embraco Grup 6215GK", "Kompresor", "adet", 5, 169.55),
  ]),
  invoice("VOR spol. s r.o.", "2025160191", "2025-12-10", [
    item("Chladivo R1234YF 5 kg", "Sogutucu Gaz", "ks", 50, 211.5),
  ]),
  invoice("Elektrosan", "202512-001", "2025-12-23", [
    item("PANETS/PPWP-100 Soguk Oda Duvar Paneli (100mm Poly-Poly Kilitli)", "Panel", "m2", 247, 28.23),
    item("PANETS/PPWP-150 Soguk Oda Duvar Paneli (150mm Poly-Poly Kilitli)", "Panel", "m2", 308, 35.69),
    item("SLIDETS/ATS2025.0100PP 200x250 Surgulu Soguk Hava Depo Kapisi", "Kapi", "pcs", 2, 1243.46),
    item("ACSETS/PZ100 Poly Zemin U Aksesuar (50x100x50)", "Aksesuar", "mt", 30, 2.74),
    item("ACSETS/PD120 Poly Dis Kose Aksesuar (50x160)", "Aksesuar", "mt", 40, 2.74),
    item("ACSETS/PZ150 Poly Zemin U Aksesuar (50x150x50)", "Aksesuar", "mt", 40, 3.0),
    item("ACSETS/PD180 Poly Dis Kose Aksesuar (50x180)", "Aksesuar", "mt", 42.5, 2.88),
    item("ACSETS/PVC70 Hijyenik PVC Ic Aksesuar (70mm)", "Aksesuar", "mt", 186, 2.19),
    item("THERMETS/SHSC.MP10100.DT04SE 10 HP Yari Hermetik Split Sogutma Grubu", "Sogutma Grubu", "pcs", 1, 6245.29),
    item("THERMETS/SHSC.LP10160.DT04SE 16 HP Semi Hermetik Sogutma Grubu Dis Unite", "Sogutma Grubu", "pcs", 1, 7174.25),
    item("THERMETS/HSC.MP10020.ET049SE 2 HP Split Sogutma Grubu Dis Unite", "Sogutma Grubu", "pcs", 2, 1477.35),
    item("THERMETS/HSC.MP10030.TT04SE 3 HP Split Sogutma Grubu Dis Unite", "Sogutma Grubu", "pcs", 2, 1872.98),
    item("THERMETS/HSC.MP10050.TT04SE 5 HP Split Sogutma Grubu Dis Unite", "Sogutma Grubu", "pcs", 1, 2420.48),
    item("THERMETS/HSC.LP10020.ET04SE 2 HP Split Sogutma Grubu Dis Unite", "Sogutma Grubu", "pcs", 2, 1477.94),
    item("THERMETS/HSC.LP10030.TT04SE 3 HP Split Sogutma Grubu Dis Unite", "Sogutma Grubu", "pcs", 2, 1786.54),
    item("THERMETS/HSC.LP10050.TT04SE 5 HP Split Sogutma Grubu Dis Unite", "Sogutma Grubu", "pcs", 1, 2420.48),
    item("PANETS/PPWP-80 Soguk Oda Duvar Paneli (80mm Poly-Poly Kilitli)", "Panel", "m2", 127, 23.05),
    item("ACSETS/PZ080 Poly Zemin U Aksesuar (50x80x50)", "Aksesuar", "mt", 30, 2.31),
    item("ACSETS/PD120 Poly Dis Kose Aksesuar (50x120)", "Aksesuar", "mt", 40, 2.31),
  ]),
  invoice("Elektrosan", "202601-001", "2026-01-23", [
    item("Izolasyonlu Bakir Boru 1/4", "Bakir Boru", "mt", 200, 7.0),
    item("Izolasyonlu Bakir Boru 3/8", "Bakir Boru", "mt", 100, 10.0),
    item("Izolasyonlu Bakir Boru 1/2", "Bakir Boru", "mt", 300, 13.0),
    item("Izolasyonlu Bakir Boru 5/8", "Bakir Boru", "mt", 150, 18.0),
    item("Izolasyonlu Bakir Boru 3/4", "Bakir Boru", "mt", 100, 22.0),
    item("22x1 Bakir Boy Boru", "Bakir Boru", "mt", 15, 24.0),
    item("25x1 Bakir Boy Boru", "Bakir Boru", "mt", 30, 30.0),
    item("28x1 Bakir Boy Boru", "Bakir Boru", "mt", 40, 32.0),
    item("2x0,75 Sinyal Kablosu", "Kablo", "mt", 500, 1.0),
    item("19x22mm Izole Boru", "Izolasyon", "mt", 20, 1.0),
    item("19x28mm Izole Boru", "Izolasyon", "mt", 70, 1.0),
  ]),
  invoice("Kontak", "202502-001", "2025-02-07", [
    item("3 HP (0/-18) 380V Tecumseh Komplu Sogutma Grubu", "Sogutma Grubu", "pcs", 1, 1598.93),
    item("7,5 HP (0/+5) 380V Dorin Komplu Sogutma Grubu", "Sogutma Grubu", "pcs", 1, 3843.58),
    item("8 HP (0/-20) 380V Tecumseh Komplu Sogutma Grubu", "Sogutma Grubu", "pcs", 1, 2798.13),
    item("1 HP (0/+5) 220V Tecumseh Komplu Sogutma", "Sogutma Grubu", "pcs", 1, 876.34),
    item("4,5 HP (0/+5) 380V Tecumseh Komplu Sogutma Grubu", "Sogutma Grubu", "pcs", 1, 1875.67),
    item("Sogutma Ic Unite 1694 Watt Fanli Valfli Orifisli", "Evaporator", "pcs", 1, 292.11),
    item("Sogutma Ic Unite 1576 Watt Fanli Valfli Orifisli", "Evaporator", "pcs", 1, 284.43),
    item("Sogutma Ic Unite 1180 Watt Fanli Valfli Orifisli", "Evaporator", "pcs", 1, 273.97),
    item("Sogutma Ic Unite 2803 Watt Fanli Valfli Orifisli", "Evaporator", "pcs", 1, 293.65),
    item("10 HP (0/+5) 380V Dorin Komplu Sogutma Grubu Cift Evapli", "Sogutma Grubu", "pcs", 1, 4158.76),
    item("9mm 125x250 Kontra Heksa Play Wood Panel", "Panel", "pcs", 16, 75.33),
    item("PANETS/PPWP-120 Soguk Oda Sandvic Duvar Paneli", "Panel", "m2", 32.384, 31.11),
    item("PANETS/PWFP-120 Soguk Oda Sandvic Zemin Paneli", "Panel", "m2", 9.108, 48.53),
    item("HINGETS/PTM0919.0120PP 90x180 Menteseli Soguk Hava Depo Kapisi", "Kapi", "pcs", 1, 336.67),
    item("Soguk Hava Depo Aksesuari", "Aksesuar", "mt", 65.5, 2.06),
    item("HINGETS/ATM1020.0120PP 107x185 Menteseli Soguk Hava Depo Kapisi", "Kapi", "pcs", 1, 487.59),
  ]),
  invoice("Kontak", "202504-001", "2025-04-04", [
    item("250 CM DAISY VG Dik Camli Reyon", "Reyon", "pcs", 2, 2542.05),
    item("375 CM DAISY VG Dik Camli Reyon", "Reyon", "pcs", 1, 5255.91),
    item("187,5 CM DAISY VG Dik Camli Reyon", "Reyon", "pcs", 1, 3053.25),
    item("Cephe Tipi Pasta Dolabi", "Dolap", "pcs", 1, 4392.48),
    item("Pasta Dolabi", "Dolap", "pcs", 1, 1825.45),
    item("Soguk Kahvalti Dolabi", "Dolap", "pcs", 1, 2190.54),
    item("Tecumseh CAJ 2464 Z 1.5HP", "Kompresor", "pcs", 2, 277.12),
    item("Tecumseh CAJ 4511 Y 1 HP", "Kompresor", "pcs", 2, 251.74),
    item("Tecumseh CAJ 4492 Y Hermetik Kompresor", "Kompresor", "pcs", 2, 223.28),
    item("ZINGFA 3HP QL3-74 TRI.380V VAN", "Fan", "pcs", 2, 392.62),
  ]),
  invoice("Kontak", "202506-001", "2025-06-10", [
    item("250 CM Plug-In gebogenes Glas", "Reyon", "pcs", 2, 3474.0),
    item("1,5HP (0/+5) 220V Embraco Komp. Sogutma Grubu Dis Unite", "Sogutma Grubu", "pcs", 2, 583.0),
    item("2,5HP (0/+5) 380V Tecumseh Komp. Sogutma Grubu Dis Unite", "Sogutma Grubu", "pcs", 2, 876.0),
    item("3HP (0/+5) 380V Tecumseh Komp. Sogutma Grubu Dis Unite", "Sogutma Grubu", "pcs", 2, 982.0),
    item("2HP (0/-18) 380V Tecumseh Komp. Sogutma Grubu Dis Unite", "Sogutma Grubu", "pcs", 1, 1009.0),
    item("3HP (0/-18) 380V Tecumseh Komp. Sogutma Grubu Dis Unite", "Sogutma Grubu", "pcs", 2, 1123.0),
    item("7HP (0/-18) 380V Tecumseh Komp. Sogutma Grubu Dis Unite", "Sogutma Grubu", "pcs", 1, 1861.0),
    item("8HP (0/-18) 380V Tecumseh Komp. Sogutma Grubu Dis Unite", "Sogutma Grubu", "pcs", 1, 2043.0),
    item("AEY 8mm 5,66 M 40x35 1/2 Evaporator AEY 130 48", "Evaporator", "pcs", 2, 153.0),
    item("MSA35 111 Sogutucu", "Evaporator", "pcs", 2, 243.0),
    item("AEY 504 14546 5100W 1x450 Fansiz Sogutucu", "Evaporator", "pcs", 2, 397.0),
    item("AEY 505 14556 6046W 1x450 Fansiz Sogutucu", "Evaporator", "pcs", 2, 482.0),
    item("AEY 506 14566 6825W 1x450 Fansiz Sogutucu", "Evaporator", "pcs", 2, 554.0),
    item("TEA45 116 8 Sogutucu", "Evaporator", "pcs", 2, 482.0),
    item("SO 260 15056 V2 8889W 1x500 Fansiz Sogutucu", "Evaporator", "pcs", 2, 589.0),
    item("TEA40 126 6 Sogutucu", "Evaporator", "pcs", 2, 618.0),
    item("BYS45 124 6 Sogutucu", "Evaporator", "pcs", 2, 826.0),
    item("TEA45 126 6 Sogutucu", "Evaporator", "pcs", 2, 951.0),
    item("TEA50 126 6 Sogutucu", "Evaporator", "pcs", 2, 953.0),
    item("TEA50 134 8 Sogutucu", "Evaporator", "pcs", 2, 1201.0),
    item("TEA50 136 8 Sogutucu", "Evaporator", "pcs", 2, 1183.0),
    item("TEA50 145 8 Sogutucu", "Evaporator", "pcs", 2, 1673.0),
    item("TEA45 124 8 Sogutucu", "Evaporator", "pcs", 1, 625.0),
    item("TEA50 124 8 Sogutucu", "Evaporator", "pcs", 1, 793.0),
    item("TEA45 126 8 Sogutucu", "Evaporator", "pcs", 1, 911.0),
    item("TEA50 126 8 T2 Sogutucu", "Evaporator", "pcs", 1, 1141.0),
    item("TEA50 136 8 Sogutucu T2", "Evaporator", "pcs", 1, 1314.0),
    item("TEA50 146 8 Sogutucu T2", "Evaporator", "pcs", 1, 2214.0),
    item("DCB31 Statik Defrost Sogutma Kontrol Cihazi", "Kontrol Cihazi", "pcs", 1000, 10.0),
    item("DCB100 Soguk Oda Kontrol Cihazi", "Kontrol Cihazi", "pcs", 40, 42.0),
    item("Embraco NEU6215GK Kompressor", "Kompresor", "pcs", 40, 108.0),
    item("Embraco NEU6220GK Kompressor", "Kompresor", "pcs", 40, 136.0),
    item("Kucuk Sase", "Sase", "pcs", 40, 8.0),
  ]),
  invoice("Kontak", "202508-001", "2025-08-27", [
    item("Hisense Inverter 48.000 BTU Salon Tipi Klima Ic Unite AUF148UR4RMPA1", "Klima", "pcs", 2, 640.0),
    item("Hisense Inverter 48.000 BTU Salon Tipi Klima Dis Unite AUW248U6RQ1", "Klima", "pcs", 2, 690.0),
    item("Drenaj Hortumu 5/8", "Hortum", "mt", 100, 0.30),
    item("Su Tahliye Pompasi Kanal Tip Siccom Eco Line", "Pompa", "pcs", 5, 70.54),
    item("Su Tahliye Pompasi Kovali Tip Siccom Ecotank 2,5 lt", "Pompa", "pcs", 5, 79.05),
    item("Izolasyon Hortumu 9x28 28mm", "Izolasyon", "mt", 66, 0.61),
    item("Izolasyon Hortumu 09x22mm", "Izolasyon", "mt", 54, 0.49),
    item("Bakir Boru 28.00x1.00", "Bakir Boru", "mt", 25, 11.92),
    item("Bakir Boru 22.00x1.00", "Bakir Boru", "mt", 25, 9.49),
    item("Ecutherm2 3/8 080 + 5/8 100 / 9mm Siyah B Class", "Izolasyon", "mt", 100, 13.68),
    item("Ecutherm2 1/4 080 + 1/2 080 / 9mm Siyah", "Izolasyon", "mt", 100, 9.49),
    item("GNY GNKY 750 Plastik Yatik Tavan Tipi Sogutucu", "Evaporator", "pcs", 5, 111.72),
    item("GNY GKE 120 Ticari Yatik Tavan Tipi Evap", "Evaporator", "pcs", 5, 122.41),
    item("GNY GKE 220 Ticari Yatik Tavan Tipi Evap", "Evaporator", "pcs", 5, 197.40),
    item("GNY GNKF 850 Orta Tezgah Alti Kare Fanli", "Evaporator", "pcs", 5, 105.70),
    item("GNY GNKF 1200 Orta Tezgah Alti Kare Fanli", "Evaporator", "pcs", 5, 136.47),
    item("2 HP Sogutma Grubu Takim", "Sogutma Grubu", "pcs", 1, 1825.0),
    item("Menteseli Soguk Hava Depo Kapisi (100mm Poly-Poly)", "Kapi", "pcs", 2, 275.0),
  ]),
  invoice("Kontak", "202510-001", "2025-10-22", [
    item("Vertical Single Door Industrial Refrigerator (+2C to +8C)", "Dolap", "pcs", 2, 900.0),
    item("Vertical Single Door Industrial Refrigerator (-20C to -18C)", "Dolap", "pcs", 4, 1000.0),
    item("Vertical Double Door Industrial Refrigerator (+2C to +8C)", "Dolap", "pcs", 2, 1400.0),
    item("Vertical Double Door Industrial Refrigerator (-20C to -18C)", "Dolap", "pcs", 2, 1500.0),
    item("BYS - SH20 BOX 20M2 Kabin Maxsi", "Kabin", "pcs", 4, 341.20),
    item("BYS - SH30 BOX 30M2 Kabin Maxsi", "Kabin", "pcs", 5, 447.60),
    item("BYS - SH35 BOX 35M2 Kabin Maxsi", "Kabin", "pcs", 5, 471.20),
    item("BYS - SH60 BOX 60M2 Kabin Maxsi", "Kabin", "pcs", 10, 886.70),
    item("BYS - SH70 BOX 70M2 Kabin Maxsi", "Kabin", "pcs", 4, 917.30),
    item("Menteseli Soguk Hava Depo Kapisi (100mm Poly-Poly)", "Kapi", "pcs", 49, 275.0),
  ]),
  invoice("Yildiztepe Enerji", "M012025000000116", "2025-08-28", [
    item("SYSVRF2 280 AIR EVO A HP R", "VRF", "adet", 2, 1597.5),
    item("SYSVRF3 CASSETTE 71 Q", "VRF", "adet", 4, 295.0),
    item("SYSPANEL CASSETTE EVO", "VRF", "adet", 7, 70.0),
    item("SYSVRF3 WGC86S", "VRF", "adet", 14, 32.0),
    item("SYSVRF JOINT IN 01 2P", "VRF", "adet", 8, 17.0),
    item("SYSVRF JOINT IN 02 2P", "VRF", "adet", 3, 19.0),
    item("SYSVRF3 400 AIR EVO-S HP R", "VRF", "adet", 1, 2560.0),
    item("SYSVRF3 WALL 36 Q", "VRF", "adet", 4, 228.0),
    item("SYSVRF3 CASSETTE 90 Q", "VRF", "adet", 3, 320.0),
    item("SYSVRF3 WALL 56 Q", "VRF", "adet", 2, 265.0),
    item("SYSVRF3 WALL 71 Q", "VRF", "adet", 1, 275.0),
  ]),
  invoice("Kontak", "DR02026000000011", "2026-02-12", [
    item("POE 170 1LT Yag", "Yag", "adet", 708, 5.3),
    item("POE 170 4LT Yag", "Yag", "adet", 400, 22.0),
    item("POE 68 4LT Yag", "Yag", "adet", 180, 22.0),
    item("POE 32 5 LT Yag", "Yag", "adet", 16, 26.0),
    item("POE 68 5 LT Yag", "Yag", "adet", 230, 26.0),
    item("ZINGFA 2HP QR3-44 Trifaze 380V", "Kompresor", "adet", 4, 305.0),
    item("ZINGFA QL3 74 3HP Trifaze 380V", "Kompresor", "adet", 9, 315.0),
    item("6HP Kompresor ZMT-453", "Kompresor", "adet", 14, 130.0),
    item("Sogutucu Elektrik Panosu", "Pano", "adet", 28, 75.0),
    item("100x18 Sira Pasta Sog", "Sogutucu", "adet", 1, 300.0),
    item("6HP Ic Sogutma Unitesi", "Sogutma Unitesi", "adet", 5, 750.0),
    item("2HP Sogutma Unitesi Ic", "Sogutma Unitesi", "adet", 1, 500.0),
    item("2HP Sogutma Unitesi Dis", "Sogutma Unitesi", "adet", 1, 500.0),
    item("Guven 6LT Depo 1/2 Vanali", "Depo", "adet", 14, 12.0),
    item("1/2 Gozetleme Cami Kaynakli", "Aksesuar", "adet", 14, 12.0),
    item("Klima Vanasi", "Aksesuar", "adet", 5, 10.0),
    item("Izolasyonlu Bakir Boru (1/4-3/8)", "Bakir Boru", "adet", 8.8, 20.0),
    item("Musir 13-16", "Elektrik", "adet", 14, 13.0),
    item("3/8 Gozetleme Cami", "Aksesuar", "adet", 6, 10.0),
    item("Embraco 6215 GK R-404", "Kompresor", "adet", 30, 110.0),
    item("Embraco NEU 6220GK- CSR", "Kompresor", "adet", 30, 140.0),
    item("NJX 2219 GS", "Kompresor", "adet", 5, 220.0),
    item("Soguk Hava Depo Kapisi", "Kapi", "adet", 31, 220.0),
    item("DCB100 Custom Cold Room Electronic Control Unit", "Kontrol Cihazi", "adet", 20, 50.0),
  ]),
];

function invoice(supplier, invoiceNo, date, lines) {
  return { supplier, invoiceNo, date, lines };
}

function item(name, category, unit, quantity, unitPrice) {
  return { name, category, unit, quantity, unitPrice };
}

const findItemStmt = db.prepare("SELECT id FROM items WHERE name = ?");
const insertItemStmt = db.prepare(`
  INSERT INTO items (name, category, unit, min_stock, barcode, notes, default_price, sale_price)
  VALUES (?, ?, ?, 0, NULL, ?, ?, ?)
`);
const findMovementStmt = db.prepare(`
  SELECT id FROM movements
  WHERE item_id = ? AND type = 'entry' AND quantity = ? AND unit_price = ? AND movement_date = ? AND note = ?
`);
const insertMovementStmt = db.prepare(`
  INSERT INTO movements (item_id, type, quantity, unit_price, movement_date, note, user_id)
  VALUES (?, 'entry', ?, ?, ?, ?, ?)
`);

let createdItems = 0;
let createdMovements = 0;
let skipped = 0;

db.exec("BEGIN");
try {
  for (const record of entries) {
    for (const line of record.lines) {
      let itemRow = findItemStmt.get(line.name);
      if (!itemRow) {
        const notes = `Gelen fatura tedarikcisi: ${record.supplier}`;
        const result = insertItemStmt.run(line.name, line.category, line.unit, notes, line.unitPrice, deriveSalePrice(line.unitPrice));
        itemRow = { id: Number(result.lastInsertRowid) };
        createdItems += 1;
      }

      const note = `Fatura import | ${record.supplier} | ${record.invoiceNo}`;
      const existing = findMovementStmt.get(itemRow.id, line.quantity, line.unitPrice, record.date, note);
      if (existing) {
        skipped += 1;
        continue;
      }

      insertMovementStmt.run(itemRow.id, line.quantity, line.unitPrice, record.date, note, userId);
      createdMovements += 1;
    }
  }
  db.exec("COMMIT");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

console.log(JSON.stringify({ createdItems, createdMovements, skipped }, null, 2));

function deriveSalePrice(price) {
  return Number((Number(price || 0) * 1.22).toFixed(2));
}
