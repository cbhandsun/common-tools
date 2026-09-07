"use strict";
const { normalizeCjkText } = require("./prd-generation-shapes");
const { boxCenterInside, clamp, round, centerOfBox, expandPtBox, normalizeHex, parseHex } = require("./raster-native-detection");
const { resolveRoleFontSize } = require("./font-evidence");
const { shouldKeepStructuredVisualAtomLayerText } = require("./residual-primitive-erasure");
const { normalizeFontWeightForOpenXml } = require("./native-text-style");
const { safeComponentToken } = require("./diagram-residual-crops");
const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };
const ASSET_OS_KPI_FONT_SIZES = Object.freeze({
  "percent-value": 82,
  "scale-value": 34,
  "scale-title": 18,
  heading: 19,
  caption: 11.6,
  "scale-caption": 11.5
});

function normalizeTriangleTopologyDuplicateLabel(text = "") {
  return normalizeCjkText(normalizeTriangleTopologyTopText(text)).toLowerCase();
}

function isTriangleTopologyInternalPreservedCropLabel(text = "") {
  const normalized = normalizeTriangleTopologyDuplicateLabel(text);
  if (!normalized) return false;
  return /原型|高仿|hifi?|基线|可视化|验证|推导prd|评审锁定/.test(normalized);
}

function isPrdDocumentSegmentText(textBox = {}, preservedSegmentBoxes = []) {
  const text = String(textBox?.text || "").trim();
  if (!/^(?:PRD|业务背景|字段规则|异常场景|验收口径)$/.test(text)) return false;
  if (!textBox?.box) return false;
  return preservedSegmentBoxes.some((box) => boxCenterInside(textBox.box, box));
}

function isPrdPreservedSegmentText(textBox = {}, preservedSegmentBoxes = []) {
  const text = String(textBox?.text || "").trim();
  if (/^(?:InteractivePrototype|Interactive Prototype|Structured Brief)$/.test(text)) {
    if (!textBox?.box) return false;
    return preservedSegmentBoxes.some((box) => boxCenterInside(textBox.box, box));
  }
  return isPrdDocumentSegmentText(textBox, preservedSegmentBoxes);
}

function normalizeWmsRouteChainTitle(textBoxes = []) {
  const mainIndex = textBoxes.findIndex((item) => /场景实战\s*II.*物流\s*WMS.*复杂主链路增量/i.test(String(item?.text || "")));
  const suffixIndex = textBoxes.findIndex((item) => /防控.*隐性风险/.test(String(item?.text || "")));
  if (mainIndex < 0 || suffixIndex < 0 || mainIndex === suffixIndex) return textBoxes;
  const main = textBoxes[mainIndex];
  const next = {
    ...main,
    text: "场景实战 II：物流 WMS 复杂主链路增量（防控“隐性风险”）",
    box: { x: 42, y: 42, w: 850, h: 40 },
    font: { ...(main.font || {}), family: "Microsoft YaHei", sizePt: 27, color: "#111111", weight: "bold", align: "left", valign: "middle" },
    style: { ...(main.style || {}), wrap: false, fit: "shrink", marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0 },
    source: { ...(main.source || {}), detector: "wms-route-chain-native-title", normalizedOcrText: true, originalText: `${String(main.text || "")} ${String(textBoxes[suffixIndex]?.text || "")}` }
  };
  return textBoxes.flatMap((item, index) => index === mainIndex ? [next] : index === suffixIndex ? [] : [item]);
}

