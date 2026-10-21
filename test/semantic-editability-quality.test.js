"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { auditSemanticEditability } = require("../packages/slideclone-core/semantic-editability-quality");

const slideSize = { widthPt: 100, heightPt: 100 };
function deck(page) { return { slideSize, pages: [{ shapes: [], images: [], ...page }] }; }
function image(id, box, source = {}) { return { id, type: "fidelity-crop", assetPath: `assets/${id}.png`, box, source }; }

test("semantic editability accepts native-only pages without raster-derived fallbacks", () => {
  const result = auditSemanticEditability(deck({
    shapes: [{ id: "card", type: "roundRect", box: { x: 10, y: 10, w: 30, h: 20 }, source: { detector: "line-text-native-card-row" } }],
    textBoxes: [{ id: "label", text: "原生", box: { x: 12, y: 12, w: 20, h: 8 } }]
  }));
  assert.equal(result.passed, true);
  assert.equal(result.metrics.rasterDerivedPrimitiveCount, 0);
});

test("semantic editability rejects raster-derived pixel primitives", () => {
  const result = auditSemanticEditability(deck({
    shapes: [
      { id: "native-residual-pixel-1", type: "rect", box: { x: 1, y: 1, w: 1, h: 1 }, source: { componentQualityIgnore: true, detector: "native-residual-primitive-rect" } },
      { id: "text-fidelity-native-run-1-1", type: "rect", box: { x: 3, y: 1, w: 1, h: 1 }, source: { componentQualityIgnore: true, detector: "text-fidelity-native-primitive" } },
      { id: "compacted-pixel", type: "rect", box: { x: 5, y: 1, w: 1, h: 1 }, source: { componentQualityIgnore: true } }
    ]
  }));
  assert.equal(result.passed, false);
  assert.equal(result.metrics.rasterDerivedPrimitiveCount, 3);
  assert.deepEqual(result.findings.map((item) => item.code), ["raster-derived-primitive", "raster-derived-primitive", "raster-derived-primitive"]);
});

test("semantic editability aggregates tiled raster lineage instead of trusting individual tile size", () => {
  const result = auditSemanticEditability(deck({
    images: [
      image("tile-a", { x: 0, y: 0, w: 20, h: 20 }, { tiledLargeRaster: true, parentLargeRasterId: "residual" }),
      image("tile-b", { x: 20, y: 0, w: 20, h: 20 }, { tiledLargeRaster: true, parentLargeRasterId: "residual" }),
      image("small", { x: 90, y: 90, w: 5, h: 5 }, { residualCrop: true, parentLargeRasterId: "small" })
    ]
  }));
  assert.equal(result.passed, false);
  assert.equal(result.metrics.largeRasterLineageCount, 1);
  assert.equal(result.findings.some((item) => item.code === "large-raster-lineage"), true);
});

test("semantic editability uses lineage union area for overlapping raster tiles", () => {
  const result = auditSemanticEditability(deck({
    images: [
      image("tile-a", { x: 0, y: 0, w: 25, h: 25 }, { tiledLargeRaster: true, parentLargeRasterId: "overlap" }),
      image("tile-b", { x: 0, y: 0, w: 25, h: 25 }, { tiledLargeRaster: true, parentLargeRasterId: "overlap" })
    ]
  }));
  assert.equal(result.passed, true);
  assert.equal(result.metrics.largeRasterLineageCount, 0);
});

test("semantic editability rejects unmarked tiny-rect raster mosaics", () => {
  const result = auditSemanticEditability(deck({
    shapes: Array.from({ length: 36 }, (_, index) => ({
      id: `pixel-${index + 1}`,
      type: "rect",
      box: { x: index % 12, y: Math.floor(index / 12), w: 1, h: 1 },
      style: { fill: "#336699", stroke: "none", strokeWidthPt: 0 }
    }))
  }));
  assert.equal(result.passed, false);
  assert.equal(result.metrics.suspiciousMosaicCount, 36);
  assert.equal(result.findings.some((item) => item.code === "suspicious-raster-mosaic"), true);
});

test("semantic editability rejects unverified protected crops and missing raster provenance", () => {
  const result = auditSemanticEditability(deck({
    images: [
      image("legacy-icon", { x: 10, y: 10, w: 4, h: 4 }, { protectedMinimumUnit: true }),
      { id: "anonymous", type: "fidelity-crop", box: { x: 20, y: 20, w: 40, h: 40 }, source: { residualCrop: true } }
    ]
  }));
  assert.equal(result.passed, false);
  assert.equal(result.metrics.unverifiedCropCount, 1);
  assert.equal(result.metrics.missingRasterProvenanceCount, 1);
});

