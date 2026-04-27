#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const runName = process.argv[2] || "run_25000";
const progressPath = path.join(
  process.cwd(),
  ".codex_tmp",
  "drc_man_troubleshooting_test_run",
  runName,
  "progress.json"
);

function formatSeconds(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds || 0)));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function render() {
  if (!fs.existsSync(progressPath)) {
    console.clear();
    console.log(`Progress file not found: ${progressPath}`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(progressPath, "utf8"));
  const startedAt = new Date(data.startedAt).getTime();
  const updatedAt = new Date(data.updatedAt).getTime();
  const elapsedSeconds = Math.max(1, (updatedAt - startedAt) / 1000);
  const rate = Number(data.processed || 0) / elapsedSeconds;
  const remaining = Math.max(0, Number(data.total || 0) - Number(data.processed || 0));
  const etaSeconds = rate > 0 ? remaining / rate : 0;

  console.clear();
  console.log("DRC MAN Troubleshooting Test");
  console.log("");
  console.log(`Run: ${runName}`);
  console.log(`Updated: ${data.updatedAt}`);
  console.log(`Processed: ${data.processed}/${data.total}`);
  console.log(`Passed: ${data.passed}`);
  console.log(`Failed: ${data.failed}`);
  console.log(`Pass rate: ${data.passRate}%`);
  console.log(`Speed: ${rate.toFixed(2)} soru/sn`);
  console.log(`Remaining: ${remaining}`);
  console.log(`ETA: ${formatSeconds(etaSeconds)}`);
  console.log("");
  console.log("TR:", JSON.stringify(data.languageBreakdown?.tr || {}, null, 0));
  console.log("DE:", JSON.stringify(data.languageBreakdown?.de || {}, null, 0));
  console.log("");
  console.log("Failure breakdown:");
  Object.entries(data.failureBreakdown || {})
    .sort((a, b) => b[1] - a[1])
    .forEach(([reason, count]) => {
      console.log(`- ${reason}: ${count}`);
    });
  console.log("");
  console.log(`File: ${progressPath}`);
}

render();
setInterval(render, 5000);
