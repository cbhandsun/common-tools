"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  parseArgs: parseComponentStrategyArgs,
  resolveComponentInventory,
  withAppliedComponentHarvestDefaults
} = require("../component-strategy-rebuild");

const VALUE_OPTIONS = new Set([
  "--component-inventory",
  "--component-inventory-cache",
  "--component-asset-root",
  "--component-self-fidelity-report",
  "--applied-component-source",
  "--applied-component-input",
  "--applied-component-provider",
  "--applied-component-harvest-root",
  "--harvest-discover-root",
  "--harvest-discover-limit"
]);
const FLAG_OPTIONS = new Set([
  "--harvest-islide-temp",
  "--discover-islide-temp-components",
  "--harvest-officeplus-local",
  "--discover-officeplus-local-components",
  "--applied-component-harvest-recursive"
]);

function prepareSharedComponentInventory({ argv = [], outRoot, workerArgv }) {
  if (!Array.isArray(argv)) throw new TypeError("argv must be an array");
  if (typeof workerArgv !== "function") throw new TypeError("workerArgv must be a function");
  const normalizedOutRoot = path.resolve(String(outRoot || ""));
  const componentArgv = workerArgv(argv);
  const parsed = parseComponentStrategyArgs(["node", "component-strategy-rebuild.js", ...componentArgv]);
  if (parsed.componentAssets !== true) {
    return { enabled: false, argv: componentArgv, report: { mode: "disabled" } };
  }

  const analysisRoot = path.join(normalizedOutRoot, "_component-strategy-analysis");
  const startedAt = Date.now();
  const resolved = resolveComponentInventory(withAppliedComponentHarvestDefaults(parsed, { analysisRoot }));
  const snapshotDir = path.join(normalizedOutRoot, ".component-strategy-shared");
  fs.mkdirSync(snapshotDir, { recursive: true });
  const serialized = `${JSON.stringify(resolved.inventory, null, 2)}\n`;
  const digest = crypto.createHash("sha256").update(serialized).digest("hex");
  const snapshotFile = path.join(snapshotDir, `component-inventory-${digest.slice(0, 20)}.json`);
  if (!fs.existsSync(snapshotFile)) writeFileAtomic(snapshotFile, serialized);
  return {
    enabled: true,
    argv: injectSharedComponentInventoryArgs(componentArgv, snapshotFile),
    report: {
      mode: "parent-snapshot",
      file: snapshotFile,
      sha256: digest,
      candidates: Array.isArray(resolved.inventory?.candidates) ? resolved.inventory.candidates.length : 0,
      elapsedMs: Date.now() - startedAt,
      source: resolved.source
    }
  };
}

function injectSharedComponentInventoryArgs(argv = [], snapshotFile) {
  const result = [];
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (VALUE_OPTIONS.has(item)) {
      if (argv[index + 1] && !String(argv[index + 1]).startsWith("--")) index += 1;
      continue;
    }
    if (FLAG_OPTIONS.has(item)) continue;
    result.push(item);
  }
  result.push("--component-inventory", path.resolve(String(snapshotFile)));
  return result;
}

function writeFileAtomic(file, contents) {
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomBytes(6).toString("hex")}`;
  try {
    fs.writeFileSync(temporary, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
}

module.exports = {
  injectSharedComponentInventoryArgs,
  prepareSharedComponentInventory
};
