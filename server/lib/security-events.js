"use strict";

/**
 * Security event + IP block yönetimi.
 *
 * server/app.js içinden çıkarıldı; aynı public API ile dışa açık:
 *
 *   queueSecurityEvent(req, event)        — request lifecycle'a event ekle
 *   flushQueuedSecurityEvents(req)        — kuyruktaki event'leri DB'ye yaz
 *   recordFailedAuthentication(req, id)   — login_failed log + autoBlock
 *   autoBlockIfThresholdReached(req, ...) — eşik aşıldıysa IP'yi blokla
 *   activateSecurityBlock(req, options)   — IP'yi süreli blokla (idempotent)
 *   findActiveSecurityBlock(ipAddress)    — aktif blok kaydı sorgula
 *   enforceIpSecurityBlock(req, res, nx)  — middleware
 *   normalizeSecurityEventPayload(req,e)  — request meta'yı event'e ekle
 *   insertSecurityEvent(entry)            — DB INSERT
 *   parseSecurityDetails(value)           — DB string → JSON
 *   querySecurityEvents(limit)            — son N event (admin paneli)
 *   querySecurityBlocks()                 — IP block listesi
 *
 * Tüm DB / util / constant bağımlılıkları aşağıdaki require'lardan gelir.
 */

const { query, get, execute } = require("../db");
const {
  cleanOptional,
  isFutureTimestamp,
  normalizeRole,
  getClientIp,
  numberizeRow,
} = require("./util");
const {
  SECURITY_FAILURE_WINDOW_MS,
  SECURITY_AUTH_FAILURE_THRESHOLD,
  SECURITY_AUTH_BLOCK_MS,
  SECURITY_EVENT_DETAILS_LIMIT,
} = require("../constants/security");

// ---------- Severity normalizasyon + details serialize ----------

function normalizeSecuritySeverity(value) {
  const normalized = String(value || "info").toLowerCase();
  if (["info", "warn", "critical"].includes(normalized)) {
    return normalized;
  }
  return "info";
}

function sanitizeSecurityDetails(details) {
  if (!details || typeof details !== "object") {
    return {};
  }
  const output = {};
  for (const [key, value] of Object.entries(details)) {
    if (value === undefined) continue;
    output[key] = typeof value === "string"
      ? value.slice(0, SECURITY_EVENT_DETAILS_LIMIT)
      : value;
  }
  return output;
}

function serializeSecurityDetails(details) {
  const payload = JSON.stringify(details || {});
  return payload.length > SECURITY_EVENT_DETAILS_LIMIT
    ? payload.slice(0, SECURITY_EVENT_DETAILS_LIMIT)
    : payload;
}

function parseSecurityDetails(value) {
  try {
    return JSON.parse(String(value || "{}"));
  } catch (_error) {
    return {};
  }
}

// ---------- Payload normalize + queue ----------

function normalizeSecurityEventPayload(req, event = {}) {
  const user = event.user || req?.session?.user || null;
  return {
    userId: user?.id ? Number(user.id) : null,
    userRole: normalizeRole(event.userRole || user?.role || ""),
    eventType: cleanOptional(event.eventType) || "system_event",
    severity: normalizeSecuritySeverity(event.severity),
    ipAddress: event.ipAddress || getClientIp(req),
    identifier: cleanOptional(event.identifier),
    requestPath: cleanOptional(event.requestPath || req?.path || req?.originalUrl || ""),
    requestMethod: String(event.requestMethod || req?.method || "").toUpperCase(),
    userAgent: cleanOptional(event.userAgent || req?.get?.("user-agent") || ""),
    details: sanitizeSecurityDetails(event.details || {}),
  };
}

function queueSecurityEvent(req, event) {
  if (!req) return;
  req.securityAuditQueue = req.securityAuditQueue || [];
  req.securityAuditQueue.push(normalizeSecurityEventPayload(req, event));
}

