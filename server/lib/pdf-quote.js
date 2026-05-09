"use strict";

/**
 * Teklif/satış PDF rendering modülü.
 *
 * pdfkit ile teklif dokümanı çizer. 2-sayfa otomatik continuation, marka
 * çubuğu, IBAN/BIC bloğu, KDV/iskonto özet kartı, imza alanı içerir.
 *
 * Şirket bilgisi (logo, adres, IBAN) ve PDF font path'leri dışarıdan
 * configurePdfModule() ile inject edilir; modülün COMPANY_PROFILE veya
 * font path konstantlarına direkt bağımlılığı yoktur.
 *
 * Public API:
 *   configurePdfModule({ companyProfile, pdfFonts })
 *   renderQuotePdf(doc, quote, lang)
 *   createQuotePdfBuffer(quote, lang) → Promise<Buffer>
 *   sanitizePdfText(value)            → güvenli ASCII/Latin-1 string
 *   sanitizeFileName(value)           → dosya adı için NFKD ascii
 *   formatQuoteDate(dateValue, lang)  → locale formatlı tarih
 *   getQuoteTranslations(lang)        → TR/DE PDF i18n
 */

const fs = require("fs");
const PDFDocument = require("pdfkit");

const { numberOrZero } = require("./util");

// Inject edilen yapılandırma
let companyProfile = null;
let pdfFonts = null;

function configurePdfModule({ companyProfile: cp, pdfFonts: pf } = {}) {
  if (cp) companyProfile = cp;
  if (pf) pdfFonts = pf;
}

let PDF_UNICODE_OK = false;

// ---------- Düşük seviye yardımcılar ----------

function sanitizePdfText(value) {
  let out = String(value ?? "")
    .replace(/ /g, " ")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/₺/g, "TL");
  if (!PDF_UNICODE_OK) {
    out = out
      .replace(/[ğĞ]/g, (char) => (char === "Ğ" ? "G" : "g"))
      .replace(/[ıİ]/g, (char) => (char === "İ" ? "I" : "i"))
      .replace(/[şŞ]/g, (char) => (char === "Ş" ? "S" : "s"))
      .replace(/[çÇ]/g, (char) => (char === "Ç" ? "C" : "c"))
      .replace(/[öÖ]/g, (char) => (char === "Ö" ? "O" : "o"))
      .replace(/[üÜ]/g, (char) => (char === "Ü" ? "U" : "u"))
      .replace(/[^\t\n\r -~ -ÿ€]/g, "");
  } else {
    out = out.replace(/[^\t\n\r -￿]/g, "");
  }
  return out;
}

function sanitizeFileName(value) {
  return String(value || "teklif")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatQuoteDate(dateValue, lang) {
  if (dateValue === null || dateValue === undefined || dateValue === "") {
    return "";
  }
  const locale = lang === "tr" ? "tr-TR" : "de-DE";
  let date;
  if (dateValue instanceof Date) {
    date = dateValue;
  } else {
    const s = String(dateValue).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      date = new Date(`${s}T00:00:00`);
    } else {
      date = new Date(s);
    }
  }
  if (!date || Number.isNaN(date.getTime())) {
    if (dateValue instanceof Date) {
      return "";
    }
    const raw = String(dateValue);
    return raw.length > 10 ? raw.slice(0, 10) : raw;
  }
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function formatPdfQuantity(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 100) / 100);
}

function configurePdfFonts(doc) {
  if (!pdfFonts) {
    doc.registerFont("AppRegular", "Helvetica");
    doc.registerFont("AppBold", "Helvetica-Bold");
    PDF_UNICODE_OK = false;
    doc.font("AppRegular");
    return;
  }
  const regular = fs.existsSync(pdfFonts.regular)
    ? pdfFonts.regular
    : fs.existsSync(pdfFonts.fallbackRegular)
      ? pdfFonts.fallbackRegular
      : null;
  const bold = fs.existsSync(pdfFonts.bold)
    ? pdfFonts.bold
    : fs.existsSync(pdfFonts.fallbackBold)
      ? pdfFonts.fallbackBold
      : null;

  if (regular && bold) {
    doc.registerFont("AppRegular", regular);
    doc.registerFont("AppBold", bold);
    PDF_UNICODE_OK = true;
  } else {
    doc.registerFont("AppRegular", "Helvetica");
    doc.registerFont("AppBold", "Helvetica-Bold");
    PDF_UNICODE_OK = false;
  }
  doc.font("AppRegular");
}

