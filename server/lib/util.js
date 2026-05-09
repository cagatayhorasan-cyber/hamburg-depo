"use strict";

/**
 * Server tarafı genel-amaçlı utility fonksiyonları.
 *
 * Bu modül DB veya HTTP bağımlılığı olmayan, saf yardımcılarla doludur:
 * - String/değer normalleştirme
 * - Rol haritalaması
 * - HTTP request meta okuma (sadece req parametresi alır)
 * - Tablo satırı sayı dönüşümü
 *
 * NOT: Bu fonksiyonlar server/app.js içinden çıkarıldı; aynı imzayla
 * kullanılabilirler. Bağımlı modüller (örn. security-events) buradan import eder.
 */

// ---------- String / değer normalleştirme ----------

function cleanOptional(value) {
  return value ? String(value).trim() : "";
}

function numberOrZero(value) {
  return Number(value || 0);
}

function isTruthy(value) {
  return value === true || value === "true" || value === 1 || value === "1" || value === "on";
}

function isFutureTimestamp(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) && time > Date.now();
}

// ---------- Rol haritalaması ----------

function normalizeRole(role) {
  // 'operator' rolünü staff'a haritala (eski kullanıcılar için).
  return role === "operator" ? "staff" : role;
}

function isAdminRole(role) {
  return normalizeRole(role) === "admin";
}

function isStaffRole(role) {
  return normalizeRole(role) === "staff";
}

function isCustomerRole(role) {
  return normalizeRole(role) === "customer";
}

// ---------- HTTP request helpers ----------

function getClientIp(req) {
  if (!req) return "unknown";
  const forwardedFor = String(req.get?.("x-forwarded-for") || "").split(",")[0].trim();
  return forwardedFor || req.ip || req.socket?.remoteAddress || "unknown";
}

// ---------- DB satırı normalize ----------

const NUMERIC_FIELDS = [
  "id", "userId", "senderUserId", "eventCount",
  "quantity", "unitPrice", "total", "discount", "subtotal",
  "vatRate", "vatAmount", "netTotal", "grossTotal", "amount",
];

function numberizeRow(row) {
  const output = { ...row };
  for (const key of NUMERIC_FIELDS) {
    if (output[key] !== undefined && output[key] !== null && output[key] !== "") {
      output[key] = Number(output[key]);
    }
  }
  if (output.isExport !== undefined) {
    output.isExport = output.isExport === true
      || output.isExport === 1
      || output.isExport === "1"
      || output.isExport === "t";
  }
  return output;
}

module.exports = {
  cleanOptional,
  numberOrZero,
  isTruthy,
  isFutureTimestamp,
  normalizeRole,
  isAdminRole,
  isStaffRole,
  isCustomerRole,
  getClientIp,
  numberizeRow,
};
