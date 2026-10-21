"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { colorPanelOwnsText, hasSourceTextGeometry } = require("../packages/slideclone-core/color-panel-text-ownership");

const box = { x: 50, y: 80, w: 70, h: 14 };

test("color panel owns fully contained text without claiming a neighboring label", () => {
  assert.equal(colorPanelOwnsText({ box }, { x: 40, y: 70, w: 90, h: 40 }), true);
  assert.equal(colorPanelOwnsText({ box }, { x: 20, y: 100, w: 90, h: 40 }), false);
  assert.equal(colorPanelOwnsText({ box }, { x: 100, y: 70, w: 90, h: 40 }), false);
  assert.equal(colorPanelOwnsText({ box }, { x: 40, y: 80, w: 70, h: 14 }), false);
});

test("color panel tolerates rounding at the perimeter but not clipped labels", () => {
  assert.equal(colorPanelOwnsText({ box }, { ...box, x: box.x + 0.5, w: box.w - 1 }), true);
  assert.equal(colorPanelOwnsText({ box }, { ...box, y: box.y + 7, h: 7 }), false);
});

test("source text geometry requires valid current and source boxes", () => {
  assert.equal(hasSourceTextGeometry({ box, source: { evidenceBox: box } }), true);
  assert.equal(hasSourceTextGeometry({ box, source: {} }), false);
  assert.equal(hasSourceTextGeometry({ source: { evidenceBox: box } }), false);
  assert.equal(hasSourceTextGeometry({ box, source: { evidenceBox: { ...box, h: NaN } } }), false);
});

test("color panel ownership fails closed on empty, unsafe and extreme geometry", () => {
  for (const value of [null, undefined, [], {}, { ...box, x: -1 }, { ...box, w: Infinity },
    { ...box, h: 0 }, { ...box, x: "50" }, { ...box, w: 100001 }]) {
    assert.equal(colorPanelOwnsText({ box: value }, box), false);
    assert.equal(colorPanelOwnsText({ box }, value), false);
    assert.equal(hasSourceTextGeometry({ box, source: { evidenceBox: value } }), false);
  }
  let accessed = false;
  const unsafe = { get box() { accessed = true; throw new Error("not data"); } };
  assert.equal(colorPanelOwnsText(unsafe, box), false);
  assert.equal(hasSourceTextGeometry(unsafe), false);
  assert.equal(colorPanelOwnsText(new Proxy({}, { get() { throw new Error("not data"); } }), box), false);
  assert.equal(accessed, false);
});