// ---------- IBAN + banka satırı ----------

function isPlaceholderIban(iban) {
  if (!iban) return true;
  const normalized = String(iban).replace(/[\s-]/g, "");
  if (!/^DE\d{20}$/i.test(normalized)) return false;
  return /^DE0+$/i.test(normalized);
}

function buildBankLines(t) {
  const lines = [];
  lines.push(`${t.beneficiary}: ${companyProfile.beneficiary}`);
  lines.push(`${t.bank}: ${companyProfile.bankName}`);
  const iban = (companyProfile.iban || "").trim();
  const bic = (companyProfile.bic || "").trim();
  const ibanPlaceholder = isPlaceholderIban(iban);
  const bicPlaceholder = !bic || /^X+DE/i.test(bic) || /^X+$/i.test(bic);
  if (ibanPlaceholder && bicPlaceholder) {
    lines.push(`IBAN / BIC: ${t.onRequest}`);
  } else {
    if (!ibanPlaceholder) lines.push(`IBAN: ${iban}`);
    if (!bicPlaceholder) lines.push(`BIC: ${bic}`);
  }
  return lines;
}

// ---------- Sayfa parçaları ----------

function drawPdfPills(doc, labels, startX, startY, options = {}) {
  let x = startX;
  let y = startY;
  const maxX = options.maxX || 552;
  for (const label of labels) {
    const text = sanitizePdfText(label);
    const width = Math.min(Math.max(doc.widthOfString(text) + 18, 42), 132);
    if (x + width > maxX) {
      x = startX;
      y += 22;
    }
    doc.roundedRect(x, y, width, 18, 9).fillAndStroke(options.fill || "#ffffff", options.border || "#dbeafe");
    doc.fillColor(options.color || "#082b4c").font("AppBold").fontSize(options.fontSize || 8.5).text(text, x + 8, y + 5, { width: width - 16, align: "center" });
    x += width + 7;
  }
}

function drawTotalLine(doc, label, value, x, y, strong) {
  doc.fillColor("#d9eef7").font(strong ? "AppBold" : "AppRegular").fontSize(9.7).text(sanitizePdfText(label), x, y, { width: 110 });
  doc.fillColor("#ffffff").font(strong ? "AppBold" : "AppRegular").fontSize(9.7).text(sanitizePdfText(value), x + 118, y, { width: 93, align: "right" });
}

