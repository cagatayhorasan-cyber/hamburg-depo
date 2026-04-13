#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(PROJECT_ROOT, ".env");
const PUBLIC_URL_FILE = path.join(os.homedir(), "Library", "Application Support", "HamburgDepo", "public-url.txt");
const PREFIX = `LIVECHECK-${Date.now()}`;

loadEnvFile(ENV_PATH);

const LIVE_CHECK_ADMIN_USER = process.env.LIVE_CHECK_ADMIN_USER || "cagatayhorasan";
const LIVE_CHECK_ADMIN_PASSWORD = process.env.LIVE_CHECK_ADMIN_PASSWORD || "";
const LIVE_CHECK_STAFF_USER = process.env.LIVE_CHECK_STAFF_USER || "tuncaykiremitci";
const LIVE_CHECK_STAFF_PASSWORD = process.env.LIVE_CHECK_STAFF_PASSWORD || "";

const { initDatabase, query, get, execute } = require("../server/db");

class HttpClient {
  constructor(baseUrl) {
    this.baseUrl = String(baseUrl || "").replace(/\/$/, "");
    this.cookieFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "livecheck-cookies-")), "cookies.txt");
    fs.writeFileSync(this.cookieFile, "");
  }

  async request(method, route, options = {}) {
    const headersFile = path.join(os.tmpdir(), `livecheck-headers-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
    const args = [
      "-sS",
      "-D",
      headersFile,
      "-b",
      this.cookieFile,
      "-c",
      this.cookieFile,
      "-X",
      method,
    ];

    const headers = { ...(options.headers || {}) };
    if (options.json !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    for (const [key, value] of Object.entries(headers)) {
      args.push("-H", `${key}: ${value}`);
    }

    if (options.json !== undefined) {
      args.push("--data-binary", JSON.stringify(options.json));
    } else if (options.body !== undefined) {
      args.push("--data-binary", String(options.body));
    }

    args.push(`${this.baseUrl}${route}`);

    const result = spawnSync("curl", args, { encoding: null, maxBuffer: 64 * 1024 * 1024 });
    const headerText = fs.existsSync(headersFile) ? fs.readFileSync(headersFile, "utf8") : "";
    fs.rmSync(headersFile, { force: true });

    if (result.error || result.status !== 0) {
      const details = String(result.stderr || result.error?.message || "curl failed").trim();
      throw new Error(details || "curl failed");
    }

    const parsedHeaders = parseCurlHeaders(headerText);
    const contentType = parsedHeaders.headers["content-type"] || "";
    let parsedBody;
    if (options.expectBinary) {
      parsedBody = result.stdout;
    } else if (contentType.includes("application/json")) {
      parsedBody = JSON.parse(String(result.stdout || "").trim() || "{}");
    } else {
      parsedBody = String(result.stdout || "");
    }

    return {
      status: parsedHeaders.status,
      ok: parsedHeaders.status >= 200 && parsedHeaders.status < 300,
      headers: {
        get(name) {
          return parsedHeaders.headers[String(name || "").toLowerCase()] || null;
        },
      },
      body: parsedBody,
      contentType,
    };
  }

  get(route, options) {
    return this.request("GET", route, options);
  }

  post(route, json, options = {}) {
    return this.request("POST", route, { ...options, json });
  }

  put(route, json, options = {}) {
    return this.request("PUT", route, { ...options, json });
  }

  delete(route, options = {}) {
    return this.request("DELETE", route, options);
  }
}

function parseCurlHeaders(rawText) {
  const text = String(rawText || "").replace(/\r/g, "");
  const blocks = text
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
  const lastBlock = blocks[blocks.length - 1] || "";
  const lines = lastBlock.split("\n").filter(Boolean);
  const statusLine = lines.shift() || "";
  const statusMatch = statusLine.match(/\s(\d{3})(?:\s|$)/);
  const status = statusMatch ? Number(statusMatch[1]) : 0;
  const headers = {};

  for (const line of lines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    headers[key] = value;
  }

  return { status, headers };
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function getBaseUrl() {
  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }
  if (fs.existsSync(PUBLIC_URL_FILE)) {
    return fs.readFileSync(PUBLIC_URL_FILE, "utf8").trim();
  }
  throw new Error("Canli test icin BASE_URL veya public-url.txt gerekli.");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function plusHours(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function hashAuthToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

async function issueResetTokenForUser(userId, expiresInHours = 2) {
  const token = crypto.randomBytes(24).toString("hex");
  await execute(
    "UPDATE auth_tokens SET consumed_at = ? WHERE user_id = ? AND token_type = ? AND consumed_at IS NULL",
    [new Date().toISOString(), Number(userId), "reset_password"]
  );
  await execute(
    "INSERT INTO auth_tokens (user_id, token_type, token_hash, expires_at) VALUES (?, ?, ?, ?)",
    [Number(userId), "reset_password", hashAuthToken(token), plusHours(expiresInHours)]
  );
  return token;
}

async function cleanupPrefix(prefixRoot) {
  const likeValue = `${prefixRoot}%`;

  await execute(
    `
      DELETE FROM quote_items
      WHERE quote_id IN (
        SELECT id FROM quotes
        WHERE customer_name LIKE ? OR title LIKE ? OR note LIKE ? OR quote_no LIKE ?
      )
    `,
    [likeValue, likeValue, likeValue, likeValue]
  );

  await execute(
    `
      DELETE FROM quotes
      WHERE customer_name LIKE ? OR title LIKE ? OR note LIKE ? OR quote_no LIKE ?
    `,
    [likeValue, likeValue, likeValue, likeValue]
  );

  await execute(
    `
      DELETE FROM order_items
      WHERE order_id IN (
        SELECT id FROM orders
        WHERE customer_name LIKE ? OR note LIKE ?
      )
    `,
    [likeValue, likeValue]
  );

  await execute(
    `
      DELETE FROM orders
      WHERE customer_name LIKE ? OR note LIKE ?
    `,
    [likeValue, likeValue]
  );

  await execute(
    `
      DELETE FROM movements
      WHERE note LIKE ?
         OR item_id IN (
           SELECT id FROM items
           WHERE name LIKE ? OR barcode LIKE ? OR brand LIKE ? OR category LIKE ?
         )
    `,
    [likeValue, likeValue, likeValue, likeValue, likeValue]
  );

  await execute(
    `
      DELETE FROM cashbook
      WHERE title LIKE ? OR reference LIKE ? OR note LIKE ?
    `,
    [likeValue, likeValue, likeValue]
  );

  await execute(
    `
      DELETE FROM expenses
      WHERE title LIKE ? OR note LIKE ?
    `,
    [likeValue, likeValue]
  );

  await execute(
    `
      DELETE FROM auth_tokens
      WHERE user_id IN (
        SELECT id FROM users
        WHERE username LIKE ? OR name LIKE ? OR COALESCE(email, '') LIKE ?
      )
    `,
    [likeValue, likeValue, likeValue]
  );

  await execute(
    `
      DELETE FROM security_events
      WHERE identifier LIKE ?
         OR details LIKE ?
         OR user_id IN (
           SELECT id FROM users
           WHERE username LIKE ? OR name LIKE ? OR COALESCE(email, '') LIKE ?
         )
    `,
    [likeValue, `%${prefixRoot}%`, likeValue, likeValue, likeValue]
  );

  await execute(
    `
      DELETE FROM items
      WHERE name LIKE ? OR barcode LIKE ? OR brand LIKE ? OR category LIKE ?
    `,
    [likeValue, likeValue, likeValue, likeValue]
  );

  await execute(
    `
      DELETE FROM users
      WHERE username LIKE ? OR name LIKE ? OR COALESCE(email, '') LIKE ?
    `,
    [likeValue, likeValue, likeValue]
  );
}

async function run() {
  if (!LIVE_CHECK_ADMIN_PASSWORD || !LIVE_CHECK_STAFF_PASSWORD) {
    throw new Error("LIVE_CHECK_ADMIN_PASSWORD ve LIVE_CHECK_STAFF_PASSWORD tanimli olmali.");
  }

  const baseUrl = getBaseUrl();
  await initDatabase();
  await cleanupPrefix("LIVECHECK-");

  const adminClient = new HttpClient(baseUrl);
  const staffClient = new HttpClient(baseUrl);
  const createdStaffClient = new HttpClient(baseUrl);
  const customerClient = new HttpClient(baseUrl);
  const freshCustomerClient = new HttpClient(baseUrl);
  const anonymousClient = new HttpClient(baseUrl);

  const sections = [];
  let currentSection = null;
  let failures = 0;
  const state = {
    createdUserId: null,
    createdUsername: null,
    registeredCustomerId: null,
    createdItemId: null,
    pricedItemId: null,
    deletableItemId: null,
    archivedItemId: null,
    intakeItemId: null,
    createdExpenseId: null,
    createdCashIds: [],
    orderId: null,
    quoteId: null,
    saleQuoteId: null,
  };

  function startSection(title) {
    currentSection = { title, checks: [] };
    sections.push(currentSection);
  }

  async function check(name, fn) {
    try {
      await fn();
      currentSection.checks.push({ name, ok: true });
      process.stdout.write(`PASS ${currentSection.title} :: ${name}\n`);
    } catch (error) {
      failures += 1;
      currentSection.checks.push({ name, ok: false, error: String(error.message || error) });
      process.stdout.write(`FAIL ${currentSection.title} :: ${name} -> ${String(error.message || error)}\n`);
    }
  }

  try {
    startSection("Erisim ve oturum");

    await check("Saglik kontrolu donuyor", async () => {
      const response = await anonymousClient.get("/api/health");
      assert.equal(response.status, 200);
      assert.equal(response.body.ok, true);
      assert.equal(response.body.dbClient, "postgres");
    });

    await check("Yetkisiz bootstrap engelleniyor", async () => {
      const response = await anonymousClient.get("/api/bootstrap");
      assert.equal(response.status, 401);
    });

    await check("Hatali giris reddediliyor", async () => {
      const response = await anonymousClient.post("/api/login", {
        identifier: LIVE_CHECK_ADMIN_USER,
        password: "yanlis-sifre",
      });
      assert.equal(response.status, 401);
    });

    await check("Admin girisi calisiyor", async () => {
      const response = await adminClient.post("/api/login", {
        identifier: LIVE_CHECK_ADMIN_USER,
        password: LIVE_CHECK_ADMIN_PASSWORD,
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.user.role, "admin");
    });

    await check("Admin me endpointi dogru donuyor", async () => {
      const response = await adminClient.get("/api/me");
      assert.equal(response.status, 200);
      assert.equal(response.body.user.username, LIVE_CHECK_ADMIN_USER);
    });

    await check("Personel hesabi giris yapabiliyor", async () => {
      const response = await staffClient.post("/api/login", {
        identifier: LIVE_CHECK_STAFF_USER,
        password: LIVE_CHECK_STAFF_PASSWORD,
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.user.role, "staff");
    });

    await check("Admin bootstrap local DRC MAN gosteriyor", async () => {
      const response = await adminClient.get("/api/bootstrap");
      assert.equal(response.status, 200);
      assert.ok(["local_drc_man", "built_in"].includes(response.body.assistantStatus.mode));
    });

    await check("DRC MAN sorgusu gercek saglayici ile donuyor", async () => {
      const response = await adminClient.post("/api/assistant/query", {
        message: "Hamburg stokta kontrolor onerir misin?",
        language: "tr",
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.provider, "drc_man");
      assert.ok(String(response.body.answer || "").length > 10);
    });

    startSection("Kullanici ve roller");

    await check("Admin yeni personel kullanicisi olusturuyor", async () => {
      const username = `${PREFIX.toLowerCase()}-staff`;
      const response = await adminClient.post("/api/users", {
        name: `${PREFIX} Staff`,
        username,
        email: `${username}@example.com`,
        phone: "+4915220000001",
        password: "Staff123!",
        role: "staff",
      });
      assert.equal(response.status, 200);
      state.createdUserId = Number(response.body.id);
      state.createdUsername = String(response.body.username);
    });

    await check("Yeni personel girisi calisiyor", async () => {
      const response = await createdStaffClient.post("/api/login", {
        identifier: state.createdUsername || `${PREFIX.toLowerCase()}-staff`,
        password: "Staff123!",
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.user.role, "staff");
    });

    await check("Personel admin kullanicisi acamiyor", async () => {
      const response = await createdStaffClient.post("/api/users", {
        name: `${PREFIX} Blocked`,
        username: `${PREFIX.toLowerCase()}-blocked`,
        password: "Blocked123!",
        role: "staff",
      });
      assert.equal(response.status, 403);
    });

    await check("Musteri kaydi acilabiliyor", async () => {
      const username = `${PREFIX.toLowerCase()}-customer`;
      const email = `${username}@example.com`;
      const response = await freshCustomerClient.post("/api/customers/register", {
        name: `${PREFIX} Musteri`,
        username,
        email,
        phone: "+4915220000002",
        password: "Customer123!",
      });
      assert.equal(response.status, 200);
      state.registeredCustomerId = Number(response.body.user.id);
      assert.equal(response.body.user.role, "customer");
    });

    await check("Kayitli musteri yeni sifresiyle giris yapabiliyor", async () => {
      const response = await customerClient.post("/api/login", {
        identifier: `${PREFIX.toLowerCase()}-customer@example.com`,
        password: "Customer123!",
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.user.role, "customer");
    });

    await check("Musteri bootstrap stoklu urunleri ve gizli alis bilgisini dogru donuyor", async () => {
      const response = await customerClient.get("/api/bootstrap");
      assert.equal(response.status, 200);
      assert.ok(["local_drc_man", "built_in"].includes(response.body.assistantStatus.mode));
      assert.ok(Array.isArray(response.body.items));
      assert.ok(response.body.items.every((item) => Number(item.currentStock) > 0));
      assert.ok(response.body.items.every((item) => Number(item.defaultPrice || 0) === 0));
      assert.ok(response.body.items.every((item) => Number(item.lastPurchasePrice || 0) === 0));
      assert.ok(response.body.items.every((item) => Number(item.averagePurchasePrice || 0) === 0));
      assert.deepEqual(response.body.cashbook, []);
      assert.equal(Number(response.body.summary.cashBalance || 0), 0);
    });

    await check("Musteri admin alanina erisemiyor", async () => {
      const response = await customerClient.post("/api/users", {
        name: `${PREFIX} Illegal`,
        username: `${PREFIX.toLowerCase()}-illegal`,
        password: "Illegal123!",
        role: "staff",
      });
      assert.equal(response.status, 403);
    });

    startSection("Malzeme ve stok");

    await check("Admin yeni malzeme karti olusturuyor", async () => {
      const response = await adminClient.post("/api/items", {
        name: `${PREFIX} Ana Kart`,
        brand: PREFIX,
        category: `${PREFIX} Kategori`,
        unit: "adet",
        minStock: 1,
        barcode: `${PREFIX}-ITEM-1`,
        notes: `${PREFIX} item olusturma testi`,
        defaultPrice: 12.5,
        salePrice: 18.75,
      });
      assert.equal(response.status, 200);
      state.createdItemId = Number(response.body.id);
    });

    await check("Ayni barkod ile ikinci kart engelleniyor", async () => {
      const response = await adminClient.post("/api/items", {
        name: `${PREFIX} Barkod Tekrari`,
        brand: PREFIX,
        category: `${PREFIX} Kategori`,
        unit: "adet",
        barcode: `${PREFIX}-ITEM-1`,
      });
      assert.equal(response.status, 400);
    });

    await check("Malzeme guncelleme calisiyor", async () => {
      const response = await adminClient.put(`/api/items/${state.createdItemId}`, {
        name: `${PREFIX} Ana Kart Guncel`,
        brand: PREFIX,
        category: `${PREFIX} Kategori`,
        unit: "adet",
        minStock: 2,
        barcode: `${PREFIX}-ITEM-1`,
        notes: `${PREFIX} item guncelleme testi`,
        defaultPrice: 13,
        salePrice: 21,
      });
      assert.equal(response.status, 200);
      const row = await get("SELECT sale_price, min_stock FROM items WHERE id = ?", [state.createdItemId]);
      assert.equal(Number(row.sale_price), 21);
      assert.equal(Number(row.min_stock), 2);
    });

    await check("Toplu fiyat guncelleme hedefli urunde calisiyor", async () => {
      const pricedResponse = await adminClient.post("/api/items", {
        name: `${PREFIX} Bulk Kart`,
        brand: `${PREFIX} Bulk Brand`,
        category: `${PREFIX} Bulk Category`,
        unit: "adet",
        minStock: 0,
        barcode: `${PREFIX}-BULK-1`,
        notes: `${PREFIX} bulk pricing`,
        defaultPrice: 100,
        salePrice: 100,
      });
      assert.equal(pricedResponse.status, 200);
      state.pricedItemId = Number(pricedResponse.body.id);

      const response = await adminClient.post("/api/pricing/bulk", {
        brand: `${PREFIX} Bulk Brand`,
        category: `${PREFIX} Bulk Category`,
        increasePercent: 20,
        pricingMode: "margin",
        baseField: "default",
      });
      assert.equal(response.status, 200);
      const row = await get("SELECT sale_price FROM items WHERE id = ?", [state.pricedItemId]);
      assert.equal(Number(row.sale_price), 120);
    });

    await check("Hareketsiz malzeme arsivlenip geri alinabiliyor", async () => {
      const responseArchive = await adminClient.post(`/api/items/${state.pricedItemId}/archive`, {});
      assert.equal(responseArchive.status, 200);
      let row = await get("SELECT is_active FROM items WHERE id = ?", [state.pricedItemId]);
      assert.equal(Boolean(row.is_active), false);

      const responseRestore = await adminClient.post(`/api/items/${state.pricedItemId}/restore`, {});
      assert.equal(responseRestore.status, 200);
      row = await get("SELECT is_active FROM items WHERE id = ?", [state.pricedItemId]);
      assert.equal(Boolean(row.is_active), true);
    });

    await check("Hareketsiz malzeme silinebiliyor", async () => {
      const responseCreate = await adminClient.post("/api/items", {
        name: `${PREFIX} Silinebilir Kart`,
        brand: PREFIX,
        category: `${PREFIX} Kategori`,
        unit: "adet",
        minStock: 0,
        barcode: `${PREFIX}-DELETE-1`,
      });
      assert.equal(responseCreate.status, 200);
      state.deletableItemId = Number(responseCreate.body.id);

      const responseDelete = await adminClient.delete(`/api/items/${state.deletableItemId}`);
      assert.equal(responseDelete.status, 200);
      const deleted = await get("SELECT id FROM items WHERE id = ?", [state.deletableItemId]);
      assert.equal(deleted, null);
    });

    await check("Yeni urun ve ilk stok girisi calisiyor", async () => {
      assert.ok(staffClient, "Personel oturumu yok.");
      const response = await staffClient.post("/api/items/intake", {
        name: `${PREFIX} Stoklu Kart`,
        brand: PREFIX,
        category: `${PREFIX} Stok`,
        unit: "adet",
        minStock: 1,
        barcode: `${PREFIX}-STOCK-1`,
        notes: `${PREFIX} intake`,
        salePrice: 30,
        quantity: 5,
        unitPrice: 20,
        date: today(),
        movementNote: `${PREFIX} intake movement`,
      });
      assert.equal(response.status, 200);
      state.intakeItemId = Number(response.body.id);
      const stockRow = await get(
        `
          SELECT COALESCE(SUM(CASE WHEN type = 'entry' THEN quantity ELSE -quantity END), 0) AS stock
          FROM movements
          WHERE item_id = ?
        `,
        [state.intakeItemId]
      );
      assert.equal(Number(stockRow.stock), 5);
    });

    await check("Ayni isim ve marka ile tekrar intake engelleniyor", async () => {
      assert.ok(state.intakeItemId, "Intake urunu olusmadi.");
      const response = await staffClient.post("/api/items/intake", {
        name: `${PREFIX} Stoklu Kart`,
        brand: PREFIX,
        category: `${PREFIX} Stok`,
        unit: "adet",
        minStock: 1,
        barcode: `${PREFIX}-STOCK-2`,
        quantity: 1,
        unitPrice: 20,
        date: today(),
      });
      assert.equal(response.status, 400);
    });

    await check("Personel stok cikisi yapabiliyor", async () => {
      assert.ok(state.intakeItemId, "Stoklu test urunu yok.");
      const response = await staffClient.post("/api/movements", {
        itemId: state.intakeItemId,
        type: "exit",
        quantity: 2,
        unitPrice: 30,
        date: today(),
        note: `${PREFIX} exit movement`,
      });
      assert.equal(response.status, 200);
      const row = await get("SELECT id FROM movements WHERE note = ? ORDER BY id DESC LIMIT 1", [`${PREFIX} exit movement`]);
      assert.ok(row?.id);
    });

    await check("Fazla stok cikisi engelleniyor", async () => {
      assert.ok(state.intakeItemId, "Stoklu test urunu yok.");
      const response = await staffClient.post("/api/movements", {
        itemId: state.intakeItemId,
        type: "exit",
        quantity: 9999,
        unitPrice: 30,
        date: today(),
        note: `${PREFIX} too much exit`,
      });
      assert.equal(response.status, 400);
    });

    await check("Personel stok girisi yapabiliyor", async () => {
      assert.ok(state.intakeItemId, "Stoklu test urunu yok.");
      const response = await staffClient.post("/api/movements", {
        itemId: state.intakeItemId,
        type: "entry",
        quantity: 1,
        unitPrice: 19,
        date: today(),
        note: `${PREFIX} extra entry`,
      });
      assert.equal(response.status, 200);
    });

    await check("Stok hareketi iptali calisiyor", async () => {
      const movement = await get("SELECT id FROM movements WHERE note = ? ORDER BY id DESC LIMIT 1", [`${PREFIX} exit movement`]);
      assert.ok(movement?.id, "Iptal edilecek hareket bulunamadi.");
      const response = await staffClient.post(`/api/movements/${movement.id}/reverse`, {});
      assert.equal(response.status, 200);
      const reverseRow = await get("SELECT id FROM movements WHERE reversal_of = ?", [Number(movement.id)]);
      assert.ok(reverseRow?.id);
    });

    await check("Ayni hareket ikinci kez iptal edilemiyor", async () => {
      const movement = await get("SELECT id FROM movements WHERE note = ? ORDER BY id DESC LIMIT 1", [`${PREFIX} exit movement`]);
      assert.ok(movement?.id, "Iptal edilecek hareket bulunamadi.");
      const response = await staffClient.post(`/api/movements/${movement.id}/reverse`, {});
      assert.equal(response.status, 400);
    });

    await check("Hareketi olan urun silinemiyor", async () => {
      assert.ok(state.intakeItemId, "Stoklu test urunu yok.");
      const response = await adminClient.delete(`/api/items/${state.intakeItemId}`);
      assert.equal(response.status, 400);
    });

    await check("Arsivli urun sipariste engelleniyor", async () => {
      const responseCreate = await adminClient.post("/api/items/intake", {
        name: `${PREFIX} Arsiv Siparis Kart`,
        brand: PREFIX,
        category: `${PREFIX} Arsiv`,
        unit: "adet",
        minStock: 0,
        barcode: `${PREFIX}-ARCHIVE-1`,
        notes: `${PREFIX} archive order`,
        salePrice: 25,
        quantity: 2,
        unitPrice: 15,
        date: today(),
        movementNote: `${PREFIX} archive stock`,
      });
      assert.equal(responseCreate.status, 200);
      state.archivedItemId = Number(responseCreate.body.id);

      const archiveResponse = await adminClient.post(`/api/items/${state.archivedItemId}/archive`, {});
      assert.equal(archiveResponse.status, 200);

      const response = await customerClient.post("/api/orders", {
        date: today(),
        note: `${PREFIX} archived order try`,
        items: [{ itemId: state.archivedItemId, quantity: 1 }],
      });
      assert.equal(response.status, 400);
    });

    startSection("Masraf ve kasa");

    await check("Admin masraf ekleyebiliyor", async () => {
      const response = await adminClient.post("/api/expenses", {
        title: `${PREFIX} Nakliye`,
        category: `${PREFIX} Lojistik`,
        amount: 44.5,
        date: today(),
        paymentType: "Nakit",
        note: `${PREFIX} expense note`,
      });
      assert.equal(response.status, 200);
      const row = await get("SELECT id FROM expenses WHERE title = ? ORDER BY id DESC LIMIT 1", [`${PREFIX} Nakliye`]);
      state.createdExpenseId = Number(row.id);
    });

    await check("Personel masraf ekleyemiyor", async () => {
      const response = await staffClient.post("/api/expenses", {
        title: `${PREFIX} Illegal Expense`,
        category: `${PREFIX} Lojistik`,
        amount: 10,
        date: today(),
        paymentType: "Nakit",
      });
      assert.equal(response.status, 403);
    });

    await check("Masraf silme calisiyor", async () => {
      const response = await adminClient.delete(`/api/expenses/${state.createdExpenseId}`);
      assert.equal(response.status, 200);
      const row = await get("SELECT id FROM expenses WHERE id = ?", [state.createdExpenseId]);
      assert.equal(row, null);
    });

    await check("Kasa girisi calisiyor", async () => {
      const response = await staffClient.post("/api/cashbook", {
        type: "in",
        title: `${PREFIX} Kasa Girisi`,
        amount: 50,
        date: today(),
        reference: `${PREFIX} CASH-IN`,
        note: `${PREFIX} cash in`,
      });
      assert.equal(response.status, 200);
      const row = await get("SELECT id FROM cashbook WHERE title = ? ORDER BY id DESC LIMIT 1", [`${PREFIX} Kasa Girisi`]);
      state.createdCashIds.push(Number(row.id));
    });

    await check("Kasa cikisi calisiyor", async () => {
      const response = await staffClient.post("/api/cashbook", {
        type: "out",
        title: `${PREFIX} Kasa Cikisi`,
        amount: 15,
        date: today(),
        reference: `${PREFIX} CASH-OUT`,
        note: `${PREFIX} cash out`,
      });
      assert.equal(response.status, 200);
      const row = await get("SELECT id FROM cashbook WHERE title = ? ORDER BY id DESC LIMIT 1", [`${PREFIX} Kasa Cikisi`]);
      state.createdCashIds.push(Number(row.id));
    });

    await check("Kasa faturasiz satis modu calisiyor", async () => {
      const response = await staffClient.post("/api/cashbook", {
        type: "unbilled_sale",
        title: `${PREFIX} Faturasiz Kasa`,
        amount: 22,
        date: today(),
        reference: `${PREFIX} CASH-UNBILLED`,
        note: `${PREFIX} cash unbilled`,
      });
      assert.equal(response.status, 200);
      const row = await get("SELECT id, type FROM cashbook WHERE title = ? ORDER BY id DESC LIMIT 1", [`${PREFIX} Faturasiz Kasa`]);
      assert.equal(row.type, "in");
      state.createdCashIds.push(Number(row.id));
    });

    await check("Personel kasa defterini gorebiliyor", async () => {
      const response = await staffClient.get("/api/bootstrap");
      assert.equal(response.status, 200);
      const titles = (response.body.cashbook || []).map((entry) => String(entry.title || ""));
      assert.ok(titles.includes(`${PREFIX} Kasa Girisi`));
      assert.ok(titles.includes(`${PREFIX} Kasa Cikisi`));
      assert.ok(titles.includes(`${PREFIX} Faturasiz Kasa`));
    });

    await check("Musteri kasa kaydi acamiyor", async () => {
      const response = await customerClient.post("/api/cashbook", {
        type: "in",
        title: `${PREFIX} Illegal Cash`,
        amount: 10,
        date: today(),
      });
      assert.equal(response.status, 403);
    });

    await check("Musteri kasa kaydi silemiyor", async () => {
      const cashId = state.createdCashIds.shift();
      const response = await customerClient.delete(`/api/cashbook/${cashId}`);
      assert.equal(response.status, 403);
      state.createdCashIds.unshift(cashId);
    });

    await check("Kasa kaydi silme personel ile calisiyor", async () => {
      const cashId = state.createdCashIds.shift();
      const response = await staffClient.delete(`/api/cashbook/${cashId}`);
      assert.equal(response.status, 200);
      const row = await get("SELECT id FROM cashbook WHERE id = ?", [cashId]);
      assert.equal(row, null);
    });

    await check("Kasa kaydi silme admin ile calisiyor", async () => {
      const cashId = state.createdCashIds.shift();
      const response = await adminClient.delete(`/api/cashbook/${cashId}`);
      assert.equal(response.status, 200);
      const row = await get("SELECT id FROM cashbook WHERE id = ?", [cashId]);
      assert.equal(row, null);
    });

    startSection("Teklif, rapor ve satis");

    await check("Teklif olusturma calisiyor", async () => {
      assert.ok(state.intakeItemId, "Teklif icin test urunu yok.");
      const response = await staffClient.post("/api/quotes", {
        customerName: `${PREFIX} Musteri`,
        title: `${PREFIX} Teklif`,
        date: today(),
        discount: 5,
        note: `${PREFIX} quote note`,
        language: "tr",
        isExport: true,
        items: [
          {
            itemId: state.intakeItemId,
            itemName: `${PREFIX} Stoklu Kart`,
            quantity: 1,
            unit: "adet",
            unitPrice: 30,
          },
        ],
      });
      assert.equal(response.status, 200);
      state.quoteId = Number(response.body.id);
    });

    await check("Teklif PDF uretiliyor", async () => {
      const response = await staffClient.get(`/api/quotes/${state.quoteId}/pdf?lang=tr`, { expectBinary: true });
      assert.equal(response.status, 200);
      assert.ok(response.contentType.includes("application/pdf"));
      assert.ok(response.body.length > 500);
    });

    await check("Barkod PNG uretiliyor", async () => {
      assert.ok(state.intakeItemId, "Barkod icin test urunu yok.");
      const response = await staffClient.get(`/api/barcodes/${state.intakeItemId}`, { expectBinary: true });
      assert.equal(response.status, 200);
      assert.ok(response.contentType.includes("image/png"));
      assert.ok(response.body.length > 100);
    });

    await check("Excel raporu uretiliyor", async () => {
      const response = await adminClient.get("/api/reports/xlsx", { expectBinary: true });
      assert.equal(response.status, 200);
      assert.ok(response.contentType.includes("spreadsheetml"));
      assert.ok(response.body.length > 1000);
    });

    await check("PDF ozet rapor uretiliyor", async () => {
      const response = await adminClient.get("/api/reports/pdf", { expectBinary: true });
      assert.equal(response.status, 200);
      assert.ok(response.contentType.includes("application/pdf"));
      assert.ok(response.body.length > 500);
    });

    await check("Direkt satis checkout calisiyor", async () => {
      assert.ok(state.intakeItemId, "Direkt satis icin test urunu yok.");
      const response = await staffClient.post("/api/sales/checkout", {
        customerName: `${PREFIX} Direkt Satis Musteri`,
        title: `${PREFIX} Direkt Satis`,
        date: today(),
        discount: 0,
        note: `${PREFIX} checkout note`,
        language: "tr",
        isExport: true,
        paymentType: "Nakit",
        collectedAmount: 30,
        reference: `${PREFIX} SALE-1`,
        items: [
          {
            itemId: state.intakeItemId,
            itemName: `${PREFIX} Stoklu Kart`,
            quantity: 1,
            unit: "adet",
            unitPrice: 30,
          },
        ],
      });
      assert.equal(response.status, 200);
      state.saleQuoteId = Number(response.body.id);
      assert.equal(Number(response.body.remaining), 0);
    });

    await check("Direkt satis fazla stokta engelleniyor", async () => {
      assert.ok(state.intakeItemId, "Direkt satis icin test urunu yok.");
      const response = await staffClient.post("/api/sales/checkout", {
        customerName: `${PREFIX} Direkt Satis Fail`,
        title: `${PREFIX} Direkt Satis Fail`,
        date: today(),
        items: [
          {
            itemId: state.intakeItemId,
            itemName: `${PREFIX} Stoklu Kart`,
            quantity: 9999,
            unit: "adet",
            unitPrice: 30,
          },
        ],
      });
      assert.equal(response.status, 400);
    });

    await check("Faturasiz satis calisiyor", async () => {
      assert.ok(state.intakeItemId, "Faturasiz satis icin test urunu yok.");
      const response = await staffClient.post("/api/sales/unbilled-checkout", {
        customerName: `${PREFIX} Perakende`,
        title: `${PREFIX} Faturasiz`,
        date: today(),
        discount: 0,
        note: `${PREFIX} unbilled note`,
        paymentType: "Nakit",
        collectedAmount: 30,
        reference: `${PREFIX} UNBILLED-1`,
        items: [
          {
            itemId: state.intakeItemId,
            itemName: `${PREFIX} Stoklu Kart`,
            quantity: 1,
            unit: "adet",
            unitPrice: 30,
          },
        ],
      });
      assert.equal(response.status, 200);
      assert.equal(Number(response.body.total), 30);
      assert.equal(Number(response.body.remaining), 0);
      if (response.body.cashEntryId) {
        state.createdCashIds.push(Number(response.body.cashEntryId));
      }
    });

    startSection("Musteri siparis ve sifre");

    await check("Musteri stoklu urune siparis verebiliyor", async () => {
      assert.ok(state.intakeItemId, "Siparis icin test urunu yok.");
      const response = await customerClient.post("/api/orders", {
        date: today(),
        note: `${PREFIX} order note`,
        items: [{ itemId: state.intakeItemId, quantity: 1 }],
      });
      assert.equal(response.status, 200);
      state.orderId = Number(response.body.id);
    });

    await check("Musteri yetersiz stokta siparis veremiyor", async () => {
      assert.ok(state.intakeItemId, "Siparis icin test urunu yok.");
      const response = await customerClient.post("/api/orders", {
        date: today(),
        note: `${PREFIX} oversize order`,
        items: [{ itemId: state.intakeItemId, quantity: 9999 }],
      });
      assert.equal(response.status, 400);
    });

    await check("Musteri siparis durumunu degistiremiyor", async () => {
      assert.ok(state.orderId, "Siparis id bulunamadi.");
      const response = await customerClient.post(`/api/orders/${state.orderId}/status`, {
        status: "approved",
      });
      assert.equal(response.status, 403);
    });

    await check("Personel gecersiz siparis durumunu veremiyor", async () => {
      assert.ok(state.orderId, "Siparis id bulunamadi.");
      const response = await staffClient.post(`/api/orders/${state.orderId}/status`, {
        status: "wrong-status",
      });
      assert.equal(response.status, 400);
    });

    await check("Personel siparis durumunu guncelleyebiliyor", async () => {
      assert.ok(state.orderId, "Siparis id bulunamadi.");
      const response = await staffClient.post(`/api/orders/${state.orderId}/status`, {
        status: "approved",
      });
      assert.equal(response.status, 200);
      const row = await get("SELECT status FROM orders WHERE id = ?", [state.orderId]);
      assert.equal(row.status, "approved");
    });

    await check("Sifre sifirlama istegi token sızdirmadan donuyor", async () => {
      const response = await anonymousClient.post("/api/auth/forgot-password", {
        identifier: `${PREFIX.toLowerCase()}-customer@example.com`,
      });
      assert.equal(response.status, 200);
      assert.ok(!response.body.whatsappUrl);

      const missingResponse = await anonymousClient.post("/api/auth/forgot-password", {
        identifier: `${PREFIX.toLowerCase()}-missing@example.com`,
      });
      assert.equal(missingResponse.status, 200);
      assert.equal(response.body.message, missingResponse.body.message);
    });

    await check("Yeni sifre belirleme calisiyor", async () => {
      state.resetToken = await issueResetTokenForUser(state.registeredCustomerId);
      const response = await anonymousClient.post("/api/auth/reset-password", {
        token: state.resetToken,
        password: "Customer456!",
      });
      assert.equal(response.status, 200);
    });

    await check("Yeni sifre ile musteri tekrar giris yapabiliyor", async () => {
      const response = await customerClient.post("/api/login", {
        identifier: `${PREFIX.toLowerCase()}-customer@example.com`,
        password: "Customer456!",
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.user.role, "customer");
    });

    await check("Cikis sonrasi oturum kapaniyor", async () => {
      const responseLogout = await customerClient.post("/api/logout", {});
      assert.equal(responseLogout.status, 200);
      const responseMe = await customerClient.get("/api/me");
      assert.equal(responseMe.status, 200);
      assert.equal(responseMe.body.user, null);
    });
  } finally {
    await cleanupPrefix("LIVECHECK-");
  }

  const totalChecks = sections.reduce((sum, section) => sum + section.checks.length, 0);
  const passedChecks = sections.reduce((sum, section) => sum + section.checks.filter((checkItem) => checkItem.ok).length, 0);
  const failedChecks = totalChecks - passedChecks;

  console.log("\n=== CANLI TEST OZETI ===");
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Toplam kontrol: ${totalChecks}`);
  console.log(`Gecen: ${passedChecks}`);
  console.log(`Kalan/hata: ${failedChecks}`);

  for (const section of sections) {
    const sectionPassed = section.checks.filter((checkItem) => checkItem.ok).length;
    console.log(`\n[${section.title}] ${sectionPassed}/${section.checks.length}`);
    for (const checkItem of section.checks) {
      if (checkItem.ok) {
        console.log(`  PASS ${checkItem.name}`);
      } else {
        console.log(`  FAIL ${checkItem.name} -> ${checkItem.error}`);
      }
    }
  }

  process.exitCode = failures > 0 ? 1 : 0;
}

run().catch((error) => {
  console.error("Canli test kosusu basarisiz:", error);
  process.exit(1);
});
