"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildImageToEditableComponentRecallCorpusPlan,
  parseArgs,
  validateCorpusManifest
} = require("../packages/slideclone-native-engine/scripts/image-to-editable-component-recall-corpus");

test("image-to-editable recall corpus manifest covers required component families and acceptance profiles", () => {
  const manifestFile = path.join(process.cwd(), "skills/pd-hifi-slideclone/examples/image-to-editable-component-recall-corpus.manifest.json");
  const plan = buildImageToEditableComponentRecallCorpusPlan({ manifest: manifestFile });

  assert.equal(plan.provider, "image-to-editable-component-recall-corpus-v1");
  assert.equal(plan.summary.caseCount, 6);
  assert.equal(plan.summary.requiredComponentFamilyTypes, 11);
  assert.equal(plan.summary.coveredComponentFamilyTypes, 11);
  assert.deepEqual(plan.summary.missingRequiredComponentFamilies, []);
  assert.deepEqual(plan.summary.acceptanceProfiles, {
    recallReport: "image-to-editable-component-recall-report",
    coverageGate: "image-to-editable-component-recall-gate"
  });
  assert.ok(plan.cases.every((entry) => entry.acceptance.requiredEvidence.includes("source.componentAnalysis")));
  assert.ok(plan.cases.every((entry) => entry.artifacts.outputIr.endsWith("/ir/deck.json")));
});

test("image-to-editable recall corpus rejects duplicate case ids", () => {
  const manifest = manifestWithCases([
    corpusCase("same", ["process-flow"]),
    corpusCase("same", ["matrix-table"])
  ], ["process-flow"]);

  assert.throws(() => validateCorpusManifest(manifest), /Duplicate image-to-editable recall corpus case id/u);
});

test("image-to-editable recall corpus rejects unknown component families", () => {
  const manifest = manifestWithCases([corpusCase("case-a", ["not-a-family"])], ["not-a-family"]);

  assert.throws(() => validateCorpusManifest(manifest), /unknown component families/u);
});

test("image-to-editable recall corpus requires every required family to be covered by a case", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "image-recall-corpus-missing-family-"));
  const manifestFile = path.join(tmp, "manifest.json");
  writeJson(manifestFile, manifestWithCases([corpusCase("case-a", ["process-flow"])], ["process-flow", "matrix-table"]));

  assert.throws(
    () => buildImageToEditableComponentRecallCorpusPlan({ manifest: manifestFile }),
    /missing required component families: matrix-table/u
  );
});

test("image-to-editable recall corpus rejects unsafe paths and mismatched acceptance profiles", () => {
  assert.throws(
    () => validateCorpusManifest(manifestWithCases([corpusCase("case-a", ["process-flow"], { source: { path: "../private.png" } })], ["process-flow"])),
    /safe relative path/u
  );
  assert.throws(
    () => validateCorpusManifest(manifestWithCases([corpusCase("case-a", ["process-flow"], { acceptance: { recallReportProfile: "other-profile" } })], ["process-flow"])),
    /acceptance profiles must match/u
  );
});

