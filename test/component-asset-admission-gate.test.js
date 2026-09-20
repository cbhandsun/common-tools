"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  assessCandidate,
  buildComponentAssetAdmissionGate,
  collectCandidates,
  inferFamilies,
  parseArgs
} = require("../packages/slideclone-native-engine/scripts/component-asset-admission-gate");

function createFixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "component-asset-admission-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const asset = path.join(dir, "process-component.pptx");
  const replay = path.join(dir, "process-component-replay.pptx");
  const fidelity = path.join(dir, "component-self-fidelity.report.json");
  fs.writeFileSync(asset, "editable process component");
  fs.writeFileSync(replay, "replay pptx");
  fs.writeFileSync(fidelity, "{}");
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(asset)).digest("hex");
  return { dir, asset, replay, fidelity, sha256 };
}

function validCandidate(fixture, overrides = {}) {
  return {
    file: fixture.asset,
    sha256: fixture.sha256,
    passed: true,
    provider: "islide",
    group: {
      id: "process-chain-01",
      name: "Process chain",
      structure: {
        kind: "process-chain",
        motifs: ["linear-arrow-chain"]
      }
    },
    nativeObjects: { shapes: 3, textBoxes: 2, images: 0 },
    comparison: { ok: true, pixelDiffRatio: 0.03, foregroundMissingRatio: 0.02, meanAbsoluteDelta: 4 },
    regionSummary: { regions: 2, passed: 2, maxPixelDiffRatio: 0.04, maxForegroundMissingRatio: 0.03, maxMeanAbsoluteDelta: 6 },
    reportFile: fixture.fidelity,
    replayPptx: fixture.replay,
    ...overrides
  };
}

function writeBatchReport(file, candidate) {
  const report = {
    provider: "component-asset-self-fidelity-batch-v1",
    summary: { promoted: 1, rejected: 0 },
    promotedAssets: [{
      file: candidate.file,
      sha256: candidate.sha256,
      provider: candidate.provider,
      group: candidate.group,
      reportFile: candidate.reportFile,
      replayPptx: candidate.replayPptx
    }],
    results: [candidate],
    skipped: []
  };
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

test("component asset admission gate admits hash-bound native component assets", (t) => {
  const fixture = createFixture(t);
  const candidate = validCandidate(fixture);
  const reportFile = path.join(fixture.dir, "self-fidelity-batch.json");
  const out = path.join(fixture.dir, "admission.json");
  writeBatchReport(reportFile, candidate);

  const report = buildComponentAssetAdmissionGate({
    selfFidelityReport: reportFile,
    out,
    minAdmitted: 1,
    minComponentFamilyTypes: 1,
    requiredComponentFamilies: ["process-flow"]
  });

  assert.equal(report.provider, "component-asset-admission-gate-v1");
  assert.equal(report.passed, true);
  assert.equal(report.summary.admitted, 1);
  assert.equal(report.summary.rejected, 0);
  assert.deepEqual(report.summary.componentFamilyCounts, { "process-flow": 1 });
  assert.deepEqual(report.gateReasons, []);
  assert.equal(report.admittedAssets[0].sha256, fixture.sha256);
});

test("component asset admission gate rejects missing replay and report evidence", (t) => {
  const fixture = createFixture(t);
  const candidate = validCandidate(fixture, {
    reportFile: path.join(fixture.dir, "missing-report.json"),
    replayPptx: path.join(fixture.dir, "missing-replay.pptx")
  });

  const assessment = assessCandidate(candidate);

  assert.equal(assessment.admitted, false);
  assert.ok(assessment.reasons.includes("missing-self-fidelity-report"));
  assert.ok(assessment.reasons.includes("missing-replay-pptx"));
});

test("component asset admission gate rejects hash mismatches", (t) => {
  const fixture = createFixture(t);
  const assessment = assessCandidate(validCandidate(fixture, {
    sha256: "0".repeat(64)
  }));

  assert.equal(assessment.admitted, false);
  assert.ok(assessment.reasons.includes("asset-sha256-mismatch"));
});

test("component asset admission gate rejects unknown family evidence", (t) => {
  const fixture = createFixture(t);
  const assessment = assessCandidate(validCandidate(fixture, {
    group: {
      id: "decorative",
      name: "Decorative group",
      structure: { kind: "ornament", motifs: ["not-a-known-motif"] }
    }
  }));

  assert.equal(assessment.admitted, false);
  assert.ok(assessment.reasons.includes("missing-known-component-family"));
});

test("component asset admission gate rejects bitmap-only native evidence", (t) => {
  const fixture = createFixture(t);
  const assessment = assessCandidate(validCandidate(fixture, {
    nativeObjects: { shapes: 0, textBoxes: 0, images: 4 }
  }));

  assert.equal(assessment.admitted, false);
  assert.ok(assessment.reasons.includes("missing-native-editable-object-evidence"));
});

test("component asset admission gate fails thresholds and fail-on-reject when candidates are rejected", (t) => {
  const fixture = createFixture(t);
  const candidate = validCandidate(fixture, {
    nativeObjects: { shapes: 0, textBoxes: 0, images: 1 }
  });
  const reportFile = path.join(fixture.dir, "self-fidelity-batch.json");
  writeBatchReport(reportFile, candidate);

  const report = buildComponentAssetAdmissionGate({
    selfFidelityReport: reportFile,
    out: path.join(fixture.dir, "admission.json"),
    minAdmitted: 1,
    minComponentFamilyTypes: 1,
    requiredComponentFamilies: ["process-flow"],
    failOnReject: true
  });

  assert.equal(report.passed, false);
  assert.equal(report.summary.admitted, 0);
  assert.equal(report.summary.rejected, 1);
  assert.ok(report.gateReasons.includes("min-admitted-not-met"));
  assert.ok(report.gateReasons.includes("min-component-family-types-not-met"));
  assert.ok(report.gateReasons.includes("required-component-families-missing"));
  assert.ok(report.gateReasons.includes("candidate-assets-rejected"));
});

test("component asset admission gate collects passed results when promotedAssets is absent", (t) => {
  const fixture = createFixture(t);
  const candidate = validCandidate(fixture);
  const candidates = collectCandidates({
    provider: "component-asset-self-fidelity-batch-v1",
    results: [candidate, { ...candidate, file: path.join(fixture.dir, "other.pptx"), passed: false }]
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].file, fixture.asset);
});

test("component asset admission gate infers families from motifs and text", () => {
  assert.deepEqual(inferFamilies({
    name: "Timeline roadmap",
    structure: { kind: "milestone-plan", motifs: ["linear-arrow-chain"] }
  }), ["process-flow", "timeline-roadmap"]);
});

test("component asset admission gate parses CLI arguments", () => {
  const args = parseArgs([
    "--self-fidelity-report", "runs/self/report.json",
    "--out", "runs/admission.json",
    "--min-admitted", "3",
    "--min-component-family-types", "2",
    "--required-component-families", "process-flow,timeline-roadmap",
    "--fail-on-reject"
  ]);

  assert.deepEqual(args, {
    selfFidelityReport: "runs/self/report.json",
    out: "runs/admission.json",
    minAdmitted: 3,
    minComponentFamilyTypes: 2,
    requiredComponentFamilies: ["process-flow", "timeline-roadmap"],
    failOnReject: true
  });
});

test("component asset admission gate rejects unknown required families", () => {
  assert.throws(
    () => parseArgs(["--required-component-families", "process-flow,unknown-family"]),
    /Unknown component families: unknown-family/u
  );
});
