"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { attachLocalComponentAnalysis } = require("../packages/slideclone-native-engine/scripts/slideclone");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-local-components-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outputDir = path.join(root, "out");
  const irFile = path.join(outputDir, "ir", "deck.json");
  const inputFile = path.join(root, "source.png");
  fs.mkdirSync(path.dirname(irFile), { recursive: true });
  fs.writeFileSync(inputFile, "png", "utf8");
  return { root, outputDir, irFile, inputFile };
}

function deck(pageCount = 1) {
  return {
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: Array.from({ length: pageCount }, (_, pageIndex) => ({
      pageIndex,
      sourceImage: `normalized/page-${pageIndex + 1}.png`,
      source: {},
      background: {},
      textBoxes: [],
      shapes: [],
      images: [],
      tables: [],
      charts: [],
      icons: []
    }))
  };
}

test("local slideclone component analysis attaches measured evidence for single-page configured runs", async (t) => {
  const f = fixture(t);
  let request;
  const evidence = {
    provider: "team-component-analysis-v1",
    detectedComponentFamilyCounts: { "process-flow": 1 }
  };
  const result = await attachLocalComponentAnalysis(deck(), {
    outputDir: f.outputDir,
    irFile: f.irFile,
    inputFiles: [f.inputFile],
    componentCatalogRoot: f.root,
    createResolver: ({ componentCatalogRoot }) => {
      assert.equal(componentCatalogRoot, f.root);
      return async (value) => {
        request = value;
        return { evidence };
      };
    }
  });

  assert.equal(result.attached, true);
  assert.deepEqual(result.ir.pages[0].source.componentAnalysis, evidence);
  assert.equal(request.metadata.inputFile, f.inputFile);
  assert.ok(request.workDir.startsWith(path.join(f.outputDir, ".component-analysis-local")));
  assert.deepEqual(JSON.parse(fs.readFileSync(f.irFile, "utf8")).pages[0].source.componentAnalysis, evidence);
});

test("local slideclone component analysis is inert unless configured and single-page", async (t) => {
  const f = fixture(t);
  let calls = 0;
  const createResolver = () => {
    calls += 1;
    return async () => ({ evidence: { provider: "team-component-analysis-v1" } });
  };

  assert.equal((await attachLocalComponentAnalysis(deck(), {
    outputDir: f.outputDir,
    irFile: f.irFile,
    inputFiles: [f.inputFile],
    componentCatalogRoot: "",
    createResolver
  })).reason, "component-assets-not-configured");
  assert.equal((await attachLocalComponentAnalysis(deck(2), {
    outputDir: f.outputDir,
    irFile: f.irFile,
    inputFiles: [f.inputFile],
    componentCatalogRoot: f.root,
    createResolver
  })).reason, "component-analysis-requires-single-page-input");
  assert.equal(calls, 0);
});
