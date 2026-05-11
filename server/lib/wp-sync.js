"use strict";

/**
 * WordPress (drckaltetechnik.de) <-> Vercel/Supabase köprüsü.
 *
 * WP'deki drc-hamburg-sync plugin'i bu endpoint'leri tüketir:
 *   GET  /api/sync/items           — kataloga açık aktif ürünler (paginated)
 *   GET  /api/sync/categories      — distinct kategoriler + ürün sayısı
 *   GET  /api/sync/brands          — distinct markalar + ürün sayısı
 *   GET  /api/sync/projects        — proje uygulamaları (public visible)
 *   POST /api/orders/inbound       — WP'den gelen sipariş kaydı
 *   POST /api/vendors/inbound      — WP'den marketplace vendor başvurusu
 *
 * Auth: Bearer <WP_SYNC_TOKEN> (env). Yoksa endpoint 503 döndürür.
 *
 * Idempotency: orders/inbound + vendors/inbound her isteğe `Idempotency-Key`
 * header'ı gerekir; aynı key tekrar gelirse var olan kayıt döndürülür.
 *
 * NOT: WP user mapping henüz yok — WP'den gelen siparişlerde
 * orders.customer_user_id = NULL, customer_name + note alanlarında WP info.
 */

const crypto = require("crypto");
const { query, get, execute } = require("../db");
const { cleanOptional, normalizeRole, getClientIp } = require("./util");
const { insertSecurityEvent, normalizeSecurityEventPayload } = require("./security-events");

const WP_SYNC_TOKEN = (process.env.WP_SYNC_TOKEN || "").trim();
const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 200;

// ---------- Auth middleware ----------

function bearerAuth(req, res, next) {
  if (!WP_SYNC_TOKEN) {
    return res.status(503).json({
      error: "wp_sync_disabled",
      message: "WP_SYNC_TOKEN env değişkeni ayarlanmamış.",
    });
  }
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  const provided = match ? match[1].trim() : "";
  if (!provided || !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(WP_SYNC_TOKEN))) {
    insertSecurityEvent(normalizeSecurityEventPayload(req, {
      eventType: "wp_sync_unauthorized",
      severity: "warn",
      details: { path: req.path, ip: getClientIp(req) },
    })).catch(() => {});
    return res.status(401).json({ error: "unauthorized" });
  }
  return next();
}

// ---------- Helpers ----------

function clampPageSize(value) {
  const n = Number(value || DEFAULT_PAGE_SIZE);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(Math.floor(n), 1), MAX_PAGE_SIZE);
}

function clampPage(value) {
  const n = Number(value || 1);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(Math.floor(n), 1);
}

function mapItemRow(row) {
  return {
    id: Number(row.id),
    sku: cleanOptional(row.product_code) || `DRC-${row.id}`,
    name: row.name || "",
    name_de: row.name_de || row.name || "",
    brand: row.brand || "",
    category: row.category || "",
    unit: row.unit || "adet",
    eur_sale_price: Number(row.sale_price || 0),
    eur_list_price: Number(row.list_price || 0),
    eur_member_price: Number(row.member_price || 0),
    image_url: row.image_url || "",
    stock: Number(row.stock || 0),
    in_stock: Number(row.stock || 0) > 0,
    min_stock: Number(row.min_stock || 0),
    lead_time_days: Number(row.lead_time_days || 10),
    allow_backorder: row.allow_backorder === true || row.allow_backorder === 1 || row.allow_backorder === "1" || row.allow_backorder === "t",
    vendor_id: row.vendor_id ? Number(row.vendor_id) : null,
    notes: row.notes || "",
    notes_de: row.notes_de || "",
    updated_at: row.updated_at || row.created_at,
  };
}

// ---------- Read endpoints ----------

async function syncItems(req, res, next) {
  try {
    const page = clampPage(req.query.page);
    const pageSize = clampPageSize(req.query.pageSize);
    const offset = (page - 1) * pageSize;
    const sinceParam = cleanOptional(req.query.changedSince);
    const sinceFilter = sinceParam ? "AND COALESCE(i.updated_at, i.created_at) >= ?" : "";
    const params = sinceParam ? [sinceParam] : [];

    const totalRow = await get(
      `SELECT COUNT(*) AS n FROM items i WHERE i.is_active = true ${sinceFilter}`,
      params
    );

    const rows = await query(
      `
        SELECT
          i.id, i.product_code, i.name, i.name_de, i.brand, i.category, i.unit,
          i.sale_price, i.list_price, i.member_price, i.image_url, i.min_stock,
          i.lead_time_days, i.allow_backorder, i.vendor_id, i.notes, i.notes_de,
          i.created_at,
          COALESCE(SUM(CASE WHEN m.type = 'entry' THEN m.quantity
                            WHEN m.type = 'exit' THEN -m.quantity ELSE 0 END), 0) AS stock
        FROM items i
        LEFT JOIN movements m ON m.item_id = i.id
        WHERE i.is_active = true ${sinceFilter}
        GROUP BY i.id
        ORDER BY i.id ASC
        LIMIT ? OFFSET ?
      `,
      [...params, pageSize, offset]
    );

    res.json({
      page,
      pageSize,
      total: Number(totalRow?.n || 0),
      hasMore: offset + rows.length < Number(totalRow?.n || 0),
      items: rows.map(mapItemRow),
    });
  } catch (error) {
    next(error);
  }
}

