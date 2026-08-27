"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createVisualFeatureContext } = require("../skills/pd-hifi-slideclone/scripts/lib/visual-feature-context");

test("visual feature context caches identical page-region analysis", () => {
  let calls = 0;
  const context = createVisualFeatureContext({
    sourceImage: { width: 100, height: 80 },
    slideSize: { widthPt: 100, heightPt: 80 },
    extractVisualAtoms: () => { calls += 1; return [{ kind: "node" }]; }
  });
  const box = { x: 1, y: 2, w: 30, h: 40 };
  const options = { semanticHint: "private user text", enableDenseLinkedNodes: true };
  assert.strictEqual(context.getVisualAtoms(box, options), context.getVisualAtoms({ ...box }, { ...options }));
  assert.equal(calls, 1);
  assert.deepEqual(context.stats(), { hits: 1, misses: 1, entries: 1, maximumEntries: 512 });
});

test("visual feature context separates semantic and mask inputs and bounds its cache", () => {
  let calls = 0;
  const context = createVisualFeatureContext({
    sourceImage: { width: 10, height: 10 },
    slideSize: { widthPt: 10, heightPt: 10 },
    maximumEntries: 1,
    extractVisualAtoms: () => { calls += 1; return []; }
  });
  context.getVisualAtoms({ x: 0, y: 0, w: 5, h: 5 }, { semanticHint: "first" });
  context.getVisualAtoms({ x: 0, y: 0, w: 5, h: 5 }, { semanticHint: "second" });
  assert.equal(calls, 2);
  assert.equal(context.stats().entries, 1);
  assert.deepEqual(context.getVisualAtoms({ x: 0, y: 0, w: -1, h: 5 }), []);
});

test("visual feature context rejects invalid external boundaries", () => {
  const valid = { sourceImage: { width: 1, height: 1 }, slideSize: { widthPt: 1, heightPt: 1 }, extractVisualAtoms: () => [] };
  assert.doesNotThrow(() => createVisualFeatureContext(valid));
  assert.throws(() => createVisualFeatureContext({ ...valid, sourceImage: { width: 0, height: 1 } }), /sourceImage/);
  assert.throws(() => createVisualFeatureContext({ ...valid, slideSize: {} }), /slideSize/);
  assert.throws(() => createVisualFeatureContext({ ...valid, extractVisualAtoms: null }), /extractVisualAtoms/);
});