async function flushQueuedSecurityEvents(req) {
  const queue = Array.isArray(req?.securityAuditQueue) ? req.securityAuditQueue.splice(0) : [];
  for (const entry of queue) {
    await insertSecurityEvent(entry);
  }
}

async function insertSecurityEvent(entry) {
  const createdAt = new Date().toISOString();
  await execute(
    `
      INSERT INTO security_events (
        user_id, user_role, event_type, severity, ip_address, identifier,
        request_path, request_method, user_agent, details, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      entry.userId || null,
      cleanOptional(entry.userRole),
      entry.eventType,
      entry.severity,
      entry.ipAddress || "",
      cleanOptional(entry.identifier),
      cleanOptional(entry.requestPath),
      cleanOptional(entry.requestMethod),
      cleanOptional(entry.userAgent),
      serializeSecurityDetails(entry.details),
      createdAt,
    ]
  );
}

// ---------- IP block: enforce + activate + find ----------

async function enforceIpSecurityBlock(req, res, next) {
  try {
    const block = await findActiveSecurityBlock(getClientIp(req));
    if (!block) {
      return next();
    }
    return res.status(423).json({
      error: "Bu IP adresi guvenlik nedeniyle gecici olarak engellendi.",
      blockUntil: block.blockUntil,
      reason: block.reason,
    });
  } catch (error) {
    return next(error);
  }
}

async function recordFailedAuthentication(req, identifier = "") {
  const entry = normalizeSecurityEventPayload(req, {
    eventType: "login_failed",
    severity: "warn",
    identifier,
  });
  await insertSecurityEvent(entry);
  await autoBlockIfThresholdReached(req, "login_failed", {
    threshold: SECURITY_AUTH_FAILURE_THRESHOLD,
    windowMs: SECURITY_FAILURE_WINDOW_MS,
    blockDurationMs: SECURITY_AUTH_BLOCK_MS,
    reason: "Tekrarlayan hatali giris denemeleri",
  });
}

async function autoBlockIfThresholdReached(req, eventType, options = {}) {
  const threshold = Number(options.threshold || 0);
  if (!threshold) return null;

  const ipAddress = getClientIp(req);
  const windowMs = Number(options.windowMs || SECURITY_FAILURE_WINDOW_MS);
  const since = new Date(Date.now() - windowMs).toISOString();
  const counter = await get(
    `
      SELECT COUNT(*) AS count
      FROM security_events
      WHERE ip_address = ? AND event_type = ? AND created_at >= ?
    `,
    [ipAddress, eventType, since]
  );
  const count = Number(counter?.count || 0);
  if (count < threshold) return null;

  return activateSecurityBlock(req, {
    reason: options.reason || "Supheli deneme algilandi",
    eventType,
    blockDurationMs: Number(options.blockDurationMs || SECURITY_AUTH_BLOCK_MS),
    eventCount: count,
  });
}

async function activateSecurityBlock(req, options = {}) {
  const ipAddress = options.ipAddress || getClientIp(req);
  const existing = await findActiveSecurityBlock(ipAddress);
  if (existing) return existing;

  const nowIso = new Date().toISOString();
  const blockUntil = new Date(Date.now() + Number(options.blockDurationMs || SECURITY_AUTH_BLOCK_MS)).toISOString();
  const reason = cleanOptional(options.reason) || "Supheli deneme algilandi";
  const eventType = cleanOptional(options.eventType);
  const eventCount = Number(options.eventCount || 0);
  const existingAny = await get("SELECT id FROM security_blocks WHERE ip_address = ?", [ipAddress]);

  if (existingAny?.id) {
    await execute(
      `
        UPDATE security_blocks
        SET reason = ?, event_type = ?, event_count = ?, block_until = ?, released_at = NULL, created_at = ?, updated_at = ?
        WHERE id = ?
      `,
      [reason, eventType, eventCount, blockUntil, nowIso, nowIso, Number(existingAny.id)]
    );
  } else {
    await execute(
      `
        INSERT INTO security_blocks (ip_address, reason, event_type, event_count, block_until, released_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
      `,
      [ipAddress, reason, eventType, eventCount, blockUntil, nowIso, nowIso]
    );
  }

  await insertSecurityEvent(normalizeSecurityEventPayload(req, {
    eventType: "ip_blocked",
    severity: "critical",
    details: { reason, blockedUntil: blockUntil, sourceEvent: eventType, eventCount },
  }));

  return {
    ipAddress,
    reason,
    eventType,
    eventCount,
    blockUntil,
    releasedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    isActive: true,
  };
}

async function findActiveSecurityBlock(ipAddress) {
  // Test moda (1000-soruluk regression sirasinda DB sturated): security_blocks
  // kontrolu atla. Production veya normal kullanimda env yok, eski davranis.
  if (process.env.SKIP_SECURITY_BLOCK === "1") {
    return null;
  }
  const block = await get(
    `
      SELECT
        id,
        ip_address AS "ipAddress",
        reason,
        event_type AS "eventType",
        event_count AS "eventCount",
        block_until AS "blockUntil",
        released_at AS "releasedAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM security_blocks
      WHERE ip_address = ?
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    [ipAddress]
  );

  if (!block) return null;

  const mapped = {
    ...numberizeRow(block),
    isActive: !block.releasedAt && isFutureTimestamp(block.blockUntil),
  };

  if (!mapped.isActive && !block.releasedAt) {
    const nowIso = new Date().toISOString();
    await execute("UPDATE security_blocks SET released_at = ?, updated_at = ? WHERE id = ?", [nowIso, nowIso, Number(block.id)]);
    mapped.releasedAt = nowIso;
  }

  return mapped.isActive ? mapped : null;
}

// ---------- Read sorguları (admin paneli için) ----------

async function querySecurityEvents(limit = 80) {
  const safeLimit = Math.min(Math.max(Number(limit) || 80, 1), 200);
  const rows = await query(
    `
      SELECT
        security_events.id,
        security_events.user_id AS "userId",
        security_events.user_role AS "userRole",
        security_events.event_type AS "eventType",
        security_events.severity,
        security_events.ip_address AS "ipAddress",
        security_events.identifier,
        security_events.request_path AS "requestPath",
        security_events.request_method AS "requestMethod",
        security_events.user_agent AS "userAgent",
        security_events.details,
        security_events.created_at AS "createdAt",
        users.name AS "userName"
      FROM security_events
      LEFT JOIN users ON users.id = security_events.user_id
      ORDER BY security_events.created_at DESC, security_events.id DESC
      LIMIT ?
    `,
    [safeLimit]
  );

  return rows.map((row) => ({
    ...numberizeRow(row),
    userRole: normalizeRole(row.userRole),
    details: parseSecurityDetails(row.details),
    userName: row.userName || "-",
  }));
}

async function querySecurityBlocks() {
  const rows = await query(
    `
      SELECT
        id,
        ip_address AS "ipAddress",
        reason,
        event_type AS "eventType",
        event_count AS "eventCount",
        block_until AS "blockUntil",
        released_at AS "releasedAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM security_blocks
      ORDER BY
        CASE WHEN released_at IS NULL THEN 0 ELSE 1 END ASC,
        block_until DESC,
        id DESC
      LIMIT 80
    `
  );

  return rows.map((row) => ({
    ...numberizeRow(row),
    isActive: !row.releasedAt && isFutureTimestamp(row.blockUntil),
  }));
}

module.exports = {
  // Severity / detail helpers
  normalizeSecuritySeverity,
  sanitizeSecurityDetails,
  serializeSecurityDetails,
  parseSecurityDetails,
  // Payload + queue
  normalizeSecurityEventPayload,
  queueSecurityEvent,
  flushQueuedSecurityEvents,
  insertSecurityEvent,
  // IP block lifecycle
  enforceIpSecurityBlock,
  recordFailedAuthentication,
  autoBlockIfThresholdReached,
  activateSecurityBlock,
  findActiveSecurityBlock,
  // Read paths
  querySecurityEvents,
  querySecurityBlocks,
};
