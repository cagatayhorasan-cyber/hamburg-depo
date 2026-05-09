"use strict";

/**
 * Güvenlik (rate-limit, IP block, audit log) sabitleri.
 * server/lib/security-events.js ve server/app.js içinden import edilir.
 *
 * Eşik / süre değerleri ENV ile ezilebilir; production'da Vercel
 * Environment Variables üzerinden override edilebilir.
 */

const SECURITY_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const SECURITY_AUTH_FAILURE_THRESHOLD = Number(process.env.SECURITY_AUTH_FAILURE_THRESHOLD || 15);
const SECURITY_ORIGIN_FAILURE_THRESHOLD = Number(process.env.SECURITY_ORIGIN_FAILURE_THRESHOLD || 4);
const SECURITY_AUTH_BLOCK_MS = 30 * 60 * 1000;
const SECURITY_ORIGIN_BLOCK_MS = 60 * 60 * 1000;
const SECURITY_RATE_LIMIT_BLOCK_MS = 30 * 60 * 1000;
const SECURITY_EVENT_DETAILS_LIMIT = 1600;

module.exports = {
  SECURITY_FAILURE_WINDOW_MS,
  SECURITY_AUTH_FAILURE_THRESHOLD,
  SECURITY_ORIGIN_FAILURE_THRESHOLD,
  SECURITY_AUTH_BLOCK_MS,
  SECURITY_ORIGIN_BLOCK_MS,
  SECURITY_RATE_LIMIT_BLOCK_MS,
  SECURITY_EVENT_DETAILS_LIMIT,
};
