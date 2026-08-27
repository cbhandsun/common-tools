"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  DENSE_RADIAL_NETWORK_MODES,
  createDenseRadialNetworkPolicy
} = require("../skills/pd-hifi-slideclone/scripts/lib/dense-radial-network-policy");

test("dense radial policy preserves a semantic hero before detailed or summary rebuild", () => {
  const policy = createDenseRadialNetworkPolicy(operations());
  const image = candidate({
    pageText: "终局视野：企业级 AI 智能产品底座 复利引擎",
    preferDetailedDenseRadialNetworkComponent: true,
    componentRenderStrategy: { mode: "preserve-local-crop" }
  });
  const network = nodes(72);

  assert.equal(policy.classify(image, network), DENSE_RADIAL_NETWORK_MODES.PRESERVE);
  assert.equal(policy.shouldPreserveAsCrop(image, network), true);
  assert.equal(policy.shouldUseDetailedComponent(image, network), false);
  assert.equal(policy.shouldUseSummary(image, network), false);
});

test("dense radial policy selects detailed, summary, and standard modes from bounded evidence", () => {
  const policy = createDenseRadialNetworkPolicy(operations());
  assert.equal(policy.classify(candidate({
    pageText: "企业级AI产品底座",
    preferDetailedDenseRadialNetworkComponent: true,
    forceDenseRadialNetworkNative: true
  }), nodes(36)), DENSE_RADIAL_NETWORK_MODES.DETAILED);
  assert.equal(policy.classify(candidate({}, { recommendedAction: "preserve-local-crop" }), nodes(24)), DENSE_RADIAL_NETWORK_MODES.SUMMARY);
  assert.equal(policy.classify(candidate(), nodes(12)), DENSE_RADIAL_NETWORK_MODES.STANDARD);
});

test("dense radial policy keeps explicit precedence and exclusion flags deterministic", () => {
  const policy = createDenseRadialNetworkPolicy(operations());
  const forcedSummary = candidate({
    pageText: "终局视野 企业级AI产品底座",
    forceDenseRadialNetworkNative: true,
    forceDenseRadialNetworkSummary: true
  }, { recommendedAction: "preserve-local-crop" });
  assert.equal(policy.classify(forcedSummary, nodes(72)), DENSE_RADIAL_NETWORK_MODES.SUMMARY);

  const disabled = candidate({ disableDenseRadialNetworkSummary: true }, { recommendedAction: "preserve-local-crop" });
  assert.equal(policy.classify(disabled, nodes(24)), DENSE_RADIAL_NETWORK_MODES.STANDARD);

  const splitResidual = candidate({ detector: "split-wide-residual-crop" }, { recommendedAction: "preserve-local-crop" });
  assert.equal(policy.classify(splitResidual, nodes(64)), DENSE_RADIAL_NETWORK_MODES.STANDARD);
});

test("dense radial policy fails closed for empty, malformed, and extreme external values", () => {
  const policy = createDenseRadialNetworkPolicy(operations());
  assert.equal(policy.classify(null, null), DENSE_RADIAL_NETWORK_MODES.STANDARD);
  assert.equal(policy.classify({ box: { w: Number.MAX_VALUE, h: Number.MAX_VALUE }, source: [] }, { nodes: "many" }), DENSE_RADIAL_NETWORK_MODES.STANDARD);
  assert.equal(policy.classify(candidate({ pageText: { secret: true } }), { nodes: [] }), DENSE_RADIAL_NETWORK_MODES.STANDARD);
});

test("dense radial policy validates and propagates its text normalization boundary", () => {
  assert.throws(() => createDenseRadialNetworkPolicy(), /normalizeText/);
  assert.throws(() => createDenseRadialNetworkPolicy([]), /operations must be an object/);
  assert.throws(() => createDenseRadialNetworkPolicy({ normalizeText: null }), /normalizeText/);
  const failure = new Error("normalizer unavailable");
  const policy = createDenseRadialNetworkPolicy({ normalizeText: () => { throw failure; } });
  assert.throws(() => policy.classify(candidate(), nodes(12)), (error) => error === failure);
});

test("native rebuild consumes one dense radial classification instead of duplicating policy", () => {
  const source = fs.readFileSync(path.join(
    __dirname, "..", "skills", "pd-hifi-slideclone", "scripts", "rebuild-real-pptx-native.js"
  ), "utf8");
  assert.match(source, /classify: denseRadialNetworkPolicy\.classify/);
  assert.doesNotMatch(source, /function shouldPreserveDenseRadialNetworkAsCrop|function shouldUseDetailedDenseRadialNetworkComponent|function shouldSummarizeDenseRadialNetwork/);
});

function candidate(source = {}, layer = {}) {
  return {
    box: { x: 60, y: 80, w: 826, h: 378 },
    source: {
      detector: "foreground-aggregate-crop",
      layer: { layerType: "diagram-zone", recommendedAction: "attempt-native-reconstruction", ...layer },
      ...source
    }
  };
}

function nodes(count) {
  return { nodes: Array.from({ length: count }, () => ({})) };
}

function operations() {
  return {
    normalizeText(value) {
      return String(value || "").replace(/\s+/g, "").replace(/Al/g, "AI");
    }
  };
}
