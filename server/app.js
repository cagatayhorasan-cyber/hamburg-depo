const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");
const cookieSession = require("cookie-session");
const bcrypt = require("bcryptjs");
const bwipjs = require("bwip-js");
const PDFDocument = require("pdfkit");
const XLSX = require("xlsx");
const { dbPath, dbClient, initDatabase, query, get, execute, withTransaction } = require("./db");

const COMPANY_PROFILE = {
  name: "D-R-C Kältetechnik GmbH",
  manager: "Çağatay Horasan",
  address: "Schildkamp 1, 59063 Hamm, Deutschland",
  warehouse: "Lauenburger Landstraße 3b, 21039 Börnsen, Deutschland",
  phone: "+49 1522 1581762",
  email: "info@durmusbaba.com",
  email2: "info@durmusbaba.de",
  web: "www.durmusbaba.com",
  register: "HRB 11217 - Amtsgericht Hamm",
  bankName: "Bankverbindung auf Anfrage / Talep uzerine banka bilgisi",
  iban: "DE00 0000 0000 0000 0000 00",
  bic: "XXXXDEXX",
  beneficiary: "D-R-C Kältetechnik GmbH",
};

const PDF_FONTS = {
  regular: "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
  bold: "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
};

const SESSION_SECRET = process.env.SESSION_SECRET || "hamburg-depo-secret";
const IS_SECURE_PROXY = process.env.TRUST_PROXY === "1" || Boolean(process.env.VERCEL);
const QUOTES_DIR = process.env.QUOTES_DIR
  ? path.resolve(process.env.QUOTES_DIR)
  : path.join(os.homedir(), "Desktop", "Teklifler");
const SHOULD_PERSIST_QUOTES = !process.env.VERCEL && process.env.DISABLE_FILE_EXPORT !== "1";

