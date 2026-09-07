"use strict";
const {boxOverlapRatio} = require("./raster-native-detection");
const {normalizeVisualGridAtomAxis} = require("./native-chart-shell-shapes");
const {looksLikeScreenshotOrDocumentLayer} = require("./structured-residual-splitting");
const {hasPreserveCropWithNativeOverlaysStrategy} = require("./visual-atom-fallback");

function shouldEmitVisibleTopComplexDiagramNativeLayer(image = {}) {
  return image?.source?.allowVisibleTopComplexNativeRebuild === true;
}

function suppressTrustedDonutDensityFragments(atoms = [], understanding = {}) {
  if (String(understanding.archetype || "") !== "donut-chart") return atoms;
  if (String(understanding.nativeReadiness || "") !== "native-rebuild") return atoms;
  const donuts = atoms.filter((atom) => atom?.kind === "native-donut-candidate" && atom?.box);
  if (donuts.length !== 1) return atoms;
  const donutBox = donuts[0].box;
  const donutArea = Math.max(1, Number(donutBox.w || 0) * Number(donutBox.h || 0));
  return atoms.filter((atom) => {
    if (String(atom?.source?.detector || "") !== "dense-linked-node-visual-atom" || !atom?.box) return true;
    const atomBox = atom.box;
    const centerX = Number(atomBox.x || 0) + Number(atomBox.w || 0) / 2;
    const centerY = Number(atomBox.y || 0) + Number(atomBox.h || 0) / 2;
    const insideDonutBounds = centerX >= Number(donutBox.x || 0)
      && centerX <= Number(donutBox.x || 0) + Number(donutBox.w || 0)
      && centerY >= Number(donutBox.y || 0)
      && centerY <= Number(donutBox.y || 0) + Number(donutBox.h || 0);
    const atomArea = Math.max(0, Number(atomBox.w || 0) * Number(atomBox.h || 0));
    return !insideDonutBounds || atomArea > donutArea * 0.025;
  });
}

function shouldProtectComplexCropFromVisibleVisualAtoms(image = {}) {
  return image?.source?.detector === "top-complex-diagram-crop" && !shouldEmitVisibleTopComplexDiagramNativeLayer(image);
}

function shouldDropSegmentedComparisonMatrixAfterVisualAtoms(image, atoms = [], nativeAtoms = []) {
  if (image?.source?.detector !== "comparison-matrix-crop") return false;
  if (image?.source?.comparisonMatrixTextObjectified !== true) return false;
  if (Number(image?.source?.objectifiedComparisonTextBoxes || 0) < 4) return false;
  if (Number(image?.source?.objectifiedComparisonVisibleTextBoxes || 0) !== Number(image?.source?.objectifiedComparisonTextBoxes || 0)) return false;
  if (atoms.some((atom) => atom?.residualCandidate === true)) return false;
  const fillAtoms = nativeAtoms.filter((atom) =>
    /^native-(?:rect|document|ellipse)-candidate$/.test(String(atom?.kind || "")));
  const lineAtoms = nativeAtoms.filter((atom) =>
    /^(?:connector-line|grid-line)-candidate$/.test(String(atom?.kind || "")));
  return nativeAtoms.length >= 6 && fillAtoms.length >= 2 && lineAtoms.length >= 1;
}

function shouldKeepVisualAtomResidualAsOverlayBase(image = {}, layer = {}, understanding = {}) {
  const detector = String(image?.source?.detector || "").toLowerCase();
  const layerType = String(layer.layerType || "");
  const action = String(layer.recommendedAction || "");
  const archetype = String(understanding.archetype || "");
  if (layerType !== "diagram-zone" || action !== "split-native-with-residual-crop") return false;
  if (archetype === "process-with-screenshots") {
    return !/screenshot|screen|ui[-_\s]?screenshot|user[-_\s]?interface|webpage|document|prd|prototype|截图|界面|文档/.test(detector);
  }
  return archetype === "hub-spoke" && /two-panel|hub|spoke/.test(detector);
}

