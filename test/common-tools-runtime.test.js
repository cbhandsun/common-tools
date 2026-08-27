"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { CAPABILITY_MANIFESTS, JobStore, assertManifestDependencyGraph, canonicalManifest, compareManifestVersions, effectivePluginConfig, insideRoot, loadPluginConfig, parseRuntimeRange, readPluginConfig, readProjectCapabilityScope, resolvedCapabilityDependencies, rollbackPluginConfig, runtimeSatisfiesRange, setCapabilityEnabled, setEnabledCapabilities, upgradePluginConfig, validateCapabilityManifest } = require("../packages/capability-runtime");
const { VISUAL_REPORT_NAME, collectArtifacts, createEditableJob, editableQuality, editableVisualSummary, getJob, runEditableJob } = require("../packages/slideclone-core");
const { createBundledSlidecloneRunner } = require("../packages/cli/slideclone-runner");

test("JobStore is idempotent and enforces the job state machine", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-runtime-"));
  try {
    const store = new JobStore({ root, ownerId: "test-user" });
    const first = store.create({ id: "job-a", capability: "image-to-editable", idempotencyKey: "request-a", expiresAt: "2030-01-01T00:00:00.000Z" });
    const second = store.create({ id: "job-b", capability: "image-to-editable", idempotencyKey: "request-a", expiresAt: "2030-01-01T00:00:00.000Z" });
    assert.equal(second.id, first.id);
    assert.equal(store.transition(first.id, "running").status, "running");
    assert.equal(store.transition(first.id, "cancel_requested").status, "cancel_requested");
    assert.equal(store.transition(first.id, "cancelled").status, "cancelled");
    assert.throws(() => store.transition(first.id, "running"), /invalid job transition/);
    assert.throws(() => store.write({ ...store.get(first.id), quality: { arbitrary: "must-not-persist" } }), /quality report/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("JobStore persists a complete job body after an atomic update", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-atomic-"));
  try {
    const store = new JobStore({ root, ownerId: "test-user" });
    const job = store.create({ id: "job-atomic", capability: "image-to-editable", idempotencyKey: "atomic-request", expiresAt: "2030-01-01T00:00:00.000Z" });
    const updated = store.transition(job.id, "running", { attempt: 1 });
    assert.equal(updated.status, "running");
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, "jobs", "job-atomic.json"), "utf8")).status, "running");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("insideRoot rejects path traversal", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-root-"));
  try {
    assert.throws(() => insideRoot(root, path.join(root, "..", "outside")), /outside/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("capability manifests are hash-verified and plugin revisions can roll back", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-manifest-"));
  try {
    const manifest = CAPABILITY_MANIFESTS.get("project-audit");
    assert.ok(manifest);
    assert.throws(() => validateCapabilityManifest({ ...manifest, contentSha256: "0".repeat(64) }), /hash mismatch/);
    const enabled = setCapabilityEnabled(root, "project-audit", true);
    assert.equal(enabled.generation, 1);
    assert.equal(enabled.manifests["project-audit"].contentSha256, manifest.contentSha256);
    const disabled = setCapabilityEnabled(root, "image-to-editable", false);
    assert.deepEqual(disabled.enabledCapabilities, ["project-audit"]);
    const rolledBack = rollbackPluginConfig(root);
    assert.deepEqual(rolledBack.enabledCapabilities, ["image-to-editable", "project-audit"]);
    assert.equal(rolledBack.generation, 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("capability manifests declare a bounded Runtime compatibility range and fail closed outside it", () => {
  const current = CAPABILITY_MANIFESTS.get("image-to-editable");
  const compatible = { ...current, minimumRuntimeVersion: ">=0.1.0 <0.2.0" };
  compatible.contentSha256 = crypto.createHash("sha256").update(canonicalManifest(compatible)).digest("hex");
  assert.equal(validateCapabilityManifest(compatible).minimumRuntimeVersion, compatible.minimumRuntimeVersion);
  assert.equal(runtimeSatisfiesRange("0.1.9", compatible.minimumRuntimeVersion), true);
  assert.equal(runtimeSatisfiesRange("0.2.0", compatible.minimumRuntimeVersion), false);
  assert.deepEqual(parseRuntimeRange(compatible.minimumRuntimeVersion), { lower: [0, 1, 0], upper: [0, 2, 0], value: compatible.minimumRuntimeVersion });
  assert.throws(() => validateCapabilityManifest(compatible, { runtimeVersion: "0.2.0" }), /incompatible Runtime version/);

  const malformed = { ...compatible, minimumRuntimeVersion: ">=0.1.0" };
  malformed.contentSha256 = crypto.createHash("sha256").update(canonicalManifest(malformed)).digest("hex");
  assert.equal(parseRuntimeRange(malformed.minimumRuntimeVersion), null);
  assert.throws(() => validateCapabilityManifest(malformed), /capability manifest is invalid/);
});

test("capability dependencies are explicit, transitive, and cannot be disabled while required", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-plugin-dependencies-"));
  try {
    assert.deepEqual(CAPABILITY_MANIFESTS.get("ppt-improve").dependencies, ["ppt-quality"]);
    assert.deepEqual(resolvedCapabilityDependencies(["ppt-improve"]), ["ppt-improve", "ppt-quality"]);
    const enabled = setCapabilityEnabled(root, "ppt-improve", true);
    assert.deepEqual(enabled.enabledCapabilities, ["image-to-editable", "ppt-improve", "ppt-quality"]);
    assert.throws(() => setCapabilityEnabled(root, "ppt-quality", false), /required by an enabled capability/);
    assert.deepEqual(setCapabilityEnabled(root, "ppt-improve", false).enabledCapabilities, ["image-to-editable", "ppt-quality"]);

    const first = { capability: "first", dependencies: ["second"] };
    const second = { capability: "second", dependencies: ["first"] };
    assert.throws(() => assertManifestDependencyGraph(new Map([["first", first], ["second", second]])), /cycle/);
    assert.throws(() => assertManifestDependencyGraph(new Map([["first", first]])), /not installed/);

    const current = CAPABILITY_MANIFESTS.get("ppt-improve");
    const invalid = { ...current, dependencies: ["ppt-improve"] };
    invalid.contentSha256 = crypto.createHash("sha256").update(canonicalManifest(invalid)).digest("hex");
    assert.throws(() => validateCapabilityManifest(invalid), /dependencies/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("exclusive capability enablement removes unrelated defaults but retains declared dependencies", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-plugin-exclusive-"));
  try {
    const audit = setCapabilityEnabled(root, "project-audit", true, { exclusive: true });
    assert.deepEqual(audit.enabledCapabilities, ["project-audit"]);
    assert.equal(audit.generation, 1);
    assert.equal(setCapabilityEnabled(root, "project-audit", true, { exclusive: true }).generation, 1);

    const improve = setCapabilityEnabled(root, "ppt-improve", true, { exclusive: true });
    assert.deepEqual(improve.enabledCapabilities, ["ppt-improve", "ppt-quality"]);
    assert.equal(improve.generation, 2);
    assert.throws(() => setCapabilityEnabled(root, "ppt-quality", false, { exclusive: true }), /only valid when enabling/);
    assert.throws(() => setCapabilityEnabled(root, "ppt-quality", true, { exclusive: "yes" }), /options/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("atomic capability configuration enables a declared set and its dependencies without partial writes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-plugin-set-"));
  try {
    const configured = setEnabledCapabilities(root, ["project-audit", "ppt-improve"]);
    assert.deepEqual(configured.enabledCapabilities, ["ppt-improve", "ppt-quality", "project-audit"]);
    assert.equal(configured.generation, 1);
    assert.equal(setEnabledCapabilities(root, ["ppt-improve", "project-audit"]).generation, 1);
    assert.throws(() => setEnabledCapabilities(root, ["project-audit", "unknown-capability"]), /dependencies are invalid/);
    assert.deepEqual(readPluginConfig(root).enabledCapabilities, ["ppt-improve", "ppt-quality", "project-audit"]);
    assert.throws(() => setEnabledCapabilities(root, ["project-audit", "project-audit"]), /capability set is invalid/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("project runtime scope can only narrow enabled capabilities and rejects malformed configuration", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-project-scope-"));
  const state = path.join(workspace, "state");
  try {
    setCapabilityEnabled(state, "project-audit", true);
    assert.deepEqual(effectivePluginConfig(state, workspace).effectiveCapabilities, ["image-to-editable", "project-audit"]);
    const runtimeDir = path.join(workspace, ".common-tools");
    fs.mkdirSync(runtimeDir);
    fs.writeFileSync(path.join(runtimeDir, "runtime.json"), JSON.stringify({ allowedCapabilities: ["project-audit"] }), "utf8");
    const scoped = effectivePluginConfig(state, workspace);
    assert.deepEqual(scoped.projectScope, ["project-audit"]);
    assert.deepEqual(scoped.effectiveCapabilities, ["project-audit"]);

    fs.writeFileSync(path.join(runtimeDir, "runtime.json"), JSON.stringify({ allowedCapabilities: ["ppt-improve"] }), "utf8");
    assert.deepEqual(readProjectCapabilityScope(workspace), ["ppt-improve", "ppt-quality"]);
    assert.deepEqual(effectivePluginConfig(state, workspace).effectiveCapabilities, []);

    fs.writeFileSync(path.join(runtimeDir, "runtime.json"), JSON.stringify({ allowedCapabilities: ["unknown"] }), "utf8");
    assert.throws(() => readProjectCapabilityScope(workspace), /project runtime configuration/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("upgrading a legacy dependent plugin records and enables its newly declared prerequisites", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-plugin-dependency-upgrade-"));
  try {
    fs.writeFileSync(path.join(root, "plugins.json"), JSON.stringify({
      configVersion: 1,
      generation: 3,
      enabledCapabilities: ["ppt-improve"],
      manifests: {
        "ppt-improve": {
          version: "0.1.0",
          contentSha256: "c69f4cb3156b7438b17f93cefbf16c7b7228f035b6f6c50960db8a1de9b50a21",
          requiredWorkerProfile: "base"
        }
      }
    }), "utf8");
    assert.throws(() => loadPluginConfig(root), /manifest changed/);
    const upgraded = upgradePluginConfig(root, "ppt-improve");
    assert.equal(upgraded.generation, 4);
    assert.deepEqual(upgraded.enabledCapabilities, ["ppt-improve", "ppt-quality"]);
    assert.deepEqual(upgraded.manifests["ppt-improve"].dependencies, ["ppt-quality"]);
    assert.deepEqual(upgraded.manifests["ppt-quality"].dependencies, []);
    assert.equal(fs.existsSync(path.join(root, "plugins.history", "3.json")), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("capability manifest deprecation is signed, versioned, and non-self-referential", () => {
  const current = CAPABILITY_MANIFESTS.get("project-audit");
  const draft = {
    ...current,
    version: "0.1.2",
    deprecation: {
      announcedIn: "0.1.2",
      removalAfter: "0.2.0",
      replacement: "image-to-editable",
      message: "Use the replacement capability for new workflows."
    }
  };
  draft.contentSha256 = crypto.createHash("sha256").update(canonicalManifest(draft)).digest("hex");
  const validated = validateCapabilityManifest(draft);
  assert.deepEqual(validated.deprecation, draft.deprecation);
  const invalidWindow = { ...draft, deprecation: { ...draft.deprecation, removalAfter: "0.1.2" } };
  invalidWindow.contentSha256 = crypto.createHash("sha256").update(canonicalManifest(invalidWindow)).digest("hex");
  assert.throws(() => validateCapabilityManifest(invalidWindow), /deprecation/);
  const invalidReplacement = { ...draft, deprecation: { ...draft.deprecation, replacement: "project-audit" } };
  invalidReplacement.contentSha256 = crypto.createHash("sha256").update(canonicalManifest(invalidReplacement)).digest("hex");
  assert.throws(() => validateCapabilityManifest(invalidReplacement), /deprecation/);
});

test("capability enablement is idempotent and does not create useless configuration revisions", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-plugin-idempotent-"));
  try {
    const first = setCapabilityEnabled(root, "project-audit", true);
    const repeated = setCapabilityEnabled(root, "project-audit", true);
    assert.equal(first.generation, 1);
    assert.equal(repeated.generation, first.generation);
    assert.deepEqual(repeated.enabledCapabilities, ["image-to-editable", "project-audit"]);
    assert.equal(fs.existsSync(path.join(root, "plugins.history")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("reading a missing plugin configuration uses defaults without creating local state", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-plugin-read-"));
  const root = path.join(parent, "missing-state");
  try {
    assert.deepEqual(readPluginConfig(root).enabledCapabilities, ["image-to-editable"]);
    assert.equal(fs.existsSync(root), false);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("manifest changes require an explicit version-increasing plugin upgrade", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-plugin-upgrade-"));
  try {
    const current = CAPABILITY_MANIFESTS.get("image-to-editable");
    fs.writeFileSync(path.join(root, "plugins.json"), JSON.stringify({ configVersion: 1, generation: 4, enabledCapabilities: ["image-to-editable"], manifests: { "image-to-editable": { version: "0.1.0", contentSha256: "0".repeat(64), requiredWorkerProfile: current.requiredWorkerProfile } } }), "utf8");
    assert.throws(() => loadPluginConfig(root), /manifest changed/);
    const upgraded = upgradePluginConfig(root, "image-to-editable");
    assert.equal(upgraded.generation, 5);
    assert.equal(upgraded.manifests["image-to-editable"].version, "0.1.3");
    assert.equal(fs.existsSync(path.join(root, "plugins.history", "4.json")), true);
    assert.equal(upgradePluginConfig(root, "image-to-editable").generation, 5);
    assert.equal(compareManifestVersions("0.1.1", "0.1.0"), 1);
    assert.equal(compareManifestVersions("0.1.0", "0.1.1"), -1);
    assert.equal(compareManifestVersions("invalid", "0.1.1"), null);

    const stale = { ...JSON.parse(fs.readFileSync(path.join(root, "plugins.json"), "utf8")), manifests: { "image-to-editable": { ...upgraded.manifests["image-to-editable"], contentSha256: "f".repeat(64) } } };
    fs.writeFileSync(path.join(root, "plugins.json"), JSON.stringify(stale), "utf8");
    assert.throws(() => upgradePluginConfig(root, "image-to-editable"), /manifest changed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("image-to-editable rejects an invalid provider config before it creates a queued Job", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-slideclone-"));
  try {
    const input = path.join(root, "input.png");
    const output = path.join(root, "output");
    const config = path.join(root, "slideclone.config.json");
    fs.writeFileSync(input, "not a real image");
    fs.writeFileSync(config, "{}");
    assert.throws(() => createEditableJob({ workspaceRoot: root, stateRoot: path.join(root, "state"), ownerId: "test-user", input, output, config }), /slideclone config is invalid/);
    assert.equal(fs.existsSync(path.join(root, "state")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("image-to-editable rejects a missing provider config before it creates a queued Job", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-editable-config-required-"));
  try {
    const input = path.join(root, "input.png");
    fs.writeFileSync(input, "not a real image");
    assert.throws(() => createEditableJob({ workspaceRoot: root, stateRoot: path.join(root, "state"), ownerId: "test-user", input, output: path.join(root, "output") }), /requires a slideclone config/);
    assert.equal(fs.existsSync(path.join(root, "state")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("image-to-editable rejects a malformed image before it creates a queued Job", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-editable-image-invalid-"));
  try {
    const input = path.join(root, "input.png");
    const output = path.join(root, "output");
    const config = path.join(root, "slideclone.config.json");
    fs.writeFileSync(input, "not a real image");
    fs.writeFileSync(config, JSON.stringify({ inputDir: root, outputDir: output, adapters: { ocr: "scripts/adapters/ocr-placeholder.js", vision: "scripts/adapters/vision-placeholder.js", pptx: "scripts/adapters/pptx-openxml-dotnet.js", render: "scripts/adapters/render-placeholder.js", diff: "scripts/adapters/diff-placeholder.js" } }), "utf8");
    assert.throws(() => createEditableJob({ workspaceRoot: root, stateRoot: path.join(root, "state"), ownerId: "test-user", input, output, config }), /bounded PNG or JPEG image/);
    assert.equal(fs.existsSync(path.join(root, "state")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("image-to-editable rejects an oversized decoded image before it creates a queued Job", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-editable-image-pixels-"));
  try {
    const input = path.join(root, "input.png");
    const output = path.join(root, "output");
    const config = path.join(root, "slideclone.config.json");
    const image = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(image);
    image.writeUInt32BE(16_384, 16);
    image.writeUInt32BE(16_384, 20);
    fs.writeFileSync(input, image);
    fs.writeFileSync(config, JSON.stringify({ inputDir: root, outputDir: output, adapters: { ocr: "scripts/adapters/ocr-placeholder.js", vision: "scripts/adapters/vision-placeholder.js", pptx: "scripts/adapters/pptx-openxml-dotnet.js", render: "scripts/adapters/render-placeholder.js", diff: "scripts/adapters/diff-placeholder.js" } }), "utf8");
    assert.throws(() => createEditableJob({ workspaceRoot: root, stateRoot: path.join(root, "state"), ownerId: "test-user", input, output, config }), /dimensions exceed the processing boundary/);
    assert.equal(fs.existsSync(path.join(root, "state")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("image-to-editable rejects an incomplete image container before it creates a queued Job", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-editable-image-incomplete-"));
  try {
    const input = path.join(root, "input.png");
    const output = path.join(root, "output");
    const config = path.join(root, "slideclone.config.json");
    const image = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(image);
    image.writeUInt32BE(640, 16);
    image.writeUInt32BE(480, 20);
    fs.writeFileSync(input, image);
    fs.writeFileSync(config, JSON.stringify({ inputDir: root, outputDir: output, adapters: { ocr: "scripts/adapters/ocr-placeholder.js", vision: "scripts/adapters/vision-placeholder.js", pptx: "scripts/adapters/pptx-openxml-dotnet.js", render: "scripts/adapters/render-placeholder.js", diff: "scripts/adapters/diff-placeholder.js" } }), "utf8");
    assert.throws(() => createEditableJob({ workspaceRoot: root, stateRoot: path.join(root, "state"), ownerId: "test-user", input, output, config }), /input image is invalid/);
    assert.equal(fs.existsSync(path.join(root, "state")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("image-to-editable accepts a complete bounded JPEG container", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-editable-image-jpeg-"));
  try {
    const input = path.join(root, "input.jpg");
    const output = path.join(root, "output");
    const config = path.join(root, "slideclone.config.json");
    const image = Buffer.from([
      0xFF, 0xD8,
      0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
      0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00,
      0x00, 0xFF, 0xD9
    ]);
    fs.writeFileSync(input, image);
    fs.writeFileSync(config, JSON.stringify({ inputDir: root, outputDir: output, adapters: { ocr: "scripts/adapters/ocr-placeholder.js", vision: "scripts/adapters/vision-placeholder.js", pptx: "scripts/adapters/pptx-openxml-dotnet.js", render: "scripts/adapters/render-placeholder.js", diff: "scripts/adapters/diff-placeholder.js" } }), "utf8");
    const job = createEditableJob({ workspaceRoot: root, stateRoot: path.join(root, "state"), ownerId: "test-user", input, output, config });
    assert.equal(job.status, "queued");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("image-to-editable binds provider config paths to the requested workspace input and output", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-editable-config-paths-"));
  try {
    const inputDir = path.join(root, "input");
    const output = path.join(root, "output");
    const input = path.join(inputDir, "page.png");
    const config = path.join(root, "slideclone.config.json");
    fs.mkdirSync(inputDir);
    fs.writeFileSync(input, "not a real image");
    fs.writeFileSync(config, JSON.stringify({ inputDir: "../outside", outputDir: "output", adapters: { ocr: "scripts/adapters/ocr-placeholder.js", vision: "scripts/adapters/vision-placeholder.js", pptx: "scripts/adapters/pptx-openxml-dotnet.js", render: "scripts/adapters/render-placeholder.js", diff: "scripts/adapters/diff-placeholder.js" } }), "utf8");
    assert.throws(() => createEditableJob({ workspaceRoot: root, stateRoot: path.join(root, "state"), ownerId: "test-user", input, output, config }), /paths must stay inside/);
    fs.writeFileSync(config, JSON.stringify({ inputDir, outputDir: path.join(root, "different-output"), adapters: { ocr: "scripts/adapters/ocr-placeholder.js", vision: "scripts/adapters/vision-placeholder.js", pptx: "scripts/adapters/pptx-openxml-dotnet.js", render: "scripts/adapters/render-placeholder.js", diff: "scripts/adapters/diff-placeholder.js" } }), "utf8");
    assert.throws(() => createEditableJob({ workspaceRoot: root, stateRoot: path.join(root, "state"), ownerId: "test-user", input, output, config }), /must match/);
    assert.equal(fs.existsSync(path.join(root, "state")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("slideclone jobs produce a verifiable OpenXML PPTX artifact", { timeout: 120000 }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-openxml-"));
  try {
    const inputDir = path.join(root, "input");
    const output = path.join(root, "output");
    fs.mkdirSync(inputDir);
    fs.copyFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"), path.join(inputDir, "page.png"));
    const config = path.join(root, "slideclone.config.json");
    fs.writeFileSync(config, `${JSON.stringify({
      inputDir,
      outputDir: output,
      pagePattern: "*.png",
      slide: { widthPt: 960, heightPt: 540 },
      adapters: {
        normalize: "scripts/adapters/normalize-placeholder.js",
        ocr: "scripts/adapters/ocr-placeholder.js",
        vision: "scripts/adapters/vision-placeholder.js",
        pptx: "scripts/adapters/pptx-openxml-dotnet.js",
        render: "scripts/adapters/render-placeholder.js",
        diff: "scripts/adapters/diff-placeholder.js",
        compare: "scripts/adapters/compare-placeholder.js",
        polish: "scripts/adapters/polish-placeholder.js",
        compress: "scripts/adapters/compress-placeholder.js"
      },
      thresholds: { pixelDiffRatio: 0.08, layoutMeanIoU: 0.86, textCoverage: 0.95, maxCriticalOffsetPt: 8, maxOutOfBoundsPt: 1, maxImageAspectRatioDelta: 0.03, maxRasterImageAreaRatio: 0.25 },
      openXmlBuilder: { configuration: "Release", targetFramework: "net8.0-windows", powerPointSafe: false },
      postprocess: { compare: false, polish: false, compress: false }
    }, null, 2)}\n`);
    const input = path.join(inputDir, "page.png");
    const job = createEditableJob({ workspaceRoot: root, stateRoot: path.join(root, "state"), ownerId: "test-user", input, output, config });
    assert.throws(
      () => runEditableJob({ stateRoot: path.join(root, "state"), ownerId: "test-user", id: job.id }),
      /execution adapter is required/,
    );
    assert.equal(getJob({ stateRoot: path.join(root, "state"), ownerId: "test-user", id: job.id }).status, "queued");
    const completed = runEditableJob({
      stateRoot: path.join(root, "state"),
      ownerId: "test-user",
      id: job.id,
      executeSlideclone: createBundledSlidecloneRunner({ repositoryRoot: path.resolve(__dirname, "..") })
    });
    assert.equal(completed.status, "succeeded", completed.error?.message);
    const deck = completed.artifacts.find((artifact) => artifact.name === path.join("pptx", "deck.pptx"));
    assert.ok(deck);
    assert.equal(deck.mediaType, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    assert.match(deck.sha256, /^[a-f0-9]{64}$/);
    assert.ok(fs.statSync(deck.uri).size > 0);
    assert.deepEqual(completed.quality, { passed: true, checks: [{ name: "slideclone-completed", passed: true }, { name: "pptx-artifact-present", passed: true }], metrics: { artifacts: completed.artifacts.length, "pptx-artifacts": 1 } });
    const delivery = completed.artifacts.find((artifact) => artifact.name === VISUAL_REPORT_NAME);
    assert.ok(delivery, "delivery summary must be retained as a hash-verified Job artifact");
    assert.match(delivery.sha256, /^[a-f0-9]{64}$/);
    const deliverySummary = JSON.parse(fs.readFileSync(delivery.uri, "utf8"));
    assert.equal(deliverySummary.status, "failed");
    assert.equal(deliverySummary.delivery.verified, false);
    assert.equal(deliverySummary.configFile, undefined);
    assert.equal(deliverySummary.inputDir, undefined);
    assert.equal(deliverySummary.outputDir, undefined);
    assert.equal(Object.values(deliverySummary.artifacts).flat().filter((value) => typeof value === "string").some(path.isAbsolute), false);
    assert.equal(editableVisualSummary(completed, root)?.pages.count, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("local editable quality fails closed when a successful runner produces no PPTX", () => {
  assert.deepEqual(editableQuality([]), { passed: false, checks: [{ name: "slideclone-completed", passed: true }, { name: "pptx-artifact-present", passed: false }], metrics: { artifacts: 0, "pptx-artifacts": 0 } });
});

test("artifact collection retains delivery evidence and PPTX when diff JSONs exceed the Job limit", () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-artifact-priority-"));
  try {
    fs.mkdirSync(path.join(output, "diff"), { recursive: true });
    fs.mkdirSync(path.join(output, "reports"), { recursive: true });
    fs.mkdirSync(path.join(output, "pptx"), { recursive: true });
    for (let index = 0; index < 40; index += 1) fs.writeFileSync(path.join(output, "diff", `page-${index}.json`), "{}", "utf8");
    fs.writeFileSync(path.join(output, VISUAL_REPORT_NAME), "{}", "utf8");
    fs.writeFileSync(path.join(output, "pptx", "deck.pptx"), "PPTX", "utf8");
    const artifacts = collectArtifacts(output);
    assert.equal(artifacts.length, 32);
    assert.deepEqual(artifacts.slice(0, 2).map((artifact) => artifact.name), [VISUAL_REPORT_NAME, path.join("pptx", "deck.pptx")]);
    assert.ok(artifacts.every((artifact) => /^[a-f0-9]{64}$/.test(artifact.sha256)));
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
});

test("artifact collection rejects a symbolic-link output root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-artifact-link-"));
  try {
    const target = path.join(root, "target");
    const outputLink = path.join(root, "output-link");
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, "deck.pptx"), "PPTX", "utf8");
    fs.symlinkSync(target, outputLink, "junction");
    assert.deepEqual(collectArtifacts(outputLink), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("editable visual summaries expose only verified, bounded delivery metrics", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-visual-summary-"));
  try {
    const output = path.join(workspace, "output");
    const report = path.join(output, VISUAL_REPORT_NAME);
    const diff = path.join(output, "diff", "pixel-diff.iteration-0.json");
    fs.mkdirSync(path.dirname(report), { recursive: true });
    fs.mkdirSync(path.dirname(diff), { recursive: true });
    fs.writeFileSync(diff, JSON.stringify({
      metrics: [
        { pageIndex: 0, ok: true, pixelDiffRatio: 0.04, foregroundMissingRatio: 0.06, meanAbsoluteDelta: 4.5, sourceImage: "must-not-be-exposed.png" },
        { pageIndex: 1, ok: false, error: "must-not-be-exposed" }
      ]
    }), "utf8");
    fs.writeFileSync(report, JSON.stringify({
      pages: { count: 2, imageOnlyCount: 1 },
      artifacts: { diffReport: diff },
      metrics: {
        pixelDiffRatio: 0.08,
        foregroundMissingRatio: 0.12,
        layoutMeanIoU: 0.94,
        textCoverage: 0.98,
        rasterImageAreaRatio: 0.3,
        editableObjects: 18,
        nonEditableObjects: 2,
        privateMetric: "must-not-be-exposed"
      },
      warnings: ["source text must not be exposed", "another internal warning"],
      rawSourcePath: "C:/secret/source.pptx"
    }), "utf8");
    const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    const artifact = { name: VISUAL_REPORT_NAME, mediaType: "application/json", uri: report, sha256: digest(report) };
    const diffArtifact = { name: path.join("diff", "pixel-diff.iteration-0.json"), mediaType: "application/json", uri: diff, sha256: digest(diff) };
    const job = { capability: "image-to-editable", status: "succeeded", output: { path: output }, artifacts: [artifact, diffArtifact] };
    assert.deepEqual(editableVisualSummary(job, workspace), {
      pages: { count: 2, imageOnlyCount: 1 },
      metrics: { pixelDiffRatio: 0.08, foregroundMissingRatio: 0.12, layoutMeanIoU: 0.94, textCoverage: 0.98, rasterImageAreaRatio: 0.3, editableObjects: 18, nonEditableObjects: 2 },
      perPage: [{ page: 1, compared: true, pixelDiffRatio: 0.04, foregroundMissingRatio: 0.06, meanAbsoluteDelta: 4.5 }, { page: 2, compared: false }],
      warnings: 2
    });
    fs.writeFileSync(diff, "{}", "utf8");
    assert.equal(Object.hasOwn(editableVisualSummary(job, workspace), "perPage"), false);
    fs.writeFileSync(report, "{}", "utf8");
    assert.equal(editableVisualSummary(job, workspace), null);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