function createApp() {
  const app = express();
  app.disable("x-powered-by");

  if (IS_SECURE_PROXY) {
    app.set("trust proxy", 1);
  }

  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store, max-age=0");
    next();
  });

  app.use(express.json());
  app.use(
    cookieSession({
      name: "hamburg_session",
      keys: [SESSION_SECRET],
      httpOnly: true,
      sameSite: "lax",
      secure: IS_SECURE_PROXY,
      maxAge: 1000 * 60 * 60 * 12,
      signed: true,
    })
  );

  app.use(express.static(path.join(__dirname, "..", "public")));

  app.get("/api/health", (_req, res) => {
    const dbTarget = dbClient === "postgres"
      ? "postgres"
      : path.basename(dbPath);
    res.json({ ok: true, dbClient, dbTarget });
  });

  app.post("/api/login", async (req, res) => {
    const { username, password } = req.body || {};
    const user = await get("SELECT * FROM users WHERE username = ?", [username]);

    if (!user || !bcrypt.compareSync(password || "", user.password_hash)) {
      return res.status(401).json({ error: "Kullanici adi veya sifre hatali." });
    }

    req.session.user = {
      id: Number(user.id),
      name: user.name,
      username: user.username,
      role: user.role,
    };

    return res.json({ user: req.session.user });
  });

  app.post("/api/logout", requireAuth, (req, res) => {
    req.session = null;
    res.json({ ok: true });
  });

  app.get("/api/me", (req, res) => {
    res.json({ user: req.session.user || null });
  });

  app.get("/api/bootstrap", requireAuth, async (_req, res) => {
    res.json(await buildBootstrap());
  });

  app.post("/api/assistant/query", requireAuth, async (req, res) => {
    const message = cleanOptional(req.body?.message);
    const language = req.body?.language === "de" ? "de" : "tr";
    if (!message) {
      return res.status(400).json({ error: "Soru bos olamaz." });
    }

    const items = await queryItems();
    const answer = answerAssistantQuestion(message, items, language);
    return res.json({
      answer: answer.reply,
      suggestions: answer.suggestions || [],
    });
  });

  app.post("/api/users", requireAdmin, async (req, res) => {
    const { name, username, password, role } = req.body || {};
    if (!name || !username || !password || !role) {
      return res.status(400).json({ error: "Tum kullanici alanlari zorunlu." });
    }

    try {
      const result = await execute(
        "INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?) RETURNING id",
        [name.trim(), username.trim(), bcrypt.hashSync(password, 10), role]
      );

      return res.json({
        id: Number(result.rows[0]?.id || result.lastInsertId),
        name,
        username,
        role,
      });
    } catch (_error) {
      return res.status(400).json({ error: "Kullanici olusturulamadi. Kullanici adi benzersiz olmali." });
    }
  });

  app.post("/api/items", requireAuth, async (req, res) => {
    const { name, brand, category, unit, minStock, barcode, notes, defaultPrice, salePrice } = req.body || {};
    if (!name || !category || !unit) {
      return res.status(400).json({ error: "Malzeme bilgileri eksik." });
    }

    try {
      const result = await execute(
        `
          INSERT INTO items (name, brand, category, unit, min_stock, barcode, notes, default_price, sale_price)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id
        `,
        [
          name.trim(),
          cleanOptional(brand),
          category.trim(),
          unit.trim(),
          Number(minStock || 0),
          cleanOptional(barcode) || null,
          cleanOptional(notes),
          Number(defaultPrice || 0),
          Number(salePrice || 0),
        ]
      );

      return res.json({ id: Number(result.rows[0]?.id || result.lastInsertId) });
    } catch (_error) {
      return res.status(400).json({ error: "Malzeme kaydi olusturulamadi. Barkod benzersiz olmali." });
    }
  });

  app.put("/api/items/:id", requireAuth, async (req, res) => {
    const { name, brand, category, unit, minStock, barcode, notes, defaultPrice, salePrice } = req.body || {};
    if (!name || !category || !unit) {
      return res.status(400).json({ error: "Malzeme bilgileri eksik." });
    }

    try {
      const result = await execute(
        `
          UPDATE items
          SET name = ?, brand = ?, category = ?, unit = ?, min_stock = ?, barcode = ?, notes = ?, default_price = ?, sale_price = ?
          WHERE id = ?
        `,
        [
          name.trim(),
          cleanOptional(brand),
          category.trim(),
          unit.trim(),
          Number(minStock || 0),
          cleanOptional(barcode) || null,
          cleanOptional(notes),
          Number(defaultPrice || 0),
          Number(salePrice || 0),
          Number(req.params.id),
        ]
      );

      if (!result.rowCount) {
        return res.status(404).json({ error: "Malzeme bulunamadi." });
      }

      return res.json({ ok: true });
    } catch (_error) {
      return res.status(400).json({ error: "Malzeme guncellenemedi. Barkod benzersiz olmali." });
    }
  });

  app.delete("/api/items/:id", requireAuth, async (req, res) => {
    const itemId = Number(req.params.id);
    const movementCount = Number((await get("SELECT COUNT(*) AS count FROM movements WHERE item_id = ?", [itemId]))?.count || 0);
    if (movementCount > 0) {
      return res.status(400).json({ error: "Hareketi olan malzeme silinemez. Once hareketleri duzenleyin." });
    }

    const quoteCount = Number((await get("SELECT COUNT(*) AS count FROM quote_items WHERE item_id = ?", [itemId]))?.count || 0);
    if (quoteCount > 0) {
      await execute("UPDATE quote_items SET item_id = NULL WHERE item_id = ?", [itemId]);
    }

    const result = await execute("DELETE FROM items WHERE id = ?", [itemId]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "Malzeme bulunamadi." });
    }

    return res.json({ ok: true });
  });

  app.post("/api/items/intake", requireAuth, async (req, res) => {
    const {
      name,
      brand,
      category,
      unit,
      minStock,
      barcode,
      notes,
      salePrice,
      quantity,
      unitPrice,
      date,
      movementNote,
    } = req.body || {};

    if (!name || !category || !unit || !quantity || !unitPrice || !date) {
      return res.status(400).json({ error: "Yeni urun ve stok girisi icin zorunlu alanlar eksik." });
    }

    const trimmedName = name.trim();
    const trimmedBrand = cleanOptional(brand);
    const quantityValue = Number(quantity);
    const unitPriceValue = Number(unitPrice);

    if (quantityValue <= 0 || unitPriceValue <= 0) {
      return res.status(400).json({ error: "Miktar ve birim alis sifirdan buyuk olmali." });
    }

    try {
      const itemId = await withTransaction(async (tx) => {
        const existingItem = await tx.get(
          `
            SELECT id, name, brand
            FROM items
            WHERE LOWER(name) = LOWER(?) AND LOWER(COALESCE(brand, '')) = LOWER(?)
            LIMIT 1
          `,
          [trimmedName, trimmedBrand]
        );

        if (existingItem) {
          throw new Error("Bu urun zaten mevcut. Mevcut kart icin ustteki stok giris formunu kullanin.");
        }

        const itemResult = await tx.execute(
          `
            INSERT INTO items (name, brand, category, unit, min_stock, barcode, notes, default_price, sale_price)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
          `,
          [
            trimmedName,
            trimmedBrand,
            category.trim(),
            unit.trim(),
            Number(minStock || 0),
            cleanOptional(barcode) || null,
            cleanOptional(notes),
            unitPriceValue,
            Number(salePrice || 0),
          ]
        );

        const insertedItemId = Number(itemResult.rows[0]?.id || itemResult.lastInsertId);

        await tx.execute(
          `
            INSERT INTO movements (item_id, type, quantity, unit_price, movement_date, note, user_id)
            VALUES (?, 'entry', ?, ?, ?, ?, ?)
          `,
          [
            insertedItemId,
            quantityValue,
            unitPriceValue,
            date,
            cleanOptional(movementNote),
            req.session.user.id,
          ]
        );

        return insertedItemId;
      });

      return res.json({ ok: true, id: itemId });
    } catch (error) {
      return res.status(400).json({ error: error.message || "Yeni urun kaydi olusturulamadi." });
    }
  });

  app.post("/api/movements", requireAuth, async (req, res) => {
    const { itemId, type, quantity, unitPrice, date, note } = req.body || {};
    if (!itemId || !type || !quantity || !unitPrice || !date) {
      return res.status(400).json({ error: "Stok hareketi icin tum alanlar gereklidir." });
    }

    const item = await get("SELECT * FROM items WHERE id = ?", [itemId]);
    if (!item) {
      return res.status(404).json({ error: "Malzeme bulunamadi." });
    }

    const stock = await getItemStock(itemId);
    if (type === "exit" && Number(quantity) > stock) {
      return res.status(400).json({ error: "Cikis miktari mevcut stogu gecemez." });
    }

    await execute(
      `
        INSERT INTO movements (item_id, type, quantity, unit_price, movement_date, note, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [itemId, type, Number(quantity), Number(unitPrice), date, cleanOptional(note), req.session.user.id]
    );

    return res.json({ ok: true });
  });

  app.post("/api/movements/:id/reverse", requireAuth, async (req, res) => {
    const movementId = Number(req.params.id);
    const movement = await get("SELECT * FROM movements WHERE id = ?", [movementId]);
    if (!movement) {
      return res.status(404).json({ error: "Hareket bulunamadi." });
    }
    if (movement.reversal_of) {
      return res.status(400).json({ error: "Iptal kaydi tekrar iptal edilemez." });
    }

    const existingReverse = await get("SELECT id FROM movements WHERE reversal_of = ?", [movementId]);
    if (existingReverse) {
      return res.status(400).json({ error: "Bu hareket zaten iptal edilmis." });
    }

    const reverseType = movement.type === "entry" ? "exit" : "entry";

    try {
      await withTransaction(async (tx) => {
        if (reverseType === "exit") {
          const stock = await getItemStock(Number(movement.item_id), tx);
          if (Number(movement.quantity) > stock) {
            throw new Error("Bu giris hareketi simdi iptal edilemez. Once bagli cikis hareketlerini duzenleyin.");
          }
        }

        await tx.execute(
          `
            INSERT INTO movements (item_id, type, quantity, unit_price, movement_date, note, reversal_of, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            Number(movement.item_id),
            reverseType,
            Number(movement.quantity),
            Number(movement.unit_price),
            new Date().toISOString().split("T")[0],
            `Iptal kaydi #${movementId}${cleanOptional(movement.note) ? ` - ${cleanOptional(movement.note)}` : ""}`,
            movementId,
            req.session.user.id,
          ]
        );
      });

      return res.json({ ok: true });
    } catch (error) {
      return res.status(400).json({ error: error.message || "Hareket iptal edilemedi." });
    }
  });

  app.post("/api/expenses", requireAuth, async (req, res) => {
    const { title, category, amount, date, paymentType, note } = req.body || {};
    if (!title || !category || !amount || !date || !paymentType) {
      return res.status(400).json({ error: "Masraf bilgileri eksik." });
    }

    await execute(
      `
        INSERT INTO expenses (title, category, amount, expense_date, payment_type, note, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [title.trim(), category.trim(), Number(amount), date, paymentType, cleanOptional(note), req.session.user.id]
    );

    return res.json({ ok: true });
  });

  app.delete("/api/expenses/:id", requireAuth, async (req, res) => {
    const result = await execute("DELETE FROM expenses WHERE id = ?", [Number(req.params.id)]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "Masraf bulunamadi." });
    }
    return res.json({ ok: true });
  });

  app.post("/api/cashbook", requireAuth, async (req, res) => {
    const { type, title, amount, date, reference, note } = req.body || {};
    if (!type || !title || !amount || !date) {
      return res.status(400).json({ error: "Kasa hareketi bilgileri eksik." });
    }

    await execute(
      `
        INSERT INTO cashbook (type, title, amount, cash_date, reference, note, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [type, title.trim(), Number(amount), date, cleanOptional(reference), cleanOptional(note), req.session.user.id]
    );

    return res.json({ ok: true });
  });

  app.delete("/api/cashbook/:id", requireAuth, async (req, res) => {
    const result = await execute("DELETE FROM cashbook WHERE id = ?", [Number(req.params.id)]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "Kasa hareketi bulunamadi." });
    }
    return res.json({ ok: true });
  });

  app.post("/api/pricing/bulk", requireAuth, async (req, res) => {
    const { brand, category, increasePercent, pricingMode, baseField } = req.body || {};
    const multiplier = 1 + Number(increasePercent || 0) / 100;
    const clauses = [];
    const params = [multiplier];

    if (brand && brand !== "all") {
      clauses.push("brand = ?");
      params.push(brand);
    }
    if (category && category !== "all") {
      clauses.push("category = ?");
      params.push(category);
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const sourceField = baseField === "sale" ? "sale_price" : "default_price";
    const expression = pricingMode === "increase"
      ? `ROUND(COALESCE(NULLIF(sale_price, 0), ${sourceField}) * ?, 2)`
      : `ROUND(${sourceField} * ?, 2)`;
    const result = await execute(
      `
        UPDATE items
        SET sale_price = ${expression}
        ${whereClause}
      `,
      params
    );

    return res.json({ ok: true, updated: result.rowCount });
  });

  app.post("/api/items/:id/archive", requireAuth, async (req, res) => {
    const result = await execute("UPDATE items SET is_active = ? WHERE id = ?", [dbClient === "postgres" ? false : 0, Number(req.params.id)]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "Malzeme bulunamadi." });
    }
    return res.json({ ok: true });
  });

  app.post("/api/items/:id/restore", requireAuth, async (req, res) => {
    const result = await execute("UPDATE items SET is_active = ? WHERE id = ?", [dbClient === "postgres" ? true : 1, Number(req.params.id)]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "Malzeme bulunamadi." });
    }
    return res.json({ ok: true });
  });

  app.post("/api/quotes", requireAuth, async (req, res) => {
    const { customerName, title, date, discount, note, items, language, isExport } = req.body || {};
    if (!customerName || !title || !date || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Teklif bilgileri eksik." });
    }

    const subtotal = items.reduce((sum, entry) => sum + Number(entry.quantity) * Number(entry.unitPrice), 0);
    const netTotal = Math.max(subtotal - Number(discount || 0), 0);
    const exportSale = isTruthy(isExport);
    const vatRate = exportSale ? 0 : 19;
    const vatAmount = Number((netTotal * (vatRate / 100)).toFixed(2));
    const grossTotal = Number((netTotal + vatAmount).toFixed(2));
    const quoteNo = await generateQuoteNo(date);

    try {
      const quoteId = await withTransaction(async (tx) => {
        const quoteResult = await tx.execute(
          `
            INSERT INTO quotes (
              customer_name, title, quote_date, discount, subtotal, total, note, user_id, language,
              quote_no, vat_rate, vat_amount, net_total, gross_total, is_export
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
          `,
          [
            customerName.trim(),
            title.trim(),
            date,
            Number(discount || 0),
            subtotal,
            grossTotal,
            cleanOptional(note),
            req.session.user.id,
            language === "tr" ? "tr" : "de",
            quoteNo,
            vatRate,
            vatAmount,
            netTotal,
            grossTotal,
            exportSale ? 1 : 0,
          ]
        );

        const insertedQuoteId = Number(quoteResult.rows[0]?.id || quoteResult.lastInsertId);
        for (const entry of items) {
          await tx.execute(
            `
              INSERT INTO quote_items (quote_id, item_id, item_name, quantity, unit, unit_price, total)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [
              insertedQuoteId,
              entry.itemId ? Number(entry.itemId) : null,
              entry.itemName,
              Number(entry.quantity),
              entry.unit || "adet",
              Number(entry.unitPrice),
              Number(entry.quantity) * Number(entry.unitPrice),
            ]
          );
        }
        return insertedQuoteId;
      });

      return res.json({ ok: true, id: quoteId });
    } catch (_error) {
      return res.status(400).json({ error: "Teklif olusturulamadi." });
    }
  });

  app.post("/api/sales/checkout", requireAuth, async (req, res) => {
    const { customerName, title, date, discount, note, items, language, isExport, paymentType, collectedAmount, reference } = req.body || {};
    if (!customerName || !date || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Direkt satis bilgileri eksik." });
    }

    const subtotal = items.reduce((sum, entry) => sum + Number(entry.quantity) * Number(entry.unitPrice), 0);
    const netTotal = Math.max(subtotal - Number(discount || 0), 0);
    const exportSale = isTruthy(isExport);
    const vatRate = exportSale ? 0 : 19;
    const vatAmount = Number((netTotal * (vatRate / 100)).toFixed(2));
    const grossTotal = Number((netTotal + vatAmount).toFixed(2));
    const paid = Math.max(Number(collectedAmount || 0), 0);
    const quoteNo = await generateQuoteNo(date);

    try {
      const saleResult = await withTransaction(async (tx) => {
        for (const entry of items) {
          const itemId = Number(entry.itemId);
          const item = await tx.get("SELECT * FROM items WHERE id = ?", [itemId]);
          if (!item) {
            throw new Error("Malzeme bulunamadi.");
          }
          const stock = await getItemStock(itemId);
          if (Number(entry.quantity) > stock) {
            throw new Error(`${entry.itemName} icin yeterli stok yok.`);
          }
        }

        const quoteResult = await tx.execute(
          `
            INSERT INTO quotes (
              customer_name, title, quote_date, discount, subtotal, total, note, user_id, language,
              quote_no, vat_rate, vat_amount, net_total, gross_total, is_export
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
          `,
          [
            customerName.trim(),
            cleanOptional(title) || "Direkt Satis",
            date,
            Number(discount || 0),
            subtotal,
            grossTotal,
            cleanOptional(note),
            req.session.user.id,
            language === "tr" ? "tr" : "de",
            quoteNo,
            vatRate,
            vatAmount,
            netTotal,
            grossTotal,
            exportSale ? 1 : 0,
          ]
        );

        const insertedQuoteId = Number(quoteResult.rows[0]?.id || quoteResult.lastInsertId);
        for (const entry of items) {
          await tx.execute(
            `
              INSERT INTO quote_items (quote_id, item_id, item_name, quantity, unit, unit_price, total)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [
              insertedQuoteId,
              Number(entry.itemId),
              entry.itemName,
              Number(entry.quantity),
              entry.unit || "adet",
              Number(entry.unitPrice),
              Number(entry.quantity) * Number(entry.unitPrice),
            ]
          );

          await tx.execute(
            `
              INSERT INTO movements (item_id, type, quantity, unit_price, movement_date, note, user_id)
              VALUES (?, 'exit', ?, ?, ?, ?, ?)
            `,
            [
              Number(entry.itemId),
              Number(entry.quantity),
              Number(entry.unitPrice),
              date,
              `Direkt satis - ${customerName}`,
              req.session.user.id,
            ]
          );
        }

        if (paid > 0) {
          await tx.execute(
            `
              INSERT INTO cashbook (type, title, amount, cash_date, reference, note, user_id)
              VALUES ('in', ?, ?, ?, ?, ?, ?)
            `,
            [
              `Direkt satis tahsilati - ${customerName}`,
              paid,
              date,
              cleanOptional(reference),
              `${cleanOptional(paymentType) || "cash"} | ${quoteNo}`,
              req.session.user.id,
            ]
          );
        }

        return { id: insertedQuoteId, paid };
      });

      return res.json({ ok: true, id: saleResult.id, paid: saleResult.paid, remaining: Number((grossTotal - paid).toFixed(2)) });
    } catch (error) {
      return res.status(400).json({ error: error.message || "Direkt satis olusturulamadi." });
    }
  });

  app.get("/api/quotes/:id/pdf", requireAuth, async (req, res) => {
    const quote = await getQuoteById(Number(req.params.id));
    if (!quote) {
      return res.status(404).json({ error: "Teklif bulunamadi." });
    }

    const lang = req.query.lang === "tr" ? "tr" : quote.language || "de";
    const filename = `${sanitizeFileName(quote.quoteNo || `DRC-${quote.id}`)}-${lang}.pdf`;

    try {
      const buffer = await createQuotePdfBuffer(quote, lang);
      if (SHOULD_PERSIST_QUOTES) {
        fs.mkdirSync(QUOTES_DIR, { recursive: true });
        fs.writeFileSync(path.join(QUOTES_DIR, filename), buffer);
      }
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.type("application/pdf").send(buffer);
    } catch (_error) {
      return res.status(500).json({ error: "PDF olusturulamadi." });
    }
  });

  app.get("/api/barcodes/:itemId", requireAuth, async (req, res) => {
    const item = await get("SELECT * FROM items WHERE id = ?", [req.params.itemId]);
    if (!item) {
      return res.status(404).json({ error: "Malzeme bulunamadi." });
    }

    const value = item.barcode || `ITEM-${String(item.id).padStart(5, "0")}`;
    bwipjs
      .toBuffer({
        bcid: "code128",
        text: value,
        scale: 3,
        height: 10,
        includetext: true,
        textxalign: "center",
      })
      .then((png) => {
        res.type("image/png").send(png);
      })
      .catch(() => {
        res.status(500).json({ error: "Barkod olusturulamadi." });
      });
  });

  app.get("/api/reports/xlsx", requireAuth, async (_req, res) => {
    const bootstrap = await buildBootstrap();
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(bootstrap.items), "Malzemeler");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(bootstrap.movements), "Hareketler");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(bootstrap.expenses), "Masraflar");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(bootstrap.cashbook), "Kasa");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", 'attachment; filename="hamburg-depo-rapor.xlsx"');
    res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").send(buffer);
  });

  app.get("/api/reports/pdf", requireAuth, async (_req, res) => {
    const summary = await computeSummary();
    const items = await queryItems();
    const doc = new PDFDocument({ margin: 40, size: "A4" });

    res.setHeader("Content-Disposition", 'attachment; filename="hamburg-depo-ozet.pdf"');
    res.type("application/pdf");
    doc.pipe(res);

    doc.fontSize(20).text("Hamburg Depo Ozet Raporu");
    doc.moveDown();
    doc.fontSize(11).text(`Toplam malzeme: ${summary.totalItems}`);
    doc.text(`Stok degeri: ${summary.stockValue.toFixed(2)} EUR`);
    doc.text(`Kritik urun: ${summary.criticalCount}`);
    doc.text(`Toplam masraf: ${summary.expenseTotal.toFixed(2)} EUR`);
    doc.text(`Kasa bakiyesi: ${summary.cashBalance.toFixed(2)} EUR`);
    doc.moveDown();
    doc.fontSize(14).text("Stok Durumu");
    doc.moveDown(0.5);

    items.slice(0, 20).forEach((item) => {
      doc.fontSize(10).text(`${item.name} | ${item.category} | ${item.currentStock} ${item.unit} | Kritik: ${item.minStock} ${item.unit}`);
    });

    doc.end();
  });

  app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
  });

  return app;
}

