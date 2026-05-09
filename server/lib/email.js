"use strict";

/**
 * E-posta gönderim altyapısı (Gmail SMTP + Resend HTTP API).
 *
 * sendEmail() önce GMAIL_USER + GMAIL_APP_PASSWORD ile dener (nodemailer),
 * başarısız olursa veya yapılandırılmamışsa Resend'e düşer. İkisi de yoksa
 * not_configured döner ve mesajı log'lar.
 *
 * Template'ler (verification, password reset, order status) hâlâ app.js'te;
 * escapeHtml + i18n bağımlılıkları olduğu için ayrı modüle çıkarılmadı.
 *
 * Public API:
 *   formatMailAddress(address)
 *   getMailEnvelopeAddress(provider?)
 *   getMailSenderAddress(provider?)
 *   getMailReplyTo(provider?)
 *   getGmailTransporter()
 *   getMailDeliveryHealth()  → { available, provider, reason }
 *   sendEmail({ to, subject, html, text })
 */

const nodemailer = require("nodemailer");

const { cleanOptional } = require("./util");

// Şirket profilini app.js'te de kullandığımız için iki yerde tutmaktansa
// burada minimum company info'yu lazy yapmıyoruz — companyName parametresi olarak veriyoruz.
let companyName = "DRC Kältetechnik GmbH";
let companyEmail = "info@drckaltetechnik.de";

function configureCompanyProfile({ name, email } = {}) {
  if (name) companyName = name;
  if (email) companyEmail = email;
}

const MAIL_FROM = cleanOptional(process.env.MAIL_FROM) || companyEmail;
const RESEND_API_KEY = cleanOptional(process.env.RESEND_API_KEY) || "";
const GMAIL_FROM = cleanOptional(process.env.GMAIL_FROM) || "";
const GMAIL_USER = cleanOptional(process.env.GMAIL_USER) || "";
const GMAIL_APP_PASSWORD = cleanOptional(process.env.GMAIL_APP_PASSWORD) || "";

let gmailTransporter = null;
let mailHealthCache = { key: "", expiresAt: 0, result: null };

function formatMailAddress(address) {
  return address ? `${companyName} <${address}>` : "";
}

function getMailEnvelopeAddress(provider = "default") {
  if (provider === "gmail") {
    return GMAIL_USER || GMAIL_FROM || MAIL_FROM || companyEmail;
  }
  return MAIL_FROM || GMAIL_USER || companyEmail;
}

function getMailSenderAddress(provider = "default") {
  return formatMailAddress(getMailEnvelopeAddress(provider));
}

function getMailReplyTo(provider = "default") {
  const sender = getMailEnvelopeAddress(provider);
  const replyTo = GMAIL_FROM || MAIL_FROM || companyEmail;
  return replyTo && replyTo !== sender ? replyTo : "";
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

async function getMailDeliveryHealth() {
  const cacheKey = [GMAIL_USER, GMAIL_APP_PASSWORD, RESEND_API_KEY, MAIL_FROM, GMAIL_FROM].join("|");
  const now = Date.now();

  if (mailHealthCache.key === cacheKey && mailHealthCache.expiresAt > now && mailHealthCache.result) {
    return mailHealthCache.result;
  }

  let result;
  if (GMAIL_USER && GMAIL_APP_PASSWORD) {
    try {
      await getGmailTransporter().verify();
      result = { available: true, provider: "gmail", reason: "" };
    } catch (error) {
      console.error("Gmail baglantisi dogrulanamadi:", error);
      result = { available: false, provider: "gmail", reason: "provider_error" };
    }
  } else if (RESEND_API_KEY && getMailSenderAddress()) {
    result = { available: true, provider: "resend", reason: "" };
  } else {
    result = { available: false, provider: "", reason: "not_configured" };
  }

  mailHealthCache = {
    key: cacheKey,
    expiresAt: now + 5 * 60 * 1000,
    result,
  };
  return result;
}

async function sendEmail({ to, subject, html, text }) {
  if (GMAIL_USER && GMAIL_APP_PASSWORD) {
    try {
      const gmailMessage = {
        from: getMailSenderAddress("gmail"),
        to,
        subject,
        html,
        text,
      };
      const gmailReplyTo = getMailReplyTo("gmail");
      if (gmailReplyTo) {
        gmailMessage.replyTo = gmailReplyTo;
      }
      await getGmailTransporter().sendMail(gmailMessage);
      return { sent: true, provider: "gmail" };
    } catch (error) {
      console.error("Gmail ile mail gonderilemedi:", error);
      if (!RESEND_API_KEY || !getMailSenderAddress()) {
        return { sent: false, reason: "provider_error", provider: "gmail" };
      }
    }
  }

  if (!RESEND_API_KEY || !getMailSenderAddress()) {
    console.log(`Mail gonderimi atlandi (${subject}) -> ${to}`);
    return { sent: false, reason: "not_configured" };
  }

  const resendReplyTo = getMailReplyTo();
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
      ...(resendReplyTo ? { reply_to: resendReplyTo } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("Mail gonderilemedi:", response.status, body);
    return { sent: false, reason: "provider_error" };
  }

  return { sent: true };
}

module.exports = {
  configureCompanyProfile,
  formatMailAddress,
  getMailEnvelopeAddress,
  getMailSenderAddress,
  getMailReplyTo,
  getGmailTransporter,
  getMailDeliveryHealth,
  sendEmail,
};