function drawQuoteHero(doc, quote, t, formattedDate, lang, currency) {
  doc.rect(0, 0, doc.page.width, 132).fill("#082b4c");
  doc.circle(520, 18, 96).fill("#00a98f");
  doc.circle(596, 118, 76).fill("#ff8a00");
  doc.rect(0, 118, doc.page.width, 14).fill("#00a98f");
  doc.rect(420, 118, 175, 14).fill("#ff8a00");

  doc.roundedRect(42, 28, 74, 74, 18).fill("#ffffff");
  doc.fillColor("#082b4c").font("AppBold").fontSize(30).text("DRC", 53, 52);
  doc.fillColor("#ffffff").font("AppBold").fontSize(23).text(sanitizePdfText(companyProfile.name), 132, 31, { width: 282 });
  doc.font("AppRegular").fontSize(10.5).text(sanitizePdfText(t.logoSubline), 132, 61, { width: 282 });
  doc.fontSize(9.5).text(sanitizePdfText(`${t.headOffice}: ${companyProfile.address}`), 132, 82, { width: 385 });
  doc.text(sanitizePdfText(`${t.warehouse}: ${companyProfile.warehouse}`), 132, 98, { width: 385 });

  doc.roundedRect(424, 30, 129, 72, 18).fill("#ffffff");
  doc.fillColor("#082b4c").font("AppBold").fontSize(13).text(sanitizePdfText(t.payableAmount), 438, 43, { width: 100, align: "center" });
  doc.fillColor("#ff6a3d").font("AppBold").fontSize(17).text(sanitizePdfText(currency.format(numberOrZero(quote.grossTotal || quote.total))), 438, 64, { width: 100, align: "center" });
  doc.fillColor("#607489").font("AppRegular").fontSize(8.5).text(sanitizePdfText(`${t.date}: ${formattedDate}`), 438, 87, { width: 100, align: "center" });

  doc.fillColor("#ffffff").font("AppBold").fontSize(9.5).text(sanitizePdfText(t.brandLineLabel), 42, 142);
  drawPdfPills(doc, ["Danfoss", "DRC", "Dixell", "Embraco", "FrigoCraft", "Sanhua", "GVN"], 138, 138, {
    fill: "#e9fff9",
    color: "#082b4c",
    border: "#b8f5e7",
    fontSize: 8.5,
  });
  doc.fillColor("#607489").font("AppRegular").fontSize(8.5).text(sanitizePdfText(`${t.language}: ${lang === "tr" ? "TR" : "DE"}`), 510, 142);
}

function drawQuoteIntro(doc, quote, t, formattedDate, lang) {
  doc.fillColor("#082b4c").font("AppBold").fontSize(27).text(sanitizePdfText(t.offerTitle), 42, 174);
  doc.fillColor("#00a98f").font("AppBold").fontSize(12).text(sanitizePdfText(quote.quoteNo || `DRC-${quote.id}`), 42, 207);
  doc.fillColor("#0f172a").font("AppBold").fontSize(18).text(sanitizePdfText(quote.title || t.materialSaleTitle), 42, 231, { width: 330 });

  doc.roundedRect(382, 170, 171, 102, 16).fill("#f0fffb");
  doc.fillColor("#082b4c").font("AppBold").fontSize(11).text(sanitizePdfText(t.offerTo), 397, 185);
  doc.fillColor("#0f172a").font("AppBold").fontSize(14).text(sanitizePdfText(quote.customerName || ""), 397, 207, { width: 136 });
  const customerNote = (quote.note || "").trim();
  if (customerNote) {
    doc.fillColor("#607489").font("AppRegular").fontSize(9.5).text(sanitizePdfText(customerNote), 397, 232, { width: 136, height: 30, ellipsis: true });
  }

  doc.roundedRect(42, 282, 511, 45, 16).fill("#fff7ed");
  doc.fillColor("#082b4c").font("AppBold").fontSize(9.5).text(
    sanitizePdfText(`${companyProfile.phone}   |   ${companyProfile.email}   |   ${companyProfile.web}`),
    58,
    300,
    { width: 490 }
  );
  doc.fillColor("#475569").font("AppRegular").fontSize(8.8).text(
    sanitizePdfText(`${t.offerNo}: ${quote.quoteNo || `DRC-${quote.id}`}   ·   ${t.date}: ${formattedDate}   ·   ${t.vatLabel}: ${quote.isExport ? t.vatExportShort : `${numberOrZero(quote.vatRate)}%`}`),
    58,
    314,
    { width: 490 }
  );

  return 350;
}

function drawQuoteTableHeader(doc, t, y) {
  doc.roundedRect(42, y, 511, 30, 10).fill("#082b4c");
  doc.fillColor("#ffffff").font("AppBold").fontSize(9.5);
  doc.text("#", 55, y + 10, { width: 26 });
  doc.text(sanitizePdfText(t.item), 86, y + 10, { width: 240 });
  doc.text(sanitizePdfText(t.qty), 334, y + 10, { width: 44, align: "right" });
  doc.text(sanitizePdfText(t.unitPrice), 384, y + 10, { width: 72, align: "right" });
  doc.text(sanitizePdfText(t.total), 464, y + 10, { width: 82, align: "right" });
  return y + 40;
}

