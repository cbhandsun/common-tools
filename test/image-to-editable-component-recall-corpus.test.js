"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");

const {
  buildImageToEditableComponentRecallCorpusPlan,
  parseArgs,
  validateCorpusManifest
} = require("../packages/slideclone-native-engine/scripts/image-to-editable-component-recall-corpus");

test("image-to-editable recall corpus manifest covers required component families and acceptance profiles", () => {
  const manifestFile = path.join(process.cwd(), "skills/pd-hifi-slideclone/examples/image-to-editable-component-recall-corpus.manifest.json");
  const plan = buildImageToEditableComponentRecallCorpusPlan({ manifest: manifestFile });

  assert.equal(plan.provider, "image-to-editable-component-recall-corpus-v1");
  assert.equal(plan.summary.caseCount, 7);
  assert.equal(plan.summary.requiredComponentFamilyTypes, 13);
  assert.equal(plan.summary.coveredComponentFamilyTypes, 13);
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
  fs.writeFileSync(path.join(tmp, "case-a.png"), tinyPng());
  writeJson(path.join(caseRoot, "ir", "deck.json"), deckWithComponentAnalysis(["process-flow"]));
  fs.writeFileSync(path.join(caseRoot, "deck.pptx"), storedZip([
    ["[Content_Types].xml", "<Types/>"],
    ["ppt/presentation.xml", "<p:presentation/>"]
  ]));
  writeJson(path.join(caseRoot, "deck.component-candidates.json"), { layers: [] });
  writeJson(manifestFile, manifestWithCases([corpusCase("case-a", ["process-flow"], {
    source: {
      path: repoRelative(path.join(tmp, "case-a.png"))
    },
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
  assert.deepEqual(plan.cases[0].observedComponentFamilyEvidence, [{
    family: "process-flow",
    detectedLayers: 1,
    matchedLayers: 0,
    strategyLayers: 0,
    missingLayers: 0
  }]);
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
  fs.writeFileSync(path.join(tmp, "case-a.png"), tinyPng());
  writeJson(path.join(caseRoot, "ir", "deck.json"), deckWithComponentAnalysis(["matrix-table"]));
  fs.writeFileSync(path.join(caseRoot, "deck.pptx"), storedZip([
    ["[Content_Types].xml", "<Types/>"],
    ["ppt/presentation.xml", "<p:presentation/>"]
  ]));
  writeJson(path.join(caseRoot, "deck.component-candidates.json"), { layers: [] });
  writeJson(manifestFile, manifestWithCases([corpusCase("case-a", ["process-flow"], {
    source: {
      path: repoRelative(path.join(tmp, "case-a.png"))
    },
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

test("image-to-editable recall corpus reports family recall stage evidence without double counting", (t) => {
  const tmpRoot = path.join(process.cwd(), "runs", "test-image-recall-corpus");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(tmpRoot, "stage-evidence-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const manifestFile = path.join(tmp, "manifest.json");
  const caseRoot = path.join(tmp, "case-a");
  fs.mkdirSync(path.join(caseRoot, "ir"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "case-a.png"), tinyPng());
  writeJson(path.join(caseRoot, "ir", "deck.json"), {
    pages: [{
      source: {
        componentAnalysis: {
          provider: "team-component-analysis-v1",
          detectedComponentFamilyCounts: { "process-flow": 2 },
          matchedComponentFamilyCounts: { "process-flow": 1 },
          strategyComponentFamilyCounts: { "process-flow": 1 },
          missingComponentFamilyCounts: { "matrix-table": 1 },
          componentFamilies: [
            { family: "process-flow", detectedLayers: 2, matchedLayers: 1, strategyLayers: 1, missingLayers: 0 },
            { family: "matrix-table", detectedLayers: 1, matchedLayers: 0, strategyLayers: 0, missingLayers: 1 }
          ]
        }
      }
    }]
  });
  fs.writeFileSync(path.join(caseRoot, "deck.pptx"), storedZip([
    ["[Content_Types].xml", "<Types/>"],
    ["ppt/presentation.xml", "<p:presentation/>"]
  ]));
  writeJson(path.join(caseRoot, "deck.component-candidates.json"), { layers: [] });
  writeJson(manifestFile, manifestWithCases([corpusCase("case-a", ["matrix-table", "process-flow"], {
    source: {
      path: repoRelative(path.join(tmp, "case-a.png"))
    },
    artifacts: {
      inputWorkDir: repoRelative(caseRoot),
      outputIr: repoRelative(path.join(caseRoot, "ir", "deck.json")),
      outputPptx: repoRelative(path.join(caseRoot, "deck.pptx")),
      componentCandidateReport: repoRelative(path.join(caseRoot, "deck.component-candidates.json"))
    }
  })], ["matrix-table", "process-flow"]));

  const plan = buildImageToEditableComponentRecallCorpusPlan({ manifest: manifestFile, requireArtifacts: true });

  assert.deepEqual(plan.cases[0].observedComponentFamilyEvidence, [{
    family: "matrix-table",
    detectedLayers: 1,
    matchedLayers: 0,
    strategyLayers: 0,
    missingLayers: 1
  }, {
    family: "process-flow",
    detectedLayers: 2,
    matchedLayers: 1,
    strategyLayers: 1,
    missingLayers: 0
  }]);
});

test("image-to-editable recall corpus requires source and OpenXML PPTX artifacts", (t) => {
  const tmpRoot = path.join(process.cwd(), "runs", "test-image-recall-corpus");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(tmpRoot, "strict-artifacts-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const manifestFile = path.join(tmp, "manifest.json");
  const caseRoot = path.join(tmp, "case-a");
  fs.mkdirSync(path.join(caseRoot, "ir"), { recursive: true });
  const sourceFile = path.join(tmp, "case-a.png");
  const pptxFile = path.join(caseRoot, "deck.pptx");
  fs.writeFileSync(sourceFile, tinyPng());
  writeJson(path.join(caseRoot, "ir", "deck.json"), deckWithComponentAnalysis(["process-flow"]));
  fs.writeFileSync(pptxFile, "not-a-pptx", "utf8");
  writeJson(path.join(caseRoot, "deck.component-candidates.json"), { layers: [] });
  writeJson(manifestFile, manifestWithCases([corpusCase("case-a", ["process-flow"], {
    source: {
      path: repoRelative(sourceFile)
    },
    artifacts: {
      inputWorkDir: repoRelative(caseRoot),
      outputIr: repoRelative(path.join(caseRoot, "ir", "deck.json")),
      outputPptx: repoRelative(pptxFile),
      componentCandidateReport: repoRelative(path.join(caseRoot, "deck.component-candidates.json"))
    }
  })], ["process-flow"]));

  assert.throws(
    () => buildImageToEditableComponentRecallCorpusPlan({ manifest: manifestFile, requireArtifacts: true }),
    /outputPptx is missing OpenXML entries/u
  );
  fs.writeFileSync(pptxFile, storedZip([
    ["[Content_Types].xml", "<Types/>"],
    ["ppt/presentation.xml", "<p:presentation/>"]
  ], { corruptCrc: true }));
  assert.throws(
    () => buildImageToEditableComponentRecallCorpusPlan({ manifest: manifestFile, requireArtifacts: true }),
    /PPTX ZIP entry checksum is invalid/u
  );
  fs.rmSync(sourceFile);
  fs.writeFileSync(pptxFile, storedZip([
    ["[Content_Types].xml", "<Types/>"],
    ["ppt/presentation.xml", "<p:presentation/>"]
  ]));
  assert.throws(
    () => buildImageToEditableComponentRecallCorpusPlan({ manifest: manifestFile, requireArtifacts: true }),
    /source path is missing/u
  );
});

test("image-to-editable recall corpus rejects placeholder source artifacts", (t) => {
  const tmpRoot = path.join(process.cwd(), "runs", "test-image-recall-corpus");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(tmpRoot, "source-signature-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const manifestFile = path.join(tmp, "manifest.json");
  const caseRoot = path.join(tmp, "case-a");
  fs.mkdirSync(path.join(caseRoot, "ir"), { recursive: true });
  const sourceFile = path.join(tmp, "case-a.png");
  const pptxFile = path.join(caseRoot, "deck.pptx");
  fs.writeFileSync(sourceFile, "source image", "utf8");
  writeJson(path.join(caseRoot, "ir", "deck.json"), deckWithComponentAnalysis(["process-flow"]));
  fs.writeFileSync(pptxFile, storedZip([
    ["[Content_Types].xml", "<Types/>"],
    ["ppt/presentation.xml", "<p:presentation/>"]
  ]));
  writeJson(path.join(caseRoot, "deck.component-candidates.json"), { layers: [] });
  writeJson(manifestFile, manifestWithCases([corpusCase("case-a", ["process-flow"], {
    source: {
      path: repoRelative(sourceFile)
    },
    artifacts: {
      inputWorkDir: repoRelative(caseRoot),
      outputIr: repoRelative(path.join(caseRoot, "ir", "deck.json")),
      outputPptx: repoRelative(pptxFile),
      componentCandidateReport: repoRelative(path.join(caseRoot, "deck.component-candidates.json"))
    }
  })], ["process-flow"]));

  assert.throws(
    () => buildImageToEditableComponentRecallCorpusPlan({ manifest: manifestFile, requireArtifacts: true }),
    /source artifact is not a supported image/u
  );
  fs.writeFileSync(sourceFile, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  assert.throws(
    () => buildImageToEditableComponentRecallCorpusPlan({ manifest: manifestFile, requireArtifacts: true }),
    /source artifact is not a supported image/u
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
      components: expectedComponentFamilies.map((family) => ({ family })),
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

function tinyPng() {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = zlib.deflateSync(Buffer.from([0, 0, 0, 0, 0]));
  return Buffer.concat([signature, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
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

function storedZip(entries, options = {}) {
  const files = entries.map(([name, value]) => ({ name: Buffer.from(name), data: Buffer.from(value) }));
  let offset = 0;
  const locals = [];
  const centrals = [];
  for (const file of files) {
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(options.corruptCrc ? 0 : crc32(file.data), 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(file.name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, file.name, file.data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(options.corruptCrc ? 0 : crc32(file.data), 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(file.name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, file.name);
    offset += local.length + file.name.length + file.data.length;
  }
  const centralOffset = offset;
  const central = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, central, eocd]);
}

function crc32(content) {
  let value = 0xffffffff;
  for (const byte of content) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
