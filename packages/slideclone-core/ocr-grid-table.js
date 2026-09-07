"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { inferSemanticMatrixGrid } = require("./semantic-matrix-grid");
const { cropPng, writePng } = require("./png");

const MAX_TEXT_BOXES = 240;

function createOcrGridTableModel(page = {}, sourceImage = null, slideSize = {}, options = {}) {
  const widthPt = finitePositive(slideSize.widthPt);
  const heightPt = finitePositive(slideSize.heightPt);
  if (!widthPt || !heightPt || !validImage(sourceImage)) return emptyModel();
  const textBoxes = (Array.isArray(page.textBoxes) ? page.textBoxes : [])
    .filter(validTextBox)
    .slice(0, MAX_TEXT_BOXES);
  if (textBoxes.length < 12) return emptyModel();

  const inferGrid = typeof options.inferGrid === "function" ? options.inferGrid : inferSemanticMatrixGrid;
  const grid = inferGrid(sourceImage, { x: 0, y: 0, w: widthPt, h: heightPt }, { widthPt, heightPt }, "comparison-table");
  if (!validGrid(grid, widthPt, heightPt)) return emptyModel();

  const xLines = grid.xLines.map(Number);
  const firstColumnBoxes = textBoxes.filter((item) => {
    const center = centerOf(item.box);
    return center.x > xLines[0] && center.x < xLines[1]
      && center.y >= grid.bounds.y - 32
      && center.y <= grid.bounds.y + grid.bounds.h + 16;
  });
  const rowGroups = clusterRows(firstColumnBoxes);
  if (rowGroups.length !== Number(grid.rows)) return emptyModel();

  const rowAnchors = rowGroups.map((group) => median(group.map((item) => centerOf(item.box).y)));
  const tableCandidates = textBoxes.filter((item) => {
    const center = centerOf(item.box);
    return center.x >= xLines[0] && center.x <= xLines[xLines.length - 1]
      && center.y >= grid.bounds.y - 32
      && center.y <= grid.bounds.y + grid.bounds.h + 16;
  });
  const rowBounds = inferRowBounds(rowGroups, rowAnchors, heightPt, tableCandidates);
  if (!rowBounds || rowBounds.length !== rowAnchors.length + 1) return emptyModel();
  const tableBox = {
    x: round(xLines[0]),
    y: round(rowBounds[0]),
    w: round(xLines[xLines.length - 1] - xLines[0]),
    h: round(rowBounds[rowBounds.length - 1] - rowBounds[0])
  };
  if (!validBox(tableBox, widthPt, heightPt)) return emptyModel();

  const cells = Array.from({ length: rowAnchors.length }, () =>
    Array.from({ length: xLines.length - 1 }, () => []));
  const consumedIds = [];
  for (const item of textBoxes) {
    const center = centerOf(item.box);
    const columnIndex = intervalIndex(xLines, center.x);
    if (columnIndex < 0 || center.y < rowBounds[0] || center.y > rowBounds[rowBounds.length - 1]) continue;
    const rowIndex = nearestIndex(rowAnchors, center.y);
    const rowHalfSpan = Math.max(24, (rowBounds[rowIndex + 1] - rowBounds[rowIndex]) * 0.62);
    if (Math.abs(center.y - rowAnchors[rowIndex]) > rowHalfSpan) continue;
    cells[rowIndex][columnIndex].push(item);
    if (item.id) consumedIds.push(String(item.id));
  }
  if (cells.some((row) => row.some((cell) => cell.length === 0))) return emptyModel();

  const iconPlaceholder = cells[0].flat().find((item) => /^[?？]/.test(String(item.text || "").trim()));
  const iconRegion = iconPlaceholder ? {
    x: round(Math.max(xLines[0], Number(iconPlaceholder.box.x) - 1)),
    y: round(Math.max(rowBounds[0], Number(iconPlaceholder.box.y) - 1)),
    w: round(Math.min(Number(iconPlaceholder.box.h) + 3, xLines[xLines.length - 1] - Number(iconPlaceholder.box.x) + 1)),
    h: round(Math.min(Number(iconPlaceholder.box.h) + 3, rowBounds[1] - Number(iconPlaceholder.box.y) + 1))
  } : null;
  const rows = cells.map((row) => row.map(joinCellText));
  const cellStyles = cells.map((row, rowIndex) => row.map((cell, columnIndex) => {
    const cellBox = {
      x: xLines[columnIndex],
      y: rowBounds[rowIndex],
      w: xLines[columnIndex + 1] - xLines[columnIndex],
      h: rowBounds[rowIndex + 1] - rowBounds[rowIndex]
    };
    const fill = sampleCellFill(sourceImage, cellBox, { widthPt, heightPt });
    const dark = luminance(fill) < 145;
    const lastColumn = columnIndex === xLines.length - 2;
    return {
      fill,
      textColor: dark ? "#FFFFFF" : "#111111",
      fontFamily: "SimHei",
      fontSizePt: round(clamp(median(cell.map((item) => Number(item.font?.sizePt)).filter(Number.isFinite), rowIndex === 0 ? 15 : 14), 11, 20)),
      fontWeight: rowIndex === 0 || columnIndex === 0 || lastColumn ? "bold" : "regular",
      textAlign: rowIndex === 0 || columnIndex === 0 ? "center" : "left",
      textValign: "middle",
      paddingLeftPt: columnIndex === 0 ? 4 : 8,
      paddingRightPt: 6,
      paddingTopPt: 2,
      paddingBottomPt: 2
    };
  }));

  const outsideTextBoxes = textBoxes
    .filter((item) => centerOf(item.box).y > tableBox.y + tableBox.h + 12)
    .map((item, index) => ({
      ...item,
      text: balancePunctuation(normalizeCellText(item.text)),
      id: item.id || `ocr-grid-outside-text-${index + 1}`,
      box: { ...item.box },
      font: {
        ...(item.font || {}),
        family: item.font?.family || "Microsoft YaHei",
        color: "#111111",
        opacity: 1,
        weight: item.font?.weight || "regular"
      },
      style: {
        ...(item.style || {}),
        visibility: "visible",
        opacity: 1
      },
      source: {
        ...(item.source || {}),
        editable: true,
        nativeRebuild: true,
        detector: "ocr-grid-native-outside-text",
        overlayVisibility: "visible",
        preserveTypography: true
      }
    }));

  const highlightStroke = sampleGreenHighlightStroke(sourceImage, xLines[xLines.length - 2], tableBox, { widthPt, heightPt });
  const shapes = highlightStroke ? [{
    id: `ocr-grid-highlight-p${Number(page.pageIndex || 0) + 1}`,
    type: "rect",
    box: {
      x: round(xLines[xLines.length - 2]),
      y: tableBox.y,
      w: round(xLines[xLines.length - 1] - xLines[xLines.length - 2]),
      h: tableBox.h
    },
    style: { fill: "none", stroke: highlightStroke, strokeWidthPt: 2.8 },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "ocr-grid-native-highlight-border",
      nativeComponentInstance: true,
      nativeComponentGroupId: `ocr-grid-table-p${Number(page.pageIndex || 0) + 1}`,
      nativeComponentArchetype: "editable-comparison-table"
    }
  }] : [];

  return {
    matched: true,
    table: {
      id: `ocr-grid-table-p${Number(page.pageIndex || 0) + 1}`,
      type: "table",
      box: tableBox,
      rows,
      style: {
        fill: "#FFFFFF",
        stroke: grid.stroke || "#CDD6DE",
        strokeWidthPt: 0.7,
        fontFamily: "SimHei",
        fontSizePt: 14,
        paddingLeftPt: 8,
        paddingRightPt: 6,
        paddingTopPt: 2,
        paddingBottomPt: 2,
        textAlign: "left",
        textValign: "middle",
        columnWidthsPt: xLines.slice(1).map((value, index) => round(value - xLines[index])),
        rowHeightsPt: rowBounds.slice(1).map((value, index) => round(value - rowBounds[index])),
        cellStyles
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "ocr-grid-native-table",
        confidence: 0.94,
        gridProvider: grid.provider || "unknown",
        nativeComponentInstance: true,
        nativeComponentGroupId: `ocr-grid-table-p${Number(page.pageIndex || 0) + 1}`,
        nativeComponentArchetype: "editable-comparison-table",
        preserveTypography: true
      }
    },
    consumedIds: [...new Set(consumedIds)],
    sourceIds: (page.images || []).map((image) => String(image?.id || "")).filter(Boolean),
    outsideTextBoxes,
    iconRegion,
    shapes,
    grid: { ...grid, yLines: rowBounds.map(round), bounds: tableBox }
  };
}

