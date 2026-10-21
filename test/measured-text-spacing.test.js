"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { planMeasuredSingleLineTextSpacing } = require("../packages/slideclone-core/measured-text-fit");

function fixture(heightRatio = 1.2) {
  const text = { id: "label", text: "Editable plain text", box: { x: 100, y: 100, w: 160, h: 24 },
    font: { family: "Arial", sizePt: 16, weight: "regular", align: "left", valign: "middle" },
    style: { visibility: "visible", wrap: false }, source: { editable: true, confidence: 0.96, ocrProvider: "test" } };
  return { slideSize: { widthPt: 960, heightPt: 540 }, textBoxes: [text], measurements: [
    { id: "label", source: { x: 101, y: 102, w: 144, h: 16 * heightRatio }, rendered: { x: 100, y: 100, w: 144, h: 16 } }
  ] };
}

test("native spacing separates glyph-height correction from frame width without changing text", () => {
  for (const heightRatio of [1.2, 0.8]) {
    const request = fixture(heightRatio), before = structuredClone(request);
    const result = planMeasuredSingleLineTextSpacing(request), fitted = result.textBoxes[0];
    assert.equal(result.changes.length, 1);
    assert.equal(fitted.text, request.textBoxes[0].text);
    assert.equal(fitted.font.sizePt, 16 * heightRatio);
    assert.equal(fitted.box.w, 160);
    assert.equal(Math.sign(fitted.font.characterSpacingPt), heightRatio > 1 ? -1 : 1);
    const predictedWidth = 144 * heightRatio + fitted.font.characterSpacingPt * (fitted.text.length - 1);
    assert.ok(Math.abs(predictedWidth - 144) <= 0.1);
    assert.deepEqual(request, before);
  }
});

test("native spacing refuses autofit, runs, segmented, rotated, low-confidence and non-OCR text", () => {
  for (const change of [
    { style: { visibility: "visible", wrap: false, fit: "shrink" } },
    { style: { visibility: "visible", wrap: false, fit: "SHRINK" } }, { wrap: true },
    { runs: [] }, { rotation: 1 }, { text: "A" }, { text: "emoji \u{1F600}" }, { text: "combining e\u0301" },
    { source: { editable: true, confidence: 0.89, ocrProvider: "test" } },
    { source: { editable: true, confidence: 0.99 } },
    { source: { editable: true, confidence: 0.99, ocrProvider: "test", segmentedOcrLineId: "group" } }
  ]) {
    const request = fixture(); Object.assign(request.textBoxes[0], change);
    const result = planMeasuredSingleLineTextSpacing(request);
    assert.equal(result.changes.length, 0);
    assert.equal(result.textBoxes[0], request.textBoxes[0]);
  }
});

test("native spacing has independent small-change, displacement, width, and spacing bounds", () => {
  for (const mode of ["matched", "width", "height", "spacing", "translation", "edge", "nonfinite"]) {
    const request = fixture();
    if (mode === "matched") request.measurements[0].source.h = 16;
    if (mode === "width") request.measurements[0].source.w = 180;
    if (mode === "height") request.measurements[0].source.h = 24;
    if (mode === "spacing") request.textBoxes[0].text = "few";
    if (mode === "translation") request.measurements[0].source.x += 20;
    if (mode === "edge") { request.textBoxes[0].box.x = 0; request.measurements[0].source.x = 0; }
    if (mode === "nonfinite") request.textBoxes[0].font.characterSpacingPt = Infinity;
    const result = planMeasuredSingleLineTextSpacing(request);
    assert.equal(result.changes.length, 0, mode);
  }
});

test("native spacing preserves centered and right-aligned advance anchors", () => {
  for (const align of ["center", "right"]) {
    const request = fixture(); request.textBoxes[0].font.align = align;
    // Align the source/render bounds around their frame anchors.
    const anchor = align === "center" ? 180 : 260;
    const left = align === "center" ? anchor - 72 : anchor - 144;
    request.measurements[0].source.x = left;
    request.measurements[0].rendered.x = left;
    const result = planMeasuredSingleLineTextSpacing(request);
    assert.equal(result.changes.length, 1);
    assert.ok(Math.abs(result.textBoxes[0].box.x - 100) < 1e-9);
  }
});

test("native spacing validates malformed, empty, ambiguous and extreme evidence before planning", () => {
  assert.throws(() => planMeasuredSingleLineTextSpacing(null), /request/);
  const request = fixture();
  assert.throws(() => planMeasuredSingleLineTextSpacing({ ...request, candidateLimit: 0 }), /limit/);
  assert.throws(() => planMeasuredSingleLineTextSpacing({ ...request, textBoxes: Array(2001).fill(request.textBoxes[0]) }), /text boxes/);
  assert.throws(() => planMeasuredSingleLineTextSpacing({ ...request, measurements: [...request.measurements, ...request.measurements] }), /ambiguous/);
  assert.equal(planMeasuredSingleLineTextSpacing({ ...request, textBoxes: [], measurements: [] }).changes.length, 0);
  assert.equal(planMeasuredSingleLineTextSpacing({ ...request, targetIds: ["other"] }).changes.length, 0);
});
