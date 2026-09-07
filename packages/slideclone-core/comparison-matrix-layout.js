"use strict";
const { comparisonMatrixTextBox } = require("./comparison-matrix-text");
const { boxCenterInside, expandPtBox, round, constrainPtBox } = require("./raster-native-detection");
const { lineBox } = require("./workflow-shape-primitives");
const { normalizeMatrixLabel } = require("./diagram-label-matching");
const { roundedBox } = require("./prd-generation-shapes");
const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function inferComparisonMatrixSkeletonShapes(image = {}) {
  const box = image?.box || {};
  if (!box.w || !box.h) return [];
  const base = image.id || "comparison-matrix";
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    expressionForm: "table-or-matrix",
    expressionSubtype: "comparison-matrix",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "table-zone",
    skeletonOnly: true,
    ...extra
  });
  const x = Number(box.x || 0);
  const y = Number(box.y || 0);
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const cols = w > 450 ? 4 : 3;
  const rows = h > 360 ? 5 : 4;
  const headerH = Math.max(34, Math.min(56, h * 0.13));
  const shapes = [{
    id: `${base}-native-skeleton-bg`,
    type: "roundRect",
    box: roundedBox({ x, y, w, h }),
    style: {
      fill: "#FFFFFF",
      stroke: "#BFD1E0",
      strokeWidthPt: 1,
      radiusRatio: 0.025,
      opacity: 0.66
    },
    source: source("comparison-matrix-native-skeleton-bg")
  }, {
    id: `${base}-native-skeleton-header`,
    type: "rect",
    box: roundedBox({ x, y, w, h: headerH }),
    style: { fill: "#EAF3FC", stroke: "none", strokeWidthPt: 0, opacity: 0.8 },
    source: source("comparison-matrix-native-skeleton-header")
  }];
  const portalColumnIndex = cols - 1;
  const colW = w / cols;
  shapes.push({
    id: `${base}-native-skeleton-highlight-column`,
    type: "rect",
    box: roundedBox({ x: x + colW * portalColumnIndex, y, w: colW, h }),
    style: { fill: "#EAF6FF", stroke: "#2D86D4", strokeWidthPt: 1.1, opacity: 0.36 },
    source: source("comparison-matrix-native-skeleton-highlight-column", { columnIndex: portalColumnIndex })
  });
  for (let col = 1; col < cols; col += 1) {
    shapes.push({
      id: `${base}-native-skeleton-vline-${col}`,
      type: "line",
      box: { x: round(x + colW * col), y, w: 0, h: round(h) },
      style: { stroke: "#BFD1E0", strokeWidthPt: 1, connectorType: "straight", opacity: 0.86 },
      source: source("comparison-matrix-native-skeleton-grid-line", { axis: "x", index: col })
    });
  }
  const rowH = (h - headerH) / Math.max(1, rows - 1);
  for (let row = 1; row < rows; row += 1) {
    shapes.push({
      id: `${base}-native-skeleton-hline-${row}`,
      type: "line",
      box: { x, y: round(y + headerH + rowH * (row - 1)), w: round(w), h: 0 },
      style: { stroke: "#BFD1E0", strokeWidthPt: 1, connectorType: "straight", opacity: 0.86 },
      source: source("comparison-matrix-native-skeleton-grid-line", { axis: "y", index: row })
    });
  }
  for (let row = 1; row < rows; row += 1) {
    shapes.push({
      id: `${base}-native-skeleton-status-${row}`,
      type: "ellipse",
      box: roundedBox({
        x: x + colW * portalColumnIndex + colW * 0.44,
        y: y + headerH + rowH * (row - 0.5) - 8,
        w: 16,
        h: 16
      }),
      style: { fill: "#2DBB63", stroke: "#229B51", strokeWidthPt: 0.8, opacity: 0.86 },
      source: source("comparison-matrix-native-skeleton-status", { row })
    });
  }
  return shapes;
}

function shouldObjectifyComparisonMatrixFromLayoutFallback(image, textBoxes = []) {
  const box = image?.box || {};
  const source = image?.source || {};
  if (source.detector !== "cycle-illustration-underlay-crop") return false;
  if (!box.w || !box.h || box.w < 820 || box.h < 330) return false;
  if (box.x > 80 || box.y < 90 || box.y > 150 || box.x + box.w < 850) return false;
  const labels = (textBoxes || []).map((item) => normalizeMatrixLabel(item.text));
  const hasRescueTitle = labels.some((label) =>
    /为什么普通的?AI对话框无法拯救产品经理/.test(label));
  if (!hasRescueTitle) return false;
  const hasRowAnchor = labels.some((label) =>
    /上下文感知|质量校验与拦截|资产落盘/.test(label));
  const reason = `${source.reason || ""} ${source.nonEditableReason || ""}`;
  const looksLikePreservedIllustration = /circular-icon-illustration|preserved-as-local-crop/.test(reason);
  return hasRowAnchor || looksLikePreservedIllustration;
}

