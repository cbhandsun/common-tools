"use strict";

const { clamp, overlapRatio } = require("./diagram-geometry");
const { inferConnectors, inferNodes, inferVisualAtomConnectors, inferVisualAtomNodes, textBoxesInside } = require("./diagram-visual-topology");
const { inferArchetype } = require("./diagram-archetypes");
const { inferResiduals } = require("./diagram-residual-analysis");
const { countBy, readinessFor, scoreUnderstanding } = require("./diagram-metrics");
const { inferComponentStrategy, inferExpressionFamily, inferTargetMotifs } = require("./diagram-component-strategy");
const { inferStructureSignature, inferVisualGridStructure } = require("./diagram-structure-signature");
const { inferVisualGridCells } = require("./visual-grid-cells");
const { inferSemanticMatrixGrid } = require("./semantic-matrix-grid");
const { detectPixelVennLobes } = require("./pixel-venn-detector");
const { detectPixelConcentricCircles } = require("./pixel-concentric-detector");
const { createDetectionResult } = require("./detection-result");
const { DEFAULT_SLIDE } = require("./diagram-constants");
const { hasRepeatedAlignedDensityRows, hasScatteredTextureEvidence } = require("./screenshot-texture-evidence");

function understandDiagramLayer(item = {}, page = {}, slideSize = DEFAULT_SLIDE, options = {}) {
  const box = item.box || {};
  const textBoxes = textBoxesInside(page.textBoxes || [], box);
  const semanticText = semanticTextForDiagram({ item, textBoxes, options });
  const inputVisualAtoms = Array.isArray(options.visualAtoms) ? options.visualAtoms : [];
  const recoveredVennLobes = inputVisualAtoms.filter((atom) => atom?.kind === "native-venn-ellipse-candidate").length >= 2
    ? []
    : detectPixelVennLobes(options.sourceImage, box, slideSize);
  const recoveredConcentricCircles = inputVisualAtoms.filter((atom) => atom?.kind === "native-concentric-circle-candidate").length >= 3
    ? []
    : detectPixelConcentricCircles(options.sourceImage, box, slideSize);
  const retainedAfterVenn = recoveredVennLobes.length > 0
    ? inputVisualAtoms.filter((atom) => !isRecoveredVennMergeArtifact(atom, recoveredVennLobes))
    : inputVisualAtoms;
  const retainedInputAtoms = recoveredConcentricCircles.length >= 3
    ? retainedAfterVenn.filter((atom) => !isRecoveredConcentricArtifact(atom, recoveredConcentricCircles))
    : retainedAfterVenn;
  const visualAtoms = protectScreenshotTextureCluster(
    [...retainedInputAtoms, ...recoveredVennLobes, ...recoveredConcentricCircles],
    box
  );
  const atomVisualGrid = inferVisualGridStructure(visualAtoms, box);
  const semanticVisualGrid = inferSemanticMatrixGrid(options.sourceImage, box, slideSize, semanticText);
  const inferredVisualGrid = preferSemanticMatrixGrid(semanticVisualGrid, atomVisualGrid);
  const visualGridCells = inferVisualGridCells(inferredVisualGrid, options.sourceImage, slideSize);
  const visualGrid = inferredVisualGrid && visualGridCells.length > 0
    ? { ...inferredVisualGrid, cells: visualGridCells }
    : inferredVisualGrid;
  const visualNodes = inferVisualAtomNodes(visualAtoms);
  const visualConnectors = inferVisualAtomConnectors(visualAtoms, visualNodes);
  const nodes = inferNodes(textBoxes, box);
  const archetype = inferArchetype({ item, nodes, textBoxes, visualAtoms, visualNodes, visualConnectors, visualGrid, box, slideSize });
  const connectors = inferConnectors(archetype, nodes, visualAtoms);
  const residuals = inferResiduals({ item, archetype, nodes, visualAtoms, visualNodes, visualConnectors, box });
  const confidence = scoreUnderstanding({ archetype, nodes, connectors, residuals, item, visualAtoms, visualNodes, visualConnectors, visualGrid });
  const nativeReadiness = readinessFor({ archetype, confidence, nodes, connectors, residuals, visualAtoms, visualNodes, visualConnectors, visualGrid });
  const structureSignature = inferStructureSignature({ archetype, nodes, visualAtoms, visualNodes, visualConnectors, visualGrid, box });
  const expressionFamily = inferExpressionFamily({ archetype, nativeReadiness, structureSignature, item, visualAtoms, visualNodes, visualConnectors, visualGrid, semanticText });
  const componentStrategy = inferComponentStrategy({
    archetype,
    confidence,
    nativeReadiness,
    nodes,
    connectors,
    residuals,
    visualAtoms,
    visualNodes,
    visualConnectors,
    visualGrid,
    structureSignature,
    semanticText,
    expressionSubtype: item.source?.expressionSubtype || ""
  });
  const targetMotifs = inferTargetMotifs({ archetype, nodes, visualAtoms, visualNodes, visualConnectors, visualGrid, componentStrategy, structureSignature, semanticText });
  const detectionResult = createDetectionResult({
    matched: archetype !== "unknown",
    confidence,
    bounds: box,
    evidence: [
      { code: "diagram.text-boxes", score: clamp(textBoxes.length / 12, 0, 1), box },
      { code: "diagram.visual-atoms", score: clamp(visualAtoms.length / 24, 0, 1), box },
      { code: "diagram.connectors", score: clamp((connectors.length + visualConnectors.length) / 12, 0, 1), box }
    ],
    reasonCodes: [`diagram.${archetype || "unknown"}`],
    claimedRegions: archetype !== "unknown" ? [{
      id: `${archetype}-region`,
      box,
      purpose: nativeReadiness === "native-rebuild" ? "native-rebuild" : "hybrid-rebuild",
      dropResidual: nativeReadiness === "native-rebuild"
    }] : [],
    diagnostics: {
      "node-count": nodes.length + visualNodes.length,
      "connector-count": connectors.length + visualConnectors.length,
      "residual-count": residuals.length,
      readiness: String(nativeReadiness || "unknown").toLowerCase()
    }
  });
  return {
    provider: "diagram-understanding-v1",
    archetype,
    expressionFamily,
    confidence,
    nativeReadiness,
    componentStrategy: {
      ...componentStrategy,
      ...(targetMotifs.length ? { targetMotifs } : {})
    },
    ...(targetMotifs.length ? { targetMotifs } : {}),
    ...(structureSignature ? { structureSignature: { expressionFamily, ...structureSignature } } : {}),
    nodeCount: nodes.length,
    connectorCount: connectors.length,
    residualCount: residuals.length,
    visualAtomCount: visualAtoms.length,
    visualAtomKindCounts: countBy(visualAtoms, "kind"),
    visualNodeCount: visualNodes.length,
    visualConnectorCount: visualConnectors.length,
    visualGrid,
    nodes,
    connectors,
    residuals,
    visualNodes,
    visualConnectors,
    visualAtoms: visualAtoms.slice(0, 40),
    evidence: {
      ...(hasScatteredTextureEvidence(visualAtoms, box) ? { nativeGeometryUnverified: true } : {}),
      textBoxCount: textBoxes.length,
      detector: item.source?.detector || "unknown",
      expressionSubtype: item.source?.expressionSubtype || null,
      ...(semanticText ? { semanticText } : {}),
      regionBox: box
    },
    detectionResult
  };
}