function materializeOcrGridIcon(model = {}, sourceImage = null, options = {}) {
  if (model.matched !== true || !model.iconRegion || !validImage(sourceImage)) return null;
  const assetDir = typeof options.assetDir === "string" ? path.resolve(options.assetDir) : "";
  const irDir = typeof options.irDir === "string" ? path.resolve(options.irDir) : assetDir;
  const widthPt = finitePositive(options.slideSize?.widthPt);
  const heightPt = finitePositive(options.slideSize?.heightPt);
  if (!assetDir || !irDir || !widthPt || !heightPt || !validBox(model.iconRegion, widthPt, heightPt)) return null;
  const pixelBox = {
    x: Math.max(0, Math.floor(model.iconRegion.x / widthPt * sourceImage.width)),
    y: Math.max(0, Math.floor(model.iconRegion.y / heightPt * sourceImage.height)),
    w: Math.max(1, Math.ceil(model.iconRegion.w / widthPt * sourceImage.width)),
    h: Math.max(1, Math.ceil(model.iconRegion.h / heightPt * sourceImage.height))
  };
  pixelBox.w = Math.min(pixelBox.w, sourceImage.width - pixelBox.x);
  pixelBox.h = Math.min(pixelBox.h, sourceImage.height - pixelBox.y);
  if (pixelBox.w <= 0 || pixelBox.h <= 0) return null;
  fs.mkdirSync(assetDir, { recursive: true });
  const file = path.join(assetDir, `${safeName(options.deckName || "deck")}-p${Number(options.pageIndex || 0) + 1}-table-header-icon.png`);
  writePng(file, cropPng(sourceImage, pixelBox));
  return {
    id: `ocr-grid-header-icon-p${Number(options.pageIndex || 0) + 1}`,
    type: "fidelity-crop",
    assetPath: path.relative(irDir, file).replace(/\\/g, "/"),
    box: { ...model.iconRegion },
    source: {
      editable: false,
      detector: "ocr-grid-header-icon-crop",
      expressionForm: "icon-or-illustration",
      recommendedAction: "preserve-local-crop",
      intentionalMinimumUnitCrop: true,
      protectedMinimumUnit: true,
      standaloneVisualAsset: true,
      tableOverlay: true,
      nativeComponentInstance: true,
      nativeComponentGroupId: model.table?.source?.nativeComponentGroupId || null,
      nativeComponentArchetype: "editable-comparison-table",
      nonEditableReason: "table header pictogram is preserved as one minimum visual unit"
    }
  };
}

