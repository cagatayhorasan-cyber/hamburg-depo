const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const express = require("express");
const cookieSession = require("cookie-session");
const bcrypt = require("bcryptjs");
const bwipjs = require("bwip-js");
const nodemailer = require("nodemailer");
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
  web: "drckaltetechnik.vercel.app",
  register: "HRB 11217 - Amtsgericht Hamm",
  taxNo: "322/577/1909",
  vatId: "ATU73555618",
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
const APP_BASE_URL = process.env.APP_BASE_URL || "";
const MAIL_FROM = process.env.MAIL_FROM || COMPANY_PROFILE.email;
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const GMAIL_USER = process.env.GMAIL_USER || "";
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || "";
const DRC_MAN_DIR = path.resolve(process.env.DRC_MAN_DIR || path.join(os.homedir(), "Desktop", "DRC_MAN"));
const DRC_MAN_BRIDGE = path.join(__dirname, "..", "scripts", "drc_man_bridge.py");
const DRC_MAN_PYTHON = process.env.DRC_MAN_PYTHON || "/opt/homebrew/bin/python3";
const ADMIN_TOOLS = new Set(["coldroompro", "soguk-oda-cizim"]);
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || "256kb";
const FORM_BODY_LIMIT = process.env.FORM_BODY_LIMIT || "64kb";
const API_RATE_WINDOW_MS = 60 * 1000;
const AUTH_RATE_WINDOW_MS = 10 * 60 * 1000;
const GENERAL_API_RATE_LIMIT = Number(process.env.GENERAL_API_RATE_LIMIT || 240);
const AUTH_API_RATE_LIMIT = Number(process.env.AUTH_API_RATE_LIMIT || 12);
const RATE_LIMIT_BUCKETS = new Map();
const SECURITY_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const SECURITY_AUTH_FAILURE_THRESHOLD = Number(process.env.SECURITY_AUTH_FAILURE_THRESHOLD || 8);
const SECURITY_ORIGIN_FAILURE_THRESHOLD = Number(process.env.SECURITY_ORIGIN_FAILURE_THRESHOLD || 4);
const SECURITY_AUTH_BLOCK_MS = 30 * 60 * 1000;
const SECURITY_ORIGIN_BLOCK_MS = 60 * 60 * 1000;
const SECURITY_RATE_LIMIT_BLOCK_MS = 30 * 60 * 1000;
const SECURITY_EVENT_DETAILS_LIMIT = 1600;
const ADMIN_MESSAGE_SUBJECT_LIMIT = 160;
const ADMIN_MESSAGE_BODY_LIMIT = 3000;

let gmailTransporter = null;