async function syncCategories(_req, res, next) {
  try {
    const rows = await query(`
      SELECT category, COUNT(*) AS n
      FROM items
      WHERE is_active = true AND category IS NOT NULL AND category <> ''
      GROUP BY category
      ORDER BY n DESC
    `);
    res.json({
      categories: rows.map((row) => ({
        name: row.category,
        slug: slugify(row.category),
        count: Number(row.n),
      })),
    });
  } catch (error) {
    next(error);
  }
}

async function syncBrands(_req, res, next) {
  try {
    const rows = await query(`
      SELECT brand, COUNT(*) AS n
      FROM items
      WHERE is_active = true AND brand IS NOT NULL AND brand <> ''
      GROUP BY brand
      ORDER BY n DESC
    `);
    res.json({
      brands: rows.map((row) => ({
        name: row.brand,
        slug: slugify(row.brand),
        count: Number(row.n),
      })),
    });
  } catch (error) {
    next(error);
  }
}

async function syncProjects(_req, res, next) {
  try {
    const rows = await query(`
      SELECT
        p.id, p.title, p.status, p.project_type, p.note, p.created_at, p.updated_at,
        COUNT(pi.id) AS item_count
      FROM projects p
      LEFT JOIN project_items pi ON pi.project_id = p.id
      WHERE p.status IN ('done','ordered','quoted','priced')
      GROUP BY p.id
      ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC
      LIMIT 200
    `);
    res.json({
      projects: rows.map((row) => ({
        id: Number(row.id),
        title: row.title,
        slug: slugify(row.title || `proje-${row.id}`),
        type: row.project_type || "",
        status: row.status || "",
        note: row.note || "",
        item_count: Number(row.item_count || 0),
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
    });
  } catch (error) {
    next(error);
  }
}

// ---------- Write endpoints ----------

async function inboundOrder(req, res, next) {
  try {
    const idempotencyKey = cleanOptional(req.headers["idempotency-key"] || req.body?.idempotency_key);
    if (!idempotencyKey) {
      return res.status(400).json({ error: "missing_idempotency_key" });
    }

    // Idempotency: aynı key daha önce işlendiyse mevcut order'ı döndür
    const existing = await get(
      "SELECT id, status, created_at FROM orders WHERE note LIKE ? LIMIT 1",
      [`%[wp:${idempotencyKey}]%`]
    );
    if (existing?.id) {
      return res.json({ id: Number(existing.id), status: existing.status, idempotent: true });
    }

    const body = req.body || {};
    const customer = body.customer || {};
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      return res.status(400).json({ error: "empty_items" });
    }

    const customerName = cleanOptional(customer.name) || "WP Müşteri";
    const customerEmail = cleanOptional(customer.email);
    const customerPhone = cleanOptional(customer.phone);
    const wpUserId = cleanOptional(customer.wp_user_id);
    const orderTotal = items.reduce((sum, it) => {
      const qty = Number(it.qty || 0);
      const price = Number(it.unit_price || 0);
      return sum + qty * price;
    }, 0);

    const noteParts = [
      `[wp:${idempotencyKey}]`,
      customerEmail ? `email=${customerEmail}` : "",
      customerPhone ? `phone=${customerPhone}` : "",
      wpUserId ? `wp_user=${wpUserId}` : "",
      `total=€${orderTotal.toFixed(2)}`,
      cleanOptional(body.note),
    ].filter(Boolean);

    const nowIso = new Date().toISOString();
    const orderResult = await execute(
      `INSERT INTO orders (customer_name, order_date, status, note, created_at, payment_type, payment_status, paid_amount, has_backorder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [customerName, nowIso, "pending", noteParts.join(" | "), nowIso, "online", "pending", 0, false]
    );
    const orderId = orderResult?.rows?.[0]?.id || orderResult?.lastInsertRowid;

    for (const it of items) {
      const itemId = Number(it.id || 0) || null;
      const itemName = cleanOptional(it.name) || `WP item ${it.sku || ""}`;
      const quantity = Number(it.qty || 0);
      const unitPrice = Number(it.unit_price || 0);
      const unit = cleanOptional(it.unit) || "adet";
      await execute(
        `INSERT INTO order_items (order_id, item_id, item_name, quantity, unit, unit_price)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, itemId, itemName, quantity, unit, unitPrice]
      );
    }

    // Admin/staff bildirim
    await execute(
      `INSERT INTO admin_messages (sender_user_id, sender_name, sender_role, category, subject, message, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        null,
        "WordPress (drckaltetechnik.de)",
        "system",
        "order_alert",
        `Yeni online sipariş #${orderId} — ${customerName}`,
        `WP'den yeni sipariş geldi.\nMüşteri: ${customerName}\nE-posta: ${customerEmail}\nTelefon: ${customerPhone}\nTutar: €${orderTotal.toFixed(2)}\nÜrün adet: ${items.length}\nIdempotency: ${idempotencyKey}`,
        "unread",
        nowIso,
      ]
    );

    res.status(201).json({ id: Number(orderId), status: "pending", idempotent: false });
  } catch (error) {
    next(error);
  }
}

