"use strict";

const { DEFAULT_SLIDE } = require("@common-tools/slideclone-core/page-text-rule-helpers");
const { lineBox } = require("@common-tools/slideclone-core/workflow-shape-primitives");

function createInputOutputSplitFactory(dependencies = {}) {
  const { round } = dependencies;
  if (typeof round !== "function") throw new TypeError("input-output-split dependency round must be a function");

  function createInputOutputSplitDiagramObjects(page, slideSize = DEFAULT_SLIDE) {
    if (!page || !Array.isArray(page.images)) return { shapes: [], textBoxes: [] };
    const shapes = [];
    const textBoxes = [];
    for (const image of page.images) {
      if (!shouldObjectifyInputOutputSplitDiagram(image, page, slideSize)) continue;
      const objects = inputOutputSplitDiagramObjectsForImage(image);
      if (objects.shapes.length === 0) continue;
      const preserveCrop = shouldPreserveInputOutputSplitCropUnderNativeAssistants(image);
      shapes.push(...objects.shapes);
      textBoxes.push(...objects.textBoxes);
      image.source = {
        ...(image.source || {}),
        inputOutputSplitObjectified: true,
        inputOutputSplitPreserveCropUnderNativeAssistants: preserveCrop,
        inputOutputSplitLeftNetworkObjectified: objects.leftNetworkObjectified === true,
        inputOutputSplitResidualBoxes: preserveCrop || objects.leftNetworkObjectified === true ? [] : inputOutputSplitResidualRegions(image.box),
        dropErasedResidualAfterNativeRebuild: preserveCrop ? false : objects.leftNetworkObjectified === true
      };
    }
    return { shapes, textBoxes };
  }

  function shouldPreserveInputOutputSplitCropUnderNativeAssistants(image = {}) {
    const understanding = image?.source?.layer?.diagramUnderstanding || {};
    const atoms = Array.isArray(understanding.visualAtoms) ? understanding.visualAtoms : [];
    return understanding.archetype === "process-with-screenshots"
      && atoms.some((atom) => atom?.residualCandidate === true
        || /screenshot|screen|document|complex/i.test(`${atom?.kind || ""} ${atom?.shapeHint || ""}`));
  }

  function shouldObjectifyInputOutputSplitDiagram(image, page = {}, slideSize = DEFAULT_SLIDE) {
    if (image?.source?.detector !== "cycle-illustration-underlay-crop") return false;
    const box = image.box || {};
    const w = Number(box.w || 0);
    const h = Number(box.h || 0);
    const areaRatio = w * h / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
    if (w < 760 || h < 260 || areaRatio < 0.42 || areaRatio > 0.58) return false;
    const pageText = (page.textBoxes || []).map((item) => String(item.text || "")).join(" ");
    return /物流WMS|入库单管理|质量前置/i.test(pageText);
  }

  function inputOutputSplitDiagramObjectsForImage(image) {
    const box = image.box || {};
    const base = image.id || "input-output-split";
    const blue = "#1667B7";
    const green = "#22B86D";
    const border = "#2F6F68";
    const source = (detector, extra = {}) => ({
      editable: true,
      nativeRebuild: true,
      detector,
      layerSourceId: image.id || null,
      layerType: image.source?.layer?.layerType || "illustration-zone",
      sourceDetector: image.source?.detector || null,
      confidence: 0.7,
      ...extra
    });
    const right = {
      x: Number(box.x || 0) + Number(box.w || 0) * 0.585,
      y: Number(box.y || 0) + Number(box.h || 0) * 0.18,
      w: Number(box.w || 0) * 0.475,
      h: Number(box.h || 0) * 0.59
    };
    const rowH = right.h * 0.31;
    const rowGap = right.h * 0.15;
    const labelW = right.w * 0.42;
    const rows = [
      { label: "已审PRD", detail: "Clear calculation formulas", fill: blue, icon: true },
      { label: "开发参考", detail: "FE/BE/QA tasks\nautomatically extracted", fill: "#1F9B89" },
      { label: "交互验证", detail: "Prototypes linked to logic", fill: "#159C84" }
    ].map((row, index) => ({
      ...row,
      box: {
        x: right.x,
        y: right.y + index * (rowH + rowGap),
        w: right.w,
        h: rowH
      }
    }));
    const shapes = [
      {
        id: `${base}-native-divider`,
        type: "line",
        box: {
          x: round(Number(box.x || 0) + Number(box.w || 0) * 0.515),
          y: round(Number(box.y || 0)),
          w: 0,
          h: round(Number(box.h || 0) * 0.82)
        },
        style: { stroke: "#8B8F91", strokeWidthPt: 1.2, connectorType: "straight" },
        source: source("input-output-split-native-divider")
      },
      {
        id: `${base}-native-title-underline`,
        type: "rect",
        box: {
          x: round(right.x + right.w * 0.31),
          y: round(Number(box.y || 0) + Number(box.h || 0) * 0.08),
          w: round(right.w * 0.44),
          h: round(Number(box.h || 0) * 0.045)
        },
        style: { fill: "#8FB7DD", stroke: "none", strokeWidthPt: 0 },
        source: source("input-output-split-native-title-underline")
      },
      ...rows.flatMap((row, index) => outputRowShapes(base, row, index, labelW, border, source)),
      ...[0, 1].map((index) => {
        const from = rows[index].box;
        const to = rows[index + 1].box;
        return {
          id: `${base}-native-output-arrow-${index}`,
          type: "line",
          box: {
            x: round(from.x + labelW * 0.50),
            y: round(from.y + from.h),
            w: 0,
            h: round(to.y - (from.y + from.h))
          },
          style: { stroke: green, strokeWidthPt: 2.4, connectorType: "straight", endArrow: "triangle" },
          source: source("input-output-split-native-arrow", { arrowIndex: index })
        };
      }),
      {
        id: `${base}-native-bottom-rail-blue`,
        type: "line",
        box: {
          x: round(Number(box.x || 0) + Number(box.w || 0) * 0.02),
          y: round(Number(box.y || 0) + Number(box.h || 0) * 0.98),
          w: round(Number(box.w || 0) * 0.46),
          h: 0
        },
        style: { stroke: "#9AA6AE", strokeWidthPt: 3.2, connectorType: "straight" },
        source: source("input-output-split-native-bottom-rail", { rail: "left" })
      },
      {
        id: `${base}-native-bottom-rail-green`,
        type: "line",
        box: {
          x: round(right.x),
          y: round(Number(box.y || 0) + Number(box.h || 0) * 0.98),
          w: round(right.w),
          h: 0
        },
        style: { stroke: "#18A66B", strokeWidthPt: 3.2, connectorType: "straight" },
        source: source("input-output-split-native-bottom-rail", { rail: "right" })
      }
    ];
    const textBoxes = [
      {
        id: `${base}-native-output-title`,
        text: "Portal Output",
        box: {
          x: round(right.x + right.w * 0.31),
          y: round(Number(box.y || 0) + Number(box.h || 0) * 0.01),
          w: round(right.w * 0.44),
          h: round(Number(box.h || 0) * 0.08)
        },
        font: { family: "Microsoft YaHei", sizePt: 22, color: "#000000", opacity: 1, weight: "bold", align: "center", valign: "middle" },
        source: source("input-output-split-native-output-title")
      },
      ...rows.flatMap((row, index) => outputRowTextBoxes(base, row, index, labelW, source))
    ];
    const leftNetwork = inputComplexityNetworkObjects(base, box, source);
    shapes.push(...leftNetwork.shapes);
    textBoxes.push(...leftNetwork.textBoxes);
    return { shapes, textBoxes, leftNetworkObjectified: true };
  }

  function inputComplexityNetworkObjects(base, box, source) {
    const left = {
      x: Number(box.x || 0) + Number(box.w || 0) * 0.02,
      y: Number(box.y || 0) + Number(box.h || 0) * 0.02,
      w: Number(box.w || 0) * 0.46,
      h: Number(box.h || 0) * 0.78
    };
    const grey = "#7E8588";
    const lightGrey = "#D1D5D8";
    const dark = "#111111";
    const nodeFill = "#BFC4C7";
    const nodes = [
      { id: "overstock", x: 0.30, y: 0.48, label: "V39超收规则", labelBox: { x: -0.02, y: 0.54, w: 0.33, h: 0.14 } },
      { id: "crossdock", x: 0.52, y: 0.25, label: "V39B越库校验", labelBox: { x: 0.62, y: 0.28, w: 0.36, h: 0.14 } },
      { id: "reuse", x: 0.44, y: 0.72, label: "V49复用关系", labelBox: { x: 0.36, y: 0.75, w: 0.34, h: 0.14 } },
      { id: "right", x: 0.78, y: 0.62 }
    ].map((node) => ({
      ...node,
      cx: left.x + left.w * node.x,
      cy: left.y + left.h * node.y,
      r: Math.min(left.w, left.h) * 0.035
    }));
    const nodeById = Object.fromEntries(nodes.map((node) => [node.id, node]));
    const edgePairs = [
      ["overstock", "crossdock"],
      ["crossdock", "right"],
      ["reuse", "crossdock"],
      ["reuse", "right"],
      ["overstock", "right"],
      ["right", "reuse"],
      ["crossdock", "reuse"],
      ["reuse", "overstock"],
      ["overstock", "reuse"]
    ];
    const looseEdges = [
      [{ x: 0.02, y: 0.23 }, { x: 0.27, y: 0.45 }],
      [{ x: 0.08, y: 0.60 }, { x: 0.92, y: 0.36 }],
      [{ x: 0.10, y: 0.88 }, { x: 0.86, y: 0.06 }],
      [{ x: 0.36, y: 0.35 }, { x: 0.82, y: 0.96 }],
      [{ x: 0.54, y: 0.32 }, { x: 0.74, y: 0.84 }],
      [{ x: 0.20, y: 0.74 }, { x: 0.90, y: 0.52 }]
    ];
    const shapes = [
      {
        id: `${base}-native-input-title-underline`,
        type: "roundRect",
        box: {
          x: round(left.x + left.w * 0.30),
          y: round(left.y + left.h * 0.045),
          w: round(left.w * 0.52),
          h: round(left.h * 0.055)
        },
        style: { fill: lightGrey, stroke: "none", strokeWidthPt: 0, radiusRatio: 0.12 },
        source: source("input-output-split-native-input-title-underline")
      },
      ...edgePairs.map(([fromId, toId], index) => {
        const from = nodeById[fromId];
        const to = nodeById[toId];
        return inputComplexityLine(base, index, { x: from.cx, y: from.cy }, { x: to.cx, y: to.cy }, source, grey);
      }),
      ...looseEdges.map(([from, to], index) => inputComplexityLine(base, index + edgePairs.length, {
        x: left.x + left.w * from.x,
        y: left.y + left.h * from.y
      }, {
        x: left.x + left.w * to.x,
        y: left.y + left.h * to.y
      }, source, grey)),
      ...nodes.map((node, index) => ({
        id: `${base}-native-input-node-${index}`,
        type: "ellipse",
        box: {
          x: round(node.cx - node.r),
          y: round(node.cy - node.r),
          w: round(node.r * 2),
          h: round(node.r * 2)
        },
        style: {
          fill: nodeFill,
          stroke: "#8E9699",
          strokeWidthPt: 1.2,
          shadow: { color: "#000000", alpha: 0.10, blurPt: 3, distancePt: 1, angle: 45 }
        },
        source: source("input-output-split-native-input-node", { nodeId: node.id, nodeIndex: index })
      }))
    ];
    const textBoxes = [
      inputComplexityTextBox(base, "Input Complexity", {
        x: left.x + left.w * 0.31,
        y: left.y - left.h * 0.055,
        w: left.w * 0.48,
        h: left.h * 0.10
      }, { sizePt: 22, weight: "bold", color: dark, idSuffix: "title" }, source),
      ...nodes.filter((node) => node.label).map((node) => inputComplexityTextBox(base, node.label, {
        x: left.x + left.w * node.labelBox.x,
        y: left.y + left.h * node.labelBox.y,
        w: left.w * node.labelBox.w,
        h: left.h * node.labelBox.h
      }, { sizePt: 16, weight: "bold", color: dark, idSuffix: node.id }, source))
    ];
    return { shapes, textBoxes };
  }

  function inputComplexityLine(base, index, from, to, source, stroke) {
    return {
      id: `${base}-native-input-network-edge-${index}`,
      type: "line",
      box: lineBox(from, to),
      style: {
        stroke,
        strokeWidthPt: index % 3 === 0 ? 1.7 : 1.35,
        connectorType: "straight",
        endArrow: "triangle",
        lineCap: "round"
      },
      source: source("input-output-split-native-input-edge", { edgeIndex: index })
    };
  }

  function inputComplexityTextBox(base, text, box, options, source) {
    return {
      id: `${base}-native-input-text-${options.idSuffix}`,
      text,
      box: {
        x: round(box.x),
        y: round(box.y),
        w: round(box.w),
        h: round(box.h)
      },
      font: {
        family: "Microsoft YaHei",
        sizePt: options.sizePt,
        color: options.color,
        opacity: 1,
        weight: options.weight,
        align: "center",
        valign: "middle"
      },
      style: {
        visibility: "visible",
        opacity: 1,
        marginLeftPt: 0,
        marginRightPt: 0,
        marginTopPt: 0,
        marginBottomPt: 0,
        fit: "shrink"
      },
      source: source("input-output-split-native-input-text")
    };
  }

  function outputRowShapes(base, row, index, labelW, border, source) {
    return [
      {
        id: `${base}-native-output-card-${index}`,
        type: "rect",
        box: { x: round(row.box.x), y: round(row.box.y), w: round(row.box.w), h: round(row.box.h) },
        style: { fill: "#FFFFFF", stroke: border, strokeWidthPt: 1 },
        source: source("input-output-split-native-output-card", { rowIndex: index, part: "card" })
      },
      {
        id: `${base}-native-output-label-${index}-base`,
        type: "rect",
        box: { x: round(row.box.x), y: round(row.box.y), w: round(labelW), h: round(row.box.h) },
        style: { fill: "#1768B8", stroke: border, strokeWidthPt: 1 },
        source: source("input-output-split-native-output-label", { rowIndex: index, part: "label-base" })
      },
      ...outputLabelGradientStops(base, row, index, labelW, source),
      ...(row.icon ? [{
        id: `${base}-native-output-doc-icon-${index}`,
        type: "document",
        box: {
          x: round(row.box.x + labelW * 0.14),
          y: round(row.box.y + row.box.h * 0.30),
          w: round(row.box.h * 0.30),
          h: round(row.box.h * 0.40)
        },
        style: { fill: "#FFFFFF", stroke: "#FFFFFF", strokeWidthPt: 0 },
        source: source("input-output-split-native-output-label", { rowIndex: index, part: "icon" })
      }] : [])
    ];
  }

  function outputLabelGradientStops(base, row, index, labelW, source) {
    const colors = index === 0
      ? ["#1768B8", "#1870BD", "#1979C0", "#1A81C1", "#1B88BE", "#1B8FB7"]
      : ["#1768B8", "#1776B4", "#1885AC", "#1996A0", "#1AA891", row.fill || "#22B86D"];
    const stopW = labelW / colors.length;
    return colors.map((fill, stopIndex) => ({
      id: `${base}-native-output-label-${index}-grad-${stopIndex}`,
      type: "rect",
      box: {
        x: round(row.box.x + stopIndex * stopW),
        y: round(row.box.y),
        w: round(stopIndex === colors.length - 1 ? labelW - stopW * stopIndex : stopW + 0.4),
        h: round(row.box.h)
      },
      style: { fill, stroke: "none", strokeWidthPt: 0 },
      source: source("input-output-split-native-output-label", { rowIndex: index, part: "label-gradient", stopIndex })
    }));
  }

  function outputRowTextBoxes(base, row, index, labelW, source) {
    return [
      {
        id: `${base}-native-output-label-text-${index}`,
        text: row.label,
        box: {
          x: round(row.box.x + labelW * (row.icon ? 0.30 : 0.12)),
          y: round(row.box.y + row.box.h * 0.18),
          w: round(labelW * (row.icon ? 0.62 : 0.76)),
          h: round(row.box.h * 0.64)
        },
        font: { family: "Microsoft YaHei", sizePt: 18, color: "#FFFFFF", opacity: 1, weight: "bold", align: "center", valign: "middle" },
        source: source("input-output-split-native-output-text", { rowIndex: index, part: "label-text" })
      },
      {
        id: `${base}-native-output-detail-text-${index}`,
        text: row.detail,
        box: {
          x: round(row.box.x + labelW + row.box.w * 0.03),
          y: round(row.box.y + row.box.h * 0.18),
          w: round(row.box.w - labelW - row.box.w * 0.06),
          h: round(row.box.h * 0.64)
        },
        font: { family: "Microsoft YaHei", sizePt: 16, color: "#000000", opacity: 1, weight: "regular", align: "left", valign: "middle" },
        source: source("input-output-split-native-output-text", { rowIndex: index, part: "detail-text" })
      }
    ];
  }

  return {
    createInputOutputSplitDiagramObjects,
    shouldObjectifyInputOutputSplitDiagram,
    shouldPreserveInputOutputSplitCropUnderNativeAssistants
  };
}

function inputOutputSplitResidualRegions(box = {}) {
  return [{
    name: "left-input-complexity-network",
    box: {
      x: Number(box.x || 0),
      y: Number(box.y || 0),
      w: Number(box.w || 0) * 0.52,
      h: Number(box.h || 0)
    }
  }];
}

module.exports = {
  createInputOutputSplitFactory,
  inputOutputSplitResidualRegions
};