function drawQuoteContinuationHeader(doc, quote, t) {
  doc.rect(0, 0, doc.page.width, 58).fill("#082b4c");
  doc.roundedRect(42, 16, 42, 28, 8).fill("#ffffff");
  doc.fillColor("#082b4c").font("AppBold").fontSize(14).text("DRC", 50, 23);
  doc.fillColor("#ffffff").font("AppBold").fontSize(12).text(sanitizePdfText(companyProfile.name), 100, 17, { width: 270 });
  doc.font("AppRegular").fontSize(9).text(sanitizePdfText(`${t.offerNo}: ${quote.quoteNo || `DRC-${quote.id}`}`), 100, 34, { width: 270 });
  doc.font("AppBold").fontSize(10).text(sanitizePdfText(t.pageContinue), 438, 26, { width: 115, align: "right" });
}

function ensureQuotePdfSpace(doc, y, needed, quote, t) {
  if (y + needed <= 760) {
    return y;
  }
  doc.addPage();
  configurePdfFonts(doc);
  drawQuoteContinuationHeader(doc, quote, t);
  return 88;
}

function drawQuoteItems(doc, quote, t, currency, startY) {
  let y = drawQuoteTableHeader(doc, t, startY);

  quote.items.forEach((item, index) => {
    const nameHeight = doc.font("AppBold").fontSize(11).heightOfString(sanitizePdfText(item.itemName), { width: 240 });
    const rowHeight = Math.max(56, Math.ceil(nameHeight) + 34);
    if (y + rowHeight > 720) {
      doc.addPage();
      configurePdfFonts(doc);
      drawQuoteContinuationHeader(doc, quote, t);
      y = drawQuoteTableHeader(doc, t, 88);
    }

    const bg = index % 2 === 0 ? "#ffffff" : "#f8fbff";
    doc.roundedRect(42, y, 511, rowHeight - 6, 12).fill(bg);
    doc.strokeColor("#e3edf7").lineWidth(1).roundedRect(42, y, 511, rowHeight - 6, 12).stroke();

    doc.fillColor("#00a98f").font("AppBold").fontSize(11).text(String(index + 1).padStart(2, "0"), 55, y + 16, { width: 26 });
    doc.fillColor("#0f172a").font("AppBold").fontSize(11).text(sanitizePdfText(item.itemName), 86, y + 12, { width: 240 });

    const meta = [item.brand, item.category, item.itemCode ? `${t.code}: ${item.itemCode}` : ""].filter(Boolean).join("  ·  ");
    doc.fillColor("#607489").font("AppRegular").fontSize(8.6).text(sanitizePdfText(meta || t.productLine), 86, y + 33 + Math.max(0, nameHeight - 14), { width: 240 });

    doc.fillColor("#082b4c").font("AppBold").fontSize(12).text(sanitizePdfText(formatPdfQuantity(item.quantity)), 334, y + 14, { width: 44, align: "right" });
    doc.fillColor("#607489").font("AppRegular").fontSize(8.6).text(sanitizePdfText(item.unit || ""), 334, y + 31, { width: 44, align: "right" });
    doc.fillColor("#0f172a").font("AppRegular").fontSize(10).text(sanitizePdfText(currency.format(item.unitPrice)), 384, y + 18, { width: 72, align: "right" });
    doc.fillColor("#ff6a3d").font("AppBold").fontSize(11).text(sanitizePdfText(currency.format(item.total)), 464, y + 18, { width: 82, align: "right" });

    y += rowHeight;
  });

  return y + 4;
}

