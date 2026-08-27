"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const visionEditableOverlay = require("../skills/pd-hifi-slideclone/scripts/adapters/vision-editable-overlay");

test("editable overlay hides OCR text by default to avoid visual double-rendering", async () => {
  const result = await visionEditableOverlay({
    pageIndex: 0,
    page: { widthPx: 960, heightPx: 540 },
    slideSize: { widthPt: 960, heightPt: 540 },
    ocr: {
      lines: [{
        text: "PM Portal Skills 引擎",
        box: { x: 10, y: 20, w: 300, h: 40 },
        confidence: 0.99
      }]
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.textBoxes.length, 1);
  assert.equal(result.data.textBoxes[0].font.opacity, 0);
  assert.equal(result.data.textBoxes[0].style.visibility, "hidden");
  assert.equal(result.data.textBoxes[0].source.editable, true);
});

test("editable overlay can show OCR text for debugging", async () => {
  const result = await visionEditableOverlay({
    pageIndex: 0,
    textOverlayVisibility: "visible",
    page: { widthPx: 960, heightPx: 540 },
    slideSize: { widthPt: 960, heightPt: 540 },
    ocr: {
      lines: [{
        text: "debug text",
        box: { x: 10, y: 20, w: 120, h: 24 }
      }]
    }
  });

  assert.equal(result.data.textBoxes[0].font.opacity, 1);
  assert.equal(result.data.textBoxes[0].style.visibility, "visible");
});
