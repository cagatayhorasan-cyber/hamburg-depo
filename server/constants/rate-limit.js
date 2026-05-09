"use strict";

/**
 * API rate limit eşikleri ve pencereleri.
 * server/lib/rate-limit.js + server/app.js içinden import edilir.
 *
 * Tüm değerler ENV ile override edilebilir; production'da Vercel
 * Environment Variables üzerinden ayarlanır.
 */

const API_RATE_WINDOW_MS = 60 * 1000;
const AUTH_RATE_WINDOW_MS = 10 * 60 * 1000;

const GENERAL_API_RATE_LIMIT = Number(process.env.GENERAL_API_RATE_LIMIT || 240);
const AUTH_API_RATE_LIMIT = Number(process.env.AUTH_API_RATE_LIMIT || 12);
const ASSISTANT_CUSTOMER_RATE_LIMIT = Number(process.env.ASSISTANT_CUSTOMER_RATE_LIMIT || 30);
const ASSISTANT_STAFF_RATE_LIMIT = Number(process.env.ASSISTANT_STAFF_RATE_LIMIT || 60);
const ASSISTANT_ADMIN_RATE_LIMIT = Number(process.env.ASSISTANT_ADMIN_RATE_LIMIT || 120);

module.exports = {
  API_RATE_WINDOW_MS,
  AUTH_RATE_WINDOW_MS,
  GENERAL_API_RATE_LIMIT,
  AUTH_API_RATE_LIMIT,
  ASSISTANT_CUSTOMER_RATE_LIMIT,
  ASSISTANT_STAFF_RATE_LIMIT,
  ASSISTANT_ADMIN_RATE_LIMIT,
};
