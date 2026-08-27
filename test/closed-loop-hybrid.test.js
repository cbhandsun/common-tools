"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveAssetOsClosedLoopLayout } = require("../skills/pd-hifi-slideclone/scripts/lib/closed-loop-hybrid");

test("closed-loop hybrid layout calibrates nodes and minimum pictorial regions", () => {
  const layout = resolveAssetOsClosedLoopLayout({ x: 105, y: 120, w: 569, h: 383 });

  assert.equal(Math.round(layout.nodes.demand.x), 354);
  assert.equal(Math.round(layout.nodes.prd.x), 607);
  assert.equal(Math.round(layout.nodes.prototype.y), 433);
  assert.equal(Math.round(layout.center.x), 480);
  assert.deepEqual([layout.ring.x, layout.ring.y, layout.ring.w, layout.ring.h].map(Math.round), [300, 130, 358, 362]);
  assert.equal(layout.pictorialRegions.length, 9);
  assert.equal(layout.pictorialRegions.every((region) => region.box.w > 0 && region.box.h > 0), true);
  assert.equal(layout.pictorialRegions.filter((region) => region.includesFrame).length, 4);
  assert.equal(layout.inputCrop.w * layout.inputCrop.h < 0.06 * 960 * 540, true);
});

test("closed-loop hybrid layout coerces invalid external geometry safely", () => {
  const layout = resolveAssetOsClosedLoopLayout({ x: "bad", y: null, w: -20, h: Infinity });

  assert.equal(Number.isFinite(layout.center.x), true);
  assert.equal(Number.isFinite(layout.center.y), true);
  assert.equal(layout.w, 1);
  assert.equal(layout.h, 1);
  assert.equal(layout.pictorialRegions.length, 9);
});