function isRecoveredVennMergeArtifact(atom = {}, lobes = []) {
  if (atom?.kind !== "native-rect-candidate" || !atom?.box || lobes.length < 2) return false;
  const union = lobes.reduce((result, lobe) => {
    const lobeBox = lobe.box || {};
    if (!result) return { ...lobeBox };
    const left = Math.min(Number(result.x || 0), Number(lobeBox.x || 0));
    const top = Math.min(Number(result.y || 0), Number(lobeBox.y || 0));
    const right = Math.max(Number(result.x || 0) + Number(result.w || 0), Number(lobeBox.x || 0) + Number(lobeBox.w || 0));
    const bottom = Math.max(Number(result.y || 0) + Number(result.h || 0), Number(lobeBox.y || 0) + Number(lobeBox.h || 0));
    return { x: left, y: top, w: right - left, h: bottom - top };
  }, null);
  return overlapRatio(atom.box, union) >= 0.86 && overlapRatio(union, atom.box) >= 0.86;
}

function isRecoveredConcentricArtifact(atom = {}, circles = []) {
  if (!atom?.box || circles.length < 3) return false;
  const outer = circles[0]?.box;
  if (!outer) return false;
  if (String(atom?.source?.detector || "") === "dense-linked-node-visual-atom") {
    const centerX = Number(atom.box.x || 0) + Number(atom.box.w || 0) / 2;
    const centerY = Number(atom.box.y || 0) + Number(atom.box.h || 0) / 2;
    return centerX >= Number(outer.x || 0) && centerX <= Number(outer.x || 0) + Number(outer.w || 0)
      && centerY >= Number(outer.y || 0) && centerY <= Number(outer.y || 0) + Number(outer.h || 0);
  }
  return atom.kind === "native-ellipse-candidate"
    && overlapRatio(atom.box, outer) >= 0.9
    && overlapRatio(outer, atom.box) >= 0.9;
}

