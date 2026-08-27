"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  mergeTemplateStyle,
  nativeTypeForTemplateStyle,
  sanitizeTemplateFreeform,
  sanitizeTemplatePicture
} = require("../skills/pd-hifi-slideclone/scripts/lib/component-template-style");

test("component template style preserves bounded editable effects", () => {
  const style = mergeTemplateStyle({
    shapeType: "roundRect",
    fill: "#123456",
    strokeWidthPt: 99,
    opacity: 0.5,
    gradient: { type: "linear", stops: [{ position: 1, color: "#FFFFFF" }, { position: 0, color: "#000000" }] },
    text: { placeholderText: "Title", fontSizePt: 200, align: "left" }
  }, { stroke: "#000000" });
  assert.equal(style.fill, "#123456");
  assert.equal(style.strokeWidthPt, 12);
  assert.equal(style.radiusRatio, 0.18);
  assert.equal(style.text.fontSizePt, 96);
  assert.equal(style.gradient.stops[0].position, 0);
});

test("component template style sanitizes picture paths and freeform bounds", () => {
  assert.equal(sanitizeTemplatePicture({ mediaTarget: "../secret.png" }), null);
  assert.deepEqual(sanitizeTemplatePicture({ embedRelId: "rId5", mediaTarget: "ppt/media/image1.png", crop: { left: 2 } }), {
    embedRelId: "rId5", mediaTarget: "ppt/media/image1.png", crop: { left: 1 }
  });
  const freeform = sanitizeTemplateFreeform({ points: [{ x: -99, y: 99 }, { x: 0, y: 0 }, { x: 1, y: 1 }] });
  assert.deepEqual(freeform.points[0], { x: -2, y: 3 });
  assert.equal(nativeTypeForTemplateStyle({ freeform }), "freeform");
});

test("component template style fails closed for malformed and unsafe inputs", () => {
  assert.equal(nativeTypeForTemplateStyle({ shapeType: "<script>" }, "../../bad"), "rect");
  assert.deepEqual(mergeTemplateStyle(null, null), {});
  assert.equal(sanitizeTemplateFreeform({ points: [{ x: 0, y: 0 }] }), null);
});
