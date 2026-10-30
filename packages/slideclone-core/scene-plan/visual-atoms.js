"use strict";

const api = {
  ...require("./visual-atom-utils"),
  ...require("./visual-atom-shape-recognition"),
  ...require("./visual-atom-semantic-components"),
  ...require("./visual-atom-line-components"),
  ...require("./visual-atom-components"),
  ...require("./visual-atom-dense-nodes"),
  ...require("./visual-atom-extractor"),
};
const { extractVisualAtoms, detectDenseLinkedNodeAtoms, classifyAtom, detectSemanticSearchComponents, detectSemanticGaugeComponents, detectSemanticRadarComponents, foregroundComponents, foregroundComponentsBySeedColor, inferDiagonalLineFit, inferRadialPolygonVertices, isForegroundPixel, looksLikeSearchIcon, searchIconEvidence, recoverResidualArcArrowSegments, ptToPxBox, pxToPtBox } = api;

module.exports = {
  extractVisualAtoms,
  detectDenseLinkedNodeAtoms,
  _private: {
    classifyAtom,
    detectDenseLinkedNodeAtoms,
    detectSemanticSearchComponents,
    detectSemanticGaugeComponents,
    detectSemanticRadarComponents,
    foregroundComponents,
    foregroundComponentsBySeedColor,
    inferDiagonalLineFit,
    inferRadialPolygonVertices,
    isForegroundPixel,
    looksLikeSearchIcon,
    searchIconEvidence,
    recoverResidualArcArrowSegments,
    ptToPxBox,
    pxToPtBox
  }
};
