"use strict";

const { boxArea } = require("./diagram-geometry");
const { looksLikeVisualHubSpoke } = require("./diagram-archetypes");

function inferResiduals({ item, archetype, nodes, visualAtoms = [], visualNodes = [], visualConnectors = [], box = {} }) {
  const residuals = [];
  const detector = String(item.source?.detector || "").toLowerCase();
  if (archetype === "screenshot-annotation" || archetype === "screenshot-zoom-callout") {
    residuals.push({ kind: "screenshot-crop", reason: "annotated screenshots should preserve the base UI/image crop while rebuilding callouts and markers as editable overlays" });
  }
  if (archetype === "screenshot-zoom-callout") {
    residuals.push({ kind: "zoom-detail-crop", reason: "zoom callouts should preserve the magnified detail crop while rebuilding source highlight and connector overlays" });
  }
  if (archetype === "screenshot-card-grid") {
    residuals.push({ kind: "screenshot-crop", reason: "screenshot card grids should preserve each embedded UI/product screenshot as a local crop while rebuilding cards and captions natively" });
  }
  if (archetype === "visual-example-card-grid") {
    residuals.push({ kind: "visual-example-crop", reason: "visual example card grids should keep each pictorial/plugin preview as a minimum-unit crop while rebuilding card containers and explanatory text natively" });
  }
  if (archetype === "feature-icon-card-grid") {
    residuals.push({ kind: "icon-or-illustration-crop", reason: "feature-card icons and pictorial marks should stay as local crops unless a matching vector/plugin icon component is found" });
  }
  if (/screenshot|document|ui[-_\s]?screenshot|user[-_\s]?interface/.test(detector) || archetype === "process-with-screenshots") {
    residuals.push({ kind: "screenshot-crop", reason: "screenshots should remain fidelity crops unless UI structure is parsed" });
  }
  const safeNativeHubSpoke = archetype === "hub-spoke" && looksLikeVisualHubSpoke(visualNodes, visualConnectors, box);
  if (/icon|illustration|entropy|gem|scanner|engine/.test(detector) || (archetype === "hub-spoke" && !safeNativeHubSpoke)) {
    residuals.push({ kind: "icon-or-illustration-crop", reason: "icons and decorative marks need library/SVG confidence before native rebuild" });
  }
  if (!["quadrant-matrix", "funnel-lens-flow"].includes(archetype) && nodes.some((node) => node.kind === "screenshot-or-document-node")) {
    residuals.push({ kind: "document-node-crop", reason: "document-like nodes are safer as local crops with native surrounding structure" });
  }
  for (const atom of visualAtoms) {
    if (!atom.residualCandidate) continue;
    if (archetype === "gantt-roadmap" && looksLikeGanttScheduleBarAtom(atom, box)) continue;
    if (archetype === "numbered-step-card-grid" && looksLikeStepCardBadgeFragmentAtom(atom, box)) continue;
    if (archetype === "cycle-loop" && looksLikeCycleArcResidualAtom(atom, box)) continue;
    residuals.push({ kind: atom.kind, atomId: atom.id, reason: "visual atom is safer as a local crop until a native/vector matcher is confident" });
  }
  return residuals;
}

function looksLikeCycleArcResidualAtom(atom = {}, box = {}) {
  const atomBox = atom.box || {};
  const regionArea = Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  const width = Number(atomBox.w || 0);
  const height = Number(atomBox.h || 0);
  const aspect = width / Math.max(1, height);
  const areaRatio = width * height / regionArea;
  const density = Number(atom.density || 0);
  return atom.kind === "complex-shape-crop-candidate"
    && areaRatio >= 0.006
    && areaRatio <= 0.09
    && aspect >= 0.35
    && aspect <= 3.2
    && density >= 0.16
    && density <= 0.86;
}

function looksLikeStepCardBadgeFragmentAtom(atom = {}, box = {}) {
  const atomBox = atom.box || {};
  const regionArea = Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  const width = Number(atomBox.w || 0);
  const height = Number(atomBox.h || 0);
  const areaRatio = width * height / regionArea;
  return atom.kind === "complex-shape-crop-candidate"
    && areaRatio <= 0.0012
    && width <= Math.max(28, Number(box.w || 0) * 0.05)
    && height <= Math.max(8, Number(box.h || 0) * 0.035);
}

function looksLikeGanttScheduleBarAtom(atom = {}, box = {}) {
  const atomBox = atom.box || {};
  const width = Number(atomBox.w || 0);
  const height = Number(atomBox.h || 0);
  const regionWidth = Math.max(1, Number(box.w || 0));
  const regionHeight = Math.max(1, Number(box.h || 0));
  const aspect = width / Math.max(1, height);
  const areaRatio = boxArea(atomBox) / Math.max(1, regionWidth * regionHeight);
  return atom.kind === "complex-shape-crop-candidate"
    && aspect >= 2.2
    && width >= regionWidth * 0.12
    && height <= regionHeight * 0.18
    && areaRatio >= 0.002
    && areaRatio <= 0.12;
}

module.exports = {
  inferResiduals,
  looksLikeCycleArcResidualAtom,
  looksLikeStepCardBadgeFragmentAtom,
  looksLikeGanttScheduleBarAtom
};
