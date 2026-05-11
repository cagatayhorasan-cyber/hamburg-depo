"use strict";

/**
 * Kullanıcı aktivite log'u (admin'in müşteri davranışlarını izlemesi için).
 *
 * - insertActivity(req, event): tek satır insert (sync flush — küçük overhead)
 * - queryActivity(filters): admin listeleme
 * - activityStats(filters): agregate (top search, top items, daily count)
 * - cleanupOldActivity(days): retention (default 90 gün)
 *
 * Event tipleri:
 *   page_view, search, product_view, category_view, brand_view,
 *   cart_add, cart_remove, cart_clear,
 *   order_placed, order_completed, order_cancelled,
 *   profile_update, password_change,
 *   bot_message, bot_response,
 *   project_view, project_create, project_update,
 *   filter_apply, sort_change,
 *   login, logout, page_leave
 *
 * NOT: security_events ile çakışmaz — bu davranış izleme, o güvenlik olayları.
 */

const { query, get, execute } = require("../db");
const { cleanOptional, normalizeRole, getClientIp } = require("./util");

const ALLOWED_EVENTS = new Set([
  "page_view", "search", "product_view", "category_view", "brand_view",
  "cart_add", "cart_remove", "cart_clear", "cart_view",
  "order_placed", "order_completed", "order_cancelled",
  "profile_update", "password_change",
  "bot_message", "bot_response",
  "project_view", "project_create", "project_update",
  "filter_apply", "sort_change",
  "login", "logout", "page_leave",
  "stock_view", "inventory_view", "report_view", "admin_action",
]);

const MAX_LABEL_LEN = 300;
const MAX_PATH_LEN = 500;
const MAX_UA_LEN = 300;
const MAX_METADATA_KEYS = 20;
const MAX_METADATA_VAL_LEN = 500;

function sanitizeEventType(value) {
  const t = String(value || "").toLowerCase().trim();
  return ALLOWED_EVENTS.has(t) ? t : "page_view";
}

function sanitizeMetadata(meta) {
  if (!meta || typeof meta !== "object") return {};
  const out = {};
  let count = 0;
  for (const [k, v] of Object.entries(meta)) {
    if (count >= MAX_METADATA_KEYS) break;
    if (v === undefined || v === null) continue;
    if (typeof v === "string") {
      out[k] = v.slice(0, MAX_METADATA_VAL_LEN);
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    } else if (Array.isArray(v) || typeof v === "object") {
      try {
        const serialized = JSON.stringify(v).slice(0, MAX_METADATA_VAL_LEN);
        out[k] = JSON.parse(serialized);
      } catch (_) {}
    }
    count++;
  }
  return out;
}

