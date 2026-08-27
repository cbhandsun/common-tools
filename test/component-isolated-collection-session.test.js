"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCollectionFixtureIr,
  buildCollectionGuide,
  groupMetrics,
  initializeCollectionSession,
  isPathInside,
  materializeVerifiedComponents,
  parseArgs,
  runCollectionSession,
  sessionPaths,
  verifyNativeComponent,
  _private
} = require("../skills/pd-hifi-slideclone/scripts/component-isolated-collection-session");

test("isolated collection parses bounded init and ingest arguments", () => {
  const args = parseArgs([
    "node",
    "component-isolated-collection-session.js",
    "--init",
    "--ingest",
    "runs/isolated/fixture/collection-fixture.pptx",
    "--provider",
    "officeplus",
    "--label",
    "cycle loop / 4 items",
    "--out",
    "runs/isolated",
    "--verify-fidelity"
  ]);

  assert.equal(args.init, true);
  assert.equal(args.provider, "officeplus");
  assert.equal(args.label, "cycle-loop-4-items");
  assert.equal(args.verifyFidelity, true);
  assert.throws(() => parseArgs(["node", "script.js"]), /Specify --init, --ingest/);
});

test("isolated collection accepts a scoped self-fidelity promotion report", () => {
  const args = parseArgs([
    "node",
    "component-isolated-collection-session.js",
    "--promote-fidelity-report",
    "runs/isolated/self-fidelity/report.json",
    "--provider",
    "islide"
  ]);

  assert.equal(args.promoteFidelityReport, "runs/isolated/self-fidelity/report.json");
  assert.equal(args.provider, "islide");
});

test("isolated collection skips self-fidelity when native structure verification rejects every component", () => {
  assert.equal(_private.shouldRunSelfFidelity(true, []), false);
  assert.equal(_private.shouldRunSelfFidelity("true", [{ status: "verified" }]), true);
  assert.equal(_private.shouldRunSelfFidelity(false, [{ status: "verified" }]), false);
});

test("isolated collection fixture is blank and gives a safe save-in-place guide", () => {
  const ir = buildCollectionFixtureIr();
  const guide = buildCollectionGuide({
    provider: "islide",
    fixturePptx: "C:/work/fixture/collection-fixture.pptx",
    outDir: "C:/work"
  });

  assert.equal(ir.pages.length, 1);
  assert.deepEqual(ir.pages[0].shapes, []);
  assert.deepEqual(ir.pages[0].textBoxes, []);
  assert.match(guide, /disposable/);
  assert.match(guide, /save the fixture in place/i);
  assert.match(guide, /component-asset-self-fidelity-batch/);
});

test("isolated collection only treats shape-rich reusable groups as native", () => {
  const verified = verifyNativeComponent({
    path: "C:/tmp/component.pptx",
    name: "component.pptx",
    sha256: "a".repeat(64),
    learningSummary: {
      status: "ok",
      componentCatalog: [{
        id: "slide1-group1",
        shapeCount: 5,
        connectorCount: 1,
        pictureCount: 1,
        textRuns: 2,
        reuseReadiness: { level: "high" },
        structure: { kind: "cycle-loop", motifs: ["arc-arrow"] }
      }]
    }
  });
  const rejected = verifyNativeComponent({
    learningSummary: {
      status: "ok",
      componentCatalog: [{
        id: "slide1-group1",
        shapeCount: 1,
        connectorCount: 0,
        pictureCount: 8,
        textRuns: 0,
        reuseReadiness: { level: "high" }
      }]
    }
  });

  assert.equal(verified.status, "verified");
  assert.equal(verified.nativeObjectCount, 8);
  assert.equal(verified.pictureRatio, 0.1111);
  assert.equal(rejected.status, "rejected");
  assert.ok(rejected.reasons.includes("no-editable-native-group"));
  assert.deepEqual(groupMetrics({ shapeCount: 2, pictureCount: 2, textRuns: 1 }), {
    nativeObjectCount: 3,
    pictureCount: 2,
    pictureRatio: 0.4
  });
});

test("isolated collection rejects incomplete downloads before OpenXML harvesting", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "isolated-collection-preflight-"));
  const invalidFixture = path.join(tmp, "failed-download.pptx");
  const zipFixture = path.join(tmp, "zip-backed.pptx");
  fs.writeFileSync(invalidFixture, "download failed");
  fs.writeFileSync(zipFixture, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]));

  assert.deepEqual(_private.inspectPptxFixture(invalidFixture), {
    valid: false,
    sizeBytes: 15,
    reasons: ["invalid-pptx-zip-signature"]
  });
  assert.deepEqual(_private.inspectPptxFixture(zipFixture), {
    valid: true,
    sizeBytes: 6,
    reasons: []
  });
});