test("image-to-editable recall corpus can require existing artifacts for acceptance runs", (t) => {
  const tmpRoot = path.join(process.cwd(), "runs", "test-image-recall-corpus");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(tmpRoot, "artifacts-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const manifestFile = path.join(tmp, "manifest.json");
  const caseRoot = path.join(tmp, "case-a");
  fs.mkdirSync(path.join(caseRoot, "ir"), { recursive: true });
  writeJson(path.join(caseRoot, "ir", "deck.json"), deckWithComponentAnalysis(["process-flow"]));
  fs.writeFileSync(path.join(caseRoot, "deck.pptx"), "pptx", "utf8");
  writeJson(path.join(caseRoot, "deck.component-candidates.json"), { layers: [] });
  writeJson(manifestFile, manifestWithCases([corpusCase("case-a", ["process-flow"], {
    artifacts: {
      inputWorkDir: repoRelative(caseRoot),
      outputIr: repoRelative(path.join(caseRoot, "ir", "deck.json")),
      outputPptx: repoRelative(path.join(caseRoot, "deck.pptx")),
      componentCandidateReport: repoRelative(path.join(caseRoot, "deck.component-candidates.json"))
    }
  })], ["process-flow"]));

  const plan = buildImageToEditableComponentRecallCorpusPlan({ manifest: manifestFile, requireArtifacts: true });

  assert.equal(plan.summary.caseCount, 1);
  assert.match(plan.cases[0].artifacts.outputPptx, /case-a\/deck\.pptx/u);
  assert.deepEqual(plan.cases[0].observedComponentFamilies, ["process-flow"]);
  fs.rmSync(path.join(caseRoot, "deck.pptx"));
  assert.throws(
    () => buildImageToEditableComponentRecallCorpusPlan({ manifest: manifestFile, requireArtifacts: true }),
    /outputPptx is missing/u
  );
});

test("image-to-editable recall corpus compares acceptance IR evidence with expected families", (t) => {
  const tmpRoot = path.join(process.cwd(), "runs", "test-image-recall-corpus");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(tmpRoot, "evidence-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const manifestFile = path.join(tmp, "manifest.json");
  const caseRoot = path.join(tmp, "case-a");
  fs.mkdirSync(path.join(caseRoot, "ir"), { recursive: true });
  writeJson(path.join(caseRoot, "ir", "deck.json"), deckWithComponentAnalysis(["matrix-table"]));
  fs.writeFileSync(path.join(caseRoot, "deck.pptx"), "pptx", "utf8");
  writeJson(path.join(caseRoot, "deck.component-candidates.json"), { layers: [] });
  writeJson(manifestFile, manifestWithCases([corpusCase("case-a", ["process-flow"], {
    artifacts: {
      inputWorkDir: repoRelative(caseRoot),
      outputIr: repoRelative(path.join(caseRoot, "ir", "deck.json")),
      outputPptx: repoRelative(path.join(caseRoot, "deck.pptx")),
      componentCandidateReport: repoRelative(path.join(caseRoot, "deck.component-candidates.json"))
    }
  })], ["process-flow"]));

  assert.throws(
    () => buildImageToEditableComponentRecallCorpusPlan({ manifest: manifestFile, requireArtifacts: true }),
    /outputIr is missing expected component families: process-flow/u
  );
});

test("image-to-editable recall corpus parses CLI arguments", () => {
  const args = parseArgs(["node", "script", "--manifest", "manifest.json", "--out", "out.json", "--require-artifacts"]);

  assert.deepEqual(args, {
    manifest: "manifest.json",
    out: "out.json",
    requireArtifacts: true
  });
});

function manifestWithCases(cases, requiredComponentFamilies) {
  return {
    version: "1.0",
    id: "test-image-recall-corpus",
    description: "Test manifest",
    requiredComponentFamilies,
    acceptanceProfiles: {
      recallReport: "image-to-editable-component-recall-report",
      coverageGate: "image-to-editable-component-recall-gate"
    },
    cases
  };
}

function corpusCase(id, expectedComponentFamilies, overrides = {}) {
  return {
    id,
    title: id,
    source: {
      kind: "image",
      path: `sources/${id}.png`,
      provenance: "unit test",
      ...(overrides.source || {})
    },
    expectedComponentFamilies,
    artifacts: {
      inputWorkDir: id,
      outputIr: `${id}/ir/deck.json`,
      outputPptx: `${id}/deck.pptx`,
      componentCandidateReport: `${id}/deck.component-candidates.json`,
      ...(overrides.artifacts || {})
    },
    acceptance: overrides.acceptance
  };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function repoRelative(file) {
  return path.relative(process.cwd(), file).replace(/\\/gu, "/");
}

function deckWithComponentAnalysis(families) {
  return {
    pages: [{
      source: {
        componentAnalysis: {
          provider: "team-component-analysis-v1",
          detectedComponentFamilyCounts: Object.fromEntries(families.map((family) => [family, 1])),
          matchedComponentFamilyCounts: {},
          strategyComponentFamilyCounts: {},
          componentFamilies: families.map((family) => ({ family, detectedLayers: 1 }))
        }
      }
    }]
  };
}