async function insertActivity(req, event = {}) {
  try {
    const user = req?.session?.user || event.user || null;
    const ip = event.ipAddress || getClientIp(req);
    const ua = String(event.userAgent || req?.get?.("user-agent") || "").slice(0, MAX_UA_LEN);
    const path = String(event.pagePath || req?.path || req?.originalUrl || "").slice(0, MAX_PATH_LEN);

    const row = {
      userId:    user?.id ? Number(user.id) : null,
      userRole:  normalizeRole(event.userRole || user?.role || ""),
      userName:  cleanOptional(event.userName || user?.name || user?.username || ""),
      sessionId: cleanOptional(event.sessionId || req?.sessionID || req?.session?.id || ""),
      eventType: sanitizeEventType(event.eventType),
      eventLabel:cleanOptional(event.eventLabel).slice(0, MAX_LABEL_LEN),
      targetType:cleanOptional(event.targetType),
      targetId:  event.targetId ? Number(event.targetId) : null,
      pagePath:  path,
      metadata:  sanitizeMetadata(event.metadata),
      ipAddress: ip,
      userAgent: ua,
    };

    await execute(
      `INSERT INTO user_activity_log
       (user_id, user_role, user_name, session_id, event_type, event_label,
        target_type, target_id, page_path, metadata, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.userId, row.userRole, row.userName, row.sessionId,
        row.eventType, row.eventLabel, row.targetType, row.targetId,
        row.pagePath, JSON.stringify(row.metadata), row.ipAddress, row.userAgent,
      ]
    );
    return row;
  } catch (e) {
    // Silent fail — activity log hatası kullanıcı işlemini bloklamasin
    console.error("activity-log insert error:", e.message);
    return null;
  }
}

async function queryActivity(opts = {}) {
  const userId    = opts.userId ? Number(opts.userId) : null;
  const role      = cleanOptional(opts.role);
  const eventType = cleanOptional(opts.eventType);
  const since     = opts.since || null;
  const limit     = Math.min(Math.max(Number(opts.limit) || 200, 1), 1000);

  const where = [];
  const params = [];
  let i = 1;
  if (userId)    { where.push(`a.user_id = $${i++}`); params.push(userId); }
  if (role)      { where.push(`a.user_role = $${i++}`); params.push(role); }
  if (eventType) { where.push(`a.event_type = $${i++}`); params.push(eventType); }
  if (since)     { where.push(`a.created_at >= $${i++}`); params.push(since); }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const sql = `
    SELECT
      a.id,
      a.user_id      AS "userId",
      a.user_role    AS "userRole",
      a.user_name    AS "userName",
      a.session_id   AS "sessionId",
      a.event_type   AS "eventType",
      a.event_label  AS "eventLabel",
      a.target_type  AS "targetType",
      a.target_id    AS "targetId",
      a.page_path    AS "pagePath",
      a.metadata,
      a.ip_address   AS "ipAddress",
      a.user_agent   AS "userAgent",
      a.created_at   AS "createdAt"
    FROM user_activity_log a
    ${whereClause}
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT $${i}
  `;
  params.push(limit);

  const rows = await query(sql, params);
  return rows.map((r) => ({
    ...r,
    metadata: typeof r.metadata === "string" ? safeJsonParse(r.metadata) : (r.metadata || {}),
  }));
}

async function activityStats(opts = {}) {
  const userId = opts.userId ? Number(opts.userId) : null;
  const since  = opts.since || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  const userFilter = userId ? `WHERE a.user_id = $1 AND a.created_at >= $2` : `WHERE a.created_at >= $1`;
  const params = userId ? [userId, since] : [since];

  const total = await get(
    `SELECT COUNT(*) AS n FROM user_activity_log a ${userFilter}`,
    params
  );

  const topEventsParams = userId ? [userId, since, 10] : [since, 10];
  const topEvents = await query(
    `SELECT event_type AS "eventType", COUNT(*) AS count
     FROM user_activity_log a ${userFilter}
     GROUP BY event_type
     ORDER BY count DESC
     LIMIT $${params.length + 1}`,
    topEventsParams
  );

  const topSearches = await query(
    `SELECT event_label AS "label", COUNT(*) AS count
     FROM user_activity_log a ${userFilter} AND event_type = 'search' AND event_label IS NOT NULL AND event_label <> ''
     GROUP BY event_label
     ORDER BY count DESC
     LIMIT $${params.length + 1}`,
    [...params, 10]
  );

  const topItems = await query(
    `SELECT a.target_id AS "itemId", a.event_label AS "label", COUNT(*) AS count
     FROM user_activity_log a ${userFilter} AND a.event_type = 'product_view' AND a.target_id IS NOT NULL
     GROUP BY a.target_id, a.event_label
     ORDER BY count DESC
     LIMIT $${params.length + 1}`,
    [...params, 10]
  );

  const dailyParams = userId ? [userId, since] : [since];
  const dailyTrend = await query(
    `SELECT DATE_TRUNC('day', a.created_at)::date AS day, COUNT(*) AS count
     FROM user_activity_log a ${userFilter}
     GROUP BY day
     ORDER BY day ASC`,
    dailyParams
  );

  return {
    total: Number(total?.n || 0),
    topEvents: topEvents.map((r) => ({ eventType: r.eventType, count: Number(r.count) })),
    topSearches: topSearches.map((r) => ({ label: r.label, count: Number(r.count) })),
    topItems: topItems.map((r) => ({ itemId: Number(r.itemId), label: r.label, count: Number(r.count) })),
    dailyTrend: dailyTrend.map((r) => ({ day: r.day, count: Number(r.count) })),
  };
}

async function activeUsersList(opts = {}) {
  const since = opts.since || new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);

  const rows = await query(
    `SELECT
        a.user_id AS "userId",
        COALESCE(MAX(u.name), MAX(a.user_name)) AS "name",
        COALESCE(MAX(u.username), '') AS "username",
        MAX(a.user_role) AS "role",
        COUNT(*) AS "eventCount",
        MAX(a.created_at) AS "lastSeen",
        COUNT(DISTINCT a.session_id) AS "sessionCount",
        COUNT(*) FILTER (WHERE a.event_type='product_view') AS "productViews",
        COUNT(*) FILTER (WHERE a.event_type='search') AS "searches",
        COUNT(*) FILTER (WHERE a.event_type='cart_add') AS "cartAdds",
        COUNT(*) FILTER (WHERE a.event_type='order_placed') AS "ordersPlaced"
     FROM user_activity_log a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.created_at >= $1
     GROUP BY a.user_id
     ORDER BY "lastSeen" DESC
     LIMIT $2`,
    [since, limit]
  );

  return rows.map((r) => ({
    userId: r.userId ? Number(r.userId) : null,
    name: r.name || "Anonim",
    username: r.username || "",
    role: r.role || "guest",
    eventCount: Number(r.eventCount),
    sessionCount: Number(r.sessionCount),
    productViews: Number(r.productViews),
    searches: Number(r.searches),
    cartAdds: Number(r.cartAdds),
    ordersPlaced: Number(r.ordersPlaced),
    lastSeen: r.lastSeen,
  }));
}

async function cleanupOldActivity(daysToKeep = 90) {
  const cutoff = new Date(Date.now() - daysToKeep * 24 * 3600 * 1000).toISOString();
  await execute(`DELETE FROM user_activity_log WHERE created_at < ?`, [cutoff]);
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch (_) { return {}; }
}

module.exports = {
  ALLOWED_EVENTS: Array.from(ALLOWED_EVENTS),
  insertActivity,
  queryActivity,
  activityStats,
  activeUsersList,
  cleanupOldActivity,
};
