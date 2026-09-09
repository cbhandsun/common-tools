"use strict";

const path = require("path");
const { DEFAULT_SLIDE } = require("@common-tools/slideclone-core/page-text-rule-helpers");

function createTableZoneSemanticTextFactory(dependencies = {}) {
  const {
    boxArea,
    boxCenterInside,
    centerOfBox,
    cropPng,
    ensureDir,
    eraseMasks,
    expandPtBox,
    hasStrongTableGridEvidence,
    normalizeHex,
    normalizeMatrixLabel,
    pointInsideBox,
    ptToPxBox,
    resolveAssetPathForIr,
    sameDiagramLabel,
    shouldCenterTableZoneSemanticLabelInHost,
    tableZoneSemanticContrastTextColor,
    tableZoneSemanticHostLabelBox,
    writePng
  } = dependencies;
  const required = {
    boxArea,
    boxCenterInside,
    centerOfBox,
    cropPng,
    ensureDir,
    eraseMasks,
    expandPtBox,
    hasStrongTableGridEvidence,
    normalizeHex,
    normalizeMatrixLabel,
    pointInsideBox,
    ptToPxBox,
    resolveAssetPathForIr,
    sameDiagramLabel,
    shouldCenterTableZoneSemanticLabelInHost,
    tableZoneSemanticContrastTextColor,
    tableZoneSemanticHostLabelBox,
    writePng
  };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== "function") throw new TypeError(`table zone semantic text dependency ${name} must be a function`);
  }

  function createTableZoneSemanticTextBoxes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null) {
    const result = [];
    for (const image of images || []) {
      if (!shouldObjectifyTableZoneSemanticText(image)) continue;
      const nativeTextBoxes = tableZoneSemanticNativeTextBoxes(image, textBoxes);
      if (nativeTextBoxes.length === 0) continue;
      const erasedTextBoxes = sourceImage
        ? maybeEraseTableZoneSemanticText({
          image,
          textBoxes: nativeTextBoxes,
          sourceImage,
          slideSize,
          irDir
        })
        : [];
      const visibleTextBoxes = erasedTextBoxes.length > 0
        ? erasedTextBoxes
        : nativeTextBoxes.map((textBox) => ({
          ...textBox,
          source: {
            ...(textBox.source || {}),
            textErasedFromCrop: false,
            overlayVisibility: "visible"
          }
        }));
      image.source = {
        ...(image.source || {}),
        tableZoneSemanticTextObjectified: true,
        tableZoneSemanticNativeTextBoxes: visibleTextBoxes,
        objectifiedTableZoneSemanticTextBoxes: visibleTextBoxes.length,
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; table/grid semantic labels erased from residual crop and rebuilt as editable native text`
      };
      result.push(...visibleTextBoxes);
    }
    return result;
  }
  
  function shouldObjectifyTableZoneSemanticText(image = {}) {
    const detector = String(image?.source?.detector || "");
    if (!/^(?:split-table-grid-residual-crop|foreground-graphic-underlay-crop|structured-case-graphic-underlay-crop|content-foreground-graphic-underlay-crop)$/.test(detector)) return false;
    const layer = image?.source?.layer || {};
    const hasTableEvidence = image?.source?.tableGridObjectified === true
      || layer.layerType === "table-zone"
      || hasStrongTableGridEvidence(image);
    if (!hasTableEvidence) return false;
    const nodes = image?.source?.layer?.diagramUnderstanding?.nodes;
    return Array.isArray(nodes) && nodes.some((node) => tableZoneSemanticNodeInsideImage(node, image));
  }
  
  function tableZoneSemanticNativeTextBoxes(image = {}, textBoxes = []) {
    const existingTextBoxes = (textBoxes || [])
      .filter((textBox) => textBox?.box && boxCenterInside(textBox.box, image.box))
      .filter((textBox) => normalizeMatrixLabel(textBox.text));
    return tableZoneSemanticTextBoxes(image)
      .filter((textBox) => !existingTextBoxes.some((existing) => sameDiagramLabel(existing, textBox)))
      .map((textBox, index) => tableZoneSemanticTextBox(image, textBox, index));
  }
  
  function tableZoneSemanticTextBoxes(image = {}) {
    const nodes = Array.isArray(image?.source?.layer?.diagramUnderstanding?.nodes)
      ? image.source.layer.diagramUnderstanding.nodes
      : [];
    return nodes
      .filter((node) => tableZoneSemanticNodeInsideImage(node, image))
      .map((node, index) => ({
        id: node.sourceTextBoxId || `${image.id || "table-zone"}-semantic-node-${index}`,
        text: String(node.text || ""),
        box: node.box,
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "table-zone-semantic-node",
          semanticTextSource: true,
          semanticNodeId: node.id || ""
        }
      }));
  }
  
  function tableZoneSemanticNodeInsideImage(node = {}, image = {}) {
    if (!node?.box || !boxCenterInside(node.box, image?.box || {})) return false;
    const compact = normalizeMatrixLabel(node.text);
    if (!compact) return false;
    if (compact.length < 2) return false;
    if (/^[^\p{L}\p{N}]+$/u.test(compact)) return false;
    return true;
  }
  
  function tableZoneSemanticTextBox(image = {}, textBox = {}, index = 0) {
    const next = JSON.parse(JSON.stringify(textBox));
    const compact = normalizeMatrixLabel(next.text);
    const hostAtom = findTableZoneSemanticHostAtom(image, next);
    if (shouldCenterTableZoneSemanticLabelInHost(hostAtom, next)) {
      next.box = tableZoneSemanticHostLabelBox(hostAtom.box, next.box);
    }
    const role = /^(?:PRD|API|UI|Ul|assets|prototype|Runtime|Catalog|config|system)/i.test(compact)
      ? "technical-label"
      : /系统|引擎|配置|原型|门户|资产/.test(compact)
        ? "domain-label"
        : "cell-label";
    next.id = next.id || `${image.id || "table-zone"}-native-semantic-text-${index}`;
    next.font = {
      ...(next.font || {}),
      color: tableZoneSemanticTextColor(role, next.font?.color, hostAtom),
      opacity: 1,
      weight: role === "domain-label" ? "bold" : (next.font?.weight || "regular"),
      sizePt: next.font?.sizePt || Math.max(7, Math.min(13, Number(next.box?.h || 12) * 0.72))
    };
    if (hostAtom) {
      next.font.align = shouldCenterTableZoneSemanticLabelInHost(hostAtom, next) ? "center" : (next.font.align || "center");
      next.font.valign = "middle";
    }
    next.style = {
      ...(next.style || {}),
      ...(hostAtom ? {
        marginLeftPt: 0,
        marginRightPt: 0,
        marginTopPt: 0,
        marginBottomPt: 0,
        wrap: false
      } : {})
    };
    next.source = {
      ...(next.source || {}),
      editable: true,
      nativeRebuild: true,
      detector: "table-zone-semantic-native-visible-label",
      expressionForm: "table-or-grid",
      expressionSubtype: "semantic-grid-label",
      layerSourceId: image.id || null,
      overlayVisibility: "visible",
      role,
      textErasedFromCrop: true,
      ...(hostAtom ? {
        labelAnchoredToNativeAtom: true,
        labelHostAtomId: hostAtom.id || null,
        labelHostAtomKind: hostAtom.kind || null,
        labelHostAtomFill: normalizeHex(hostAtom.color, "")
      } : {})
    };
    return next;
  }
  
  function findTableZoneSemanticHostAtom(image = {}, textBox = {}) {
    const atoms = tableZoneSemanticVisualAtoms(image)
      .filter((atom) => atom?.box)
      .filter((atom) => /native-(?:rect|ellipse)-candidate/.test(String(atom.kind || "")))
      .filter((atom) => normalizeHex(atom.color, ""));
    if (atoms.length === 0 || !textBox?.box) return null;
    const center = centerOfBox(textBox.box);
    const containing = atoms
      .filter((atom) => pointInsideBox(center, expandPtBox(atom.box, DEFAULT_SLIDE, 3, 3)))
      .sort((a, b) => boxArea(a.box) - boxArea(b.box));
    return containing[0] || null;
  }
  
  function tableZoneSemanticVisualAtoms(image = {}) {
    const layer = image?.source?.layer || {};
    const understanding = layer.diagramUnderstanding || {};
    if (Array.isArray(understanding.visualAtoms)) return understanding.visualAtoms;
    if (Array.isArray(layer.visualAtoms)) return layer.visualAtoms;
    return [];
  }
  
  
  
  
  
  function tableZoneSemanticTextColor(role, fallback, hostAtom = null) {
    const hostFill = normalizeHex(hostAtom?.color, "");
    if (hostFill) return tableZoneSemanticContrastTextColor(hostFill);
    const normalized = normalizeHex(fallback, "");
    if (normalized) return normalized;
    if (role === "domain-label") return "#1F4E79";
    if (role === "technical-label") return "#23384D";
    return "#26323D";
  }
  
  
  
  
  
  
  
  function maybeEraseTableZoneSemanticText({ image, textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null }) {
    if (!sourceImage || textBoxes.length === 0) return [];
    const assetFile = resolveAssetPathForIr(image.assetPath, irDir);
    if (!assetFile) return [];
    const masks = textBoxes.map((item) => ptToPxBox(item.box, sourceImage, slideSize, 3));
    if (masks.length === 0) return [];
    const erased = eraseMasks(sourceImage, masks);
    const crop = cropPng(erased, ptToPxBox(image.box, sourceImage, slideSize, 0));
    ensureDir(path.dirname(assetFile));
    writePng(assetFile, crop);
    return textBoxes;
  }

  return {
    createTableZoneSemanticTextBoxes,
    tableZoneSemanticNodeInsideImage
  };
}

module.exports = {
  createTableZoneSemanticTextFactory
};