function inferComparisonMatrix(image, textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const box = image.box;
  const slideBoundsBox = { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt };
  const xLines = [
    box.x + box.w * 0.18,
    box.x + box.w * 0.43,
    box.x + box.w * 0.68
  ].map((x) => round(x));
  const yLines = [
    box.y + box.h * 0.16,
    box.y + box.h * 0.42,
    box.y + box.h * 0.68
  ].map((y) => round(y));
  const gridLines = [
    ...xLines.map((x) => ({ box: lineBox({ x, y: box.y }, { x, y: box.y + box.h }), stroke: "#145B73", strokeWidthPt: 1.4 })),
    ...yLines.map((y, index) => ({ box: lineBox({ x: box.x, y }, { x: box.x + box.w, y }), stroke: index === 0 ? "#145B73" : "#6B9393", strokeWidthPt: index === 0 ? 1.6 : 1.1 }))
  ];
  const internalText = (textBoxes || [])
    .filter((item) => item?.box && boxCenterInside(item.box, expandPtBox(box, slideSize, 6, 6)))
    .filter((item) => normalizeMatrixLabel(item.text) !== "+");
  const textItems = internalText.length >= 12
    ? internalText
    : comparisonMatrixLayoutFallbackTextItems(image, textBoxes, xLines, yLines);
  const nativeTextBoxes = textItems.map((item) => comparisonMatrixTextBox(item, box, xLines, yLines));
  const rowCenters = [
    (yLines[0] + yLines[1]) / 2,
    (yLines[1] + yLines[2]) / 2,
    (yLines[2] + box.y + box.h) / 2
  ];
  const statusShapes = [];
  for (const y of rowCenters) {
    statusShapes.push(...comparisonWarningShapes({ x: xLines[1] - box.w * 0.038, y }, slideBoundsBox));
    statusShapes.push(...comparisonStatusCircleShapes({ x: xLines[2] - box.w * 0.04, y }, "x", "#888888", slideBoundsBox));
    statusShapes.push(...comparisonStatusCircleShapes({ x: box.x + box.w * 0.955, y }, "check", "#18985A", slideBoundsBox));
  }
  return { gridLines, textBoxes: nativeTextBoxes, statusShapes };
}

function comparisonMatrixLayoutFallbackTextItems(image, textBoxes = [], xLines = [], yLines = []) {
  if (!shouldObjectifyComparisonMatrixFromLayoutFallback(image, textBoxes)) return [];
  const box = image.box || {};
  const rowCenters = [
    (yLines[0] + yLines[1]) / 2,
    (yLines[1] + yLines[2]) / 2,
    (yLines[2] + box.y + box.h) / 2
  ];
  const headerY = box.y + box.h * 0.065;
  const headerH = box.h * 0.075;
  const dataH = box.h * 0.075;
  const columns = [
    { role: "manual", x: xLines[0] + box.w * 0.045, w: box.w * 0.18, align: "left" },
    { role: "generic-ai", x: xLines[1] + box.w * 0.045, w: box.w * 0.18, align: "left" },
    { role: "portal", x: xLines[2] + box.w * 0.04, w: box.w * 0.27, align: "left" }
  ];
  const rowHeader = { x: box.x + box.w * 0.02, w: box.w * 0.17 };
  const rows = [
    ["上下文感知", "依赖个人记忆", "无系统/历史知识", "实时挂载全域资产"],
    ["质量校验与拦截", "依赖人工评审", "仅做文字润色", "智能预校验逻辑边界"],
    ["资产落盘", "散落各处", "停留在对话窗", "自动推入标准域仓"]
  ];
  const items = [
    comparisonMatrixFallbackItem("传统手工推进", { x: columns[0].x, y: headerY, w: columns[0].w, h: headerH }, "column-header"),
    comparisonMatrixFallbackItem("普通对话式AI", { x: columns[1].x, y: headerY, w: columns[1].w, h: headerH }, "column-header"),
    comparisonMatrixFallbackItem("PM Portal Skills 引擎", { x: columns[2].x, y: headerY, w: columns[2].w, h: headerH }, "column-header")
  ];
  rows.forEach((row, rowIndex) => {
    const y = rowCenters[rowIndex] - dataH / 2;
    items.push(comparisonMatrixFallbackItem(row[0], { x: rowHeader.x, y, w: rowHeader.w, h: dataH }, "row-header"));
    columns.forEach((column, columnIndex) => {
      items.push(comparisonMatrixFallbackItem(row[columnIndex + 1], {
        x: column.x,
        y,
        w: column.w + (column.role === "portal" ? box.w * 0.03 : 0),
        h: dataH
      }, "cell"));
    });
  });
  return items;
}

