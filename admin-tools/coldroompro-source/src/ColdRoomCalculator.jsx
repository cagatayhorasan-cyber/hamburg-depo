import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { translations } from "./i18n";
import { CATALOG, OPTIONS_CATALOG, SYSTEM_TYPES, COMPRESSOR_BRANDS } from "./productCatalog";
import { MATERIALS, MATERIAL_CATEGORIES, PIPE_CATALOG, INSULATION_CATALOG } from "./materialCatalog";

async function openPdfUrl(url) {
  const u = (url && String(url).trim()) || "";
  if (!u || u === "about:blank") return false;
  try {
    const { Capacitor } = await import("@capacitor/core");
    const { Browser } = await import("@capacitor/browser");
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url: u });
      return true;
    }
  } catch (e) { console.error(e); }
  const w = window.open(u, "_blank");
  return !!w;
}

/** Android'de Browser yerel URI açmıyor (about:blank). Paylaş ekranını açıyoruz; kullanıcı Chrome / Kaydet seçer. */
async function openHtmlInBrowser(htmlContent, lang) {
  if (!htmlContent || typeof htmlContent !== "string") return false;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const result = await shareHtmlAsFile(htmlContent, lang);
      if (!result.ok && result.error !== "not_native") {
        alert(lang === "tr" ? "Hata: " + result.error : "Fehler: " + result.error);
      }
      return result.ok;
    }
  } catch (e) { console.error(e); return false; }
  const dataUrl = "data:text/html;charset=utf-8," + encodeURIComponent(htmlContent);
  try {
    const w = window.open(dataUrl, "_blank");
    return !!w;
  } catch (err) {
    console.error(err);
    return false;
  }
}

