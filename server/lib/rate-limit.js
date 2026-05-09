"use strict";

/**
 * Rate-limit middleware factory + bucket sweeper.
 *
 * In-memory bucket map ile basit sliding-window rate limit. 5000 bucket'ı
 * aşınca otomatik prune eder. Auth limit'i aşılırsa security-events'e
 * critical event yazar ve IP'yi geçici bloklar.
 *
 * Public API:
 *   createRateLimiter({ name, windowMs, max, keyFn?, message? })
 *     → returns express middleware
 *   pruneRateLimitBuckets(now?)
 *     → manuel sweep
 *   RATE_LIMIT_BUCKETS  (Map; expose for inline limiters in app.js)
 */

const { getClientIp } = require("./util");
const {
  insertSecurityEvent,
  normalizeSecurityEventPayload,
  activateSecurityBlock,
} = require("./security-events");
const { SECURITY_RATE_LIMIT_BLOCK_MS } = require("../constants/security");
const { AUTH_RATE_WINDOW_MS } = require("../constants/rate-limit");

const RATE_LIMIT_BUCKETS = new Map();

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

module.exports = {
  RATE_LIMIT_BUCKETS,
  createRateLimiter,
  pruneRateLimitBuckets,
};