function clusterRows(items) {
  const sorted = [...items].sort((a, b) => centerOf(a.box).y - centerOf(b.box).y);
  const groups = [];
  for (const item of sorted) {
    const y = centerOf(item.box).y;
    const current = groups[groups.length - 1];
    const anchor = current ? median(current.map((entry) => centerOf(entry.box).y)) : null;
    if (!current || Math.abs(y - anchor) > 20) groups.push([item]);
    else current.push(item);
  }
  return groups;
}

function inferRowBounds(groups, anchors, heightPt, candidates = []) {
  if (groups.length < 3 || groups.length !== anchors.length) return null;
  const firstRow = candidates.filter((item) => nearestIndex(anchors, centerOf(item.box).y) === 0);
  const lastRow = candidates.filter((item) => nearestIndex(anchors, centerOf(item.box).y) === anchors.length - 1);
  const firstEvidence = firstRow.length > 0 ? firstRow : groups[0];
  const lastEvidence = lastRow.length > 0 ? lastRow : groups[groups.length - 1];
  const firstTop = Math.min(...firstEvidence.map((item) => Number(item.box.y)));
  const firstBottom = Math.max(...firstEvidence.map((item) => Number(item.box.y) + Number(item.box.h)));
  const firstHeight = median(firstEvidence.map((item) => Number(item.box.h)));
  const lastBottom = Math.max(...lastEvidence.map((item) => Number(item.box.y) + Number(item.box.h)));
  const lastHeight = median(lastEvidence.map((item) => Number(item.box.h)));
  const bounds = [Math.max(0, firstTop - clamp(firstHeight * 0.42, 5, 12))];
  bounds.push(firstBottom + clamp(firstHeight * 0.36, 5, 10));
  for (let index = 2; index < anchors.length; index += 1) {
    bounds.push((anchors[index - 1] + anchors[index]) / 2);
  }
  bounds.push(Math.min(heightPt, lastBottom + clamp(lastHeight * 0.65, 8, 14)));
  if (bounds.some((value, index) => !Number.isFinite(value) || (index > 0 && value <= bounds[index - 1] + 8))) return null;
  return bounds;
}

function joinCellText(items) {
  const sorted = [...items].sort((a, b) => centerOf(a.box).y - centerOf(b.box).y || Number(a.box.x) - Number(b.box.x));
  const lines = [];
  for (const item of sorted) {
    const y = centerOf(item.box).y;
    const current = lines[lines.length - 1];
    if (!current || Math.abs(y - current.y) > 8) lines.push({ y, items: [item] });
    else current.items.push(item);
  }
  return balancePunctuation(lines.map((line) => line.items
    .sort((a, b) => Number(a.box.x) - Number(b.box.x))
    .map((item) => normalizeCellText(item.text))
    .join(""))
    .join("\n"));
}

