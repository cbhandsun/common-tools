"use strict";

function createDenseTextGridFactory(dependencies = {}) {
  const {
    averageColor,
    luma,
    normalizeHex,
    parseHex,
    rgbToHex,
    round
  } = dependencies;

  function inferDenseTextGrid(imageBox, textBoxes = []) {
    const gridTextBoxes = gridCandidateTextBoxes(textBoxes);
    if (!imageBox || gridTextBoxes.length < 9) return null;
    const centers = gridTextBoxes.map((item) => ({
      x: Number(item.box?.x || 0) + Number(item.box?.w || 0) / 2,
      y: Number(item.box?.y || 0) + Number(item.box?.h || 0) / 2
    }));
    const xClusters = clusterNumericValues(centers.map((item) => item.x), Math.max(36, Number(imageBox.w || 0) * 0.07));
    const yClusters = clusterNumericValues(centers.map((item) => item.y), Math.max(26, Number(imageBox.h || 0) * 0.09));
    const columns = xClusters.length;
    const rows = yClusters.length;
    if (columns < 3 || rows < 3) return null;
    const density = gridTextBoxes.length / Math.max(1, columns * rows);
    if (density < 0.62) return null;
    const xCenters = xClusters.map((cluster) => cluster.center).sort((a, b) => a - b);
    const yCenters = yClusters.map((cluster) => cluster.center).sort((a, b) => a - b);
    const xLines = boundariesFromCenters(xCenters, imageBox.x, Number(imageBox.x || 0) + Number(imageBox.w || 0));
    const yLines = boundariesFromCenters(yCenters, imageBox.y, Number(imageBox.y || 0) + Number(imageBox.h || 0));
    if (xLines.length < 4 || yLines.length < 4) return null;
    return {
      columns,
      rows,
      density: round(density),
      xLines,
      yLines
    };
  }

  function gridCandidateTextBoxes(textBoxes = []) {
    return (textBoxes || []).filter((item) => {
      const text = String(item?.text || "").trim();
      const box = item?.box || {};
      if (text.length <= 1) return false;
      if (/^[+\-—–·•|/\\]+$/.test(text)) return false;
      if (Number(box.w || 0) < 28 || Number(box.h || 0) < 8) return false;
      return true;
    });
  }

  function clusterNumericValues(values = [], threshold = 24) {
    const clusters = [];
    for (const value of values
      .map((item) => Number(item))
      .filter(Number.isFinite)
      .sort((a, b) => a - b)) {
      const last = clusters[clusters.length - 1];
      if (!last || Math.abs(value - last.center) > threshold) {
        clusters.push({ values: [value], center: value });
      } else {
        last.values.push(value);
        last.center = last.values.reduce((sum, item) => sum + item, 0) / last.values.length;
      }
    }
    return clusters;
  }

  function boundariesFromCenters(centers, min, max) {
    const lines = [round(min)];
    for (let index = 0; index < centers.length - 1; index += 1) {
      lines.push(round((centers[index] + centers[index + 1]) / 2));
    }
    lines.push(round(max));
    return lines;
  }

  function tableGridStrokeColor(textBoxes = []) {
    const colors = textBoxes
      .map((item) => normalizeHex(item.font?.color, null))
      .filter(Boolean)
      .filter((color) => luma(parseHex(color)) < 245);
    if (colors.length === 0) return "#D2DAE4";
    const average = averageColor(colors.map(parseHex));
    const neutral = {
      r: Math.round((average.r + 210) / 2),
      g: Math.round((average.g + 218) / 2),
      b: Math.round((average.b + 228) / 2)
    };
    return rgbToHex(neutral);
  }

  return {
    inferDenseTextGrid,
    tableGridStrokeColor
  };
}

module.exports = { createDenseTextGridFactory };
