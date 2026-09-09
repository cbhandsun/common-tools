"use strict";

const { DEFAULT_SLIDE } = require("@common-tools/slideclone-core/page-text-rule-helpers");

function createQuadrantDividerFactory(dependencies = {}) {
  const {
    averageColor,
    boxCenterInside,
    luma,
    pixel,
    ptToPxBox,
    pxToPtBox,
    rgbToHex,
    round,
    roundRatio,
    saturation
  } = dependencies;
  const required = {
    averageColor,
    boxCenterInside,
    luma,
    pixel,
    ptToPxBox,
    pxToPtBox,
    rgbToHex,
    round,
    roundRatio,
    saturation
  };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== "function") throw new TypeError(`quadrant divider dependency ${name} must be a function`);
  }

  function createQuadrantDividerShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
    if (!sourceImage) return [];
    const shapes = [];
    for (const image of images || []) {
      if (!shouldObjectifyQuadrantDividers(image)) continue;
      const internalTextBoxes = (textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, image.box));
      const dividers = inferQuadrantDividers(image, internalTextBoxes, sourceImage, slideSize);
      if (dividers.length === 0) continue;
      image.source = {
        ...(image.source || {}),
        quadrantDividerObjectified: true,
        objectifiedQuadrantDividers: dividers.length
      };
      for (let index = 0; index < dividers.length; index += 1) {
        const divider = dividers[index];
        shapes.push({
          id: `${image.id || "table-zone"}-native-quadrant-divider-${index}`,
          type: "line",
          box: divider.box,
          style: {
            stroke: divider.stroke,
            strokeWidthPt: divider.strokeWidthPt,
            connectorType: "straight"
          },
          source: {
            editable: true,
            nativeRebuild: true,
            detector: "table-zone-native-quadrant-divider",
            layerSourceId: image.id || null,
            axis: divider.axis,
            confidence: divider.confidence
          }
        });
      }
    }
    return shapes;
  }
  
  function shouldObjectifyQuadrantDividers(image) {
    const layer = image?.source?.layer || {};
    return image?.source?.textObjectified === true
      && image?.source?.tableGridObjectified !== true
      && layer.layerType === "table-zone"
      && layer.recommendedAction === "attempt-native-reconstruction";
  }
  
  function inferQuadrantDividers(image, textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
    if (!image?.box || !sourceImage || textBoxes.length < 8) return [];
    if (!hasTwoByTwoTextQuadrants(image.box, textBoxes)) return [];
    const crop = ptToPxBox(image.box, sourceImage, slideSize, 0);
    const horizontal = strongestDividerLine(sourceImage, crop, "horizontal");
    const vertical = strongestDividerLine(sourceImage, crop, "vertical");
    if (!horizontal || !vertical) return [];
    const hBox = pxToPtBox({ x: crop.x, y: horizontal.position, w: crop.w, h: Math.max(1, horizontal.thickness) }, sourceImage, slideSize, 0);
    const vBox = pxToPtBox({ x: vertical.position, y: crop.y, w: Math.max(1, vertical.thickness), h: crop.h }, sourceImage, slideSize, 0);
    return [
      {
        axis: "horizontal",
        box: { x: round(hBox.x), y: round(hBox.y + hBox.h / 2), w: round(hBox.w), h: 0 },
        stroke: horizontal.stroke,
        strokeWidthPt: Math.max(0.6, round(hBox.h)),
        confidence: horizontal.confidence
      },
      {
        axis: "vertical",
        box: { x: round(vBox.x + vBox.w / 2), y: round(vBox.y), w: 0, h: round(vBox.h) },
        stroke: vertical.stroke,
        strokeWidthPt: Math.max(0.6, round(vBox.w)),
        confidence: vertical.confidence
      }
    ];
  }
  
  function hasTwoByTwoTextQuadrants(imageBox, textBoxes = []) {
    const midX = imageBox.x + imageBox.w / 2;
    const midY = imageBox.y + imageBox.h / 2;
    const quadrants = new Set();
    for (const textBox of textBoxes) {
      const box = textBox.box || {};
      const cx = Number(box.x || 0) + Number(box.w || 0) / 2;
      const cy = Number(box.y || 0) + Number(box.h || 0) / 2;
      if (cx < midX && cy < midY) quadrants.add("tl");
      else if (cx >= midX && cy < midY) quadrants.add("tr");
      else if (cx < midX && cy >= midY) quadrants.add("bl");
      else quadrants.add("br");
    }
    return quadrants.size === 4;
  }
  
  function strongestDividerLine(image, crop, axis) {
    const scanLength = axis === "horizontal" ? crop.w : crop.h;
    const crossLength = axis === "horizontal" ? crop.h : crop.w;
    const candidates = [];
    for (let offset = 0; offset < crossLength; offset += 1) {
      let count = 0;
      const colors = [];
      for (let step = 0; step < scanLength; step += 2) {
        const x = axis === "horizontal" ? crop.x + step : crop.x + offset;
        const y = axis === "horizontal" ? crop.y + offset : crop.y + step;
        const color = pixel(image, x, y);
        if (!isDividerPixel(color)) continue;
        count += 1;
        if (colors.length < 80) colors.push(color);
      }
      const coverage = count / Math.max(1, Math.ceil(scanLength / 2));
      if (coverage >= 0.45) {
        candidates.push({
          offset,
          coverage,
          color: averageColor(colors)
        });
      }
    }
    const clusters = [];
    for (const candidate of candidates) {
      const existing = clusters.find((cluster) => candidate.offset <= cluster.end + 2);
      if (existing) {
        existing.end = candidate.offset;
        existing.coverage += candidate.coverage;
        existing.count += 1;
        existing.colors.push(candidate.color);
      } else {
        clusters.push({
          start: candidate.offset,
          end: candidate.offset,
          coverage: candidate.coverage,
          count: 1,
          colors: [candidate.color]
        });
      }
    }
    const best = clusters
      .map((cluster) => ({
        ...cluster,
        averageCoverage: cluster.coverage / Math.max(1, cluster.count)
      }))
      .filter((cluster) => cluster.count <= 12 && cluster.averageCoverage >= 0.5)
      .sort((a, b) => (b.averageCoverage - a.averageCoverage) || (b.count - a.count))[0];
    if (!best) return null;
    const stroke = rgbToHex(averageColor(best.colors));
    return {
      position: (axis === "horizontal" ? crop.y : crop.x) + Math.round((best.start + best.end) / 2),
      thickness: Math.max(1, best.end - best.start + 1),
      stroke,
      confidence: roundRatio(Math.min(0.98, best.averageCoverage))
    };
  }
  
  function isDividerPixel(color) {
    if (color.a < 64) return false;
    const lightness = luma(color);
    if (lightness < 55 || lightness > 230) return false;
    if (saturation(color) < 0.15) return false;
    return color.b > color.r + 10 || color.g > color.r + 10;
  }

  return {
    createQuadrantDividerShapes,
    inferQuadrantDividers
  };
}

module.exports = {
  createQuadrantDividerFactory
};