function mergeShiftLeftAbilityTextBoxes(textBoxes = []) {
  const firstIndex = textBoxes.findIndex((item) => /执行逻辑校验/.test(String(item?.text || "")));
  const secondIndex = textBoxes.findIndex((item) => /扫描异常分支/.test(String(item?.text || "")));
  if (firstIndex < 0 || secondIndex < 0 || firstIndex === secondIndex) return textBoxes;
  const first = textBoxes[firstIndex];
  const second = textBoxes[secondIndex];
  const union = unionPtBoxes([first.box, second.box]);
  if (!union) return textBoxes;
  const merged = {
    ...first,
    text: `${String(first.text || "").trim()}\n${String(second.text || "").trim()}`,
    box: {
      x: round(union.x - 2),
      y: round(union.y - 2),
      w: round(union.w + 4),
      h: round(union.h + 4)
    },
    font: {
      ...(first.font || {}),
      sizePt: round(clamp(Math.max(Number(first.font?.sizePt || 0), Number(second.font?.sizePt || 0), 13.2), 12, 14.5)),
      lineHeightMultiple: 1.32,
      wrap: false
    },
    style: {
      ...(first.style || {}),
      wrap: false
    },
    source: {
      ...(first.source || {}),
      normalizedOcrTextBox: true,
      semanticPageContext: "shift-left-debugger-comparison",
      mergedElementIds: [first.id || null, second.id || null],
      originalTexts: [first.text || "", second.text || ""],
      originalBoxes: [first.box || null, second.box || null]
    }
  };
  return textBoxes.filter((_, index) => index !== firstIndex && index !== secondIndex).concat(merged);
}

function assetOsKpiBenefitRefinedFontSize(role, fallback) {
  return resolveRoleFontSize(role, fallback, ASSET_OS_KPI_FONT_SIZES);
}

function boxesOverlapRatio(a = {}, b = {}) {
  const ax1 = Number(a.x || 0);
  const ay1 = Number(a.y || 0);
  const ax2 = ax1 + Number(a.w || 0);
  const ay2 = ay1 + Number(a.h || 0);
  const bx1 = Number(b.x || 0);
  const by1 = Number(b.y || 0);
  const bx2 = bx1 + Number(b.w || 0);
  const by2 = by1 + Number(b.h || 0);
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
  const intersection = ix * iy;
  const minArea = Math.min(Math.max(1, Number(a.w || 0) * Number(a.h || 0)), Math.max(1, Number(b.w || 0) * Number(b.h || 0)));
  return intersection / minArea;
}

function normalizedChromeEvidenceBox(textBox = {}, fallback, options = {}) {
  const evidence = textBox?.source?.evidenceBox;
  const values = [evidence?.x, evidence?.y, evidence?.w, evidence?.h].map(Number);
  const valid = values.every(Number.isFinite)
    && values[0] >= 0
    && values[1] >= 0
    && values[2] >= 80
    && values[2] <= 900
    && values[3] >= 10
    && values[3] <= 80
    && values[0] + values[2] <= 980
    && values[1] + values[3] <= 560;
  if (!valid) return { box: { ...fallback }, fromEvidence: false };
  const padX = Math.max(0, Math.min(12, Number(options.padX) || 0));
  const padY = Math.max(0, Math.min(8, Number(options.padY) || 0));
  return {
    box: {
      x: round(Math.max(0, values[0] - padX * 0.5)),
      y: round(Math.max(0, values[1] - padY)),
      w: round(Math.min(960 - Math.max(0, values[0] - padX * 0.5), values[2] + padX)),
      h: round(values[3] + padY * 2)
    },
    fromEvidence: true
  };
}

function shouldKeepAssetHubCycleEndpointLabel(textBox, image) {
  if (image?.source?.detector !== "cycle-illustration-underlay-crop") return false;
  const text = String(textBox?.text || "").trim();
  if (!text || /PM\s*Portal|Platform|Skills|分布式域仓/i.test(text)) return false;
  const box = image.box || {};
  const tb = textBox?.box || {};
  const x = Number(box.x || 0);
  const y = Number(box.y || 0);
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const cx = Number(tb.x || 0) + Number(tb.w || 0) / 2;
  const cy = Number(tb.y || 0) + Number(tb.h || 0) / 2;
  if (cx < x || cx > x + w || cy < y || cy > y + h) return false;
  const inLeftLabelColumn = cx <= x + w * 0.18;
  const inRightLabelColumn = cx >= x + w * 0.84;
  if (!inLeftLabelColumn && !inRightLabelColumn) return false;
  const labelBands = [
    [y + h * 0.24, y + h * 0.36],
    [y + h * 0.62, y + h * 0.72],
    [y + h * 0.96, y + h * 1.05]
  ];
  return labelBands.some(([top, bottom]) => cy >= top && cy <= bottom);
}

