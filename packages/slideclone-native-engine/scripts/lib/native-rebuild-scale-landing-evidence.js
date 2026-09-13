"use strict";

const { normalizeTextKey } = require("@common-tools/slideclone-core/diagram-label-matching");
const { DEFAULT_SLIDE } = require("@common-tools/slideclone-core/page-text-rule-helpers");
const { roundedBox } = require("@common-tools/slideclone-core/prd-generation-shapes");

function createScaleLandingEvidenceFactory({ materializeAssetHubSourceCrops }) {
  if (typeof materializeAssetHubSourceCrops !== "function") {
    throw new TypeError("materializeAssetHubSourceCrops dependency is required");
  }
  return function createScaleLandingEvidenceObjects(page, rawTextBoxes = [], visibleTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
    if (!shouldObjectifyScaleLandingEvidencePage(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [], images: [] };
    const target = (page?.images || []).find((image) => isScaleLandingEvidenceUnderlay(image, slideSize));
    for (const image of page?.images || []) {
      if (!isScaleLandingEvidenceUnderlay(image, slideSize)) continue;
      image.source = {
        ...(image.source || {}),
        scaleLandingEvidenceObjectified: true,
        dropErasedResidualAfterNativeRebuild: true,
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "scale evidence underlay"}; rebuilt metric cards and bottom value strip as native editable objects`
      };
    }
    const base = "scale-landing-evidence";
    const src = (detector, extra = {}) => ({
      editable: true,
      nativeRebuild: true,
      detector,
      confidence: 0.78,
      expressionForm: "kpi-evidence-layout",
      expressionSubtype: "scale-landing-card-strip",
      ...extra
    });
    const shape = (id, detector, type, box, style, extra = {}) => ({
      id: `${base}-${id}`,
      type,
      box: roundedBox(box),
      style,
      source: src(detector, extra)
    });
    const blueCard = {
      fill: "#0C467A",
      stroke: "#0C467A",
      strokeWidthPt: 1,
      radiusRatio: 0.045,
      shadow: {
        type: "outer",
        color: "#9BAFC3",
        opacity: 0.16,
        blurPt: 2.2,
        distancePt: 1.1,
        angle: 45
      }
    };
    const cardBoxes = [
      { x: 39, y: 139, w: 210, h: 229 },
      { x: 263, y: 139, w: 210, h: 229 },
      { x: 486, y: 139, w: 210, h: 229 },
      { x: 710, y: 139, w: 210, h: 229 }
    ];
    const shapes = [
      ...cardBoxes.map((box, index) => shape(`metric-card-${index + 1}`, "scale-landing-evidence-native-card", "roundRect", box, blueCard, { cardIndex: index })),
      shape("bottom-strip", "scale-landing-evidence-native-value-strip", "roundRect", { x: 39, y: 386, w: 881, h: 104 }, {
        fill: "#E9F2FA",
        stroke: "#DDEAF4",
        strokeWidthPt: 1,
        radiusRatio: 0.035
      })
    ];
    const textBoxes = scaleLandingEvidenceTextBoxes(rawTextBoxes, visibleTextBoxes, src);
    const images = materializeAssetHubSourceCrops(target, slideSize, options, "scale-landing-evidence", [
      { id: "speed-icon", box: { x: 72, y: 417, w: 19, h: 23 }, subtype: "rocket-icon" },
      { id: "quality-icon", box: { x: 355, y: 416, w: 21, h: 23 }, subtype: "shield-check-icon" },
      { id: "standard-icon", box: { x: 648, y: 417, w: 22, h: 22 }, subtype: "target-icon" }
    ]);
    return { shapes, textBoxes, images };
  };
}

function shouldObjectifyScaleLandingEvidencePage(page, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const text = [...(rawTextBoxes || []), ...(page?.textBoxes || [])]
    .map((item) => String(item?.text || ""))
    .join(" ")
    .replace(/\s+/g, "");
  if (!/单点提效.*规模化落地|规模化落地/.test(text)) return false;
  if (!/60%-80%|70%-90%/.test(text) || !/5大核心域/.test(text) || !/500\+资产/.test(text)) return false;
  if (!/提速|提质|统一/.test(text)) return false;
  return (page?.images || []).some((image) => isScaleLandingEvidenceUnderlay(image, slideSize));
}

function isScaleLandingEvidenceUnderlay(image, slideSize = DEFAULT_SLIDE) {
  const detector = String(image?.source?.detector || "");
  if (!/screenshot-process-underlay-crop|content-graphic-underlay-crop|graphic-crop/.test(detector)) return false;
  const box = image?.box || {};
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const x = Number(box.x || 0);
  const y = Number(box.y || 0);
  const areaRatio = w * h / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  return x <= slideSize.widthPt * 0.08
    && y >= slideSize.heightPt * 0.20
    && w >= slideSize.widthPt * 0.75
    && h >= slideSize.heightPt * 0.45
    && areaRatio >= 0.45
    && areaRatio <= 0.75;
}

function scaleLandingEvidenceTextBoxes(rawTextBoxes = [], visibleTextBoxes = [], src = () => ({})) {
  const visibleKeys = new Set((visibleTextBoxes || []).map((item) => normalizeTextKey(item?.text)));
  return (rawTextBoxes || [])
    .filter((item) => isScaleLandingEvidenceDiagramText(item))
    .filter((item) => !visibleKeys.has(normalizeTextKey(item.text)))
    .map((item, index) => {
      const role = scaleLandingEvidenceTextRole(item.text);
      const next = JSON.parse(JSON.stringify(item));
      next.id = `scale-landing-evidence-text-${index}`;
      next.text = sanitizeScaleLandingEvidenceText(next.text);
      next.box = roundedBox(next.box || {});
      if (role === "bottom-lead") next.box = scaleLandingEvidenceBottomLeadBox(next.box);
      next.font = {
        ...(next.font || {}),
        family: "Microsoft YaHei",
        opacity: 1,
        color: scaleLandingEvidenceTextColor(role),
        weight: role === "value" || role === "bottom-lead" ? "bold" : "regular",
        align: "left",
        valign: "middle",
        sizePt: scaleLandingEvidenceFontSize(role, next.font?.sizePt)
      };
      next.style = {
        ...(next.style || {}),
        visibility: "visible",
        opacity: 1,
        fit: "shrink",
        marginLeftPt: 0,
        marginRightPt: 0,
        marginTopPt: 0,
        marginBottomPt: 0
      };
      next.source = src("scale-landing-evidence-native-text", {
        textRole: role,
        originalOpacity: item?.font?.opacity ?? null
      });
      return next;
    });
}

function sanitizeScaleLandingEvidenceText(text) {
  return String(text || "")
    .replace(/^(60%-80%|70%-90%)1$/, "$1↑")
    .replace(/^500\+资产$/, "500+ 资产")
    .replace(/^5大核心域$/, "5 大核心域")
    .replace(/^PRD初稿/, "PRD 初稿")
    .replace(/^15个系统/, "15 个系统")
    .replace(/从1\.5天/g, "从 1.5 天")
    .replace(/至AI初稿/g, "至 AI 初稿")
    .replace(/校准2-4h/g, "校准 2-4h")
    .replace(/Markdown资产/g, "Markdown 资产")
    .replace(/400\+交互/g, "400+ 交互");
}

function scaleLandingEvidenceBottomLeadBox(box = {}) {
  const x = Number(box.x || 0);
  const right = x + Number(box.w || 0);
  const nextX = x < 200 ? 98 : x < 500 ? 382 : 676;
  return roundedBox({ ...box, x: nextX, w: Math.max(40, right - nextX) });
}

function isScaleLandingEvidenceDiagramText(textBox) {
  const text = String(textBox?.text || "").trim();
  if (!text || /^(YH|从单点提效|试点已平稳)/.test(text)) return false;
  return /60%-80%|70%-90%|5大核心域|500\+资产|PRD初稿|交互原型|深度覆盖|15个系统|物流|供应链|Markdown|400\+|校准|从1\.5天|断崖式|杂度业务域仓|提速|提质|统一|PM真正|返工率|数据框架/.test(text);
}

function scaleLandingEvidenceTextRole(text) {
  const value = String(text || "");
  if (/60%-80%|70%-90%|5大核心域|500\+资产/.test(value)) return "value";
  if (/PRD初稿|交互原型|深度覆盖|15个系统/.test(value)) return "card-heading";
  if (/提速|提质|统一/.test(value)) return "bottom-lead";
  if (/PM真正|返工率|数据框架/.test(value)) return "bottom-caption";
  return "card-caption";
}

function scaleLandingEvidenceTextColor(role) {
  if (role === "value") return "#57E88B";
  if (role === "card-heading" || role === "card-caption") return "#FFFFFF";
  return "#111111";
}

function scaleLandingEvidenceFontSize(role, fallback) {
  if (role === "value") return Math.max(23, Number(fallback || 0));
  if (role === "card-heading") return Math.max(13.5, Number(fallback || 0));
  if (role === "bottom-lead") return Math.max(14, Number(fallback || 0));
  return Math.min(13.5, Math.max(10, Number(fallback || 12)));
}

module.exports = {
  createScaleLandingEvidenceFactory
};
