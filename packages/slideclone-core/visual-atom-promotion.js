"use strict";
const {centerOfBox, rgbToHsl} = require("./raster-native-detection");
const {hexToRgb} = require("./prd-generation-shapes");

function promoteHybridDiagramResidualAtomsToNative(atoms = [], layer = {}, understanding = {}) {
  if (String(layer.layerType || "") !== "diagram-zone") return atoms;
  if (!/^(?:hub-spoke|tree-structure|swimlane-flow)$/.test(String(understanding.archetype || ""))) return atoms;
  if (Number(understanding.confidence || 0) < 0.88) return atoms;
  const nodes = Array.isArray(understanding.nodes) ? understanding.nodes.filter((node) => node?.box) : [];
  if (nodes.length === 0) return atoms;
  return atoms.map((atom) => {
    if (isPromotableReturnLoopAtom(atom, nodes)) {
      return {
        ...atom,
        kind: "native-return-loop-candidate",
        shapeHint: "return-loop",
        nativeCandidate: true,
        residualCandidate: false,
        promotedFrom: atom.kind || "complex-shape-crop-candidate",
        promotionReason: "loop-like residual sits to the right of recognized diagram nodes"
      };
    }
    if (atom?.kind !== "icon-crop-candidate") return atom;
    if (!isPromotableDocumentLikeIconAtom(atom)) return atom;
    if (!nodes.some((node) => documentLikeIconBelongsToNode(atom, node))) return atom;
    return {
      ...atom,
      kind: "native-document-candidate",
      shapeHint: "document",
      nativeCandidate: true,
      residualCandidate: false,
      promotedFrom: "icon-crop-candidate",
      promotionReason: "small document-like icon is aligned with a recognized diagram node"
    };
  });
}

function promoteMatrixSolidArrowAtomsToNative(atoms = [], layer = {}, understanding = {}) {
  const layerType = String(layer.layerType || "");
  if (layerType !== "table-zone" && layerType !== "illustration-zone") return atoms;
  if (String(understanding.archetype || "") !== "matrix-or-grid") return atoms;
  if (Number(understanding.confidence || 0) < 0.84) return atoms;
  const nativeGridAtoms = atoms.filter((atom) => atom?.nativeCandidate === true && atom?.kind === "grid-line-candidate").length;
  const semanticNodes = Array.isArray(understanding.nodes) ? understanding.nodes.length : Number(understanding.nodeCount || 0);
  if (nativeGridAtoms < 8 || semanticNodes < 6) return atoms;
  return atoms.map((atom) => {
    if (!isPromotableMatrixSolidRightArrowAtom(atom)) return atom;
    return {
      ...atom,
      kind: "native-right-arrow-candidate",
      shapeHint: "right-arrow",
      nativeCandidate: true,
      residualCandidate: false,
      promotedFrom: atom.kind || "icon-crop-candidate",
      promotionReason: "solid matrix flow arrow is better represented as an editable PowerPoint right arrow"
    };
  });
}

function isPromotableMatrixSolidRightArrowAtom(atom = {}) {
  if (atom?.kind !== "icon-crop-candidate") return false;
  const box = atom.box || {};
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const aspect = w / Math.max(1, h);
  if (w < 64 || w > 180 || h < 28 || h > 90) return false;
  if (aspect < 1.45 || aspect > 2.8) return false;
  if (!/^#?[0-9a-f]{6}$/i.test(String(atom.color || ""))) return false;
  const color = hexToRgb(atom.color || "");
  const hsl = rgbToHsl({ ...color, a: 255 });
  if (hsl.h < 92 || hsl.h > 165 || hsl.s < 0.38 || hsl.l < 0.22 || hsl.l > 0.64) return false;
  const density = Number(atom.density || 0);
  if (density < 0.38 || density > 0.72) return false;
  const areaRatio = Number(atom.areaRatio || 0);
  return areaRatio >= 0.012 && areaRatio <= 0.04;
}

function isPromotableReturnLoopAtom(atom = {}, nodes = []) {
  if (atom?.kind !== "complex-shape-crop-candidate") return false;
  const box = atom.box || {};
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const aspect = w / Math.max(1, h);
  if (w < 44 || w > 140 || h < 32 || h > 110) return false;
  if (aspect < 1.05 || aspect > 2.7) return false;
  if (Number(atom.areaRatio || 0) < 0.018 || Number(atom.areaRatio || 0) > 0.075) return false;
  if (Number(atom.density || 0) < 0.06 || Number(atom.density || 0) > 0.34) return false;
  const center = centerOfBox(box);
  return nodes.some((node) => {
    const nodeCenter = centerOfBox(node.box || {});
    return center.x > nodeCenter.x + 28
      && Math.abs(center.y - nodeCenter.y) <= Math.max(52, h * 0.85);
  });
}

function isPromotableDocumentLikeIconAtom(atom = {}) {
  const box = atom.box || {};
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const aspect = w / Math.max(1, h);
  return w >= 18
    && w <= 48
    && h >= 20
    && h <= 58
    && aspect >= 0.52
    && aspect <= 1.2
    && Number(atom.areaRatio || 0) >= 0.0035
    && Number(atom.areaRatio || 0) <= 0.025
    && Number(atom.density || 0) >= 0.36;
}

function documentLikeIconBelongsToNode(atom = {}, node = {}) {
  const atomCenter = centerOfBox(atom.box || {});
  const nodeCenter = centerOfBox(node.box || {});
  const atomRight = Number(atom.box?.x || 0) + Number(atom.box?.w || 0);
  const nodeLeft = Number(node.box?.x || 0);
  return atomRight <= nodeCenter.x
    && nodeLeft - atomRight <= 42
    && nodeLeft - atomRight >= -10
    && Math.abs(atomCenter.y - nodeCenter.y) <= Math.max(24, Number(node.box?.h || 0) * 1.1);
}

module.exports = { promoteHybridDiagramResidualAtomsToNative, documentLikeIconBelongsToNode, isPromotableDocumentLikeIconAtom, isPromotableReturnLoopAtom, promoteMatrixSolidArrowAtomsToNative, isPromotableMatrixSolidRightArrowAtom };