function shouldRemoveHighRiskInternalOverlayText(image) {
  const source = image?.source || {};
  const form = String(source.expressionForm || "").toLowerCase();
  const action = String(source.recommendedAction || "").toLowerCase();
  if (form === "complex-diagram") {
    return action === "preserve-fidelity-crop-until-subtype-rebuilder-is-confident";
  }
  if (form === "icon-or-illustration") {
    const areaRatio = Number(source.layer?.areaRatio || 0);
    return action === "match-icon-library-or-keep-local-crop" && areaRatio >= 0.28;
  }
  return false;
}

function keepsInternalLayerText(image, options = {}) {
  return image?.source?.textErasedFromCrop === true
    || (options.keepInternalTextForLayerCandidates === true && image?.source?.textObjectified === true)
    || shouldKeepFunnelHubDiagramText(image)
    || shouldKeepStructuredVisualAtomLayerText(image);
}

function shouldKeepFunnelHubDiagramText(image) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};
  if (source.detector !== "structured-case-graphic-underlay-crop") return false;
  if (layer.layerType !== "diagram-zone" || understanding.archetype !== "hub-spoke") return false;
  if (Number(understanding.confidence || 0) < 0.85 || Number(understanding.nodeCount || 0) < 10) return false;
  const nodeText = (understanding.nodes || []).map((node) => String(node?.text || "")).join(" ");
  return /Skills|Screenshots|Mock|HTML|DOC|DoC|处理引擎|提取/.test(nodeText);
}

function shouldKeepFunnelHubTextInResidualCrop(textBox, image) {
  if (!textBox?.box || !image?.box) return false;
  if (!boxCenterInside(textBox.box, image.box)) return false;
  const text = String(textBox.text || "").trim();
  const box = image.box;
  const centerY = Number(textBox.box.y || 0) + Number(textBox.box.h || 0) * 0.5;
  const topInputBottom = box.y + box.h * 0.34;
  if (centerY <= topInputBottom) return true;
  return /^(docs?|docx?|html|screenshots?|mock\s*data)$/i.test(text);
}

function shouldCenterTableZoneSemanticLabelInHost(atom = null, textBox = {}) {
  if (!atom?.box || !textBox?.box) return false;
  if (atom.topologyRole === "container") return false;
  if (Array.isArray(atom.containedAtomIds) && atom.containedAtomIds.length > 0) return false;
  const atomArea = boxArea(atom.box);
  const textArea = boxArea(textBox.box);
  return atomArea >= textArea * 2.1
    && Number(atom.box.w || 0) >= Number(textBox.box.w || 0) + 18
    && Number(atom.box.h || 0) >= Number(textBox.box.h || 0) + 8;
}

function tableZoneSemanticHostLabelBox(hostBox = {}, textBox = {}) {
  const insetX = Math.min(10, Math.max(4, Number(hostBox.w || 0) * 0.07));
  const insetY = Math.min(7, Math.max(3, Number(hostBox.h || 0) * 0.12));
  return {
    x: round(Number(hostBox.x || 0) + insetX),
    y: round(Number(hostBox.y || 0) + insetY),
    w: round(Math.max(Number(textBox.w || 0), Number(hostBox.w || 0) - insetX * 2)),
    h: round(Math.max(Number(textBox.h || 0), Number(hostBox.h || 0) - insetY * 2))
  };
}