function createApp() {
  const app = express();
  app.disable("x-powered-by");

  if (IS_SECURE_PROXY) {
    app.set("trust proxy", 1);
  }

  if (IS_SECURE_PROXY && SESSION_SECRET === "hamburg-depo-secret") {
    console.warn("SESSION_SECRET varsayilan degerde. Uretimde ozel bir gizli anahtar tanimlayin.");
  }

  app.use(applySecurityHeaders);

  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store, max-age=0");
    res.set("Pragma", "no-cache");
    next();
  });

  app.use(express.json({ limit: JSON_BODY_LIMIT, strict: true, type: ["application/json", "application/*+json"] }));
  app.use(express.urlencoded({ extended: false, limit: FORM_BODY_LIMIT }));
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

  app.use(initializeSecurityAuditQueue);
  app.use("/api", enforceIpSecurityBlock);
  app.use("/api", validateBrowserRequestOrigin);
  app.use("/api", createRateLimiter({
    name: "general-api",
    windowMs: API_RATE_WINDOW_MS,
    max: GENERAL_API_RATE_LIMIT,
    message: "Cok fazla istek gonderildi. Lutfen biraz bekleyip tekrar deneyin.",
  }));

  const authRateLimiter = createRateLimiter({
    name: "auth-api",
    windowMs: AUTH_RATE_WINDOW_MS,
    max: AUTH_API_RATE_LIMIT,
    keyFn: (req) => {
      const identifier = cleanOptional(req.body?.identifier || req.body?.username || req.body?.email || "");
      return `${getClientIp(req)}:${req.path}:${identifier.toLowerCase()}`;
    },
    message: "Cok fazla giris veya sifre islemi denendi. Lutfen 10 dakika sonra tekrar deneyin.",
  });

  app.use(express.static(path.join(__dirname, "..", "public")));

  app.get("/api/health", (_req, res) => {
    const dbTarget = dbClient === "postgres"
      ? "postgres"
      : path.basename(dbPath);
    res.json({ ok: true, dbClient, dbTarget });
  });

  app.post("/api/login", authRateLimiter, async (req, res) => {
    const identifier = cleanOptional(req.body?.identifier || req.body?.username || req.body?.email);
    const password = req.body?.password;
    const user = await findUserByLoginIdentifier(identifier);

    if (!user || !bcrypt.compareSync(password || "", user.password_hash)) {
      await recordFailedAuthentication(req, identifier);
      return res.status(401).json({ error: "Kullanici adi/e-posta veya sifre hatali." });
    }

    req.session.user = sessionUserFromRow(user);
    queueSecurityEvent(req, {
      user,
      eventType: "login_success",
      severity: "info",
      identifier,
      details: { role: normalizeRole(user.role) },
    });

    return res.json({ user: req.session.user });
  });

  app.post("/api/logout", requireAuth, (req, res) => {
    queueSecurityEvent(req, {
      user: req.session.user,
      eventType: "logout",
      severity: "info",
      details: { role: normalizeRole(req.session.user?.role) },
    });
    req.session = null;
    res.json({ ok: true });
  });

  app.get("/api/me", (req, res) => {
    res.json({ user: req.session.user || null });
  });

  app.post("/api/auth/forgot-password", authRateLimiter, async (req, res) => {
    const identifier = cleanOptional(req.body?.identifier || req.body?.email || req.body?.username);
    const language = req.body?.language === "de" ? "de" : "tr";
    const user = await findUserByLoginIdentifier(identifier);
    if (user?.email) {
      const token = await issueAuthToken(Number(user.id), "reset_password", 2);
      const resetUrl = `${getAppBaseUrl(req)}?resetToken=${encodeURIComponent(token)}`;
      await sendPasswordResetEmail(user, resetUrl);
    }

    queueSecurityEvent(req, {
      user,
      eventType: "password_reset_requested",
      severity: "info",
      identifier,
      details: { matchedAccount: Boolean(user), mailTarget: Boolean(user?.email) },
    });

    return res.json({
      ok: true,
      message: language === "de"
        ? "Wenn ein passendes Konto gefunden wurde, wurden Anweisungen zum Zuruecksetzen gesendet."
        : "Eslesen bir hesap bulunduysa sifre yenileme talimati gonderildi.",
    });
  });

  app.post("/api/auth/reset-password", authRateLimiter, async (req, res) => {
    const token = cleanOptional(req.body?.token);
    const password = String(req.body?.password || "");

    if (!token || password.length < 6) {
      return res.status(400).json({ error: "Gecerli token ve en az 6 karakterli sifre gereklidir." });
    }

    const tokenRow = await consumeAuthToken(token, "reset_password");
    if (!tokenRow) {
      return res.status(400).json({ error: "Sifre yenileme baglantisi gecersiz veya suresi dolmus." });
    }

    await execute("UPDATE users SET password_hash = ? WHERE id = ?", [bcrypt.hashSync(password, 10), Number(tokenRow.user_id)]);
    queueSecurityEvent(req, {
      user: { id: Number(tokenRow.user_id), role: "customer" },
      eventType: "password_reset_completed",
      severity: "info",
    });
    return res.json({ ok: true, message: "Sifreniz guncellendi. Yeni sifrenizle giris yapabilirsiniz." });
  });

  app.post("/api/auth/verify-email", async (req, res) => {
    const token = cleanOptional(req.body?.token);
    if (!token) {
      return res.status(400).json({ error: "Dogrulama baglantisi eksik." });
    }

    const tokenRow = await consumeAuthToken(token, "verify_email");
    if (!tokenRow) {
      return res.status(400).json({ error: "Dogrulama baglantisi gecersiz veya suresi dolmus." });
    }

    const user = await get("UPDATE users SET email_verified = ? WHERE id = ? RETURNING id, name, username, email, role, email_verified", [1, Number(tokenRow.user_id)]);
    if (!user) {
      return res.status(404).json({ error: "Kullanici bulunamadi." });
    }

    req.session.user = sessionUserFromRow(user);
    queueSecurityEvent(req, {
      user,
      eventType: "email_verified",
      severity: "info",
      details: { userId: Number(user.id) },
    });
    return res.json({ ok: true, user: req.session.user, message: "E-posta adresiniz dogrulandi." });
  });

  app.post("/api/auth/resend-verification", requireCustomer, async (req, res) => {
    const user = await get("SELECT * FROM users WHERE id = ?", [req.session.user.id]);
    if (!user?.email) {
      return res.status(400).json({ error: "Bu hesapta e-posta bulunmuyor." });
    }
    if (toBoolean(user.email_verified)) {
      return res.json({ ok: true, message: "Bu hesabin e-postasi zaten dogrulanmis." });
    }

    const token = await issueAuthToken(Number(user.id), "verify_email", 24);
    const verifyUrl = `${getAppBaseUrl(req)}?verifyEmailToken=${encodeURIComponent(token)}`;
    const mailResult = await sendVerificationEmail(user, verifyUrl);

    queueSecurityEvent(req, {
      user,
      eventType: "email_verification_resent",
      severity: mailResult.sent ? "info" : "warn",
      details: { sent: Boolean(mailResult.sent), reason: mailResult.reason || "" },
    });

    return res.json({
      ok: true,
      message: mailResult.sent
        ? "Dogrulama e-postasi tekrar gonderildi."
        : "Mail sistemi henuz tam ayarlanmadigi icin dogrulama maili gonderilemedi.",
      mailSent: Boolean(mailResult.sent),
      mailReason: mailResult.reason || "",
    });
  });

  app.post("/api/customers/register", authRateLimiter, async (req, res) => {
    const name = cleanOptional(req.body?.name);
    const email = normalizeEmail(req.body?.email);
    const phone = normalizePhone(req.body?.phone);
    const password = String(req.body?.password || "");
    const requestedUsername = normalizeUsername(req.body?.username);

    if (!name || !email || !password || !phone) {
      return res.status(400).json({ error: "Ad soyad, e-posta, telefon ve sifre zorunludur." });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Gecerli bir e-posta adresi girin." });
    }
    if (!phone || phone.length < 8) {
      return res.status(400).json({ error: "Gecerli bir telefon numarasi girin." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Sifre en az 6 karakter olmali." });
    }

    const username = requestedUsername || await generateUniqueUsernameFromEmail(email);
    if (username.length < 3) {
      return res.status(400).json({ error: "Kullanici adi en az 3 karakter olmali." });
    }

    const existingByEmail = await get("SELECT id FROM users WHERE LOWER(COALESCE(email, '')) = LOWER(?)", [email]);
    if (existingByEmail) {
      return res.status(400).json({ error: "Bu e-posta ile zaten bir hesap var." });
    }

    const existingByUsername = await get("SELECT id FROM users WHERE LOWER(username) = LOWER(?)", [username]);
    if (existingByUsername) {
      return res.status(400).json({ error: "Bu kullanici adi zaten alinmis." });
    }

    try {
      const result = await execute(
        "INSERT INTO users (name, username, email, phone, email_verified, password_hash, role) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
        [name, username, email, phone, 0, bcrypt.hashSync(password, 10), "customer"]
      );

      const insertedUser = {
        id: Number(result.rows[0]?.id || result.lastInsertId),
        name,
        username,
        email,
        phone,
        emailVerified: false,
        role: "customer",
      };

      req.session.user = insertedUser;
      const token = await issueAuthToken(insertedUser.id, "verify_email", 24);
      const verifyUrl = `${getAppBaseUrl(req)}?verifyEmailToken=${encodeURIComponent(token)}`;
      const mailResult = await sendVerificationEmail(insertedUser, verifyUrl);
      queueSecurityEvent(req, {
        user: insertedUser,
        eventType: "customer_registered",
        severity: "info",
        identifier: email,
        details: { username, phone, mailSent: Boolean(mailResult.sent) },
      });
      return res.json({
        user: insertedUser,
        mailSent: Boolean(mailResult.sent),
        mailReason: mailResult.reason || "",
      });
    } catch (_error) {
      return res.status(400).json({ error: "Musteri hesabi olusturulamadi. Bilgileri kontrol edin." });
    }
  });

  app.get("/api/bootstrap", requireAuth, async (_req, res) => {
    res.json(await buildBootstrap(_req.session.user));
  });

  app.get("/api/inventory", requireStaffOrAdmin, async (req, res) => {
    const includeArchive = isAdminRole(req.session.user?.role)
      && (req.query?.includeArchive === "1" || req.query?.archive === "1");
    const [items, archivedItems] = await Promise.all([
      queryItems(),
      includeArchive ? queryItems(false) : Promise.resolve([]),
    ]);

    return res.json({
      items: sanitizeItemsForRole(items, req.session.user),
      archivedItems: sanitizeItemsForRole(archivedItems, req.session.user),
    });
  });

  app.post("/api/assistant/query", requireAuth, async (req, res) => {
    const message = cleanOptional(req.body?.message);
    const language = req.body?.language === "de" ? "de" : "tr";
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const answerLevel = resolveAssistantAnswerLevel(message, req.session.user);
    if (!message) {
      return res.status(400).json({ error: "Soru bos olamaz." });
    }

    if (isCustomerRole(req.session.user?.role) && isRestrictedCustomerPurchaseQuestion(message)) {
      return res.json({
        answer: customerRestrictedPurchaseAnswer(language),
        suggestions: language === "de"
          ? ["Welche Artikel sind auf Lager?", "Verkaufspreis anzeigen"]
          : ["Stokta hangi urunler var?", "Satis fiyati goster"],
        provider: "built_in",
        sourceSummary: language === "de" ? "Kunden-Einkaufspreis-Schutz" : "Musteri alis fiyati korumasi",
      });
    }

    if (isDirectPriceQuestion(message)) {
      const items = isCustomerRole(req.session.user?.role)
        ? await queryCustomerItems({ includePrices: true })
        : sanitizeItemsForRole(await queryItems(), req.session.user);
      const answer = answerAssistantQuestion(message, items, language, req.session.user);
      return res.json({
        answer: answer.reply,
        suggestions: answer.suggestions || [],
        provider: "built_in",
      });
    }

    const trainingMatch = await matchAssistantTraining(message, language, req.session.user);
    if (trainingMatch?.answer) {
      const answer = sanitizeAssistantAnswerForRole(
        adaptAssistantTrainingAnswer(trainingMatch.answer, language, answerLevel),
        language,
        req.session.user
      );
      return res.json({
        answer,
        suggestions: trainingMatch.suggestions || [],
        provider: "drc_man",
        sourceSummary: trainingMatch.sourceSummary || "DRC MAN yonetici egitimi",
      });
    }

    const drcManResult = queryDrcManAssistant(message, language, req.session.user, answerLevel, history);
    if (drcManResult?.answer) {
      return res.json({
        answer: sanitizeAssistantAnswerForRole(drcManResult.answer, language, req.session.user),
        suggestions: drcManResult.suggestions || [],
        provider: "drc_man",
        sourceSummary: drcManResult.sourceSummary || "",
      });
    }

    const items = isCustomerRole(req.session.user?.role)
      ? await queryCustomerItems({ includePrices: true })
      : sanitizeItemsForRole(await queryItems(), req.session.user);
    const answer = answerAssistantQuestion(message, items, language, req.session.user);
    return res.json({
      answer: answer.reply,
      suggestions: answer.suggestions || [],
      provider: "built_in",
    });
  });

  app.get("/api/assistant/trainings", requireAdmin, async (_req, res) => {
    const entries = await queryAgentTrainingEntries(false);
    return res.json({ entries });
  });

  app.post("/api/assistant/trainings", requireAdmin, async (req, res) => {
    const payload = normalizeTrainingPayload(req.body, req.session.user);
    if (payload.error) {
      return res.status(400).json({ error: payload.error });
    }

    const result = await execute(
      `
        INSERT INTO agent_training (
          topic, audience, keywords, tr_question, tr_answer, de_question, de_answer, suggestions, is_active, created_by_user_id, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        RETURNING id
      `,
      [
        payload.topic,
        payload.audience,
        payload.keywords,
        payload.trQuestion,
        payload.trAnswer,
        payload.deQuestion,
        payload.deAnswer,
        JSON.stringify(payload.suggestions),
        payload.isActive ? 1 : 0,
        Number(req.session.user.id),
      ]
    );

    queueSecurityEvent(req, {
      user: req.session.user,
      eventType: "training_created",
      severity: "info",
      details: { topic: payload.topic, audience: payload.audience },
    });

    return res.json({ ok: true, id: Number(result.rows[0]?.id || result.lastInsertId || 0) });
  });

  app.put("/api/assistant/trainings/:id", requireAdmin, async (req, res) => {
    const trainingId = Number(req.params.id);
    if (!Number.isFinite(trainingId) || trainingId <= 0) {
      return res.status(400).json({ error: "Gecersiz egitim kaydi." });
    }

    const payload = normalizeTrainingPayload(req.body, req.session.user);
    if (payload.error) {
      return res.status(400).json({ error: payload.error });
    }

    const result = await execute(
      `
        UPDATE agent_training
        SET topic = ?, audience = ?, keywords = ?, tr_question = ?, tr_answer = ?, de_question = ?, de_answer = ?, suggestions = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        payload.topic,
        payload.audience,
        payload.keywords,
        payload.trQuestion,
        payload.trAnswer,
        payload.deQuestion,
        payload.deAnswer,
        JSON.stringify(payload.suggestions),
        payload.isActive ? 1 : 0,
        trainingId,
      ]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Egitim kaydi bulunamadi." });
    }

    queueSecurityEvent(req, {
      user: req.session.user,
      eventType: "training_updated",
      severity: "info",
      details: { id: trainingId, topic: payload.topic, audience: payload.audience },
    });

    return res.json({ ok: true });
  });

  app.delete("/api/assistant/trainings/:id", requireAdmin, async (req, res) => {
    const trainingId = Number(req.params.id);
    if (!Number.isFinite(trainingId) || trainingId <= 0) {
      return res.status(400).json({ error: "Gecersiz egitim kaydi." });
    }

    const result = await execute("DELETE FROM agent_training WHERE id = ?", [trainingId]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "Egitim kaydi bulunamadi." });
    }

    queueSecurityEvent(req, {
      user: req.session.user,
      eventType: "training_deleted",
      severity: "warn",
      details: { id: trainingId },
    });

    return res.json({ ok: true });
  });

  app.post("/api/users", requireAdmin, async (req, res) => {
    const { name, username, password, role } = req.body || {};
    const email = normalizeEmail(req.body?.email);
    const phone = normalizePhone(req.body?.phone);
    const normalizedUsername = normalizeUsername(username);
    if (!name || !username || !password || !role) {
      return res.status(400).json({ error: "Tum kullanici alanlari zorunlu." });
    }

    if (!["admin", "staff", "customer", "operator"].includes(role)) {
      return res.status(400).json({ error: "Gecersiz kullanici rolu." });
    }
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: "Gecerli bir e-posta adresi girin." });
    }
    if (normalizedUsername.length < 3) {
      return res.status(400).json({ error: "Kullanici adi en az 3 karakter olmali." });
    }

    try {
      const result = await execute(
        "INSERT INTO users (name, username, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
        [name.trim(), normalizedUsername, email || null, phone || null, bcrypt.hashSync(password, 10), role]
      );

      queueSecurityEvent(req, {
        user: req.session.user,
        eventType: "user_created",
        severity: "info",
        details: { createdRole: normalizeRole(role), username: normalizedUsername, email },
      });

      return res.json({
        id: Number(result.rows[0]?.id || result.lastInsertId),
        name,
        username: normalizedUsername,
        email,
        phone,
        role,
      });
    } catch (_error) {
      return res.status(400).json({ error: "Kullanici olusturulamadi. Kullanici adi ve e-posta benzersiz olmali." });
    }
  });

  app.post("/api/admin-messages", requireAuth, async (req, res) => {
    const category = normalizeAdminMessageCategory(req.body?.category);
    const subject = cleanOptional(req.body?.subject).slice(0, ADMIN_MESSAGE_SUBJECT_LIMIT);
    const message = cleanOptional(req.body?.message).slice(0, ADMIN_MESSAGE_BODY_LIMIT);

    if (!subject || !message) {
      return res.status(400).json({ error: "Baslik ve mesaj zorunlu." });
    }

    const senderName = cleanOptional(req.session.user?.name) || cleanOptional(req.session.user?.username) || "Kullanici";
    const result = await execute(
      `
        INSERT INTO admin_messages (
          sender_user_id, sender_name, sender_role, category, subject, message, status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 'new', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      `,
      [
        Number(req.session.user.id),
        senderName,
        normalizeRole(req.session.user.role),
        category,
        subject,
        message,
      ]
    );

    queueSecurityEvent(req, {
      user: req.session.user,
      eventType: "admin_message_created",
      severity: "info",
      details: { category, subject },
    });

    return res.json({ ok: true, id: Number(result.rows[0]?.id || result.lastInsertId || 0) });
  });

  app.post("/api/admin-messages/:id/status", requireAdmin, async (req, res) => {
    const messageId = Number(req.params.id);
    const status = normalizeAdminMessageStatus(req.body?.status);
    if (!Number.isFinite(messageId) || messageId <= 0) {
      return res.status(400).json({ error: "Gecersiz mesaj kaydi." });
    }

    const result = await execute(
      "UPDATE admin_messages SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [status, messageId]
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: "Mesaj bulunamadi." });
    }

    queueSecurityEvent(req, {
      user: req.session.user,
      eventType: "admin_message_status_updated",
      severity: "info",
      details: { messageId, status },
    });

    return res.json({ ok: true });
  });

  app.post("/api/security/blocks/:id/release", requireAdmin, async (req, res) => {
    const blockId = Number(req.params.id);
    if (!Number.isFinite(blockId) || blockId <= 0) {
      return res.status(400).json({ error: "Gecersiz blok kaydi." });
    }

    const nowIso = new Date().toISOString();
    const result = await execute("UPDATE security_blocks SET released_at = ?, updated_at = ? WHERE id = ?", [nowIso, nowIso, blockId]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "Blok kaydi bulunamadi." });
    }

    queueSecurityEvent(req, {
      user: req.session.user,
      eventType: "ip_unblocked",
      severity: "info",
      details: { blockId },
    });

    return res.json({ ok: true });
  });

  app.post("/api/items", requireAdmin, async (req, res) => {
    const { name, brand, category, unit, minStock, barcode, notes, defaultPrice, listPrice, salePrice } = req.body || {};
    if (!name || !category || !unit) {
      return res.status(400).json({ error: "Malzeme bilgileri eksik." });
    }
    const numericFields = parseItemNumericFields({ minStock, defaultPrice, listPrice, salePrice });
    if (!numericFields) {
      return res.status(400).json({ error: "Malzeme fiyat ve stok alanlari sifir veya pozitif sayi olmali." });
    }

    try {
      const result = await execute(
        `
          INSERT INTO items (name, brand, category, unit, min_stock, barcode, notes, default_price, list_price, sale_price)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id
        `,
        [
          name.trim(),
          cleanOptional(brand),
          category.trim(),
          unit.trim(),
          numericFields.minStock,
          cleanOptional(barcode) || null,
          cleanOptional(notes),
          numericFields.defaultPrice,
          numericFields.listPrice,
          numericFields.salePrice,
        ]
      );

      queueSecurityEvent(req, {
        user: req.session.user,
        eventType: "item_created",
        severity: "info",
        details: { name: name.trim(), brand: cleanOptional(brand), category: category.trim() },
      });

      return res.json({ id: Number(result.rows[0]?.id || result.lastInsertId) });
    } catch (_error) {
      return res.status(400).json({ error: "Malzeme kaydi olusturulamadi. Barkod benzersiz olmali." });
    }
  });

  app.put("/api/items/:id", requireAdmin, async (req, res) => {
    const { name, brand, category, unit, minStock, barcode, notes, defaultPrice, listPrice, salePrice } = req.body || {};
    if (!name || !category || !unit) {
      return res.status(400).json({ error: "Malzeme bilgileri eksik." });
    }
    const numericFields = parseItemNumericFields({ minStock, defaultPrice, listPrice, salePrice });
    if (!numericFields) {
      return res.status(400).json({ error: "Malzeme fiyat ve stok alanlari sifir veya pozitif sayi olmali." });
    }

    try {
      const result = await execute(
        `
          UPDATE items
          SET name = ?, brand = ?, category = ?, unit = ?, min_stock = ?, barcode = ?, notes = ?, default_price = ?, list_price = ?, sale_price = ?
          WHERE id = ?
        `,
        [
          name.trim(),
          cleanOptional(brand),
          category.trim(),
          unit.trim(),
          numericFields.minStock,
          cleanOptional(barcode) || null,
          cleanOptional(notes),
          numericFields.defaultPrice,
          numericFields.listPrice,
          numericFields.salePrice,
          Number(req.params.id),
        ]
      );

      if (!result.rowCount) {
        return res.status(404).json({ error: "Malzeme bulunamadi." });
      }

      queueSecurityEvent(req, {
        user: req.session.user,
        eventType: "item_updated",
        severity: "info",
        details: { id: Number(req.params.id), name: name.trim(), brand: cleanOptional(brand), category: category.trim() },
      });

      return res.json({ ok: true });
    } catch (_error) {
      return res.status(400).json({ error: "Malzeme guncellenemedi. Barkod benzersiz olmali." });
    }
  });

  app.delete("/api/items/:id", requireAdmin, async (req, res) => {
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

    queueSecurityEvent(req, {
      user: req.session.user,
      eventType: "item_deleted",
      severity: "warn",
      details: { itemId },
    });

    return res.json({ ok: true });
  });

  app.post("/api/items/intake", requireStaffOrAdmin, async (req, res) => {
    const {
      name,
      brand,
      category,
      unit,
      minStock,
      barcode,
      notes,
      listPrice,
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
    const listPriceValue = Number(listPrice || 0);
    const salePriceValue = Number(salePrice || 0);
    const minStockValue = Number(minStock || 0);

    if (!Number.isFinite(quantityValue) || !Number.isFinite(unitPriceValue) || quantityValue <= 0 || unitPriceValue <= 0) {
      return res.status(400).json({ error: "Miktar ve birim alis sifirdan buyuk olmali." });
    }
    if (!isNonNegativeFinite(listPriceValue) || !isNonNegativeFinite(salePriceValue) || !isNonNegativeFinite(minStockValue)) {
      return res.status(400).json({ error: "Fiyat ve kritik stok alanlari sifir veya pozitif sayi olmali." });
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
            INSERT INTO items (name, brand, category, unit, min_stock, barcode, notes, default_price, list_price, sale_price)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
          `,
          [
            trimmedName,
            trimmedBrand,
            category.trim(),
            unit.trim(),
            minStockValue,
            cleanOptional(barcode) || null,
            cleanOptional(notes),
            unitPriceValue,
            listPriceValue,
            salePriceValue,
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

      queueSecurityEvent(req, {
        user: req.session.user,
        eventType: "item_intake_created",
        severity: "info",
        details: { itemId, name: trimmedName, brand: trimmedBrand, quantity: quantityValue, unitPrice: unitPriceValue },
      });

      return res.json({ ok: true, id: itemId });
    } catch (error) {
      return res.status(400).json({ error: error.message || "Yeni urun kaydi olusturulamadi." });
    }
  });

  app.post("/api/movements", requireStaffOrAdmin, async (req, res) => {
    const { itemId, type, quantity, unitPrice, date, note } = req.body || {};
    if (!itemId || !type || !quantity || !date) {
      return res.status(400).json({ error: "Stok hareketi icin tum alanlar gereklidir." });
    }
    if (!["entry", "exit"].includes(type)) {
      return res.status(400).json({ error: "Gecersiz stok hareket tipi." });
    }

    const item = await get("SELECT * FROM items WHERE id = ?", [itemId]);
    if (!item) {
      return res.status(404).json({ error: "Malzeme bulunamadi." });
    }

    const quantityValue = Number(quantity);
    if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
      return res.status(400).json({ error: "Miktar sifirdan buyuk olmali." });
    }

    const normalizedRole = normalizeRole(req.session.user?.role);
    const effectiveUnitPrice = await resolveMovementUnitPrice({
      itemId: Number(itemId),
      requestedUnitPrice: unitPrice,
      defaultPrice: Number(item.default_price || 0),
      role: normalizedRole,
    });

    if (type === "entry" && effectiveUnitPrice <= 0) {
      return res.status(400).json({
        error: normalizedRole === "admin"
          ? "Giris hareketi icin gecerli bir alis maliyeti girin."
          : "Bu urun icin alis maliyetini admin belirlemeli.",
      });
    }

    const stock = await getItemStock(itemId);
    if (type === "exit" && quantityValue > stock) {
      return res.status(400).json({ error: "Cikis miktari mevcut stogu gecemez." });
    }

    await execute(
      `
        INSERT INTO movements (item_id, type, quantity, unit_price, movement_date, note, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [itemId, type, quantityValue, effectiveUnitPrice, date, cleanOptional(note), req.session.user.id]
    );

    queueSecurityEvent(req, {
      user: req.session.user,
      eventType: type === "entry" ? "movement_entry_created" : "movement_exit_created",
      severity: "info",
      details: { itemId: Number(itemId), quantity: quantityValue, unitPrice: effectiveUnitPrice, date },
    });

    return res.json({ ok: true });
  });

  app.post("/api/movements/:id/reverse", requireStaffOrAdmin, async (req, res) => {
    const movementId = Number(req.params.id);
    const movement = await get("SELECT * FROM movements WHERE id = ?", [movementId]);
    if (!movement) {
      return res.status(404).json({ error: "Hareket bulunamadi." });
    }
    if (!isAdminRole(req.session.user?.role) && Number(movement.user_id || 0) !== Number(req.session.user.id)) {
      return res.status(403).json({ error: "Personel sadece kendi girdigi stok hareketini iptal edebilir." });
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

      queueSecurityEvent(req, {
        user: req.session.user,
        eventType: "movement_reversed",
        severity: "warn",
        details: { movementId },
      });

      return res.json({ ok: true });
    } catch (error) {
      return res.status(400).json({ error: error.message || "Hareket iptal edilemedi." });
    }
  });

  app.post("/api/expenses", requireAdmin, async (req, res) => {
    const { title, category, amount, date, paymentType, note } = req.body || {};
    if (!title || !category || !amount || !date || !paymentType) {
      return res.status(400).json({ error: "Masraf bilgileri eksik." });
    }
    const amountValue = Number(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      return res.status(400).json({ error: "Masraf tutari sifirdan buyuk olmali." });
    }

    await execute(
      `
        INSERT INTO expenses (title, category, amount, expense_date, payment_type, note, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [title.trim(), category.trim(), amountValue, date, paymentType, cleanOptional(note), req.session.user.id]
    );

    queueSecurityEvent(req, {
      user: req.session.user,
      eventType: "expense_created",
      severity: "info",
      details: { title: title.trim(), category: category.trim(), amount: amountValue, date },
    });

    return res.json({ ok: true });
  });

  app.delete("/api/expenses/:id", requireAdmin, async (req, res) => {
    const result = await execute("DELETE FROM expenses WHERE id = ?", [Number(req.params.id)]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "Masraf bulunamadi." });
    }
    queueSecurityEvent(req, {
      user: req.session.user,
      eventType: "expense_deleted",
      severity: "warn",
      details: { id: Number(req.params.id) },
    });
    return res.json({ ok: true });
  });

  app.post("/api/cashbook", requireStaffOrAdmin, async (req, res) => {
    const { type, title, amount, date, reference, note } = req.body || {};
    if (!type || !title || !amount || !date) {
      return res.status(400).json({ error: "Kasa hareketi bilgileri eksik." });
    }
    const amountValue = Number(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      return res.status(400).json({ error: "Kasa tutari sifirdan buyuk olmali." });
    }

    const entryType = type === "unbilled_sale" ? "in" : type;
    if (!["in", "out"].includes(entryType)) {
      return res.status(400).json({ error: "Gecersiz kasa hareket tipi." });
    }

    const entryNote = type === "unbilled_sale"
      ? ["Faturasiz satis", cleanOptional(note)].filter(Boolean).join(" | ")
      : cleanOptional(note);

    await execute(
      `
        INSERT INTO cashbook (type, title, amount, cash_date, reference, note, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [entryType, title.trim(), amountValue, date, cleanOptional(reference), entryNote, req.session.user.id]
    );

    queueSecurityEvent(req, {
      user: req.session.user,
      eventType: "cashbook_created",
      severity: "info",
      details: { type: entryType, title: title.trim(), amount: amountValue, date },
    });

    return res.json({ ok: true, type: entryType, mode: type === "unbilled_sale" ? "unbilled_sale" : entryType });
  });

  app.delete("/api/cashbook/:id", requireStaffOrAdmin, async (req, res) => {
    const result = await execute("DELETE FROM cashbook WHERE id = ?", [Number(req.params.id)]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "Kasa hareketi bulunamadi." });
    }
    queueSecurityEvent(req, {
      user: req.session.user,
      eventType: "cashbook_deleted",
      severity: "warn",
      details: { id: Number(req.params.id) },
    });
    return res.json({ ok: true });
  });

  app.post("/api/pricing/bulk", requireAdmin, async (req, res) => {
    const { brand, category, increasePercent, pricingMode, baseField } = req.body || {};
    const increaseValue = Number(increasePercent || 0);
    if (!Number.isFinite(increaseValue)) {
      return res.status(400).json({ error: "Artis yuzdesi gecerli bir sayi olmali." });
    }
    const multiplier = 1 + increaseValue / 100;
    if (multiplier < 0) {
      return res.status(400).json({ error: "Artis yuzdesi fiyatlari eksiye dusuremez." });
    }
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

    queueSecurityEvent(req, {
      user: req.session.user,
      eventType: "bulk_pricing_updated",
      severity: "info",
      details: { updated: Number(result.rowCount || 0), brand: brand || "all", category: category || "all", increasePercent: increaseValue },
    });

    return res.json({ ok: true, updated: result.rowCount });
  });

  app.post("/api/items/:id/archive", requireAdmin, async (req, res) => {
    const result = await execute("UPDATE items SET is_active = ? WHERE id = ?", [dbClient === "postgres" ? false : 0, Number(req.params.id)]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "Malzeme bulunamadi." });
    }
    queueSecurityEvent(req, {
      user: req.session.user,
      eventType: "item_archived",
      severity: "warn",
      details: { id: Number(req.params.id) },
    });
    return res.json({ ok: true });
  });

  app.post("/api/items/:id/restore", requireAdmin, async (req, res) => {
    const result = await execute("UPDATE items SET is_active = ? WHERE id = ?", [dbClient === "postgres" ? true : 1, Number(req.params.id)]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "Malzeme bulunamadi." });
    }
    queueSecurityEvent(req, {
      user: req.session.user,
      eventType: "item_restored",
      severity: "info",
      details: { id: Number(req.params.id) },
    });
    return res.json({ ok: true });
  });

  app.post("/api/quotes", requireStaffOrAdmin, async (req, res) => {
    const { customerName, title, date, discount, note, items, language, isExport } = req.body || {};
    if (!customerName || !title || !date || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Teklif bilgileri eksik." });
    }
    const discountValue = Number(discount || 0);
    if (!Number.isFinite(discountValue) || discountValue < 0) {
      return res.status(400).json({ error: "Iskonto sifir veya pozitif sayi olmali." });
    }

    let pricedItems;
    try {
      pricedItems = await resolveSaleLineItems(items);
    } catch (error) {
      return res.status(400).json({ error: error.message || "Teklif satirlari gecersiz." });
    }

    const subtotal = pricedItems.reduce((sum, entry) => sum + Number(entry.quantity) * Number(entry.unitPrice), 0);
    if (discountValue > subtotal) {
      return res.status(400).json({ error: "Iskonto ara toplamdan buyuk olamaz." });
    }
    const netTotal = Math.max(subtotal - discountValue, 0);
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
            discountValue,
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
        for (const entry of pricedItems) {
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

      queueSecurityEvent(req, {
        user: req.session.user,
        eventType: "quote_created",
        severity: "info",
        details: { quoteId, customerName: customerName.trim(), grossTotal, lineCount: pricedItems.length },
      });

      return res.json({ ok: true, id: quoteId });
    } catch (_error) {
      return res.status(400).json({ error: "Teklif olusturulamadi." });
    }
  });

  app.post("/api/sales/checkout", requireStaffOrAdmin, async (req, res) => {
    const { customerName, title, date, discount, note, items, language, isExport, paymentType, collectedAmount, reference } = req.body || {};
    if (!customerName || !date || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Direkt satis bilgileri eksik." });
    }
    const discountValue = Number(discount || 0);
    const collectedAmountValue = Number(collectedAmount || 0);
    if (!Number.isFinite(discountValue) || discountValue < 0) {
      return res.status(400).json({ error: "Iskonto sifir veya pozitif sayi olmali." });
    }
    if (!Number.isFinite(collectedAmountValue) || collectedAmountValue < 0) {
      return res.status(400).json({ error: "Tahsil edilen tutar sifir veya pozitif sayi olmali." });
    }

    let pricedItems;
    try {
      pricedItems = await resolveSaleLineItems(items);
    } catch (error) {
      return res.status(400).json({ error: error.message || "Direkt satis satirlari gecersiz." });
    }

    const subtotal = pricedItems.reduce((sum, entry) => sum + Number(entry.quantity) * Number(entry.unitPrice), 0);
    if (discountValue > subtotal) {
      return res.status(400).json({ error: "Iskonto ara toplamdan buyuk olamaz." });
    }
    const netTotal = Math.max(subtotal - discountValue, 0);
    const exportSale = isTruthy(isExport);
    const vatRate = exportSale ? 0 : 19;
    const vatAmount = Number((netTotal * (vatRate / 100)).toFixed(2));
    const grossTotal = Number((netTotal + vatAmount).toFixed(2));
    if (collectedAmountValue > grossTotal) {
      return res.status(400).json({ error: "Tahsil edilen tutar satis toplamindan buyuk olamaz." });
    }
    const paid = collectedAmountValue;
    const quoteNo = await generateQuoteNo(date);

    try {
      const saleResult = await withTransaction(async (tx) => {
        await assertSaleStockAvailability(pricedItems, tx);

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
            discountValue,
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
        for (const entry of pricedItems) {
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

      queueSecurityEvent(req, {
        user: req.session.user,
        eventType: "sale_completed",
        severity: "info",
        details: {
          saleId: saleResult.id,
          customerName: customerName.trim(),
          grossTotal,
          paid: saleResult.paid,
          remaining: Math.max(Number((grossTotal - paid).toFixed(2)), 0),
          lineCount: pricedItems.length,
        },
      });

      return res.json({ ok: true, id: saleResult.id, paid: saleResult.paid, remaining: Math.max(Number((grossTotal - paid).toFixed(2)), 0) });
    } catch (error) {
      return res.status(400).json({ error: error.message || "Direkt satis olusturulamadi." });
    }
  });

  app.post("/api/sales/unbilled-checkout", requireStaffOrAdmin, async (req, res) => {
    const { customerName, title, date, discount, note, items, paymentType, collectedAmount, reference } = req.body || {};
    if (!date || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Faturasiz satis bilgileri eksik." });
    }
    const discountValue = Number(discount || 0);
    const collectedAmountValue = Number(collectedAmount || 0);
    if (!Number.isFinite(discountValue) || discountValue < 0) {
      return res.status(400).json({ error: "Iskonto sifir veya pozitif sayi olmali." });
    }
    if (!Number.isFinite(collectedAmountValue) || collectedAmountValue < 0) {
      return res.status(400).json({ error: "Tahsil edilen tutar sifir veya pozitif sayi olmali." });
    }

    const resolvedCustomer = cleanOptional(customerName) || "Perakende Musteri";
    const resolvedTitle = cleanOptional(title) || "Perakende Satis";
    let pricedItems;
    try {
      pricedItems = await resolveSaleLineItems(items);
    } catch (error) {
      return res.status(400).json({ error: error.message || "Faturasiz satis satirlari gecersiz." });
    }

    const subtotal = pricedItems.reduce((sum, entry) => sum + Number(entry.quantity) * Number(entry.unitPrice), 0);
    if (discountValue > subtotal) {
      return res.status(400).json({ error: "Iskonto ara toplamdan buyuk olamaz." });
    }
    const saleTotal = Math.max(subtotal - discountValue, 0);
    if (collectedAmountValue > saleTotal) {
      return res.status(400).json({ error: "Tahsil edilen tutar satis toplamindan buyuk olamaz." });
    }
    const paid = collectedAmountValue;

    try {
      const saleResult = await withTransaction(async (tx) => {
        await assertSaleStockAvailability(pricedItems, tx);

        for (const entry of pricedItems) {
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
              `Faturasiz satis - ${resolvedCustomer}${resolvedTitle ? ` | ${resolvedTitle}` : ""}`,
              req.session.user.id,
            ]
          );
        }

        let cashEntryId = null;
        if (paid > 0) {
          const cashResult = await tx.execute(
            `
              INSERT INTO cashbook (type, title, amount, cash_date, reference, note, user_id)
              VALUES ('in', ?, ?, ?, ?, ?, ?)
              RETURNING id
            `,
            [
              `Faturasiz satis tahsilati - ${resolvedCustomer}`,
              paid,
              date,
              cleanOptional(reference),
              [
                "Faturasiz satis",
                resolvedTitle,
                cleanOptional(paymentType) || "cash",
                cleanOptional(note),
              ].filter(Boolean).join(" | "),
              req.session.user.id,
            ]
          );
          cashEntryId = Number(cashResult.rows[0]?.id || cashResult.lastInsertId);
        }

        return { paid, cashEntryId };
      });

      queueSecurityEvent(req, {
        user: req.session.user,
        eventType: "unbilled_sale_completed",
        severity: "info",
        details: {
          customerName: resolvedCustomer,
          total: Number(saleTotal.toFixed(2)),
          paid: saleResult.paid,
          remaining: Math.max(Number((saleTotal - paid).toFixed(2)), 0),
          cashEntryId: saleResult.cashEntryId || 0,
          lineCount: pricedItems.length,
        },
      });

      return res.json({
        ok: true,
        total: Number(saleTotal.toFixed(2)),
        paid: saleResult.paid,
        remaining: Math.max(Number((saleTotal - paid).toFixed(2)), 0),
        cashEntryId: saleResult.cashEntryId,
      });
    } catch (error) {
      return res.status(400).json({ error: error.message || "Faturasiz satis olusturulamadi." });
    }
  });

  app.post("/api/orders", requireCustomer, async (req, res) => {
    const { date, note, items } = req.body || {};
    if (!date || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Siparis icin tarih ve en az bir kalem gerekli." });
    }

    try {
      const orderId = await withTransaction(async (tx) => {
        const orderLines = [];

        for (const entry of items) {
          const quantity = Number(entry.quantity);
          if (!Number.isFinite(quantity) || quantity <= 0) {
            throw new Error("Siparis miktari sifirdan buyuk olmali.");
          }

          const item = await tx.get("SELECT id, name, unit, is_active FROM items WHERE id = ?", [Number(entry.itemId)]);
          if (!item) {
            throw new Error("Siparis icindeki bir urun bulunamadi.");
          }
          if (item.is_active === false || item.is_active === 0) {
            throw new Error("Siparis icindeki bir urun aktif degil.");
          }

          orderLines.push({
            itemId: Number(item.id),
            itemName: item.name,
            quantity,
            unit: entry.unit || item.unit || "adet",
          });
        }

        const orderTotals = new Map();
        for (const line of orderLines) {
          orderTotals.set(line.itemId, (orderTotals.get(line.itemId) || 0) + line.quantity);
        }

        for (const [itemId, totalQuantity] of orderTotals.entries()) {
          const currentStock = await getItemStock(itemId, tx);
          if (totalQuantity > currentStock) {
            const line = orderLines.find((entry) => entry.itemId === itemId);
            throw new Error(`${line?.itemName || "Urun"} icin stok yetersiz.`);
          }
        }

        const orderResult = await tx.execute(
          `
            INSERT INTO orders (customer_user_id, customer_name, order_date, status, note)
            VALUES (?, ?, ?, 'pending', ?)
            RETURNING id
          `,
          [req.session.user.id, req.session.user.name, date, cleanOptional(note)]
        );

        const insertedOrderId = Number(orderResult.rows[0]?.id || orderResult.lastInsertId);

        for (const entry of orderLines) {
          await tx.execute(
            `
              INSERT INTO order_items (order_id, item_id, item_name, quantity, unit)
              VALUES (?, ?, ?, ?, ?)
            `,
            [
              insertedOrderId,
              entry.itemId,
              entry.itemName,
              entry.quantity,
              entry.unit,
            ]
          );
        }

        return insertedOrderId;
      });

      queueSecurityEvent(req, {
        user: req.session.user,
        eventType: "order_created",
        severity: "info",
        details: { orderId, lineCount: items.length, date },
      });

      return res.json({ ok: true, id: orderId });
    } catch (error) {
      return res.status(400).json({ error: error.message || "Siparis olusturulamadi." });
    }
  });

  app.post("/api/orders/:id/status", requireStaffOrAdmin, async (req, res) => {
    const status = cleanOptional(req.body?.status).toLowerCase();
    const language = req.body?.language === "de" ? "de" : "tr";
    if (!["pending", "approved", "preparing", "completed", "cancelled"].includes(status)) {
      return res.status(400).json({ error: "Gecersiz siparis durumu." });
    }

    const order = await get(
      `
        SELECT orders.id, orders.customer_name, orders.order_date, users.email, users.name AS user_name
        FROM orders
        LEFT JOIN users ON users.id = orders.customer_user_id
        WHERE orders.id = ?
      `,
      [Number(req.params.id)]
    );
    if (!order) {
      return res.status(404).json({ error: "Siparis bulunamadi." });
    }

    const result = await execute("UPDATE orders SET status = ? WHERE id = ?", [status, Number(req.params.id)]);
    if (result.rowCount && order.email) {
      await sendOrderStatusEmail(
        { name: order.user_name || order.customer_name, email: order.email },
        {
          id: Number(order.id),
          customerName: order.customer_name,
          date: order.order_date,
          status,
          language,
        }
      );
    }
    if (result.rowCount) {
      queueSecurityEvent(req, {
        user: req.session.user,
        eventType: "order_status_updated",
        severity: "info",
        details: { orderId: Number(req.params.id), status, language },
      });
    }
    return res.json({ ok: true });
  });

  app.get("/api/quotes/:id/pdf", requireStaffOrAdmin, async (req, res) => {
    const quote = await getQuoteById(Number(req.params.id), req.session.user);
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

  app.get("/api/barcodes/:itemId", requireStaffOrAdmin, async (req, res) => {
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

  app.get("/api/reports/xlsx", requireAdmin, async (req, res) => {
    const bootstrap = await buildBootstrap(req.session.user);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(bootstrap.items), "Malzemeler");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(bootstrap.movements), "Hareketler");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(bootstrap.expenses), "Masraflar");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(bootstrap.cashbook), "Kasa");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", 'attachment; filename="hamburg-depo-rapor.xlsx"');
    res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").send(buffer);
  });

  app.get("/api/reports/pdf", requireAdmin, async (req, res) => {
    const summary = sanitizeSummaryForRole(await computeSummary(), req.session.user?.role);
    const items = sanitizeItemsForRole(await queryItems(), req.session.user);
    const doc = new PDFDocument({ margin: 40, size: "A4" });

    res.setHeader("Content-Disposition", 'attachment; filename="hamburg-depo-ozet.pdf"');
    res.type("application/pdf");
    doc.pipe(res);

    doc.fontSize(20).text("Durmusbaba Ozet Raporu");
    doc.moveDown();
    doc.fontSize(11).text(`Toplam malzeme: ${summary.totalItems}`);
    doc.text(`Stok maliyeti: ${summary.stockCostValue.toFixed(2)} EUR`);
    doc.text(`Satis stok degeri: ${summary.stockSaleValue.toFixed(2)} EUR`);
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

  app.get("/admin-tools/:tool", requireAuth, serveAdminTool);
  app.get("/admin-tools/:tool/", requireAuth, serveAdminTool);
  app.get("/admin-tools/:tool/*", requireAuth, serveAdminTool);

  app.use((error, _req, res, next) => {
    if (error?.type === "entity.too.large") {
      return res.status(413).json({ error: "Istek boyutu izin verilen siniri asti." });
    }
    if (error instanceof SyntaxError && error.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Gecersiz JSON gonderildi." });
    }
    return next(error);
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
    console.log(`Durmusbaba sunucusu calisiyor: http://${host}:${port}`);
  });
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    queueSecurityEvent(req, {
      eventType: "access_denied",
      severity: "warn",
      details: { requirement: "auth" },
    });
    return res.status(401).json({ error: "Oturum acmaniz gerekiyor." });
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    queueSecurityEvent(req, {
      eventType: "access_denied",
      severity: "warn",
      details: { requirement: "admin" },
    });
    return res.status(401).json({ error: "Oturum acmaniz gerekiyor." });
  }
  if (!isAdminRole(req.session.user.role)) {
    queueSecurityEvent(req, {
      user: req.session.user,
      eventType: "access_denied",
      severity: "warn",
      details: { requirement: "admin" },
    });
    return res.status(403).json({ error: "Bu islem icin admin yetkisi gerekiyor." });
  }
  return next();
}

function requireStaffOrAdmin(req, res, next) {
  if (!req.session.user) {
    queueSecurityEvent(req, {
      eventType: "access_denied",
      severity: "warn",
      details: { requirement: "staff_or_admin" },
    });
    return res.status(401).json({ error: "Oturum acmaniz gerekiyor." });
  }
  if (!isStaffRole(req.session.user.role) && !isAdminRole(req.session.user.role)) {
    queueSecurityEvent(req, {
      user: req.session.user,
      eventType: "access_denied",
      severity: "warn",
      details: { requirement: "staff_or_admin" },
    });
    return res.status(403).json({ error: "Bu islem icin personel veya admin yetkisi gerekiyor." });
  }
  return next();
}

function requireCustomer(req, res, next) {
  if (!req.session.user) {
    queueSecurityEvent(req, {
      eventType: "access_denied",
      severity: "warn",
      details: { requirement: "customer" },
    });
    return res.status(401).json({ error: "Oturum acmaniz gerekiyor." });
  }
  if (!isCustomerRole(req.session.user.role)) {
    queueSecurityEvent(req, {
      user: req.session.user,
      eventType: "access_denied",
      severity: "warn",
      details: { requirement: "customer" },
    });
    return res.status(403).json({ error: "Bu islem sadece musteri kullanicilari icindir." });
  }
  return next();
}

function resolveAdminToolsDir() {
  const candidates = [
    path.resolve(process.cwd(), "admin-tools"),
    path.resolve(__dirname, "..", "admin-tools"),
    path.resolve(path.dirname(require.main?.filename || process.argv[1] || __filename), "..", "admin-tools"),
  ];

  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate) && fs.statSync(candidate).isDirectory();
    } catch (_error) {
      return false;
    }
  }) || candidates[0];
}

