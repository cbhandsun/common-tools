"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  arbitrateNativeObjectOwnership,
  nativeRebuildFamily,
  normalizeBox
} = require("../skills/pd-hifi-slideclone/scripts/lib/native-object-conflict-arbitrator");

function item(id, detector, box, layerSourceId = "") {
  return { id, box, source: { detector, layerSourceId } };
}

function textItem(id, detector, text, box, layerSourceId = "") {
  return { ...item(id, detector, box, layerSourceId), text };
}

test("native ownership arbitration removes generic matrix objects inside a specialized matrix region", () => {
  const result = arbitrateNativeObjectOwnership([
    item("owner-cell-a", "temporary-answer-workflow-native-cell", { x: 80, y: 100, w: 300, h: 160 }),
    item("owner-cell-b", "temporary-answer-workflow-native-cell", { x: 380, y: 100, w: 300, h: 160 }),
    item("generic-label", "structured-case-matrix-semantic-node-text", { x: 120, y: 140, w: 90, h: 24 }),
    item("generic-line", "visual-atom-native-connector", { x: 160, y: 180, w: 220, h: 4 }),
    item("page-title", "title-accent", { x: 36, y: 28, w: 4, h: 38 })
  ]);

  assert.deepEqual(result.items.map((entry) => entry.id), ["owner-cell-a", "owner-cell-b", "page-title"]);
  assert.equal(result.dropped.length, 2);
  assert.equal(result.dropped.every((entry) => entry.ownerFamily === "temporary-answer-workflow"), true);
});

test("native ownership arbitration preserves lower-priority objects outside the claimed region", () => {
  const result = arbitrateNativeObjectOwnership([
    item("owner", "temporary-answer-workflow-native-cell", { x: 80, y: 100, w: 300, h: 160 }),
    item("other-matrix", "structured-case-matrix-native-skeleton-grid-line", { x: 600, y: 100, w: 250, h: 3 })
  ]);

  assert.equal(result.items.length, 2);
  assert.equal(result.dropped.length, 0);
});

test("native ownership arbitration uses explicit layer ownership without requiring valid boxes", () => {
  const result = arbitrateNativeObjectOwnership([
    item("owner", "cover-engine-core-native-axis", null, "layer-1"),
    item("generic", "dense-complex-diagram-native-scaffold-node", null, "layer-1"),
    item("other", "dense-complex-diagram-native-scaffold-node", null, "layer-2")
  ]);

  assert.deepEqual(result.items.map((entry) => entry.id), ["owner", "other"]);
});

test("cover engine core owns visual atom fragments on its specialized layer", () => {
  const result = arbitrateNativeObjectOwnership([
    item("cover", "cover-engine-core-native-shield", { x: 10, y: 10, w: 100, h: 100 }, "layer-cover"),
    item("atom", "visual-atom-native-rect", { x: 20, y: 20, w: 8, h: 8 }, "layer-cover")
  ]);

  assert.deepEqual(result.items.map((entry) => entry.id), ["cover"]);
  assert.equal(result.dropped[0].ownerFamily, "cover-engine-core");
});

test("native ownership arbitration safely handles empty, invalid, and non-array input", () => {
  assert.deepEqual(arbitrateNativeObjectOwnership(null), { items: [], dropped: [], claims: [] });
  assert.equal(normalizeBox({ x: 0, y: 0, w: -1, h: 2 }), null);
  assert.equal(normalizeBox({ x: 0, y: 0, w: Infinity, h: 2 }), null);
  assert.deepEqual(normalizeBox({ x: 5, y: 6, w: 0, h: 20 }), { x: 5, y: 6, w: 1, h: 20 });
  assert.equal(normalizeBox({ x: 5, y: 6, w: 0, h: 0 }), null);
});

test("native ownership arbitration removes zero-width connector lines inside an owned region", () => {
  const result = arbitrateNativeObjectOwnership([
    item("owner", "temporary-answer-workflow-native-cell", { x: 80, y: 100, w: 300, h: 160 }),
    item("line", "visual-atom-native-connector", { x: 160, y: 120, w: 0, h: 100 })
  ]);

  assert.deepEqual(result.items.map((entry) => entry.id), ["owner"]);
  assert.equal(result.dropped[0].reason, "lower-priority-family-inside-owned-region");
});

test("native rebuild family classifies specialized and generic matrix detectors explicitly", () => {
  assert.equal(nativeRebuildFamily("temporary-answer-workflow-native-cell"), "temporary-answer-workflow");
  assert.equal(nativeRebuildFamily("structured-case-matrix-semantic-node-text"), "structured-case-matrix");
  assert.equal(nativeRebuildFamily("visual-atom-native-connector"), "visual-atom");
});

test("horizontal step chain owns matching OCR text but preserves unrelated nearby text", () => {
  const result = arbitrateNativeObjectOwnership([
    textItem("native-title", "horizontal-step-chain-native-step-title", "扩展业务入口", { x: 200, y: 120, w: 130, h: 28 }),
    textItem("ocr-duplicate", "", "扩展业务入口", { x: 204, y: 122, w: 126, h: 26 }),
    textItem("ocr-other", "", "阶段说明", { x: 210, y: 155, w: 100, h: 24 })
  ]);

  assert.deepEqual(result.items.map((entry) => entry.id), ["native-title", "ocr-other"]);
  assert.equal(result.dropped[0].ownerFamily, "horizontal-step-chain");
});

test("horizontal step chain suppresses generic visual atoms and duplicate containers on its owned layer", () => {
  const result = arbitrateNativeObjectOwnership([
    item("stage-top", "horizontal-step-chain-native-top", { x: 80, y: 120, w: 180, h: 110 }, "roadmap-layer"),
    item("glyph-hole", "visual-atom-native-rect", { x: 130, y: 170, w: 9, h: 9 }, "roadmap-layer"),
    item("text-stroke", "visual-atom-native-connector", { x: 150, y: 210, w: 30, h: 1 }, "roadmap-layer"),
    item("duplicate-panel", "layer-native-container", { x: 90, y: 140, w: 160, h: 80 }, "roadmap-layer"),
    item("other-layer-node", "visual-atom-native-rect", { x: 500, y: 170, w: 40, h: 30 }, "other-layer")
  ]);

  assert.deepEqual(result.items.map((entry) => entry.id), ["stage-top", "other-layer-node"]);
  assert.equal(result.dropped.length, 3);
  assert.equal(result.dropped.every((entry) => entry.ownerFamily === "horizontal-step-chain"), true);
  assert.equal(nativeRebuildFamily("layer-native-container"), "layer-container");
});

test("triangle topology owns same or high-ratio contained OCR text only", () => {
  const result = arbitrateNativeObjectOwnership([
    textItem("native-hifi", "triangle-topology-native-top-text", "Hifi", { x: 200, y: 100, w: 80, h: 24 }),
    textItem("ocr-contained", "", "Hif", { x: 202, y: 101, w: 76, h: 23 }),
    textItem("ocr-short", "", "Hi", { x: 202, y: 101, w: 76, h: 23 }),
    textItem("ocr-other", "", "原型", { x: 205, y: 102, w: 60, h: 20 })
  ]);

  assert.deepEqual(result.items.map((entry) => entry.id), ["native-hifi", "ocr-short", "ocr-other"]);
  assert.equal(result.dropped[0].ownerFamily, "triangle-topology");
});