function tableZoneSemanticContrastTextColor(fill) {
  const color = parseHex(fill);
  const luma = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  return luma < 150 ? "#FFFFFF" : "#26323D";
}

function pointInsideBox(point = {}, box = {}) {
  const x = Number(point.x || 0);
  const y = Number(point.y || 0);
  return x >= Number(box.x || 0)
    && y >= Number(box.y || 0)
    && x <= Number(box.x || 0) + Number(box.w || 0)
    && y <= Number(box.y || 0) + Number(box.h || 0);
}

function boxArea(box = {}) {
  return Math.max(0, Number(box.w || 0)) * Math.max(0, Number(box.h || 0));
}

function unionPtBoxes(boxes = []) {
  const valid = boxes.filter((box) => box && Number(box.w || 0) > 0 && Number(box.h || 0) > 0);
  if (valid.length === 0) return null;
  const minX = Math.min(...valid.map((box) => Number(box.x || 0)));
  const minY = Math.min(...valid.map((box) => Number(box.y || 0)));
  const maxX = Math.max(...valid.map((box) => Number(box.x || 0) + Number(box.w || 0)));
  const maxY = Math.max(...valid.map((box) => Number(box.y || 0) + Number(box.h || 0)));
  return {
    x: round(minX),
    y: round(minY),
    w: round(maxX - minX),
    h: round(maxY - minY)
  };
}

function normalizeTriangleTopologyTopText(text) {
  const value = String(text || "");
  if (/^hif$/i.test(value.trim())) return "Hifi";
  return value;
}

function fitTriangleTopologyEvidenceFontSize(item, role = "") {
  const text = String(item?.text || "").trim();
  const rotated = Math.abs(Number(item?.rotation || 0)) > 0.1;
  const evidenceBox = rotated
    ? item?.box
    : (item?.source?.originalBox || item?.source?.evidenceBox || item?.box);
  const width = Number(evidenceBox?.w || item?.box?.w || 0);
  const height = Number(evidenceBox?.h || item?.box?.h || 0);
  const current = Number(item?.font?.sizePt || 12);
  if (!text || width <= 0 || height <= 0) return round(current);
  if (role === "page-title") return round(current);
  const bold = normalizeFontWeightForOpenXml(item?.font?.weight, "regular") === "bold";
  let units = 0;
  for (const char of text) {
    if (/[㐀-鿿＀-￯]/.test(char)) units += bold ? 1 : 0.92;
    else if (/[A-Z]/.test(char)) units += 0.72;
    else if (/[a-z0-9]/.test(char)) units += 0.55;
    else if (/\s/.test(char)) units += 0.30;
    else units += 0.45;
  }
  const latinOnly = !/[㐀-鿿]/.test(text);
  const byWidth = width * 0.98 / Math.max(1, units);
  const heightFactor = role === "page-title"
    ? 1.14
    : latinOnly
      ? 1.16
      : bold
        ? 1.04
        : 1.08;
  const byHeight = height * heightFactor;
  const roleMax = role === "page-footer" ? 14.5
    : role === "center-baseline" ? 16
      : role === "top-node" ? 16.5
        : role === "bottom-edge" ? 15.5
          : /(?:left|right)-edge$/.test(role) ? 14
            : 18;
  return round(clamp(Math.min(byWidth, byHeight, roleMax), Math.max(8, current * 0.8), current * 1.25));
}

function normalizeGenericNodeDiagramText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[：:，,。.;；]+$/g, "")
    .trim();
}

function isSemanticLabelHostNativeShape(shape = {}) {
  const detector = String(shape?.source?.detector || "");
  if (!/^visual-atom-native-(?:rect|ellipse)$/.test(detector)) return false;
  if (!shape?.box || !shape?.style) return false;
  if (!normalizeHex(shape.style.fill, "")) return false;
  return String(shape?.source?.nativeComponentArchetype || "").includes("matrix")
    || String(shape?.source?.layerType || "") === "table-zone";
}