test("semantic editability fails closed on malformed or excessive input", () => {
  assert.throws(() => auditSemanticEditability(null), /deck is invalid/u);
  assert.throws(() => auditSemanticEditability({ slideSize, pages: [] }), /deck is invalid/u);
  assert.throws(() => auditSemanticEditability({ slideSize, pages: [{ shapes: [null] }] }), /shape/u);
  assert.throws(() => auditSemanticEditability({ slideSize, pages: [{ shapes: Array.from({ length: 20001 }, () => ({})) }] }), /object limit/u);
});

test("semantic editability rejects duplicate identities within a page and across object collections", () => {
  for (const page of [
    { shapes: [{ id: "repeat" }, { id: "repeat" }] },
    { shapes: [{ id: "repeat" }], textBoxes: [{ id: "repeat", text: "private-content" }] },
    { tables: [{ id: "repeat" }], charts: [{ id: "repeat" }] },
    { images: [image("repeat", { x: 0, y: 0, w: 2, h: 2 })], icons: [{ id: "repeat" }] }
  ]) {
    const result = auditSemanticEditability(deck(page));
    assert.equal(result.passed, false);
    assert.equal(result.metrics.duplicateObjectIdCount, 1);
    assert.equal(result.checks.find(check => check.name === "semantic-object-identities").passed, false);
    assert.equal(JSON.stringify(result).includes("private-content"), false);
  }
  const result = auditSemanticEditability({ slideSize, pages: [{ shapes: [{ id: "local" }] }, { shapes: [{ id: "local" }] }] });
  assert.equal(result.passed, true);
  assert.equal(result.metrics.duplicateObjectIdCount, 0);
  assert.throws(() => auditSemanticEditability(deck({ textBoxes: Array.from({ length: 20001 }, () => ({ id: "x" })) })), /object limit/u);
});

test("semantic editability rejects fixed route paint even when short connectors attach its body to nodes", () => {
  const body = { id: "route-body", type: "freeform", box: { x: 10, y: 10, w: 60, h: 40 },
    style: { fill: "#336699", stroke: "none" }, source: { detector: "source-scene-route", editable: true,
      nativeRebuild: true, semanticNativeStructure: true, sourcePhysicalAttachment: true } };
  const shapes = [body, { ...body, id: "route-overlay" },
    { id: "entry", type: "line", style: { startAnchor: { elementId: "a" }, endAnchor: { elementId: body.id } } },
    { id: "exit", type: "line", style: { startAnchor: { elementId: body.id }, endAnchor: { elementId: "b" } } }];
  const input = deck({ shapes }), original = structuredClone(input), result = auditSemanticEditability(input);
  assert.equal(result.passed, false);
  assert.equal(result.metrics.fixedRelationshipPaintCount, 2);
  assert.equal(result.checks.find(check => check.name === "semantic-fixed-relationship-paint").passed, false);
  assert.deepEqual(result.findings.map(finding => finding.code), ["fixed-relationship-paint", "fixed-relationship-paint"]);
  assert.deepEqual(input, original);
});

test("fixed route paint rejection does not depend on serialized editable or attachment claims", () => {
  for (const claim of [{}, { editable: false }, { routeControl: true }, { nativeComponentRole: "icon" },
    { sourcePhysicalAttachment: true }, { sceneRelationId: null }, { semanticNativeStructure: true }]) {
    const result = auditSemanticEditability(deck({ shapes: [{ id: "body", type: "freeform", box: { x: 1, y: 1, w: 2, h: 2 },
      source: { detector: "source-scene-route", ...claim } }] }));
    assert.equal(result.passed, false);
    assert.equal(result.metrics.fixedRelationshipPaintCount, 1);
  }
  const result = auditSemanticEditability(deck({ shapes: Array.from({ length: 150 }, (_, index) => ({
    id: `body-${index}`, type: "freeform", source: { detector: "source-scene-route", text: "private-user-content" }
  })) }));
  assert.equal(result.metrics.fixedRelationshipPaintCount, 150);
  assert.equal(result.findings.length, 100);
  assert.equal(JSON.stringify(result).includes("private-user-content"), false);
});

test("fixed route paint audit preserves native connectors, controls, isolated icons and empty input", () => {
  for (const shapes of [[], [{ id: "line", type: "line", source: { detector: "source-scene-route" } }],
    [{ id: "joint", type: "rect", source: { detector: "source-scene-route", routeControl: true } }],
    [{ id: "icon", type: "freeform", source: { detector: "source-native-icon" } }],
    [{ id: "ordinary", type: "freeform" }], [{ id: "null", type: "freeform", source: null }],
    [{ id: "array", type: "freeform", source: [] }], [{ id: "invalid", type: "freeform", source: { detector: 42 } }]]) {
    const result = auditSemanticEditability(deck({ shapes }));
    assert.equal(result.passed, true);
    assert.equal(result.metrics.fixedRelationshipPaintCount, 0);
  }
});
