"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readPng, writePng } = require("../skills/pd-hifi-slideclone/scripts/lib/png");
const {
  DETECTOR_PREFIX,
  ICON_DETECTOR,
  SCREENSHOT_DETECTOR,
  createRuntimeEngineHybridModel,
  materializeRuntimeEngineHybridImages,
  normalizeRuntimeEngineHybridTextBoxes
} = require("../skills/pd-hifi-slideclone/scripts/lib/runtime-engine-hybrid");

function text(value, x, y, w, h) {
  return { text: value, box: { x, y, w, h }, font: {}, style: {}, source: {} };
}

function fixture() {
  return {
    images: [{ id: "graphic-underlay" }],
    textBoxes: [
      text("运行时引擎：实现零维护的实时聚合", 195.67, 45.38, 566.03, 30),
      text("config", 54.14, 124.38, 112.51, 57.63),
      text("配置", 54.14, 124.38, 112.51, 57.63),
      text("assets_docs", 53.98, 224.25, 112.83, 16.88),
      text("prototype", 54.14, 305.64, 112.51, 57.63),
      text("原型", 54.14, 305.64, 112.51, 57.63),
      text("Runtime", 296.76, 124.75, 141.94, 204.25),
      text("Catalog", 296.76, 124.75, 141.94, 204.25),
      text("引擎", 296.76, 124.75, 141.94, 204.25),
      text("门户Hub", 704.72, 129, 88.09, 23.63),
      text("system list", 600.89, 209.25, 56.98, 15.75),
      text("PRD1", 682.98, 231, 34.86, 13.88),
      text("系统A", 611.76, 235.13, 32.99, 15),
      text("配置即呈现：完全配置驱动", 55.85, 402, 509.05, 16.88)
    ]
  };
}

test("runtime engine hybrid models native flow and two minimum visual crops", () => {
  const model = createRuntimeEngineHybridModel(fixture(), { widthPt: 960, heightPt: 540 });

  assert.equal(model.matched, true);
  assert.equal(model.shapes.length, 8);
  assert.equal(model.shapes.filter((shape) => shape.source.detector.endsWith("input-arrow")).every((shape) => shape.type === "rightArrow"), true);
  assert.equal(model.cropRegions.length, 2);
  assert.deepEqual(model.cropRegions.map((region) => region.detector), [SCREENSHOT_DETECTOR, ICON_DETECTOR]);
  assert.equal(model.shapes.every((shape) => shape.source.detector.startsWith(DETECTOR_PREFIX)), true);
  assert.equal(new Set(model.shapes.map((shape) => shape.source.nativeComponentGroupId)).size, 5);
  assert.equal(model.shapes.every((shape) => shape.source.nativeComponentMinimumUnit === "semantic-component"), true);
});

test("runtime engine hybrid rejects incomplete semantics and extreme slide sizes", () => {
  const incomplete = fixture();
  incomplete.textBoxes = incomplete.textBoxes.filter((item) => item.text !== "门户Hub");

  assert.equal(createRuntimeEngineHybridModel(incomplete, { widthPt: 960, heightPt: 540 }).matched, false);
  assert.equal(createRuntimeEngineHybridModel(fixture(), { widthPt: Number.POSITIVE_INFINITY, heightPt: 540 }).matched, false);
  assert.equal(createRuntimeEngineHybridModel(fixture(), { widthPt: 1e9, heightPt: 540 }).matched, false);
});

test("runtime engine hybrid materializes one screenshot and one icon crop", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-engine-hybrid-"));
  const sourceImage = path.join(temp, "source.png");
  const assetDir = path.join(temp, "assets");
  const rgba = Buffer.alloc(1920 * 1080 * 4, 255);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    rgba[offset] = 36;
    rgba[offset + 1] = 120;
    rgba[offset + 2] = 206;
  }
  const iconCenterOffset = (((512 + 66) * 1920) + (676 + 64)) * 4;
  rgba[iconCenterOffset] = 255;
  rgba[iconCenterOffset + 1] = 255;
  rgba[iconCenterOffset + 2] = 255;
  writePng(sourceImage, { width: 1920, height: 1080, rgba });
  const model = createRuntimeEngineHybridModel(fixture(), { widthPt: 960, heightPt: 540 });

  const images = materializeRuntimeEngineHybridImages(model, {
    sourceImage,
    assetDir,
    irDir: temp,
    deckName: "runtime",
    pageIndex: 11,
    slideSize: { widthPt: 960, heightPt: 540 }
  });

  assert.equal(images.length, 2);
  assert.equal(images[0].source.intentionalMinimumUnitCrop, true);
  assert.equal(images[0].source.expressionForm, "screenshot");
  assert.equal(images[0].source.nativeComponentGroupId, "runtime-engine-component-portal");
  assert.equal(images[1].source.nativeComponentGroupId, "runtime-engine-component-engine");
  assert.equal(images[1].source.transparentBackground, true);
  const icon = readPng(path.resolve(temp, images[1].assetPath));
  assert.equal(icon.rgba[3], 0);
  assert.equal(icon.rgba[((66 * icon.width + 64) * 4) + 3], 255);
  assert.deepEqual(readPng(path.resolve(temp, images[0].assetPath)).width, 664);
  assert.equal(materializeRuntimeEngineHybridImages(model, { sourceImage: path.join(temp, "missing.png"), assetDir, irDir: temp }).length, 0);
});

test("runtime engine hybrid removes screenshot OCR and merges duplicated semantic labels", () => {
  const boxes = normalizeRuntimeEngineHybridTextBoxes(fixture().textBoxes, true);

  assert.equal(boxes.some((item) => item.text === "门户Hub"), false);
  assert.equal(boxes.some((item) => item.text === "PRD1"), false);
  assert.equal(boxes.some((item) => item.text === "Catalog"), false);
  assert.equal(boxes.some((item) => item.text === "引擎"), false);
  assert.equal(boxes.some((item) => item.text === "config\n配置"), true);
  assert.equal(boxes.some((item) => item.text === "Runtime\nCatalog\n引擎"), true);
  assert.equal(boxes.every((item) => item.source.detector === `${DETECTOR_PREFIX}text`), true);
  const grouped = boxes.filter((item) => item.source.nativeComponentInstance === true);
  assert.equal(grouped.length, 4);
  assert.equal(new Set(grouped.map((item) => item.source.nativeComponentGroupId)).size, 4);
  assert.equal(grouped.every((item) => item.style.nativeComponentGroupId === item.source.nativeComponentGroupId), true);
  const independent = boxes.filter((item) => !item.source.nativeComponentInstance);
  assert.equal(independent.length, 2);
  assert.equal(independent.every((item) => !item.style.nativeComponentGroupId), true);
  assert.equal(boxes.find((item) => item.text.startsWith("配置即呈现")).runs[0].font.weight, "bold");
});
