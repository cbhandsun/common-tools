"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { createHierarchyDiagramToolkit } = require("../skills/pd-hifi-slideclone/scripts/lib/hierarchy-diagram");

test("hierarchy diagram plugin fails closed for malformed and extreme candidates", () => {
  const toolkit = createHierarchyDiagramToolkit(operations());
  assert.equal(toolkit.shouldObjectify(null), false);
  assert.equal(toolkit.shouldObjectify({
    box: { x: 0, y: 0, w: Number.MAX_VALUE, h: 1 },
    source: { detector: "sparse-diagram-graphic-underlay-crop", layer: { layerType: "diagram-zone" } }
  }), false);
  assert.deepEqual(toolkit.createShapes(null, null, {}), []);
  assert.equal(toolkit.infer({ box: { x: 0, y: 0, w: 400, h: 260 } }, [{ text: "only one", box: { x: 10, y: 10, w: 20, h: 10 } }]), null);
});

test("hierarchy diagram plugin validates every injected geometry operation", () => {
  const valid = operations();
  for (const name of ["boxCenterInside", "clamp", "expandPtBox", "round", "roundedBox", "unionPtBox"]) {
    assert.throws(() => createHierarchyDiagramToolkit({ ...valid, [name]: null }), new RegExp(`operation ${name}`));
  }
  assert.throws(() => createHierarchyDiagramToolkit({ ...valid, defaultSlide: { widthPt: 0, heightPt: 540 } }), /defaultSlide/);
});

test("native rebuild compatibility entry delegates hierarchy behavior to the registry plugin", () => {
  const source = fs.readFileSync(path.join(
    __dirname, "..", "skills", "pd-hifi-slideclone", "scripts", "rebuild-real-pptx-native.js"
  ), "utf8");
  assert.match(source, /createNativeRebuilder\("hierarchy-diagram"/);
  assert.match(source, /return createHierarchyDiagramShapesFromRegistry\(images, textBoxes, sourceImage, slideSize\)/);
  assert.doesNotMatch(source, /createHierarchyDiagramShapesLegacy|inferThreeColumnHierarchyDiagram|shouldObjectifyHierarchyDiagram/);
});

function operations() {
  return {
    boxCenterInside(inner, outer) {
      const x = Number(inner?.x || 0) + Number(inner?.w || 0) / 2;
      const y = Number(inner?.y || 0) + Number(inner?.h || 0) / 2;
      return x >= outer.x && x <= outer.x + outer.w && y >= outer.y && y <= outer.y + outer.h;
    },
    clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)),
    defaultSlide: { widthPt: 960, heightPt: 540 },
    expandPtBox: (box) => ({ ...box }),
    round: (value) => Math.round(value * 1000) / 1000,
    roundedBox: (box) => ({ ...box }),
    unionPtBox: (left, right) => ({
      x: Math.min(left.x, right.x),
      y: Math.min(left.y, right.y),
      w: Math.max(left.x + left.w, right.x + right.w) - Math.min(left.x, right.x),
      h: Math.max(left.y + left.h, right.y + right.h) - Math.min(left.y, right.y)
    })
  };
}
