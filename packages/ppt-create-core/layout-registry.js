"use strict";

const MAX_VARIANTS = 3;
const PRIORITIES = Object.freeze(["narrative", "metrics", "comparison", "process", "action"]);

function layout(id, roles, family, silhouette, minimumItems, maximumItems, priorities, summaryMode = "optional", visualKinds) {
  return Object.freeze({ id, roles: Object.freeze(roles), family, silhouette, minimumItems, maximumItems, priorities: Object.freeze(priorities), summaryMode, ...(visualKinds ? { visualKinds: Object.freeze(visualKinds) } : {}) });
}

const LAYOUT_REGISTRY = Object.freeze([
  layout("cover-signal-v1", ["cover"], "hero", "asymmetric-left", 0, 0, ["narrative"]),
  layout("cover-band-v1", ["cover"], "hero", "center-band", 0, 0, ["narrative"]),
  layout("section-band-v1", ["section"], "chapter", "top-band", 0, 3, ["narrative"]),
  layout("section-index-v1", ["section"], "chapter", "large-index", 0, 3, ["narrative"]),
  layout("content-cards-v1", ["content"], "collection", "balanced-grid", 1, 6, ["narrative"]),
  layout("content-editorial-v1", ["content"], "editorial", "left-rail", 1, 6, ["narrative"], "preferred"),
  layout("metrics-row-v1", ["metrics"], "data", "metric-row", 2, 4, ["metrics"]),
  layout("metrics-focus-v1", ["metrics"], "data", "metric-focus", 2, 4, ["metrics"]),
  layout("comparison-split-v1", ["comparison"], "comparison", "equal-split", 2, 2, ["comparison"]),
  layout("comparison-axis-v1", ["comparison"], "comparison", "offset-axis", 2, 2, ["comparison"]),
  layout("process-linear-v1", ["process"], "sequence", "horizontal-flow", 2, 6, ["process"]),
  layout("process-stages-v1", ["process"], "sequence", "stepped-flow", 2, 6, ["process"]),
  layout("closing-centered-v1", ["closing"], "close", "centered", 0, 3, ["action", "narrative"]),
  layout("closing-actions-v1", ["closing"], "close", "action-strip", 0, 3, ["action"]),
  layout("media-frame-v1", ["content"], "media", "media-right", 1, 4, ["narrative"], "optional", ["media"]),
  layout("media-caption-v1", ["content"], "media", "media-stage", 1, 4, ["narrative"], "optional", ["media"]),
  layout("table-focus-v1", ["content"], "data", "table-wide", 1, 4, ["metrics", "comparison", "narrative"], "optional", ["table"]),
  layout("table-compact-v1", ["content"], "data", "table-insight", 1, 4, ["metrics", "comparison", "narrative"], "optional", ["table"]),
  layout("chart-focus-v1", ["content", "metrics"], "data", "chart-wide", 1, 4, ["metrics", "comparison"], "optional", ["chart"]),
  layout("chart-insight-v1", ["content", "metrics"], "data", "chart-insight", 1, 4, ["metrics", "comparison"], "optional", ["chart"]),
  layout("analysis-canvas-v1", ["content"], "analysis", "analysis-grid", 1, 4, ["comparison", "process", "narrative"], "optional", ["analysis"]),
  layout("analysis-steps-v1", ["content"], "analysis", "analysis-rail", 1, 4, ["comparison", "process", "narrative"], "optional", ["analysis"])
]);

