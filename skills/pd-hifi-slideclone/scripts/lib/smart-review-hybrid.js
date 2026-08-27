"use strict";

const SMART_REVIEW_PICTORIAL_REGIONS = Object.freeze([
  Object.freeze({ id: "banner-gem", box: Object.freeze({ x: 57, y: 107, w: 47, h: 41 }), subtype: "banner-gem-icon" }),
  Object.freeze({ id: "skill-review-icon", box: Object.freeze({ x: 357, y: 181, w: 72, h: 67 }), subtype: "skill-review-illustration" }),
  Object.freeze({ id: "skill-document-scan", box: Object.freeze({ x: 319, y: 297, w: 160, h: 119 }), subtype: "document-scan-illustration" }),
  Object.freeze({ id: "prd-gem", box: Object.freeze({ x: 595, y: 216, w: 61, h: 64 }), subtype: "prd-asset-gem-icon" })
]);

const TEXT_RULES = Object.freeze([
  { match: /智能生成与前置评审.*防御型PRD交付标准/, text: "智能生成与前置评审：构建防御型 PRD 交付标准", sizePt: 25.2, align: "left", weight: "bold" },
  { match: /Gem提炼.*标准结构文档.*逻辑矛盾/, text: "【Gem 提炼】：自动输出标准结构文档，并在研发介入前彻底拦截逻辑矛盾。", sizePt: 12.15, align: "left", weight: "bold" },
  { match: /完美版PRD资产/, text: "完美版 PRD 资产", sizePt: 15, align: "center", weight: "bold", box: { x: 684, y: 191, w: 170, h: 25 } },
  { match: /风险拦截池|风险问题池/, text: "风险拦截池", sizePt: 15.5, align: "center", weight: "bold", box: { x: 600, y: 357, w: 132, h: 20 } },
  { match: /质量前置让评审/, text: "质量前置：让评审", sizePt: 12.15, align: "left", weight: "regular", box: { x: 754, y: 393, w: 155, h: 18 } },
  { match: /从会后补救变为/, text: "从“会后补救”变为", sizePt: 16, align: "left", weight: "bold", box: { x: 752, y: 415, w: 170, h: 23 } },
  { match: /交付前彻底拦截/, text: "“交付前彻底拦截”", sizePt: 16, align: "left", weight: "bold", box: { x: 752, y: 440, w: 170, h: 23 } }
]);

function smartReviewPictorialRegions() {
  return SMART_REVIEW_PICTORIAL_REGIONS.map((region) => ({
    ...region,
    box: { ...region.box }
  }));
}

function normalizeSmartReviewTextBoxes(textBoxes) {
  if (!Array.isArray(textBoxes)) return [];
  const pageText = normalizeText(textBoxes.map((item) => item?.text || "").join(" "));
  if (!/智能生成与前置评审/.test(pageText) || !/风险拦截池|风险问题池|逻辑矛盾|异常路径缺失/.test(pageText)) {
    return textBoxes;
  }
  return textBoxes.map((textBox) => {
    const normalized = normalizeText(textBox?.text);
    const rule = TEXT_RULES.find((candidate) => candidate.match.test(normalized));
    if (!rule) return textBox;
    return {
      ...textBox,
      text: rule.text,
      box: rule.box ? { ...rule.box } : { ...(textBox.box || {}) },
      font: {
        ...(textBox.font || {}),
        family: "SimHei",
        sizePt: rule.sizePt,
        weight: rule.weight,
        align: rule.align,
        valign: "middle"
      },
      style: {
        ...(textBox.style || {}),
        wrap: false,
        fit: "shrink",
        marginLeftPt: 0,
        marginRightPt: 0,
        marginTopPt: 0,
        marginBottomPt: 0
      },
      source: {
        ...(textBox.source || {}),
        smartReviewHybridTextNormalized: true
      }
    };
  });
}

function normalizeText(value) {
  return String(value || "").replace(/[\s：:【】\[\]“”"'，,。.!！、（）()_-]+/g, "");
}

module.exports = {
  normalizeSmartReviewTextBoxes,
  smartReviewPictorialRegions
};
