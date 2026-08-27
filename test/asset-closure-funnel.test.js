"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createAssetClosureFunnelObjects, inferAssetClosureFunnel } = require("../skills/pd-hifi-slideclone/scripts/lib/asset-closure-funnel");

function fixture(overrides = {}) {
  const textBoxes = [
    box("Reusable asset transformation", 145, 71, 667, 30),
    box("DOCs", 253, 160, 48, 18), box("HTML", 384, 195, 42, 21), box("Screenshots", 468, 214, 87, 19), box("Mock Data", 653, 162, 85, 17),
    box("Skills processing engine", 407, 261, 145, 21),
    box("Extract mapping rules", 286, 296, 99, 19), box("Extract validation logic", 432, 306, 95, 18), box("Extract uniqueness constraints", 574, 295, 116, 20),
    box("Structured document output", 184, 383, 120, 20), box("Runnable prototype entry", 682, 385, 118, 17),
    box("Transform source materials into reusable assets", 268, 456, 422, 19), box("Document + prototype + mock data", 257, 479, 438, 17)
  ];
  const page = { images: [{ id: "underlay", box: { x: 40, y: 110, w: 880, h: 390 }, source: { detector: "structured-case-graphic-underlay-crop" } }] };
  return { page: overrides.page || page, textBoxes: overrides.textBoxes || textBoxes };
}

test("infers a generic asset closure funnel from semantic roles and OCR geometry", () => {
  const { page, textBoxes } = fixture();
  const model = inferAssetClosureFunnel(page, textBoxes);
  assert.ok(model);
  assert.equal(model.rules.length, 3);
  assert.equal(model.outputs.length, 2);
  assert.ok(model.geometry.left < model.geometry.center && model.geometry.center < model.geometry.right);
  assert.ok(model.geometry.topY < model.geometry.joinY && model.geometry.joinY < model.geometry.bottomY);
});

test("fails closed without complete input kinds, rule topology, outputs, or a bounded underlay", () => {
  const { page, textBoxes } = fixture();
  assert.equal(inferAssetClosureFunnel(page, textBoxes.filter((item) => !["HTML", "Screenshots"].includes(item.text))), null);
  assert.equal(inferAssetClosureFunnel(page, textBoxes.filter((item) => !item.text.includes("uniqueness"))), null);
  assert.equal(inferAssetClosureFunnel(page, textBoxes.filter((item) => !item.text.includes("prototype"))), null);
  assert.equal(inferAssetClosureFunnel({ images: [] }, textBoxes), null);
});

test("rebuilds native funnel structure and keeps only three pictorial minimum-unit crops", () => {
  const { page, textBoxes } = fixture();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "asset-closure-funnel-"));
  const result = createAssetClosureFunnelObjects(page, textBoxes, { widthPt: 960, heightPt: 540 }, {
    sourceImage: blankImage(960, 540), assetDir: path.join(root, "assets"), irDir: root, deckName: "fixture", pageIndex: 0
  });
  assert.equal(result.matched, true);
  assert.equal(result.shapes.length, 13);
  assert.equal(result.images.length, 3);
  assert.ok(result.shapes.every((shape) => shape.source.nativeComponentArchetype === "asset-closure-funnel"));
  assert.ok(result.images.every((image) => image.source.intentionalMinimumUnitCrop === true));
  assert.ok(result.shapes.every((shape) => shape.box.x >= 0 && shape.box.x + shape.box.w <= 960));
  const valueText = result.textBoxes.filter((item) => /value-text-\d+$/.test(item.id));
  assert.equal(valueText.length, 2);
  assert.deepEqual(valueText.map((item) => item.box), [
    { x: 268, y: 456, w: 422, h: 19 },
    { x: 257, y: 479, w: 438, h: 17 }
  ]);
  assert.deepEqual(valueText.map((item) => item.font.sizePt), [18.2, 18.2]);
  assert.ok(valueText.every((item) => item.style.wrap === false));
  const title = result.textBoxes.find((item) => item.id.endsWith("-title"));
  assert.equal(title.font.sizePt, 33.4);
  assert.equal(title.style.wrap, false);
});

function box(text, x, y, w, h) { return { text, box: { x, y, w, h }, font: { sizePt: 14 } }; }
function blankImage(width, height) { return { width, height, rgba: Buffer.alloc(width * height * 4, 255) }; }
