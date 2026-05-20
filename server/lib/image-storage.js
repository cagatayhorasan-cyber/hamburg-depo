"use strict";

/**
 * Ürün görseli kaydetme yardımcısı.
 *
 * Strateji:
 *   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env'leri set ise → Supabase Storage'a yükle
 *     (Vercel + prod için doğru çözüm — serverless FS ephemeral)
 *   - Yoksa → public/uploads/items/ dizinine kaydet (lokal dev fallback)
 *
 * Public API:
 *   saveItemImage(buffer, originalName, itemId) → Promise<{ url, storage }>
 *
 * Bucket adı: 'item-images' (Supabase Console'da public bucket olarak oluşturulmalı).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "item-images";

let supabaseClient = null;

function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (supabaseClient) return supabaseClient;
  try {
    const { createClient } = require("@supabase/supabase-js");
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return supabaseClient;
  } catch (error) {
    console.error("[image-storage] Supabase client kurulamadı:", error.message);
    return null;
  }
}

function safeExtension(originalName, mime) {
  const fromName = path.extname(String(originalName || "")).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(fromName)) return fromName;
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  return ".jpg";
}

function buildFilename(itemId, originalName, mime) {
  const ext = safeExtension(originalName, mime);
  const rand = crypto.randomBytes(4).toString("hex");
  const ts = Date.now();
  return `${itemId || "anon"}-${ts}-${rand}${ext}`;
}

async function saveToSupabase(buffer, filename, mime) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase client init başarısız");
  const objectPath = `items/${filename}`;
  const { error: uploadError } = await supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .upload(objectPath, buffer, {
      contentType: mime,
      upsert: false,
      cacheControl: "31536000",
    });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(objectPath);
  if (!data || !data.publicUrl) throw new Error("Supabase publicUrl alınamadı");
  return { url: data.publicUrl, storage: "supabase" };
}

async function saveToLocal(buffer, filename) {
  // public/uploads/items/<filename> — express.static zaten public/'i serve ediyor → URL: /uploads/items/<filename>
  const targetDir = path.join(__dirname, "..", "..", "public", "uploads", "items");
  await fs.promises.mkdir(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, filename);
  await fs.promises.writeFile(targetPath, buffer);
  return { url: `/uploads/items/${filename}`, storage: "local" };
}

async function saveItemImage(buffer, originalName, itemId, mime = "image/jpeg") {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("Boş veya geçersiz görsel verisi");
  }
  const filename = buildFilename(itemId, originalName, mime);
  if (isSupabaseConfigured()) {
    return saveToSupabase(buffer, filename, mime);
  }
  return saveToLocal(buffer, filename);
}

/**
 * URL'den storage objesini siler. Supabase publicUrl pattern'i veya /uploads/items/* lokal yolu kabul eder.
 * Tanımadığı bir URL gelirse sessiz NO-OP — http(s):// dış kaynak resmi silmeye çalışmayız.
 * Returns: { ok: true, storage: 'supabase'|'local'|'skipped', reason? }
 */
async function deleteItemImage(url) {
  if (!url || typeof url !== "string") {
    return { ok: true, storage: "skipped", reason: "no-url" };
  }
  // Lokal uploads
  if (url.startsWith("/uploads/items/")) {
    try {
      const filename = path.basename(url);
      const target = path.join(__dirname, "..", "..", "public", "uploads", "items", filename);
      await fs.promises.unlink(target).catch(() => {});
      return { ok: true, storage: "local" };
    } catch (_e) {
      return { ok: true, storage: "local", reason: "unlink-failed" };
    }
  }
  // Supabase publicUrl: <SUPABASE_URL>/storage/v1/object/public/<bucket>/items/<filename>
  if (isSupabaseConfigured() && url.includes("/storage/v1/object/public/")) {
    const supabase = getSupabase();
    if (!supabase) return { ok: true, storage: "skipped", reason: "supabase-client-fail" };
    const marker = `/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return { ok: true, storage: "skipped", reason: "url-not-our-bucket" };
    const objectPath = url.slice(idx + marker.length);
    if (!objectPath) return { ok: true, storage: "skipped", reason: "empty-path" };
    const { error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).remove([objectPath]);
    if (error) {
      return { ok: false, storage: "supabase", reason: error.message };
    }
    return { ok: true, storage: "supabase" };
  }
  // Dış URL — silmeyi atla
  return { ok: true, storage: "skipped", reason: "external-url" };
}

// Datasheet (PDF/dosya) için ayrı klasör. Supabase Storage'a 'datasheets/' altına yükler veya lokale /uploads/datasheets/.
async function saveItemDatasheet(buffer, originalName, itemId, mime = "application/pdf") {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("Boş veya geçersiz dosya");
  }
  const ext = path.extname(String(originalName || "")).toLowerCase() || ".bin";
  const rand = crypto.randomBytes(4).toString("hex");
  const ts = Date.now();
  const filename = `${itemId || "anon"}-${ts}-${rand}${ext}`;
  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase client init başarısız");
    const objectPath = `datasheets/${filename}`;
    const { error: uploadError } = await supabase.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .upload(objectPath, buffer, { contentType: mime, upsert: false, cacheControl: "31536000" });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(objectPath);
    return { url: data.publicUrl, storage: "supabase", storagePath: objectPath };
  }
  const targetDir = path.join(__dirname, "..", "..", "public", "uploads", "datasheets");
  await fs.promises.mkdir(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, filename);
  await fs.promises.writeFile(targetPath, buffer);
  return { url: `/uploads/datasheets/${filename}`, storage: "local", storagePath: `/uploads/datasheets/${filename}` };
}

async function deleteItemDatasheet(urlOrPath) {
  if (!urlOrPath || typeof urlOrPath !== "string") return { ok: true, storage: "skipped" };
  if (urlOrPath.startsWith("/uploads/datasheets/")) {
    try {
      const filename = path.basename(urlOrPath);
      const target = path.join(__dirname, "..", "..", "public", "uploads", "datasheets", filename);
      await fs.promises.unlink(target).catch(() => {});
      return { ok: true, storage: "local" };
    } catch (_e) {
      return { ok: true, storage: "local", reason: "unlink-failed" };
    }
  }
  if (isSupabaseConfigured() && urlOrPath.includes("/storage/v1/object/public/")) {
    const supabase = getSupabase();
    if (!supabase) return { ok: true, storage: "skipped" };
    const marker = `/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/`;
    const idx = urlOrPath.indexOf(marker);
    if (idx === -1) return { ok: true, storage: "skipped" };
    const objectPath = urlOrPath.slice(idx + marker.length);
    const { error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).remove([objectPath]);
    if (error) return { ok: false, storage: "supabase", reason: error.message };
    return { ok: true, storage: "supabase" };
  }
  return { ok: true, storage: "skipped" };
}

module.exports = {
  saveItemImage,
  deleteItemImage,
  saveItemDatasheet,
  deleteItemDatasheet,
  isSupabaseConfigured,
  SUPABASE_STORAGE_BUCKET,
};