async function startServer(port = process.env.PORT || 3000, host = process.env.HOST || "0.0.0.0") {
  await initDatabase();
  const app = createApp();
  return app.listen(port, host, () => {
    console.log(`Hamburg depo sunucusu calisiyor: http://${host}:${port}`);
  });
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Oturum acmaniz gerekiyor." });
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Oturum acmaniz gerekiyor." });
  }
  if (req.session.user.role !== "admin") {
    return res.status(403).json({ error: "Bu islem icin admin yetkisi gerekiyor." });
  }
  return next();
}

function cleanOptional(value) {
  return value ? String(value).trim() : "";
}

async function getItemStock(itemId, executor = null) {
  const getter = executor?.get ? executor.get.bind(executor) : get;
  const row = await getter(
    `
      SELECT COALESCE(SUM(CASE WHEN type = 'entry' THEN quantity ELSE -quantity END), 0) AS stock
      FROM movements
      WHERE item_id = ?
    `,
    [itemId]
  );

  return Number(row?.stock || 0);
}

async function queryItems(isActive = true) {
  const rows = await query(
    `
      SELECT
        items.*,
        COALESCE((
          SELECT SUM(CASE WHEN type = 'entry' THEN quantity ELSE -quantity END)
          FROM movements
          WHERE item_id = items.id
        ), 0) AS current_stock,
        COALESCE((
          SELECT unit_price
          FROM movements
          WHERE item_id = items.id AND type = 'entry'
          ORDER BY movement_date DESC, id DESC
          LIMIT 1
        ), 0) AS last_purchase_price,
        COALESCE((
          SELECT SUM(quantity * unit_price) / NULLIF(SUM(quantity), 0)
          FROM movements
          WHERE item_id = items.id AND type = 'entry'
        ), 0) AS average_purchase_price
      FROM items
      WHERE COALESCE(items.is_active, TRUE) = ?
      ORDER BY created_at DESC, id DESC
    `,
    [isActive]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    brand: row.brand || deriveBrand(row),
    category: row.category,
    unit: row.unit,
    minStock: Number(row.min_stock || 0),
    barcode: row.barcode || `ITEM-${String(row.id).padStart(5, "0")}`,
    notes: row.notes,
    currentStock: Number(row.current_stock || 0),
    defaultPrice: Number(row.default_price || 0),
    salePrice: Number(row.sale_price || 0),
    lastPurchasePrice: Number(row.last_purchase_price || 0),
    averagePurchasePrice: Number(row.average_purchase_price || 0),
  }));
}

