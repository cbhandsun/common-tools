"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  CAPABILITY_MANIFESTS,
  RUNTIME_VERSION,
  assertManifestDependencyGraph,
  canonicalManifest,
  compareManifestVersions,
  loadCapabilityManifests,
  parseRuntimeRange,
  runtimeSatisfiesRange,
  validateCapabilityManifest
} = require("../packages/capability-manifests");
const runtime = require("../packages/capability-runtime");

function signedManifest(overrides) {
  const manifest = { ...CAPABILITY_MANIFESTS.get("ppt-improve"), ...overrides };
  return { ...manifest, contentSha256: crypto.createHash("sha256").update(canonicalManifest(manifest)).digest("hex") };
}

test("capability-manifests is the direct package boundary for signed capability metadata", () => {
  assert.equal(RUNTIME_VERSION, "0.1.0");
  assert.deepEqual([...CAPABILITY_MANIFESTS.keys()].sort(), ["image-to-editable", "ppt-create", "ppt-improve", "ppt-quality", "project-audit", "siyuan-note"]);
  assert.equal(runtime.CAPABILITY_MANIFESTS, CAPABILITY_MANIFESTS);
  assert.equal(runtime.RUNTIME_VERSION, RUNTIME_VERSION);
  assert.equal(runtime.validateCapabilityManifest, validateCapabilityManifest);
  assert.equal(runtime.loadCapabilityManifests, loadCapabilityManifests);
});

test("capability manifest validation fails closed for version, hash, dependency, and runtime drift", () => {
  const compatible = signedManifest({ minimumRuntimeVersion: ">=0.1.0 <0.2.0" });
  assert.equal(validateCapabilityManifest(compatible).minimumRuntimeVersion, ">=0.1.0 <0.2.0");
  assert.deepEqual(parseRuntimeRange(">=0.1.0 <0.2.0"), { lower: [0, 1, 0], upper: [0, 2, 0], value: ">=0.1.0 <0.2.0" });
  assert.equal(runtimeSatisfiesRange("0.1.9", ">=0.1.0 <0.2.0"), true);
  assert.equal(runtimeSatisfiesRange("0.2.0", ">=0.1.0 <0.2.0"), false);
  assert.equal(compareManifestVersions("0.1.1", "0.1.0"), 1);

  assert.throws(() => validateCapabilityManifest({ ...compatible, contentSha256: "0".repeat(64) }), /hash mismatch/);
  assert.throws(() => validateCapabilityManifest(signedManifest({ minimumRuntimeVersion: ">=0.2.0 <0.3.0" })), /incompatible Runtime version/);
  assert.throws(() => validateCapabilityManifest(signedManifest({ dependencies: ["ppt-improve"] })), /dependencies/);
  assert.throws(() => validateCapabilityManifest(signedManifest({ deprecation: { announcedIn: "0.1.1", removalAfter: "0.1.0", message: "Invalid version window." } })), /deprecation/);
});

test("manifest loading validates directory identity and dependency graph without runtime state", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-manifest-package-"));
  try {
    const source = path.join(__dirname, "..", "packages", "capability-manifests");
    fs.cpSync(path.join(source, "image-to-editable"), path.join(root, "image-to-editable"), { recursive: true });
    fs.cpSync(path.join(source, "ppt-quality"), path.join(root, "ppt-quality"), { recursive: true });
    fs.cpSync(path.join(source, "ppt-improve"), path.join(root, "wrong-name"), { recursive: true });
    assert.throws(() => loadCapabilityManifests(root), /identity/);

    fs.rmSync(path.join(root, "wrong-name"), { recursive: true, force: true });
    fs.cpSync(path.join(source, "ppt-improve"), path.join(root, "ppt-improve"), { recursive: true });
    assert.deepEqual([...loadCapabilityManifests(root).keys()].sort(), ["image-to-editable", "ppt-improve", "ppt-quality"]);
    assert.throws(() => assertManifestDependencyGraph(new Map([["first", { capability: "first", dependencies: ["second"] }]])), /not installed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
