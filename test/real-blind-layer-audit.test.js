"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { cropPng, writePng } = require("../skills/pd-hifi-slideclone/scripts/lib/png");
const { createChartFixtures, SLIDE_SIZE } = require("../skills/pd-hifi-slideclone/scripts/lib/chart-native-render-golden");
const { auditRealIrBlindLayers, chooseCanvasScale, isStronglyProtectedMinimumUnit, resolveContainedAsset } = require("../skills/pd-hifi-slideclone/scripts/lib/real-blind-layer-audit");
const { parseArgs } = require("../skills/pd-hifi-slideclone/scripts/real-blind-layer-audit");

test("real blind layer audit flags protected minimum units promoted to native", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "real-blind-audit-"));
  const fixture = createChartFixtures().find((item) => item.id === "native-donut-chart");
  writePng(path.join(root, "donut.png"), cropPng(fixture.image, { x: 156, y: 48, w: 220, h: 220 }));
  const irFile = path.join(root, "sample.ir.json");
  fs.writeFileSync(irFile, JSON.stringify({
    slideSize: SLIDE_SIZE,
    pages: [{ pageIndex: 0, images: [{
      id: "protected-icon",
      type: "fidelity-crop",
      box: { x: 100, y: 80, w: 220, h: 220 },
      assetPath: "donut.png",
      source: { protectedMinimumUnit: true, detector: "icon-crop" }
    }] }]
  }));

  const report = auditRealIrBlindLayers(irFile, {
    classifyLayer: nativeClassification("donut-chart"),
    createNativeShapes(items) {
      items[0].source.dropErasedResidualAfterNativeRebuild = true;
      return [{ source: { detector: "test-native-shell" } }];
    }
  });

  assert.equal(report.passed, false);
  assert.equal(report.issueCount, 3);
  assert.equal(report.layers[0].blindReadiness, "native-rebuild");
  assert.equal(report.layers[0].blindDropsSourceCrop, true);
});

test("real blind layer audit accepts unprotected native chart promotion", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "real-blind-audit-"));
  const fixture = createChartFixtures().find((item) => item.id === "native-pie-chart");
  writePng(path.join(root, "pie.png"), cropPng(fixture.image, { x: 168, y: 58, w: 225, h: 225 }));
  const irFile = path.join(root, "sample.ir.json");
  fs.writeFileSync(irFile, JSON.stringify({
    slideSize: SLIDE_SIZE,
    pages: [{ images: [{ id: "chart", type: "image", box: { x: 100, y: 80, w: 225, h: 225 }, assetPath: "pie.png", source: {} }] }]
  }));

  const report = auditRealIrBlindLayers(irFile, { classifyLayer: nativeClassification("pie-chart") });

  assert.equal(report.passed, true);
  assert.equal(report.layers[0].blindArchetype, "pie-chart");
});

test("real blind layer audit validates CLI and asset boundaries", () => {
  assert.deepEqual(parseArgs(["--ir", "a.json", "--ir", "b.json", "--out", "report.json"]), {
    ir: ["a.json", "b.json"], out: "report.json", canvasScale: "auto", help: false
  });
  assert.equal(parseArgs(["--ir", "a.json", "--canvas-scale", "2"]).canvasScale, 2);
  assert.throws(() => parseArgs(["--ir", "a.json", "--canvas-scale", "0"]), /canvas-scale/);
  assert.throws(() => parseArgs(["--unknown"]), /Unknown argument/);
  assert.throws(() => resolveContainedAsset(os.tmpdir(), "../outside.png"), /stay inside/);
});

test("real blind layer audit supersamples only tiny visual crops", () => {
  assert.equal(chooseCanvasScale({ w: 30, h: 30 }, SLIDE_SIZE), 2);
  assert.equal(chooseCanvasScale({ w: 220, h: 160 }, SLIDE_SIZE), 1);
  assert.equal(chooseCanvasScale({ w: 220, h: 160 }, SLIDE_SIZE, 3), 3);
  assert.throws(() => chooseCanvasScale({}, SLIDE_SIZE, 5), /canvasScale/);
});

test("real blind layer audit distinguishes strong visual protection from legacy preserve advice", () => {
  assert.equal(isStronglyProtectedMinimumUnit({ type: "fidelity-background", source: {} }), true);
  assert.equal(isStronglyProtectedMinimumUnit({ source: { expressionForm: "screenshot-or-document" } }), true);
  assert.equal(isStronglyProtectedMinimumUnit({ source: { detector: "icon-residual-crop" } }), true);
  assert.equal(isStronglyProtectedMinimumUnit({ source: { layer: { recommendedAction: "preserve-local-crop" } } }), false);
});

function nativeClassification(archetype) {
  return () => ({
    layerType: "diagram-zone",
    recommendedAction: "attempt-native-reconstruction",
    diagramUnderstanding: { archetype, nativeReadiness: "native-rebuild", residualCount: 0 }
  });
}