async function webShareHtml(htmlContent, lang) {
  try {
    if (typeof navigator.share !== "function") return { ok: false, error: "navigator.share yok" };
    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const fileName = lang === "tr" ? "teklif.html" : "angebot.html";
    const file = new File([blob], fileName, { type: "text/html" });
    if (navigator.canShare && !navigator.canShare({ files: [file] })) return { ok: false, error: "Dosya paylaşımı desteklenmiyor" };
    await navigator.share({
      title: lang === "tr" ? "Soğuk oda teklifi" : "Kühlraum-Angebot",
      files: [file],
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

async function shareHtmlAsFile(htmlContent, lang) {
  const TAG = "[ColdRoomPro]";
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) {
      console.warn(TAG, "shareHtmlAsFile: not native, skip");
      return { ok: false, error: "not_native" };
    }
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const fileName = lang === "tr" ? "coldroompro-teklif.html" : "coldroompro-angebot.html";
    console.log(TAG, "Dosyaya yazılıyor:", fileName);
    await Filesystem.writeFile({
      path: fileName,
      data: htmlContent,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    const { uri } = await Filesystem.getUri({
      directory: Directory.Cache,
      path: fileName,
    });
    console.log(TAG, "Paylaş açılıyor, uri:", uri?.substring?.(0, 60) + "...");
    const shareOpts = {
      title: lang === "tr" ? "Soğuk oda teklifi" : "Kühlraum-Angebot",
      dialogTitle: lang === "tr" ? "Kaydet veya Chrome'da aç" : "Speichern oder in Chrome öffnen",
    };
    try {
      await Share.share({ ...shareOpts, files: [uri] });
      console.log(TAG, "Share.share(files) tamamlandı");
    } catch (filesErr) {
      console.warn(TAG, "Share.share(files) hatası, url ile deniyor:", filesErr?.message || filesErr);
      await Share.share({ ...shareOpts, url: uri });
      console.log(TAG, "Share.share(url) tamamlandı");
    }
    return { ok: true };
  } catch (e) {
    console.error(TAG, "shareHtmlAsFile HATA:", e?.message || String(e), e);
    return { ok: false, error: e?.message || String(e) };
  }
}

const INITIAL_COMPANY = {
  name: "D-R-C Kältetechnik GmbH",
  owner: "Cagatay Horasan",
  address: "Schildkamp 1, 59063 Hamm, Deutschland",
  warehouse: "Lauenburger Landstraße 3b, 21039 Börnsen, Deutschland",
  phone: "+49 1522 1581762",
  email: "info@durmusbaba.com",
  email2: "info@durmusbaba.de",
  web: "www.durmusbaba.com",
  taxId: "USt-IdNr.: ATU73555618",
  registerNr: "HRB 11217 - Amtsgericht Hamm",
  steuernummer: "322/577/1909",
};

const INSULATION_K = { 60: 0.38, 80: 0.29, 100: 0.23, 120: 0.19, 150: 0.15, 200: 0.12 };
const PRODUCT_TYPES = {
  "Obst & Gemüse": { temp: 2, rh: 90, heat: 3.5, breathRate: 0.06 },
  "Fleisch (frisch)": { temp: 0, rh: 85, heat: 3.2, breathRate: 0 },
  "Tiefkühl Fleisch": { temp: -18, rh: 90, heat: 2.5, breathRate: 0 },
  "Tiefkühl Fisch": { temp: -20, rh: 90, heat: 2.8, breathRate: 0 },
  "Milchprodukte": { temp: 4, rh: 80, heat: 3.1, breathRate: 0 },
  "Tiefkühlkost": { temp: -22, rh: 85, heat: 2.0, breathRate: 0 },
  "Blumen": { temp: 5, rh: 90, heat: 2.0, breathRate: 0.03 },
  "Bier / Getränke": { temp: 4, rh: 65, heat: 3.8, breathRate: 0 },
  "Eis": { temp: -25, rh: 90, heat: 2.0, breathRate: 0 },
  "Benutzerdefiniert": { temp: 0, rh: 85, heat: 3.0, breathRate: 0 },
};

const ROOM_ENVELOPE_PRICES = {
  panelM2: { 60: 6.5, 80: 7.0, 100: 7.5, 120: 8.5, 150: 10.5, 200: 13.0 },
  door: { 60: 320, 80: 335, 100: 350, 120: 380, 150: 420, 200: 480 },
};

function roundOfferValue(value, decimals = 2) {
  const n = Number(value) || 0;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function formatOfferQty(value) {
  const qty = Number(value) || 0;
  return Number.isInteger(qty)
    ? String(qty)
    : qty.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function getRoomPanelUnitPrice(thickness) {
  return ROOM_ENVELOPE_PRICES.panelM2[Number(thickness)] || ROOM_ENVELOPE_PRICES.panelM2[100];
}

function getRoomDoorUnitPrice(thickness) {
  return ROOM_ENVELOPE_PRICES.door[Number(thickness)] || ROOM_ENVELOPE_PRICES.door[100];
}

function normalizeSharedName(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeSharedToken(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function sharedCandidateScore(item) {
  let score = 0;
  if (item?.productCode) score += 120;
  if (item?.barcode) score += 40;
  if (item?.visiblePrice > 0) score += 200 + item.visiblePrice;
  if (item?.brand) score += 10;
  return score;
}

function buildSharedLookup(sharedItems = []) {
  const byCode = new Map();
  const byName = new Map();

  for (const item of sharedItems) {
    const safeItem = {
      name: String(item?.name || ""),
      brand: String(item?.brand || ""),
      productCode: String(item?.productCode || ""),
      barcode: String(item?.barcode || ""),
      visiblePrice: Number(item?.visiblePrice || 0),
      codes: Array.isArray(item?.codes) ? item.codes.map((code) => normalizeSharedToken(code)).filter(Boolean) : [],
    };

    for (const code of safeItem.codes) {
      const existing = byCode.get(code);
      if (!existing || sharedCandidateScore(safeItem) > sharedCandidateScore(existing)) {
        byCode.set(code, safeItem);
      }
    }

    const nameKey = normalizeSharedName(safeItem.name);
    const existingByName = byName.get(nameKey);
    if (nameKey && (!existingByName || sharedCandidateScore(safeItem) > sharedCandidateScore(existingByName))) {
      byName.set(nameKey, safeItem);
    }
  }

  return { byCode, byName };
}

function findSharedItemMatch(material, lookup) {
  const specs = material?.specs || {};
  const codes = [
    material?.code,
    specs?.bom,
    specs?.repa_de_code,
    specs?.repa_it_code,
    specs?.compressor_model,
  ].map(normalizeSharedToken).filter(Boolean);

  for (const code of codes) {
    if (lookup.byCode.has(code)) {
      return lookup.byCode.get(code);
    }
  }

  return lookup.byName.get(normalizeSharedName(material?.name)) || null;
}

function applySharedMaterialOverrides(materials, sharedItems) {
  const lookup = buildSharedLookup(sharedItems);
  return materials.map((material) => {
    const match = findSharedItemMatch(material, lookup);
    if (!match) {
      return material;
    }
    return {
      ...material,
      name: match.name || material.name,
      brand: match.brand || material.brand,
      code: match.productCode || match.barcode || material.code,
      price: match.visiblePrice > 0 ? match.visiblePrice : material.price,
    };
  });
}

function applySharedSystemOverrides(rows, sharedItems) {
  const lookup = buildSharedLookup(sharedItems);
  return rows.map((row) => {
    const outdoor = lookup.byCode.get(normalizeSharedToken(row.code)) || lookup.byName.get(normalizeSharedName(row.outdoor));
    const indoor = lookup.byCode.get(normalizeSharedToken(row.evapCode)) || lookup.byName.get(normalizeSharedName(row.indoor));

    return {
      ...row,
      brand: outdoor?.brand || row.brand,
      outdoor: outdoor?.name || row.outdoor,
      outdoorPrice: outdoor?.visiblePrice > 0 ? outdoor.visiblePrice : row.outdoorPrice,
      indoor: indoor?.name || row.indoor,
      indoorPrice: indoor?.visiblePrice > 0 ? indoor.visiblePrice : row.indoorPrice,
    };
  });
}

function getRoomEnvelopeArea(roomData) {
  const width = Number(roomData.width) || 0;
  const depth = Number(roomData.depth) || 0;
  const height = Number(roomData.height) || 0;
  const doorArea = (Number(roomData.doorWidth) || 0) * (Number(roomData.doorHeight) || 0);
  return Math.max(0, (2 * width * height) + (2 * depth * height) + (width * depth) - doorArea);
}

function buildRoomEnvelopeProducts(roomData, lang) {
  const panelArea = roundOfferValue(getRoomEnvelopeArea(roomData), 1);
  const panelThickness = Number(roomData.panelThickness) || 100;
  const panelUnitPrice = getRoomPanelUnitPrice(panelThickness);
  const doorUnitPrice = getRoomDoorUnitPrice(panelThickness);
  const items = [];

  if (panelArea > 0) {
    items.push({
      id: "auto-room-panels",
      auto: true,
      category: lang === "tr" ? "Oda Gövdesi" : "Raumhülle",
      name: lang === "tr" ? "Sandviç Panel Seti" : "Sandwichpaneel-Set",
      model: `${panelArea.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m² | ${panelThickness} mm PIR`,
      price: panelUnitPrice,
      qty: panelArea,
    });
  }

  if ((Number(roomData.doorWidth) || 0) > 0 && (Number(roomData.doorHeight) || 0) > 0) {
    items.push({
      id: "auto-room-door",
      auto: true,
      category: lang === "tr" ? "Oda Gövdesi" : "Raumhülle",
      name: lang === "tr" ? "Soğuk Oda Kapısı" : "Kühlraumtür",
      model: `${roomData.doorWidth} × ${roomData.doorHeight} m | ${panelThickness} mm`,
      price: doorUnitPrice,
      qty: 1,
    });
  }

  return items;
}

function localizeMaterialName(name, lang) {
  if (!name || lang === "tr") return name;
  let result = String(name);
  result = result.replace(/Emici\s+Aksiyel\s+Fan/gi, "Ansaug-Axialventilator");
  result = result.replace(/Üfleme\s+Aksiyel\s+Fan/gi, "Ausblas-Axialventilator");
  result = result.replace(/Vanasız[-\s]*Kaynak\s+Bağlantılı/gi, "ohne Ventil - Schweißanschluss");
  result = result.replace(/dual\s+frekans/gi, "Dual-Frequenz");
  result = result.replace(/Soğuk\s+Oda/gi, "Kühlraum");
  return result;
}

const LS_CUSTOMERS_KEY = "drc_customers";
const LS_OFFERS_KEY = "drc_offers";
const LS_STOCK_KEY = "drc_stock";

function loadFromLS(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function saveToLS(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* ignore */ }
}

function Cold3DView({ width, height, depth, panelThickness, innerTemp, doorWidth = 1.0, doorHeight = 2.1, equipmentLayout, pipeConfig, selectedOptions, registerCapture }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const rotRef = useRef({ x: -25, y: 35 });
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0 });
  const layout = equipmentLayout || { condenser: true, evaporator: true, piping: true, thermostat: true };
  const pipe = pipeConfig || { suctionSize: '3/8"', dischargeSize: '1/4"', liquidSize: '1/4"', distance: 5, heightDiff: 3 };
  const floorId = selectedOptions?.floor_alu ? 'floor_alu' : selectedOptions?.floor_stainless ? 'floor_stainless' : selectedOptions?.floor_heated ? 'floor_heated' : selectedOptions?.floor_epoxy ? 'floor_epoxy' : 'floor_none';

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2;
    const scale = Math.min(W, H) / (Math.max(width, height, depth) * 3.2);
    const ax = (rotRef.current.x * Math.PI) / 180;
    const ay = (rotRef.current.y * Math.PI) / 180;

    const project = (x, y, z) => {
      const rz = z * Math.cos(ay) - x * Math.sin(ay);
      const rx = z * Math.sin(ay) + x * Math.cos(ay);
      const ry = y * Math.cos(ax) - rz * Math.sin(ax);
      const rz2 = y * Math.sin(ax) + rz * Math.cos(ax);
      return [cx + rx * scale, cy - ry * scale, rz2];
    };

    const w2 = width / 2, h2 = height / 2, d2 = depth / 2;
    const pt = panelThickness / 1000;

    const ov = [
      [-w2, -h2, -d2], [w2, -h2, -d2], [w2, h2, -d2], [-w2, h2, -d2],
      [-w2, -h2, d2], [w2, -h2, d2], [w2, h2, d2], [-w2, h2, d2],
    ];
    const iv = [
      [-w2 + pt, -h2 + pt, -d2 + pt], [w2 - pt, -h2 + pt, -d2 + pt],
      [w2 - pt, h2 - pt, -d2 + pt], [-w2 + pt, h2 - pt, -d2 + pt],
      [-w2 + pt, -h2 + pt, d2 - pt], [w2 - pt, -h2 + pt, d2 - pt],
      [w2 - pt, h2 - pt, d2 - pt], [-w2 + pt, h2 - pt, d2 - pt],
    ];

    const pov = ov.map(v => project(...v));
    const piv = iv.map(v => project(...v));

    const faces = [
      { verts: [0, 1, 2, 3], color: "rgba(180,210,230,0.35)", inner: [0, 1, 2, 3] },
      { verts: [4, 5, 6, 7], color: "rgba(180,210,230,0.35)", inner: [4, 5, 6, 7] },
      { verts: [0, 1, 5, 4], color: "rgba(160,195,220,0.35)", inner: [0, 1, 5, 4] },
      { verts: [2, 3, 7, 6], color: "rgba(200,225,240,0.35)", inner: [2, 3, 7, 6] },
      { verts: [0, 3, 7, 4], color: "rgba(170,200,225,0.35)", inner: [0, 3, 7, 4] },
      { verts: [1, 2, 6, 5], color: "rgba(170,200,225,0.35)", inner: [1, 2, 6, 5] },
    ];

    faces.sort((a, b) => {
      const az = a.verts.reduce((s, i) => s + pov[i][2], 0) / 4;
      const bz = b.verts.reduce((s, i) => s + pov[i][2], 0) / 4;
      return az - bz;
    });

    faces.forEach(face => {
      ctx.beginPath();
      face.verts.forEach((vi, i) => {
        if (i === 0) ctx.moveTo(pov[vi][0], pov[vi][1]);
        else ctx.lineTo(pov[vi][0], pov[vi][1]);
      });
      ctx.closePath();
      ctx.fillStyle = face.color;
      ctx.fill();
      ctx.strokeStyle = "rgba(40,80,120,0.6)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      face.inner.forEach((vi, i) => {
        if (i === 0) ctx.moveTo(piv[vi][0], piv[vi][1]);
        else ctx.lineTo(piv[vi][0], piv[vi][1]);
      });
      ctx.closePath();
      ctx.fillStyle = innerTemp < -10 ? "rgba(100,160,220,0.18)" : "rgba(140,200,240,0.18)";
      ctx.fill();
      ctx.strokeStyle = "rgba(60,120,180,0.4)";
      ctx.lineWidth = 0.8;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      face.verts.forEach((ovi, i) => {
        const ivi = face.inner[i];
        ctx.beginPath();
        ctx.moveTo(pov[ovi][0], pov[ovi][1]);
        ctx.lineTo(piv[ivi][0], piv[ivi][1]);
        ctx.strokeStyle = "rgba(60,120,180,0.25)";
        ctx.lineWidth = 0.5;
        ctx.stroke();
      });
    });

    const dw2 = doorWidth / 2, dh = doorHeight;
    const doorVerts = [
      project(-dw2, -h2 + pt, d2), project(dw2, -h2 + pt, d2),
      project(dw2, -h2 + pt + dh, d2), project(-dw2, -h2 + pt + dh, d2),
    ];
    ctx.beginPath();
    doorVerts.forEach((p, i) => i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]));
    ctx.closePath();
    ctx.fillStyle = "rgba(80,140,200,0.3)";
    ctx.fill();
    ctx.strokeStyle = "rgba(30,70,130,0.7)";
    ctx.lineWidth = 2;
    ctx.stroke();

    const hx = (doorVerts[1][0] + doorVerts[2][0]) / 2 - 5;
    const hy = (doorVerts[0][1] + doorVerts[3][1]) / 2;
    ctx.beginPath();
    ctx.arc(hx, hy, 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(60,60,60,0.6)";
    ctx.fill();

    ctx.font = "bold 13px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";

    const wl = project(-w2, -h2, d2), wr = project(w2, -h2, d2);
    drawDimensionLine(ctx, wl[0], wl[1] + 10, wr[0], wr[1] + 10, `${width.toFixed(2)} m`);

    const dl = project(w2, -h2, -d2), dr = project(w2, -h2, d2);
    drawDimensionLine(ctx, dl[0] + 10, dl[1], dr[0] + 10, dr[1], `${depth.toFixed(2)} m`);

    const hl = project(w2, -h2, d2), hr = project(w2, h2, d2);
    drawDimensionLine(ctx, hl[0] + 20, hl[1], hr[0] + 20, hr[1], `${height.toFixed(2)} m`);

    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#1a5276";
    ctx.fillText(`Panel: ${panelThickness} mm`, W - 90, 30);

    ctx.font = "bold 14px 'JetBrains Mono', monospace";
    ctx.fillStyle = innerTemp < -10 ? "#1565c0" : "#0d47a1";
    const tc = project(0, 0, 0);
    ctx.fillText(`${innerTemp}\u00B0C`, tc[0], tc[1]);

    ctx.strokeStyle = "rgba(100,150,200,0.1)";
    ctx.lineWidth = 0.5;
    for (let gx = -w2; gx <= w2; gx += 0.5) {
      const p1 = project(gx, -h2, -d2), p2 = project(gx, -h2, d2);
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    }
    for (let gz = -d2; gz <= d2; gz += 0.5) {
      const p1 = project(-w2, -h2, gz), p2 = project(w2, -h2, gz);
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    }

    // Panel kalınlığı etiketi (3D üzerinde)
    const panelLabelPos = project(-w2 + pt + 0.15, h2 - pt - 0.2, d2 - pt - 0.1);
    ctx.save();
    ctx.font = "bold 11px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#1a5276";
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.textAlign = "left";
    const panelText = `Panel ${panelThickness} mm`;
    ctx.strokeText(panelText, panelLabelPos[0], panelLabelPos[1]);
    ctx.fillText(panelText, panelLabelPos[0], panelLabelPos[1]);
    ctx.restore();

    // ---- İç zemin (seçilen zemine göre) ----
    const floorY = -h2 + pt;
    const floorCorners = [
      [-w2 + pt, floorY, -d2 + pt], [w2 - pt, floorY, -d2 + pt], [w2 - pt, floorY, d2 - pt], [-w2 + pt, floorY, d2 - pt],
    ];
    const pFloor = floorCorners.map(c => project(c[0], c[1], c[2]));
    ctx.beginPath();
    pFloor.forEach((p, i) => i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]));
    ctx.closePath();
    if (floorId === 'floor_alu') {
      ctx.fillStyle = "rgba(148,163,184,0.5)";
      ctx.fill();
      ctx.strokeStyle = "rgba(100,116,139,0.6)";
      for (let gx = -w2 + pt; gx < w2 - pt; gx += 0.25) {
        const a = project(gx, floorY, -d2 + pt), b = project(gx, floorY, d2 - pt);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
    } else if (floorId === 'floor_stainless') {
      ctx.fillStyle = "rgba(226,232,240,0.65)";
      ctx.fill();
      ctx.strokeStyle = "rgba(148,163,184,0.7)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    } else if (floorId === 'floor_heated') {
      ctx.fillStyle = "rgba(254,243,199,0.5)";
      ctx.fill();
      ctx.strokeStyle = "rgba(245,158,11,0.5)";
      for (let gx = -w2 + pt; gx < w2 - pt; gx += 0.2) {
        for (let gz = -d2 + pt; gz < d2 - pt; gz += 0.2) {
          const c = project(gx, floorY, gz);
          ctx.beginPath(); ctx.arc(c[0], c[1], 1.5, 0, Math.PI * 2); ctx.stroke();
        }
      }
    } else if (floorId === 'floor_epoxy') {
      ctx.fillStyle = "rgba(203,213,225,0.6)";
      ctx.fill();
      ctx.strokeStyle = "rgba(100,116,139,0.5)";
      ctx.lineWidth = 0.6;
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(148,163,184,0.35)";
      ctx.fill();
      ctx.strokeStyle = "rgba(100,116,139,0.4)";
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ---- Ekipman yerleşimi (3D üzerinde) ----
    const drawBox = (corners, fillStyle, strokeStyle) => {
      const pts = corners.map(c => project(c[0], c[1], c[2]));
      ctx.beginPath();
      pts.forEach((p, i) => i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]));
      ctx.closePath();
      ctx.fillStyle = fillStyle;
      ctx.fill();
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    const pipeDist = Math.max(0, Number(pipe.distance) || 0);
    const condenserOffset = 0.5 + Math.min(pipeDist, 20);
    const condZ = -d2 - condenserOffset;

    if (layout.condenser) {
      const cw = 1.0, ch = 0.55, cd = 0.35;
      const cy = -h2 + ch / 2 + 0.1;
      const cornersFront = [
        [-cw/2, cy - ch/2, condZ], [cw/2, cy - ch/2, condZ], [cw/2, cy + ch/2, condZ], [-cw/2, cy + ch/2, condZ],
      ];
      drawBox(cornersFront, "rgba(251,146,60,0.85)", "rgba(194,65,12,0.95)");
      const cornersBack = [
        [-cw/2, cy - ch/2, condZ - cd], [cw/2, cy - ch/2, condZ - cd], [cw/2, cy + ch/2, condZ - cd], [-cw/2, cy + ch/2, condZ - cd],
      ];
      drawBox(cornersBack, "rgba(234,88,12,0.75)", "rgba(154,52,18,0.9)");
      const cornersTop = [
        [-cw/2, cy + ch/2, condZ], [cw/2, cy + ch/2, condZ], [cw/2, cy + ch/2, condZ - cd], [-cw/2, cy + ch/2, condZ - cd],
      ];
      drawBox(cornersTop, "rgba(251,146,60,0.6)", "rgba(194,65,12,0.8)");
      const fanC = project(0, cy, condZ + 0.02);
      ctx.fillStyle = "rgba(30,30,35,0.9)";
      ctx.beginPath();
      ctx.arc(fanC[0], fanC[1], Math.min(18, scale * 0.22), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(251,146,60,0.9)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = Math.min(14, scale * 0.18);
        ctx.beginPath();
        ctx.moveTo(fanC[0], fanC[1]);
        ctx.lineTo(fanC[0] + r * Math.cos(a), fanC[1] - r * Math.sin(a));
        ctx.stroke();
      }
    }

    if (layout.evaporator) {
      const ew = 0.6, eh = 0.55, et = 0.18;
      const evapZ = -d2 + pt + 0.02;
      const evapYBase = 0.5;
      const cornersFront = [
        [-ew/2, evapYBase, evapZ], [ew/2, evapYBase, evapZ], [ew/2, evapYBase + eh, evapZ], [-ew/2, evapYBase + eh, evapZ],
      ];
      drawBox(cornersFront, "rgba(56,189,248,0.88)", "rgba(14,165,233,0.95)");
      const cornersBack = [
        [-ew/2, evapYBase, evapZ - et], [ew/2, evapYBase, evapZ - et], [ew/2, evapYBase + eh, evapZ - et], [-ew/2, evapYBase + eh, evapZ - et],
      ];
      drawBox(cornersBack, "rgba(30,58,138,0.75)", "rgba(14,165,233,0.9)");
      const cornersLeft = [
        [-ew/2, evapYBase, evapZ], [-ew/2, evapYBase + eh, evapZ], [-ew/2, evapYBase + eh, evapZ - et], [-ew/2, evapYBase, evapZ - et],
      ];
      drawBox(cornersLeft, "rgba(56,189,248,0.7)", "rgba(14,165,233,0.85)");
      const cornersRight = [
        [ew/2, evapYBase, evapZ], [ew/2, evapYBase + eh, evapZ], [ew/2, evapYBase + eh, evapZ - et], [ew/2, evapYBase, evapZ - et],
      ];
      drawBox(cornersRight, "rgba(56,189,248,0.7)", "rgba(14,165,233,0.85)");
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const fx = -ew/2 + (col + 0.5) * (ew/3);
          const fy = evapYBase + (row + 0.5) * (eh/3);
          const fc = project(fx, fy, evapZ + 0.01);
          ctx.fillStyle = "rgba(30,35,45,0.85)";
          ctx.beginPath();
          ctx.arc(fc[0], fc[1], Math.min(7, scale * 0.09), 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(56,189,248,0.8)";
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }

    if (layout.piping) {
      const heightDiff = Math.max(0, Number(pipe.heightDiff) || 0);
      const condZStart = condZ + 0.2;
      const midY = -h2 + 0.5 + Math.min(heightDiff * 0.25, 1.5);
      const midZ = -d2 - 0.8;
      const evapY = 0.78;
      const evapZEnd = -d2 + pt + 0.02;
      const pipeOffsets = [-0.14, 0, 0.14];
      const colors = ["rgba(59,130,246,0.95)", "rgba(239,68,68,0.95)", "rgba(34,197,94,0.95)"];
      pipeOffsets.forEach((off, idx) => {
        const p1 = project(off, -h2 + 0.45, condZStart);
        const p2 = project(off, midY, condZStart);
        const p3 = project(off, midY, midZ);
        const p4 = project(off, evapY, evapZEnd);
        ctx.strokeStyle = colors[idx];
        ctx.lineWidth = 3.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.lineTo(p3[0], p3[1]);
        ctx.lineTo(p4[0], p4[1]);
        ctx.stroke();
      });
    }

    if (layout.thermostat) {
      const dw2 = doorWidth / 2;
      const thW = 0.22, thH = 0.14, thD = 0.06;
      const tx = dw2 + 0.18;
      const ty = -h2 + pt + doorHeight * 0.5 - thH / 2;
      const tz = d2 - pt - 0.01;
      const cornersFront = [
        [tx, ty, tz], [tx + thW, ty, tz], [tx + thW, ty + thH, tz], [tx, ty + thH, tz],
      ];
      drawBox(cornersFront, "rgba(30,41,59,0.95)", "rgba(51,65,85,0.98)");
      const cornersBack = [
        [tx, ty, tz - thD], [tx + thW, ty, tz - thD], [tx + thW, ty + thH, tz - thD], [tx, ty + thH, tz - thD],
      ];
      drawBox(cornersBack, "rgba(15,23,42,0.9)", "rgba(30,41,59,0.95)");
      const cornersLeft = [
        [tx, ty, tz], [tx, ty + thH, tz], [tx, ty + thH, tz - thD], [tx, ty, tz - thD],
      ];
      drawBox(cornersLeft, "rgba(30,41,59,0.85)", "rgba(51,65,85,0.9)");
      const cornersRight = [
        [tx + thW, ty, tz], [tx + thW, ty + thH, tz], [tx + thW, ty + thH, tz - thD], [tx + thW, ty, tz - thD],
      ];
      drawBox(cornersRight, "rgba(30,41,59,0.85)", "rgba(51,65,85,0.9)");
      const cornersTop = [
        [tx, ty + thH, tz], [tx + thW, ty + thH, tz], [tx + thW, ty + thH, tz - thD], [tx, ty + thH, tz - thD],
      ];
      drawBox(cornersTop, "rgba(51,65,85,0.8)", "rgba(71,85,105,0.9)");
      const displayCenter = project(tx + thW / 2, ty + thH / 2, tz + 0.005);
      const dispW = 18, dispH = 10;
      ctx.fillStyle = "rgba(15,25,35,0.95)";
      ctx.strokeStyle = "rgba(34,197,94,0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(displayCenter[0] - dispW / 2, displayCenter[1] - dispH / 2, dispW, dispH);
      ctx.fillRect(displayCenter[0] - dispW / 2, displayCenter[1] - dispH / 2, dispW, dispH);
      const tempStr = (typeof innerTemp === "number" ? innerTemp : -2.5).toFixed(1);
      ctx.font = "bold 9px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(34,197,94,0.95)";
      ctx.fillText(`${tempStr} °C`, displayCenter[0], displayCenter[1]);
    }
  }, [width, height, depth, panelThickness, innerTemp, doorWidth, doorHeight, layout.condenser, layout.evaporator, layout.piping, layout.thermostat, floorId, pipe.distance, pipe.heightDiff]);

  useEffect(() => {
    const loop = () => { draw(); animRef.current = requestAnimationFrame(loop); };
    loop();
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  useEffect(() => {
    if (typeof registerCapture === "function") {
      registerCapture(() => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        try {
          return canvas.toDataURL("image/png");
        } catch {
          return null;
        }
      });
    }
  }, [registerCapture]);

  const onMouseDown = (e) => { dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY }; };
  const onMouseMove = (e) => {
    if (!dragRef.current.active) return;
    rotRef.current.y += (e.clientX - dragRef.current.lastX) * 0.5;
    rotRef.current.x += (e.clientY - dragRef.current.lastY) * 0.5;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
  };
  const onMouseUp = () => { dragRef.current.active = false; };
  const onTouchStart = (e) => { const t = e.touches[0]; dragRef.current = { active: true, lastX: t.clientX, lastY: t.clientY }; };
  const onTouchMove = (e) => {
    if (!dragRef.current.active) return;
    const t = e.touches[0];
    rotRef.current.y += (t.clientX - dragRef.current.lastX) * 0.5;
    rotRef.current.x += (t.clientY - dragRef.current.lastY) * 0.5;
    dragRef.current.lastX = t.clientX;
    dragRef.current.lastY = t.clientY;
  };

  return (
    <canvas
      ref={canvasRef}
      width={700}
      height={480}
      className="w-full rounded-xl cursor-grab active:cursor-grabbing"
      style={{ background: "linear-gradient(135deg, #e8f4fd 0%, #d1ecf9 50%, #c3e0f2 100%)" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onMouseUp}
    />
  );
}

function drawDimensionLine(ctx, x1, y1, x2, y2, label) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = "#c0392b";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const angle = Math.atan2(y2 - y1, x2 - x1);
  const as = 6;
  [
    [x1, y1, angle],
    [x2, y2, angle + Math.PI],
  ].forEach(([ax, ay, a]) => {
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + as * Math.cos(a - 0.4), ay + as * Math.sin(a - 0.4));
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + as * Math.cos(a + 0.4), ay + as * Math.sin(a + 0.4));
    ctx.stroke();
  });

  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  ctx.save();
  ctx.translate(mx, my);
  let textAngle = angle;
  if (Math.abs(textAngle) > Math.PI / 2) textAngle += Math.PI;
  ctx.rotate(textAngle);
  ctx.fillStyle = "#c0392b";
  ctx.font = "bold 12px 'JetBrains Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText(label, 0, -6);
  ctx.restore();
}