function normalizeCellText(value) {
  return String(value || "")
    .replace(/^[?？]\s*(?=[A-Za-z])/, "")
    .replace(/([A-Z]{2})([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([\u4e00-\u9fff])([A-Za-z]+)/g, "$1 $2")
    .replace(/([A-Za-z]+)([\u4e00-\u9fff])/g, "$1 $2")
    .replace(/评审[一—-]+→/g, "评审→")
    .trim();
}

function balancePunctuation(value) {
  let text = String(value || "");
  if ((text.match(/“/g) || []).length > (text.match(/”/g) || []).length) text += "”";
  if ((text.match(/（/g) || []).length > (text.match(/）/g) || []).length) text += "）";
  return text;
}

function sampleCellFill(image, box, slideSize) {
  const points = [];
  for (const yRatio of [0.12, 0.28, 0.72, 0.88]) {
    for (const xRatio of [0.1, 0.28, 0.72, 0.9]) {
      const x = Math.round((box.x + box.w * xRatio) / slideSize.widthPt * image.width);
      const y = Math.round((box.y + box.h * yRatio) / slideSize.heightPt * image.height);
      const offset = (clamp(y, 0, image.height - 1) * image.width + clamp(x, 0, image.width - 1)) * 4;
      points.push([image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]]);
    }
  }
  const rgb = [0, 1, 2].map((channel) => Math.round(median(points.map((point) => point[channel]))));
  return `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function sampleGreenHighlightStroke(image, xPt, box, slideSize) {
  const centerX = Math.round(xPt / slideSize.widthPt * image.width);
  const top = Math.max(0, Math.floor(box.y / slideSize.heightPt * image.height));
  const bottom = Math.min(image.height - 1, Math.ceil((box.y + box.h) / slideSize.heightPt * image.height));
  const colors = [];
  for (let y = top; y <= bottom; y += 3) {
    for (let dx = -3; dx <= 3; dx += 1) {
      const x = clamp(centerX + dx, 0, image.width - 1);
      const offset = (y * image.width + x) * 4;
      const color = [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]];
      if (color[1] >= color[0] + 22 && color[1] >= color[2] + 8 && color[1] >= 100) colors.push(color);
    }
  }
  if (colors.length < Math.max(12, (bottom - top) * 0.2)) return null;
  const rgb = [0, 1, 2].map((channel) => Math.round(median(colors.map((color) => color[channel]))));
  return `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function intervalIndex(lines, value) {
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (value >= lines[index] && value <= lines[index + 1]) return index;
  }
  return -1;
}

function nearestIndex(values, target) {
  let best = 0;
  for (let index = 1; index < values.length; index += 1) {
    if (Math.abs(values[index] - target) < Math.abs(values[best] - target)) best = index;
  }
  return best;
}

function validGrid(grid, widthPt, heightPt) {
  return Boolean(grid && Number.isInteger(grid.rows) && grid.rows >= 3 && grid.rows <= 12
    && Number.isInteger(grid.columns) && grid.columns >= 2 && grid.columns <= 8
    && Array.isArray(grid.xLines) && grid.xLines.length === grid.columns + 1
    && grid.xLines.every(Number.isFinite) && validBox(grid.bounds, widthPt, heightPt));
}

function validTextBox(item) {
  return Boolean(item && String(item.text || "").trim() && validBox(item.box, 100_000, 100_000));
}

function validImage(image) {
  return Boolean(image && Number.isInteger(image.width) && Number.isInteger(image.height)
    && image.width > 0 && image.height > 0 && image.width * image.height <= 24_000_000
    && image.rgba && image.rgba.length >= image.width * image.height * 4);
}

function validBox(box, width, height) {
  const values = [box?.x, box?.y, box?.w, box?.h].map(Number);
  return values.every(Number.isFinite) && values[0] >= 0 && values[1] >= 0 && values[2] > 0 && values[3] > 0
    && values[0] + values[2] <= width + 0.01 && values[1] + values[3] <= height + 0.01;
}

function centerOf(box) {
  return { x: Number(box.x) + Number(box.w) / 2, y: Number(box.y) + Number(box.h) / 2 };
}

function luminance(hex) {
  const value = String(hex || "#FFFFFF").replace(/^#/, "");
  const channels = [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
  return channels[0] * 0.299 + channels[1] * 0.587 + channels[2] * 0.114;
}

function median(values, fallback = 0) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return fallback;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

function emptyModel() {
  return { matched: false, table: null, consumedIds: [], sourceIds: [], outsideTextBoxes: [], iconRegion: null, shapes: [], grid: null };
}

function safeName(value) {
  return String(value || "deck").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 96) || "deck";
}

module.exports = {
  createOcrGridTableModel,
  materializeOcrGridIcon,
  normalizeCellText
};