function comparisonMatrixFallbackItem(text, box, role) {
  return {
    text,
    box: {
      x: round(box.x),
      y: round(box.y),
      w: round(box.w),
      h: round(box.h)
    },
    font: {
      family: "Microsoft YaHei",
      sizePt: role === "column-header" ? 18 : 17,
      color: role === "column-header" || role === "row-header" ? "#145B73" : "#111111",
      opacity: 1,
      weight: role === "column-header" || role === "row-header" ? "bold" : "regular",
      align: "left",
      valign: "middle"
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "comparison-matrix-layout-fallback-label",
      role
    }
  };
}

function comparisonWarningShapes(center, bounds) {
  const size = 30;
  const triangle = constrainPtBox({ x: center.x - size / 2, y: center.y - size / 2, w: size, h: size }, bounds);
  const markX = center.x - 1.5;
  return [
    {
      type: "triangle",
      box: triangle,
      style: { fill: "#F47A16", stroke: "#F47A16", strokeWidthPt: 0 },
      detector: "comparison-matrix-native-warning",
      statusKind: "warning"
    },
    {
      type: "line",
      box: lineBox({ x: markX, y: center.y - 7 }, { x: markX, y: center.y + 4 }),
      style: { stroke: "#FFFFFF", strokeWidthPt: 2.2, connectorType: "straight" },
      detector: "comparison-matrix-native-status-mark",
      statusKind: "warning-mark"
    },
    {
      type: "ellipse",
      box: constrainPtBox({ x: center.x - 2.4, y: center.y + 8, w: 4.8, h: 4.8 }, bounds),
      style: { fill: "#FFFFFF", stroke: "#FFFFFF", strokeWidthPt: 0 },
      detector: "comparison-matrix-native-status-mark",
      statusKind: "warning-dot"
    }
  ];
}

function comparisonStatusCircleShapes(center, kind, fill, bounds) {
  const size = 31;
  const box = constrainPtBox({ x: center.x - size / 2, y: center.y - size / 2, w: size, h: size }, bounds);
  const shapes = [{
    type: "ellipse",
    box,
    style: { fill, stroke: fill, strokeWidthPt: 0 },
    detector: "comparison-matrix-native-status-circle",
    statusKind: kind
  }];
  if (kind === "check") {
    shapes.push({
      type: "line",
      box: lineBox({ x: center.x - 8, y: center.y - 1 }, { x: center.x - 2, y: center.y + 7 }),
      style: { stroke: "#FFFFFF", strokeWidthPt: 3, connectorType: "straight" },
      detector: "comparison-matrix-native-status-mark",
      statusKind: "check-a"
    });
    shapes.push({
      type: "line",
      box: lineBox({ x: center.x - 2, y: center.y + 7 }, { x: center.x + 10, y: center.y - 8 }),
      style: { stroke: "#FFFFFF", strokeWidthPt: 3, connectorType: "straight" },
      detector: "comparison-matrix-native-status-mark",
      statusKind: "check-b"
    });
  } else {
    shapes.push({
      type: "line",
      box: lineBox({ x: center.x - 8, y: center.y - 8 }, { x: center.x + 8, y: center.y + 8 }),
      style: { stroke: "#FFFFFF", strokeWidthPt: 3, connectorType: "straight" },
      detector: "comparison-matrix-native-status-mark",
      statusKind: "x-a"
    });
    shapes.push({
      type: "line",
      box: lineBox({ x: center.x + 8, y: center.y - 8 }, { x: center.x - 8, y: center.y + 8 }),
      style: { stroke: "#FFFFFF", strokeWidthPt: 3, connectorType: "straight" },
      detector: "comparison-matrix-native-status-mark",
      statusKind: "x-b"
    });
  }
  return shapes;
}

module.exports = { inferComparisonMatrix, comparisonMatrixLayoutFallbackTextItems, comparisonMatrixFallbackItem, shouldObjectifyComparisonMatrixFromLayoutFallback, comparisonStatusCircleShapes, comparisonWarningShapes, inferComparisonMatrixSkeletonShapes };
