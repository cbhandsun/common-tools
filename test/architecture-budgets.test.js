"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { measureFile, validateConfig } = require("../scripts/verify-architecture-budgets");

function validConfig() {
  return {
    version: 1,
    defaults: {
      source: { maxLines: 1500, maxBytes: 163840, maxRelativeImports: 15 },
      test: { maxLines: 2000, maxBytes: 204800, maxRelativeImports: 30 }
    },
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