function serveAdminTool(req, res) {
  const tool = req.params.tool;
  if (!ADMIN_TOOLS.has(tool)) {
    return res.status(404).send("Arac bulunamadi.");
  }

  const root = path.resolve(resolveAdminToolsDir(), tool);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return res.status(404).send("Arac dosyalari bulunamadi.");
  }
  const requestedPath = req.params[0] || "index.html";
  if (path.isAbsolute(requestedPath) || requestedPath.split(/[\\/]+/).includes("..")) {
    return res.status(403).send("Gecersiz arac yolu.");
  }
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.resolve(root, safePath || "index.html");

  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    return res.status(403).send("Gecersiz arac yolu.");
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(root, "index.html");
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return res.status(404).send("Arac giris dosyasi bulunamadi.");
  }

  res.type(path.extname(filePath));
  return res.send(fs.readFileSync(filePath));
}

function initializeSecurityAuditQueue(req, res, next) {
  req.securityAuditQueue = [];
  res.on("finish", () => {
    flushQueuedSecurityEvents(req).catch((error) => {
      console.error("Guvenlik olayi yazilamadi.", error);
    });
  });
  next();
}

function queueSecurityEvent(req, event) {
  if (!req) {
    return;
  }
  req.securityAuditQueue = req.securityAuditQueue || [];
  req.securityAuditQueue.push(normalizeSecurityEventPayload(req, event));
}