function drawQuoteTotals(doc, quote, t, currency, y) {
  doc.roundedRect(306, y, 247, 138, 18).fill("#082b4c");
  doc.fillColor("#ffffff").font("AppBold").fontSize(12).text(sanitizePdfText(t.totalsTitle), 324, y + 16);
  drawTotalLine(doc, t.subtotal, currency.format(numberOrZero(quote.subtotal)), 324, y + 42, false);
  drawTotalLine(doc, t.discount, currency.format(numberOrZero(quote.discount)), 324, y + 62, false);
  drawTotalLine(doc, t.netTotal, currency.format(numberOrZero(quote.netTotal || quote.total)), 324, y + 82, false);
  drawTotalLine(
    doc,
    quote.isExport ? t.vatExport : `${t.vat} (${numberOrZero(quote.vatRate)}%)`,
    currency.format(numberOrZero(quote.vatAmount)),
    324,
    y + 102,
    false
  );
  doc.roundedRect(324, y + 116, 211, 30, 12).fill("#ff8a00");
  doc.fillColor("#ffffff").font("AppBold").fontSize(12).text(sanitizePdfText(`${t.grossTotal}: ${currency.format(numberOrZero(quote.grossTotal || quote.total))}`), 336, y + 125, { width: 187, align: "center" });

  doc.roundedRect(42, y, 240, 138, 18).fill("#f8fafc");
  doc.fillColor("#082b4c").font("AppBold").fontSize(12).text(sanitizePdfText(t.conditionsTitle), 58, y + 16);
  doc.fillColor("#475569").font("AppRegular").fontSize(9.4);
  t.conditions.forEach((line, index) => {
    doc.text(sanitizePdfText(`- ${line}`), 58, y + 40 + index * 28, { width: 206, lineGap: 2 });
  });

  return y + 164;
}

function drawQuoteFooter(doc, quote, t, y) {
  y = ensureQuotePdfSpace(doc, y, 108, quote, t);

  const bankLines = buildBankLines(t);
  const bankBlockHeight = 26 + bankLines.length * 16 + 6;
  const signBlockHeight = Math.max(96, bankBlockHeight);

  doc.roundedRect(42, y, 244, signBlockHeight, 14).fill("#f8fafc");
  doc.fillColor("#082b4c").font("AppBold").fontSize(11).text(sanitizePdfText(t.bankTitle), 56, y + 14);
  doc.fillColor("#475569").font("AppRegular").fontSize(9.3);
  bankLines.forEach((line, index) => {
    doc.text(sanitizePdfText(line), 56, y + 34 + index * 16, { width: 214 });
  });

  doc.roundedRect(309, y, 244, signBlockHeight, 14).fill("#f8fafc");
  doc.fillColor("#082b4c").font("AppBold").fontSize(11).text(sanitizePdfText(t.signature), 323, y + 14);
  doc.moveTo(323, y + signBlockHeight - 36).lineTo(523, y + signBlockHeight - 36).strokeColor("#94a3b8").stroke();
  doc.fillColor("#475569").font("AppRegular").fontSize(9.5).text(sanitizePdfText(companyProfile.manager || ""), 323, y + signBlockHeight - 26);
  doc.text(sanitizePdfText(`${companyProfile.register} | USt-IdNr.: ${companyProfile.vatId}`), 323, y + signBlockHeight - 12, { width: 214 });
}

// ---------- Üst seviye ----------

function renderQuotePdf(doc, quote, lang) {
  const t = getQuoteTranslations(lang);
  const currency = new Intl.NumberFormat(lang === "tr" ? "tr-TR" : "de-DE", {
    style: "currency",
    currency: "EUR",
  });
  const formattedDate = formatQuoteDate(quote.date, lang);

  configurePdfFonts(doc);

  drawQuoteHero(doc, quote, t, formattedDate, lang, currency);
  let y = drawQuoteIntro(doc, quote, t, formattedDate, lang);
  y = drawQuoteItems(doc, quote, t, currency, y);
  y = ensureQuotePdfSpace(doc, y, 238, quote, t);
  y = drawQuoteTotals(doc, quote, t, currency, y);
  drawQuoteFooter(doc, quote, t, y);
}

function createQuotePdfBuffer(quote, lang) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 42, size: "A4" });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    renderQuotePdf(doc, quote, lang);
    doc.end();
  });
}

// ---------- i18n ----------

