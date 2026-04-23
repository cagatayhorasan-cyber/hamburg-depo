"use strict";
// Google Translate unofficial endpoint client (keysiz).
// Tarayıcı uzantılarının kullandığı public endpoint.
// Rate limit: IP başına saniyede ~5-10 istek. Aşınca 429 döner.
//
// Kullanım:
//   const { translateBatch } = require("./google-translate-client");
//   const out = await translateBatch(["Soğutma Grubu", "Kondenser"], { sourceLang: "tr", targetLang: "de" });

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function translateOne(text, opts = {}) {
  const sl = (opts.sourceLang || "tr").toLowerCase();
  const tl = (opts.targetLang || "de").toLowerCase();
  const maxRetries = opts.maxRetries ?? 2;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "*/*",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (!res.ok) {
        // 429/503 → backoff + retry
        if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        const body = await res.text().catch(() => "");
        const err = new Error(`Google Translate ${res.status}: ${body.slice(0, 200)}`);
        err.status = res.status;
        err.code = res.status === 429 ? "GOOGLE_RATE_LIMIT" : "GOOGLE_HTTP_ERROR";
        throw err;
      }
      const data = await res.json();
      // Response yapısı: [[["çeviri","orijinal",null,null,1], ...], null, "tr"]
      if (!Array.isArray(data) || !Array.isArray(data[0])) {
        return text;
      }
      const translated = data[0]
        .map((seg) => (Array.isArray(seg) ? String(seg[0] || "") : ""))
        .join("")
        .trim();
      return translated || text;
    } catch (e) {
      if (attempt < maxRetries) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
  return text;
}

// LibreTranslate public instance'ları (Google blok olursa yedek)
// Güvenilir community instance'lar: libretranslate.de, translate.argosopentech.com
async function translateOneLibre(text, opts = {}) {
  const sl = (opts.sourceLang || "tr").toLowerCase();
  const tl = (opts.targetLang || "de").toLowerCase();
  const instances = [
    "https://libretranslate.de/translate",
    "https://translate.argosopentech.com/translate",
  ];
  for (const endpoint of instances) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
        body: JSON.stringify({ q: text, source: sl, target: tl, format: "text" }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.translatedText) return String(data.translatedText).trim();
    } catch (_) {
      // try next
    }
  }
  return text; // fallback: orijinal
}

async function translateBatch(texts, opts = {}) {
  const concurrency = Math.max(1, Math.min(Number(opts.concurrency || 3), 6));
  const delayMs = Math.max(50, Number(opts.delayMs || 150));
  const targetLang = opts.targetLang || "de";
  const sourceLang = opts.sourceLang || "tr";
  const useLibreFallback = opts.useLibreFallback !== false;

  const results = new Array(texts.length);
  // Boşları atla
  const jobs = [];
  for (let i = 0; i < texts.length; i += 1) {
    const s = String(texts[i] == null ? "" : texts[i]).trim();
    if (!s) {
      results[i] = "";
    } else {
      jobs.push({ idx: i, text: s });
    }
  }

  if (!jobs.length) return results;

  let cursor = 0;
  let rateLimitHit = false;

  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      try {
        let translated;
        if (rateLimitHit && useLibreFallback) {
          translated = await translateOneLibre(job.text, { sourceLang, targetLang });
        } else {
          try {
            translated = await translateOne(job.text, { sourceLang, targetLang });
          } catch (e) {
            if (e.code === "GOOGLE_RATE_LIMIT" && useLibreFallback) {
              rateLimitHit = true;
              translated = await translateOneLibre(job.text, { sourceLang, targetLang });
            } else {
              translated = job.text; // son çare: orijinali bırak
            }
          }
        }
        results[job.idx] = translated;
      } catch (_) {
        results[job.idx] = job.text;
      }
      if (cursor < jobs.length) {
        await sleep(delayMs);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  // Null kalanları orijinalle doldur
  for (let i = 0; i < results.length; i += 1) {
    if (results[i] == null) results[i] = String(texts[i] || "");
  }

  return results;
}

module.exports = { translateBatch, translateOne, translateOneLibre };