test("isolated collection records an invalid fixture without creating a staging harvest", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "isolated-collection-invalid-fixture-"));
  const paths = sessionPaths(tmp, "islide");
  fs.mkdirSync(paths.fixtureDir, { recursive: true });
  const invalidFixture = path.join(paths.fixtureDir, "failed-download.pptx");
  fs.writeFileSync(invalidFixture, "not a zip");

  const result = await runCollectionSession({
    out: tmp,
    provider: "islide",
    ingest: invalidFixture,
    label: "failed-download"
  });

  assert.equal(result.ingested.acceptedCount, 0);
  assert.equal(result.ingested.rejectedCount, 1);
  assert.deepEqual(result.ingested.rejected[0].reasons, ["invalid-pptx-zip-signature"]);
  assert.equal(fs.existsSync(paths.stagingDir), false);
  const history = fs.readFileSync(paths.ingestHistory, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.deepEqual(history, [{
    provider: "islide",
    createdAt: history[0].createdAt,
    fixture: invalidFixture,
    label: "failed-download",
    acceptedCount: 0,
    rejectedCount: 1,
    rejectionReasons: ["invalid-pptx-zip-signature"]
  }]);
});

test("isolated collection creates only a session-owned fixture and never accepts a sibling path", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "isolated-collection-"));
  const paths = sessionPaths(tmp, "islide");
  const initialized = await initializeCollectionSession({
    outDir: tmp,
    provider: "islide",
    paths,
    buildFixture: async ({ outFile }) => fs.writeFileSync(outFile, "fixture")
  });

  assert.equal(initialized.status, "ready");
  assert.equal(fs.existsSync(paths.fixtureIr), true);
  assert.equal(isPathInside(paths.fixturePptx, paths.fixtureDir), true);
  assert.equal(isPathInside(path.join(tmp, "fixture-copy", "collection-fixture.pptx"), paths.fixtureDir), false);
  const result = await runCollectionSession({ out: tmp, provider: "islide", init: false });
  assert.equal(result.initialized, null);
});

test("isolated collection promotes only assets that pass self-fidelity", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "isolated-collection-promotion-"));
  const asset = path.join(tmp, "component.pptx");
  const manifestFile = path.join(tmp, "manifest.json");
  fs.writeFileSync(asset, "fixture");
  const promoted = _private.promoteFidelityVerifiedComponents({
    manifest: { components: [{ path: asset, roleTags: ["isolated-collection"] }] },
    report: { results: [{ file: asset, passed: true, reportFile: "report.json", replayPptx: "replay.pptx" }] },
    manifestFile
  });

  assert.equal(promoted.components[0].selfFidelityPromoted, true);
  assert.ok(promoted.components[0].roleTags.includes("self-fidelity-promoted"));
  assert.equal(promoted.components[0].selfFidelity.passed, true);
  assert.equal(fs.existsSync(manifestFile), true);
});

test("isolated collection promotion report only upgrades assets inside the provider registry", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "isolated-collection-report-promotion-"));
  const paths = sessionPaths(tmp, "islide");
  fs.mkdirSync(paths.verifiedProviderDir, { recursive: true });
  const asset = path.join(paths.verifiedProviderDir, "component.pptx");
  const outsideAsset = path.join(tmp, "outside.pptx");
  const reportFile = path.join(tmp, "self-fidelity.json");
  fs.writeFileSync(asset, "component");
  fs.writeFileSync(outsideAsset, "outside");
  fs.writeFileSync(path.join(paths.verifiedProviderDir, "manifest.json"), JSON.stringify({
    components: [{ path: asset, roleTags: [] }]
  }));
  fs.writeFileSync(reportFile, JSON.stringify({ results: [
    { file: asset, passed: true, reportFile: "ok.json", replayPptx: "replay.pptx" },
    { file: outsideAsset, passed: true }
  ] }));

  const result = await runCollectionSession({
    out: tmp,
    provider: "islide",
    promoteFidelityReport: reportFile
  });
  const manifest = JSON.parse(fs.readFileSync(path.join(paths.verifiedProviderDir, "manifest.json"), "utf8"));

  assert.equal(result.promoted.promoted, 1);
  assert.equal(result.promoted.ignored, 1);
  assert.equal(manifest.components[0].selfFidelityPromoted, true);
  assert.ok(manifest.components[0].roleTags.includes("self-fidelity-promoted"));
});

test("isolated collection appends assets and preserves prior fidelity promotion", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "isolated-collection-append-"));
  const firstSource = path.join(tmp, "first-source.pptx");
  const secondSource = path.join(tmp, "second-source.pptx");
  fs.writeFileSync(firstSource, "first");
  fs.writeFileSync(secondSource, "second");

  const first = materializeVerifiedComponents({
    outDir: path.join(tmp, "verified"),
    provider: "islide",
    label: "first",
    accepted: [{
      groupId: "group-1",
      nativeObjectCount: 4,
      pictureRatio: 0,
      component: { path: firstSource, name: "first.pptx", sha256: "a".repeat(64), roleTags: [] }
    }]
  });
  const promoted = _private.promoteFidelityVerifiedComponents({
    manifest: first,
    report: { results: [{ file: first.components[0].path, passed: true }] }
  });
  fs.writeFileSync(path.join(tmp, "verified", "manifest.json"), `${JSON.stringify(promoted)}\n`);

  const second = materializeVerifiedComponents({
    outDir: path.join(tmp, "verified"),
    provider: "islide",
    label: "second",
    accepted: [{
      groupId: "group-2",
      nativeObjectCount: 5,
      pictureRatio: 0,
      component: { path: secondSource, name: "second.pptx", sha256: "b".repeat(64), roleTags: [] }
    }]
  });

  assert.equal(second.componentCount, 2);
  assert.equal(second.copiedCount, 1);
  assert.equal(second.components.find((component) => component.sha256 === "a".repeat(64)).selfFidelityPromoted, true);
});