function getQuoteTranslations(lang) {
  if (lang === "tr") {
    return {
      logoSubline: "Soğutma ve Klima Tekniği",
      headOffice: "Merkez",
      warehouse: "Depo",
      offerTo: "Müşteri",
      offerTitle: "Malzeme Satış Teklifi",
      materialSaleTitle: "Malzeme Satış Teklifi",
      offerNo: "Teklif No",
      date: "Tarih",
      language: "Dil",
      vatLabel: "KDV",
      vatExportShort: "Yok",
      payableAmount: "Ödenecek",
      brandLineLabel: "Satışını yaptığımız markalar",
      productScope: "Panel, soğuk oda kapısı, kondenser, evaporatör, gaz, boru, kontrol ve servis malzemeleri",
      item: "Malzeme",
      code: "Kod",
      productLine: "Ürün / malzeme kalemi",
      qty: "Miktar",
      unitPrice: "Birim Fiyat",
      unit: "Birim",
      total: "Toplam",
      totalsTitle: "Teklif Özeti",
      easyReadTitle: "Kolay okuma",
      easyReadCopy: "",
      productFamilies: [],
      subtotal: "Ara Toplam",
      discount: "İskonto",
      netTotal: "Net Toplam",
      vat: "KDV",
      vatExport: "İhracat - KDV Yok",
      grossTotal: "Brüt Toplam",
      conditionsTitle: "Koşullar",
      bankTitle: "Banka Bilgileri",
      beneficiary: "Lehdar",
      bank: "Banka",
      onRequest: "Talep üzerine iletilir",
      signature: "İmza Alanı",
      customerPlaceholder: "",
      pageContinue: "Devam sayfası",
      conditions: [
        "Teklif tarihinden itibaren 15 gün geçerlidir.",
        "Teslimat süresi stok ve üretim durumuna göre ayrıca teyit edilir.",
        "Montaj, nakliye ve devreye alma dahil değilse ayrıca belirtilir.",
      ],
    };
  }

  return {
    logoSubline: "Kälte- und Klimatechnik",
    headOffice: "Zentrale",
    warehouse: "Lager",
    offerTo: "Kunde",
    offerTitle: "Materialverkaufsangebot",
    materialSaleTitle: "Materialverkaufsangebot",
    offerNo: "Angebotsnr.",
    date: "Datum",
    language: "Sprache",
    vatLabel: "MwSt.",
    vatExportShort: "0%",
    payableAmount: "Zu zahlen",
    brandLineLabel: "Marken im Verkauf",
    productScope: "Paneele, Kühlraumtüren, Verflüssiger, Verdampfer, Kältemittel, Rohr, Steuerung und Serviceteile",
    item: "Artikel",
    code: "Code",
    productLine: "Produkt / Materialposition",
    qty: "Menge",
    unitPrice: "Einzelpreis",
    unit: "Einheit",
    total: "Gesamt",
    totalsTitle: "Angebotsübersicht",
    easyReadTitle: "",
    easyReadCopy: "",
    productFamilies: [],
    subtotal: "Zwischensumme",
    discount: "Rabatt",
    netTotal: "Netto",
    vat: "MwSt.",
    vatExport: "Exportlieferung – keine MwSt.",
    grossTotal: "Brutto",
    conditionsTitle: "Konditionen",
    bankTitle: "Bankverbindung",
    beneficiary: "Empfänger",
    bank: "Bank",
    onRequest: "Auf Anfrage",
    signature: "Unterschrift",
    customerPlaceholder: "",
    pageContinue: "Folgeseite",
    conditions: [
      "Dieses Angebot ist 15 Tage ab Angebotsdatum gültig.",
      "Lieferzeiten werden je nach Lager- und Produktionsstatus bestätigt.",
      "Montage, Transport und Inbetriebnahme sind nur enthalten, wenn ausdrücklich angegeben.",
    ],
  };
}

module.exports = {
  configurePdfModule,
  renderQuotePdf,
  createQuotePdfBuffer,
  sanitizePdfText,
  sanitizeFileName,
  formatQuoteDate,
  getQuoteTranslations,
};
