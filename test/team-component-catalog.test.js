"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { loadTeamComponentCatalog } = require("../packages/slideclone-core/team-component-catalog");
const { buildComponentAssetManifest } = require("../skills/pd-hifi-slideclone/scripts/lib/component-asset-matcher");

function fixture(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "team-component-catalog-"));
  const contents = "PK promoted component";
  const sha256 = crypto.createHash("sha256").update(contents).digest("hex");
  const assets = path.join(root, "assets", "sha256");
  fs.mkdirSync(assets, { recursive: true });
  const asset = {
    id: "promoted-cycle",
    sha256,
    extension: ".pptx",
    sizeBytes: Buffer.byteLength(contents),
    assetKind: "presentation-template",
    selfFidelityPromoted: true,
    selfFidelity: { passed: true, reportFile: "secret-path" }
  };
  fs.writeFileSync(path.join(assets, `${sha256}.pptx`), contents);
  const registry = { provider: "component-asset-store-v1", schemaVersion: 1, assets: [asset] };
  fs.writeFileSync(path.join(root, "asset-registry.json"), JSON.stringify(registry));
  return { root, assets, asset, registry: { ...registry, ...overrides } };
}

function candidatesFor(root, registry) {
  return registry.assets.map((asset) => ({
    id: asset.id,
    provider: "officeplus",
    contentSha256: asset.sha256,
    extension: asset.extension,
    sizeBytes: asset.sizeBytes,
    path: path.join(root, "assets", "sha256", `${asset.sha256}${asset.extension}`),
    name: "matrix-template.pptx",
    roleTags: ["applied-component", "self-fidelity-promoted", "template-layout"],
    reusePolicy: "reuse",
    learningSummary: { status: "unavailable" },
    selfFidelityPromoted: true,
    selfFidelity: { passed: true }
  }));
}

test("team component catalog retains verified internal asset paths and path-free public evidence", () => {
  const value = fixture();
  value.registry.assets.push({
    id: "pending", sha256: "b".repeat(64), extension: ".svg", sizeBytes: 1, assetKind: "vector-component", selfFidelityPromoted: false
  });
  const catalog = loadTeamComponentCatalog({
    root: value.root,
    readRegistry: () => value.registry,
    registryCandidates: (registry, root) => candidatesFor(root, registry)
  });

  assert.equal(catalog.inventory.provider, "plugin-component-registry-v1");
  assert.deepEqual(catalog.inventory.candidates[0], {
    id: "promoted-cycle",
    provider: "officeplus",
    path: fs.realpathSync.native(path.join(value.assets, `${value.asset.sha256}.pptx`)),
    name: "matrix-template.pptx",
    roleTags: ["applied-component", "self-fidelity-promoted", "template-layout"],
    reusePolicy: "reuse",
    learningSummary: { status: "unavailable" },
    sha256: value.asset.sha256,
    extension: ".pptx",
    sizeBytes: value.asset.sizeBytes,
    assetKind: "presentation-template",
    selfFidelityPromoted: true,
    selfFidelity: { passed: true }
  });
  assert.equal(JSON.stringify(catalog.evidence).includes(value.root), false);
  assert.equal(JSON.stringify(catalog).includes("secret-path"), false);
  assert.equal(catalog.evidence.registrySHA256.length, 64);
});

test("team component catalog inventory supplies verified local assets to the real matcher", () => {
  const value = fixture();
  const catalog = loadTeamComponentCatalog({
    root: value.root,
    readRegistry: () => value.registry,
    registryCandidates: (registry, root) => candidatesFor(root, registry)
  });
  const manifest = buildComponentAssetManifest({
    inventory: catalog.inventory,
    candidateReport: {
      layers: [{
        pageIndex: 0,
        imageIndex: 0,
        box: { x: 0, y: 0, w: 100, h: 100 },
        layerType: "diagram",
        templateFamily: "matrix",
        componentRenderStrategy: {
          mode: "plugin-component-template",
          bestCandidate: { sourceProvider: "officeplus", kind: "component" }
        }
      }]
    }
  });

  assert.ok(manifest.layers[0].localAssets.length >= 1);
  assert.equal(manifest.layers[0].localAssets[0].path, fs.realpathSync.native(path.join(value.assets, `${value.asset.sha256}.pptx`)));
});

test("team component catalog rejects invalid roots, symlink registries, and oversized registries", (t) => {
  const value = fixture();
  assert.throws(() => loadTeamComponentCatalog({ root: "relative", readRegistry() {}, registryCandidates() {} }), /absolute path/);
  assert.throws(() => loadTeamComponentCatalog({ root: path.join(value.root, "missing"), readRegistry() {}, registryCandidates() {} }), /does not exist/);

  const link = path.join(value.root, "registry-link.json");
  try {
    fs.renameSync(path.join(value.root, "asset-registry.json"), link);
    fs.symlinkSync(link, path.join(value.root, "asset-registry.json"), "file");
  } catch {
    t.diagnostic("symlink creation is unavailable; registry symlink assertion skipped");
    return;
  }
  assert.throws(() => loadTeamComponentCatalog({ root: value.root, readRegistry: () => value.registry, registryCandidates() {} }), /non-symlink file/);
});

test("team component catalog rejects more than 100 registry assets and unsafe inputs", () => {
  const value = fixture({ assets: Array.from({ length: 101 }, () => ({
    id: "x", sha256: "a".repeat(64), extension: ".svg", sizeBytes: 1, assetKind: "vector-component", selfFidelityPromoted: true, selfFidelity: { passed: true }
  })) });
  assert.throws(() => loadTeamComponentCatalog({ root: value.root, readRegistry: () => value.registry, registryCandidates() {} }), /assets exceed/);
  const unsafe = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error("nope"); } });
  assert.throws(() => loadTeamComponentCatalog(unsafe), /plain object|unsafe/);
});

test("team component catalog propagates candidate checksum verification failures and rejects stale external paths", () => {
  const value = fixture();
  const options = { root: value.root, readRegistry: () => value.registry };
  assert.throws(() => loadTeamComponentCatalog({ ...options, registryCandidates() { throw new Error("component asset failed integrity verification"); } }), /integrity verification/);
  assert.throws(() => loadTeamComponentCatalog({
    ...options,
    registryCandidates: (registry) => candidatesFor(value.root, registry).map((candidate) => ({ ...candidate, path: path.join(os.tmpdir(), "stale.pptx") }))
  }), /outside the asset directory/);
});

test("team component catalog accepts the canonical asset path regardless of Windows path casing", { skip: process.platform !== "win32" }, () => {
  const value = fixture();
  const catalog = loadTeamComponentCatalog({
    root: value.root,
    readRegistry: () => value.registry,
    registryCandidates: (registry, root) => candidatesFor(root, registry).map((candidate) => ({ ...candidate, path: candidate.path.toLocaleUpperCase("en-US") }))
  });
  assert.equal(catalog.inventory.candidates.length, 1);
});