function anchorSemanticTextBoxToNativeNodeShape(textBox = {}, shapes = []) {
  if (textBox?.source?.detector !== "table-zone-semantic-native-visible-label") return textBox;
  if (!textBox?.box || !Array.isArray(shapes) || shapes.length === 0) return textBox;
  const layerId = String(textBox?.source?.layerSourceId || "");
  const center = centerOfBox(textBox.box);
  const candidates = shapes
    .filter((shape) => !layerId || String(shape?.source?.layerSourceId || "") === layerId)
    .filter((shape) => canNativeShapeHostSemanticLabel(shape, textBox))
    .filter((shape) => pointInsideBox(center, expandPtBox(shape.box, DEFAULT_SLIDE, 3, 3)))
    .sort((a, b) => boxArea(a.box) - boxArea(b.box));
  const hostShape = candidates[0];
  if (!hostShape) return textBox;
  const hostAtom = {
    id: hostShape.source?.atomId || hostShape.id || null,
    kind: hostShape.source?.atomKind || null,
    color: hostShape.style?.fill || null,
    box: hostShape.box,
    topologyRole: hostShape.source?.topologyRole || null,
    containedAtomIds: Array.isArray(hostShape.source?.containedAtomIds) ? hostShape.source.containedAtomIds : []
  };
  const shouldCenter = shouldCenterTableZoneSemanticLabelInHost(hostAtom, textBox);
  const safeContainerBox = !shouldCenter && isContainerSemanticLabelHost(hostAtom)
    ? tableZoneSemanticContainerSafeLabelBox(hostShape, textBox, shapes)
    : null;
  return {
    ...textBox,
    box: shouldCenter ? tableZoneSemanticHostLabelBox(hostShape.box, textBox.box) : (safeContainerBox || textBox.box),
    font: {
      ...(textBox.font || {}),
      color: tableZoneSemanticContrastTextColor(hostShape.style.fill),
      align: shouldCenter ? "center" : (textBox.font?.align || "center"),
      valign: "middle"
    },
    style: {
      ...(textBox.style || {}),
      marginLeftPt: 0,
      marginRightPt: 0,
      marginTopPt: 0,
      marginBottomPt: 0,
      wrap: false
    },
    source: {
      ...(textBox.source || {}),
      labelAnchoredToNativeAtom: true,
      labelHostAtomId: hostAtom.id,
      labelHostAtomKind: hostAtom.kind,
      labelHostAtomFill: normalizeHex(hostShape.style.fill, ""),
      ...(safeContainerBox ? { labelHostSafePlacement: "container-interior" } : {})
    }
  };
}

function isContainerSemanticLabelHost(hostAtom = {}) {
  return hostAtom.topologyRole === "container"
    || (Array.isArray(hostAtom.containedAtomIds) && hostAtom.containedAtomIds.length > 0);
}

