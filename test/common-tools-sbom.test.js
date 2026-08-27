"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createSbom, generateSbom, packageNameFromPath, parseArguments, parseIntegrity } = require("../scripts/generate-sbom");

test("SBOM generation is reproducible and excludes development-only packages", () => {
  const lock = {
    lockfileVersion: 3,
    packages: {
      "": { name: "common-tools", version: "1.2.3" },
      "node_modules/alpha": { version: "2.0.0", integrity: "sha512-YWJj" },
      "node_modules/@scope/bravo": { version: "3.0.0" },
      "node_modules/dev-only": { version: "4.0.0", dev: true },
      "packages/local": { version: "1.0.0" }
    }
  };
  const first = createSbom(lock);
  const second = createSbom(lock);
  assert.deepEqual(first, second);
  assert.equal(first.packages.length, 3);
  assert.equal(first.packages[1].name, "@scope/bravo");
  assert.deepEqual(first.packages[2].checksums, [{ algorithm: "SHA512", checksumValue: "616263" }]);
  assert.equal(first.creationInfo.created, "1970-01-01T00:00:00Z");
});

test("SBOM input validation never treats arbitrary paths as dependency names", () => {
  assert.equal(packageNameFromPath("node_modules/alpha"), "alpha");
  assert.equal(packageNameFromPath("node_modules/@scope/bravo"), "@scope/bravo");
  assert.equal(packageNameFromPath("node_modules/alpha/node_modules/bravo"), "bravo");
  assert.equal(parseIntegrity("sha256-YWJj").checksumValue, "616263");
  assert.equal(parseIntegrity("sha512-not valid"), undefined);
  assert.deepEqual(parseArguments(["--lock", "lock.json", "--output", "result.json"]), { lockPath: "lock.json", outputPath: "result.json" });
  assert.throws(() => parseArguments(["--output"]), /requires a value/);
  assert.throws(() => parseArguments(["--unknown"]), /unknown argument/);
  assert.throws(() => createSbom({ lockfileVersion: 1, packages: {} }), /unsupported/);
});

test("SBOM writer parses locked JSON and writes a private artifact", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-sbom-"));
  try {
    const lockPath = path.join(root, "package-lock.json");
    const outputPath = path.join(root, "artifacts", "sbom.json");
    fs.writeFileSync(lockPath, JSON.stringify({ lockfileVersion: 3, packages: { "": { name: "test", version: "1.0.0" } } }), "utf8");
    const result = generateSbom({ lockPath, outputPath });
    assert.equal(result.packageCount, 1);
    assert.equal(JSON.parse(fs.readFileSync(outputPath, "utf8")).name, "test-1.0.0");
    if (process.platform !== "win32") assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
