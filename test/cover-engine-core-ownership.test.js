"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  detectCoverCardBox,
  filterTextBoxesClaimedByCoverEngineCore
} = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");

const native = {
  id: "native-prototype",
  text: "原型",
  box: { x: 100, y: 100, w: 60, h: 24 },
  source: { detector: "cover-engine-core-native-label" }
};

test("cover engine core ownership removes only overlapping duplicate OCR", () => {
  const duplicate = { id: "ocr-duplicate", text: "原型", box: { x: 102, y: 101, w: 58, h: 23 }, source: {} };
  const distant = { id: "ocr-distant", text: "原型", box: { x: 300, y: 100, w: 60, h: 24 }, source: {} };
  const different = { id: "ocr-different", text: "说明", box: { x: 102, y: 101, w: 58, h: 23 }, source: {} };
  assert.deepEqual(
    filterTextBoxesClaimedByCoverEngineCore([duplicate, distant, different, native], true).map((item) => item.id),
    ["ocr-distant", "ocr-different", "native-prototype"]
  );
});

test("cover engine core ownership is inert when the semantic owner is inactive", () => {
  const duplicate = { id: "ocr-duplicate", text: "原型", box: { x: 102, y: 101, w: 58, h: 23 }, source: {} };
  assert.deepEqual(filterTextBoxesClaimedByCoverEngineCore([duplicate, native], false), [duplicate, native]);
});

test("cover engine core measures a blue card border around OCR evidence", () => {
  const width = 400;
  const height = 300;
  const rgba = Buffer.alloc(width * height * 4, 255);
  const blue = [35, 117, 200, 255];
  for (let y = 70; y <= 230; y += 1) {
    for (let x = 90; x <= 250; x += 1) {
      if (x > 94 && x < 246 && y > 74 && y < 226) continue;
      const offset = (y * width + x) * 4;
      rgba.set(blue, offset);
    }
  }
  const detected = detectCoverCardBox(
    { width, height, rgba },
    { widthPt: 400, heightPt: 300 },
    { x: 145, y: 130, w: 45, h: 24 },
    { x: 40, y: 30, w: 320, h: 250 }
  );
  assert.deepEqual(detected, { x: 90, y: 70, w: 161, h: 161 });
});

test("cover engine core rejects incomplete border evidence", () => {
  const width = 200;
  const height = 160;
  const rgba = Buffer.alloc(width * height * 4, 255);
  assert.equal(detectCoverCardBox(
    { width, height, rgba },
    { widthPt: 200, heightPt: 160 },
    { x: 80, y: 70, w: 20, h: 15 },
    { x: 20, y: 20, w: 160, h: 120 }
  ), null);
});