function shouldSupplementWithFallbackVisualAtoms(understoodAtoms = [], nativeUnderstoodAtoms = [], layer = {}, understanding = {}) {
  if (understanding.archetype === "process-with-screenshots") return false;
  if (understoodAtoms.length === 0) return true;
  const layerType = String(layer.layerType || "");
  const confidence = Number(understanding.confidence || 0);
  if (layerType === "table-zone" && nativeUnderstoodAtoms.length < 8) return true;
  if (layerType === "diagram-zone" && confidence >= 0.62 && nativeUnderstoodAtoms.length < 6) return true;
  if (understanding.nativeReadiness === "native-rebuild" && nativeUnderstoodAtoms.length < 5) return true;
  return false;
}

function mergeUnderstoodAndFallbackVisualAtoms(understoodAtoms = [], fallbackAtoms = []) {
  if (fallbackAtoms.length === 0) return understoodAtoms;
  const merged = [...understoodAtoms];
  for (const fallback of fallbackAtoms) {
    if (merged.some((atom) => atom?.box && boxOverlapRatio(atom.box, fallback.box) > 0.68)) continue;
    merged.push(fallback);
  }
  return merged;
}

function persistPromotedVisualAtoms(image = {}, atoms = []) {
  const understanding = image?.source?.layer?.diagramUnderstanding;
  if (!understanding || !Array.isArray(atoms)) return;
  if (!atoms.some((atom) => atom?.promotedFrom)) return;
  understanding.visualAtoms = atoms;
  understanding.visualAtomKindCounts = atoms.reduce((counts, atom) => {
    const key = String(atom?.kind || "");
    if (key) counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function shouldDropVisualAtomResidualAfterNativeRebuild(image = {}, layer = {}, understanding = {}, atoms = [], nativeAtoms = []) {
  if (looksLikeScreenshotOrDocumentLayer(image, layer, understanding)) return false;
  if (understanding.nativeReadiness !== "native-rebuild") return false;
  if (Number(understanding.confidence || 0) < 0.72) return false;
  if (atoms.some((atom) => atom?.residualCandidate === true)) return false;
  const nativeCandidates = atoms.filter((atom) => atom?.nativeCandidate === true);
  if (nativeCandidates.length < 2 || nativeAtoms.length < nativeCandidates.length) return false;
  const textNodeCount = Number(understanding.nodeCount || 0);
  if (textNodeCount > 0 && image?.source?.textObjectified !== true) return false;
  const structuralNodeCount = Number(understanding.visualNodeCount || 0);
  const structuralConnectorCount = Number(understanding.visualConnectorCount || 0)
    + nativeCandidates.filter((atom) => atom?.kind === "connector-line-candidate" || atom?.kind === "connector-arrow-candidate" || atom?.kind === "grid-line-candidate").length;
  if (structuralNodeCount < 2 && structuralConnectorCount < 1) return false;
  return true;
}

function shouldDropHybridDiagramResidualAfterVisualAtoms(image = {}, layer = {}, understanding = {}, atoms = [], nativeAtoms = []) {
  if (looksLikeScreenshotOrDocumentLayer(image, layer, understanding)) return false;
  if (String(layer.layerType || "") !== "diagram-zone") return false;
  if (String(layer.recommendedAction || "") !== "split-native-with-residual-crop") return false;
  if (String(understanding.nativeReadiness || "") !== "hybrid-native-plus-residual-crops") return false;
  if (!/^(?:hub-spoke|tree-structure|swimlane-flow|generic-node-diagram)$/.test(String(understanding.archetype || ""))) return false;
  if (Number(understanding.confidence || 0) < 0.88) return false;
  if ((atoms || []).some((atom) => atom?.residualCandidate === true)) return false;
  const nativeCandidates = (atoms || []).filter((atom) => atom?.nativeCandidate === true);
  if (nativeCandidates.length < 3 || nativeAtoms.length < nativeCandidates.length) return false;
  const nativeNodeCount = nativeAtoms.filter((atom) => /^native-/.test(String(atom?.kind || ""))).length;
  const nativeConnectorCount = nativeAtoms.filter((atom) =>
    /^(?:connector-line|connector-arrow|grid-line)-candidate$/.test(String(atom?.kind || ""))
  ).length;
  if (nativeNodeCount < 2 || nativeConnectorCount < 1) return false;
  const textNodeCount = Number(understanding.nodeCount || 0);
  if (textNodeCount > 0 && !hasObjectifiedVisualLayerText(image)) return false;
  return true;
}

function hasObjectifiedVisualLayerText(image = {}) {
  const source = image?.source || {};
  return source.textObjectified === true
    || source.twoPanelDiagramTextObjectified === true
    || source.topComplexDiagramTextObjectified === true
    || source.saturatedDiagramTextObjectified === true
    || source.collaborationFlowTextObjectified === true
    || source.wmsRouteChainTextObjectified === true
    || source.comparisonMatrixTextObjectified === true
    || source.visualAtomTextObjectified === true
    || Number(source.objectifiedVisualAtomTextBoxes || 0) > 0
    || Number(source.objectifiedTwoPanelDiagramTextBoxes || 0) > 0
    || Number(source.objectifiedTopComplexDiagramTextBoxes || 0) > 0;
}

function visualAtomNativeBudget(image = {}, layer = {}, understanding = {}, atoms = []) {
  const hasNativeOverlayStrategy = hasPreserveCropWithNativeOverlaysStrategy(image);
  if (looksLikeScreenshotOrDocumentLayer(image, layer, understanding) && !hasNativeOverlayStrategy) return 0;
  if (shouldProtectComplexCropFromVisibleVisualAtoms(image)) return 0;
  const layerType = String(layer.layerType || "");
  const action = String(layer.recommendedAction || "");
  const confidence = Number(understanding.confidence || 0);
  const residualAtomCount = atoms.filter((atom) => atom?.residualCandidate === true).length;
  const nativeAtomCount = atoms.filter((atom) => atom?.nativeCandidate === true).length;
  if (nativeAtomCount <= 0) return 0;
  if (hasNativeOverlayStrategy) return Math.min(24, Math.max(4, nativeAtomCount));
  if (layerType === "table-zone") return 48;
  if (understanding.archetype === "matrix-or-grid" && understanding.nativeReadiness === "delegate-to-table-grid-parser" && confidence >= 0.82 && residualAtomCount === 0) return 48;
  if (layerType === "chart-zone" && understanding.archetype === "bar-chart" && confidence >= 0.72 && residualAtomCount === 0) return 48;
  if (layerType === "chart-zone" && understanding.archetype === "donut-chart" && confidence >= 0.68 && residualAtomCount === 0) return 24;
  if (layerType === "chart-zone" && understanding.archetype === "line-chart" && confidence >= 0.68 && residualAtomCount === 0) return 48;
  if (layerType === "chart-zone" && understanding.archetype === "scatter-chart" && confidence >= 0.68 && residualAtomCount === 0) return 80;
  if (layerType === "illustration-zone") {
    if ((action === "attempt-native-reconstruction" || action === "split-native-with-residual-crop") && confidence >= 0.54) return 20;
    return 0;
  }
  if (understanding.nativeReadiness === "native-rebuild" && confidence >= 0.82 && residualAtomCount === 0) return 48;
  if (action === "attempt-native-reconstruction" && confidence >= 0.7) return 40;
  if (action === "split-native-with-residual-crop" && confidence >= 0.68) return 28;
  return 16;
}

function isHandledBySpecializedDiagramRebuilder(image) {
  const source = image?.source || {};
  return source.skillChainOverviewObjectified === true
    || source.coverEngineCoreObjectified === true;
}

function selectVisualAtomNativeCandidates(nativeAtoms = [], image = {}, layer = {}, understanding = {}, atomBudget = 16) {
  const limit = Math.max(0, Number(atomBudget || 0));
  if (limit <= 0) return [];
  if (!isLineDiagramGridOverlayLayer(image, layer, understanding, nativeAtoms)) return nativeAtoms.slice(0, limit);
  const gridAtoms = nativeAtoms.filter((atom) => atom?.kind === "grid-line-candidate" && atom?.box);
  const nonGridAtoms = nativeAtoms.filter((atom) => atom?.kind !== "grid-line-candidate");
  const selectedGridAtoms = selectRepresentativeGridLineAtoms(gridAtoms, limit);
  return [...selectedGridAtoms, ...nonGridAtoms.slice(0, Math.max(0, limit - selectedGridAtoms.length))]
    .slice(0, limit);
}

function isLineDiagramGridOverlayLayer(image = {}, layer = {}, understanding = {}, atoms = []) {
  if (String(layer.layerType || "") !== "diagram-zone") return false;
  const detector = String(image?.source?.detector || understanding?.evidence?.detector || "").toLowerCase();
  if (detector !== "line-diagram-graphic-underlay-crop") return false;
  const gridLineCount = atoms.filter((atom) => atom?.kind === "grid-line-candidate").length;
  return gridLineCount >= 6;
}

function selectRepresentativeGridLineAtoms(atoms = [], limit = 16) {
  const clusters = [];
  const ordered = atoms
    .filter((atom) => atom?.box)
    .sort((a, b) => visualGridAtomAxisPosition(a) - visualGridAtomAxisPosition(b));
  for (const atom of ordered) {
    const axis = normalizeVisualGridAtomAxis(atom);
    const position = visualGridAtomAxisPosition(atom);
    const threshold = axis === "v" ? 18 : 10;
    const cluster = clusters.find((item) => item.axis === axis && Math.abs(item.position - position) <= threshold);
    if (cluster) {
      cluster.atoms.push(atom);
      cluster.position = cluster.atoms.reduce((sum, item) => sum + visualGridAtomAxisPosition(item), 0) / cluster.atoms.length;
    } else {
      clusters.push({ axis, position, atoms: [atom] });
    }
  }
  return clusters
    .map((cluster) => cluster.atoms.sort((a, b) => visualGridAtomScore(b) - visualGridAtomScore(a))[0])
    .sort((a, b) => visualGridAtomScore(b) - visualGridAtomScore(a))
    .slice(0, limit)
    .sort((a, b) => {
      const axisA = normalizeVisualGridAtomAxis(a);
      const axisB = normalizeVisualGridAtomAxis(b);
      if (axisA !== axisB) return axisA === "h" ? -1 : 1;
      return visualGridAtomAxisPosition(a) - visualGridAtomAxisPosition(b);
    });
}

function visualGridAtomAxisPosition(atom = {}) {
  const box = atom.box || {};
  const axis = normalizeVisualGridAtomAxis(atom);
  return axis === "h"
    ? Number(box.y || 0) + Number(box.h || 0) / 2
    : Number(box.x || 0) + Number(box.w || 0) / 2;
}

function visualGridAtomScore(atom = {}) {
  const box = atom.box || {};
  const axis = normalizeVisualGridAtomAxis(atom);
  const length = axis === "h" ? Number(box.w || 0) : Number(box.h || 0);
  const thickness = axis === "h" ? Number(box.h || 0) : Number(box.w || 0);
  return length * Math.max(0.2, Number(atom.density ?? 0.5)) + Math.min(24, thickness) * 8;
}

function shouldObjectifyVisualAtom(atom, layer = {}, understanding = {}, atoms = []) {
  if ([
    "native-rect-candidate",
    "native-ellipse-candidate",
    "native-diamond-candidate",
    "native-triangle-candidate",
    "native-chevron-candidate",
    "native-parallelogram-candidate",
    "native-cylinder-candidate",
    "native-cloud-candidate",
    "native-document-candidate",
    "native-folder-candidate",
    "native-screen-candidate",
    "native-phone-candidate",
    "native-person-candidate",
    "native-team-candidate",
    "native-gear-candidate",
    "native-search-candidate",
    "native-shield-candidate",
    "native-timeline-candidate",
    "native-funnel-candidate",
    "native-donut-candidate",
    "native-donut-segment-candidate",
    "native-pie-segment-candidate",
    "native-arc-arrow-segment-candidate",
    "native-scatter-point-candidate",
    "native-cycle-arrow-candidate",
    "native-gauge-arc-candidate",
    "native-gauge-needle-candidate",
    "native-radar-frame-candidate",
    "native-radar-score-candidate",
    "native-right-arrow-candidate",
    "native-return-loop-candidate",
    "connector-line-candidate",
    "connector-arrow-candidate"
  ].includes(atom.kind)) return true;
  return atom.kind === "grid-line-candidate" && shouldObjectifyVisualAtomGridLine(layer, understanding, atoms);
}

function shouldObjectifyVisualAtomGridLine(layer = {}, understanding = {}, atoms = []) {
  const layerType = String(layer.layerType || "");
  const action = String(layer.recommendedAction || "");
  if (layerType === "table-zone") return true;
  if (layerType === "chart-zone" && understanding.archetype === "bar-chart") return true;
  if (layerType === "chart-zone" && understanding.archetype === "line-chart") return true;
  if (layerType === "chart-zone" && understanding.archetype === "scatter-chart") return true;
  if (layerType === "chart-zone" && understanding.archetype === "waterfall-chart") return true;
  if (understanding.archetype === "matrix-or-grid"
    && understanding.nativeReadiness === "delegate-to-table-grid-parser"
    && Number(understanding.confidence || 0) >= 0.82
    && atoms.every((atom) => atom?.residualCandidate !== true)) return true;
  if (layerType === "diagram-zone"
    && understanding.archetype === "process-with-screenshots"
    && action === "split-native-with-residual-crop"
    && Number(understanding.confidence || 0) >= 0.85) return true;
  // In illustration layers, grid-like strokes often come from screenshot UI chrome,
  // icon internals, or crop boundaries. Keep those inside residual crops unless a
  // stronger table/chart/matrix classifier has already claimed the layer above.
  if (layerType !== "diagram-zone") return false;
  const residualAtomCount = atoms.filter((atom) => atom?.residualCandidate === true).length;
  const gridLineCount = atoms.filter((atom) => atom?.kind === "grid-line-candidate" && atom?.nativeCandidate === true).length;
  const evidenceDetector = String(understanding?.evidence?.detector || "").toLowerCase();
  if (evidenceDetector === "line-diagram-graphic-underlay-crop"
    && Number(understanding.confidence || 0) >= 0.54
    && residualAtomCount === 0
    && gridLineCount >= 6) return true;
  return understanding.archetype === "generic-node-diagram"
    && understanding.nativeReadiness === "native-rebuild"
    && Number(understanding.confidence || 0) >= 0.85
    && residualAtomCount === 0
    && gridLineCount >= 2;
}

module.exports = { isHandledBySpecializedDiagramRebuilder, mergeUnderstoodAndFallbackVisualAtoms, persistPromotedVisualAtoms, selectVisualAtomNativeCandidates, isLineDiagramGridOverlayLayer, selectRepresentativeGridLineAtoms, visualGridAtomAxisPosition, visualGridAtomScore, shouldDropHybridDiagramResidualAfterVisualAtoms, hasObjectifiedVisualLayerText, shouldDropSegmentedComparisonMatrixAfterVisualAtoms, shouldDropVisualAtomResidualAfterNativeRebuild, shouldKeepVisualAtomResidualAsOverlayBase, shouldObjectifyVisualAtom, shouldObjectifyVisualAtomGridLine, shouldProtectComplexCropFromVisibleVisualAtoms, shouldEmitVisibleTopComplexDiagramNativeLayer, shouldSupplementWithFallbackVisualAtoms, suppressTrustedDonutDensityFragments, visualAtomNativeBudget };
