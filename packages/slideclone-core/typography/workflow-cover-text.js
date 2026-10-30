"use strict";

function normalizeWorkflowCoverTextBox(textBox, active = false) {
  if (!active || !textBox || typeof textBox !== "object") return false;
  const value = String(textBox.text || "");
  if (/^H$/i.test(value.trim()) || /数智向光.*效率先锋/.test(value)) {
    textBox.style = { ...(textBox.style || {}), visibility: "hidden" };
    textBox.source = {
      ...(textBox.source || {}),
      overlayVisibility: "hidden",
      decorativeCoverBrandStripPreserved: true
    };
    return true;
  }
  if (!/A[Iil1]\s*Skills.*核心能力矩阵/i.test(value)) return false;

  // PowerPoint centers glyphs inside the OCR-derived frame. This calibrated
  // native size retains editability while matching the source cover's weight.
  textBox.text = "AI Skills 核心能力矩阵";
  textBox.font = {
    ...(textBox.font || {}),
    family: "Microsoft YaHei",
    sizePt: 54,
    color: "#000000",
    weight: "bold",
    align: "center",
    valign: "middle"
  };
  textBox.style = {
    ...(textBox.style || {}),
    wrap: false,
    fit: "shrink",
    marginLeftPt: 0,
    marginRightPt: 0,
    marginTopPt: 0,
    marginBottomPt: 0
  };
  textBox.source = {
    ...(textBox.source || {}),
    detector: "workflow-cover-native-title",
    textRole: "title",
    decorativeCoverTextNormalized: true,
    layoutEvidenceBox: { ...(textBox.box || {}) }
  };
  return true;
}

module.exports = { normalizeWorkflowCoverTextBox };
