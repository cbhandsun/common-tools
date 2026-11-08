"use strict";

const DENSE_RADIAL_NETWORK_MODES = Object.freeze({
  DETAILED: "detailed-native-component",
  PRESERVE: "preserve-fidelity-crop",
  STANDARD: "standard-native-network",
  SUMMARY: "summary-native-component"
});

function createDenseRadialNetworkPolicy(operations = {}) {
  const ops = validateOperations(operations);

  function classify(image = {}, network = {}) {
    const evidence = parseEvidence(image, network, ops.normalizeText);
    if (shouldPreserve(evidence)) return DENSE_RADIAL_NETWORK_MODES.PRESERVE;
    if (shouldUseDetailed(evidence)) return DENSE_RADIAL_NETWORK_MODES.DETAILED;
    if (shouldSummarize(evidence)) return DENSE_RADIAL_NETWORK_MODES.SUMMARY;
    return DENSE_RADIAL_NETWORK_MODES.STANDARD;
  }

  function shouldPreserveAsCrop(image = {}, network = {}) {
    return classify(image, network) === DENSE_RADIAL_NETWORK_MODES.PRESERVE;
  }

  function shouldUseDetailedComponent(image = {}, network = {}) {
    return classify(image, network) === DENSE_RADIAL_NETWORK_MODES.DETAILED;
  }

  function shouldUseSummary(image = {}, network = {}) {
    return classify(image, network) === DENSE_RADIAL_NETWORK_MODES.SUMMARY;
  }

  return Object.freeze({ classify, shouldPreserveAsCrop, shouldUseDetailedComponent, shouldUseSummary });
}

function parseEvidence(image, network, normalizeText) {
  const source = objectOrEmpty(image?.source);
  const layer = objectOrEmpty(source.layer);
  const box = objectOrEmpty(image?.box);
  const nodes = Array.isArray(network?.nodes) ? network.nodes : [];
  return Object.freeze({
    boxHeight: boundedDimension(box.h),
    boxWidth: boundedDimension(box.w),
    detector: boundedString(source.detector),
    disableSummary: source.disableDenseRadialNetworkSummary === true,
    forceNative: source.forceDenseRadialNetworkNative === true,
    forceSummary: source.forceDenseRadialNetworkSummary === true,
    nodeCount: Math.min(nodes.length, 10000),
    pageText: normalizeText(boundedString(source.pageText || source.allText, 20000)),
    preferDetailed: source.preferDetailedDenseRadialNetworkComponent === true,
    preferPreserve: source.preferPreserveDenseRadialNetworkCrop === true,
    renderMode: boundedString(source.componentRenderStrategy?.mode),
    recommendedAction: boundedString(layer.recommendedAction)
  });
}

function shouldPreserve(evidence) {
  if (evidence.forceNative) return false;
  const isTerminalVisionHero = /终局视野|智能产品底座|复利引擎/.test(evidence.pageText)
    || /企业级.*ai.*产品底座|ai.*产品底座/i.test(evidence.pageText);
  const isLargeForegroundDiagram = /foreground-aggregate-crop|foreground-graphic-crop/.test(evidence.detector)
    && evidence.boxWidth >= 600
    && evidence.boxHeight >= 260;
  const isPreserveCandidate = evidence.recommendedAction === "preserve-local-crop"
    || evidence.renderMode === "preserve-local-crop"
    || evidence.preferPreserve;
  return evidence.nodeCount >= 24
    && isTerminalVisionHero
    && isLargeForegroundDiagram
    && (isPreserveCandidate || evidence.nodeCount >= 48);
}

function shouldUseDetailed(evidence) {
  if (evidence.forceSummary) return false;
  if (evidence.preferDetailed) return evidence.nodeCount >= 24 && evidence.boxWidth >= 500;
  return evidence.nodeCount >= 36
    && evidence.boxWidth >= 650
    && /foreground-aggregate-crop|foreground-graphic-crop/.test(evidence.detector)
    && (/终局视野|智能产品底座|复利引擎/.test(evidence.pageText) || /企业级.*ai|ai.*产品底座/i.test(evidence.pageText));
}

function shouldSummarize(evidence) {
  if (evidence.disableSummary || /split-wide-residual-crop/.test(evidence.detector)) return false;
  const preservedDenseNetwork = evidence.recommendedAction === "preserve-local-crop" && evidence.nodeCount >= 24;
  return (evidence.nodeCount >= 48 || preservedDenseNetwork)
    && evidence.boxWidth >= 500
    && (/foreground-aggregate-crop|foreground-graphic-crop/.test(evidence.detector)
      || /产品资产|企业级AI|复利|底座/.test(evidence.pageText));
}

function validateOperations(operations) {
  if (!operations || typeof operations !== "object" || Array.isArray(operations)) {
    throw new TypeError("dense radial network policy operations must be an object");
  }
  if (typeof operations.normalizeText !== "function") {
    throw new TypeError("dense radial network policy operation normalizeText must be a function");
  }
  return Object.freeze({ normalizeText: operations.normalizeText });
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function boundedDimension(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100000 ? numeric : 0;
}

function boundedString(value, maximumLength = 256) {
  const text = typeof value === "string" ? value : "";
  return text.slice(0, maximumLength);
}

module.exports = { DENSE_RADIAL_NETWORK_MODES, createDenseRadialNetworkPolicy };
