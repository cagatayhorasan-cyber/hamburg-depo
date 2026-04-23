"use strict";
// DeepL API client (Free + Pro desteği)
// Env: DEEPL_API_KEY  (Free key ":fx" ile biter, Pro key sade string)
// Docs: https://developers.deepl.com/docs/api-reference/translate
//
// Kullanım:
//   const { translateBatch } = require("./deepl-client");
//   const translations = await translateBatch(["Soğutma Grubu", "Kondenser"]);
//   // -> ["Kälteaggregat", "Verflüssiger"]

const DEEPL_MAX_TEXTS_PER_REQUEST = 50;
const DEEPL_MAX_CHARS_PER_REQUEST = 100000; // güvenlik payı (gerçek limit ~128 KiB body)

function getApiKey() {
  const key = process.env.DEEPL_API_KEY || process.env.DEEPL_AUTH_KEY || "";
  if (!key) {
    const err = new Error("DEEPL_API_KEY environment variable eksik.");
    err.code = "DEEPL_KEY_MISSING";
    throw err;
  }
  return key.trim();
}

function getEndpoint(key) {
  // Free key ":fx" suffix ile biter → free endpoint
  const isFree = /:fx$/i.test(key);
  return isFree
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";
}

// Metinleri çevirir. Boş/undefined metinler "" olarak yerinde kalır.
// Sıra korunur. Büyük batch'ler otomatik bölünür.
async function translateBatch(texts, opts = {}) {
  const key = getApiKey();
  const endpoint = getEndpoint(key);
  const sourceLang = (opts.sourceLang || "TR").toUpperCase();
  const targetLang = (opts.targetLang || "DE").toUpperCase();
  const formality = opts.formality || null; // "more" | "less" | "default" — DE için önerilen: "more"

  const results = new Array(texts.length);
  // Boş olanları işaretle, sadece dolu olanları gönder
  const indicesToSend = [];
  const textsToSend = [];
  for (let i = 0; i < texts.length; i += 1) {
    const s = String(texts[i] == null ? "" : texts[i]).trim();
    if (!s) {
      results[i] = "";
    } else {
      indicesToSend.push(i);
      textsToSend.push(s);
    }
  }

  if (!textsToSend.length) return results;

  // Chunk'la
  let cursor = 0;
  while (cursor < textsToSend.length) {
    const chunk = [];
    const chunkIndices = [];
    let chunkChars = 0;
    while (
      cursor < textsToSend.length &&
      chunk.length < DEEPL_MAX_TEXTS_PER_REQUEST &&
      chunkChars + textsToSend[cursor].length < DEEPL_MAX_CHARS_PER_REQUEST
    ) {
      chunk.push(textsToSend[cursor]);
      chunkIndices.push(indicesToSend[cursor]);
      chunkChars += textsToSend[cursor].length;
      cursor += 1;
    }
    // Chunk tek metni max limitten büyükse yine de tek başına gönder (runtime bombalamasın)
    if (!chunk.length && cursor < textsToSend.length) {
      chunk.push(textsToSend[cursor]);
      chunkIndices.push(indicesToSend[cursor]);
      cursor += 1;
    }

    const body = {
      text: chunk,
      source_lang: sourceLang,
      target_lang: targetLang,
      preserve_formatting: true,
    };
    if (formality) body.formality = formality;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        "Content-Type": "application/json",
        "User-Agent": "drc-kaeltetechnik-portal/1.0",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const txt = await response.text().catch(() => "");
      const err = new Error(
        `DeepL API ${response.status}: ${txt.slice(0, 400)}`
      );
      err.status = response.status;
      err.code = "DEEPL_HTTP_ERROR";
      throw err;
    }

    const data = await response.json();
    const translations = Array.isArray(data?.translations) ? data.translations : [];
    if (translations.length !== chunk.length) {
      throw new Error(
        `DeepL yanıtı beklenenden az (${translations.length}/${chunk.length})`
      );
    }
    for (let j = 0; j < chunk.length; j += 1) {
      const origIdx = chunkIndices[j];
      const translated = String(translations[j]?.text ?? chunk[j]);
      results[origIdx] = translated;
    }
  }

  return results;
}

// Kullanım kotasını kontrol et (opsiyonel, usage endpoint'i)
async function getUsage() {
  const key = getApiKey();
  const isFree = /:fx$/i.test(key);
  const usageEndpoint = isFree
    ? "https://api-free.deepl.com/v2/usage"
    : "https://api.deepl.com/v2/usage";
  const response = await fetch(usageEndpoint, {
    headers: {
      Authorization: `DeepL-Auth-Key ${key}`,
      "User-Agent": "drc-kaeltetechnik-portal/1.0",
    },
  });
  if (!response.ok) {
    const txt = await response.text().catch(() => "");
    throw new Error(`DeepL usage ${response.status}: ${txt.slice(0, 200)}`);
  }
  return response.json();
}

module.exports = { translateBatch, getUsage };
