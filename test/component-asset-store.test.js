"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  assetRegistryPath,
  materializeComponentInventory,
  readComponentAssetRegistry,
  registryCandidates,
  shouldMaterializeCandidate
} = require("../skills/pd-hifi-slideclone/scripts/lib/component-asset-store");

function inventory(candidates) {
  return { provider: "plugin-component-registry-v1", candidates };
}

function candidate(file, overrides = {}) {
  return {
    id: "islide-cycle",
    provider: "islide",
    path: file,
    name: path.basename(file),
    extension: ".pptx",
    assetKind: "presentation-template",
    roleTags: ["applied-component"],
    reusePolicy: "inspect-openxml-applied-plugin-component",
    ...overrides
  };
}

test("component asset store materializes adopted files by hash without retaining absolute provider paths", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-asset-store-"));
  const providerRoot = path.join(tmp, "provider", "iSlide");
  const storeRoot = path.join(tmp, "offline-store");
  fs.mkdirSync(providerRoot, { recursive: true });
  const source = path.join(providerRoot, "cycle.pptx");
  fs.writeFileSync(source, "PK adopted component");

  const first = materializeComponentInventory(inventory([candidate(source)]), { storeRoot });
  const second = materializeComponentInventory(inventory([candidate(source)]), { storeRoot });
  const asset = first.registry.assets[0];
  const storedFile = path.join(storeRoot, ...asset.relativePath.split("/"));

  assert.equal(first.registry.summary.materialized, 1);
  assert.equal(second.registry.summary.deduplicated, 1);
  assert.equal(asset.sha256.length, 64);
  assert.match(asset.relativePath, /^assets\/sha256\/[a-f0-9]{64}\.pptx$/);
  assert.equal(fs.readFileSync(storedFile, "utf8"), "PK adopted component");
  assert.equal(JSON.stringify(first.registry).includes(providerRoot), false);
  assert.equal(asset.sourceName, "cycle.pptx");
  assert.ok(asset.roleTags.includes("local-materialized"));
});

test("component asset store skips reference-only files unless explicitly included", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-asset-reference-"));
  const source = path.join(tmp, "reference.svg");
  fs.writeFileSync(source, "<svg/>");
  const reference = candidate(source, {
    id: "officeplus-reference",
    provider: "officeplus",
    extension: ".svg",
    assetKind: "vector-component",
    roleTags: ["vector"],
    reusePolicy: "learn-vector-style-or-use-after-license-review"
  });

  assert.equal(shouldMaterializeCandidate(reference), false);
  const skipped = materializeComponentInventory(inventory([reference]), { storeRoot: path.join(tmp, "store-a") });
  const included = materializeComponentInventory(inventory([reference]), {
    storeRoot: path.join(tmp, "store-b"),
    includeReferenceAssets: true
  });

  assert.equal(skipped.registry.assets.length, 0);
  assert.equal(skipped.registry.summary.skipped, 1);
  assert.equal(included.registry.assets.length, 1);
});

test("component asset store rejects missing, relative, oversized and symlink adopted sources", (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-asset-invalid-"));
  const storeRoot = path.join(tmp, "store");
  const oversized = path.join(tmp, "oversized.pptx");
  fs.writeFileSync(oversized, "12345");

  for (const invalid of [
    candidate(path.join(tmp, "missing.pptx")),
    candidate("relative.pptx"),
    candidate(oversized)
  ]) {
    const options = invalid.path === oversized ? { storeRoot, maxSourceBytes: 4 } : { storeRoot };
    assert.throws(() => materializeComponentInventory(inventory([invalid]), options), /materialization failed/);
  }

  const target = path.join(tmp, "target.pptx");
  const link = path.join(tmp, "link.pptx");
  fs.writeFileSync(target, "target");
  try {
    fs.symlinkSync(target, link, "file");
  } catch {
    t.diagnostic("symlink creation is unavailable; symlink boundary assertion skipped");
    return;
  }
  assert.throws(() => materializeComponentInventory(inventory([candidate(link)]), { storeRoot }), /materialization failed/);
});

test("component asset registry rejects traversal and detects corrupted stored assets", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-asset-integrity-"));
  const source = path.join(tmp, "component.pptx");
  fs.writeFileSync(source, "original");
  const result = materializeComponentInventory(inventory([candidate(source)]), { storeRoot: tmp });
  const asset = result.registry.assets[0];
  const storedFile = path.join(tmp, ...asset.relativePath.split("/"));
  fs.writeFileSync(storedFile, "corrupt!");

  assert.throws(() => registryCandidates(result.registry, tmp), /integrity verification/);

  const malicious = {
    provider: "component-asset-store-v1",
    schemaVersion: 1,
    assets: [{ ...asset, relativePath: "../escape.pptx" }]
  };
  fs.writeFileSync(assetRegistryPath(tmp), JSON.stringify(malicious));
  assert.throws(() => readComponentAssetRegistry(assetRegistryPath(tmp)), /relative path is invalid/);
});

test("component asset store rejects malformed inventory contracts and can report failures without throwing", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-asset-contract-"));
  assert.throws(() => materializeComponentInventory({}, { storeRoot: tmp }), /invalid contract/);
  assert.throws(() => materializeComponentInventory({ provider: "wrong", candidates: [] }, { storeRoot: tmp }), /invalid contract/);

  const result = materializeComponentInventory(inventory([candidate(path.join(tmp, "missing.pptx"))]), {
    storeRoot: tmp,
    strict: false
  });
  assert.equal(result.registry.summary.failed, 1);
  assert.equal(result.results[0].error.includes(tmp), false);
});