async function flushQueuedSecurityEvents(req) {
  const queue = Array.isArray(req?.securityAuditQueue) ? req.securityAuditQueue.splice(0) : [];
  for (const entry of queue) {
    await insertSecurityEvent(entry);
  }
}

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
  if (!threshold) {
    return null;
  }

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
  if (count < threshold) {
    return null;
  }

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
  if (existing) {
    return existing;
  }

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

  if (!block) {
    return null;
  }

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

function sanitizeSecurityDetails(details) {
  if (!details || typeof details !== "object") {
    return {};
  }

  const output = {};
  for (const [key, value] of Object.entries(details)) {
    if (value === undefined) {
      continue;
    }
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

function normalizeSecuritySeverity(value) {
  const normalized = String(value || "info").toLowerCase();
  if (["info", "warn", "critical"].includes(normalized)) {
    return normalized;
  }
  return "info";
}

function isFutureTimestamp(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) && time > Date.now();
}

function normalizeAdminMessageCategory(value) {
  const normalized = String(value || "request").trim().toLowerCase();
  if (["request", "complaint", "suggestion"].includes(normalized)) {
    return normalized;
  }
  return "request";
}

function normalizeAdminMessageStatus(value) {
  const normalized = String(value || "new").trim().toLowerCase();
  if (["new", "read", "closed"].includes(normalized)) {
    return normalized;
  }
  return "new";
}

function applySecurityHeaders(req, res, next) {
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  res.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.set("Cross-Origin-Resource-Policy", "same-origin");
  if (IS_SECURE_PROXY) {
    res.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  res.set("Content-Security-Policy", buildContentSecurityPolicy(req));
  next();
}

function buildContentSecurityPolicy(req) {
  const isAdminToolRequest = req.path.startsWith("/admin-tools");
  const directives = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "connect-src": ["'self'"],
    "script-src": isAdminToolRequest
      ? ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com"]
      : ["'self'", "'unsafe-inline'"],
  };

  return Object.entries(directives)
    .map(([directive, values]) => `${directive} ${values.join(" ")}`)
    .join("; ");
}

async function validateBrowserRequestOrigin(req, res, next) {
  try {
    const method = String(req.method || "GET").toUpperCase();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      return next();
    }

    const secFetchSite = String(req.get("sec-fetch-site") || "").toLowerCase();
    if (secFetchSite && !["same-origin", "same-site", "none"].includes(secFetchSite)) {
      await insertSecurityEvent(normalizeSecurityEventPayload(req, {
        eventType: "origin_blocked",
        severity: "warn",
        details: { secFetchSite },
      }));
      await autoBlockIfThresholdReached(req, "origin_blocked", {
        threshold: SECURITY_ORIGIN_FAILURE_THRESHOLD,
        windowMs: SECURITY_FAILURE_WINDOW_MS,
        blockDurationMs: SECURITY_ORIGIN_BLOCK_MS,
        reason: "Supheli cross-site istekler",
      });
      return res.status(403).json({ error: "Gecersiz istek kaynagi." });
    }

    const origin = normalizeOrigin(req.get("origin"));
    if (!origin) {
      return next();
    }

    const allowedOrigins = new Set([getRequestOrigin(req)]);
    const configuredOrigin = normalizeOrigin(APP_BASE_URL);
    if (configuredOrigin) {
      allowedOrigins.add(configuredOrigin);
    }

    if (!allowedOrigins.has(origin)) {
      await insertSecurityEvent(normalizeSecurityEventPayload(req, {
        eventType: "origin_blocked",
        severity: "warn",
        details: { origin, allowedOrigins: [...allowedOrigins] },
      }));
      await autoBlockIfThresholdReached(req, "origin_blocked", {
        threshold: SECURITY_ORIGIN_FAILURE_THRESHOLD,
        windowMs: SECURITY_FAILURE_WINDOW_MS,
        blockDurationMs: SECURITY_ORIGIN_BLOCK_MS,
        reason: "Supheli cross-site istekler",
      });
      return res.status(403).json({ error: "Bu istek kaynagi engellendi." });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

function createRateLimiter({ name, windowMs, max, keyFn, message }) {
  return async (req, res, next) => {
    try {
      const now = Date.now();
      const key = `${name}:${typeof keyFn === "function" ? keyFn(req) : getClientIp(req)}`;
      const bucket = RATE_LIMIT_BUCKETS.get(key) || [];
      const fresh = bucket.filter((timestamp) => now - timestamp < windowMs);

      if (fresh.length >= max) {
        const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - fresh[0])) / 1000));
        RATE_LIMIT_BUCKETS.set(key, fresh);
        res.set("Retry-After", String(retryAfterSeconds));
        await insertSecurityEvent(normalizeSecurityEventPayload(req, {
          eventType: "rate_limit_hit",
          severity: name === "auth-api" ? "critical" : "warn",
          details: { limiter: name, retryAfterSeconds, hits: fresh.length },
        }));
        if (name === "auth-api") {
          await activateSecurityBlock(req, {
            reason: "Asiri kimlik dogrulama denemesi",
            eventType: "rate_limit_hit",
            blockDurationMs: SECURITY_RATE_LIMIT_BLOCK_MS,
            eventCount: fresh.length,
          });
        }
        return res.status(429).json({ error: message || "Cok fazla istek gonderildi." });
      }

      fresh.push(now);
      RATE_LIMIT_BUCKETS.set(key, fresh);

      if (RATE_LIMIT_BUCKETS.size > 5000) {
        pruneRateLimitBuckets(now);
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function pruneRateLimitBuckets(now = Date.now()) {
  for (const [key, timestamps] of RATE_LIMIT_BUCKETS.entries()) {
    const fresh = timestamps.filter((timestamp) => now - timestamp < AUTH_RATE_WINDOW_MS);
    if (fresh.length === 0) {
      RATE_LIMIT_BUCKETS.delete(key);
    } else {
      RATE_LIMIT_BUCKETS.set(key, fresh);
    }
  }
}

function getClientIp(req) {
  const forwardedFor = String(req.get("x-forwarded-for") || "").split(",")[0].trim();
  return forwardedFor || req.ip || req.socket?.remoteAddress || "unknown";
}

function getRequestOrigin(req) {
  const protocol = req.protocol || (IS_SECURE_PROXY ? "https" : "http");
  return `${protocol}://${req.get("host")}`;
}

function normalizeOrigin(value) {
  const input = cleanOptional(value);
  if (!input) {
    return "";
  }

  try {
    return new URL(input).origin;
  } catch (_error) {
    return "";
  }
}

function normalizeRole(role) {
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

function cleanOptional(value) {
  return value ? String(value).trim() : "";
}

function isNonNegativeFinite(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0;
}

function parseItemNumericFields({ minStock, defaultPrice, listPrice, salePrice }) {
  const fields = {
    minStock: Number(minStock || 0),
    defaultPrice: Number(defaultPrice || 0),
    listPrice: Number(listPrice || 0),
    salePrice: Number(salePrice || 0),
  };

  return Object.values(fields).every(isNonNegativeFinite) ? fields : null;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeEmail(value) {
  return cleanOptional(value).toLowerCase();
}

function normalizePhone(value) {
  const raw = cleanOptional(value);
  if (!raw) {
    return "";
  }
  const normalized = raw.replace(/[^\d+]/g, "");
  return normalized.startsWith("+") ? normalized : `+${normalized.replace(/\D/g, "")}`;
}

function toBoolean(value) {
  return value === true || value === 1 || value === "1" || value === "true" || value === "t";
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function normalizeUsername(value) {
  return cleanOptional(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 28);
}

function normalizeTrainingAudience(value) {
  return ["all", "admin", "staff", "customer"].includes(value) ? value : "all";
}

function parseTrainingSuggestions(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => cleanOptional(item)).filter(Boolean).slice(0, 6);
  }

  try {
    const parsed = JSON.parse(String(value));
    if (Array.isArray(parsed)) {
      return parsed.map((item) => cleanOptional(item)).filter(Boolean).slice(0, 6);
    }
  } catch (_error) {
    // Fall back to plain text parsing.
  }

  return String(value)
    .split(/\r?\n|,/)
    .map((item) => cleanOptional(item))
    .filter(Boolean)
    .slice(0, 6);
}

function normalizeTrainingPayload(body) {
  const trQuestion = cleanOptional(body?.trQuestion);
  const trAnswer = cleanOptional(body?.trAnswer);
  const deQuestion = cleanOptional(body?.deQuestion);
  const deAnswer = cleanOptional(body?.deAnswer);

  if (!trQuestion || !trAnswer) {
    return { error: "Turkce soru ve cevap zorunlu." };
  }

  return {
    topic: cleanOptional(body?.topic),
    audience: normalizeTrainingAudience(cleanOptional(body?.audience)),
    keywords: cleanOptional(body?.keywords),
    trQuestion,
    trAnswer,
    deQuestion,
    deAnswer,
    suggestions: parseTrainingSuggestions(body?.suggestions),
    isActive: body?.isActive !== "false" && body?.isActive !== false && body?.isActive !== "0",
  };
}

function sessionUserFromRow(user) {
  return {
    id: Number(user.id),
    name: user.name,
    username: user.username,
    email: user.email || "",
    phone: user.phone || "",
    emailVerified: toBoolean(user.email_verified),
    role: normalizeRole(user.role),
  };
}

async function findUserByLoginIdentifier(identifier) {
  if (!identifier) {
    return null;
  }

  return get(
    `
      SELECT *
      FROM users
      WHERE LOWER(username) = LOWER(?) OR LOWER(COALESCE(email, '')) = LOWER(?)
      LIMIT 1
    `,
    [identifier, identifier]
  );
}

async function generateUniqueUsernameFromEmail(email) {
  const base = normalizeUsername(String(email || "").split("@")[0]) || "musteri";
  let candidate = base;
  let counter = 1;

  while (await get("SELECT id FROM users WHERE LOWER(username) = LOWER(?)", [candidate])) {
    counter += 1;
    candidate = `${base}${counter}`.slice(0, 28);
  }

  return candidate;
}

function hashAuthToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

async function issueAuthToken(userId, tokenType, expiresInHours = 2) {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
  await execute("UPDATE auth_tokens SET consumed_at = ? WHERE user_id = ? AND token_type = ? AND consumed_at IS NULL", [
    new Date().toISOString(),
    userId,
    tokenType,
  ]);
  await execute(
    "INSERT INTO auth_tokens (user_id, token_type, token_hash, expires_at) VALUES (?, ?, ?, ?)",
    [userId, tokenType, hashAuthToken(token), expiresAt]
  );
  return token;
}

async function consumeAuthToken(token, tokenType) {
  const tokenHash = hashAuthToken(token);
  const row = await get(
    `
      SELECT id, user_id, expires_at, consumed_at
      FROM auth_tokens
      WHERE token_type = ? AND token_hash = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [tokenType, tokenHash]
  );

  if (!row || row.consumed_at) {
    return null;
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await execute("UPDATE auth_tokens SET consumed_at = ? WHERE id = ?", [new Date().toISOString(), Number(row.id)]);
    return null;
  }

  await execute("UPDATE auth_tokens SET consumed_at = ? WHERE id = ?", [new Date().toISOString(), Number(row.id)]);
  return row;
}

function getAppBaseUrl(req) {
  const protocol = req?.get("x-forwarded-proto") || req?.protocol || "https";
  const host = req?.get("x-forwarded-host") || req?.get("host");
  if (host) {
    return `${protocol}://${host}`;
  }

  if (APP_BASE_URL) {
    return APP_BASE_URL.replace(/\/$/, "");
  }

  return "https://drckaltetechnik.vercel.app";
}

function buildWhatsAppUrl(phone, message) {
  const normalizedPhone = String(phone || "").replace(/\D/g, "");
  if (!normalizedPhone) {
    return "";
  }
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}

function createPasswordResetWhatsappText({ name, resetUrl, language = "tr" }) {
  if (language === "de") {
    return [
      `Hallo ${name || ""},`,
      "Ihr Link zum Zuruecksetzen des Passworts ist bereit:",
      resetUrl,
      "Der Link ist 2 Stunden gueltig.",
    ].join("\n");
  }

  return [
    `Merhaba ${name || ""},`,
    "DRC sifre yenileme baglantiniz hazir:",
    resetUrl,
    "Baglanti 2 saat gecerlidir.",
  ].join("\n");
}

function getOrderStatusTranslations(language = "tr") {
  if (language === "de") {
    return {
      subject: "DRC Bestellstatus",
      heading: "DRC Bestellinformation",
      greeting: "Hallo",
      orderLabel: "Bestellung",
      statusPrefix: "Der Status Ihrer Bestellung wurde aktualisiert",
      newStatus: "Neuer Status",
      orderDate: "Bestelldatum",
      labels: {
        pending: "Offen",
        approved: "Bestaetigt",
        preparing: "In Vorbereitung",
        completed: "Abgeschlossen",
        cancelled: "Storniert",
      },
    };
  }

  return {
    subject: "DRC Siparis Durumu",
    heading: "DRC Siparis Bilgilendirmesi",
    greeting: "Merhaba",
    orderLabel: "Siparis",
    statusPrefix: "numarali siparisinizin durumu guncellendi",
    newStatus: "Yeni durum",
    orderDate: "Siparis tarihi",
    labels: {
      pending: "Beklemede",
      approved: "Onaylandi",
      preparing: "Hazirlaniyor",
      completed: "Tamamlandi",
      cancelled: "Iptal Edildi",
    },
  };
}

function getMailSenderAddress(provider = "default") {
  if (provider === "gmail") {
    return process.env.GMAIL_FROM || GMAIL_USER || process.env.MAIL_FROM || COMPANY_PROFILE.email;
  }

  return process.env.MAIL_FROM || GMAIL_USER || COMPANY_PROFILE.email;
}

function getGmailTransporter() {
  if (!gmailTransporter) {
    gmailTransporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
      },
    });
  }

  return gmailTransporter;
}

async function sendEmail({ to, subject, html, text }) {
  if (GMAIL_USER && GMAIL_APP_PASSWORD) {
    try {
      await getGmailTransporter().sendMail({
        from: getMailSenderAddress("gmail"),
        to,
        subject,
        html,
        text,
      });
      return { sent: true, provider: "gmail" };
    } catch (error) {
      console.error("Gmail ile mail gonderilemedi:", error);
      return { sent: false, reason: "provider_error", provider: "gmail" };
    }
  }

  if (!RESEND_API_KEY || !getMailSenderAddress()) {
    console.log(`Mail gonderimi atlandi (${subject}) -> ${to}`);
    return { sent: false, reason: "not_configured" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: getMailSenderAddress(),
      to: [to],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("Mail gonderilemedi:", response.status, body);
    return { sent: false, reason: "provider_error" };
  }

  return { sent: true };
}

async function sendVerificationEmail(user, verifyUrl) {
  if (!user?.email) {
    return { sent: false, reason: "missing_email" };
  }

  return sendEmail({
    to: user.email,
    subject: "DRC Musteri Hesabi - E-posta Dogrulama",
    text: `Merhaba ${user.name || ""},\n\nHesabinizi dogrulamak icin asagidaki baglantiyi acin:\n${verifyUrl}\n\nBaglanti 24 saat gecerlidir.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
        <h2>DRC Musteri Hesabi</h2>
        <p>Merhaba ${escapeHtml(user.name || "")},</p>
        <p>Hesabinizi dogrulamak icin asagidaki baglantiyi acin:</p>
        <p><a href="${verifyUrl}">${verifyUrl}</a></p>
        <p>Baglanti 24 saat gecerlidir.</p>
      </div>
    `,
  });
}

async function sendPasswordResetEmail(user, resetUrl) {
  if (!user?.email) {
    return { sent: false, reason: "missing_email" };
  }

  return sendEmail({
    to: user.email,
    subject: "DRC Musteri Hesabi - Sifre Yenileme",
    text: `Merhaba ${user.name || ""},\n\nSifrenizi yenilemek icin asagidaki baglantiyi acin:\n${resetUrl}\n\nBaglanti 2 saat gecerlidir.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
        <h2>DRC Musteri Hesabi</h2>
        <p>Merhaba ${escapeHtml(user.name || "")},</p>
        <p>Sifrenizi yenilemek icin asagidaki baglantiyi acin:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>Baglanti 2 saat gecerlidir.</p>
      </div>
    `,
  });
}

async function sendOrderStatusEmail(user, order) {
  if (!user?.email) {
    return { sent: false, reason: "missing_email" };
  }

  const language = order?.language === "de" ? "de" : "tr";
  const text = getOrderStatusTranslations(language);
  const statusLabel = text.labels[order.status] || order.status;

  return sendEmail({
    to: user.email,
    subject: `${text.subject} - ${text.orderLabel} #${order.id}`,
    text: `${text.greeting} ${user.name || ""},\n\n#${order.id} ${text.statusPrefix}: ${statusLabel}.\n${text.orderDate}: ${order.date}\n`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
        <h2>${text.heading}</h2>
        <p>${text.greeting} ${escapeHtml(user.name || "")},</p>
        <p><strong>#${order.id}</strong> ${text.statusPrefix}.</p>
        <p>${text.newStatus}: <strong>${escapeHtml(statusLabel)}</strong></p>
        <p>${text.orderDate}: ${escapeHtml(order.date || "")}</p>
      </div>
    `,
  });
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

async function getLastEntryUnitPrice(itemId, fallbackPrice = 0, executor = null) {
  const getter = executor?.get ? executor.get.bind(executor) : get;
  const row = await getter(
    `
      SELECT COALESCE((
        SELECT unit_price
        FROM movements
        WHERE item_id = ? AND type = 'entry'
        ORDER BY movement_date DESC, id DESC
        LIMIT 1
      ), ?) AS unit_price
    `,
    [itemId, Number(fallbackPrice || 0)]
  );

  return Number(row?.unit_price || 0);
}

async function resolveMovementUnitPrice({ itemId, requestedUnitPrice, defaultPrice = 0, role, executor = null }) {
  const requestedValue = Number(requestedUnitPrice || 0);
  if (isAdminRole(role) && requestedValue > 0) {
    return requestedValue;
  }

  return getLastEntryUnitPrice(itemId, defaultPrice, executor);
}

async function resolveSaleLineItems(items, executor = null) {
  const getter = executor?.get ? executor.get.bind(executor) : get;
  const activeValue = dbClient === "postgres" ? true : 1;
  const resolved = [];

  for (const entry of items) {
    const itemId = Number(entry.itemId);
    const quantity = Number(entry.quantity);
    if (!Number.isFinite(itemId) || itemId <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Satis satirinda urun veya miktar gecersiz.");
    }

    const item = await getter(
      "SELECT id, name, unit, list_price, sale_price FROM items WHERE id = ? AND COALESCE(is_active, TRUE) = ?",
      [itemId, activeValue]
    );
    if (!item) {
      throw new Error("Satis satirindaki urun bulunamadi veya arsivde.");
    }

    const unitPrice = resolveCustomerUnitPrice(item, quantity);
    if (unitPrice <= 0) {
      throw new Error(`${item.name} icin satis fiyati girilmemis.`);
    }

    resolved.push({
      itemId,
      itemName: item.name,
      quantity,
      unit: item.unit || entry.unit || "adet",
      unitPrice,
      total: quantity * unitPrice,
    });
  }

  return resolved;
}

async function assertSaleStockAvailability(items, executor) {
  const totalsByItemId = new Map();

  for (const entry of items) {
    const itemId = Number(entry.itemId);
    const quantity = Number(entry.quantity);
    totalsByItemId.set(itemId, (totalsByItemId.get(itemId) || 0) + quantity);
  }

  for (const [itemId, totalQuantity] of totalsByItemId.entries()) {
    const item = await executor.get("SELECT id, name FROM items WHERE id = ?", [itemId]);
    if (!item) {
      throw new Error("Malzeme bulunamadi.");
    }

    const stock = await getItemStock(itemId, executor);
    if (totalQuantity > stock) {
      const line = items.find((entry) => Number(entry.itemId) === itemId);
      throw new Error(`${line?.itemName || item.name} icin yeterli stok yok.`);
    }
  }
}

function resolveCustomerUnitPrice(item, quantity) {
  const listPrice = Number(item.list_price || item.listPrice || 0);
  const netPrice = Number(item.sale_price || item.salePrice || 0);
  if (Number(quantity) <= 1 && listPrice > 0) {
    return listPrice;
  }

  return netPrice > 0 ? netPrice : listPrice;
}

async function queryItems(isActive = true) {
  const activeValue = dbClient === "postgres" ? Boolean(isActive) : (isActive ? 1 : 0);
  const rows = await query(
    `
      WITH movement_summary AS (
        SELECT
          item_id,
          SUM(CASE WHEN type = 'entry' THEN quantity ELSE -quantity END) AS current_stock,
          SUM(CASE WHEN type = 'entry' THEN quantity * unit_price ELSE 0 END) / NULLIF(SUM(CASE WHEN type = 'entry' THEN quantity ELSE 0 END), 0) AS average_purchase_price
        FROM movements
        GROUP BY item_id
      ),
      last_entry AS (
        SELECT item_id, unit_price
        FROM (
          SELECT
            item_id,
            unit_price,
            ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY movement_date DESC, id DESC) AS row_number
          FROM movements
          WHERE type = 'entry'
        ) ranked_entries
        WHERE row_number = 1
      )
      SELECT
        items.*,
        COALESCE(movement_summary.current_stock, 0) AS current_stock,
        COALESCE(last_entry.unit_price, 0) AS last_purchase_price,
        COALESCE(movement_summary.average_purchase_price, 0) AS average_purchase_price
      FROM items
      LEFT JOIN movement_summary ON movement_summary.item_id = items.id
      LEFT JOIN last_entry ON last_entry.item_id = items.id
      WHERE COALESCE(items.is_active, TRUE) = ?
      ORDER BY created_at DESC, id DESC
    `,
    [activeValue]
  );

  return rows.map(mapItemRow);
}

async function queryCustomerItems(options = {}) {
  const includePrices = options.includePrices === true;
  const activeValue = dbClient === "postgres" ? true : 1;
  const rows = await query(
    `
      WITH movement_summary AS (
        SELECT
          item_id,
          SUM(CASE WHEN type = 'entry' THEN quantity ELSE -quantity END) AS current_stock
        FROM movements
        GROUP BY item_id
      )
      SELECT
        items.id,
        items.name,
        items.brand,
        items.category,
        items.unit,
        items.min_stock,
        items.barcode,
        items.notes,
        items.default_price,
        items.list_price,
        items.sale_price,
        COALESCE(movement_summary.current_stock, 0) AS current_stock
      FROM items
      LEFT JOIN movement_summary ON movement_summary.item_id = items.id
      WHERE COALESCE(items.is_active, TRUE) = ?
        AND COALESCE(movement_summary.current_stock, 0) > 0
      ORDER BY items.name ASC, items.id ASC
    `,
    [activeValue]
  );

  return rows.map((row) => mapItemRow(row, { includePrices }));
}

function mapItemRow(row, options = {}) {
  const includePrices = options.includePrices !== false;
  return {
    id: Number(row.id),
    name: row.name,
    brand: row.brand || deriveBrand(row),
    category: row.category,
    unit: row.unit,
    minStock: Number(row.min_stock || 0),
    barcode: row.barcode || `ITEM-${String(row.id).padStart(5, "0")}`,
    notes: row.notes,
    currentStock: Number(row.current_stock || 0),
    defaultPrice: includePrices ? Number(row.default_price || 0) : 0,
    listPrice: includePrices ? Number(row.list_price || 0) : 0,
    salePrice: includePrices ? Number(row.sale_price || 0) : 0,
    lastPurchasePrice: includePrices ? Number(row.last_purchase_price || 0) : 0,
    averagePurchasePrice: includePrices ? Number(row.average_purchase_price || 0) : 0,
  };
}

async function queryMovements(user) {
  const normalizedRole = normalizeRole(user?.role);
  const clauses = [];
  const params = [];
  if (normalizedRole === "staff") {
    clauses.push("movements.user_id = ?");
    params.push(Number(user.id));
  }
  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
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
      ${whereClause}
      ORDER BY movements.created_at DESC, movements.id DESC
    `,
    params
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

async function queryCashbook(user = null) {
  const normalizedRole = normalizeRole(user?.role);
  const clauses = [];
  const params = [];
  if (normalizedRole === "staff") {
    clauses.push("cashbook.user_id = ?");
    params.push(Number(user.id));
  }
  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
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
      ${whereClause}
      ORDER BY cashbook.created_at DESC, cashbook.id DESC
    `,
    params
  );

  return rows.map(numberizeRow);
}

async function queryUsers() {
  const rows = await query("SELECT id, name, username, email, phone, role FROM users ORDER BY id ASC");
  return rows.map((row) => ({ ...row, id: Number(row.id), role: normalizeRole(row.role) }));
}

async function queryAdminMessages(user, limit = 80) {
  const normalizedRole = normalizeRole(user?.role);
  const safeLimit = Math.min(Math.max(Number(limit) || 80, 1), 200);
  const params = [];
  let whereClause = "";

  if (normalizedRole !== "admin") {
    whereClause = "WHERE admin_messages.sender_user_id = ?";
    params.push(Number(user?.id || 0));
  }

  params.push(safeLimit);
  const rows = await query(
    `
      SELECT
        admin_messages.id,
        admin_messages.sender_user_id AS "senderUserId",
        admin_messages.sender_name AS "senderName",
        admin_messages.sender_role AS "senderRole",
        admin_messages.category,
        admin_messages.subject,
        admin_messages.message,
        admin_messages.status,
        admin_messages.created_at AS "createdAt",
        admin_messages.updated_at AS "updatedAt",
        users.username AS "senderUsername"
      FROM admin_messages
      LEFT JOIN users ON users.id = admin_messages.sender_user_id
      ${whereClause}
      ORDER BY
        CASE admin_messages.status WHEN 'new' THEN 0 WHEN 'read' THEN 1 ELSE 2 END ASC,
        admin_messages.created_at DESC,
        admin_messages.id DESC
      LIMIT ?
    `,
    params
  );

  return rows.map((row) => ({
    ...numberizeRow(row),
    senderRole: normalizeRole(row.senderRole),
    category: normalizeAdminMessageCategory(row.category),
    status: normalizeAdminMessageStatus(row.status),
    senderUsername: row.senderUsername || "",
  }));
}

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

async function queryAgentTrainingEntries(activeOnly = true) {
  const rows = await query(
    `
      SELECT
        agent_training.id,
        agent_training.topic,
        agent_training.audience,
        agent_training.keywords,
        agent_training.tr_question AS "trQuestion",
        agent_training.tr_answer AS "trAnswer",
        agent_training.de_question AS "deQuestion",
        agent_training.de_answer AS "deAnswer",
        agent_training.suggestions,
        agent_training.is_active AS "isActive",
        agent_training.created_at AS "createdAt",
        agent_training.updated_at AS "updatedAt",
        users.name AS "createdByName"
      FROM agent_training
      LEFT JOIN users ON users.id = agent_training.created_by_user_id
      ${activeOnly ? "WHERE agent_training.is_active = ?" : ""}
      ORDER BY agent_training.updated_at DESC, agent_training.id DESC
    `,
    activeOnly ? [1] : []
  );

  return rows.map((row) => ({
    id: Number(row.id),
    topic: row.topic || "",
    audience: row.audience || "all",
    keywords: row.keywords || "",
    trQuestion: row.trQuestion || "",
    trAnswer: row.trAnswer || "",
    deQuestion: row.deQuestion || "",
    deAnswer: row.deAnswer || "",
    suggestions: parseTrainingSuggestions(row.suggestions),
    isActive: toBoolean(row.isActive),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdByName: row.createdByName || "-",
  }));
}

async function computeSummary(user = null) {
  const normalizedRole = normalizeRole(user?.role);
  const activeValue = dbClient === "postgres" ? true : 1;
  const cashParams = [];
  let cashWhereClause = "";
  if (normalizedRole === "staff") {
    cashWhereClause = "WHERE user_id = ?";
    cashParams.push(Number(user.id));
  }
  const [summaryRow, expenseRow, cashRow] = await Promise.all([
    get(
      `
        WITH movement_summary AS (
          SELECT
            item_id,
            SUM(CASE WHEN type = 'entry' THEN quantity ELSE -quantity END) AS current_stock
          FROM movements
          GROUP BY item_id
        ),
        last_entry AS (
          SELECT item_id, unit_price
          FROM (
            SELECT
              item_id,
              unit_price,
              ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY movement_date DESC, id DESC) AS row_number
            FROM movements
            WHERE type = 'entry'
          ) ranked_entries
          WHERE row_number = 1
        )
        SELECT
          COUNT(items.id) AS total_items,
          COALESCE(SUM(COALESCE(movement_summary.current_stock, 0) * COALESCE(NULLIF(last_entry.unit_price, 0), items.default_price, 0)), 0) AS stock_cost_value,
          COALESCE(SUM(COALESCE(movement_summary.current_stock, 0) * COALESCE(items.sale_price, 0)), 0) AS stock_sale_value,
          COALESCE(SUM(CASE WHEN COALESCE(movement_summary.current_stock, 0) <= COALESCE(items.min_stock, 0) THEN 1 ELSE 0 END), 0) AS critical_count
        FROM items
        LEFT JOIN movement_summary ON movement_summary.item_id = items.id
        LEFT JOIN last_entry ON last_entry.item_id = items.id
        WHERE COALESCE(items.is_active, TRUE) = ?
      `,
      [activeValue]
    ),
    get("SELECT COALESCE(SUM(amount), 0) AS expense_total FROM expenses"),
    get(
      `SELECT COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE -amount END), 0) AS cash_balance FROM cashbook ${cashWhereClause}`,
      cashParams
    ),
  ]);

  const stockCostValue = Number(summaryRow?.stock_cost_value || summaryRow?.stockCostValue || 0);
  const stockSaleValue = Number(summaryRow?.stock_sale_value || summaryRow?.stockSaleValue || 0);

  return {
    totalItems: Number(summaryRow?.total_items || summaryRow?.totalItems || 0),
    stockValue: stockCostValue,
    stockCostValue,
    stockSaleValue,
    criticalCount: Number(summaryRow?.critical_count || summaryRow?.criticalCount || 0),
    expenseTotal: Number(expenseRow?.expense_total || expenseRow?.expenseTotal || 0),
    cashBalance: Number(cashRow?.cash_balance || cashRow?.cashBalance || 0),
  };
}

function sanitizeSummaryForRole(summary, role) {
  if (normalizeRole(role) === "admin") {
    return summary;
  }
  if (normalizeRole(role) === "staff") {
    return {
      ...summary,
      stockValue: 0,
      stockCostValue: 0,
      expenseTotal: 0,
    };
  }

  return {
    ...summary,
    stockValue: 0,
    stockCostValue: 0,
    expenseTotal: 0,
    cashBalance: 0,
  };
}

function sanitizeItemsForRole(items, user) {
  const role = normalizeRole(user?.role);
  if (role === "admin") {
    return items;
  }

  return items.map((item) => ({
    ...item,
    defaultPrice: 0,
    lastPurchasePrice: 0,
    averagePurchasePrice: 0,
  }));
}

function sanitizeMovementsForRole(movements, role) {
  if (normalizeRole(role) === "admin") {
    return movements;
  }

  return movements.map((movement) => ({
    ...movement,
    unitPrice: 0,
  }));
}

async function buildBootstrap(user) {
  const normalizedRole = normalizeRole(user?.role);
  const assistantStatus = getAssistantStatus();

  if (normalizedRole === "customer") {
    const [items, orders, adminMessages] = await Promise.all([
      queryCustomerItems({ includePrices: true }),
      queryOrders(user),
      queryAdminMessages(user),
    ]);

    const customerItems = items;

    return {
      summary: {
        totalItems: customerItems.length,
        stockValue: 0,
        stockCostValue: 0,
        stockSaleValue: 0,
        criticalCount: customerItems.filter((item) => Number(item.currentStock) <= Number(item.minStock)).length,
        expenseTotal: 0,
        cashBalance: 0,
      },
      items: sanitizeItemsForRole(customerItems, user),
      archivedItems: [],
      movements: [],
      expenses: [],
      cashbook: [],
      users: [],
      quotes: [],
      orders,
      adminMessages,
      securityEvents: [],
      securityBlocks: [],
      agentTraining: [],
      assistantStatus,
    };
  }

  const includeExpenses = normalizedRole === "admin";
  const includeCashbook = normalizedRole === "admin" || normalizedRole === "staff";
  const includeUsers = normalizedRole === "admin";
  const includeSecurity = normalizedRole === "admin";
  const [summary, items, movements, expenses, cashbook, users, quotes, orders, adminMessages, securityEvents, securityBlocks] = await Promise.all([
    computeSummary(user),
    queryCustomerItems({ includePrices: true }),
    queryMovements(user),
    includeExpenses ? queryExpenses() : Promise.resolve([]),
    includeCashbook ? queryCashbook(user) : Promise.resolve([]),
    includeUsers ? queryUsers() : Promise.resolve([]),
    queryQuotes(user),
    queryOrders(user),
    queryAdminMessages(user),
    includeSecurity ? querySecurityEvents() : Promise.resolve([]),
    includeSecurity ? querySecurityBlocks() : Promise.resolve([]),
  ]);

  return {
    summary: sanitizeSummaryForRole(summary, user?.role),
    items: sanitizeItemsForRole(items, user),
    archivedItems: [],
    movements: sanitizeMovementsForRole(movements, user?.role),
    expenses,
    cashbook,
    users,
    quotes,
    orders,
    adminMessages,
    securityEvents,
    securityBlocks,
    agentTraining: [],
    assistantStatus,
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

function getAssistantStatus() {
  if (isLocalDrcManAvailable()) {
    return {
      mode: "local_drc_man",
      label: "DRC MAN yerel ajan bagli",
    };
  }

  return {
    mode: "built_in",
    label: "DRC MAN yedek mod",
  };
}

function audienceAllowsRole(audience, role) {
  const normalizedRole = normalizeRole(role);
  if (audience === "all") {
    return true;
  }
  if (audience === "admin") {
    return normalizedRole === "admin";
  }
  if (audience === "staff") {
    return normalizedRole === "staff" || normalizedRole === "admin";
  }
  if (audience === "customer") {
    return normalizedRole === "customer";
  }
  return false;
}

async function matchAssistantTraining(message, language, user) {
  const normalizedMessage = normalizeAssistantText(message);
  if (!normalizedMessage) {
    return null;
  }

  const tokens = tokenizeAssistantText(normalizedMessage);
  const entries = await queryAgentTrainingEntries(true);
  let bestEntry = null;
  let bestScore = 0;

  for (const entry of entries) {
    if (!audienceAllowsRole(entry.audience, user?.role)) {
      continue;
    }

    const prompts = [
      language === "de" ? entry.deQuestion || entry.trQuestion : entry.trQuestion || entry.deQuestion,
      language === "de" ? entry.trQuestion : entry.deQuestion,
      entry.topic,
    ]
      .filter(Boolean)
      .map((value) => normalizeAssistantText(value));

    const keywords = normalizeAssistantText(entry.keywords).split(/\s+/).filter(Boolean);
    let score = 0;

    prompts.forEach((prompt) => {
      score += scoreAssistantPromptMatch(normalizedMessage, tokens, prompt);
    });

    keywords.forEach((keyword) => {
      score += scoreAssistantKeywordMatch(normalizedMessage, tokens, keyword);
    });

    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  if (!bestEntry || bestScore < 48) {
    return null;
  }

  const answer = language === "de"
    ? cleanOptional(bestEntry.deAnswer) || cleanOptional(bestEntry.trAnswer)
    : cleanOptional(bestEntry.trAnswer) || cleanOptional(bestEntry.deAnswer);

  if (!answer) {
    return null;
  }

  return {
    answer,
    suggestions: adaptTrainingSuggestions(bestEntry.suggestions || [], language, entries),
    sourceSummary: cleanOptional(bestEntry.topic) || "DRC MAN yonetici egitimi",
  };
}

function adaptTrainingSuggestions(suggestions, language, entries) {
  if (!Array.isArray(suggestions) || !suggestions.length) {
    return [];
  }

  return suggestions.map((suggestion) => {
    const match = findBestTrainingEntryByText(suggestion, entries);
    if (!match) {
      return suggestion;
    }

    if (language === "de") {
      return cleanOptional(match.deQuestion) || cleanOptional(match.trQuestion) || suggestion;
    }

    return cleanOptional(match.trQuestion) || cleanOptional(match.deQuestion) || suggestion;
  });
}

function findBestTrainingEntryByText(value, entries) {
  const normalizedValue = normalizeAssistantText(value);
  if (!normalizedValue) {
    return null;
  }

  const tokens = tokenizeAssistantText(normalizedValue);
  let bestEntry = null;
  let bestScore = 0;

  entries.forEach((entry) => {
    const prompts = [
      normalizeAssistantText(entry.trQuestion),
      normalizeAssistantText(entry.deQuestion),
      normalizeAssistantText(entry.topic),
      normalizeAssistantText(entry.keywords),
    ].filter(Boolean);

    let score = 0;
    prompts.forEach((prompt) => {
      score += scoreAssistantPromptMatch(normalizedValue, tokens, prompt);
    });

    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  });

  if (!bestEntry || bestScore < 18) {
    return null;
  }

  return bestEntry;
}

function scoreAssistantPromptMatch(normalizedMessage, tokens, prompt) {
  if (!prompt) {
    return 0;
  }

  let score = 0;
  if (normalizedMessage === prompt) {
    score += 160;
  } else if (prompt.includes(normalizedMessage) || normalizedMessage.includes(prompt)) {
    score += 95;
  }

  const promptTokens = tokenizeAssistantText(prompt);
  tokens.forEach((token) => {
    if (promptTokens.includes(token)) {
      score += token.length >= 4 ? 22 : 12;
    } else if (prompt.includes(token)) {
      score += 6;
    } else if (promptTokens.some((promptToken) => hasAssistantTokenStemMatch(token, promptToken))) {
      score += token.length >= 4 ? 8 : 4;
    }
  });

  return score;
}

function scoreAssistantKeywordMatch(normalizedMessage, tokens, keyword) {
  if (!keyword) {
    return 0;
  }

  let score = 0;
  if (keyword.length >= 2 && normalizedMessage.includes(keyword)) {
    score += 18;
  }

  tokenizeAssistantText(keyword).forEach((keywordToken) => {
    if (tokens.includes(keywordToken)) {
      score += keywordToken.length >= 4 ? 9 : 4;
    } else if (tokens.some((token) => hasAssistantTokenStemMatch(token, keywordToken))) {
      score += keywordToken.length >= 4 ? 5 : 2;
    }
  });

  return score;
}

function hasAssistantTokenStemMatch(left, right) {
  const leftToken = String(left || "");
  const rightToken = String(right || "");
  if (!leftToken || !rightToken || leftToken === rightToken) {
    return false;
  }

  const shortest = Math.min(leftToken.length, rightToken.length);
  if (shortest < 4) {
    return false;
  }

  const prefixLength = shortest >= 6 ? 4 : 3;
  return leftToken.slice(0, prefixLength) === rightToken.slice(0, prefixLength);
}

function isLocalDrcManAvailable() {
  return !process.env.VERCEL
    && fs.existsSync(DRC_MAN_DIR)
    && fs.existsSync(DRC_MAN_BRIDGE);
}

function resolveDrcManPython() {
  if (DRC_MAN_PYTHON && fs.existsSync(DRC_MAN_PYTHON)) {
    return DRC_MAN_PYTHON;
  }

  return "python3";
}

function queryDrcManAssistant(message, language = "tr", user = null, answerLevel = "master", history = []) {
  if (!isLocalDrcManAvailable()) {
    return null;
  }

  try {
    const result = spawnSync(
      resolveDrcManPython(),
      [DRC_MAN_BRIDGE],
      {
        cwd: path.join(__dirname, ".."),
        input: JSON.stringify({
          question: message,
          language,
          role: normalizeRole(user?.role),
          answerLevel,
          history: Array.isArray(history) ? history.slice(-8) : [],
          drcManDir: DRC_MAN_DIR,
        }),
        encoding: "utf8",
        timeout: 15000,
        env: {
          ...process.env,
          DRC_MAN_DIR,
        },
      }
    );

    if (result.error || result.status !== 0 || !result.stdout) {
      return null;
    }

    const parsed = JSON.parse(result.stdout.trim());
    return parsed?.ok ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function resolveAssistantAnswerLevel(message, user) {
  const normalizedMessage = normalizeAssistantText(message || "");
  if (/(usta gibi|detayli|detaylı|adim adim|adım adım|teknik anlat|sebebiyle anlat|meister|detailliert|schritt fuer schritt|schritt fur schritt|technisch)/.test(normalizedMessage)) {
    return "master";
  }
  if (/(kisa anlat|kısa anlat|basit anlat|musteriye anlat|müşteriye anlat|kolay anlat|einfach erklaer|kurz erklaer|fuer kunden|fur kunden)/.test(normalizedMessage)) {
    return "customer";
  }
  return isCustomerRole(user?.role) ? "customer" : "master";
}

function adaptAssistantTrainingAnswer(answer, language = "tr", answerLevel = "master") {
  const text = cleanOptional(answer);
  if (!text || answerLevel !== "customer") {
    return text;
  }

  const parts = text.match(/[^.!?]+[.!?]?/g) || [text];
  const shortened = parts.slice(0, 3).join(" ").trim();
  return language === "de"
    ? `Kurz und einfach: ${shortened} Wenn noetig, kann DRC MAN das im Meister-Niveau weiter ausfuehren.`
    : `Kisa ve sade anlatim: ${shortened} Gerekirse DRC MAN bunu usta seviyesinde daha detayli aciklar.`;
}

function sanitizeAssistantAnswerForRole(answer, language = "tr", user = null) {
  const role = normalizeRole(user?.role);
  const text = cleanOptional(answer);
  if (!text || role !== "customer") {
    return text;
  }

  const normalized = normalizeAssistantText(text);
  const hasRestrictedPurchaseInfo = /(alis|alış|maliyet|maliyetim|kar marji|kâr marji|einkauf|einkaufspreis|kosten|cost|purchase)/.test(normalized);
  if (!hasRestrictedPurchaseInfo) {
    return text;
  }

  return customerRestrictedPurchaseAnswer(language);
}

function isRestrictedCustomerPurchaseQuestion(message) {
  const text = cleanOptional(message);
  const normalized = normalizeAssistantText(text);
  return /(alis|alış|maliyet|maliyetim|kar marji|kâr marji|einkauf|einkaufspreis|kosten|cost|purchase)/.test(normalized);
}

function isDirectPriceQuestion(message) {
  const text = cleanOptional(message);
  const normalized = normalizeAssistantText(text);
  return /€|\beur\b/i.test(text)
    || /(fiyat|ucret|ücret|tutar|satis fiyati|satış fiyatı|liste fiyati|liste fiyatı|net fiyat|preis|verkaufspreis|listenpreis)/.test(normalized);
}

function customerRestrictedPurchaseAnswer(language = "tr") {
  return language === "de"
    ? "Kundenansicht: Verkaufspreise sind sichtbar, Einkaufspreise und Kosten bleiben nur fuer Admins sichtbar."
    : "Musteri ekrani: satis fiyatlari gorunur, alis fiyati ve maliyet bilgisi sadece admin icin sakli kalir.";
}

function answerAssistantQuestion(message, items, language = "tr", user = null) {
  const normalized = normalizeAssistantText(message);
  const t = createAssistantDictionary(language);
  const candidates = findAssistantCandidates(normalized, items);
  const role = normalizeRole(user?.role);
  const canViewPurchase = role === "admin";
  const canViewSale = true;

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
    if (!canViewSale) {
      return { reply: t.priceHidden, suggestions: t.customerSuggestions };
    }
    const sorted = [...items]
      .sort((a, b) => visibleSalePriceForRole(b, canViewPurchase) - visibleSalePriceForRole(a, canViewPurchase))
      .slice(0, 5);
    return {
      reply: `${t.expensiveList}: ${sorted.map((item) => `${item.name} (${formatEur(visibleSalePriceForRole(item, canViewPurchase))})`).join(", ")}`,
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
    if (!canViewSale) {
      return {
        reply: language === "de"
          ? `${item.name} ist verfuegbar mit ${item.currentStock} ${item.unit}. Preise werden in der Kundenansicht nicht angezeigt; bitte senden Sie eine Bestellung zur Bestaetigung.`
          : `${item.name} stokta ${item.currentStock} ${item.unit} gorunuyor. Musteri ekraninda fiyat gosterilmez; teyit icin siparis talebi gonderin.`,
        suggestions: [`${item.name} ${t.stockWord}`, t.customerOrderSuggestion],
      };
    }
    return {
      reply: canViewPurchase
        ? (language === "de"
          ? `Fuer ${item.name} betraegt der Einkauf ${formatEur(item.defaultPrice || item.lastPurchasePrice)} und der Verkauf ${formatEur(visibleSalePriceForRole(item, true))}.`
          : `${item.name} icin alis ${formatEur(item.defaultPrice || item.lastPurchasePrice)} ve satis ${formatEur(visibleSalePriceForRole(item, true))}.`)
        : (language === "de"
          ? `Fuer ${item.name} betraegt der Verkauf ${formatEur(visibleSalePriceForRole(item, false))}.`
          : `${item.name} icin satis fiyati ${formatEur(visibleSalePriceForRole(item, false))}.`),
      suggestions: [`${item.name} ${t.stockWord}`, `${item.name} ${t.categoryWord}`],
    };
  }

  if (candidates.length > 0) {
    const top = candidates.slice(0, 5);
    return {
      reply: `${t.matchList}: ${top.map((item) => canViewSale
        ? `${item.name} (${formatEur(visibleSalePriceForRole(item, canViewPurchase))})`
        : `${item.name} (${item.currentStock} ${item.unit})`).join(", ")}`,
      suggestions: top.map((item) => `${item.name} ${canViewSale ? t.priceWord : t.stockWord}`).slice(0, 3),
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

function visibleSalePriceForRole(item, canViewPurchase) {
  if (canViewPurchase) {
    return Number(item.salePrice || item.defaultPrice || item.lastPurchasePrice || 0);
  }
  return Number(item.salePrice || 0);
}

function createAssistantDictionary(language) {
  if (language === "de") {
    return {
      noCritical: "Es gibt keine kritischen Artikel im Bestand.",
      criticalList: "Kritische Artikel",
      expensiveList: "Artikel mit dem hoechsten Preis",
      matchList: "Diese Artikel passen dazu",
      salesHelp: "Im Tab Schnellverkauf koennen Sie links Produkte in den Warenkorb legen. Rechts geben Sie Kundendaten, bezahlten Betrag und Referenz ein und nutzen Direktverkauf oder Angebot speichern.",
      priceHidden: "Verkaufspreise sind sichtbar. Einkaufspreise und Kosten bleiben nur fuer Admins sichtbar.",
      help: "Sie koennen nach Preis, Bestand, Lagercode, Kategorie, kritischen Artikeln oder den teuersten Artikeln fragen.",
      defaultSuggestions: ["kritischer bestand", "teuerste artikel", "GNA 1.500-1 preis"],
      customerSuggestions: ["verfuegbare artikel", "bestellung senden", "bestand fragen"],
      customerOrderSuggestion: "bestellung senden",
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
    priceHidden: "Satis fiyatlari gorunur. Alis fiyati ve maliyet bilgisi sadece admin icin sakli kalir.",
    help: "Sunu sorabilirsiniz: urun fiyati, stok durumu, stok kodu, kategori, kritik stoktaki urunler veya en pahali urunler.",
    defaultSuggestions: ["kritik stok", "en pahali urun", "GNA 1.500-1 fiyat"],
    customerSuggestions: ["stoklu urunler", "siparis ver", "stok sor"],
    customerOrderSuggestion: "siparis ver",
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

async function queryQuotes(user) {
  const normalizedRole = normalizeRole(user?.role);
  const clauses = [];
  const params = [];
  if (normalizedRole === "staff") {
    clauses.push("quotes.user_id = ?");
    params.push(Number(user.id));
  }
  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
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
      ${whereClause}
      ORDER BY quotes.created_at DESC, quotes.id DESC
      LIMIT 20
    `,
    params
  );

  const result = [];
  for (const quote of quotes) {
  const items = await query(
    `
      SELECT
        quote_items.item_id AS "itemId",
        quote_items.item_name AS "itemName",
        quote_items.quantity,
        quote_items.unit,
        quote_items.unit_price AS "unitPrice",
        quote_items.total,
        items.brand,
        items.category,
        COALESCE(NULLIF(items.barcode, ''), NULLIF(items.product_code, '')) AS "itemCode"
      FROM quote_items
      LEFT JOIN items ON items.id = quote_items.item_id
      WHERE quote_id = ?
      ORDER BY quote_items.id ASC
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

async function queryOrders(user) {
  const normalizedRole = normalizeRole(user?.role);
  const clauses = [];
  const params = [];

  if (normalizedRole === "customer") {
    clauses.push("orders.customer_user_id = ?");
    params.push(Number(user.id));
  } else if (normalizedRole === "staff") {
    return [];
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const orders = await query(
    `
      SELECT
        orders.id,
        orders.customer_name AS "customerName",
        orders.customer_user_id AS "customerUserId",
        users.phone AS phone,
        orders.order_date AS date,
        orders.status,
        orders.note,
        orders.created_at AS "createdAt"
      FROM orders
      LEFT JOIN users ON users.id = orders.customer_user_id
      ${whereClause}
      ORDER BY orders.created_at DESC, orders.id DESC
      LIMIT 40
    `,
    params
  );

  const result = [];
  for (const order of orders) {
    const items = await query(
      `
        SELECT item_name AS "itemName", quantity, unit
        FROM order_items
        WHERE order_id = ?
        ORDER BY id ASC
      `,
      [order.id]
    );

    result.push({
      ...numberizeRow(order),
      items: items.map(numberizeRow),
    });
  }

  return result;
}

async function getQuoteById(id, user = null) {
  const normalizedRole = normalizeRole(user?.role);
  const clauses = ["quotes.id = ?"];
  const params = [id];
  if (normalizedRole === "staff") {
    clauses.push("quotes.user_id = ?");
    params.push(Number(user.id));
  }
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
      WHERE ${clauses.join(" AND ")}
    `,
    params
  );

  if (!quote) {
    return null;
  }

  const items = await query(
    `
      SELECT
        quote_items.item_id AS "itemId",
        quote_items.item_name AS "itemName",
        quote_items.quantity,
        quote_items.unit,
        quote_items.unit_price AS "unitPrice",
        quote_items.total,
        items.brand,
        items.category,
        COALESCE(NULLIF(items.barcode, ''), NULLIF(items.product_code, '')) AS "itemCode"
      FROM quote_items
      LEFT JOIN items ON items.id = quote_items.item_id
      WHERE quote_id = ?
      ORDER BY quote_items.id ASC
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
  ["id", "userId", "senderUserId", "eventCount", "quantity", "unitPrice", "total", "discount", "subtotal", "vatRate", "vatAmount", "netTotal", "grossTotal", "amount"].forEach(
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

  configurePdfFonts(doc);

  drawQuoteHero(doc, quote, t, formattedDate, lang, currency);
  let y = drawQuoteIntro(doc, quote, t, formattedDate, lang);
  y = drawQuoteItems(doc, quote, t, currency, y);
  y = ensureQuotePdfSpace(doc, y, 238, quote, t);
  y = drawQuoteTotals(doc, quote, t, currency, y);
  drawQuoteFooter(doc, quote, t, y);
}

function drawQuoteHero(doc, quote, t, formattedDate, lang, currency) {
  doc.rect(0, 0, doc.page.width, 132).fill("#082b4c");
  doc.circle(520, 18, 96).fill("#00a98f");
  doc.circle(596, 118, 76).fill("#ff8a00");
  doc.rect(0, 118, doc.page.width, 14).fill("#00a98f");
  doc.rect(420, 118, 175, 14).fill("#ff8a00");

  doc.roundedRect(42, 28, 74, 74, 18).fill("#ffffff");
  doc.fillColor("#082b4c").font("AppBold").fontSize(30).text("DRC", 53, 52);
  doc.fillColor("#ffffff").font("AppBold").fontSize(23).text(sanitizePdfText(COMPANY_PROFILE.name), 132, 31, { width: 282 });
  doc.font("AppRegular").fontSize(10.5).text(sanitizePdfText(t.logoSubline), 132, 61, { width: 282 });
  doc.fontSize(9.5).text(sanitizePdfText(`${t.headOffice}: ${COMPANY_PROFILE.address}`), 132, 82, { width: 385 });
  doc.text(sanitizePdfText(`${t.warehouse}: ${COMPANY_PROFILE.warehouse}`), 132, 98, { width: 385 });

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
  doc.fillColor("#0f172a").font("AppBold").fontSize(14).text(sanitizePdfText(quote.customerName), 397, 207, { width: 136 });
  doc.fillColor("#607489").font("AppRegular").fontSize(9.5).text(sanitizePdfText(quote.note || t.customerPlaceholder), 397, 232, { width: 136, height: 30 });

  doc.roundedRect(42, 282, 511, 45, 16).fill("#fff7ed");
  doc.fillColor("#082b4c").font("AppBold").fontSize(10).text(sanitizePdfText(t.productScope), 58, 296);
  doc.fillColor("#475569").font("AppRegular").fontSize(9.2).text(
    sanitizePdfText(`${COMPANY_PROFILE.phone} | ${COMPANY_PROFILE.email} | ${COMPANY_PROFILE.web}`),
    58,
    313,
    { width: 360 }
  );
  doc.fillColor("#082b4c").font("AppBold").fontSize(9).text(
    sanitizePdfText(`${t.offerNo}: ${quote.quoteNo || `DRC-${quote.id}`}  |  ${t.date}: ${formattedDate}  |  ${t.vatLabel}: ${quote.isExport ? t.vatExportShort : `${numberOrZero(quote.vatRate)}%`}`),
    332,
    296,
    { width: 205, align: "right" }
  );

  return 350;
}

function drawQuoteItems(doc, quote, t, currency, startY) {
  let y = drawQuoteTableHeader(doc, t, startY);

  quote.items.forEach((item, index) => {
    const nameHeight = doc.font("AppBold").fontSize(11.5).heightOfString(sanitizePdfText(item.itemName), { width: 248 });
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
    doc.fillColor("#0f172a").font("AppBold").fontSize(11.5).text(sanitizePdfText(item.itemName), 86, y + 12, { width: 248 });

    const meta = [item.brand, item.category, item.itemCode ? `${t.code}: ${item.itemCode}` : ""].filter(Boolean).join("  |  ");
    doc.fillColor("#607489").font("AppRegular").fontSize(8.8).text(sanitizePdfText(meta || t.productLine), 86, y + 33 + Math.max(0, nameHeight - 14), { width: 248 });

    doc.fillColor("#082b4c").font("AppBold").fontSize(12).text(sanitizePdfText(formatPdfQuantity(item.quantity)), 350, y + 14, { width: 46, align: "right" });
    doc.fillColor("#607489").font("AppRegular").fontSize(8.8).text(sanitizePdfText(item.unit || ""), 350, y + 31, { width: 46, align: "right" });
    doc.fillColor("#0f172a").font("AppRegular").fontSize(10).text(sanitizePdfText(currency.format(item.unitPrice)), 410, y + 18, { width: 56, align: "right" });
    doc.fillColor("#ff6a3d").font("AppBold").fontSize(11).text(sanitizePdfText(currency.format(item.total)), 480, y + 18, { width: 58, align: "right" });

    y += rowHeight;
  });

  return y + 4;
}

function drawQuoteTableHeader(doc, t, y) {
  doc.roundedRect(42, y, 511, 30, 10).fill("#082b4c");
  doc.fillColor("#ffffff").font("AppBold").fontSize(9.5);
  doc.text("#", 55, y + 10, { width: 26 });
  doc.text(sanitizePdfText(t.item), 86, y + 10, { width: 248 });
  doc.text(sanitizePdfText(t.qty), 350, y + 10, { width: 46, align: "right" });
  doc.text(sanitizePdfText(t.unitPrice), 410, y + 10, { width: 56, align: "right" });
  doc.text(sanitizePdfText(t.total), 480, y + 10, { width: 58, align: "right" });
  return y + 40;
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
  doc.fillColor("#082b4c").font("AppBold").fontSize(12).text(sanitizePdfText(t.easyReadTitle), 58, y + 16);
  doc.fillColor("#475569").font("AppRegular").fontSize(9.7).text(sanitizePdfText(t.easyReadCopy), 58, y + 40, { width: 206, lineGap: 3 });
  drawPdfPills(doc, t.productFamilies, 58, y + 92, {
    fill: "#e9fff9",
    color: "#082b4c",
    border: "#b8f5e7",
    fontSize: 8.2,
    maxX: 270,
  });

  return y + 164;
}

function drawQuoteFooter(doc, quote, t, y) {
  y = ensureQuotePdfSpace(doc, y, 165, quote, t);

  doc.roundedRect(42, y, 244, 96, 14).fill("#f8fafc");
  doc.fillColor("#082b4c").font("AppBold").fontSize(11).text(sanitizePdfText(t.bankTitle), 56, y + 14);
  doc.fillColor("#475569").font("AppRegular").fontSize(9.3);
  doc.text(sanitizePdfText(`${t.beneficiary}: ${COMPANY_PROFILE.beneficiary}`), 56, y + 34, { width: 214 });
  doc.text(sanitizePdfText(`${t.bank}: ${COMPANY_PROFILE.bankName}`), 56, y + 50, { width: 214 });
  doc.text(sanitizePdfText(`IBAN: ${COMPANY_PROFILE.iban}`), 56, y + 66, { width: 214 });
  doc.text(sanitizePdfText(`BIC: ${COMPANY_PROFILE.bic}`), 56, y + 82, { width: 214 });

  doc.roundedRect(309, y, 244, 96, 14).fill("#f8fafc");
  doc.fillColor("#082b4c").font("AppBold").fontSize(11).text(sanitizePdfText(t.signature), 323, y + 14);
  doc.moveTo(323, y + 61).lineTo(523, y + 61).strokeColor("#94a3b8").stroke();
  doc.fillColor("#475569").font("AppRegular").fontSize(9.5).text(sanitizePdfText(COMPANY_PROFILE.manager), 323, y + 70);
  doc.text(sanitizePdfText(`${COMPANY_PROFILE.register} | USt-IdNr.: ${COMPANY_PROFILE.vatId}`), 323, y + 84, { width: 214 });

  y += 118;
  doc.fillColor("#082b4c").font("AppBold").fontSize(11).text(sanitizePdfText(t.conditionsTitle), 42, y);
  doc.fillColor("#475569").font("AppRegular").fontSize(9.2);
  t.conditions.forEach((line, index) => {
    doc.text(sanitizePdfText(`- ${line}`), 42, y + 20 + index * 15, { width: 511 });
  });
}

function drawTotalLine(doc, label, value, x, y, strong) {
  doc.fillColor("#d9eef7").font(strong ? "AppBold" : "AppRegular").fontSize(9.7).text(sanitizePdfText(label), x, y, { width: 110 });
  doc.fillColor("#ffffff").font(strong ? "AppBold" : "AppRegular").fontSize(9.7).text(sanitizePdfText(value), x + 118, y, { width: 93, align: "right" });
}

function drawQuoteContinuationHeader(doc, quote, t) {
  doc.rect(0, 0, doc.page.width, 58).fill("#082b4c");
  doc.roundedRect(42, 16, 42, 28, 8).fill("#ffffff");
  doc.fillColor("#082b4c").font("AppBold").fontSize(14).text("DRC", 50, 23);
  doc.fillColor("#ffffff").font("AppBold").fontSize(12).text(sanitizePdfText(COMPANY_PROFILE.name), 100, 17, { width: 270 });
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

function formatPdfQuantity(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 100) / 100);
}

function getQuoteTranslations(lang) {
  if (lang === "tr") {
    return {
      logoSubline: "Sogutma ve Klima Teknigi",
      headOffice: "Merkez",
      warehouse: "Depo",
      offerTo: "Musteri",
      offerTitle: "Malzeme Satış Teklifi",
      materialSaleTitle: "Malzeme Satis Teklifi",
      offerNo: "Teklif No",
      date: "Tarih",
      language: "Dil",
      vatLabel: "KDV",
      vatExportShort: "Yok",
      payableAmount: "Odenecek",
      brandLineLabel: "Satisini yaptigimiz markalar",
      productScope: "Panel, soguk oda kapisi, kondenser, evaporator, gaz, boru, kontrol ve servis malzemeleri",
      item: "Malzeme",
      code: "Kod",
      productLine: "Urun / malzeme kalemi",
      qty: "Miktar",
      unitPrice: "Birim Fiyat",
      unit: "Birim",
      total: "Toplam",
      totalsTitle: "Teklif Ozeti",
      easyReadTitle: "Kolay okuma",
      easyReadCopy: "Urun adi buyuk yazilir. Alt satirda marka, kategori ve stok kodu yer alir. Egitimsiz kullanici da hangi malzemenin teklif edildigini hizli anlar.",
      productFamilies: ["Panel", "Soguk Oda Kapisi", "Kondenser", "Evaporator", "Termostat", "Gaz", "Bakir Boru", "Fan Motoru"],
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
      pageContinue: "Devam sayfasi",
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
    offerTitle: "Materialverkaufsangebot",
    materialSaleTitle: "Materialverkaufsangebot",
    offerNo: "Angebotsnr.",
    date: "Datum",
    language: "Sprache",
    vatLabel: "MwSt.",
    vatExportShort: "0%",
    payableAmount: "Zu zahlen",
    brandLineLabel: "Marken im Verkauf",
    productScope: "Paneele, Kuehlraumtueren, Verfluessiger, Verdampfer, Kaeltemittel, Rohr, Steuerung und Serviceteile",
    item: "Artikel",
    code: "Code",
    productLine: "Produkt / Materialposition",
    qty: "Menge",
    unitPrice: "Einzelpreis",
    unit: "Einheit",
    total: "Gesamt",
    totalsTitle: "Angebotsuebersicht",
    easyReadTitle: "Einfach lesbar",
    easyReadCopy: "Der Artikelname steht gross. Darunter stehen Marke, Kategorie und Lagercode. Auch nicht geschulte Nutzer erkennen schnell, welches Material angeboten wird.",
    productFamilies: ["Paneel", "Kuehlraumtuer", "Verfluessiger", "Verdampfer", "Thermostat", "Gas", "Kupferrohr", "Ventilator"],
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
    pageContinue: "Folgeseite",
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

function sanitizePdfText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[ğĞ]/g, (char) => (char === "Ğ" ? "G" : "g"))
    .replace(/[ıİ]/g, (char) => (char === "İ" ? "I" : "i"))
    .replace(/[şŞ]/g, (char) => (char === "Ş" ? "S" : "s"))
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/₺/g, "TL")
    .replace(/[^\t\n\r\u0020-\u007e\u00a0-\u00ff\u20ac]/g, "");
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
