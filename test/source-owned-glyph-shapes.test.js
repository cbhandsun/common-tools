"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { pruneSourceOwnedGlyphShapes } = require("../packages/slideclone-core/typography/source-owned-glyph-shapes");
const { textProbeRevision } = require("../packages/slideclone-core/owned-text-advance");

const slideSize = { widthPt: 960, heightPt: 720 };
const blue = "#0562EF";

function image(width = 1920, height = 1440) {
  const rgba = Buffer.alloc(width * height * 4, 255);
  return { width, height, rgba };
}

function rgb(hex) {
  return [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

function fillPt(target, box, color) {
  const [r, g, b] = rgb(color), sx = target.width / slideSize.widthPt, sy = target.height / slideSize.heightPt;
  const left = Math.max(0, Math.floor(box.x * sx)), top = Math.max(0, Math.floor(box.y * sy));
  const right = Math.min(target.width, Math.ceil((box.x + box.w) * sx));
  const bottom = Math.min(target.height, Math.ceil((box.y + box.h) * sy));
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    const offset = (y * target.width + x) * 4;
    target.rgba[offset] = r; target.rgba[offset + 1] = g; target.rgba[offset + 2] = b; target.rgba[offset + 3] = 255;
  }
}

function shape(id, box, color = blue, source = {}) {
  return { id, type: "roundRect", box, style: { fill: color, stroke: color, strokeWidthPt: 0, radiusRatio: 0.08 },
    source: { editable: true, nativeRebuild: true, detector: "visual-atom-native-rect",
      atomKind: "native-rect-candidate", containerAtomId: null, topologyRole: null, containedAtomIds: [], ...source } };
}

function fixture({ sourceWidth = 960, sourceHeight = 720, renderWidth = 1921, renderHeight = 1440 } = {}) {
  const sourceImage = image(sourceWidth, sourceHeight);
  const text = {
    id: "p0-ocr-034", role: "body", text: "升级终点：感知→决策→行动→反馈",
    box: { x: 283.75, y: 653.3333333333, w: 392.0833333333, h: 22.5 },
    font: { family: "Microsoft YaHei", sizePt: 16.2, color: "#135CE6", opacity: 1,
      align: "left", valign: "middle", weight: "bold" },
    style: { visibility: "visible", opacity: 1, wrap: false },
    source: { ocrProvider: "team-pinned-ocr", confidence: 0.94936203956604,
      evidenceBox: { x: 283.75, y: 653.3333333333, w: 392.0833333333, h: 22.5 }, editable: true }
  };
  const target = shape("native-graphic-visual-atom-rect-11",
    { x: 474.9417, y: 652.6501, w: 9.2833, h: 9.2833 });
  fillPt(sourceImage, { x: 476.25, y: 652.9167, w: 22.0833, h: 23.75 }, blue);
  const renderProfile = { rendererId: "render-libreoffice", version: "LibreOffice test", dpi: 144,
    pixelWidth: renderWidth, pixelHeight: renderHeight,
    runtimeHash: "a".repeat(64), sourceHash: "b".repeat(64) };
  const measurement = { id: text.id, source: { x: 284.1666666667, y: 652.5, w: 391.6666666667, h: 24.5833333333 },
    rendered: { x: 283.8521603332, y: 657.5, w: 258.3654346694, h: 15.5 },
    textRevision: textProbeRevision(text), sourceComplete: true, renderedComplete: true,
    renderedOwnership: "isolated", renderProfile: { ...renderProfile } };
  return { page: { shapes: [target, { id: "ordinary", type: "line" }], textBoxes: [text] }, slideSize,
    sourceImage, sourceHash: renderProfile.sourceHash, measurements: [measurement], renderProfile };
}

test("removes a source-owned glyph fragment and binds rollback metadata to its owner revision", () => {
  const input = fixture({ sourceWidth: 2304, sourceHeight: 1728, renderWidth: 1921, renderHeight: 1440 });
  const beforePage = structuredClone(input.page), beforeMeasurements = structuredClone(input.measurements);
  const beforePixels = Buffer.from(input.sourceImage.rgba);
  const result = pruneSourceOwnedGlyphShapes(input);
  assert.deepEqual(result.shapes.map(item => item.id), ["ordinary"]);
  assert.deepEqual(result.removedShapeIds, ["native-graphic-visual-atom-rect-11"]);
  assert.deepEqual(result.removedShapes, [{ id: "native-graphic-visual-atom-rect-11", textId: "p0-ocr-034",
    textRevision: input.measurements[0].textRevision }]);
  assert.deepEqual(input.page, beforePage);
  assert.deepEqual(input.measurements, beforeMeasurements);
  assert.deepEqual(input.sourceImage.rgba, beforePixels);
});

test("preserves same-color inline squares, different-color icons and adjacent disconnected components", () => {
  const input = fixture();
  input.page.shapes = [
    shape("same-color-inline", { x: 620, y: 657, w: 8, h: 8 }),
    shape("different-color-inline", { x: 640, y: 657, w: 8, h: 8 }, "#D6456B"),
    shape("adjacent-disconnected", { x: 500, y: 657, w: 8, h: 8 })
  ];
  fillPt(input.sourceImage, input.page.shapes[0].box, blue);
  fillPt(input.sourceImage, input.page.shapes[1].box, "#D6456B");
  fillPt(input.sourceImage, input.page.shapes[2].box, blue);
  const result = pruneSourceOwnedGlyphShapes(input);
  assert.deepEqual(result.shapes, input.page.shapes);
  assert.deepEqual(result.removedShapeIds, []);
  assert.deepEqual(result.removedShapes, []);
});

test("preserves component-group, pictorial and topology-owned rectangles", () => {
  const input = fixture(), box = input.page.shapes[0].box;
  input.page.shapes = [
    shape("grouped", box, blue, { nativeComponentGroupId: "component-1" }),
    shape("pictorial", box, blue, { semanticPictorialNative: true, nativeComponentRole: "pictorial" }),
    shape("topology", box, blue, { topologyRole: "node" })
  ];
  const result = pruneSourceOwnedGlyphShapes(input);
  assert.deepEqual(result.shapes, input.page.shapes);
  assert.deepEqual(result.removedShapes, []);
});

test("preserves shapes without a raster or without high-trust OCR source ownership", () => {
  const noSource = fixture(); noSource.sourceImage = null;
  assert.deepEqual(pruneSourceOwnedGlyphShapes(noSource).removedShapes, []);
  for (const mutate of [
    input => { input.page.textBoxes[0].source.confidence = 0.899; },
    input => { delete input.page.textBoxes[0].source.evidenceBox; },
    input => { input.page.textBoxes[0].source.ocrProvider = ""; }
  ]) {
    const input = fixture(); mutate(input);
    assert.deepEqual(pruneSourceOwnedGlyphShapes(input).removedShapes, []);
  }
});

test("preserves stale, incomplete, composite and valid cross-profile measurements", () => {
  for (const mutate of [
    input => { input.measurements[0].textRevision = "0".repeat(64); },
    input => { input.measurements[0].sourceComplete = false; },
    input => { input.measurements[0].renderedComplete = false; },
    input => { input.measurements[0].renderedOwnership = "composite"; },
    input => { input.measurements[0].renderProfile.version = "different version"; },
    input => { input.measurements[0].renderProfile.pixelWidth -= 1; },
    input => { input.sourceHash = "c".repeat(64); }
  ]) {
    const input = fixture(); mutate(input);
    assert.deepEqual(pruneSourceOwnedGlyphShapes(input).removedShapes, []);
  }
});

test("requires exactly one source owner", () => {
  const input = fixture(), duplicate = structuredClone(input.page.textBoxes[0]);
  duplicate.id = "second-owner";
  input.page.textBoxes.push(duplicate);
  input.measurements.push({ ...structuredClone(input.measurements[0]), id: duplicate.id,
    textRevision: textProbeRevision(duplicate) });
  const result = pruneSourceOwnedGlyphShapes(input);
  assert.deepEqual(result.shapes, input.page.shapes);
  assert.deepEqual(result.removedShapes, []);
});

test("empty pages are deterministic no-ops", () => {
  assert.deepEqual(pruneSourceOwnedGlyphShapes({ page: { shapes: [], textBoxes: [] }, slideSize,
    sourceImage: null, measurements: [] }), { shapes: [], removedShapeIds: [], removedShapes: [] });
});

test("rejects malformed and ambiguous boundary input", () => {
  assert.throws(() => pruneSourceOwnedGlyphShapes(null), /request is invalid/u);
  assert.throws(() => pruneSourceOwnedGlyphShapes({ page: {}, slideSize, sourceImage: null, measurements: [] }), /shapes are invalid/u);
  const badRaster = fixture(); badRaster.sourceImage.rgba = new Uint8Array(4);
  assert.throws(() => pruneSourceOwnedGlyphShapes(badRaster), /raster is invalid/u);
  const duplicateShape = fixture(); duplicateShape.page.shapes.push({ ...duplicateShape.page.shapes[0] });
  assert.throws(() => pruneSourceOwnedGlyphShapes(duplicateShape), /shape ids are ambiguous/u);
  const duplicateText = fixture(); duplicateText.page.textBoxes.push({ ...duplicateText.page.textBoxes[0] });
  assert.throws(() => pruneSourceOwnedGlyphShapes(duplicateText), /text box ids are ambiguous/u);
  const duplicateMeasurement = fixture(); duplicateMeasurement.measurements.push({ ...duplicateMeasurement.measurements[0] });
  assert.throws(() => pruneSourceOwnedGlyphShapes(duplicateMeasurement), /measurement ids are ambiguous/u);
  const invalidProfile = fixture(); invalidProfile.measurements[0].renderProfile.runtimeHash = "unsafe";
  assert.throws(() => pruneSourceOwnedGlyphShapes(invalidProfile), /profile is invalid/u);
  const invalidHash = fixture(); invalidHash.sourceHash = "unsafe";
  assert.throws(() => pruneSourceOwnedGlyphShapes(invalidHash), /source hash is invalid/u);
  const controlId = fixture(); controlId.page.shapes[0].id = "unsafe\u0000id";
  assert.throws(() => pruneSourceOwnedGlyphShapes(controlId), /shape id is invalid/u);
  const controlVersion = fixture(); controlVersion.renderProfile.version = "unsafe\u007fversion";
  assert.throws(() => pruneSourceOwnedGlyphShapes(controlVersion), /profile is invalid/u);
  const invalidCandidate = fixture(); invalidCandidate.page.shapes[0].box.w = Infinity;
  assert.throws(() => pruneSourceOwnedGlyphShapes(invalidCandidate), /candidate bounds are invalid/u);
});

test("rejects excessive collections, sampling and revision payloads", () => {
  const tooMany = fixture(); tooMany.page.shapes = Array.from({ length: 10_001 }, (_, index) => ({ id: `shape-${index}` }));
  assert.throws(() => pruneSourceOwnedGlyphShapes(tooMany), /shapes are invalid/u);
  const excessiveSamples = fixture({ sourceWidth: 1920, sourceHeight: 1440 });
  excessiveSamples.page.textBoxes[0].source.evidenceBox = { x: 0, y: 0, w: 960, h: 720 };
  excessiveSamples.measurements[0].source = { x: 0, y: 0, w: 960, h: 720 };
  excessiveSamples.measurements[0].textRevision = textProbeRevision(excessiveSamples.page.textBoxes[0]);
  assert.throws(() => pruneSourceOwnedGlyphShapes(excessiveSamples), /sampling exceeds/u);
  const oversizedRevision = fixture();
  oversizedRevision.page.textBoxes[0].source.payload = "x".repeat(131_072);
  assert.throws(() => pruneSourceOwnedGlyphShapes(oversizedRevision), /revision exceeds/u);
});