function calculateCoolingLoad(params) {
  const { width, height, depth, panelThickness, ambientTemp, productType, productWeight, dailyIntake, doorOpenings, lighting, personnel, customTemp } = params;

  const product = PRODUCT_TYPES[productType];
  const innerTemp = productType === "Benutzerdefiniert" ? customTemp : product.temp;
  const deltaT = ambientTemp - innerTemp;

  const floorArea = width * depth;
  const ceilingArea = width * depth;
  const wallArea1 = 2 * (width * height);
  const wallArea2 = 2 * (depth * height);
  const totalArea = floorArea + ceilingArea + wallArea1 + wallArea2;

  const kValue = INSULATION_K[panelThickness] || 0.23;
  const Q1 = totalArea * kValue * deltaT;

  const specificHeat = product.heat;
  const productDeltaT = ambientTemp - innerTemp;
  const Q2 = (dailyIntake * specificHeat * productDeltaT * 1000) / (24 * 3600);

  const Q3 = product.breathRate * productWeight;

  const doorFactor = innerTemp < -10 ? 12 : 8;
  const Q4 = doorOpenings * doorFactor * floorArea;

  const Q5_light = lighting * floorArea;
  const Q5_person = personnel * 270;
  const Q5 = Q5_light + Q5_person;

  const Q6 = floorArea * 15;

  const totalLoad = Q1 + Q2 + Q3 + Q4 + Q5 + Q6;
  const safetyFactor = 1.15;
  const requiredCapacity = totalLoad * safetyFactor;

  const volume = width * height * depth;
  const innerWidth = width - (2 * panelThickness / 1000);
  const innerHeight = height - (2 * panelThickness / 1000);
  const innerDepth = depth - (2 * panelThickness / 1000);
  const innerVolume = innerWidth * innerHeight * innerDepth;

  return {
    innerTemp,
    volume: volume.toFixed(2),
    innerVolume: innerVolume.toFixed(2),
    totalArea: totalArea.toFixed(2),
    Q1: Q1.toFixed(0),
    Q2: Q2.toFixed(0),
    Q3: Q3.toFixed(0),
    Q4: Q4.toFixed(0),
    Q5: Q5.toFixed(0),
    Q6: Q6.toFixed(0),
    totalLoad: totalLoad.toFixed(0),
    requiredCapacity: requiredCapacity.toFixed(0),
    requiredCapacityKW: (requiredCapacity / 1000).toFixed(2),
    innerWidth: innerWidth.toFixed(2),
    innerHeight: innerHeight.toFixed(2),
    innerDepth: innerDepth.toFixed(2),
    kValue,
    deltaT,
  };
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Tam HTML dokümanından <body> içeriği ve <style> metnini çıkarır (iframe yerine div ile göstermek için). */
function getPrintBodyAndStyles(fullHtml) {
  if (!fullHtml || typeof fullHtml !== "string") return { bodyHtml: "", headStyles: "" };
  const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyHtml = bodyMatch ? bodyMatch[1].trim() : fullHtml;
  const styleMatches = fullHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi);
  const headStyles = Array.from(styleMatches).map(m => m[1]).join("\n");
  return { bodyHtml, headStyles };
}