async function queryMovements() {
  const rows = await query(
    `
      SELECT
        movements.id,
        movements.type,
        movements.quantity,
        movements.unit_price AS "unitPrice",
        movements.movement_date AS date,
        movements.note,
        movements.reversal_of AS "reversalOf",
        movements.created_at AS "createdAt",
        items.name AS "itemName",
        users.name AS "userName",
        reverse_entry.id AS "reversedById"
      FROM movements
      JOIN items ON items.id = movements.item_id
      LEFT JOIN users ON users.id = movements.user_id
      LEFT JOIN movements reverse_entry ON reverse_entry.reversal_of = movements.id
      ORDER BY movements.created_at DESC, movements.id DESC
    `
  );

  return rows.map(numberizeRow);
}

async function queryExpenses() {
  const rows = await query(
    `
      SELECT
        expenses.id,
        expenses.title,
        expenses.category,
        expenses.amount,
        expenses.expense_date AS date,
        expenses.payment_type AS "paymentType",
        expenses.note,
        expenses.created_at AS "createdAt",
        users.name AS "userName"
      FROM expenses
      LEFT JOIN users ON users.id = expenses.user_id
      ORDER BY expenses.created_at DESC, expenses.id DESC
    `
  );

  return rows.map(numberizeRow);
}

async function queryCashbook() {
  const rows = await query(
    `
      SELECT
        cashbook.id,
        cashbook.type,
        cashbook.title,
        cashbook.amount,
        cashbook.cash_date AS date,
        cashbook.reference,
        cashbook.note,
        cashbook.created_at AS "createdAt",
        users.name AS "userName"
      FROM cashbook
      LEFT JOIN users ON users.id = cashbook.user_id
      ORDER BY cashbook.created_at DESC, cashbook.id DESC
    `
  );

  return rows.map(numberizeRow);
}

