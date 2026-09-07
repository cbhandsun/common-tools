"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const test = require("node:test");

const coreRoot = path.join(__dirname, "..", "packages", "slideclone-core");
const coreModules = [
  "native-rebuilder-registry",
  "native-rebuilder-policy",
  "detection-result",
  "horizontal-step-chain",
  "hierarchy-diagram",
  "triangle-topology",
  "cover-engine-core",
  "dense-radial-network-shapes",
  "network-native-shapes"
];

test("native rebuilder registry runs from the isolated core package", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-registry-core-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const installed = path.join(root, "node_modules", "@common-tools", "slideclone-core");
  fs.mkdirSync(installed, { recursive: true });
  for (const file of ["package.json", ...coreModules.map((name) => `${name}.js`)]) {
    fs.copyFileSync(path.join(coreRoot, file), path.join(installed, file));
  }

  const load = createRequire(path.join(root, "consumer.cjs"));
  const registry = load("@common-tools/slideclone-core/native-rebuilder-registry");
  const factories = {
    "horizontal-step-chain": "createHorizontalStepChainToolkit",
    "hierarchy-diagram": "createHierarchyDiagramToolkit",
    "triangle-topology": "createTriangleTopologyToolkit",
    "cover-engine-core": "createCoverEngineCoreToolkit",
    "network-dense-component": "createDenseRadialNetworkShapeToolkit",
    "network-native": "createNetworkNativeShapeToolkit"
  };

  assert.equal(fs.existsSync(path.join(root, "skills")), false);
  assert.deepEqual(registry.validateNativeRebuilderRegistry(), []);
  assert.deepEqual(
    registry.NATIVE_REBUILDER_REGISTRY.filter((entry) => entry.implementation).map((entry) => entry.id).sort(),
    Object.keys(factories).sort()
  );
  for (const [family, exportName] of Object.entries(factories)) {
    const descriptor = registry.getNativeRebuilderDescriptor(family);
    assert.equal(typeof descriptor?.implementation?.create, "function");
    assert.equal(typeof load(`@common-tools/slideclone-core/${moduleForFamily(family)}`)[exportName], "function");
    assert.equal(Object.isFrozen(registry.createNativeRebuilder(family, operations())), true);
  }

  const steps = registry.createNativeRebuilder("horizontal-step-chain", operations()).inferShapes({
    id: "isolated-roadmap",
    box: { x: 40, y: 100, w: 880, h: 360 },
    source: { layer: { layerType: "diagram-zone" } }
  });
  assert.equal(steps.filter((shape) => shape.source.detector === "horizontal-step-chain-native-top").length, 4);
  assert.ok(steps.every((shape) => shape.source.nativeComponentArchetype === "horizontal-step-chain-stage"));
});

function moduleForFamily(family) {
  return {
    "horizontal-step-chain": "horizontal-step-chain",
    "hierarchy-diagram": "hierarchy-diagram",
    "triangle-topology": "triangle-topology",
    "cover-engine-core": "cover-engine-core",
    "network-dense-component": "dense-radial-network-shapes",
    "network-native": "network-native-shapes"
  }[family];
}

function operations() {
  return {
    averageColor: (colors) => colors?.[0] || { r: 0, g: 0, b: 0 },
    boxCenterInside(inner, outer) {
      const x = Number(inner?.x || 0) + Number(inner?.w || 0) / 2;
      const y = Number(inner?.y || 0) + Number(inner?.h || 0) / 2;
      return x >= Number(outer?.x || 0) && x <= Number(outer?.x || 0) + Number(outer?.w || 0)
        && y >= Number(outer?.y || 0) && y <= Number(outer?.y || 0) + Number(outer?.h || 0);
    },
    centerOfBox: (box) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 }),
    clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)),
    comparisonMatrixVisualAtoms: () => [],
    componentMetadata: (layerSourceId, role, part) => ({ nativeComponentGroupId: `${layerSourceId}-${role}`, nativeComponentPart: part }),
    createCenterShapes: () => [],
    createSearchShapes: () => [],
    defaultSlide: { widthPt: 960, heightPt: 540 },
    detectAvatarBox: () => null,
    detectAxis: () => null,
    detectCardBox: () => null,
    expandPtBox: (box) => ({ ...box }),
    hexToRgb: () => ({ r: 0, g: 0, b: 0 }),
    isSafeStructuredText: (value) => Boolean(String(value || "").trim()),
    luma: () => 0,
    measurePrimitives: () => null,
    nativeTextBoxes: () => [],
    normalizeChromeTextBoxes: () => {},
    normalizeHex: (value, fallback) => /^#[0-9A-F]{6}$/i.test(String(value || "")) ? String(value) : fallback,
    normalizeStructuredText: (value) => String(value || "").trim(),
    normalizeText: (value) => String(value || "").replace(/\s+/g, ""),
    pixel: () => ({ r: 0, g: 0, b: 0, a: 255 }),
    ptToPxBox: (box) => ({ ...box }),
    regularPolygonPoints: () => [],
    rgbToHex: () => "#000000",
    round: (value) => Math.round(value * 1000) / 1000,
    roundedBox: (box) => ({ ...box }),
    safeComponentToken: (value) => String(value || "network").replace(/[^A-Za-z0-9_-]+/g, "-") || "network",
    sampleArrowFill: () => "#336699",
    saturation: () => 0,
    unionPtBox: (left, right) => ({
      x: Math.min(left.x, right.x), y: Math.min(left.y, right.y),
      w: Math.max(left.x + left.w, right.x + right.w) - Math.min(left.x, right.x),
      h: Math.max(left.y + left.h, right.y + right.h) - Math.min(left.y, right.y)
    })
  };
}
