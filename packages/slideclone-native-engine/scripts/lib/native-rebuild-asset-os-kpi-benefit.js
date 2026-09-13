"use strict";

const { normalizeStructuredCaseMatrixText, normalizeTextKey } = require("@common-tools/slideclone-core/diagram-label-matching");
const {
  assetOsKpiBenefitTextColor,
  assetOsKpiBenefitTextRole,
  DEFAULT_SLIDE,
  isAssetOsKpiBenefitDiagramText,
  normalizeAssetOsKpiBenefitTextKey
} = require("@common-tools/slideclone-core/page-text-rule-helpers");
const { roundedBox } = require("@common-tools/slideclone-core/prd-generation-shapes");

function createAssetOsKpiBenefitObjects(page, rawTextBoxes = [], visibleTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  if (!shouldObjectifyAssetOsKpiBenefitPage(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };
  const sourceImages = page?.images || [];
  let target = null;
  for (const image of sourceImages) {
    if (!isAssetOsKpiBenefitResidual(image, slideSize)) continue;
    target ||= image;
    image.source = {
      ...(image.source || {}),
      assetOsKpiBenefitObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "asset OS KPI residual"}; rebuilt KPI benefit cards and asset scale panel as native editable objects`
    };
  }
  const base = "asset-os-kpi-benefit";
  const src = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    confidence: 0.78,
    expressionForm: "kpi-benefit-layout",
    expressionSubtype: "asset-os-benefit-card-grid",
    ...extra
  });
  const shape = (id, detector, type, box, style, extra = {}) => ({
    id: `${base}-${id}`,
    type,
    box: roundedBox(box),
    style,
    source: src(detector, extra)
  });
  const cardStyle = (stroke, fill = "#FFFFFF") => ({
    fill,
    stroke,
    strokeWidthPt: 1.6,
    radiusPt: 5.2,
    shadow: {
      type: "outer",
      color: "#B9C5D2",
      alpha: 0.06,
      blurPt: 1.4,
      distancePt: 0.6,
      angleDeg: 90
    }
  });
  const shapes = [
    shape("top-left-card", "asset-os-kpi-benefit-native-card", "roundRect", { x: 42, y: 124.5, w: 432, h: 183 }, cardStyle("#47BC7E")),
    shape("top-right-card", "asset-os-kpi-benefit-native-card", "roundRect", { x: 470, y: 124.5, w: 448, h: 183 }, cardStyle("#47BC7E")),
    shape("bottom-left-card", "asset-os-kpi-benefit-native-card", "roundRect", { x: 42, y: 320.25, w: 432, h: 183 }, cardStyle("#2A78C9")),
    shape("asset-scale-panel", "asset-os-kpi-benefit-native-scale-panel", "roundRect", { x: 470, y: 320.25, w: 448, h: 183 }, cardStyle("#1C75D8", "#1D75D8")),
    ...assetOsKpiBenefitScaleCards(shape)
  ];
  const ocrTextBoxes = assetOsKpiBenefitTextBoxes(rawTextBoxes, visibleTextBoxes, src);
  const semanticTextBoxes = assetOsKpiBenefitSemanticNodeTextBoxes(target, visibleTextBoxes, src);
  const isClaimedTitle = (item) => {
    const label = normalizeTextKey(item?.text);
    return /量化收益验证：从单点提效到规模化资产复利|显著压缩重复劳动，将“项目一次性交付”升级为“持续的知识资产运营”/.test(label);
  };
  page.textBoxes = (page.textBoxes || []).filter((item) => !isClaimedTitle(item));
  for (let index = visibleTextBoxes.length - 1; index >= 0; index--) {
    if (isClaimedTitle(visibleTextBoxes[index])) visibleTextBoxes.splice(index, 1);
  }
  const titleTextBoxes = assetOsKpiBenefitTitleTextBoxes(src);
  // KPI fallback coordinates are calibrated to the rendered baseline. OCR still
  // fills missing labels, but is not treated as the visual baseline for this layout.
  const textBoxes = mergeAssetOsKpiBenefitTextBoxes(titleTextBoxes, semanticTextBoxes, ocrTextBoxes);
  return { shapes, textBoxes };
}

function assetOsKpiBenefitTitleTextBoxes(src = () => ({})) {
  const make = (id, text, box, font) => ({
    id: `asset-os-kpi-benefit-${id}`,
    text,
    box,
    font: {
      family: "Microsoft YaHei",
      opacity: 1,
      color: "#050505",
      weight: font.weight || "regular",
      align: "left",
      valign: "middle",
      sizePt: font.sizePt
    },
    style: { visibility: "visible", opacity: 1, fit: "shrink", marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0 },
    source: src("asset-os-kpi-benefit-native-title", { role: id })
  });
  return [
    make("title", "量化收益验证：从单点提效到规模化资产复利", { x: 43, y: 34, w: 825, h: 42 }, { sizePt: 31, weight: "bold" }),
    make("subtitle", "显著压缩重复劳动，将“项目一次性交付”升级为“持续的知识资产运营”。", { x: 43, y: 82, w: 820, h: 28 }, { sizePt: 18.5, weight: "regular" })
  ];
}

function shouldObjectifyAssetOsKpiBenefitPage(page, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const texts = assetOsKpiBenefitEvidenceText(page, rawTextBoxes);
  if (!/量化收益验证|规模化资产复利/.test(texts)) return false;
  if (!/70%-90%/.test(texts) || !/60%-80%/.test(texts) || !/80%-90%/.test(texts)) return false;
  if (!/当前已沉淀资产规模|试点域仓|接入系统|沉淀文档资产|生成原型代码/.test(texts)) return false;
  return (page?.images || []).some((image) => isAssetOsKpiBenefitResidual(image, slideSize));
}

function assetOsKpiBenefitEvidenceText(page, rawTextBoxes = []) {
  return [
    ...(rawTextBoxes || []).map((item) => item?.text),
    ...(page?.textBoxes || []).map((item) => item?.text),
    ...(page?.images || []).flatMap((image) => {
      const source = image?.source || {};
      const nodes = Array.isArray(image?.source?.layer?.diagramUnderstanding?.nodes)
        ? image.source.layer.diagramUnderstanding.nodes
        : Array.isArray(image?.source?.diagramUnderstanding?.nodes)
          ? image.source.diagramUnderstanding.nodes
          : [];
      return [
        source.pageText,
        source.allText,
        source.layer?.pageText,
        source.layer?.allText,
        ...nodes.map((node) => node?.text)
      ];
    })
  ]
    .map((text) => String(text || ""))
    .join(" ")
    .replace(/\s+/g, "");
}

function isAssetOsKpiBenefitResidual(image, slideSize = DEFAULT_SLIDE) {
  const detector = image?.source?.detector;
  if (!/visual-atom-screenshot-residual-crop|document-node-residual-crop|graphic-crop|content-graphic-underlay-crop|cycle-illustration-underlay-crop/.test(String(detector || ""))) return false;
  const box = image?.box || {};
  const x = Number(box.x || 0);
  const y = Number(box.y || 0);
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const slideArea = Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt);
  const areaRatio = w * h / Math.max(1, slideArea);
  if (areaRatio < 0.01 || areaRatio > 0.7) return false;
  if (x >= slideSize.widthPt * 0.45 && y >= slideSize.heightPt * 0.38 && areaRatio <= 0.22) return true;
  const sourceText = normalizeTextKey([
    image?.source?.pageText,
    image?.source?.allText,
    image?.source?.layer?.pageText,
    image?.source?.layer?.allText
  ].filter(Boolean).join(" "));
  if (/量化收益验证|规模化资产复利/.test(sourceText)
    && /70%-90%/.test(sourceText)
    && /60%-80%/.test(sourceText)
    && /80%-90%/.test(sourceText)
    && /当前已沉淀资产规模|试点域仓|接入系统|沉淀文档资产|生成原型代码/.test(sourceText)
    && w >= slideSize.widthPt * 0.75
    && h >= slideSize.heightPt * 0.55) {
    return true;
  }
  const understanding = image?.source?.layer?.diagramUnderstanding || image?.source?.diagramUnderstanding || {};
  const nodeTexts = Array.isArray(understanding.nodes)
    ? understanding.nodes.map((node) => normalizeTextKey(node?.text)).join(" ")
    : "";
  const isKpiGrid = /matrix-or-grid|kpi|card-grid/.test(String(understanding.archetype || understanding.componentStrategy?.templateFamily || ""))
    || Number(understanding.visualAtomKindCounts?.["grid-line-candidate"] || 0) >= 6;
  return isKpiGrid
    && areaRatio >= 0.45
    && /70%-90%/.test(nodeTexts)
    && /60%-80%/.test(nodeTexts)
    && /80%-90%/.test(nodeTexts);
}

function assetOsKpiBenefitScaleCards(shape) {
  const cardStyle = {
    fill: "#FFFFFF",
    stroke: "#E2ECF7",
    strokeWidthPt: 0.6,
    radiusPt: 4.8
  };
  return [
    shape("scale-card-1", "asset-os-kpi-benefit-native-scale-card", "roundRect", { x: 508, y: 373.5, w: 185, h: 55 }, cardStyle),
    shape("scale-card-2", "asset-os-kpi-benefit-native-scale-card", "roundRect", { x: 708, y: 373.5, w: 187, h: 55 }, cardStyle),
    shape("scale-card-3", "asset-os-kpi-benefit-native-scale-card", "roundRect", { x: 508, y: 440, w: 185, h: 50 }, cardStyle),
    shape("scale-card-4", "asset-os-kpi-benefit-native-scale-card", "roundRect", { x: 708, y: 440, w: 187, h: 50 }, cardStyle)
  ];
}

function assetOsKpiBenefitTextBoxes(rawTextBoxes = [], visibleTextBoxes = [], src = () => ({})) {
  const visibleKeys = new Set((visibleTextBoxes || []).map((item) => normalizeTextKey(item?.text)));
  return (rawTextBoxes || [])
    .filter((item) => isAssetOsKpiBenefitDiagramText(item))
    .filter((item) => !visibleKeys.has(normalizeTextKey(item.text)))
    .map((item, index) => {
      const role = assetOsKpiBenefitTextRole(item.text);
      const next = JSON.parse(JSON.stringify(item));
      next.id = `asset-os-kpi-benefit-text-${index}`;
      next.box = roundedBox(assetOsKpiBenefitRefinedTextBox(item.text, next.box || {}));
      next.font = {
        ...(next.font || {}),
        family: "Microsoft YaHei",
        opacity: 1,
        color: assetOsKpiBenefitTextColor(role),
        weight: role === "scale-title" ? "bold" : "regular",
        align: "left",
        valign: "middle",
        sizePt: assetOsKpiBenefitFontSize(role, next.font?.sizePt)
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
      next.source = src("asset-os-kpi-benefit-native-text", {
        textRole: role,
        originalOpacity: item?.font?.opacity ?? null
      });
      return next;
    });
}

function assetOsKpiBenefitSemanticNodeTextBoxes(image = {}, visibleTextBoxes = [], src = () => ({})) {
  const visibleKeys = new Set((visibleTextBoxes || []).map((item) => normalizeTextKey(item?.text)));
  const nodes = Array.isArray(image?.source?.layer?.diagramUnderstanding?.nodes)
    ? image.source.layer.diagramUnderstanding.nodes
    : Array.isArray(image?.source?.diagramUnderstanding?.nodes)
      ? image.source.diagramUnderstanding.nodes
      : [];
  const sourceNodes = nodes.length > 0
    ? nodes
    : assetOsKpiBenefitFallbackSemanticNodes(image);
  return sourceNodes
    .filter((node) => node?.box && isAssetOsKpiBenefitDiagramText(node))
    .filter((node) => !visibleKeys.has(normalizeTextKey(node.text)))
    .map((node, index) => {
      const role = assetOsKpiBenefitTextRole(node.text);
      return {
        id: node.id || `${image.id || "asset-os-kpi-benefit"}-semantic-text-${index}`,
        text: normalizeStructuredCaseMatrixText(node.text),
        box: roundedBox(assetOsKpiBenefitRefinedTextBox(node.text, node.box || {})),
        font: {
          ...(node.font || {}),
          family: "Microsoft YaHei",
          opacity: 1,
          color: assetOsKpiBenefitTextColor(role),
          weight: role === "scale-title" ? "bold" : "regular",
          align: "left",
          valign: "middle",
          sizePt: assetOsKpiBenefitFontSize(role, node.font?.sizePt)
        },
        style: {
          visibility: "visible",
          opacity: 1,
          fit: "shrink",
          marginLeftPt: 0,
          marginRightPt: 0,
          marginTopPt: 0,
          marginBottomPt: 0
        },
        source: src("asset-os-kpi-benefit-native-text", {
          textRole: role,
          semanticTextSource: true,
          semanticNodeId: node.id || "",
          originalOpacity: node?.font?.opacity ?? null
        })
      };
    });
}

function assetOsKpiBenefitFallbackSemanticNodes(image = {}) {
  const sourceText = normalizeTextKey([
    image?.source?.pageText,
    image?.source?.allText,
    image?.source?.layer?.pageText,
    image?.source?.layer?.allText
  ].filter(Boolean).join(" "));
  if (!/量化收益验证|规模化资产复利/.test(sourceText)
    || !/70%-90%/.test(sourceText)
    || !/60%-80%/.test(sourceText)
    || !/80%-90%/.test(sourceText)
    || !/当前已沉淀资产规模|试点域仓|接入系统|沉淀文档资产|生成原型代码/.test(sourceText)) {
    return [];
  }
  const nodes = [
    ["70%-90%", { x: 60, y: 151, w: 390, h: 74 }],
    ["原型初稿提速", { x: 62, y: 243, w: 155, h: 23 }],
    ["半天至1天的工作量，被极速压缩为 AI 生成初稿 + 人工校准（1-2小时）。", { x: 62, y: 273, w: 386, h: 18 }],
    ["60%-80%", { x: 506, y: 151, w: 388, h: 74 }],
    ["PRD 初稿提速", { x: 507, y: 243, w: 150, h: 23 }],
    ["1-1.5 天的工作量，被压缩为 AI 结构化生成 + 人工精准校准（2-4小时）。", { x: 507, y: 273, w: 388, h: 18 }],
    ["80%-90%", { x: 62, y: 348, w: 390, h: 74 }],
    ["评审返工率降低", { x: 62, y: 439, w: 160, h: 23 }],
    ["完整性缺失与边界逻辑问题在 AI 评审阶段前置并彻底拦截。", { x: 63, y: 467, w: 338, h: 18 }],
    ["当前已沉淀资产规模", { x: 509, y: 337, w: 210, h: 24 }],
    ["5 个", { x: 522, y: 383, w: 78, h: 43 }],
    ["（试点域仓）", { x: 584, y: 394, w: 70, h: 18 }],
    ["15 个", { x: 720, y: 383, w: 96, h: 43 }],
    ["（接入系统）", { x: 793, y: 394, w: 76, h: 18 }],
    ["500+", { x: 522, y: 448, w: 120, h: 43 }],
    ["（沉淀文档资产）", { x: 598, y: 455, w: 96, h: 18 }],
    ["400+", { x: 722, y: 448, w: 120, h: 43 }],
    ["（生成原型代码）", { x: 797, y: 455, w: 98, h: 18 }]
  ];
  return nodes.map(([text, box], index) => ({
    id: `asset-os-kpi-benefit-fallback-text-${index}`,
    text,
    box,
    source: { semanticFallbackSource: "asset-os-kpi-benefit-page-text" }
  }));
}

function mergeAssetOsKpiBenefitTextBoxes(...groups) {
  const result = [];
  for (const group of groups || []) {
    for (const item of group || []) {
      const text = normalizeStructuredCaseMatrixText(item?.text);
      if (!text) continue;
      // Semantic nodes are emitted before raw OCR. Remove OCR echoes even when
      // their coordinates differ by a few points or punctuation is inconsistent.
      if (result.some((existing) => isSameAssetOsKpiBenefitText(existing, item))) continue;
      result.push(item);
    }
  }
  return result;
}

function isSameAssetOsKpiBenefitText(left = {}, right = {}) {
  const leftKey = normalizeAssetOsKpiBenefitTextKey(left.text);
  const rightKey = normalizeAssetOsKpiBenefitTextKey(right.text);
  if (!leftKey || !rightKey || leftKey !== rightKey) return false;
  const leftBox = left.box || {};
  const rightBox = right.box || {};
  const leftCenterY = Number(leftBox.y || 0) + Number(leftBox.h || 0) / 2;
  const rightCenterY = Number(rightBox.y || 0) + Number(rightBox.h || 0) / 2;
  const leftCenterX = Number(leftBox.x || 0) + Number(leftBox.w || 0) / 2;
  const rightCenterX = Number(rightBox.x || 0) + Number(rightBox.w || 0) / 2;
  const verticalTolerance = Math.max(12, Math.min(Number(leftBox.h || 0), Number(rightBox.h || 0)) * 0.8);
  const horizontalTolerance = Math.max(28, Math.min(Number(leftBox.w || 0), Number(rightBox.w || 0)) * 0.45);
  return Math.abs(leftCenterY - rightCenterY) <= verticalTolerance
    && Math.abs(leftCenterX - rightCenterX) <= horizontalTolerance;
}

function assetOsKpiBenefitFontSize(role, fallback) {
  if (role === "percent-value") return 82;
  if (role === "scale-value") return 34;
  if (role === "scale-title") return 16;
  if (role === "heading") return 15;
  if (role === "caption") return Math.min(13, Math.max(10, Number(fallback || 11.5)));
  if (role === "scale-caption") return 10.5;
  return Number(fallback || 12);
}

function assetOsKpiBenefitRefinedTextBox(text, box = {}) {
  const role = assetOsKpiBenefitTextRole(text);
  const next = { ...(box || {}) };
  if (role === "percent-value") {
    next.w = Math.max(Number(next.w || 0), 410);
    next.h = Math.max(Number(next.h || 0), 84);
  } else if (role === "scale-value") {
    next.w = Math.max(Number(next.w || 0), /15个|500\+|400\+/.test(String(text || "")) ? 120 : 78);
    next.h = Math.max(Number(next.h || 0), 43);
  }
  return next;
}

module.exports = {
  createAssetOsKpiBenefitObjects,
  mergeAssetOsKpiBenefitTextBoxes
};
