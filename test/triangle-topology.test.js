"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { createTriangleTopologyToolkit } = require("../skills/pd-hifi-slideclone/scripts/lib/triangle-topology");

test("triangle topology plugin creates editable geometry and records residual ownership", () => {
  const toolkit = createTriangleTopologyToolkit(operations());
  const image = candidate({
    pageText: "铁三角 原型 PRD 评审 基线 可视化 文档",
    nonEditableReason: "source crop"
  });
  const shapes = toolkit.createShapes([image], [], { width: 1, height: 1 }, { widthPt: 960, heightPt: 540 });

  assert.equal(shapes.length, 7);
  assert.deepEqual(shapes.map((shape) => shape.type), ["line", "line", "line", "freeform", "freeform", "freeform", "ellipse"]);
  assert.ok(shapes.every((shape) => shape.source.editable === true && shape.source.nativeComponentArchetype === "triangle-topology"));
  assert.equal(image.source.triangleTopologyObjectified, true);
  assert.equal(image.source.objectifiedTriangleTopologyEdges, 3);
  assert.equal(image.source.preservedTriangleTopologyNodeCrops, 3);
  assert.match(image.source.nonEditableReason, /^source crop;/);
});

test("triangle topology plugin fails closed for empty, malformed, and extreme candidates", () => {
  const toolkit = createTriangleTopologyToolkit(operations());
  assert.deepEqual(toolkit.createShapes(null, null, null), []);
  assert.equal(toolkit.shouldObjectify(null), false);
  assert.equal(toolkit.shouldObjectify(candidate({}, { w: 299 })), false);
  assert.equal(toolkit.shouldObjectify(candidate({}, { w: Number.MAX_VALUE, h: 1 })), false);
  assert.equal(toolkit.shouldObjectify(candidate({}, { w: Number.MAX_VALUE, h: Number.MAX_VALUE })), false);
  assert.equal(toolkit.infer({ x: 0, y: 0, w: 0, h: 300 }), null);
  assert.equal(toolkit.infer({ x: 0, y: 0, w: Number.MAX_VALUE, h: Number.MAX_VALUE }), null);

  const inferred = toolkit.infer({ x: 100, y: 40, w: 420, h: 360 }, {
    arrows: [{ from: null, to: null }, {}, {}],
    center: { x: 0, y: 0, w: -1, h: 2 }
  });
  assert.equal(inferred.arrows.length, 3);
  assert.ok(inferred.arrows.flatMap((arrow) => arrow.points).every((point) => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1));
  assert.ok(inferred.center.w > 0);
});

test("triangle topology plugin coerces invalid adapter results and slide sizes safely", () => {
  const observedSlideSizes = [];
  const toolkit = createTriangleTopologyToolkit({
    ...operations(),
    measurePrimitives(_source, _box, slideSize) {
      observedSlideSizes.push(slideSize);
      return null;
    },
    nativeTextBoxes: () => ({ unexpected: true })
  });
  const image = candidate({ pageText: "铁三角 原型 PRD 评审 基线 可视化" });
  const shapes = toolkit.createShapes([image], [], {}, { widthPt: Number.MAX_VALUE, heightPt: -1 });
  assert.equal(shapes.length, 7);
  assert.deepEqual(observedSlideSizes, [{ widthPt: 960, heightPt: 540 }]);
  assert.deepEqual(image.source.triangleTopologyNativeTextBoxes, []);
});

test("triangle topology plugin validates injected boundaries and propagates service failure", () => {
  const valid = operations();
  for (const name of ["boxCenterInside", "componentMetadata", "expandPtBox", "measurePrimitives", "nativeTextBoxes", "normalizeText", "round", "sampleArrowFill"]) {
    assert.throws(() => createTriangleTopologyToolkit({ ...valid, [name]: null }), new RegExp(`operation ${name}`));
  }
  assert.throws(() => createTriangleTopologyToolkit({ ...valid, defaultSlide: { widthPt: 960, heightPt: 0 } }), /defaultSlide/);

  const failure = new Error("measurement unavailable");
  const toolkit = createTriangleTopologyToolkit({ ...valid, measurePrimitives: () => { throw failure; } });
  assert.throws(() => toolkit.createShapes([candidate({ pageText: "铁三角 原型 PRD 评审 基线 可视化" })], [], {}), (error) => error === failure);
});

test("native rebuild compatibility entry delegates triangle topology behavior to the registry plugin", () => {
  const source = fs.readFileSync(path.join(
    __dirname, "..", "skills", "pd-hifi-slideclone", "scripts", "rebuild-real-pptx-native.js"
  ), "utf8");
  assert.match(source, /createNativeRebuilder\("triangle-topology"/);
  assert.match(source, /return createTriangleTopologyDiagramShapesFromRegistry\(images, textBoxes, sourceImage, slideSize\)/);
  assert.doesNotMatch(source, /createTriangleTopologyDiagramShapesLegacy|shouldObjectifyTriangleTopologyLegacy|inferTriangleTopologyDiagramLegacy|triangleTopologyDirectedArrow/);
});

function candidate(source = {}, box = {}) {
  return {
    id: "triangle-source",
    box: { x: 260, y: 90, w: 400, h: 340, ...box },
    source: {
      detector: "foreground-graphic-crop",
      layer: { layerType: "diagram-zone" },
      ...source
    }
  };
}

function operations() {
  return {
    boxCenterInside(inner, outer) {
      const x = inner.x + inner.w / 2;
      const y = inner.y + inner.h / 2;
      return x >= outer.x && x <= outer.x + outer.w && y >= outer.y && y <= outer.y + outer.h;
    },
    componentMetadata(layerSourceId, role, part) {
      return { nativeComponentArchetype: "triangle-topology", nativeComponentGroupId: `${layerSourceId}-${role}`, nativeComponentPart: part };
    },
    defaultSlide: { widthPt: 960, heightPt: 540 },
    expandPtBox: (box) => ({ ...box }),
    measurePrimitives: () => null,
    nativeTextBoxes: () => [],
    normalizeText: (value) => String(value || "").replace(/\s+/g, ""),
    round: (value) => Math.round(value * 1000) / 1000,
    sampleArrowFill: () => "#336699"
  };
}
