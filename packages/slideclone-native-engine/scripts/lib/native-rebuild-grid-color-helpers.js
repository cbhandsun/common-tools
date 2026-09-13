"use strict";

function createGridColorHelpersFactory(dependencies = {}) {
  const {
    averageColor,
    connectedColorBlockEntries,
    expandProductSegmentPxBox,
    inferDenseTextGrid,
    ptToPxBox,
    pxToPtBox,
    rgbToHex,
    rgbToHsl,
    round,
    uniqueSortedLinePositions
  } = dependencies;
  const required = {
    averageColor,
    connectedColorBlockEntries,
    expandProductSegmentPxBox,
    inferDenseTextGrid,
    ptToPxBox,
    pxToPtBox,
    rgbToHex,
    rgbToHsl,
    round,
    uniqueSortedLinePositions
  };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== "function") throw new TypeError(`grid/color helper dependency ${name} must be a function`);
  }

  function resolveTableGrid(image, internalTextBoxes = []) {
    const textGrid = inferDenseTextGrid(image.box, internalTextBoxes);
    if (textGrid) return { ...textGrid, provider: "dense-text-grid" };
    const visualGrid = image?.source?.layer?.diagramUnderstanding?.visualGrid;
    if (isUsableVisualTableGrid(visualGrid, image?.box)) return {
      provider: "visual-grid-structure",
      rows: visualGrid.rows,
      columns: visualGrid.columns,
      density: null,
      xLines: visualGrid.xLines.map(round),
      yLines: visualGrid.yLines.map(round),
      stroke: visualGrid.stroke || null
    };
    return inferTableGridFromVisualAtoms(image);
  }
  
  function isUsableVisualTableGrid(visualGrid, imageBox = {}) {
    if (!visualGrid || !Array.isArray(visualGrid.xLines) || !Array.isArray(visualGrid.yLines)) return false;
    if (Number(visualGrid.rows || 0) < 2 || Number(visualGrid.columns || 0) < 2) return false;
    if (visualGrid.xLines.length < 3 || visualGrid.yLines.length < 3) return false;
    if (Number(visualGrid.lineCount || 0) > 28) return false;
    const coverage = Number(visualGrid.coverageRatio || 0);
    if (coverage < 0.18 || coverage > 1.05) return false;
    const bounds = visualGrid.bounds || {};
    const imageArea = Math.max(1, Number(imageBox.w || 0) * Number(imageBox.h || 0));
    const boundsArea = Math.max(1, Number(bounds.w || 0) * Number(bounds.h || 0));
    if (boundsArea / imageArea < 0.18) return false;
    return true;
  }
  
  function inferTableGridFromVisualAtoms(image = {}) {
    const box = image.box || {};
    if (![box.x, box.y, box.w, box.h].every((value) => Number.isFinite(Number(value))) || Number(box.w) <= 0 || Number(box.h) <= 0) return null;
    const atoms = Array.isArray(image?.source?.layer?.visualAtoms)
      ? image.source.layer.visualAtoms
      : Array.isArray(image?.source?.layer?.diagramUnderstanding?.visualAtoms)
        ? image.source.layer.diagramUnderstanding.visualAtoms
        : [];
    const gridAtoms = atoms.filter((atom) => String(atom?.kind || "") === "grid-line-candidate" && atom.box);
    if (gridAtoms.length < 3) return null;
    const vertical = gridAtoms
      .filter((atom) => atom.axis === "v" || /vertical/.test(String(atom.shapeHint || "")))
      .map((atom) => ({
        position: Number(atom.box.x || 0) + Number(atom.box.w || 0) / 2,
        color: atom.color || null
      }))
      .filter((line) => line.position > Number(box.x || 0) + Number(box.w || 0) * 0.04 && line.position < Number(box.x || 0) + Number(box.w || 0) * 0.96);
    const horizontal = gridAtoms
      .filter((atom) => atom.axis === "h" || /horizontal/.test(String(atom.shapeHint || "")))
      .map((atom) => ({
        position: Number(atom.box.y || 0) + Number(atom.box.h || 0) / 2,
        color: atom.color || null
      }))
      .filter((line) => line.position > Number(box.y || 0) + Number(box.h || 0) * 0.04 && line.position < Number(box.y || 0) + Number(box.h || 0) * 0.96);
    if (vertical.length < 1 || horizontal.length < 1) return null;
    const xLines = uniqueSortedLinePositions([
      Number(box.x || 0),
      ...vertical.map((line) => line.position),
      Number(box.x || 0) + Number(box.w || 0)
    ], Math.max(5, Number(box.w || 0) * 0.012));
    const yLines = uniqueSortedLinePositions([
      Number(box.y || 0),
      ...horizontal.map((line) => line.position),
      Number(box.y || 0) + Number(box.h || 0)
    ], Math.max(4, Number(box.h || 0) * 0.012));
    if (xLines.length < 3 || yLines.length < 3) return null;
    if (xLines.length + yLines.length > 32) return null;
    return {
      provider: "visual-atom-grid-lines",
      rows: yLines.length - 1,
      columns: xLines.length - 1,
      density: null,
      xLines: xLines.map(round),
      yLines: yLines.map(round),
      stroke: dominantGridAtomStroke([...vertical, ...horizontal])
    };
  }
  
  
  
  function dominantGridAtomStroke(lines = []) {
    const counts = {};
    for (const line of lines) {
      const color = String(line.color || "").trim();
      if (!/^#[0-9a-f]{6}$/i.test(color)) continue;
      counts[color.toLowerCase()] = (counts[color.toLowerCase()] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }
  
  function tableColorBlockShapes(image, sourceImage, slideSize) {
    return colorBlockShapesForImage(image, sourceImage, slideSize, {
      detector: "table-zone-native-cell-fill",
      idPrefix: "table-zone",
      minAreaRatio: 0.012,
      maxAreaRatio: 0.42,
      minSampledDensity: 0.18
    });
  }
  
  function colorBlockShapesForImage(image, sourceImage, slideSize, options = {}) {
    const pxImageBox = ptToPxBox(image.box, sourceImage, slideSize, 0);
    const shapes = [];
    const detector = options.detector || "layer-native-color-block";
    const idPrefix = options.idPrefix || "layer";
    const minAreaRatio = Number(options.minAreaRatio || 0.012);
    const maxAreaRatio = Number(options.maxAreaRatio || 0.42);
    const minDensity = Number(options.minSampledDensity || 0.18);
    const entries = connectedColorBlockEntries(sourceImage, pxImageBox);
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const box = expandProductSegmentPxBox({
        x: entry.minX,
        y: entry.minY,
        w: entry.maxX - entry.minX + 4,
        h: entry.maxY - entry.minY + 4
      }, sourceImage, 1, 1);
      const areaRatio = box.w * box.h / Math.max(1, sourceImage.width * sourceImage.height);
      const sampledDensity = (entry.count * 16) / Math.max(1, box.w * box.h);
      if (areaRatio < minAreaRatio || areaRatio > maxAreaRatio || sampledDensity < minDensity) continue;
      const ptBox = pxToPtBox(box, sourceImage, slideSize, 0);
      shapes.push({
        id: `${idPrefix}-${image.id || idPrefix}-native-color-block-${entry.key}-${index}`,
        type: "rect",
        box: ptBox,
        style: {
          fill: rgbToHex(averageColor(entry.colors)),
          stroke: "none",
          strokeWidthPt: 0
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector,
          layerSourceId: image.id || null,
          colorBlock: entry.key
        }
      });
    }
    return shapes;
  }
  
  
  
  
  
  
  
  function isTableCellFillColor(color) {
    if (!color) return false;
    const hsl = rgbToHsl(color);
    if (hsl.l > 0.90 && hsl.s < 0.18) return false;
    if (hsl.l > 0.84 && hsl.s < 0.08) return false;
    return hsl.s >= 0.14 || hsl.l <= 0.72;
  }
  
  function insetPtBox(box, padX, padY) {
    const x = Number(box.x || 0) + padX;
    const y = Number(box.y || 0) + padY;
    const w = Math.max(1, Number(box.w || 0) - padX * 2);
    const h = Math.max(1, Number(box.h || 0) - padY * 2);
    return { x, y, w, h };
  }

  return {
    colorBlockShapesForImage,
    inferTableGridFromVisualAtoms,
    insetPtBox,
    isTableCellFillColor,
    isUsableVisualTableGrid,
    resolveTableGrid,
    tableColorBlockShapes
  };
}

module.exports = {
  createGridColorHelpersFactory
};