async function inboundVendor(req, res, next) {
  try {
    const idempotencyKey = cleanOptional(req.headers["idempotency-key"] || req.body?.idempotency_key);
    if (!idempotencyKey) {
      return res.status(400).json({ error: "missing_idempotency_key" });
    }

    const body = req.body || {};
    const businessName = cleanOptional(body.business_name);
    const slug = slugify(businessName);
    if (!businessName) {
      return res.status(400).json({ error: "missing_business_name" });
    }

    // Idempotency via slug
    const existing = await get("SELECT id, status FROM vendors WHERE slug = ?", [slug]);
    if (existing?.id) {
      return res.json({ id: Number(existing.id), status: existing.status, idempotent: true });
    }

    // owner_user_id: WP user'lar henüz Vercel'de eşlenmediği için dummy admin'e bağla
    const adminUser = await get("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1");
    const ownerId = adminUser?.id || null;

    const nowIso = new Date().toISOString();
    const result = await execute(
      `INSERT INTO vendors (owner_user_id, business_name, slug, status, commission_pct, contact_email, contact_phone, address, vat_id, iban, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        ownerId,
        businessName,
        slug,
        "pending",
        Number(body.commission_pct || 10),
        cleanOptional(body.contact_email),
        cleanOptional(body.contact_phone),
        cleanOptional(body.address),
        cleanOptional(body.vat_id),
        cleanOptional(body.iban),
        `[wp:${idempotencyKey}] ${cleanOptional(body.notes) || ""}`.trim(),
        nowIso,
      ]
    );
    const vendorId = result?.rows?.[0]?.id || result?.lastInsertRowid;

    // Admin bildirim
    await execute(
      `INSERT INTO admin_messages (sender_user_id, sender_name, sender_role, category, subject, message, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        null,
        "WordPress (drckaltetechnik.de)",
        "system",
        "vendor_alert",
        `Yeni satıcı başvurusu — ${businessName}`,
        `Marketplace satıcı başvurusu (pending).\nFirma: ${businessName}\nSlug: ${slug}\nE-posta: ${cleanOptional(body.contact_email)}\nTelefon: ${cleanOptional(body.contact_phone)}\nVAT: ${cleanOptional(body.vat_id)}\nIBAN: ${cleanOptional(body.iban)}\nKomisyon: %${Number(body.commission_pct || 10)}\nIdempotency: ${idempotencyKey}\n\nAdmin panelinden onayla/reddet.`,
        "unread",
        nowIso,
      ]
    );

    res.status(201).json({ id: Number(vendorId), status: "pending", idempotent: false });
  } catch (error) {
    next(error);
  }
}

// ---------- Utilities ----------

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// ---------- Mount ----------

function mountWpSyncRoutes(app) {
  app.get("/api/sync/items", bearerAuth, syncItems);
  app.get("/api/sync/categories", bearerAuth, syncCategories);
  app.get("/api/sync/brands", bearerAuth, syncBrands);
  app.get("/api/sync/projects", bearerAuth, syncProjects);
  app.post("/api/orders/inbound", bearerAuth, inboundOrder);
  app.post("/api/vendors/inbound", bearerAuth, inboundVendor);
}

module.exports = {
  mountWpSyncRoutes,
  bearerAuth,
  syncItems,
  syncCategories,
  syncBrands,
  syncProjects,
  inboundOrder,
  inboundVendor,
  slugify,
};