function tableZoneSemanticContainerSafeLabelBox(hostShape = {}, textBox = {}, shapes = []) {
  if (!hostShape?.box || !textBox?.box) return null;
  const host = hostShape.box;
  const padX = Math.min(10, Math.max(5, Number(host.w || 0) * 0.07));
  const padY = Math.min(9, Math.max(5, Number(host.h || 0) * 0.08));
  const labelW = Math.min(Number(textBox.box.w || 0), Math.max(1, Number(host.w || 0) - padX * 2));
  const labelH = Math.min(Number(textBox.box.h || 0), Math.max(1, Number(host.h || 0) - padY * 2));
  const minX = Number(host.x || 0) + padX;
  const maxX = Number(host.x || 0) + Number(host.w || 0) - padX - labelW;
  const minY = Number(host.y || 0) + padY;
  const maxY = Number(host.y || 0) + Number(host.h || 0) - padY - labelH;
  const x = round(clamp(Number(textBox.box.x || 0), minX, Math.max(minX, maxX)));
  const candidateYs = [
    clamp(Number(textBox.box.y || 0), minY, Math.max(minY, maxY)),
    minY,
    Number(host.y || 0) + (Number(host.h || 0) - labelH) / 2,
    Math.max(minY, maxY)
  ].map((value) => round(value));
  const blockers = (Array.isArray(shapes) ? shapes : [])
    .filter((shape) => shape !== hostShape)
    .filter((shape) => shape?.box)
    .filter((shape) => String(shape?.source?.layerSourceId || "") === String(hostShape?.source?.layerSourceId || ""))
    .filter((shape) => intersectionArea(shape.box, host) > 0)
    .filter((shape) => String(shape?.source?.atomId || "") !== String(hostShape?.source?.atomId || ""));
  const bestY = candidateYs
    .map((y) => {
      const candidate = { x, y, w: labelW, h: labelH };
      const overlap = blockers.reduce((sum, shape) => sum + intersectionArea(candidate, shape.box), 0);
      const movement = Math.abs(y - Number(textBox.box.y || 0)) * 0.12;
      return { y, score: overlap + movement };
    })
    .sort((a, b) => a.score - b.score)[0]?.y ?? candidateYs[0];
  return { x, y: bestY, w: round(labelW), h: round(labelH) };
}