function stableHash(value) {
  let result = 2166136261;
  for (const character of value) { result ^= character.codePointAt(0); result = Math.imul(result, 16777619); }
  return result >>> 0;
}
function validateLayoutRegistry(registry = LAYOUT_REGISTRY) {
  if (!Array.isArray(registry) || registry.length < 1 || registry.length > 128) throw new TypeError("layout registry is invalid");
  const ids = new Set();
  for (const candidate of registry) {
    if (!candidate || typeof candidate !== "object" || !/^[a-z][a-z0-9-]{2,79}$/u.test(candidate.id || "") || ids.has(candidate.id)) throw new TypeError("layout registry contains an invalid id");
    if (!Array.isArray(candidate.roles) || candidate.roles.length < 1 || candidate.roles.some((role) => typeof role !== "string")) throw new TypeError("layout registry contains invalid roles");
    if (!Number.isSafeInteger(candidate.minimumItems) || !Number.isSafeInteger(candidate.maximumItems) || candidate.minimumItems < 0 || candidate.maximumItems < candidate.minimumItems || candidate.maximumItems > 12) throw new TypeError("layout registry contains invalid capacity");
    if (!Array.isArray(candidate.priorities) || candidate.priorities.some((priority) => !PRIORITIES.includes(priority))) throw new TypeError("layout registry contains invalid priorities");
    if (candidate.visualKinds !== undefined && (!Array.isArray(candidate.visualKinds) || candidate.visualKinds.length < 1 || candidate.visualKinds.some((kind) => !["media", "table", "chart", "analysis"].includes(kind)))) throw new TypeError("layout registry contains invalid visual kinds");
    ids.add(candidate.id);
  }
  return true;
}
function getLayout(id) {
  const candidate = LAYOUT_REGISTRY.find((entry) => entry.id === id);
  if (!candidate) throw new TypeError("presentation layout is invalid");
  return candidate;
}
function compatible(candidate, slide) {
  const visualCompatible = slide.visual ? candidate.visualKinds?.includes(slide.visual.kind) === true : candidate.visualKinds === undefined;
  return visualCompatible && candidate.roles.includes(slide.role) && slide.items.length >= candidate.minimumItems && slide.items.length <= candidate.maximumItems;
}
function layoutScore(candidate, slide, seed, previousSilhouette) {
  let score = 1000;
  if (candidate.priorities.includes(slide.priority)) score += 120;
  if (candidate.summaryMode === "preferred" && slide.summary) score += 30;
  const midpoint = (candidate.minimumItems + candidate.maximumItems) / 2;
  score -= Math.abs(slide.items.length - midpoint) * 8;
  if (candidate.silhouette === previousSilhouette) score -= 160;
  score += stableHash(`${seed}\u0000${slide.id}\u0000${candidate.id}`) % 29;
  return score;
}
function selectLayoutCandidates(slide, { seed, variantCount = MAX_VARIANTS, previousSilhouette } = {}) {
  if (!slide || typeof slide !== "object" || !Array.isArray(slide.items)) throw new TypeError("slide layout input is invalid");
  if (typeof seed !== "string" || seed.length < 1 || seed.length > 80) throw new TypeError("layout seed is invalid");
  if (!Number.isSafeInteger(variantCount) || variantCount < 1 || variantCount > MAX_VARIANTS) throw new TypeError("layout variant count is invalid");
  let candidates = LAYOUT_REGISTRY.filter((candidate) => compatible(candidate, slide));
  if (slide.layout) {
    const requested = getLayout(slide.layout);
    if (!compatible(requested, slide)) throw new TypeError("presentation layout is incompatible with slide content");
    candidates = [requested, ...candidates.filter((candidate) => candidate.id !== requested.id)];
  } else {
    candidates.sort((left, right) => layoutScore(right, slide, seed, previousSilhouette) - layoutScore(left, slide, seed, previousSilhouette) || left.id.localeCompare(right.id));
  }
  if (candidates.length < 1) throw new TypeError("no compatible presentation layout is available");
  return Object.freeze(candidates.slice(0, Math.min(variantCount, candidates.length)));
}

validateLayoutRegistry();

module.exports = { LAYOUT_REGISTRY, MAX_VARIANTS, PRIORITIES, getLayout, selectLayoutCandidates, stableHash, validateLayoutRegistry };
