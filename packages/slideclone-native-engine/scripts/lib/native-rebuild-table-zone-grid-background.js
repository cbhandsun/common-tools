"use strict";

const { DEFAULT_SLIDE } = require("@common-tools/slideclone-core/page-text-rule-helpers");

function createTableZoneGridBackgroundFactory(dependencies = {}) {
  const {
    boxCenterInside,
    dominantRegionColor,
    insetPtBox,
    isTableCellFillColor,
    ptToPxBox,
    resolveTableGrid,
    rgbToHex,
    round,
    shouldObjectifyTableGrid,
    shouldObjectifyTableZoneVisualAtomShell,
    tableColorBlockShapes,
    tableGridStrokeColor,
    tableZoneVisualAtomShellShapes
  } = dependencies;
  const required = {
    boxCenterInside,
    dominantRegionColor,
    insetPtBox,
    isTableCellFillColor,
    ptToPxBox,
    resolveTableGrid,
    rgbToHex,
    round,
    shouldObjectifyTableGrid,
    shouldObjectifyTableZoneVisualAtomShell,
    tableColorBlockShapes,
    tableGridStrokeColor,
    tableZoneVisualAtomShellShapes
  };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== "function") throw new TypeError(`table zone grid/background dependency ${name} must be a function`);
  }

  function createTableZoneGridShapes(images = [], textBoxes = []) {
    const shapes = [];
    for (const image of images || []) {
      if (shouldObjectifyTableZoneVisualAtomShell(image)) {
        const shellShapes = tableZoneVisualAtomShellShapes(image);
        if (shellShapes.length > 0) {
          shapes.push(...shellShapes);
          image.source = {
            ...(image.source || {}),
            tableZoneVisualAtomShellObjectified: true,
            visualAtomOverlayOnly: true,
            objectifiedTableZoneVisualAtomShellShapes: shellShapes.length,
            nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "table-zone visual atoms"}; table-zone command pills, system nodes, and visual grid lines rebuilt as native editable shell objects while preserving residual fidelity crop`
          };
          continue;
        }
      }
      if (!shouldObjectifyTableGrid(image)) continue;
      const internalTextBoxes = (textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, image.box));
      const grid = resolveTableGrid(image, internalTextBoxes);
      if (!grid) continue;
      const stroke = grid.stroke || tableGridStrokeColor(internalTextBoxes);
      const strokeWidthPt = 0.65;
      for (let index = 0; index < grid.xLines.length; index += 1) {
        const x = grid.xLines[index];
        shapes.push({
          id: `${image.id || "table-zone"}-native-grid-v-${index}`,
          type: "line",
          box: { x, y: image.box.y, w: 0, h: image.box.h },
          style: {
            stroke,
            strokeWidthPt,
            connectorType: "straight"
          },
          source: {
            editable: true,
            nativeRebuild: true,
            detector: "table-zone-native-grid-line",
            layerSourceId: image.id || null,
            axis: "vertical"
          }
        });
      }
      for (let index = 0; index < grid.yLines.length; index += 1) {
        const y = grid.yLines[index];
        shapes.push({
          id: `${image.id || "table-zone"}-native-grid-h-${index}`,
          type: "line",
          box: { x: image.box.x, y, w: image.box.w, h: 0 },
          style: {
            stroke,
            strokeWidthPt,
            connectorType: "straight"
          },
          source: {
            editable: true,
            nativeRebuild: true,
            detector: "table-zone-native-grid-line",
            layerSourceId: image.id || null,
            axis: "horizontal"
          }
        });
      }
      image.source = {
        ...(image.source || {}),
        tableGridObjectified: true,
        objectifiedGrid: {
          provider: grid.provider || "unknown",
          rows: grid.rows,
          columns: grid.columns,
          lineCount: grid.xLines.length + grid.yLines.length,
          xLines: grid.xLines.map(round),
          yLines: grid.yLines.map(round)
        }
      };
    }
    return shapes;
  }
  
  function createTableZoneBackgroundShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
    if (!sourceImage) return [];
    const shapes = [];
    for (const image of images || []) {
      if (!shouldObjectifyTableGrid(image)) continue;
      const internalTextBoxes = (textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, image.box));
      const grid = resolveTableGrid(image, internalTextBoxes);
      if (!grid) continue;
      let count = 0;
      const colorBlocks = tableColorBlockShapes(image, sourceImage, slideSize);
      shapes.push(...colorBlocks);
      count += colorBlocks.length;
      for (let row = 0; row < grid.yLines.length - 1; row += 1) {
        for (let column = 0; column < grid.xLines.length - 1; column += 1) {
          const cell = {
            x: grid.xLines[column],
            y: grid.yLines[row],
            w: grid.xLines[column + 1] - grid.xLines[column],
            h: grid.yLines[row + 1] - grid.yLines[row]
          };
          if (cell.w < 20 || cell.h < 14) continue;
          const pxBox = ptToPxBox(insetPtBox(cell, 2, 2), sourceImage, slideSize, 0);
          const fill = dominantRegionColor(sourceImage, pxBox, 3);
          if (!isTableCellFillColor(fill)) continue;
          shapes.push({
            id: `${image.id || "table-zone"}-native-cell-fill-${row}-${column}`,
            type: "rect",
            box: {
              x: round(cell.x),
              y: round(cell.y),
              w: round(cell.w),
              h: round(cell.h)
            },
            style: {
              fill: rgbToHex(fill),
              stroke: "none",
              strokeWidthPt: 0
            },
            source: {
              editable: true,
              nativeRebuild: true,
              detector: "table-zone-native-cell-fill",
              layerSourceId: image.id || null,
              row,
              column
            }
          });
          count += 1;
        }
      }
      if (count > 0) {
        image.source = {
          ...(image.source || {}),
          tableCellBackgroundObjectified: true,
          objectifiedTableCellBackgrounds: count
        };
      }
    }
    return shapes;
  }

  return {
    createTableZoneBackgroundShapes,
    createTableZoneGridShapes
  };
}

module.exports = {
  createTableZoneGridBackgroundFactory
};
