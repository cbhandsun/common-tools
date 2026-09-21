"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildImageToEditableComponentRecallCorpusPlan
} = require("../packages/slideclone-native-engine/scripts/image-to-editable-component-recall-corpus");
const {
  materializeImageToEditableComponentRecallFixtures,
  parseArgs,
  _private
} = require("../packages/slideclone-native-engine/scripts/image-to-editable-component-recall-fixtures");

test("image-to-editable recall fixture materializer creates strict corpus artifacts", async (t) => {
  const tmpRoot = path.join(process.cwd(), "runs", "test-image-recall-fixtures");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(tmpRoot, "fixtures-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifestFile = path.join(root, "manifest.json");
  const sourceFile = path.join(root, "sources", "case-a.png");
  const caseRoot = path.join(root, "case-a");
  writeJson(manifestFile, manifestWithCases([corpusCase("case-a", ["process-flow", "matrix-table"], {
    source: { path: repoRelative(sourceFile) },
    artifacts: {
      inputWorkDir: repoRelative(caseRoot),
      outputIr: repoRelative(path.join(caseRoot, "ir", "deck.json")),
      outputPptx: repoRelative(path.join(caseRoot, "deck.pptx")),
      componentCandidateReport: repoRelative(path.join(caseRoot, "deck.component-candidates.json"))
    }
  })], ["process-flow", "matrix-table"]));

  const report = await materializeImageToEditableComponentRecallFixtures({
    manifest: manifestFile,
    root,
    out: path.join(root, "fixture-materialization-report.json"),
    stateRoot: path.join(root, ".state"),
    ownerId: "unit-fixture",
    force: true,
    executeSlideclone: fakeSlidecloneRunner
  });

  assert.equal(report.summary.caseCount, 1);
  assert.equal(report.summary.componentFamilyTypes, 2);
  assert.ok(fs.statSync(sourceFile).size > 100);
  assert.ok(fs.existsSync(path.join(caseRoot, "deck.pptx")));
  assert.ok(fs.existsSync(path.join(caseRoot, "deck.component-candidates.json")));
  const deck = readJson(path.join(caseRoot, "ir", "deck.json"));
  assert.equal(deck.pages.length, 1);
  assert.equal(deck.pages[0].source.componentAnalysis.provider, "team-component-analysis-v1");
  assert.deepEqual(deck.pages[0].source.componentAnalysis.detectedComponentFamilyCounts, {
    "matrix-table": 1,
    "process-flow": 1
  });
  const plan = buildImageToEditableComponentRecallCorpusPlan({ manifest: manifestFile, requireArtifacts: true });
  assert.deepEqual(plan.cases[0].observedComponentFamilies, ["matrix-table", "process-flow"]);
});

test("image-to-editable recall fixture materializer requires measured component analysis", async (t) => {
  const root = fs.mkdtempSync(path.join(process.cwd(), "runs", "test-image-recall-fixtures-missing-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifestFile = path.join(root, "manifest.json");
  writeJson(manifestFile, manifestWithCases([corpusCase("case-a", ["process-flow"], {
    source: { path: repoRelative(path.join(root, "sources", "case-a.png")) },
    artifacts: {
      inputWorkDir: repoRelative(path.join(root, "case-a")),
      outputIr: repoRelative(path.join(root, "case-a", "ir", "deck.json")),
      outputPptx: repoRelative(path.join(root, "case-a", "deck.pptx")),
      componentCandidateReport: repoRelative(path.join(root, "case-a", "deck.component-candidates.json"))
    }
  })], ["process-flow"]));

  await assert.rejects(
    materializeImageToEditableComponentRecallFixtures({
      manifest: manifestFile,
      root,
      out: path.join(root, "fixture-materialization-report.json"),
      stateRoot: path.join(root, ".state"),
      ownerId: "unit-fixture",
      force: true,
      executeSlideclone: fakeSlidecloneRunnerWithoutAnalysis
    }),
    /missing measured componentAnalysis families/u
  );
});

test("image-to-editable recall fixture materializer skips absent optional candidate reports", async (t) => {
  const root = fs.mkdtempSync(path.join(process.cwd(), "runs", "test-image-recall-fixtures-optional-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifestFile = path.join(root, "manifest.json");
  const caseRoot = path.join(root, "case-a");
  writeJson(manifestFile, manifestWithCases([corpusCase("case-a", ["process-flow"], {
    source: { path: repoRelative(path.join(root, "sources", "case-a.png")) },
    artifacts: {
      inputWorkDir: repoRelative(caseRoot),
      outputIr: repoRelative(path.join(caseRoot, "ir", "deck.json")),
      outputPptx: repoRelative(path.join(caseRoot, "deck.pptx")),
      componentCandidateReport: null
    }
  })], ["process-flow"]));

  const report = await materializeImageToEditableComponentRecallFixtures({
    manifest: manifestFile,
    root,
    out: path.join(root, "fixture-materialization-report.json"),
    stateRoot: path.join(root, ".state"),
    ownerId: "unit-fixture",
    force: true,
    executeSlideclone: fakeSlidecloneRunner
  });

  assert.equal(report.summary.componentCandidateReports, 0);
  assert.equal(report.results[0].componentCandidateReport, undefined);
});

test("image-to-editable recall fixture materializer rejects non-image fixture sources", async (t) => {
  const root = fs.mkdtempSync(path.join(process.cwd(), "runs", "test-image-recall-fixtures-kind-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifestFile = path.join(root, "manifest.json");
  writeJson(manifestFile, manifestWithCases([corpusCase("case-a", ["process-flow"], {
    source: { kind: "pdf", path: repoRelative(path.join(root, "sources", "case-a.pdf")) },
    artifacts: {
      inputWorkDir: repoRelative(path.join(root, "case-a")),
      outputIr: repoRelative(path.join(root, "case-a", "ir", "deck.json")),
      outputPptx: repoRelative(path.join(root, "case-a", "deck.pptx")),
      componentCandidateReport: repoRelative(path.join(root, "case-a", "deck.component-candidates.json"))
    }
  })], ["process-flow"]));

  await assert.rejects(
    materializeImageToEditableComponentRecallFixtures({
      manifest: manifestFile,
      root,
      out: path.join(root, "fixture-materialization-report.json"),
      stateRoot: path.join(root, ".state"),
      ownerId: "unit-fixture",
      force: true,
      executeSlideclone: () => { throw new Error("runner should not be called"); }
    }),
    /fixture source kind must be image/u
  );
});

test("image-to-editable recall fixture helpers expose bounded component candidate evidence", () => {
  assert.equal(_private.motifForFamily("timeline-roadmap"), "milestone-roadmap");
  const report = _private.componentCandidateReport({
    id: "case-a",
    expectedComponentFamilies: ["timeline-roadmap"]
  });
  assert.equal(report.layers[0].componentRenderStrategy.mode, "native-rebuild-with-component-style-guide");
  assert.deepEqual(report.layers[0].targetMotifs, ["milestone-roadmap"]);
});

test("image-to-editable recall fixture CLI parses refresh arguments", () => {
  assert.deepEqual(parseArgs(["node", "script", "--manifest", "m.json", "--root", "runs/x", "--out", "r.json", "--state-root", "state", "--owner-id", "owner-1", "--force"]), {
    manifest: "m.json",
    root: "runs/x",
    out: "r.json",
    stateRoot: "state",
    ownerId: "owner-1",
    force: true
  });
});

function fakeSlidecloneRunner({ configPath }) {
  const config = readJson(configPath);
  assert.equal(config.pagePattern, "case-a.png");
  fs.mkdirSync(path.join(config.outputDir, "ir"), { recursive: true });
  fs.mkdirSync(path.join(config.outputDir, "pptx"), { recursive: true });
  writeJson(path.join(config.outputDir, "ir", "deck.json"), {
    version: "1.0",
    slideSize: config.slide,
    pages: [{
      pageIndex: 0,
      source: { componentAnalysis: measuredAnalysis(config, ["process-flow", "matrix-table"]) },
      images: [{ id: "source", box: { x: 0, y: 0, w: 960, h: 540 }, source: { editable: false } }],
      shapes: [],
      textBoxes: [],
      tables: [],
      charts: []
    }]
  });
  fs.writeFileSync(path.join(config.outputDir, "pptx", "deck.pptx"), storedZip([
    ["[Content_Types].xml", "<Types/>"],
    ["ppt/presentation.xml", "<p:presentation/>"]
  ]));
  return { status: 0 };
}

function fakeSlidecloneRunnerWithoutAnalysis({ configPath }) {
  const config = readJson(configPath);
  fs.mkdirSync(path.join(config.outputDir, "ir"), { recursive: true });
  fs.mkdirSync(path.join(config.outputDir, "pptx"), { recursive: true });
  writeJson(path.join(config.outputDir, "ir", "deck.json"), {
    version: "1.0",
    slideSize: config.slide,
    pages: [{
      pageIndex: 0,
      source: {},
      images: [{ id: "source", box: { x: 0, y: 0, w: 960, h: 540 }, source: { editable: false } }],
      shapes: [],
      textBoxes: [],
      tables: [],
      charts: []
    }]
  });
  fs.writeFileSync(path.join(config.outputDir, "pptx", "deck.pptx"), storedZip([
    ["[Content_Types].xml", "<Types/>"],
    ["ppt/presentation.xml", "<p:presentation/>"]
  ]));
  return { status: 0 };
}

function measuredAnalysis(config, families) {
  const counts = Object.fromEntries(families.map((family) => [family, 1]));
  const sourceFile = path.join(config.inputDir, config.pagePattern);
  return {
    provider: "team-component-analysis-v1",
    sourceSha256: hashFile(sourceFile),
    preImages: 1,
    analysisLayers: families.length,
    assetMatches: families.length,
    strategyLayers: families.length,
    assetLayers: families.length,
    componentFamilies: families.map((family) => ({
      family,
      detectedLayers: 1,
      matchedLayers: 1,
      assetMatches: 1,
      strategyLayers: 1,
      missingLayers: 0
    })),
    detectedComponentFamilyCounts: counts,
    matchedComponentFamilyCounts: counts,
    strategyComponentFamilyCounts: counts,
    missingComponentFamilyCounts: {}
  };
}

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
    }
  };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function hashFile(file) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

function repoRelative(file) {
  return path.relative(process.cwd(), file).replace(/\\/gu, "/");
}

function storedZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, value] of entries) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(value);
    const checksum = crc32(data);
    const local = Buffer.alloc(30 + nameBytes.length + data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(local, 30);
    data.copy(local, 30 + nameBytes.length);
    locals.push(local);
    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);
    centrals.push(central);
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, eocd]);
}

function crc32(content) {
  let crc = 0xffffffff;
  for (const byte of content) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
