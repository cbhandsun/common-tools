"use strict";

const { DEFAULT_SLIDE } = require("@common-tools/slideclone-core/page-text-rule-helpers");
const { round } = require("@common-tools/slideclone-core/raster-native-detection");
const { lineBox } = require("@common-tools/slideclone-core/workflow-shape-primitives");

function systemMapAssetGridTileSegments(tileCount, cellW, gapX, rowWidth) {
  const segments = [];
  const safeWidth = Math.max(0.01, Number(rowWidth || 0));
  for (let index = 0; index < tileCount; index += 1) {
    const left = (index * (cellW + gapX)) / safeWidth;
    const right = (index * (cellW + gapX) + cellW) / safeWidth;
    segments.push(
      { type: "moveTo", points: [{ x: left, y: 0 }] },
      { type: "lnTo", points: [{ x: right, y: 0 }] },
      { type: "lnTo", points: [{ x: right, y: 1 }] },
      { type: "lnTo", points: [{ x: left, y: 1 }] },
      { type: "close", points: [] }
    );
  }
  return segments;
}

function systemMapBottomLabelTextBoxes(prefix, b, source = {}) {
  const labels = [
    { text: "物流域", x: b.x + b.w * 0.15 },
    { text: "供应链", x: b.x + b.w * 0.50 },
    { text: "ERP", x: b.x + b.w * 0.70 },
    { text: "财务", x: b.x + b.w * 0.82 }
  ];
  return labels.map((item, index) => ({
    id: `${prefix}-native-bottom-label-${index}`,
    text: item.text,
    box: { x: round(item.x), y: round(Math.min(DEFAULT_SLIDE.heightPt - 14, b.y + b.h * 1.012)), w: 48, h: 10 },
    font: {
      family: "Microsoft YaHei",
      sizePt: 5.5,
      color: "#6D8798",
      opacity: 1,
      weight: "regular",
      align: "center",
      valign: "middle"
    },
    source: {
      ...source,
      detector: "system-map-native-label",
      role: "bottom-domain-label"
    }
  }));
}

function systemMapShape(id, type, box, style, source = {}) {
  return {
    id,
    type,
    box: {
      x: round(box.x),
      y: round(box.y),
      w: round(box.w),
      h: round(box.h)
    },
    style,
    source
  };
}

function systemMapLine(id, from, to, color, strokeWidthPt, source = {}) {
  return systemMapShape(id, "line", lineBox(from, to), {
    stroke: color,
    strokeWidthPt,
    connectorType: "straight",
    lineCap: "square"
  }, source);
}

module.exports = {
  systemMapAssetGridTileSegments,
  systemMapBottomLabelTextBoxes,
  systemMapLine,
  systemMapShape
};