async function queryUsers() {
  const rows = await query("SELECT id, name, username, role FROM users ORDER BY id ASC");
  return rows.map((row) => ({ ...row, id: Number(row.id) }));
}

async function computeSummary() {
  const [items, expenses, cashbook] = await Promise.all([queryItems(), queryExpenses(), queryCashbook()]);
  const stockValue = items.reduce((sum, item) => sum + Number(item.currentStock) * Number(item.lastPurchasePrice || item.defaultPrice || 0), 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const cashBalance = cashbook.reduce((sum, entry) => sum + (entry.type === "in" ? Number(entry.amount) : -Number(entry.amount)), 0);

  return {
    totalItems: items.length,
    stockValue,
    criticalCount: items.filter((item) => Number(item.currentStock) <= Number(item.minStock)).length,
    expenseTotal,
    cashBalance,
  };
}

async function buildBootstrap() {
  const [summary, items, archivedItems, movements, expenses, cashbook, users, quotes] = await Promise.all([
    computeSummary(),
    queryItems(),
    queryItems(false),
    queryMovements(),
    queryExpenses(),
    queryCashbook(),
    queryUsers(),
    queryQuotes(),
  ]);

  return {
    summary,
    items,
    archivedItems,
    movements,
    expenses,
    cashbook,
    users,
    quotes,
  };
}

function deriveBrand(row) {
  if (row.brand) {
    return row.brand;
  }

  const note = String(row.notes || "");
  const prefix = "Gelen fatura tedarikcisi:";
  if (note.startsWith(prefix)) {
    return note.slice(prefix.length).trim();
  }

  return "";
}

function answerAssistantQuestion(message, items, language = "tr") {
  const normalized = normalizeAssistantText(message);
  const t = createAssistantDictionary(language);
  const candidates = findAssistantCandidates(normalized, items);

  if (/(kritik|az stok|stok dusuk|minimum|kritisch|wenig bestand|mindestbestand)/.test(normalized)) {
    const critical = items.filter((item) => Number(item.currentStock) <= Number(item.minStock)).slice(0, 8);
    if (!critical.length) {
      return { reply: t.noCritical, suggestions: [] };
    }
    return {
      reply: `${t.criticalList}: ${critical.map((item) => `${item.name} (${item.currentStock} ${item.unit})`).join(", ")}`,
      suggestions: critical.slice(0, 4).map((item) => item.name),
    };
  }

  if (/(en pahali|en yuksek fiyat|en yuksek satis|teuerste|hochste preis|verkaufspreis)/.test(normalized)) {
    const sorted = [...items].sort((a, b) => Number(b.salePrice || b.defaultPrice || 0) - Number(a.salePrice || a.defaultPrice || 0)).slice(0, 5);
    return {
      reply: `${t.expensiveList}: ${sorted.map((item) => `${item.name} (${formatEur(item.salePrice || item.defaultPrice)})`).join(", ")}`,
      suggestions: sorted.map((item) => item.name),
    };
  }

  if (/(kategori|sinif|grup|kategorie|gruppe)/.test(normalized) && candidates[0]) {
    const item = candidates[0];
    return {
      reply: language === "de"
        ? `${item.name} ist in der Kategorie ${item.category}. Marke: ${item.brand || "-"}.`
        : `${item.name} urunu ${item.category} kategorisinde. Marka: ${item.brand || "-"}.`,
      suggestions: [`${item.name} ${t.priceWord}`, `${item.name} ${t.stockWord}`],
    };
  }

  if (/(stok kodu|kodu|kodu nedir|barkod|artikelcode|lagernummer|code)/.test(normalized) && candidates[0]) {
    const item = candidates[0];
    return {
      reply: language === "de"
        ? `Der Lagercode fuer ${item.name} ist ${item.barcode}.`
        : `${item.name} icin stok kodu: ${item.barcode}.`,
      suggestions: [`${item.name} ${t.priceWord}`, `${item.name} ${t.stockWord}`],
    };
  }

  if (/(stok|kac adet|mevcut|bestand|wie viel|verfugbar)/.test(normalized) && candidates[0]) {
    const item = candidates[0];
    return {
      reply: language === "de"
        ? `${item.name} hat aktuell ${item.currentStock} ${item.unit} auf Lager. Kritischer Bestand: ${item.minStock} ${item.unit}.`
        : `${item.name} stokta ${item.currentStock} ${item.unit} gorunuyor. Kritik seviye ${item.minStock} ${item.unit}.`,
      suggestions: [`${item.name} ${t.priceWord}`, `${item.name} ${t.categoryWord}`],
    };
  }

  if (/(fiyat|satis|alis|ucret|preis|verkauf|einkauf)/.test(normalized) && candidates[0]) {
    const item = candidates[0];
    return {
      reply: language === "de"
        ? `Fuer ${item.name} betraegt der Einkauf ${formatEur(item.defaultPrice || item.lastPurchasePrice)} und der Verkauf ${formatEur(item.salePrice || item.defaultPrice)}.`
        : `${item.name} icin alis ${formatEur(item.defaultPrice || item.lastPurchasePrice)} ve satis ${formatEur(item.salePrice || item.defaultPrice)}.`,
      suggestions: [`${item.name} ${t.stockWord}`, `${item.name} ${t.categoryWord}`],
    };
  }

  if (candidates.length > 0) {
    const top = candidates.slice(0, 5);
    return {
      reply: `${t.matchList}: ${top.map((item) => `${item.name} (${formatEur(item.salePrice || item.defaultPrice)})`).join(", ")}`,
      suggestions: top.map((item) => `${item.name} ${t.priceWord}`).slice(0, 3),
    };
  }

  if (/(nasil teklif|teklif|satis yap|direkt satis|tahsilat|angebot|verkauf|direktverkauf|zahlung)/.test(normalized)) {
    return {
      reply: t.salesHelp,
      suggestions: t.defaultSuggestions,
    };
  }

  return {
    reply: t.help,
    suggestions: t.defaultSuggestions,
  };
}

function createAssistantDictionary(language) {
  if (language === "de") {
    return {
      noCritical: "Es gibt keine kritischen Artikel im Bestand.",
      criticalList: "Kritische Artikel",
      expensiveList: "Artikel mit dem hoechsten Preis",
      matchList: "Diese Artikel passen dazu",
      salesHelp: "Im Tab Schnellverkauf koennen Sie links Produkte in den Warenkorb legen. Rechts geben Sie Kundendaten, bezahlten Betrag und Referenz ein und nutzen Direktverkauf oder Angebot speichern.",
      help: "Sie koennen nach Preis, Bestand, Lagercode, Kategorie, kritischen Artikeln oder den teuersten Artikeln fragen.",
      defaultSuggestions: ["kritischer bestand", "teuerste artikel", "GNA 1.500-1 preis"],
      priceWord: "preis",
      stockWord: "bestand",
      categoryWord: "kategorie",
    };
  }

  return {
    noCritical: "Kritik stokta urun yok.",
    criticalList: "Kritik stoktaki urunler",
    expensiveList: "En yuksek fiyatli urunler",
    matchList: "Su urunler eslesti",
    salesHelp: "Hizli Satis sekmesinde soldan urunleri sepete ekleyin. Saga musteri bilgisi, tahsil edilen tutar ve referansi yazip Direkt Satis Yap veya Teklifi Kaydet kullanin.",
    help: "Sunu sorabilirsiniz: urun fiyati, stok durumu, stok kodu, kategori, kritik stoktaki urunler veya en pahali urunler.",
    defaultSuggestions: ["kritik stok", "en pahali urun", "GNA 1.500-1 fiyat"],
    priceWord: "fiyat",
    stockWord: "stok",
    categoryWord: "kategori",
  };
}

function findAssistantCandidates(normalizedMessage, items) {
  const queryText = extractAssistantQuery(normalizedMessage);
  const queryTokens = queryText.split(" ").filter((token) => token.length > 1);

  const scored = items
    .map((item) => {
      const name = normalizeAssistantText(item.name);
      const brand = normalizeAssistantText(item.brand);
      const category = normalizeAssistantText(item.category);
      const barcode = normalizeAssistantText(item.barcode);
      const notes = normalizeAssistantText(item.notes);
      const haystack = [name, brand, category, barcode, notes].filter(Boolean).join(" ");
      const nameTokens = tokenizeAssistantText(name);
      const brandTokens = tokenizeAssistantText(brand);
      const barcodeTokens = tokenizeAssistantText(barcode);

      let score = 0;

      if (barcode && queryText && barcode === queryText) {
        score += 100;
      }
      if (name && queryText && name.startsWith(queryText)) {
        score += 90;
      }
      if (barcode && queryTokens.some((token) => token === barcode || barcode.includes(token) || token.includes(barcode))) {
        score += 60;
      }
      if (name && queryText && name.includes(queryText)) {
        score += 50;
      }
      if (brand && queryText && brand.includes(queryText)) {
        score += 24;
      }

      queryTokens.forEach((token) => {
        if (nameTokens.includes(token)) {
          score += token.length >= 4 ? 42 : 24;
        } else if (barcodeTokens.includes(token)) {
          score += 38;
        } else if (brandTokens.includes(token)) {
          score += 18;
        } else if (name.includes(token)) {
          score += token.length >= 5 ? 18 : 10;
        } else if (category.includes(token) || notes.includes(token)) {
          score += 4;
        } else if (haystack.includes(token)) {
          score += 2;
        }
      });

      const strongTokenMatches = queryTokens.filter((token) => token.length >= 3 && (nameTokens.includes(token) || barcodeTokens.includes(token)));
      if (strongTokenMatches.length >= Math.min(2, queryTokens.filter((token) => token.length >= 3).length)) {
        score += 55;
      }

      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, "tr"));

  return scored.slice(0, 8).map((entry) => entry.item);
}

function extractAssistantQuery(normalizedMessage) {
  return normalizedMessage
    .replace(
      /\b(kritik|az|stok|dusuk|minimum|en|pahali|yuksek|fiyat|satis|alis|ucret|kategori|sinif|grup|kodu|nedir|barkod|kac|adet|mevcut|nasil|teklif|yap|direkt|tahsilat|kritisch|wenig|bestand|mindestbestand|teuerste|hochste|preis|verkauf|einkauf|kategorie|gruppe|artikelcode|lagernummer|code|wie|viel|verfugbar|angebot|direktverkauf|zahlung)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeAssistantText(value) {
  return String(value || "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

function normalizeAssistantText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9/.-]+/g, " ")
    .trim();
}

function formatEur(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

async function queryQuotes() {
  const quotes = await query(
    `
      SELECT
        quotes.id,
        quotes.customer_name AS "customerName",
        quotes.title,
        quotes.quote_date AS date,
        quotes.language,
        quotes.quote_no AS "quoteNo",
        quotes.discount,
        quotes.subtotal,
        quotes.vat_rate AS "vatRate",
        quotes.vat_amount AS "vatAmount",
        quotes.net_total AS "netTotal",
        quotes.gross_total AS "grossTotal",
        quotes.total,
        quotes.is_export AS "isExport",
        quotes.note,
        quotes.created_at AS "createdAt",
        users.name AS "userName"
      FROM quotes
      LEFT JOIN users ON users.id = quotes.user_id
      ORDER BY quotes.created_at DESC, quotes.id DESC
      LIMIT 20
    `
  );

  const result = [];
  for (const quote of quotes) {
    const items = await query(
      `
        SELECT item_name AS "itemName", quantity, unit, unit_price AS "unitPrice", total
        FROM quote_items
        WHERE quote_id = ?
        ORDER BY id ASC
      `,
      [quote.id]
    );
    result.push({
      ...numberizeRow(quote),
      items: items.map(numberizeRow),
    });
  }
  return result;
}

async function getQuoteById(id) {
  const quote = await get(
    `
      SELECT
        quotes.id,
        quotes.customer_name AS "customerName",
        quotes.title,
        quotes.quote_date AS date,
        quotes.language,
        quotes.quote_no AS "quoteNo",
        quotes.discount,
        quotes.subtotal,
        quotes.vat_rate AS "vatRate",
        quotes.vat_amount AS "vatAmount",
        quotes.net_total AS "netTotal",
        quotes.gross_total AS "grossTotal",
        quotes.total,
        quotes.is_export AS "isExport",
        quotes.note,
        users.name AS "userName"
      FROM quotes
      LEFT JOIN users ON users.id = quotes.user_id
      WHERE quotes.id = ?
    `,
    [id]
  );

  if (!quote) {
    return null;
  }

  const items = await query(
    `
      SELECT item_name AS "itemName", quantity, unit, unit_price AS "unitPrice", total
      FROM quote_items
      WHERE quote_id = ?
      ORDER BY id ASC
    `,
    [id]
  );

  return {
    ...numberizeRow(quote),
    items: items.map(numberizeRow),
  };
}

async function generateQuoteNo(dateString) {
  const year = String(dateString || new Date().toISOString().slice(0, 10)).slice(0, 4);
  const row = await get(
    `
      SELECT COUNT(*) AS count
      FROM quotes
      WHERE substr(CAST(quote_date AS TEXT), 1, 4) = ?
    `,
    [year]
  );

  return `DRC-${year}-${String(Number(row?.count || 0) + 1).padStart(4, "0")}`;
}

function numberizeRow(row) {
  const output = { ...row };
  ["id", "quantity", "unitPrice", "total", "discount", "subtotal", "vatRate", "vatAmount", "netTotal", "grossTotal", "amount"].forEach(
    (key) => {
      if (output[key] !== undefined && output[key] !== null && output[key] !== "") {
        output[key] = Number(output[key]);
      }
    }
  );
  if (output.isExport !== undefined) {
    output.isExport = output.isExport === true || output.isExport === 1 || output.isExport === "1" || output.isExport === "t";
  }
  return output;
}

function renderQuotePdf(doc, quote, lang) {
  const t = getQuoteTranslations(lang);
  const currency = new Intl.NumberFormat(lang === "tr" ? "tr-TR" : "de-DE", {
    style: "currency",
    currency: "EUR",
  });
  const formattedDate = formatQuoteDate(quote.date, lang);
  const totalsTop = Math.min(680, Math.max(470, 448 + quote.items.length * 28));
  const footerTop = totalsTop + 134;

  configurePdfFonts(doc);

  doc.rect(0, 0, doc.page.width, 158).fill("#0f766e");
  doc.fillColor("#ffffff");
  doc.roundedRect(42, 34, 68, 68, 16).fill("#ffffff");
  doc.fillColor("#0f766e").font("AppBold").fontSize(28).text("DRC", 54, 56);
  doc.fillColor("#ffffff").font("AppBold").fontSize(24).text(COMPANY_PROFILE.name, 126, 34);
  doc.font("AppRegular").fontSize(11).text(t.logoSubline, 126, 64);
  doc.fontSize(10).text(`${t.headOffice}: ${COMPANY_PROFILE.address}`, 126, 92);
  doc.text(`${t.warehouse}: ${COMPANY_PROFILE.warehouse}`, 126, 108);
  doc.text(`${COMPANY_PROFILE.phone}  |  ${COMPANY_PROFILE.email}  |  ${COMPANY_PROFILE.web}`, 126, 124);

  doc.fillColor("#153243");
  doc.roundedRect(42, 165, 240, 116, 12).fill("#f1f5f9");
  doc.fillColor("#153243");
  doc.font("AppBold").fontSize(12).text(t.offerTo, 56, 182);
  doc.fontSize(16).text(quote.customerName, 56, 205);
  doc.font("AppRegular").fontSize(11).fillColor("#475569").text(quote.note || t.customerPlaceholder, 56, 230, { width: 210 });

  doc.fillColor("#ffffff");
  doc.roundedRect(320, 165, 233, 116, 12).fill("#153243");
  doc.fillColor("#ffffff");
  doc.font("AppBold").fontSize(18).text(t.offerTitle, 338, 182);
  doc.font("AppRegular").fontSize(11).text(`${t.offerNo}: ${quote.quoteNo || `DRC-${quote.id}`}`, 338, 212);
  doc.text(`${t.date}: ${formattedDate}`, 338, 230);
  doc.text(`${t.language}: ${lang === "tr" ? "Türkçe" : "Deutsch"}`, 338, 248);
  doc.text(`${t.vatLabel}: ${quote.isExport ? t.vatExportShort : `${numberOrZero(quote.vatRate)}%`}`, 338, 266);

  doc.fillColor("#153243");
  doc.font("AppBold").fontSize(20).text(quote.title, 42, 312);
  doc.font("AppRegular").fontSize(10).fillColor("#64748b").text(`${COMPANY_PROFILE.manager} | ${COMPANY_PROFILE.phone} | ${COMPANY_PROFILE.email}`, 42, 339);
  doc.text(`${COMPANY_PROFILE.email2} | ${COMPANY_PROFILE.web} | ${COMPANY_PROFILE.register}`, 42, 354);

  let y = 392;
  const cols = [42, 262, 336, 416, 500];
  doc.roundedRect(42, y, 511, 28, 8).fill("#e2e8f0");
  doc.fillColor("#153243").font("AppBold").fontSize(10);
  doc.text(t.item, cols[0] + 8, y + 9);
  doc.text(t.qty, cols[1] + 8, y + 9);
  doc.text(t.unitPrice, cols[2] + 8, y + 9);
  doc.text(t.unit, cols[3] + 8, y + 9);
  doc.text(t.total, cols[4] + 8, y + 9);
  y += 36;

  quote.items.forEach((item, index) => {
    const bg = index % 2 === 0 ? "#ffffff" : "#f8fafc";
    doc.roundedRect(42, y - 4, 511, 30, 6).fill(bg);
    doc.fillColor("#0f172a").font("AppRegular").fontSize(10);
    doc.text(item.itemName, cols[0] + 8, y + 4, { width: 205 });
    doc.text(String(item.quantity), cols[1] + 8, y + 4, { width: 60 });
    doc.text(currency.format(item.unitPrice), cols[2] + 8, y + 4, { width: 72 });
    doc.text(item.unit, cols[3] + 8, y + 4, { width: 60 });
    doc.text(currency.format(item.total), cols[4] + 8, y + 4, { width: 60 });
    y += 34;
    if (y > 700) {
      doc.addPage();
      configurePdfFonts(doc);
      y = 42;
    }
  });

  doc.roundedRect(320, totalsTop, 233, 118, 12).fill("#f8fafc");
  doc.fillColor("#153243").font("AppRegular").fontSize(11);
  doc.text(`${t.subtotal}: ${currency.format(numberOrZero(quote.subtotal))}`, 338, totalsTop + 16);
  doc.text(`${t.discount}: ${currency.format(numberOrZero(quote.discount))}`, 338, totalsTop + 36);
  doc.text(`${t.netTotal}: ${currency.format(numberOrZero(quote.netTotal || quote.total))}`, 338, totalsTop + 56);
  doc.text(
    `${quote.isExport ? t.vatExport : `${t.vat} (${numberOrZero(quote.vatRate)}%)`}: ${currency.format(numberOrZero(quote.vatAmount))}`,
    338,
    totalsTop + 76,
    { width: 196 }
  );
  doc.font("AppBold").fontSize(15).text(`${t.grossTotal}: ${currency.format(numberOrZero(quote.grossTotal || quote.total))}`, 338, totalsTop + 94);

  doc.roundedRect(42, footerTop, 244, 90, 12).fill("#f8fafc");
  doc.fillColor("#153243").font("AppBold").fontSize(11).text(t.bankTitle, 56, footerTop + 14);
  doc.font("AppRegular").fontSize(10);
  doc.text(`${t.beneficiary}: ${COMPANY_PROFILE.beneficiary}`, 56, footerTop + 34, { width: 214 });
  doc.text(`${t.bank}: ${COMPANY_PROFILE.bankName}`, 56, footerTop + 50, { width: 214 });
  doc.text(`IBAN: ${COMPANY_PROFILE.iban}`, 56, footerTop + 66, { width: 214 });
  doc.text(`BIC: ${COMPANY_PROFILE.bic}`, 56, footerTop + 82, { width: 214 });

  doc.roundedRect(309, footerTop, 244, 90, 12).fill("#f8fafc");
  doc.fillColor("#153243").font("AppBold").fontSize(11).text(t.signature, 323, footerTop + 14);
  doc.moveTo(323, footerTop + 60).lineTo(523, footerTop + 60).strokeColor("#94a3b8").stroke();
  doc.font("AppRegular").fillColor("#64748b").fontSize(10).text(COMPANY_PROFILE.manager, 323, footerTop + 66);

  y = footerTop + 114;
  doc.fillColor("#153243").font("AppBold").fontSize(12).text(t.conditionsTitle, 42, y);
  doc.fillColor("#475569").font("AppRegular").fontSize(10);
  t.conditions.forEach((line, index) => {
    doc.text(`• ${line}`, 42, y + 22 + index * 16, { width: 511 });
  });
}

function getQuoteTranslations(lang) {
  if (lang === "tr") {
    return {
      logoSubline: "Sogutma ve Klima Teknigi",
      headOffice: "Merkez",
      warehouse: "Depo",
      offerTo: "Musteri",
      offerTitle: "Fiyat Teklifi",
      offerNo: "Teklif No",
      date: "Tarih",
      language: "Dil",
      vatLabel: "KDV",
      vatExportShort: "Yok",
      item: "Malzeme",
      qty: "Miktar",
      unitPrice: "Birim Fiyat",
      unit: "Birim",
      total: "Toplam",
      subtotal: "Ara Toplam",
      discount: "Iskonto",
      netTotal: "Net Toplam",
      vat: "KDV",
      vatExport: "Ihracat - KDV Yok",
      grossTotal: "Brut Toplam",
      conditionsTitle: "Kosullar",
      bankTitle: "Banka Bilgileri",
      beneficiary: "Lehdar",
      bank: "Banka",
      signature: "Imza Alani",
      customerPlaceholder: "Musteri notu belirtilmedi.",
      conditions: [
        "Teklif tarihinden itibaren 15 gun gecerlidir.",
        "Teslimat suresi stok ve uretim durumuna gore ayrica teyit edilir.",
        "Montaj, nakliye ve devreye alma dahil degilse ayrica belirtilir.",
      ],
    };
  }

  return {
    logoSubline: "Kalte- und Klimatechnik",
    headOffice: "Zentrale",
    warehouse: "Lager",
    offerTo: "Kunde",
    offerTitle: "Angebot",
    offerNo: "Angebotsnr.",
    date: "Datum",
    language: "Sprache",
    vatLabel: "MwSt.",
    vatExportShort: "0%",
    item: "Artikel",
    qty: "Menge",
    unitPrice: "Einzelpreis",
    unit: "Einheit",
    total: "Gesamt",
    subtotal: "Zwischensumme",
    discount: "Rabatt",
    netTotal: "Netto",
    vat: "MwSt.",
    vatExport: "Exportlieferung - keine MwSt.",
    grossTotal: "Brutto",
    conditionsTitle: "Konditionen",
    bankTitle: "Bankverbindung",
    beneficiary: "Empfanger",
    bank: "Bank",
    signature: "Unterschrift",
    customerPlaceholder: "Keine zusaetzliche Kundennotiz.",
    conditions: [
      "Dieses Angebot ist 15 Tage ab Angebotsdatum gueltig.",
      "Lieferzeiten werden je nach Lager- und Produktionsstatus bestaetigt.",
      "Montage, Transport und Inbetriebnahme sind nur enthalten, wenn ausdruecklich angegeben.",
    ],
  };
}

function numberOrZero(value) {
  return Number(value || 0);
}

function configurePdfFonts(doc) {
  if (fs.existsSync(PDF_FONTS.regular) && fs.existsSync(PDF_FONTS.bold)) {
    doc.registerFont("AppRegular", PDF_FONTS.regular);
    doc.registerFont("AppBold", PDF_FONTS.bold);
  } else {
    doc.registerFont("AppRegular", "Helvetica");
    doc.registerFont("AppBold", "Helvetica-Bold");
  }
  doc.font("AppRegular");
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

function sanitizeFileName(value) {
  return String(value || "teklif")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isTruthy(value) {
  return value === true || value === "true" || value === 1 || value === "1" || value === "on";
}

function formatQuoteDate(dateString, lang) {
  if (!dateString) {
    return "";
  }
  const locale = lang === "tr" ? "tr-TR" : "de-DE";
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }
  return new Intl.DateTimeFormat(locale).format(date);
}

module.exports = {
  createApp,
  startServer,
};
