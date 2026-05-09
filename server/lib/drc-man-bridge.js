"use strict";

/**
 * DRC MAN Python köprüsü (yerel inference yolu).
 *
 * Bu modül scripts/drc_man_bridge.py'yi spawnSync ile çağırarak DRC MAN
 * eğitim verilerini direct match yapar. Hızlı eşleme için canlıdan değil
 * yerelden çalışan path'tir.
 *
 * Vercel production'da çalışmaz: isLocalDrcManAvailable() process.env.VERCEL
 * kontrolüyle false döner. Production'da DB tarafı (assistant_troubleshooting_bank)
 * üzerinden cevap üretilir.
 *
 * Public API:
 *   isLocalDrcManAvailable()
 *   resolveDrcManPython()
 *   queryDrcManAssistant(message, language, user, answerLevel, history)
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { normalizeRole } = require("./util");

const DRC_MAN_DIR = path.resolve(process.env.DRC_MAN_DIR || path.join(os.homedir(), "Desktop", "DRC_MAN"));
const DRC_MAN_BRIDGE = path.join(__dirname, "..", "..", "scripts", "drc_man_bridge.py");
const DRC_MAN_PYTHON = process.env.DRC_MAN_PYTHON || "/opt/homebrew/bin/python3";

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
        cwd: path.join(__dirname, "..", ".."),
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

module.exports = {
  DRC_MAN_DIR,
  DRC_MAN_BRIDGE,
  DRC_MAN_PYTHON,
  isLocalDrcManAvailable,
  resolveDrcManPython,
  queryDrcManAssistant,
};
