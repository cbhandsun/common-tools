"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { REQUIRED_ADRS, assertAdrDocuments, verifyAdrs } = require("../scripts/verify-adrs");

const ROOT = path.resolve(__dirname, "..");

test("all required architecture decisions and their index are present", () => {
  assert.deepEqual(verifyAdrs(ROOT), { count: REQUIRED_ADRS.length, files: REQUIRED_ADRS });
});

test("ADR verifier rejects incomplete files and missing decision sections", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-adrs-"));
  try {
    for (const file of REQUIRED_ADRS) fs.writeFileSync(path.join(root, file), `# ADR ${file.slice(0, 4)}: Fixture\n\n## Decision\n\nDecision.\n\n## Consequences\n\nConsequences.\n`, "utf8");
    assert.deepEqual(assertAdrDocuments(root), { count: REQUIRED_ADRS.length, files: REQUIRED_ADRS });
    fs.rmSync(path.join(root, REQUIRED_ADRS[0]));
    assert.throws(() => assertAdrDocuments(root), /incomplete/);
    fs.writeFileSync(path.join(root, REQUIRED_ADRS[0]), "# ADR 0001: Fixture\n\n## Decision\n\nDecision.\n", "utf8");
    assert.throws(() => assertAdrDocuments(root), /invalid/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