function intersectionArea(a = {}, b = {}) {
  const x1 = Math.max(Number(a.x || 0), Number(b.x || 0));
  const y1 = Math.max(Number(a.y || 0), Number(b.y || 0));
  const x2 = Math.min(Number(a.x || 0) + Number(a.w || 0), Number(b.x || 0) + Number(b.w || 0));
  const y2 = Math.min(Number(a.y || 0) + Number(a.h || 0), Number(b.y || 0) + Number(b.h || 0));
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

function canNativeShapeHostSemanticLabel(shape = {}, textBox = {}) {
  if (!shape?.box || !textBox?.box) return false;
  const shapeArea = boxArea(shape.box);
  const textArea = boxArea(textBox.box);
  if (shapeArea < textArea * 0.65) return false;
  if (Number(shape.box.w || 0) < Number(textBox.box.w || 0) * 0.45) return false;
  if (Number(shape.box.h || 0) < Number(textBox.box.h || 0) * 0.45) return false;
  return true;
}

function removesInternalEditableText(detector) {
  return [
    "kpi-evidence-crop",
    "entropy-challenge-crop",
    "illustration-card-graphic-underlay-crop",
    "mixed-diagram-graphic-underlay-crop",
    "left-illustration-panel-crop",
    "bottom-banner-crop",
    "sparse-diagram-graphic-underlay-crop",
    "visual-cluster-graphic-underlay-crop",
    "comparison-matrix-crop",
    "top-complex-diagram-crop",
    "two-panel-diagram-crop",
    "screenshot-process-underlay-crop",
    "foreground-graphic-crop"
  ].includes(detector);
}

function isCollaborationFlowInternalLabel(textBox, underlayBox) {
  const text = String(textBox?.text || "").replace(/\s+/g, "");
  const box = textBox?.box || {};
  const centerX = Number(box.x || 0) + Number(box.w || 0) / 2;
  const centerY = Number(box.y || 0) + Number(box.h || 0) / 2;
  const inside = centerX >= underlayBox.x
    && centerX <= underlayBox.x + underlayBox.w
    && centerY >= underlayBox.y
    && centerY <= underlayBox.y + underlayBox.h;
  if (!inside) return false;
  if (/^(?:PMSkills|PMSkill|处理引擎)$/i.test(text)) {
    return centerX <= underlayBox.x + underlayBox.w * 0.28
      && centerY >= underlayBox.y + underlayBox.h * 0.42
      && centerY <= underlayBox.y + underlayBox.h * 0.7;
  }
  const isRecipientText = /^(?:To后端研发BE|To前端研发FE|To测试QA)$/i.test(text)
    || /消除模糊地带|后端接口拆解|据策略读取|已关闭出库单|告别交互拉扯|阻断校验规则|界值计算公式|高保真原型|更严密的用例参考|前置暴露异常场景|发货扣减|高覆盖率测试依据/.test(text);
  if (!isRecipientText) return false;
  return centerX >= underlayBox.x + underlayBox.w * 0.48
    && centerX <= underlayBox.x + underlayBox.w * 0.98
    && centerY >= underlayBox.y + underlayBox.h * 0.04
    && centerY <= underlayBox.y + underlayBox.h * 0.95;
}

function isSaturatedDiagramInternalLabel(textBox, underlayBox) {
  const text = String(textBox?.text || "").replace(/\s+/g, "");
  if (!/(?:痛点|解决方案|文字方案|不够直观|原型与系统菜单|脱节|基于语义克隆|线上系统|文档秒变|可点击原型|路由自动接入|实现全景联动|结构化标准|文档|DOM语义|精准克隆|自动生成操作手册|证据回流|所见即所得|交互原型)/i.test(text)) {
    return false;
  }
  const box = textBox?.box || {};
  const centerX = Number(box.x || 0) + Number(box.w || 0) / 2;
  const centerY = Number(box.y || 0) + Number(box.h || 0) / 2;
  return centerX >= underlayBox.x + underlayBox.w * 0.03
    && centerX <= underlayBox.x + underlayBox.w * 0.98
    && centerY >= underlayBox.y + underlayBox.h * 0.14
    && centerY <= underlayBox.y + underlayBox.h * 0.72;
}

function entropyChallengeNativeComponentMetadata(role, part) {
  const safeRole = safeComponentToken(role || "unknown");
  return {
    nativeComponentGroupId: `entropy-challenge-${safeRole}`,
    nativeComponentParentId: "entropy-challenge",
    nativeComponentArchetype: role.startsWith("footer-") ? "bullet-label" : "illustration-annotation",
    nativeComponentInstance: true,
    nativeComponentMinimumUnit: "semantic-component",
    nativeComponentRole: role,
    nativeComponentPart: part || "detail"
  };
}

function entropyChallengeFooterEntries() {
  return [
    { text: "资产碎片化", box: { x: 72, y: 432, w: 132, h: 29 }, bullet: { x: 52, y: 441 } },
    { text: "技能孤岛", box: { x: 262, y: 432, w: 112, h: 29 }, bullet: { x: 242, y: 441 } },
    { text: "协作断层", box: { x: 71, y: 470, w: 112, h: 29 }, bullet: { x: 52, y: 479 } },
    { text: "维护高冗余", box: { x: 263, y: 470, w: 136, h: 29 }, bullet: { x: 243, y: 479 } }
  ];
}

function hasEntropyChallengeFooterEvidence(textBoxes = []) {
  const values = (textBoxes || []).map((item) => normalizeCjkText(item?.text)).join(" ");
  return /产品资产.*(?:熵增|摘增).*挑战/.test(values)
    && ["资产碎片化", "技能孤岛", "协作断层"].every((label) => values.includes(normalizeCjkText(label)));
}

function normalizeAssetOsKpiBenefitTextKey(text) {
  return String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]/gu, "");
}

