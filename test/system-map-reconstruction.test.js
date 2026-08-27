"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MODES,
  chooseSystemMapReconstructionMode,
  composeSystemMapDiagram
} = require("../skills/pd-hifi-slideclone/scripts/lib/system-map-reconstruction");

test("system map policy prefers bounded hybrid reconstruction for measurable textured topology", () => {
  const result = chooseSystemMapReconstructionMode({
    topologyReady: true,
    decorativeGridTexture: true,
    structuredLineMap: false,
    innerLabelCount: 0
  });
  assert.equal(result.mode, "native-hybrid");
  assert.equal(result.protectFullCrop, false);
  assert.equal(result.preserveDenseCenter, true);
  assert.equal(result.rebuildOuterTexture, true);
  assert.equal(result.reasonCode, "system-map.topology-and-texture-measurable");
});

test("system map policy preserves a full crop only when structure and labels are insufficient", () => {
  assert.equal(chooseSystemMapReconstructionMode({ innerLabelCount: 0 }).mode, "fidelity");
  assert.equal(chooseSystemMapReconstructionMode({ structuredLineMap: true, innerLabelCount: 0 }).mode, "structured-hybrid");
  assert.equal(chooseSystemMapReconstructionMode({ innerLabelCount: 6 }).mode, "readable-native");
  assert.throws(() => chooseSystemMapReconstructionMode({ innerLabelCount: -1 }), /innerLabelCount/);
  assert.throws(() => chooseSystemMapReconstructionMode({ innerLabelCount: 10001 }), /innerLabelCount/);
  assert.throws(() => chooseSystemMapReconstructionMode([]), /must be an object/);
});

test("system map policy does not flatten an enclosing pictorial composition into generic topology", () => {
  const decision = chooseSystemMapReconstructionMode({
    topologyReady: true,
    pictorialEnclosure: true,
    structuredLineMap: false,
    decorativeGridTexture: true,
    innerLabelCount: 2
  });
  assert.equal(decision.mode, MODES.FIDELITY);
  assert.equal(decision.protectFullCrop, true);
});

test("system map composition keeps only the dense center crop and native outer structure", () => {
  const target = { id: "map", source: { detector: "line-diagram", systemMapTopologyProbeReady: true } };
  const crop = { id: "center", box: { x: 30, y: 30, w: 40, h: 40 } };
  const result = composeSystemMapDiagram([target], [], { widthPt: 100, heightPt: 100 }, {
    preserveDenseNetworkCrop: true
  }, {
    shouldObjectify: () => true,
    inferLayout: () => ({
      shapes: [
        { id: "outer", source: { detector: "system-map-native-mapping-line" } },
        { id: "inner", source: { detector: "system-map-native-network-edge" } }
      ],
      textBoxes: [
        { id: "outside", box: { x: 5, y: 5, w: 5, h: 5 } },
        { id: "inside", box: { x: 40, y: 40, w: 5, h: 5 } }
      ]
    }),
    createNetworkCrop: () => crop,
    compactLines: (shapes) => shapes,
    boxCenterInside: (box, bounds) => box.x >= bounds.x && box.y >= bounds.y
  });
  assert.deepEqual(result.shapes.map((item) => item.id), ["outer"]);
  assert.deepEqual(result.textBoxes.map((item) => item.id), ["outside"]);
  assert.deepEqual(result.images, [crop]);
  assert.equal(target.source.systemMapDiagramObjectified, true);
  assert.equal(target.source.systemMapHybridNetworkCrop, true);
});

test("system map composition validates injected boundaries and propagates failures", () => {
  const operations = {
    shouldObjectify: () => true,
    inferLayout: () => ({ shapes: [], textBoxes: [] }),
    createNetworkCrop: () => null,
    compactLines: (items) => items,
    boxCenterInside: () => false
  };
  assert.deepEqual(composeSystemMapDiagram([], [], {}, {}, operations), { shapes: [], textBoxes: [], images: [] });
  assert.throws(() => composeSystemMapDiagram([], [], {}, {}, {}), /operation shouldObjectify/);
  assert.throws(() => composeSystemMapDiagram([{}], [], {}, {}, {
    ...operations,
    inferLayout: () => ({ shapes: null, textBoxes: [] })
  }), /collections must be arrays/);
  assert.throws(() => composeSystemMapDiagram([{}], [], {}, {}, {
    ...operations,
    inferLayout: () => { throw new Error("layout failed"); }
  }), /layout failed/);
});
