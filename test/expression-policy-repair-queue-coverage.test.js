"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const test = require("node:test");

const {
  auditRepairQueueCoverage,
  deckNameFromResult,
  finalDeckDispositionSummary,
  finalDeckLayerAsImage,
  finalDeckImageLayers,
  parseArgs
} = require("../skills/pd-hifi-slideclone/scripts/expression-policy-repair-queue-coverage");

test("repair queue coverage parses bounded CLI args", () => {
  const args = parseArgs([
    "node",
    "expression-policy-repair-queue-coverage.js",
    "--repair-queue",
    "queue.json",
    "--parallel-report",
    "parallel.json",
    "--out",
    "coverage.json",
    "--min-matched-ratio",
    "0.5",
    "--fail-on-gap"
  ]);

  assert.equal(args.repairQueue, "queue.json");
  assert.equal(args.parallelReport, "parallel.json");
  assert.equal(args.out, "coverage.json");
  assert.equal(args.minMatchedRatio, 0.5);
  assert.equal(args.failOnGap, true);
});

test("repair queue coverage matches queued repairs by image id or exact box", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repair-queue-coverage-"));
  try {
    const candidateReport = path.join(tmp, "Deck_A.component-candidates.json");
    const outputIr = path.join(tmp, "Deck_A.native.ir.json");
    fs.writeFileSync(candidateReport, `${JSON.stringify({
      layers: [
        {
          pageIndex: 0,
          imageIndex: 3,
          imageId: "native-graphic-target",
          box: { x: 10, y: 20, w: 300, h: 120 }
        },
        {
          pageIndex: 1,
          imageIndex: 0,
          box: { x: 38.61, y: 183.75, w: 876.78, h: 222.38 }
        }
      ]
    })}\n`);
    fs.writeFileSync(outputIr, `${JSON.stringify({
      pages: [
        {
          images: [{
            id: "native-graphic-target",
            box: { x: 10, y: 20, w: 300, h: 120 },
            source: { detector: "candidate-crop", layer: { layerType: "diagram-zone" } }
          }]
        },
        {
          images: [{
            id: "native-graphic-underlay-split-0",
            box: { x: 38.61, y: 183.75, w: 876.78, h: 222.38 },
            source: { detector: "split-erased-residual-crop", layer: { layerType: "diagram-zone" } }
          }]
        }
      ]
    })}\n`);

    const report = auditRepairQueueCoverage({
      repairQueue: {
        actions: [
          {
            deck: "Deck_A",
            page: 1,
            image: 1,
            imageId: "native-graphic-target",
            violation: "actionable-component-template-retained-crop",
            detector: "target-crop",
            repair: { mode: "reclassify-structural-diagram-or-component-template" }
          },
          {
            deck: "Deck_A",
            page: 2,
            image: 1,
            imageId: "native-graphic-sparse-diagram-underlay",
            violation: "actionable-component-template-retained-crop",
            detector: "sparse-diagram",
            box: { x: 38.61, y: 183.75, w: 876.78, h: 222.38 },
            repair: { mode: "reclassify-structural-diagram-or-component-template" }
          },
          {
            deck: "Deck_A",
            page: 3,
            image: 1,
            imageId: "missing",
            violation: "actionable-component-template-retained-crop",
            detector: "missing-crop",
            repair: { mode: "reclassify-structural-diagram-or-component-template" }
          }
        ]
      },
      parallelReport: {
        results: [{
          outputIr: path.join(tmp, "Deck_A.native.ir.json"),
          componentCandidateReport: candidateReport
        }]
      }
    });

    assert.equal(report.totals.queuedActions, 3);
    assert.equal(report.totals.matchedActions, 2);
    assert.equal(report.totals.finalDeckMatchedActions, 2);
    assert.equal(report.totals.unmatchedActions, 1);
    assert.equal(report.totals.finalDeckUnmatchedActions, 1);
    assert.equal(report.totals.matchedRatio, 0.6667);
    assert.equal(report.totals.finalDeckMatchedRatio, 0.6667);
    assert.deepEqual(report.totals.finalDeckDispositionCounts, { "replacement-candidate": 2 });
    assert.equal(report.totals.finalDeckReplacementCandidates, 2);
    assert.equal(report.totals.finalDeckFidelityCrops, 0);
    assert.equal(report.decks[0].finalDeckDispositions.length, 2);
    assert.equal(report.decks[0].finalDeckDispositions[0].action, "replacement-candidate");
    assert.equal(report.decks[0].unmatched[0].imageId, "missing");
    assert.equal(report.decks[0].finalDeckUnmatched[0].imageId, "missing");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("repair queue coverage classifies obvious icon or screenshot final repairs as fidelity crops", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repair-queue-coverage-crops-"));
  try {
    const outputIr = path.join(tmp, "Deck_Icon.native.ir.json");
    fs.writeFileSync(outputIr, `${JSON.stringify({
      pages: [{
        images: [{
          id: "plugin-arrow-icon",
          box: { x: 20, y: 30, w: 180, h: 180 },
          source: {
            detector: "visual-example-icon",
            expressionForm: "icon-diagram",
            layer: {
              layerType: "diagram-zone",
              expressionSubtype: "箭头图标素材"
            }
          }
        }]
      }]
    })}\n`);

    const report = auditRepairQueueCoverage({
      repairQueue: {
        actions: [{
          deck: "Deck_Icon",
          page: 1,
          image: 1,
          imageId: "plugin-arrow-icon",
          violation: "actionable-component-template-retained-crop",
          detector: "visual-example-icon",
          repair: { mode: "reclassify-structural-diagram-or-component-template" }
        }]
      },
      parallelReport: {
        results: [{ outputIr }]
      }
    });

    assert.deepEqual(report.totals.finalDeckDispositionCounts, { "preserve-fidelity-crop": 1 });
    assert.equal(report.totals.finalDeckReplacementCandidates, 0);
    assert.equal(report.totals.finalDeckFidelityCrops, 1);
    assert.equal(report.decks[0].finalDeckDispositions[0].minimumUnitPolicy, "preserve-as-single-crop");
    assert.equal(report.decks[0].finalDeckDispositions[0].unitDisposition, "intentional-visual-crop");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("repair queue coverage exposes final deck disposition helpers", () => {
  const layer = {
    pageIndex: 1,
    imageIndex: 2,
    imageId: "native-graphic-underlay-split-2",
    box: { x: 1, y: 2, w: 3, h: 4 },
    source: { detector: "split-table-grid-residual-crop" }
  };
  const repair = {
    violation: "actionable-component-template-retained-crop",
    repair: { mode: "reclassify-structural-diagram-or-component-template" }
  };
  const disposition = {
    action: "replacement-candidate",
    expressionKind: "structured-diagram",
    minimumUnitPolicy: "rebuild-semantic-structure",
    unitDisposition: "semantic-native-structure",
    reason: "repair requests semantic structure"
  };

  assert.deepEqual(finalDeckLayerAsImage(layer), {
    id: "native-graphic-underlay-split-2",
    box: { x: 1, y: 2, w: 3, h: 4 },
    source: { detector: "split-table-grid-residual-crop" }
  });
  assert.deepEqual(finalDeckDispositionSummary(layer, repair, disposition), {
    action: "replacement-candidate",
    expressionKind: "structured-diagram",
    minimumUnitPolicy: "rebuild-semantic-structure",
    unitDisposition: "semantic-native-structure",
    reason: "repair requests semantic structure",
    page: 2,
    image: 3,
    imageId: "native-graphic-underlay-split-2",
    detector: "split-table-grid-residual-crop",
    violation: "actionable-component-template-retained-crop",
    repairMode: "reclassify-structural-diagram-or-component-template",
    box: { x: 1, y: 2, w: 3, h: 4 }
  });
});

test("repair queue coverage exposes final deck image layers for residual split matching", () => {
  const layers = finalDeckImageLayers({
    pages: [
      { images: [] },
      {
        images: [{
          id: "native-graphic-underlay-split-0",
          box: { x: 46.48, y: 153.76, w: 303.63, h: 347.63 },
          source: {
            detector: "split-wide-residual-crop",
            parentImageId: "native-graphic-underlay",
            layer: { layerType: "diagram-zone" }
          }
        }]
      }
    ]
  });

  assert.equal(layers.length, 1);
  assert.equal(layers[0].pageIndex, 1);
  assert.equal(layers[0].imageIndex, 0);
  assert.equal(layers[0].imageId, "native-graphic-underlay-split-0");
  assert.equal(layers[0].sourceImageId, "native-graphic-underlay");
  assert.deepEqual(layers[0].box, { x: 46.48, y: 153.76, w: 303.63, h: 347.63 });
});

test("repair queue coverage derives deck names from output IR paths", () => {
  assert.equal(deckNameFromResult({
    outputIr: "C:/work/Deck_A.native.ir.json"
  }), "Deck_A");
});