function isAssetOsHighValueAssetMatrixTextEcho(candidate = {}, nativeText = {}) {
  const candidateKey = normalizeAssetOsKpiBenefitTextKey(candidate.text);
  const nativeKey = normalizeAssetOsKpiBenefitTextKey(nativeText.text);
  if (!candidateKey || !nativeKey) return false;

  // Keep unrelated generic table labels. The specialized matrix owns exact labels
  // and OCR fragments that sit inside one of its reconstructed cell text boxes.
  const textMatches = candidateKey === nativeKey
    || (candidateKey.length >= 2 && nativeKey.includes(candidateKey));
  if (!textMatches) return false;

  const candidateBox = candidate.box || {};
  const nativeBox = nativeText.box || {};
  const candidateCenterX = Number(candidateBox.x || 0) + Number(candidateBox.w || 0) / 2;
  const candidateCenterY = Number(candidateBox.y || 0) + Number(candidateBox.h || 0) / 2;
  return candidateCenterX >= Number(nativeBox.x || 0) - 10
    && candidateCenterX <= Number(nativeBox.x || 0) + Number(nativeBox.w || 0) + 10
    && candidateCenterY >= Number(nativeBox.y || 0) - 10
    && candidateCenterY <= Number(nativeBox.y || 0) + Number(nativeBox.h || 0) + 10;
}

function isAssetOsKpiBenefitDiagramText(textBox) {
  const text = String(textBox?.text || "").trim();
  if (!text || /量化收益验证|显著压缩重复劳动/.test(text)) return false;
  return /70%-90%|60%-80%|80%-90%|原型初稿提速|PRD初稿提速|评审返工率降低|当前已沉淀资产规模|半天至|1-1\.5天|完整性缺失|5个|15个|500\+|400\+|试点域仓|接入系统|沉淀文档资产|生成原型代码/.test(text);
}

function assetOsKpiBenefitTextRole(text) {
  const value = String(text || "");
  if (/70%-90%|60%-80%|80%-90%/.test(value)) return "percent-value";
  if (/5个|15个|500\+|400\+/.test(value)) return "scale-value";
  if (/当前已沉淀资产规模/.test(value)) return "scale-title";
  if (/原型初稿提速|PRD初稿提速|评审返工率降低/.test(value)) return "heading";
  if (/试点域仓|接入系统|沉淀文档资产|生成原型代码/.test(value)) return "scale-caption";
  return "caption";
}

function assetOsKpiBenefitTextColor(role) {
  if (role === "percent-value" || role === "scale-value") return "#050505";
  if (role === "caption") return "#4D5E72";
  if (role === "scale-title") return "#FFFFFF";
  if (role === "scale-caption") return "#4D5E72";
  return "#111111";
}

module.exports = { boxesOverlapRatio, isTriangleTopologyInternalPreservedCropLabel, normalizeTriangleTopologyDuplicateLabel, normalizeTriangleTopologyTopText, isPrdPreservedSegmentText, isPrdDocumentSegmentText, mergeShiftLeftAbilityTextBoxes, unionPtBoxes, normalizeWmsRouteChainTitle, assetOsKpiBenefitRefinedFontSize, assetOsKpiBenefitTextColor, assetOsKpiBenefitTextRole, isAssetOsKpiBenefitDiagramText, normalizedChromeEvidenceBox, isCollaborationFlowInternalLabel, isSaturatedDiagramInternalLabel, keepsInternalLayerText, shouldKeepFunnelHubDiagramText, removesInternalEditableText, shouldKeepAssetHubCycleEndpointLabel, shouldKeepFunnelHubTextInResidualCrop, shouldRemoveHighRiskInternalOverlayText, boxArea, intersectionArea, fitTriangleTopologyEvidenceFontSize, normalizeGenericNodeDiagramText, anchorSemanticTextBoxToNativeNodeShape, canNativeShapeHostSemanticLabel, isContainerSemanticLabelHost, pointInsideBox, shouldCenterTableZoneSemanticLabelInHost, tableZoneSemanticContainerSafeLabelBox, tableZoneSemanticContrastTextColor, tableZoneSemanticHostLabelBox, isSemanticLabelHostNativeShape, entropyChallengeFooterEntries, entropyChallengeNativeComponentMetadata, hasEntropyChallengeFooterEvidence, isAssetOsHighValueAssetMatrixTextEcho, normalizeAssetOsKpiBenefitTextKey, DEFAULT_SLIDE, ASSET_OS_KPI_FONT_SIZES };
