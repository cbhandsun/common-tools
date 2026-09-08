"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { listCodeFiles, measureFile, validateConfig, verifyArchitectureBudgets } = require("../scripts/verify-architecture-budgets");

function validConfig() {
  return {
    version: 1,
    defaults: {
      source: { maxLines: 1500, maxBytes: 163840, maxRelativeImports: 15 },
      test: { maxLines: 2000, maxBytes: 204800, maxRelativeImports: 30 }
    },
    maxLegacyExceptions: 0,
    legacyExceptions: {}
  };
}

test("architecture budget config accepts bounded defaults and rejects unsafe exceptions", () => {
  assert.equal(validateConfig(validConfig()).version, 1);
  assert.throws(() => validateConfig({ ...validConfig(), version: 2 }), /config is invalid/);
  assert.throws(() => validateConfig({
    ...validConfig(),
    legacyExceptions: { "../escape.js": { maxLines: 1 } }
  }), /path is invalid/);
  assert.throws(() => validateConfig({
    ...validConfig(),
    defaults: { ...validConfig().defaults, source: { maxLines: -1, maxBytes: 1, maxRelativeImports: 1 } }
  }), /maxLines is invalid/);
  assert.throws(() => validateConfig({ ...validConfig(), maxLegacyExceptions: -1 }), /maxLegacyExceptions/);
});

test("architecture budget exception count is itself a decreasing-only budget", () => {
  const current = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "architecture-budgets.json"), "utf8"));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "architecture-exception-count-"));
  try {
    const lowBudget = path.join(directory, "low.json");
    fs.writeFileSync(lowBudget, JSON.stringify({ ...current, maxLegacyExceptions: Object.keys(current.legacyExceptions).length - 1 }));
    assert.throws(() => verifyArchitectureBudgets({ budgetFile: lowBudget }), /exception count \d+ exceeds/);

    const staleBudget = path.join(directory, "stale.json");
    fs.writeFileSync(staleBudget, JSON.stringify({ ...current, maxLegacyExceptions: Object.keys(current.legacyExceptions).length + 1 }));
    assert.throws(() => verifyArchitectureBudgets({ budgetFile: staleBudget }), /ratchet maxLegacyExceptions down/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("architecture measurement counts lines, bytes and unique relative imports", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "architecture-budget-"));
  const file = path.join(directory, "fixture.js");
  const source = 'require("./one");\nrequire("./one");\nrequire("../two");\n';
  fs.writeFileSync(file, source);
  const lfMetrics = measureFile(file);
  fs.writeFileSync(file, source.replaceAll("\n", "\r\n"));
  const crlfMetrics = measureFile(file);
  assert.equal(lfMetrics.lines, 4);
  assert.equal(lfMetrics.relativeImports, 2);
  assert.equal(lfMetrics.bytes, Buffer.byteLength(source));
  assert.deepEqual(crlfMetrics, lfMetrics);
});

test("architecture budgets keep native-engine entrypoints but leave runtime payload sizing to package gates", () => {
  const files = listCodeFiles(path.resolve(__dirname, "..", "packages"))
    .map((file) => path.relative(path.resolve(__dirname, ".."), file).replaceAll("\\", "/"));
  assert.ok(files.includes("packages/slideclone-native-engine/index.js"));
  assert.equal(files.some((file) => file.startsWith("packages/slideclone-native-engine/scripts/")), false);
});
