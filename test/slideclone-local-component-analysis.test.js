"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  attachLocalComponentAnalysis,
  validateIr
} = require("../packages/slideclone-native-engine/scripts/slideclone");

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

test("local slideclone component analysis applies component indexes through native rebuild", async (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.outputDir, "normalized"), { recursive: true });
  fs.writeFileSync(path.join(f.outputDir, "normalized", "page-1.png"), "png", "utf8");
  let nativeRequest;
  const evidence = {
    provider: "team-component-analysis-v1",
    detectedComponentFamilyCounts: { "process-flow": 1 },
    matchedComponentFamilyCounts: { "process-flow": 1 },
    strategyComponentFamilyCounts: { "process-flow": 1 }
  };
  const result = await attachLocalComponentAnalysis(deck(), {
    outputDir: f.outputDir,
    irFile: f.irFile,
    inputFiles: [f.inputFile],
    componentCatalogRoot: f.root,
    createResolver: () => async () => ({
      evidence,
      componentStrategyIndex: { pages: [{ pageIndex: 0, layers: [{ pageIndex: 0, imageIndex: 0 }] }] },
      componentAssetIndex: { pages: [{ pageIndex: 0, layers: [{ pageIndex: 0, imageIndex: 0, localAssets: [] }] }] }
    }),
    nativeRebuild: (request) => {
      nativeRequest = request;
      return {
        ...deck(),
        pages: [{
          ...deck().pages[0],
          shapes: [{
            id: "native-component-shape",
            type: "rect",
            box: { x: 10, y: 10, w: 100, h: 40 },
            source: { detector: "component-template-native" }
          }]
        }]
      };
    }
  });

  assert.equal(result.attached, true);
  assert.equal(result.ir.pages[0].shapes.length, 1);
  assert.deepEqual(result.ir.pages[0].source.componentAnalysis, evidence);
  assert.ok(nativeRequest.workDir.startsWith(path.join(f.outputDir, ".component-analysis-local")));
  assert.equal(nativeRequest.componentStrategyIndex.pages[0].pageIndex, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.irFile, "utf8")).pages[0].shapes.map((shape) => shape.id), ["native-component-shape"]);
});

test("local slideclone component analysis normalizes rebuilt component evidence and asset paths", async (t) => {
  const f = fixture(t);
  const assetDir = path.join(f.outputDir, "assets");
  fs.mkdirSync(assetDir, { recursive: true });
  fs.writeFileSync(path.join(assetDir, "component-native-p01-g01.png"), "png", "utf8");
  const evidence = {
    provider: "team-component-analysis-v1",
    detectedComponentFamilyCounts: { "hierarchy-tree": 1 },
    matchedComponentFamilyCounts: { "hierarchy-tree": 1 },
    strategyComponentFamilyCounts: { "hierarchy-tree": 1 }
  };
  const result = await attachLocalComponentAnalysis(deck(), {
    outputDir: f.outputDir,
    irFile: f.irFile,
    inputFiles: [f.inputFile],
    componentCatalogRoot: f.root,
    createResolver: () => async () => ({
      evidence,
      componentStrategyIndex: { pages: [{ pageIndex: 0, layers: [{ pageIndex: 0, imageIndex: 0 }] }] }
    }),
    nativeRebuild: () => ({
      ...deck(),
      pages: [{
        ...deck().pages[0],
        shapes: [{
          id: "native-component-shape",
          type: "rect",
          box: { x: 130, y: 20, w: 40, h: 20 },
          source: { detector: "component-template-native" }
        }],
        images: [{
          id: "native-component-image",
          type: "image",
          assetPath: "../../assets/component-native-p01-g01.png",
          box: { x: 120, y: 10, w: 100, h: 40 },
          source: {
            detector: "component-template-native-picture",
            componentRenderStrategy: { mode: "preserve-local-crop", targetMotifs: ["tree-link"] }
          }
        }]
      }]
    })
  });

  const saved = JSON.parse(fs.readFileSync(f.irFile, "utf8"));
  assert.equal(result.attached, true);
  assert.deepEqual(saved.pages[0].shapes[0].source.evidenceBox, saved.pages[0].shapes[0].box);
  assert.equal(saved.pages[0].shapes[0].source.pageImage, "normalized/page-1.png");
  assert.deepEqual(saved.pages[0].shapes[0].source.componentTemplateTargetMotifs, ["tree-link"]);
  assert.deepEqual(saved.pages[0].images[0].source.evidenceBox, saved.pages[0].images[0].box);
  assert.equal(saved.pages[0].images[0].source.pageImage, "normalized/page-1.png");
  assert.equal(saved.pages[0].images[0].assetPath, "../assets/component-native-p01-g01.png");
  assert.match(saved.pages[0].images[0].source.nonEditableReason, /local raster asset/u);
  assert.equal(validateIr(saved, { baseDir: path.dirname(f.irFile) }).ok, true);
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
