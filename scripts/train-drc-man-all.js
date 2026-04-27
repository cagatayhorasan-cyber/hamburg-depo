const { spawnSync } = require("child_process");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");

const steps = [
  ["node", ["scripts/generate_drc_man_troubleshooting_pack.js"]],
  ["node", ["scripts/generate_drc_man_gas_pack.js"]],
  ["node", ["scripts/generate_drc_man_specialty_packs.js"]],
  ["node", ["scripts/train-drc-man-training-bank.js"]],
  ["node", ["scripts/train-drc-man-roleplay-bank.js"]],
  ["node", ["scripts/train-drc-man-open-source-hvac-bank.js"]],
  ["node", ["scripts/train-drc-man-github-fault-diagnosis-bank.js"]],
  ["node", ["scripts/train-drc-man-german-sales-dialogues.js"]],
  ["node", ["scripts/train-drc-man-master-course.js"]],
  ["node", ["scripts/train-drc-man-troubleshooting-bank.js"]],
  ["node", ["scripts/train-drc-man-products.js"]],
];

function runStep(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
}

function main() {
  for (const [command, args] of steps) {
    runStep(command, args);
  }

  console.log(JSON.stringify({
    ok: true,
    steps: steps.map(([command, args]) => `${command} ${args.join(" ")}`),
  }, null, 2));
}

main();
