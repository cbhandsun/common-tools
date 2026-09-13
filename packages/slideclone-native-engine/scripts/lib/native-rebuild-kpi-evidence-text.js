"use strict";

const path = require("path");
const { looksLikeLargeKpiValue } = require("@common-tools/slideclone-core/native-text-style");
const { DEFAULT_SLIDE } = require("@common-tools/slideclone-core/page-text-rule-helpers");
const {
  ensureDir,
  eraseMasks,
  resolveAssetPathForIr
} = require("@common-tools/slideclone-core/residual-primitive-erasure");
const {
  boxCenterInside,
  normalizeHex,
  ptToPxBox
} = require("@common-tools/slideclone-core/raster-native-detection");
const { cropPng, writePng } = require("./png");

function createKpiEvidenceTextShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null) {
  if (!sourceImage) return [];
  for (const image of images || []) {
    if (image?.source?.detector !== "kpi-evidence-crop") continue;
    const nativeTextBoxes = maybeEraseKpiEvidenceText({
      image,
      textBoxes: kpiEvidenceNativeTextBoxes(image, textBoxes),
      sourceImage,
      slideSize,
      irDir
    });
    if (nativeTextBoxes.length === 0) continue;
    image.source = {
      ...(image.source || {}),
      kpiEvidenceTextObjectified: true,
      kpiEvidenceNativeTextBoxes: nativeTextBoxes,
      objectifiedKpiEvidenceTextBoxes: nativeTextBoxes.length,
      preserveKpiEvidenceCropUnderNativeText: true,
      dropErasedResidualAfterNativeRebuild: false,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; KPI labels erased from crop and rebuilt as editable native text`
    };
  }
  return [];
}

function kpiEvidenceNativeTextBoxes(image, textBoxes = []) {
  const box = image?.box || {};
  return (textBoxes || [])
    .filter((textBox) => textBox?.box && boxCenterInside(textBox.box, box))
    .filter((textBox) => isKpiEvidenceInternalLabel(textBox))
    .map((textBox, index) => kpiEvidenceTextBox(image, textBox, index));
}

function isKpiEvidenceInternalLabel(textBox) {
  const text = String(textBox?.text || "").trim();
  if (!text) return false;
  return looksLikeLargeKpiValue(text)
    || /PRD|UI|组件|系统|底座|深度接入|沉淀|回流|AISkills|企业级|基础设施/.test(text);
}

function kpiEvidenceTextBox(image, textBox, index) {
  const next = JSON.parse(JSON.stringify(textBox));
  const role = looksLikeLargeKpiValue(next.text)
    ? "kpi-value"
    : /AISkills|企业级|基础设施/.test(String(next.text || ""))
      ? "kpi-conclusion"
      : "kpi-caption";
  next.id = next.id || `${image.id || "kpi-evidence"}-native-text-${index}`;
  const fallbackColor = role === "kpi-caption" ? "#132037" : "#0D70C8";
  next.font = {
    ...(next.font || {}),
    color: normalizeHex(next.font?.color, fallbackColor),
    opacity: 1,
    weight: role === "kpi-value" ? "bold" : (next.font?.weight || "regular")
  };
  next.source = {
    ...(next.source || {}),
    editable: true,
    nativeRebuild: true,
    detector: "kpi-evidence-native-visible-label",
    expressionForm: "chart-snapshot",
    expressionSubtype: "kpi-chart-snapshot",
    layerSourceId: image.id || null,
    overlayVisibility: "visible",
    role,
    textErasedFromCrop: true
  };
  return next;
}

function maybeEraseKpiEvidenceText({ image, textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null }) {
  if (!sourceImage || textBoxes.length === 0) return [];
  const assetFile = resolveAssetPathForIr(image.assetPath, irDir);
  if (!assetFile) return [];
  const masks = textBoxes.map((item) => ptToPxBox(item.box, sourceImage, slideSize, 5));
  if (masks.length === 0) return [];
  const erased = eraseMasks(sourceImage, masks);
  const crop = cropPng(erased, ptToPxBox(image.box, sourceImage, slideSize, 0));
  ensureDir(path.dirname(assetFile));
  writePng(assetFile, crop);
  return textBoxes;
}

module.exports = {
  createKpiEvidenceTextShapes
};