function generatePrintHTML(company, customer, roomData, calc, products, totalPrice, offerNotes, offerNumber, threeDImage, equipmentLayout, t) {
  const isTr = t === translations.tr;
  const locale = isTr ? "tr-TR" : "de-DE";
  const today = new Date().toLocaleDateString(locale);
  const productRows = products.filter(p => p.name).map((p, i) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center">${i + 1}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(p.category)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>${escapeHtml(p.name)}</strong>${p.model ? `<br><small style="color:#666">${escapeHtml(p.model)}</small>` : ''}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center">${formatOfferQty(p.qty)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">${p.price.toLocaleString("de-DE", { minimumFractionDigits: 2 })} &euro;</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${(p.price * p.qty).toLocaleString("de-DE", { minimumFractionDigits: 2 })} &euro;</td>
    </tr>
  `).join("");

  const mwst = totalPrice * 0.19;
  const brutto = totalPrice + mwst;
  const productTypeName = t.productTypes[roomData.productType] || roomData.productType;
  const layoutItems = [];
  if (equipmentLayout?.condenser) {
    layoutItems.push(isTr ? "Kondenser — Dış ünite, dış duvar" : "Verflüssiger — Außeneinheit, Außenwand");
  }
  if (equipmentLayout?.evaporator) {
    layoutItems.push(isTr ? "Evaporatör — İç ünite, tavana montaj" : "Verdampfer — Inneneinheit, Deckenmontage");
  }
  if (equipmentLayout?.piping) {
    layoutItems.push(
      (isTr ? "Boru hatları — " : "Rohrleitungen — ") +
        `${t.piping.suctionLine} ${roomData.pipeConfig?.suctionSize || ""} | ${t.piping.dischargeLine} ${
          roomData.pipeConfig?.dischargeSize || ""
        } | ${t.piping.liquidLine} ${roomData.pipeConfig?.liquidSize || ""}`
    );
  }
  if (equipmentLayout?.thermostat) {
    layoutItems.push(isTr ? "Termostat — Dijital kontrol paneli" : "Thermostat — Digitale Steuerung");
  }

  return `<!DOCTYPE html>
<html lang="${isTr ? 'tr' : 'de'}">
<head>
<meta charset="utf-8">
<title>${t.pdf.offerNr} ${offerNumber}</title>
<style>
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; line-height: 1.5; margin: 0; padding: 20px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0284c7; padding-bottom: 15px; margin-bottom: 20px; }
  .company-name { font-size: 22px; font-weight: 800; color: #0284c7; }
  .company-details { font-size: 10px; color: #555; line-height: 1.6; text-align: right; }
  .section { margin-bottom: 18px; }
  .section-title { font-size: 13px; font-weight: 700; color: #0284c7; border-bottom: 1.5px solid #bae6fd; padding-bottom: 4px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  th { background: #0284c7; color: white; padding: 8px; text-align: left; font-weight: 600; }
  .total-row td { font-weight: 700; font-size: 12px; border-top: 2px solid #0284c7; }
  .calc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .calc-item { display: flex; justify-content: space-between; padding: 4px 8px; background: #f0f9ff; border-radius: 4px; font-size: 10.5px; }
  .notes { white-space: pre-line; font-size: 10px; background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0; }
  .footer { margin-top: 30px; border-top: 2px solid #0284c7; padding-top: 10px; font-size: 9px; color: #666; text-align: center; }
  .room-spec { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .spec-card { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; padding: 8px; text-align: center; }
  .spec-card .label { font-size: 9px; color: #666; text-transform: uppercase; font-weight: 600; }
  .spec-card .value { font-size: 16px; font-weight: 800; color: #0284c7; }
  .page-break { page-break-before: always; }
  @media print {
    body { padding: 0; }
    .no-print { display: none; }
  }
</style>
</head>
<body>

<div class="no-print" style="text-align:center;margin-bottom:20px;padding:10px;background:#f0f9ff;border-radius:8px;border:1px solid #bae6fd;">
  <button onclick="window.print()" style="padding:10px 30px;background:#0284c7;color:white;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;">
    ${isTr ? 'PDF Olarak Yazdir' : 'Als PDF Drucken'}
  </button>
</div>

<div class="header">
  <div>
    <div class="company-name">${escapeHtml(company.name)}</div>
    <div style="font-size:10px;color:#666;margin-top:4px">${t.pdf.refrigeration}</div>
    ${company.owner ? `<div style="font-size:10px;color:#555;margin-top:2px">${t.offer.owner}: ${escapeHtml(company.owner)}</div>` : ''}
  </div>
  <div class="company-details">
    ${escapeHtml(company.address)}<br>
    ${company.warehouse ? `${t.offer.warehouse}: ${escapeHtml(company.warehouse)}<br>` : ''}
    Tel: ${escapeHtml(company.phone)}<br>
    ${escapeHtml(company.email)}${company.email2 ? ` | ${escapeHtml(company.email2)}` : ''}<br>
    ${escapeHtml(company.web)}<br>
    ${escapeHtml(company.taxId)}<br>
    ${company.registerNr ? `${t.offer.registerNr}: ${escapeHtml(company.registerNr)}<br>` : ''}
    ${company.steuernummer ? `Steuernummer: ${escapeHtml(company.steuernummer)}` : ''}
  </div>
</div>

<div class="section">
  <div style="display:flex;justify-content:space-between;margin-bottom:15px">
    <div>
      <strong>${t.pdf.to}:</strong><br>
      ${customer.name ? `${escapeHtml(customer.name)}<br>` : ''}
      ${customer.company ? `${escapeHtml(customer.company)}<br>` : ''}
      ${customer.address ? `${escapeHtml(customer.address)}<br>` : ''}
      ${customer.phone ? `Tel: ${escapeHtml(customer.phone)}<br>` : ''}
      ${customer.email ? `${escapeHtml(customer.email)}` : ''}
    </div>
    <div style="text-align:right">
      <strong>${t.pdf.offerNr}:</strong> ${escapeHtml(offerNumber)}<br>
      <strong>${t.pdf.date}:</strong> ${today}<br>
      <strong>${t.pdf.project}:</strong> ${t.pdf.coldRoom} ${roomData.width}&times;${roomData.depth}&times;${roomData.height} m
    </div>
  </div>
</div>

<div class="section">
  <div class="section-title">${t.pdf.techSpec}</div>
  <div class="room-spec">
    <div class="spec-card">
      <div class="label">${t.pdf.outerDim}</div>
      <div class="value" style="font-size:13px">${roomData.width} &times; ${roomData.depth} &times; ${roomData.height} m</div>
    </div>
    <div class="spec-card">
      <div class="label">${t.pdf.innerVolume}</div>
      <div class="value">${calc.innerVolume} m&sup3;</div>
    </div>
    <div class="spec-card">
      <div class="label">${t.pdf.temperature}</div>
      <div class="value">${calc.innerTemp}&deg;C</div>
    </div>
    <div class="spec-card">
      <div class="label">${t.pdf.requiredCapacity}</div>
      <div class="value">${calc.requiredCapacityKW} kW</div>
    </div>
  </div>
  <div style="margin-top:10px">
    <div class="calc-grid">
      <div class="calc-item"><span>${t.pdf.panel}:</span><span>${roomData.panelThickness} mm PIR (k=${calc.kValue} W/m&sup2;K)</span></div>
      <div class="calc-item"><span>${t.pdf.storageProduct}:</span><span>${escapeHtml(productTypeName)}</span></div>
      <div class="calc-item"><span>${t.pdf.ambientTemp}:</span><span>${roomData.ambientTemp}&deg;C</span></div>
      <div class="calc-item"><span>${t.pdf.door}:</span><span>${roomData.doorWidth} &times; ${roomData.doorHeight} m</span></div>
      <div class="calc-item"><span>${t.pdf.totalArea}:</span><span>${calc.totalArea} m&sup2;</span></div>
      <div class="calc-item"><span>&Delta;T:</span><span>${calc.deltaT} K</span></div>
    </div>
  </div>
</div>

${layoutItems.length ? `
<div class="section">
  <div class="section-title">${isTr ? 'Ekipman Yerleşimi' : 'Ausrüstungsanordnung'}</div>
  <ul style="margin:0;padding-left:18px;font-size:10.5px;color:#1f2933">
    ${layoutItems.map(item => `<li style="margin-bottom:3px">${escapeHtml(item)}</li>`).join("")}
  </ul>
</div>
` : ''}

<div class="section">
  <div class="section-title">${t.pdf.coolingCalc}</div>
  <div class="calc-grid">
    <div class="calc-item"><span>${t.pdf.q1}:</span><span>${Number(calc.Q1).toLocaleString()} W</span></div>
    <div class="calc-item"><span>${t.pdf.q2}:</span><span>${Number(calc.Q2).toLocaleString()} W</span></div>
    <div class="calc-item"><span>${t.pdf.q3}:</span><span>${Number(calc.Q3).toLocaleString()} W</span></div>
    <div class="calc-item"><span>${t.pdf.q4}:</span><span>${Number(calc.Q4).toLocaleString()} W</span></div>
    <div class="calc-item"><span>${t.pdf.q5}:</span><span>${Number(calc.Q5).toLocaleString()} W</span></div>
    <div class="calc-item"><span>${t.pdf.q6}:</span><span>${Number(calc.Q6).toLocaleString()} W</span></div>
    <div class="calc-item" style="background:#0284c7;color:white;font-weight:700"><span>${t.pdf.totalLoad}:</span><span>${Number(calc.totalLoad).toLocaleString()} W</span></div>
    <div class="calc-item" style="background:#0284c7;color:white;font-weight:700"><span>${t.pdf.safety}:</span><span>${Number(calc.requiredCapacity).toLocaleString()} W = ${calc.requiredCapacityKW} kW</span></div>
  </div>
</div>

<div class="section">
  <div class="section-title">${t.pdf.priceOffer}</div>
  <table>
    <thead>
      <tr>
        <th style="width:30px;text-align:center">${t.pdf.pos}</th>
        <th>${t.pdf.category}</th>
        <th>${t.pdf.descModel}</th>
        <th style="text-align:center">${t.pdf.quantity}</th>
        <th style="text-align:right">${t.pdf.unitPrice}</th>
        <th style="text-align:right">${t.pdf.total}</th>
      </tr>
    </thead>
    <tbody>
      ${productRows}
      <tr class="total-row">
        <td colspan="5" style="padding:10px;text-align:right">${t.pdf.netTotal}:</td>
        <td style="padding:10px;text-align:right">${totalPrice.toLocaleString("de-DE", { minimumFractionDigits: 2 })} &euro;</td>
      </tr>
      <tr>
        <td colspan="5" style="padding:6px;text-align:right;color:#666">${t.pdf.vat}:</td>
        <td style="padding:6px;text-align:right;color:#666">${mwst.toLocaleString("de-DE", { minimumFractionDigits: 2 })} &euro;</td>
      </tr>
      <tr class="total-row">
        <td colspan="5" style="padding:10px;text-align:right;font-size:14px;color:#0284c7">${t.pdf.grossTotal}:</td>
        <td style="padding:10px;text-align:right;font-size:14px;color:#0284c7">${brutto.toLocaleString("de-DE", { minimumFractionDigits: 2 })} &euro;</td>
      </tr>
    </tbody>
  </table>
</div>

<div class="section">
  <div class="section-title">${t.pdf.conditions}</div>
  <div class="notes">${escapeHtml(offerNotes)}</div>
</div>

<div class="footer">
  ${escapeHtml(company.name)} | ${escapeHtml(company.address)} | ${escapeHtml(company.phone)} | ${escapeHtml(company.email)}${company.email2 ? ` | ${escapeHtml(company.email2)}` : ''} | ${escapeHtml(company.web)}<br>
  ${escapeHtml(company.taxId)} | ${company.registerNr ? escapeHtml(company.registerNr) : ''} ${company.steuernummer ? `| Steuernummer: ${escapeHtml(company.steuernummer)}` : ''}
</div>

${threeDImage ? `
<div class="page-break"></div>
<div class="section">
  <div class="section-title">${isTr ? '3D Soğuk Oda Görünümü' : '3D Kühlraumansicht'}</div>
  <img src="${threeDImage}" style="width:100%;max-width:700px;border-radius:8px;border:1px solid #e5e7eb" />
</div>
` : ''}

</body>
</html>`;
}

export default function ColdRoomCalculator() {
  const [lang, setLang] = useState("de");
  const t = translations[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    let alive = true;

    const loadSharedCatalog = async () => {
      const candidates = [
        "/shared-admin-catalog.json",
        "./shared-admin-catalog.json",
        "../shared-admin-catalog.json",
      ];

      for (const candidate of candidates) {
        try {
          const response = await fetch(candidate, { cache: "no-store" });
          if (!response.ok) {
            continue;
          }
          const payload = await response.json();
          if (!alive || !Array.isArray(payload?.items)) {
            return;
          }
          setMaterialCatalog(applySharedMaterialOverrides(MATERIALS, payload.items));
          setSystemCatalog(applySharedSystemOverrides(CATALOG, payload.items));
          return;
        } catch (_error) {
          // Local fallback remains active.
        }
      }
    };

    loadSharedCatalog();
    return () => {
      alive = false;
    };
  }, []);

  const [tab, setTab] = useState("room");
  const [roomData, setRoomData] = useState({
    width: 4, height: 3, depth: 5, panelThickness: 100,
    ambientTemp: 32, productType: "Fleisch (frisch)", productWeight: 5000,
    dailyIntake: 1000, doorOpenings: 10, lighting: 12, personnel: 2,
    customTemp: 0, doorWidth: 1.0, doorHeight: 2.1,
  });
  const [company, setCompany] = useState(INITIAL_COMPANY);
  const [customer, setCustomer] = useState({ name: "", company: "", address: "", phone: "", email: "" });
  const [products, setProducts] = useState([]);
  const [materialCatalog, setMaterialCatalog] = useState(MATERIALS);
  const [systemCatalog, setSystemCatalog] = useState(CATALOG);
  const [offerNotes, setOfferNotes] = useState(translations.de.offer.defaultNotes);
  const [offerNumber, setOfferNumber] = useState(`ANG-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`);
  const [generating, setGenerating] = useState(false);
  const [pdf3DImage, setPdf3DImage] = useState(null);
  const [printOverlayContent, setPrintOverlayContent] = useState(null);
  const [exportError, setExportError] = useState(null);
  const printIframeRef = useRef(null);
  const printBlobUrlRef = useRef(null);
  const capture3DRef = useRef(null);
  const [equipmentLayout, setEquipmentLayout] = useState({
    condenser: true,
    evaporator: true,
    piping: true,
    thermostat: true,
  });

  // Catalog state
  const [catalogBrand, setCatalogBrand] = useState("");
  const [catalogType, setCatalogType] = useState("");
  const [catalogAdded, setCatalogAdded] = useState(null);

  // Options state
  const [selectedOptions, setSelectedOptions] = useState({});

  // History state
  const [savedCustomers, setSavedCustomers] = useState(() => loadFromLS(LS_CUSTOMERS_KEY));
  const [savedOffers, setSavedOffers] = useState(() => loadFromLS(LS_OFFERS_KEY));
  const [offerSavedMsg, setOfferSavedMsg] = useState(false);
  const [customerSavedMsg, setCustomerSavedMsg] = useState(false);

  // Piping state
  const [pipeConfig, setPipeConfig] = useState({
    suctionSize: '3/8"', dischargeSize: '1/4"', liquidSize: '1/4"',
    distance: 5, heightDiff: 3, additionalLength: 2,
  });
  const [showEquipment3D, setShowEquipment3D] = useState(true);

  // Material shop state
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialCategory, setMaterialCategory] = useState("");
  const [materialBrand, setMaterialBrand] = useState("");
  const [cart, setCart] = useState([]);
  const [materialPage, setMaterialPage] = useState(0);
  const ITEMS_PER_PAGE = 24;

  // Stock state (stok giriş/çıkış)
  const [stock, setStock] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_STOCK_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const [stockEntryMsg, setStockEntryMsg] = useState(false);

  const calc = useMemo(() => calculateCoolingLoad(roomData), [roomData]);

  const floorArea = roomData.width * roomData.depth;
  const roomEnvelopeProducts = useMemo(() => buildRoomEnvelopeProducts(roomData, lang), [roomData, lang]);
  const offerProducts = useMemo(() => [...roomEnvelopeProducts, ...products], [roomEnvelopeProducts, products]);
  const materialBrands = useMemo(
    () => Array.from(new Set(materialCatalog.map((item) => item.brand).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [materialCatalog]
  );

  const updateRoom = (key, val) => setRoomData(prev => ({ ...prev, [key]: val }));

  const addProduct = () => {
    setProducts(prev => [...prev, {
      id: Date.now(), category: "", name: "", model: "", price: 0, qty: 1,
    }]);
  };

  const removeProduct = (id) => setProducts(prev => prev.filter(p => p.id !== id));

  const updateProduct = (id, key, val) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, [key]: val } : p));
  };

  const totalPrice = offerProducts.reduce((s, p) => s + (p.price * p.qty), 0);

  const handleLangChange = (newLang) => {
    setLang(newLang);
    setOfferNotes(translations[newLang].offer.defaultNotes);
  };

  // ---- CATALOG LOGIC ----
  const filteredCatalog = useMemo(() => {
    let items = systemCatalog;
    if (catalogBrand) items = items.filter(c => c.brand === catalogBrand);
    if (catalogType) items = items.filter(c => c.type === catalogType);
    return items;
  }, [catalogBrand, catalogType, systemCatalog]);

  const requiredW = Number(calc.requiredCapacity);

  const addCatalogToProducts = (item) => {
    const totalSysPrice = item.outdoorPrice + (item.indoorPrice * item.evapQty);
    setProducts(prev => [
      ...prev,
      { id: Date.now(), category: t.catalog.outdoor, name: item.outdoor, model: item.code, price: item.outdoorPrice, qty: 1 },
      { id: Date.now() + 1, category: t.catalog.indoor, name: item.indoor, model: item.evapCode, price: item.indoorPrice, qty: item.evapQty },
    ]);
    setCatalogAdded(item.code);
    setTimeout(() => setCatalogAdded(null), 2000);
  };

  // ---- OPTIONS LOGIC ----
  const toggleOption = (id) => {
    setSelectedOptions(prev => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  };

  const getOptionPrice = (opt) => {
    if (opt.pricePerM2) return opt.pricePerM2 * floorArea;
    return opt.price;
  };

  const allOptions = Object.values(OPTIONS_CATALOG).flat();
  const selectedOptionItems = allOptions.filter(o => selectedOptions[o.id]);
  const optionsTotalPrice = selectedOptionItems.reduce((s, o) => s + getOptionPrice(o), 0);

  const addOptionsToProducts = () => {
    const newItems = selectedOptionItems.map((o, i) => ({
      id: Date.now() + i,
      category: t.options.title,
      name: lang === "tr" ? o.tr : o.de,
      model: o.pricePerM2 ? `${floorArea.toFixed(1)} m\u00B2 x ${o.pricePerM2} \u20AC/m\u00B2` : "",
      price: getOptionPrice(o),
      qty: 1,
    }));
    setProducts(prev => [...prev, ...newItems]);
    setSelectedOptions({});
  };

  // ---- HISTORY LOGIC ----
  const saveCustomerToHistory = () => {
    if (!customer.name && !customer.company) return;
    const updated = [...savedCustomers, { ...customer, savedAt: new Date().toISOString() }];
    setSavedCustomers(updated);
    saveToLS(LS_CUSTOMERS_KEY, updated);
    setCustomerSavedMsg(true);
    setTimeout(() => setCustomerSavedMsg(false), 2000);
  };

  const loadCustomerFromHistory = (c) => {
    setCustomer({ name: c.name || "", company: c.company || "", address: c.address || "", phone: c.phone || "", email: c.email || "" });
  };

  const deleteCustomerFromHistory = (idx) => {
    const updated = savedCustomers.filter((_, i) => i !== idx);
    setSavedCustomers(updated);
    saveToLS(LS_CUSTOMERS_KEY, updated);
  };

  const saveOfferToHistory = () => {
    const offer = {
      offerNumber,
      date: new Date().toISOString(),
      customer: { ...customer },
      products: products.map(p => ({ ...p })),
      totalPrice,
      roomData: { ...roomData },
    };
    const updated = [...savedOffers, offer];
    setSavedOffers(updated);
    saveToLS(LS_OFFERS_KEY, updated);
    setOfferSavedMsg(true);
    setTimeout(() => setOfferSavedMsg(false), 2000);
  };

  const loadOfferFromHistory = (offer) => {
    setCustomer({ ...offer.customer });
    setProducts(offer.products.map(p => ({ ...p })));
    setOfferNumber(offer.offerNumber);
    if (offer.roomData) setRoomData({ ...offer.roomData });
    setTab("offer");
  };

  const deleteOfferFromHistory = (idx) => {
    const updated = savedOffers.filter((_, i) => i !== idx);
    setSavedOffers(updated);
    saveToLS(LS_OFFERS_KEY, updated);
  };

  // ---- PIPE CALCULATIONS ----
  const pipeLengths = useMemo(() => {
    const base = pipeConfig.distance + pipeConfig.heightDiff + pipeConfig.additionalLength;
    return { suctionLength: base, dischargeLength: base, liquidLength: base, totalLength: base * 3 };
  }, [pipeConfig]);

  const pipePrices = useMemo(() => {
    const s = PIPE_CATALOG.find(p => p.size === pipeConfig.suctionSize);
    const d = PIPE_CATALOG.find(p => p.size === pipeConfig.dischargeSize);
    const l = PIPE_CATALOG.find(p => p.size === pipeConfig.liquidSize);
    const sc = s ? s.pricePerMeter * pipeLengths.suctionLength : 0;
    const dc = d ? d.pricePerMeter * pipeLengths.dischargeLength : 0;
    const lc = l ? l.pricePerMeter * pipeLengths.liquidLength : 0;
    return { suctionCost: sc, dischargeCost: dc, liquidCost: lc, totalPipeCost: sc + dc + lc };
  }, [pipeConfig, pipeLengths]);

  const sealingCalc = useMemo(() => {
    const w = roomData.width, d = roomData.depth, h = roomData.height;
    const dw = roomData.doorWidth, dh = roomData.doorHeight;
    const jointLength = 4 * h + 4 * (w + d);
    const siliconCartridges = Math.ceil(jointLength / 5);
    const foamCans = Math.ceil(jointLength / 4);
    const doorSealLength = 2 * dh + dw + 0.5;
    const doorSealRolls = Math.ceil(doorSealLength / 10);
    const pipeInsulationLength = pipeLengths.totalLength;
    const aluTapeRolls = Math.ceil(jointLength / 50);
    return { jointLength: jointLength.toFixed(1), siliconCartridges, foamCans, doorSealLength: doorSealLength.toFixed(1), doorSealRolls, pipeInsulationLength: pipeInsulationLength.toFixed(1), aluTapeRolls };
  }, [roomData, pipeLengths]);

  const sealingMaterialCost = useMemo(() => {
    const silicon = INSULATION_CATALOG.find(i => i.id === 'silikon-kuehl');
    const foam = INSULATION_CATALOG.find(i => i.id === 'pu-schaum-kalt');
    const tape = INSULATION_CATALOG.find(i => i.id === 'klebeband-alu');
    const seal = INSULATION_CATALOG.find(i => i.id === 'dichtband');
    const arma = INSULATION_CATALOG.find(i => i.id === 'armaflex-13');
    let total = 0;
    total += silicon ? silicon.price * sealingCalc.siliconCartridges : 0;
    total += foam ? foam.price * sealingCalc.foamCans : 0;
    total += tape ? tape.price * sealingCalc.aluTapeRolls : 0;
    total += seal ? seal.price * sealingCalc.doorSealRolls : 0;
    total += arma ? arma.price * parseFloat(sealingCalc.pipeInsulationLength) : 0;
    return total + pipePrices.totalPipeCost;
  }, [sealingCalc, pipePrices]);

  const addPipingToProducts = () => {
    const items = [];
    const ts = Date.now();
    const s = PIPE_CATALOG.find(p => p.size === pipeConfig.suctionSize);
    const d = PIPE_CATALOG.find(p => p.size === pipeConfig.dischargeSize);
    const l = PIPE_CATALOG.find(p => p.size === pipeConfig.liquidSize);
    if (s) items.push({ id: ts, category: t.piping.suctionLine, name: `Cu ${s.size} ${t.piping.suctionLine}`, model: `${pipeLengths.suctionLength.toFixed(1)}m`, price: pipePrices.suctionCost, qty: 1 });
    if (d) items.push({ id: ts+1, category: t.piping.dischargeLine, name: `Cu ${d.size} ${t.piping.dischargeLine}`, model: `${pipeLengths.dischargeLength.toFixed(1)}m`, price: pipePrices.dischargeCost, qty: 1 });
    if (l) items.push({ id: ts+2, category: t.piping.liquidLine, name: `Cu ${l.size} ${t.piping.liquidLine}`, model: `${pipeLengths.liquidLength.toFixed(1)}m`, price: pipePrices.liquidCost, qty: 1 });
    const matItems = [
      ['silikon-kuehl', sealingCalc.siliconCartridges],
      ['pu-schaum-kalt', sealingCalc.foamCans],
      ['klebeband-alu', sealingCalc.aluTapeRolls],
      ['dichtband', sealingCalc.doorSealRolls],
    ];
    matItems.forEach(([mid, qty], idx) => {
      const mat = INSULATION_CATALOG.find(i => i.id === mid);
      if (mat && qty > 0) items.push({ id: ts+3+idx, category: t.piping.insulationCalc, name: lang === 'tr' ? mat.tr : mat.de, model: '', price: mat.price, qty });
    });
    const arma = INSULATION_CATALOG.find(i => i.id === 'armaflex-13');
    if (arma) items.push({ id: ts+7, category: t.piping.pipeInsulation, name: lang === 'tr' ? arma.tr : arma.de, model: `${sealingCalc.pipeInsulationLength} m`, price: arma.price * parseFloat(sealingCalc.pipeInsulationLength), qty: 1 });
    setProducts(prev => [...prev, ...items]);
  };

  // ---- MATERIAL SHOP ----
  const filteredMaterials = useMemo(() => {
    let items = materialCatalog;
    if (materialCategory) items = items.filter(m => m.category === materialCategory);
    if (materialBrand) items = items.filter(m => m.brand === materialBrand);
    if (materialSearch) {
      const s = materialSearch.toLowerCase();
      items = items.filter(m => m.name.toLowerCase().includes(s) || (m.code && m.code.toLowerCase().includes(s)));
    }
    return items;
  }, [materialCatalog, materialCategory, materialBrand, materialSearch]);

  const pagedMaterials = useMemo(() => {
    const start = materialPage * ITEMS_PER_PAGE;
    return filteredMaterials.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredMaterials, materialPage]);

  const totalMaterialPages = Math.ceil(filteredMaterials.length / ITEMS_PER_PAGE);

  const addToCart = (item, qty = 1) => {
    setCart(prev => {
      const localizedName = localizeMaterialName(item.name, lang);
      const ex = prev.find(c => c.materialId === item.id);
      if (ex) return prev.map(c => c.materialId === item.id ? { ...c, qty: c.qty + qty } : c);
      return [...prev, { ...item, materialId: item.id, name: localizedName, qty, id: Date.now() }];
    });
  };
  const removeFromCart = (id) => setCart(prev => prev.filter(c => c.id !== id));
  const updateCartQty = (id, qty) => { if (qty <= 0) return removeFromCart(id); setCart(prev => prev.map(c => c.id === id ? { ...c, qty } : c)); };
  const cartTotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const addCartToProducts = () => {
    const items = cart.map((c, i) => ({ id: Date.now() + i, category: lang === 'tr' ? 'Malzeme Satış' : 'Materialverkauf', name: c.name, model: c.code || '', price: c.price, qty: c.qty }));
    setProducts(prev => [...prev, ...items]);
    setCart([]);
  };

  // DRC Portal köprüsü: Sepeti + hesaplamayı parent pencereye projekt olarak gönder
  const sendCartToDRCProject = () => {
    const title = (roomData?.projectName || "").trim()
      || ((lang === "tr" ? "Soğuk Oda Projesi" : "Kühlraum-Projekt")
          + " - " + new Date().toLocaleDateString(lang === "tr" ? "tr-TR" : "de-DE"));
    const payload = {
      type: "coldroompro:save-as-project",
      payload: {
        title,
        projectType: roomData?.roomType === "freezer" ? "freezer_room" : "cold_room",
        parameters: roomData,
        calculationResult: calc,
        note: lang === "tr"
          ? `ColdRoomPro hesaplaması (${new Date().toISOString()})`
          : `ColdRoomPro-Berechnung (${new Date().toISOString()})`,
        bom: (cart || []).map((c) => ({
          itemName: c.name,
          quantity: Number(c.qty) || 1,
          unit: "adet",
          unitPrice: Number(c.price) || 0,
          code: c.code || "",
          materialId: c.materialId || null,
          source: "coldroompro",
        })),
        language: lang,
      },
    };
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, "*");
      } else {
        window.postMessage(payload, "*");
      }
      setStockEntryMsg(true);
      setTimeout(() => setStockEntryMsg(false), 2500);
    } catch (err) {
      console.error("[ColdRoomPro] DRC Portal gonderim hatasi:", err);
    }
  };

  // Stoğa giriş: Sepetteki malzemeleri stoka ekle
  const addCartToStock = () => {
    if (cart.length === 0) return;
    const updated = { ...stock };
    cart.forEach(c => {
      const mid = c.materialId;
      if (mid != null && typeof mid === 'number') {
        updated[mid] = (updated[mid] || 0) + (c.qty || 1);
      }
    });
    setStock(updated);
    saveToLS(LS_STOCK_KEY, updated);
    setCart([]);
    setStockEntryMsg(true);
    setTimeout(() => setStockEntryMsg(false), 2500);
  };

  useEffect(() => {
    saveToLS(LS_STOCK_KEY, stock);
  }, [stock]);

  const numInput = (label, value, onChange, unit = "", step = 1, min = 0) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-500 tracking-wide uppercase">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          step={step}
          min={min}
          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-800 focus:ring-2 focus:ring-sky-400 focus:border-sky-400 outline-none transition-all"
        />
        {unit && <span className="text-xs text-slate-400 font-medium whitespace-nowrap">{unit}</span>}
      </div>
    </div>
  );

  const tabItems = [
    { id: "room", label: t.tabs.room, icon: "\uD83C\uDFD7\uFE0F" },
    { id: "3d", label: t.tabs["3d"], icon: "\uD83E\uDDCA" },
    { id: "market", label: t.tabs.market, icon: "\uD83D\uDED2" },
    { id: "calc", label: t.tabs.calc, icon: "\uD83D\uDCCA" },
    { id: "catalog", label: t.tabs.catalog, icon: "\u2744\uFE0F" },
    { id: "options", label: t.tabs.options, icon: "\uD83D\uDD27" },
    { id: "piping", label: t.tabs.piping, icon: "\uD83D\uDD29" },
    { id: "materialShop", label: t.tabs.materialShop, icon: "\uD83C\uDFEA" },
    { id: "products", label: t.tabs.products, icon: "\uD83D\uDCB0" },
    { id: "offer", label: t.tabs.offer, icon: "\uD83D\uDCC4" },
    { id: "history", label: t.tabs.history, icon: "\uD83D\uDCDA" },
  ];

  const handleExportPDF = async () => {
    const TAG = "[ColdRoomPro]";
    setExportError(null);
    setGenerating(true);
    try {
    let threeDImage = pdf3DImage;
    if (!threeDImage && capture3DRef.current) {
      const captured = capture3DRef.current();
      if (captured) {
        threeDImage = captured;
        setPdf3DImage(captured);
      }
    }
    console.log(TAG, "Teklif HTML üretiliyor...");
    const printContent = generatePrintHTML(
      company, customer, roomData, calc, offerProducts, totalPrice,
      offerNotes, offerNumber, threeDImage, equipmentLayout, t
    );
    setGenerating(false);

    const { Capacitor } = await import("@capacitor/core");
    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
      console.log(TAG, "Android: Paylaş deneniyor (önce Web Share API)");
      let result = await webShareHtml(printContent, lang);
      if (!result.ok) {
        console.log(TAG, "Web Share başarısız, Capacitor Share deneniyor:", result.error);
        result = await shareHtmlAsFile(printContent, lang);
      }
      if (!result.ok) {
        console.error(TAG, "Paylaş hatası:", result.error);
        setExportError(result.error || (lang === "tr" ? "Paylaşım açılamadı" : "Teilen konnte nicht geöffnet werden"));
      }
      return;
    }

    const blob = new Blob([printContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    if (printBlobUrlRef.current) URL.revokeObjectURL(printBlobUrlRef.current);
    printBlobUrlRef.current = url;
    setTimeout(() => setPrintOverlayContent(printContent), 100);
  } catch (err) {
    console.error(TAG, "handleExportPDF HATA:", err?.message || String(err), err);
    setExportError(err?.message || String(err));
    setGenerating(false);
  }
  };

  // Helper: is a catalog item "recommended" (capacity close to required)
  const isRecommended = (item) => {
    if (!requiredW || requiredW <= 0) return false;
    const ratio = item.capacity / requiredW;
    return ratio >= 0.85 && ratio <= 1.4;
  };

  const OPTION_CATEGORIES = ["floor", "thermostat", "monitoring", "lighting", "safety", "extras"];

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(160deg, #0c1929 0%, #152642 40%, #1a3355 100%)", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {exportError && (
        <div className="fixed top-0 left-0 right-0 z-[9998] bg-red-600 text-white px-4 py-3 flex items-center justify-between gap-2 shadow-lg">
          <span className="text-sm font-medium break-all flex-1">PDF hatası: {exportError}</span>
          <button type="button" onClick={() => setExportError(null)} className="shrink-0 px-3 py-1 bg-white/20 rounded font-bold">Kapat</button>
        </div>
      )}
      {/* PDF önizleme overlay - body içine portal ile (Android WebView üstte görünsün diye) */}
      {typeof document !== "undefined" && printOverlayContent && createPortal(
        (() => {
          const { bodyHtml, headStyles } = getPrintBodyAndStyles(printOverlayContent);
          return (
        <div className="fixed inset-0 z-[99999] flex flex-col overflow-hidden" style={{ background: '#1e293b', height: '100vh', width: '100vw' }}>
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-sky-700 text-white shrink-0">
            <span className="font-bold text-sm">{lang === 'tr' ? 'Teklif önizleme' : 'Angebotsvorschau'}</span>
            <p className="w-full text-xs text-sky-200/90 mt-0.5">
              {lang === 'tr' ? '«Paylaş» ile dosyayı kaydedin veya Chrome\'da açın; sonra Yazdır → PDF\'e kaydet' : '«Teilen» zum Speichern oder in Chrome öffnen; dann Drucken → Als PDF speichern'}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const result = await shareHtmlAsFile(printOverlayContent, lang);
                    if (!result.ok) {
                      alert(lang === "tr" ? (result.error === "not_native" ? "Sadece Android uygulamasında kullanılabilir." : "Hata: " + result.error) : (result.error === "not_native" ? "Nur in der Android-App verfügbar." : "Fehler: " + result.error));
                    }
                  } catch (e) { console.error(e); alert(lang === "tr" ? "Hata: " + (e?.message || e) : "Fehler: " + (e?.message || e)); }
                }}
                className="px-4 py-2 rounded-lg bg-emerald-500 text-white font-bold text-sm"
              >
                {lang === 'tr' ? 'Paylaş / Kaydet' : 'Teilen / Speichern'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await openHtmlInBrowser(printOverlayContent, lang);
                  } catch (e) { console.error(e); }
                }}
                className="px-4 py-2 rounded-lg bg-amber-400 text-slate-800 font-bold text-sm"
                title={lang === 'tr' ? 'Paylaş menüsünden Chrome veya Kaydet seçin' : 'Im Teilen-Menü Chrome oder Speichern wählen'}
              >
                {lang === 'tr' ? 'Tarayıcıda aç / Paylaş' : 'In Browser öffnen / Teilen'}
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    const iframe = printIframeRef.current;
                    if (iframe?.contentWindow) iframe.contentWindow.print();
                  } catch (e) { console.error(e); }
                }}
                className="px-4 py-2 rounded-lg bg-white text-sky-700 font-bold text-sm"
              >
                {lang === 'tr' ? 'Yazdır' : 'Drucken'}
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    const blob = new Blob([printOverlayContent], { type: 'text/html;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = lang === 'tr' ? 'teklif.html' : 'angebot.html';
                    a.style.display = 'none';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  } catch (e) { console.error(e); }
                }}
                className="px-4 py-2 rounded-lg bg-emerald-500 text-white font-bold text-sm"
              >
                {lang === 'tr' ? 'HTML indir' : 'HTML speichern'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (printBlobUrlRef.current) {
                    URL.revokeObjectURL(printBlobUrlRef.current);
                    printBlobUrlRef.current = null;
                  }
                  setPrintOverlayContent(null);
                  setExportError(null);
                }}
                className="px-4 py-2 rounded-lg bg-slate-600 text-white font-bold text-sm"
              >
                {lang === 'tr' ? 'Kapat' : 'Schließen'}
              </button>
            </div>
          </div>
          {/* Önizleme: iframe yerine div (Android WebView iframe sorunu) */}
          <div className="flex-1 overflow-auto bg-white" style={{ minHeight: 0 }}>
            {headStyles ? <style dangerouslySetInnerHTML={{ __html: headStyles }} /> : null}
            <div className="p-5 text-[#1a1a1a]" style={{ fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: '11px', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          </div>
          {/* Yazdır butonu için gizli iframe - sadece blob URL varken (boş src about:blank → Google araması açar) */}
          {printBlobUrlRef.current && (
            <iframe
              ref={printIframeRef}
              title="Yazdır"
              src={printBlobUrlRef.current}
              style={{ position: 'absolute', left: -9999, width: 1, height: 1, border: 0 }}
              sandbox="allow-same-origin"
            />
          )}
        </div>
          );
        })(),
        document.body
      )}
      {/* Header */}
      <div className="px-4 pt-6 pb-2">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-sky-500/20">{"\u2744"}</div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">{t.appTitle}</h1>
              <p className="text-xs text-sky-300/60">{t.appSubtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-sky-300/60 font-semibold mr-1">{t.lang}:</span>
            <button
              onClick={() => handleLangChange("de")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                lang === "de"
                  ? "bg-sky-500 text-white shadow-lg shadow-sky-500/30"
                  : "bg-white/10 text-sky-200/70 hover:bg-white/20"
              }`}
            >
              DE
            </button>
            <button
              onClick={() => handleLangChange("tr")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                lang === "tr"
                  ? "bg-sky-500 text-white shadow-lg shadow-sky-500/30"
                  : "bg-white/10 text-sky-200/70 hover:bg-white/20"
              }`}
            >
              TR
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 py-3">
        <div className="max-w-6xl mx-auto flex gap-1.5 overflow-x-auto pb-1">
          {tabItems.map(tb => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                tab === tb.id
                  ? "bg-sky-500 text-white shadow-lg shadow-sky-500/30"
                  : "bg-white/5 text-sky-200/70 hover:bg-white/10"
              }`}
            >
              <span>{tb.icon}</span> {tb.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-8">
        <div className="max-w-6xl mx-auto">

          {/* TAB: Room & Product */}
          {tab === "room" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-5 border border-white/10">
                <h2 className="text-base font-bold text-sky-300 mb-4 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-sky-500/20 flex items-center justify-center text-sm">{"\uD83D\uDCD0"}</span>
                  {t.room.title}
                </h2>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {numInput(t.room.width, roomData.width, v => updateRoom("width", v), t.units.m, 0.1, 0.5)}
                  {numInput(t.room.height, roomData.height, v => updateRoom("height", v), t.units.m, 0.1, 1)}
                  {numInput(t.room.depth, roomData.depth, v => updateRoom("depth", v), t.units.m, 0.1, 0.5)}
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-500 tracking-wide uppercase">{t.room.panelThickness} ({t.units.mm})</label>
                    <select
                      value={roomData.panelThickness}
                      onChange={e => updateRoom("panelThickness", parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-800 focus:ring-2 focus:ring-sky-400 outline-none"
                    >
                      {Object.keys(INSULATION_K).map(k => (
                        <option key={k} value={k}>{k} mm (k={INSULATION_K[k]} W/m{"\u00B2"}K)</option>
                      ))}
                    </select>
                  </div>
                  {numInput(t.room.ambientTemp, roomData.ambientTemp, v => updateRoom("ambientTemp", v), t.units.celsius, 1, -10)}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {numInput(t.room.doorWidth, roomData.doorWidth, v => updateRoom("doorWidth", v), t.units.m, 0.1, 0.6)}
                  {numInput(t.room.doorHeight, roomData.doorHeight, v => updateRoom("doorHeight", v), t.units.m, 0.1, 1.5)}
                </div>
              </div>

              <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-5 border border-white/10">
                <h2 className="text-base font-bold text-sky-300 mb-4 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-sky-500/20 flex items-center justify-center text-sm">{"\uD83E\uDD69"}</span>
                  {t.product.title}
                </h2>
                <div className="mb-3">
                  <label className="text-xs font-semibold text-slate-500 tracking-wide uppercase mb-1 block">{t.product.storageProduct}</label>
                  <select
                    value={roomData.productType}
                    onChange={e => updateRoom("productType", e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-800 focus:ring-2 focus:ring-sky-400 outline-none"
                  >
                    {Object.keys(PRODUCT_TYPES).map(k => (
                      <option key={k} value={k}>{t.productTypes[k]} ({PRODUCT_TYPES[k].temp}{"\u00B0"}C)</option>
                    ))}
                  </select>
                </div>
                {roomData.productType === "Benutzerdefiniert" && (
                  <div className="mb-3">
                    {numInput(t.product.targetTemp, roomData.customTemp, v => updateRoom("customTemp", v), t.units.celsius, 1, -40)}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {numInput(t.product.storageWeight, roomData.productWeight, v => updateRoom("productWeight", v), t.units.kg, 100, 0)}
                  {numInput(t.product.dailyIntake, roomData.dailyIntake, v => updateRoom("dailyIntake", v), t.units.kgDay, 100, 0)}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {numInput(t.product.doorOpenings, roomData.doorOpenings, v => updateRoom("doorOpenings", v), t.units.perDay, 1, 0)}
                  {numInput(t.product.lighting, roomData.lighting, v => updateRoom("lighting", v), t.units.wm2, 1, 0)}
                  {numInput(t.product.personnel, roomData.personnel, v => updateRoom("personnel", v), t.units.pers, 1, 0)}
                </div>
              </div>

              {/* Quick Summary */}
              <div className="lg:col-span-2 bg-gradient-to-r from-sky-600/20 to-blue-600/20 backdrop-blur-sm rounded-2xl p-5 border border-sky-400/20">
                <h3 className="text-sm font-bold text-sky-300 mb-3">{"\u26A1"} {t.summary.title}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { l: t.summary.volume, v: `${calc.volume} m\u00B3`, sub: `${t.summary.inner}: ${calc.innerVolume} m\u00B3` },
                    { l: t.summary.temperature, v: `${calc.innerTemp}\u00B0C`, sub: `\u0394T: ${calc.deltaT}K` },
                    { l: t.summary.coolingLoad, v: `${calc.requiredCapacityKW} kW`, sub: `${calc.requiredCapacity} W (${t.summary.incl} 15%)` },
                    { l: t.summary.area, v: `${calc.totalArea} m\u00B2`, sub: `k=${calc.kValue} W/m\u00B2K` },
                  ].map((item, i) => (
                    <div key={i} className="bg-white/5 rounded-xl p-3">
                      <div className="text-xs text-sky-400/70 font-semibold uppercase">{item.l}</div>
                      <div className="text-xl font-black text-white mt-0.5">{item.v}</div>
                      <div className="text-xs text-sky-300/50 mt-0.5">{item.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: Market Reyonları */}
          {tab === "market" && (
            <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-5 border border-white/10">
              <h2 className="text-base font-bold text-sky-300 mb-2 flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-sky-500/20 flex items-center justify-center text-sm">🛒</span>
                {t.tabs.market}
              </h2>
              <p className="text-sm text-sky-100/80">
                Market reyonlari icin olcu, yerlesim ve teklif akisini bu alandan yonetebilirsiniz. Reyon
                bazli hesap, ekipman secimi ve 3D planlama akisi burada toparlanacak sekilde duzenlenmistir.
              </p>
            </div>
          )}

          {/* TAB: 3D View - Enhanced with Equipment */}
          {tab === "3d" && (
            <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-5 border border-white/10">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-sky-300 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-sky-500/20 flex items-center justify-center text-sm">{"\uD83E\uDDCA"}</span>
                  {t.view3d.title}
                </h2>
                <button
                  onClick={() => setShowEquipment3D(prev => !prev)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${showEquipment3D ? 'bg-sky-500 text-white' : 'bg-white/10 text-sky-300/60'}`}
                >
                  {lang === 'tr' ? 'Ekipman Göster' : 'Ausrüstung zeigen'}
                </button>
              </div>
              <div className="space-y-3">
                <Cold3DView
                  width={roomData.width}
                  height={roomData.height}
                  depth={roomData.depth}
                  panelThickness={roomData.panelThickness}
                  innerTemp={calc.innerTemp}
                  doorWidth={roomData.doorWidth}
                  doorHeight={roomData.doorHeight}
                  equipmentLayout={equipmentLayout}
                  pipeConfig={pipeConfig}
                  selectedOptions={selectedOptions}
                  registerCapture={(fn) => { capture3DRef.current = fn; }}
                />
                <div className="flex justify-end gap-2">
                  {pdf3DImage && (
                    <span className="text-[10px] text-emerald-300/80 self-center">
                      {lang === "tr" ? "Bu açı PDF için kaydedildi." : "Dieser Blickwinkel wird im PDF verwendet."}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (capture3DRef.current) {
                        const img = capture3DRef.current();
                        if (img) setPdf3DImage(img);
                      }
                    }}
                    className="px-3 py-1.5 bg-sky-500/20 text-sky-200 rounded-lg text-[11px] font-semibold hover:bg-sky-500 hover:text-white transition-colors"
                  >
                    {lang === "tr" ? "Bu Açıyı PDF'e Kaydet" : "Diesen Blick fürs PDF speichern"}
                  </button>
                </div>
              </div>
              {showEquipment3D && (
                <div className="mt-3 bg-white/5 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-sky-300/70 uppercase mb-2">{lang === 'tr' ? 'Ekipman Yerleşimi' : 'Ausrüstungsanordnung'}</h3>
                  <div className="text-[10px] text-sky-300/60 mb-2">
                    {lang === 'tr'
                      ? 'Kartlara tıklayarak hangi ekipmanların yerleşimde ve PDF notunda görüneceğini seçebilirsin.'
                      : 'Klicke auf die Karten, um festzulegen, welche Ausrüstung in der Anordnung und im PDF erscheinen soll.'}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setEquipmentLayout(prev => ({ ...prev, condenser: !prev.condenser }))}
                      className={`text-left rounded-lg p-2 border transition-colors ${
                        equipmentLayout.condenser
                          ? "bg-orange-500/20 border-orange-400/60"
                          : "bg-orange-500/5 border-orange-400/20 opacity-60"
                      }`}
                    >
                      <div className="w-3 h-3 bg-orange-500 rounded-sm mb-1 inline-block mr-1"></div>
                      <span className="text-orange-300 font-bold">{lang === 'tr' ? 'Kondenser' : 'Verflüssiger'}</span>
                      <div className="text-white/50 mt-1">{lang === 'tr' ? 'Dış ünite - dış duvar' : 'Außeneinheit - Außenwand'}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEquipmentLayout(prev => ({ ...prev, evaporator: !prev.evaporator }))}
                      className={`text-left rounded-lg p-2 border transition-colors ${
                        equipmentLayout.evaporator
                          ? "bg-sky-500/20 border-sky-400/60"
                          : "bg-sky-500/5 border-sky-400/20 opacity-60"
                      }`}
                    >
                      <div className="w-3 h-3 bg-sky-400 rounded-sm mb-1 inline-block mr-1"></div>
                      <span className="text-sky-300 font-bold">{lang === 'tr' ? 'Evaporatör' : 'Verdampfer'}</span>
                      <div className="text-white/50 mt-1">{lang === 'tr' ? 'İç ünite - tavana montaj' : 'Inneneinheit - Deckenmontage'}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEquipmentLayout(prev => ({ ...prev, piping: !prev.piping }))}
                      className={`text-left rounded-lg p-2 border transition-colors ${
                        equipmentLayout.piping
                          ? "bg-blue-500/20 border-blue-400/60"
                          : "bg-blue-500/5 border-blue-400/20 opacity-60"
                      }`}
                    >
                      <div className="flex gap-1 mb-1">
                        <div className="w-6 h-1 bg-blue-400 rounded"></div>
                        <div className="w-6 h-1 bg-red-400 rounded"></div>
                        <div className="w-6 h-1 bg-green-400 rounded"></div>
                      </div>
                      <span className="text-blue-300 font-bold">{lang === 'tr' ? 'Boru Hatları' : 'Rohrleitungen'}</span>
                      <div className="text-white/50 mt-1">{t.piping.suctionLine} {pipeConfig.suctionSize} | {t.piping.dischargeLine} {pipeConfig.dischargeSize} | {t.piping.liquidLine} {pipeConfig.liquidSize}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEquipmentLayout(prev => ({ ...prev, thermostat: !prev.thermostat }))}
                      className={`text-left rounded-lg p-2 border transition-colors ${
                        equipmentLayout.thermostat
                          ? "bg-gray-500/20 border-gray-400/60"
                          : "bg-gray-500/5 border-gray-400/20 opacity-60"
                      }`}
                    >
                      <div className="w-3 h-3 bg-gray-400 rounded-sm mb-1 inline-block mr-1"></div>
                      <span className="text-gray-300 font-bold">{lang === 'tr' ? 'Termostat' : 'Thermostat'}</span>
                      <div className="text-white/50 mt-1">{lang === 'tr' ? 'Dijital kontrol paneli' : 'Digitale Steuerung'}</div>
                    </button>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                {[
                  { l: t.view3d.outerDim, v: `${roomData.width} \u00D7 ${roomData.depth} \u00D7 ${roomData.height} m` },
                  { l: t.view3d.innerDim, v: `${calc.innerWidth} \u00D7 ${calc.innerDepth} \u00D7 ${calc.innerHeight} m` },
                  { l: t.view3d.panel, v: `${roomData.panelThickness} mm PIR` },
                  { l: t.view3d.door, v: `${roomData.doorWidth} \u00D7 ${roomData.doorHeight} m` },
                ].map((item, i) => (
                  <div key={i} className="bg-white/5 rounded-xl p-3">
                    <div className="text-xs text-sky-400/70 font-semibold">{item.l}</div>
                    <div className="text-sm font-bold text-white mt-0.5">{item.v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: Calculation Results */}
          {tab === "calc" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-5 border border-white/10">
                <h2 className="text-base font-bold text-sky-300 mb-4">{"\uD83D\uDCCA"} {t.calc.title}</h2>
                <div className="space-y-2.5">
                  {[
                    { label: t.calc.q1, value: calc.Q1, desc: t.calc.q1desc },
                    { label: t.calc.q2, value: calc.Q2, desc: t.calc.q2desc },
                    { label: t.calc.q3, value: calc.Q3, desc: t.calc.q3desc },
                    { label: t.calc.q4, value: calc.Q4, desc: t.calc.q4desc },
                    { label: t.calc.q5, value: calc.Q5, desc: t.calc.q5desc },
                    { label: t.calc.q6, value: calc.Q6, desc: t.calc.q6desc },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{item.label}</div>
                        <div className="text-xs text-sky-300/50">{item.desc}</div>
                      </div>
                      <div className="text-base font-black text-sky-300">{Number(item.value).toLocaleString()} W</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-gradient-to-br from-sky-600/30 to-blue-700/30 backdrop-blur-sm rounded-2xl p-5 border border-sky-400/20">
                  <h3 className="text-sm font-bold text-sky-200 mb-3">{"\uD83C\uDFAF"} {t.calc.result}</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-sky-200/70">{t.calc.totalLoad}</span>
                      <span className="text-lg font-black text-white">{Number(calc.totalLoad).toLocaleString()} W</span>
                    </div>
                    <div className="h-px bg-sky-300/20" />
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-sky-200/70">{t.calc.safety}</span>
                      <span className="text-lg font-black text-white">{Number(calc.requiredCapacity).toLocaleString()} W</span>
                    </div>
                    <div className="h-px bg-sky-300/20" />
                    <div className="flex justify-between items-center bg-sky-500/20 rounded-xl p-3 -mx-1">
                      <span className="text-base font-bold text-white">{t.calc.requiredCapacity}</span>
                      <span className="text-2xl font-black text-sky-300">{calc.requiredCapacityKW} kW</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-5 border border-white/10">
                  <h3 className="text-sm font-bold text-sky-300 mb-3">{"\uD83D\uDCCB"} {t.calc.roomData}</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                      [t.calc.outerVolume, `${calc.volume} m\u00B3`],
                      [t.calc.innerVolume, `${calc.innerVolume} m\u00B3`],
                      [t.calc.totalArea, `${calc.totalArea} m\u00B2`],
                      [t.calc.kValue, `${calc.kValue} W/m\u00B2K`],
                      [t.calc.innerTemp, `${calc.innerTemp}\u00B0C`],
                      ["\u0394T", `${calc.deltaT} K`],
                      [t.calc.productLabel, t.productTypes[roomData.productType]],
                      [t.calc.storageWeight, `${roomData.productWeight} kg`],
                    ].map(([l, v], i) => (
                      <div key={i} className="flex justify-between py-1.5 border-b border-white/5">
                        <span className="text-sky-300/60">{l}</span>
                        <span className="font-semibold text-white">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Catalog */}
          {tab === "catalog" && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-5 border border-white/10">
                <h2 className="text-base font-bold text-sky-300 mb-4 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-sky-500/20 flex items-center justify-center text-sm">{"\u2744\uFE0F"}</span>
                  {t.catalog.title}
                </h2>
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-sky-300/50 uppercase">{t.catalog.brand}</label>
                    <select
                      value={catalogBrand}
                      onChange={e => setCatalogBrand(e.target.value)}
                      className="px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-sm text-white focus:ring-1 focus:ring-sky-400 outline-none"
                    >
                      <option value="">{t.catalog.allBrands}</option>
                      {COMPRESSOR_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-sky-300/50 uppercase">{t.catalog.systemType}</label>
                    <select
                      value={catalogType}
                      onChange={e => setCatalogType(e.target.value)}
                      className="px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-sm text-white focus:ring-1 focus:ring-sky-400 outline-none"
                    >
                      <option value="">Alle / Hepsi</option>
                      {Object.entries(SYSTEM_TYPES).map(([k, v]) => (
                        <option key={k} value={k}>{lang === "tr" ? v.tr : v.de}</option>
                      ))}
                    </select>
                  </div>
                  <div className="bg-sky-500/20 rounded-xl px-4 py-2 border border-sky-400/20">
                    <span className="text-xs text-sky-300/60">{t.calc.requiredCapacity}:</span>
                    <span className="text-sm font-black text-white ml-2">{calc.requiredCapacityKW} kW ({Number(calc.requiredCapacity).toLocaleString()} W)</span>
                  </div>
                </div>
              </div>

              {/* Catalog Cards */}
              {filteredCatalog.length === 0 ? (
                <div className="text-center text-sky-300/50 py-12 text-sm">{t.catalog.noMatch}</div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {filteredCatalog.map((item) => {
                    const recommended = isRecommended(item);
                    const totalSysPrice = item.outdoorPrice + (item.indoorPrice * item.evapQty);
                    return (
                      <div
                        key={item.code}
                        className={`rounded-2xl p-4 border transition-all ${
                          recommended
                            ? "bg-emerald-500/10 border-emerald-400/30"
                            : "bg-white/[0.06] border-white/10"
                        }`}
                      >
                        {recommended && (
                          <div className="text-xs font-bold text-emerald-400 mb-2">{"\u2605"} {t.catalog.recommended}</div>
                        )}
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <span className="text-xs font-bold text-sky-400 bg-sky-500/20 px-2 py-0.5 rounded mr-2">{item.brand}</span>
                            <span className="text-xs font-bold text-white/60">{item.type === "M" ? "Normal (M)" : "Tief (L)"}</span>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-sky-300/50">{t.catalog.capacity}</div>
                            <div className={`text-lg font-black ${recommended ? "text-emerald-300" : "text-sky-300"}`}>{(item.capacity / 1000).toFixed(1)} kW</div>
                            <div className="text-xs text-white/40">{item.capacity.toLocaleString()} W</div>
                          </div>
                        </div>
                        <div className="space-y-1.5 text-xs mb-3">
                          <div className="bg-white/5 rounded-lg p-2">
                            <div className="text-sky-300/50 font-semibold uppercase text-[10px]">{t.catalog.outdoor}</div>
                            <div className="text-white font-medium truncate">{item.outdoor}</div>
                            <div className="flex justify-between mt-1">
                              <span className="text-white/50">{t.catalog.compressor}: {item.compressor} | {item.hp} {t.catalog.hp}</span>
                              <span className="text-sky-300 font-bold">{item.outdoorPrice.toLocaleString("de-DE", { minimumFractionDigits: 2 })} {"\u20AC"}</span>
                            </div>
                          </div>
                          <div className="bg-white/5 rounded-lg p-2">
                            <div className="text-sky-300/50 font-semibold uppercase text-[10px]">{t.catalog.indoor}</div>
                            <div className="text-white font-medium truncate">{item.indoor}</div>
                            <div className="flex justify-between mt-1">
                              <span className="text-white/50">{t.catalog.qty}: {item.evapQty} | {item.evapCapacity.toLocaleString()} W</span>
                              <span className="text-sky-300 font-bold">{item.indoorPrice.toLocaleString("de-DE", { minimumFractionDigits: 2 })} {"\u20AC"} {item.evapQty > 1 ? `x${item.evapQty}` : ""}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs text-sky-300/50">{t.catalog.totalSystem}:</span>
                            <span className="text-base font-black text-white ml-2">{totalSysPrice.toLocaleString("de-DE", { minimumFractionDigits: 2 })} {"\u20AC"}</span>
                          </div>
                          <button
                            onClick={() => addCatalogToProducts(item)}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                              catalogAdded === item.code
                                ? "bg-emerald-500 text-white"
                                : "bg-sky-500 text-white hover:bg-sky-400"
                            }`}
                          >
                            {catalogAdded === item.code ? t.catalog.added : t.catalog.addToOffer}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB: Options */}
          {tab === "options" && (
            <div className="space-y-4">
              <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-5 border border-white/10">
                <h2 className="text-base font-bold text-sky-300 mb-2 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-sky-500/20 flex items-center justify-center text-sm">{"\uD83D\uDD27"}</span>
                  {t.options.title}
                </h2>
                <div className="text-xs text-sky-300/50 mb-4">
                  {lang === "de" ? "Bodenfläche" : "Zemin Alanı"}: {floorArea.toFixed(1)} m{"\u00B2"}
                </div>
              </div>

              {OPTION_CATEGORIES.map(catKey => {
                const items = OPTIONS_CATALOG[catKey];
                if (!items || items.length === 0) return null;
                return (
                  <div key={catKey} className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-5 border border-white/10">
                    <h3 className="text-sm font-bold text-sky-300 mb-3">{t.options[catKey]}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {items.map(opt => {
                        const isSelected = !!selectedOptions[opt.id];
                        const price = getOptionPrice(opt);
                        return (
                          <button
                            key={opt.id}
                            onClick={() => toggleOption(opt.id)}
                            className={`text-left rounded-xl p-3 border transition-all ${
                              isSelected
                                ? "bg-sky-500/20 border-sky-400/40"
                                : "bg-white/5 border-white/10 hover:bg-white/10"
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-white truncate">{lang === "tr" ? opt.tr : opt.de}</div>
                                {opt.pricePerM2 && (
                                  <div className="text-xs text-sky-300/50 mt-0.5">
                                    {opt.pricePerM2} {"\u20AC"}/{t.options.pricePerM2} ({floorArea.toFixed(1)} m{"\u00B2"})
                                  </div>
                                )}
                              </div>
                              <div className="text-right ml-2">
                                <div className="text-sm font-bold text-sky-300">{price > 0 ? `${price.toLocaleString("de-DE", { minimumFractionDigits: 2 })} \u20AC` : "---"}</div>
                                {isSelected && <div className="text-[10px] font-bold text-emerald-400 mt-0.5">{t.options.selected}</div>}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Options summary and add button */}
              {selectedOptionItems.length > 0 && (
                <div className="bg-gradient-to-r from-sky-600/20 to-blue-600/20 backdrop-blur-sm rounded-2xl p-5 border border-sky-400/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-sky-200/70">{t.options.optionsTotal} ({selectedOptionItems.length}):</span>
                      <span className="text-xl font-black text-white ml-3">{optionsTotalPrice.toLocaleString("de-DE", { minimumFractionDigits: 2 })} {"\u20AC"}</span>
                    </div>
                    <button
                      onClick={addOptionsToProducts}
                      className="px-6 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-bold hover:bg-sky-400 transition-colors"
                    >
                      {t.options.addToOffer}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: Piping & Materials */}
          {tab === "piping" && (
            <div className="space-y-4">
              {/* Section A: Pipe Selection */}
              <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-5 border border-white/10">
                <h2 className="text-base font-bold text-sky-300 mb-4 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-sky-500/20 flex items-center justify-center text-sm">{"\uD83D\uDD29"}</span>
                  {t.piping.pipeSelection}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { label: t.piping.suctionLine, key: 'suctionSize', color: 'text-blue-400' },
                    { label: t.piping.dischargeLine, key: 'dischargeSize', color: 'text-red-400' },
                    { label: t.piping.liquidLine, key: 'liquidSize', color: 'text-green-400' },
                  ].map(({ label, key, color }) => (
                    <div key={key} className="flex flex-col gap-1">
                      <label className={`text-xs font-bold uppercase ${color}`}>{label}</label>
                      <select
                        value={pipeConfig[key]}
                        onChange={e => setPipeConfig(prev => ({ ...prev, [key]: e.target.value }))}
                        className="px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-sm text-white focus:ring-1 focus:ring-sky-400 outline-none"
                      >
                        {PIPE_CATALOG.map(p => (
                          <option key={p.size} value={p.size}>{p.size} ({p.outerDiameter}mm) - {p.pricePerMeter.toFixed(2)} {"\u20AC"}/m</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section B: Pipe Length Calculator */}
              <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-5 border border-white/10">
                <h3 className="text-sm font-bold text-sky-300 mb-4">{"\uD83D\uDCCF"} {t.piping.pipeLengthCalc}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  {numInput(t.piping.distanceOutdoorIndoor, pipeConfig.distance, v => setPipeConfig(prev => ({...prev, distance: v})), 'm', 0.5, 1)}
                  {numInput(t.piping.heightDifference, pipeConfig.heightDiff, v => setPipeConfig(prev => ({...prev, heightDiff: v})), 'm', 0.5, 0)}
                  {numInput(t.piping.additionalLength, pipeConfig.additionalLength, v => setPipeConfig(prev => ({...prev, additionalLength: v})), 'm', 0.5, 0)}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { l: t.piping.suctionLine, v: `${pipeLengths.suctionLength.toFixed(1)} m`, c: pipePrices.suctionCost, clr: 'text-blue-400' },
                    { l: t.piping.dischargeLine, v: `${pipeLengths.dischargeLength.toFixed(1)} m`, c: pipePrices.dischargeCost, clr: 'text-red-400' },
                    { l: t.piping.liquidLine, v: `${pipeLengths.liquidLength.toFixed(1)} m`, c: pipePrices.liquidCost, clr: 'text-green-400' },
                    { l: t.piping.totalPipeLength, v: `${pipeLengths.totalLength.toFixed(1)} m`, c: pipePrices.totalPipeCost, clr: 'text-sky-300' },
                  ].map((item, i) => (
                    <div key={i} className="bg-white/5 rounded-xl p-3">
                      <div className={`text-xs font-bold ${item.clr}`}>{item.l}</div>
                      <div className="text-lg font-black text-white">{item.v}</div>
                      <div className="text-xs text-sky-300/50">{item.c.toLocaleString("de-DE", { minimumFractionDigits: 2 })} {"\u20AC"}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section C: Silicone & Foam Calculator */}
              <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-5 border border-white/10">
                <h3 className="text-sm font-bold text-sky-300 mb-4">{"\uD83E\uDDF4"} {t.piping.insulationCalc}</h3>
                <div className="text-xs text-sky-300/50 mb-3">{t.piping.panelJoints}: {sealingCalc.jointLength} m | {t.piping.doorSeal}: {sealingCalc.doorSealLength} m</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { label: t.piping.siliconNeeded, qty: sealingCalc.siliconCartridges, unit: lang === 'tr' ? 'adet' : 'Stk', desc: lang === 'tr' ? 'Soğuk Oda Silikonu 310ml' : 'Kühlraumsilikon 310ml', price: (INSULATION_CATALOG.find(i => i.id === 'silikon-kuehl')?.price || 0) * sealingCalc.siliconCartridges },
                    { label: t.piping.foamNeeded, qty: sealingCalc.foamCans, unit: lang === 'tr' ? 'adet' : 'Stk', desc: lang === 'tr' ? 'PU Köpük Soğuk 750ml' : 'PU-Schaum Kälte 750ml', price: (INSULATION_CATALOG.find(i => i.id === 'pu-schaum-kalt')?.price || 0) * sealingCalc.foamCans },
                    { label: t.piping.tapeNeeded, qty: sealingCalc.aluTapeRolls, unit: lang === 'tr' ? 'rulo' : 'Rolle', desc: lang === 'tr' ? 'Alüminyum Bant 50mm' : 'Alu-Klebeband 50mm', price: (INSULATION_CATALOG.find(i => i.id === 'klebeband-alu')?.price || 0) * sealingCalc.aluTapeRolls },
                    { label: t.piping.sealingNeeded, qty: sealingCalc.doorSealRolls, unit: lang === 'tr' ? 'rulo' : 'Rolle', desc: 'EPDM 20×3mm', price: (INSULATION_CATALOG.find(i => i.id === 'dichtband')?.price || 0) * sealingCalc.doorSealRolls },
                    { label: t.piping.insulationNeeded, qty: sealingCalc.pipeInsulationLength, unit: 'm', desc: 'Armaflex 13mm', price: (INSULATION_CATALOG.find(i => i.id === 'armaflex-13')?.price || 0) * parseFloat(sealingCalc.pipeInsulationLength) },
                  ].map((item, i) => (
                    <div key={i} className="bg-white/5 rounded-xl p-3">
                      <div className="text-xs text-sky-300/60 font-bold">{item.label}</div>
                      <div className="text-lg font-black text-white">{item.qty} {item.unit}</div>
                      <div className="text-xs text-white/40">{item.desc}</div>
                      <div className="text-xs font-bold text-sky-300 mt-1">{item.price.toLocaleString("de-DE", { minimumFractionDigits: 2 })} {"\u20AC"}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total & Add to Offer */}
              <div className="bg-gradient-to-r from-sky-600/20 to-blue-600/20 backdrop-blur-sm rounded-2xl p-5 border border-sky-400/20">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-sky-200/70">{t.piping.totalMaterialCost}:</span>
                    <span className="text-2xl font-black text-white ml-3">{sealingMaterialCost.toLocaleString("de-DE", { minimumFractionDigits: 2 })} {"\u20AC"}</span>
                  </div>
                  <button onClick={addPipingToProducts} className="px-6 py-3 bg-sky-500 text-white rounded-xl text-sm font-bold hover:bg-sky-400 transition-colors shadow-lg">
                    {t.piping.addAllToOffer}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Material Shop */}
          {tab === "materialShop" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Left: Product Listing */}
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-5 border border-white/10">
                  <h2 className="text-base font-bold text-sky-300 mb-4 flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-sky-500/20 flex items-center justify-center text-sm">{"\uD83C\uDFEA"}</span>
                    {t.materialShop.title}
                    <span className="text-xs text-sky-300/40 ml-2">({filteredMaterials.length} {lang === 'tr' ? '\u00FCr\u00FCn' : 'Produkte'})</span>
                  </h2>
                  {/* Search & Filters */}
                  <div className="flex flex-wrap gap-3 mb-4">
                    <input
                      value={materialSearch}
                      onChange={e => { setMaterialSearch(e.target.value); setMaterialPage(0); }}
                      placeholder={t.materialShop.searchPlaceholder}
                      className="flex-1 min-w-[200px] px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-sm text-white focus:ring-1 focus:ring-sky-400 outline-none placeholder-white/30"
                    />
                    <select value={materialCategory} onChange={e => { setMaterialCategory(e.target.value); setMaterialPage(0); }} className="px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-sm text-white focus:ring-1 focus:ring-sky-400 outline-none">
                      <option value="">{t.materialShop.allCategories}</option>
                      {Object.entries(MATERIAL_CATEGORIES).map(([k, v]) => (
                        <option key={k} value={k}>{lang === 'tr' ? v.tr : v.de}</option>
                      ))}
                    </select>
                    <select value={materialBrand} onChange={e => { setMaterialBrand(e.target.value); setMaterialPage(0); }} className="px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-sm text-white focus:ring-1 focus:ring-sky-400 outline-none">
                      <option value="">{t.materialShop.allBrands}</option>
                      {materialBrands.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                </div>

                {/* Product Grid */}
                {pagedMaterials.length === 0 ? (
                  <div className="text-center text-sky-300/40 py-12 text-sm">{t.materialShop.noResults}</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {pagedMaterials.map(item => (
                        <div key={item.id} className="bg-white/[0.06] backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:border-sky-400/30 transition-all">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-white truncate">{localizeMaterialName(item.name, lang)}</div>
                            <div className="flex items-center gap-2 mt-1">
                              {item.brand && <span className="text-[10px] font-bold text-sky-400 bg-sky-500/20 px-1.5 py-0.5 rounded">{item.brand}</span>}
                              {item.code && <span className="text-[10px] text-white/40">{item.code}</span>}
                              {stock[item.id] != null && stock[item.id] > 0 && (
                                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded">
                                  {lang === "tr" ? "Stok:" : "Lager:"} {stock[item.id]}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right ml-2">
                            <div className="text-base font-black text-sky-300">{item.price.toLocaleString("de-DE", { minimumFractionDigits: 2 })} {"\u20AC"}</div>
                            <div className="text-[10px] text-white/30">{MATERIAL_CATEGORIES[item.category] ? (lang === 'tr' ? MATERIAL_CATEGORIES[item.category].tr : MATERIAL_CATEGORIES[item.category].de) : item.category}</div>
                          </div>
                        </div>
                        {item.specs && Object.keys(item.specs).length > 0 && (
                          <div className="text-[10px] text-white/30 mb-2 flex flex-wrap gap-1">
                            {Object.entries(item.specs).slice(0, 3).map(([k, v]) => (
                              <span key={k} className="bg-white/5 px-1.5 py-0.5 rounded">{k}: {v}</span>
                            ))}
                          </div>
                        )}
                        <button
                          onClick={() => addToCart(item)}
                          className="w-full px-3 py-1.5 bg-sky-500/20 text-sky-300 rounded-lg text-xs font-bold hover:bg-sky-500 hover:text-white transition-all"
                        >
                          + {t.materialShop.addToCart}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination */}
                {totalMaterialPages > 1 && (
                  <div className="flex justify-center gap-2 mt-4">
                    <button onClick={() => setMaterialPage(p => Math.max(0, p - 1))} disabled={materialPage === 0} className="px-3 py-1 bg-white/10 text-white rounded-lg text-xs disabled:opacity-30">&laquo;</button>
                    <span className="px-3 py-1 text-sky-300 text-xs">{materialPage + 1} / {totalMaterialPages}</span>
                    <button onClick={() => setMaterialPage(p => Math.min(totalMaterialPages - 1, p + 1))} disabled={materialPage >= totalMaterialPages - 1} className="px-3 py-1 bg-white/10 text-white rounded-lg text-xs disabled:opacity-30">&raquo;</button>
                  </div>
                )}
              </div>

              {/* Right: Shopping Cart */}
              <div className="lg:col-span-1">
                <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-5 border border-white/10 sticky top-4">
                  <h3 className="text-sm font-bold text-sky-300 mb-3 flex items-center gap-2">
                    {"\uD83D\uDED2"} {t.materialShop.cart}
                    {cart.length > 0 && <span className="bg-sky-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{cart.length}</span>}
                  </h3>
                  {cart.length === 0 ? (
                    <div className="text-center text-sky-300/30 py-8 text-xs">{t.materialShop.cartEmpty}</div>
                  ) : (
                    <>
                      <div className="space-y-2 max-h-[50vh] overflow-y-auto mb-4">
                        {cart.map(item => (
                          <div key={item.id} className="bg-white/5 rounded-lg p-2.5">
                            <div className="text-xs font-medium text-white truncate mb-1">{item.name}</div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                <button onClick={() => updateCartQty(item.id, item.qty - 1)} className="w-6 h-6 bg-white/10 text-white rounded text-xs hover:bg-white/20">-</button>
                                <span className="text-xs text-white font-bold w-8 text-center">{item.qty}</span>
                                <button onClick={() => updateCartQty(item.id, item.qty + 1)} className="w-6 h-6 bg-white/10 text-white rounded text-xs hover:bg-white/20">+</button>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-sky-300">{(item.price * item.qty).toLocaleString("de-DE", { minimumFractionDigits: 2 })} {"\u20AC"}</span>
                                <button onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-300 text-sm">{"\u00D7"}</button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-white/10 pt-3 mb-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-sky-200/70">{t.materialShop.cartTotal}:</span>
                          <span className="text-xl font-black text-white">{cartTotal.toLocaleString("de-DE", { minimumFractionDigits: 2 })} {"\u20AC"}</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <button onClick={addCartToProducts} className="flex-1 px-4 py-2.5 bg-sky-500 text-white rounded-lg text-xs font-bold hover:bg-sky-400 transition-colors">
                            {t.materialShop.addToOffer}
                          </button>
                          <button onClick={addCartToStock} className="flex-1 px-4 py-2.5 bg-emerald-500 text-white rounded-lg text-xs font-bold hover:bg-emerald-400 transition-colors">
                            {t.materialShop.addToStock}
                          </button>
                          <button onClick={sendCartToDRCProject} className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-400 transition-colors">
                            {lang === "tr" ? "📤 DRC Projeye Kaydet" : "📤 In DRC-Projekt speichern"}
                          </button>
                          <button onClick={() => setCart([])} className="px-3 py-2.5 bg-red-500/20 text-red-300 rounded-lg text-xs font-bold hover:bg-red-500/30 transition-colors">
                            {t.materialShop.clearCart}
                          </button>
                        </div>
                        {stockEntryMsg && (
                          <div className="text-xs text-emerald-400 font-medium animate-pulse">
                            {lang === "tr" ? "✓ Stoğa giriş yapıldı!" : "✓ Lagerbestand aktualisiert!"}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: Products & Prices */}
          {tab === "products" && (
            <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-5 border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-sky-300 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-sky-500/20 flex items-center justify-center text-sm">{"\uD83D\uDCB0"}</span>
                  {t.products.title}
                </h2>
                <div className="flex gap-2">
                  {products.length > 0 && (
                    <button
                      onClick={() => setProducts([])}
                      className="px-4 py-2 bg-red-500/20 text-red-300 rounded-lg text-sm font-bold hover:bg-red-500/30 transition-colors"
                    >
                      {t.products.clearAll}
                    </button>
                  )}
                  <button
                    onClick={addProduct}
                    className="px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-bold hover:bg-sky-400 transition-colors"
                  >
                    {t.products.addProduct}
                  </button>
                </div>
              </div>

              {roomEnvelopeProducts.length > 0 && (
                <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <div className="text-sm font-black text-emerald-200">
                        {lang === "tr" ? "Otomatik Oda Gövdesi" : "Automatische Raumhülle"}
                      </div>
                      <div className="text-xs text-emerald-100/70">
                        {lang === "tr"
                          ? "Panel ve kapı kalemleri oda ölçülerinden otomatik oluşur ve toplam teklife dahil edilir."
                          : "Panel- und Türpositionen werden automatisch aus den Raummaßen berechnet und in die Summe übernommen."}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-100/55">
                        {lang === "tr" ? "Otomatik Toplam" : "Auto-Summe"}
                      </div>
                      <div className="text-lg font-black text-white">
                        {roomEnvelopeProducts.reduce((sum, item) => sum + (item.price * item.qty), 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {roomEnvelopeProducts.map((p) => (
                      <div key={p.id} className="bg-black/10 rounded-xl p-3 grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-2">
                          <label className="text-[10px] text-emerald-100/55 uppercase font-bold">{t.products.category}</label>
                          <div className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white/90">{p.category}</div>
                        </div>
                        <div className="col-span-3">
                          <label className="text-[10px] text-emerald-100/55 uppercase font-bold">{t.products.description}</label>
                          <div className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white/90">{p.name}</div>
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] text-emerald-100/55 uppercase font-bold">{t.products.model}</label>
                          <div className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white/90">{p.model}</div>
                        </div>
                        <div className="col-span-1">
                          <label className="text-[10px] text-emerald-100/55 uppercase font-bold">{t.products.quantity}</label>
                          <div className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white/90">{formatOfferQty(p.qty)}</div>
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] text-emerald-100/55 uppercase font-bold">{t.products.price} (€)</label>
                          <div className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white/90">{p.price.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</div>
                        </div>
                        <div className="col-span-2 flex justify-between items-center">
                          <span className="text-xs font-bold text-emerald-200">{(p.price * p.qty).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
                          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-100/45">
                            {lang === "tr" ? "Auto" : "Auto"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {products.length === 0 ? (
                roomEnvelopeProducts.length === 0 ? (
                  <div className="text-center text-sky-300/40 py-12 text-sm">
                    {lang === "de" ? "Keine Positionen. Produkte aus dem Katalog oder Optionen hinzufügen." : "Kalem yok. Katalog veya opsiyonlardan ekleyin."}
                  </div>
                ) : null
              ) : (
                <div className="space-y-2.5">
                  {products.map((p) => (
                    <div key={p.id} className="bg-white/5 rounded-xl p-3 grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-2">
                        <label className="text-[10px] text-sky-300/50 uppercase font-bold">{t.products.category}</label>
                        <input
                          value={p.category}
                          onChange={e => updateProduct(p.id, "category", e.target.value)}
                          className="w-full px-2 py-1.5 bg-white/10 border border-white/10 rounded-lg text-xs text-white focus:ring-1 focus:ring-sky-400 outline-none"
                          placeholder={t.products.category}
                        />
                      </div>
                      <div className="col-span-3">
                        <label className="text-[10px] text-sky-300/50 uppercase font-bold">{t.products.description}</label>
                        <input
                          value={p.name}
                          onChange={e => updateProduct(p.id, "name", e.target.value)}
                          className="w-full px-2 py-1.5 bg-white/10 border border-white/10 rounded-lg text-xs text-white focus:ring-1 focus:ring-sky-400 outline-none"
                          placeholder={t.products.description}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[10px] text-sky-300/50 uppercase font-bold">{t.products.model}</label>
                        <input
                          value={p.model}
                          onChange={e => updateProduct(p.id, "model", e.target.value)}
                          className="w-full px-2 py-1.5 bg-white/10 border border-white/10 rounded-lg text-xs text-white focus:ring-1 focus:ring-sky-400 outline-none"
                          placeholder={t.products.model}
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="text-[10px] text-sky-300/50 uppercase font-bold">{t.products.quantity}</label>
                        <input
                          type="number"
                          value={p.qty}
                          onChange={e => updateProduct(p.id, "qty", parseInt(e.target.value) || 1)}
                          min={1}
                          className="w-full px-2 py-1.5 bg-white/10 border border-white/10 rounded-lg text-xs text-white focus:ring-1 focus:ring-sky-400 outline-none"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[10px] text-sky-300/50 uppercase font-bold">{t.products.price} ({"\u20AC"})</label>
                        <input
                          type="number"
                          value={p.price}
                          onChange={e => updateProduct(p.id, "price", parseFloat(e.target.value) || 0)}
                          step={10}
                          min={0}
                          className="w-full px-2 py-1.5 bg-white/10 border border-white/10 rounded-lg text-xs text-white focus:ring-1 focus:ring-sky-400 outline-none"
                          placeholder="0.00"
                        />
                      </div>
                      <div className="col-span-2 flex justify-between items-center">
                        <span className="text-xs font-bold text-sky-300">{(p.price * p.qty).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
                        <button onClick={() => removeProduct(p.id)} className="text-red-400 hover:text-red-300 text-lg leading-none ml-1">{"\u00D7"}</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex justify-end">
                <div className="bg-sky-500/20 rounded-xl px-6 py-3 border border-sky-400/20">
                  <span className="text-sm text-sky-200/70 mr-4">{t.products.totalPrice}:</span>
                  <span className="text-2xl font-black text-white">{totalPrice.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
                  <div className="text-xs text-sky-300/50 text-right mt-0.5">
                    {t.products.exclVat}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Offer / PDF */}
          {tab === "offer" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-5 border border-white/10">
                <h2 className="text-base font-bold text-sky-300 mb-4">{"\uD83C\uDFE2"} {t.offer.companyTitle}</h2>
                <div className="space-y-2.5">
                  {[
                    [t.offer.company, "name"],
                    [t.offer.owner, "owner"],
                    [t.offer.address, "address"],
                    [t.offer.warehouse, "warehouse"],
                    [t.offer.phone, "phone"],
                    [t.offer.email, "email"],
                    ["E-Mail 2", "email2"],
                    [t.offer.web, "web"],
                    [t.offer.taxId, "taxId"],
                    [t.offer.registerNr, "registerNr"],
                    ["Steuernummer", "steuernummer"],
                  ].map(([label, key]) => (
                    <div key={key}>
                      <label className="text-xs text-sky-300/50 uppercase font-bold">{label}</label>
                      <input
                        value={company[key] || ""}
                        onChange={e => setCompany(prev => ({ ...prev, [key]: e.target.value }))}
                        className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-sm text-white focus:ring-1 focus:ring-sky-400 outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-5 border border-white/10">
                <h2 className="text-base font-bold text-sky-300 mb-4">{"\uD83D\uDC64"} {t.offer.customerTitle}</h2>
                <div className="space-y-2.5">
                  {[
                    [t.offer.name, "name"], [t.offer.company, "company"], [t.offer.address, "address"],
                    [t.offer.phone, "phone"], [t.offer.email, "email"],
                  ].map(([label, key]) => (
                    <div key={key}>
                      <label className="text-xs text-sky-300/50 uppercase font-bold">{label}</label>
                      <input
                        value={customer[key]}
                        onChange={e => setCustomer(prev => ({ ...prev, [key]: e.target.value }))}
                        className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-sm text-white focus:ring-1 focus:ring-sky-400 outline-none"
                        placeholder={label}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-2 bg-white/[0.06] backdrop-blur-sm rounded-2xl p-5 border border-white/10">
                <h2 className="text-base font-bold text-sky-300 mb-4">{"\uD83D\uDCC4"} {t.offer.settingsTitle}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-sky-300/50 uppercase font-bold">{t.offer.offerNumber}</label>
                    <input
                      value={offerNumber}
                      onChange={e => setOfferNumber(e.target.value)}
                      className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-sm text-white focus:ring-1 focus:ring-sky-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-sky-300/50 uppercase font-bold">{t.offer.date}</label>
                    <input
                      type="date"
                      defaultValue={new Date().toISOString().split("T")[0]}
                      className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-sm text-white focus:ring-1 focus:ring-sky-400 outline-none"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="text-xs text-sky-300/50 uppercase font-bold">{t.offer.notes}</label>
                  <textarea
                    value={offerNotes}
                    onChange={e => setOfferNotes(e.target.value)}
                    rows={6}
                    className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-sm text-white focus:ring-1 focus:ring-sky-400 outline-none mt-1"
                  />
                </div>
              </div>

              <div className="lg:col-span-2 flex justify-center gap-4">
                <button
                  onClick={saveOfferToHistory}
                  className="px-8 py-4 bg-emerald-600 text-white rounded-2xl text-lg font-black shadow-xl hover:bg-emerald-500 transition-all"
                >
                  {offerSavedMsg ? t.offer.saved : t.offer.saveOffer}
                </button>
                <button
                  onClick={handleExportPDF}
                  disabled={generating}
                  className="px-10 py-4 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-2xl text-lg font-black shadow-xl shadow-sky-500/30 hover:shadow-sky-500/50 hover:scale-[1.02] transition-all disabled:opacity-50"
                >
                  {generating ? t.offer.generating : `\uD83D\uDCC4 ${t.offer.exportPdf}`}
                </button>
              </div>
            </div>
          )}

          {/* TAB: History */}
          {tab === "history" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Saved Customers */}
              <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-5 border border-white/10">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-sky-300">{t.history.customerHistory}</h2>
                  <button
                    onClick={saveCustomerToHistory}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-500 transition-colors"
                  >
                    {customerSavedMsg ? t.offer.saved : t.history.saveCustomer}
                  </button>
                </div>
                {savedCustomers.length === 0 ? (
                  <div className="text-sm text-sky-300/40 py-6 text-center">{t.history.noCustomers}</div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {savedCustomers.map((c, idx) => (
                      <div key={idx} className="bg-white/5 rounded-xl p-3 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-white">{c.name || c.company || "---"}</div>
                          <div className="text-xs text-sky-300/50">{c.company} {c.phone ? `| ${c.phone}` : ""}</div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => loadCustomerFromHistory(c)}
                            className="px-3 py-1 bg-sky-500 text-white rounded-lg text-xs font-bold hover:bg-sky-400"
                          >
                            {t.history.loadOffer}
                          </button>
                          <button
                            onClick={() => deleteCustomerFromHistory(idx)}
                            className="px-3 py-1 bg-red-500/20 text-red-300 rounded-lg text-xs font-bold hover:bg-red-500/30"
                          >
                            {t.history.deleteOffer}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Saved Offers */}
              <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-5 border border-white/10">
                <h2 className="text-base font-bold text-sky-300 mb-4">{t.history.offerHistory}</h2>
                {savedOffers.length === 0 ? (
                  <div className="text-sm text-sky-300/40 py-6 text-center">{t.history.noOffers}</div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {savedOffers.map((offer, idx) => (
                      <div key={idx} className="bg-white/5 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-sm font-bold text-white">{offer.offerNumber}</div>
                          <div className="text-xs text-sky-300/50">{new Date(offer.date).toLocaleDateString(lang === "tr" ? "tr-TR" : "de-DE")}</div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs text-sky-300/60">{t.history.customerName}: {offer.customer?.name || offer.customer?.company || "---"}</div>
                            <div className="text-xs text-sky-300/60">{t.history.offerTotal}: <span className="font-bold text-white">{offer.totalPrice?.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span></div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => loadOfferFromHistory(offer)}
                              className="px-3 py-1 bg-sky-500 text-white rounded-lg text-xs font-bold hover:bg-sky-400"
                            >
                              {t.history.loadOffer}
                            </button>
                            <button
                              onClick={() => deleteOfferFromHistory(idx)}
                              className="px-3 py-1 bg-red-500/20 text-red-300 rounded-lg text-xs font-bold hover:bg-red-500/30"
                            >
                              {t.history.deleteOffer}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
