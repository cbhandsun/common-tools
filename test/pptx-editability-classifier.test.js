"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyDeckFromSlides,
  classifySlideXml
} = require("../skills/pd-hifi-slideclone/scripts/lib/pptx-editability-classifier");

function slideXml({ shapes = 0, pictures = 0, textRuns = 0, groups = 0 } = {}) {
  return [
    "<p:sld><p:cSld><p:spTree>",
    "<p:sp><p:nvSpPr/></p:sp>".repeat(shapes),
    "<p:pic><p:nvPicPr/></p:pic>".repeat(pictures),
    "<p:grpSp><p:nvGrpSpPr/></p:grpSp>".repeat(groups),
    "<a:t>text</a:t>".repeat(textRuns),
    "</p:spTree></p:cSld></p:sld>"
  ].join("");
}

test("classifies native, image-only, mixed, and blank slide XML", () => {
  assert.equal(classifySlideXml(slideXml({ shapes: 6, textRuns: 8 })).classification, "native-rich");
  assert.equal(classifySlideXml(slideXml({ pictures: 1 })).classification, "image-only");
  assert.equal(classifySlideXml(slideXml({ shapes: 2, pictures: 1, textRuns: 1 })).classification, "mixed");
  assert.equal(classifySlideXml(slideXml()).classification, "blank");
});

test("routes only uniformly native decks to lossless passthrough", () => {
  const native = classifySlideXml(slideXml({ shapes: 4, textRuns: 4 }), 0);
  const image = classifySlideXml(slideXml({ pictures: 1 }), 1);
  const blank = classifySlideXml(slideXml(), 2);

  assert.equal(classifyDeckFromSlides([native, native, blank]).route, "native-passthrough");
  assert.equal(classifyDeckFromSlides([image, image, blank]).route, "raster-rebuild");
  assert.equal(classifyDeckFromSlides([native, image]).route, "mixed-rebuild");
});

test("does not classify picture-heavy slides with native text as image-only", () => {
  const slide = classifySlideXml(slideXml({ pictures: 2, shapes: 3, textRuns: 5 }));
  assert.equal(slide.classification, "native-rich");
});