function protectScreenshotTextureCluster(visualAtoms = [], box = {}) {
  const densityPeaks = visualAtoms.filter((atom) => String(atom?.source?.detector || "") === "dense-linked-node-visual-atom" && atom?.box);
  if (densityPeaks.length < 8 || densityPeaks.length < visualAtoms.length * 0.45) return visualAtoms;
  const colorCounts = countBy(densityPeaks.map((atom) => ({ color: String(atom.color || "").toLowerCase() })), "color");
  const dominantColorCount = Math.max(0, ...Object.values(colorCounts));
  if (dominantColorCount < densityPeaks.length * 0.72) return visualAtoms;
  if (!hasRepeatedAlignedDensityRows(densityPeaks)) return visualAtoms;
  const horizontalLines = visualAtoms
    .filter((atom) => atom?.kind === "grid-line-candidate" && atom?.box)
    .filter((atom) => Number(atom.box.w || 0) >= Number(box.w || 0) * 0.38 && Number(atom.box.h || 0) <= Number(box.h || 0) * 0.06)
    .sort((left, right) => Number(left.box.y || 0) - Number(right.box.y || 0));
  const hasCloseLinePair = horizontalLines.some((line, index) => horizontalLines.slice(index + 1).some((peer) =>
    Math.abs(Number(peer.box.y || 0) - Number(line.box.y || 0)) <= Number(box.h || 0) * 0.08
  ));
  if (!hasCloseLinePair) return visualAtoms;
  const trueConnectors = visualAtoms.filter((atom) => ["connector-line-candidate", "connector-arrow-candidate"].includes(atom?.kind));
  if (trueConnectors.length > 2) return visualAtoms;
  return [
    ...visualAtoms.filter((atom) => String(atom?.source?.detector || "") !== "dense-linked-node-visual-atom" && atom?.kind !== "native-cycle-arrow-candidate"),
    {
      id: "pixel-screenshot-texture-cluster",
      kind: "screenshot-crop-candidate",
      shapeHint: "complex",
      box: { ...box },
      nativeCandidate: false,
      residualCandidate: true,
      source: {
        detector: "pixel-screenshot-texture-cluster",
        sourceImageDetected: true,
        method: "repeated-density-peaks-with-adjacent-ui-rows"
      }
    }
  ];
}

function preferSemanticMatrixGrid(semanticGrid, atomGrid) {
  if (!semanticGrid) return atomGrid;
  if (!atomGrid) return semanticGrid;
  if (Number(semanticGrid.lineCount || 0) >= Number(atomGrid.lineCount || 0)) return semanticGrid;
  if (Number(semanticGrid.rows || 0) * Number(semanticGrid.columns || 0) > Number(atomGrid.rows || 0) * Number(atomGrid.columns || 0)) return semanticGrid;
  return atomGrid;
}

function semanticTextForDiagram({ item = {}, textBoxes = [], options = {} } = {}) {
  return [
    options.semanticText,
    item.source?.pageSemanticText,
    item.source?.semanticText,
    item.source?.reason,
    item.source?.expressionSubtype,
    ...textBoxes.map((textBox) => textBox?.text)
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 500)
    .toLowerCase();
}

module.exports = {
  understandDiagramLayer,
  isRecoveredVennMergeArtifact,
  isRecoveredConcentricArtifact,
  protectScreenshotTextureCluster,
  preferSemanticMatrixGrid,
  semanticTextForDiagram
};
