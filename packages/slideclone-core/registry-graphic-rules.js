"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_SLIDE, fitTriangleTopologyEvidenceFontSize, normalizeTriangleTopologyTopText } = require("./page-text-rule-helpers");
const { boxCenterInside, expandPtBox, normalizeHex, round, averageColor, pixel, ptToPxBox, rgbToHex, rgbToHsl, clamp } = require("./raster-native-detection");
const { inferWeight } = require("./native-text-style");
const { normalizeCjkText } = require("./prd-generation-shapes");
const { cropPng, writePng } = require("./png");
const { eraseMasks, resolveAssetPathForIr } = require("./residual-primitive-erasure");
const { comparisonMatrixVisualAtoms } = require("./comparison-matrix-evidence");

function isTerminalVisionDenseRadialCandidate(image = {}, textBoxes = []) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const box = image?.box || {};
  const areaRatio = Number(layer.areaRatio || 0)
    || boxAreaValue(box) / Math.max(1, DEFAULT_SLIDE.widthPt * DEFAULT_SLIDE.heightPt);
  const pageText = normalizeCjkText([
    source.pageText,
    source.allText,
    ...(Array.isArray(textBoxes) ? textBoxes.map((item) => item?.text) : [])
  ].filter(Boolean).join(" "));
  return source.detector === "foreground-aggregate-crop"
    && areaRatio >= 0.5
    && Number(box.w || 0) >= 700
    && Number(box.h || 0) >= 300
    && /终局视野|智能产品底座|复利引擎|企业级.*ai.*产品底座/i.test(pageText);
}

function eraseDenseRadialSearchControlFromCrop(image, searchBox, sourceImage, slideSize, options = {}) {
  const assetFile = resolveAssetPathForIr(image?.assetPath, options.irDir);
  if (!assetFile || !fs.existsSync(assetFile) || !sourceImage || !searchBox?.box || !image?.box) return false;
  const irRoot = path.resolve(options.irDir);
  const resolvedAsset = path.resolve(assetFile);
  const relative = path.relative(irRoot, resolvedAsset);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return false;
  const erasedSource = eraseMasks(sourceImage, [
    ptToPxBox(expandPtBox(searchBox.box, slideSize, 4, 4), sourceImage, slideSize, 0)
  ]);
  const crop = cropPng(erasedSource, ptToPxBox(image.box, sourceImage, slideSize, 0));
  writePng(resolvedAsset, crop);
  return true;
}

function createAggregateGridAtomSkeletonShapes(image = {}) {
  if (!shouldObjectifyAggregateGridAtomSkeleton(image)) return [];
  void (image.box || {});
  const atoms = comparisonMatrixVisualAtoms(image)
    .filter((atom) => String(atom?.kind || "") === "grid-line-candidate")
    .filter((atom) => atom?.box && Number(atom.box.w || 0) > 0 && Number(atom.box.h || 0) > 0)
    .slice(0, 24);
  const base = image.id || "foreground-aggregate";
  return atoms.map((atom, index) => {
    const atomBox = atom.box || {};
    const axis = atom.axis || (Number(atomBox.h || 0) >= Number(atomBox.w || 0) ? "v" : "h");
    const line = axis === "v"
      ? {
        x: round(Number(atomBox.x || 0) + Number(atomBox.w || 0) / 2),
        y: round(Number(atomBox.y || 0)),
        w: 0,
        h: round(Number(atomBox.h || 0))
      }
      : {
        x: round(Number(atomBox.x || 0)),
        y: round(Number(atomBox.y || 0) + Number(atomBox.h || 0) / 2),
        w: round(Number(atomBox.w || 0)),
        h: 0
      };
    return {
      id: `${base}-native-aggregate-grid-atom-${index}`,
      type: "line",
      box: line,
      style: {
        stroke: normalizeHex(atom.color, "#72B9C6"),
        strokeWidthPt: clamp(Number(axis === "v" ? atomBox.w : atomBox.h) * 0.55, 0.8, 4.2),
        connectorType: "straight",
        lineCap: "round",
        opacity: 0.76
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "foreground-aggregate-native-grid-atom",
        expressionForm: "complex-diagram",
        expressionSubtype: "aggregate-grid-atom-skeleton",
        layerSourceId: image.id || null,
        layerType: image.source?.layer?.layerType || "diagram-zone",
        skeletonOnly: true,
        visualAtomId: atom.id || null,
        axis,
        atomIndex: index
      }
    };
  });
}

function shouldObjectifyAggregateGridAtomSkeleton(image = {}) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};
  const box = image?.box || {};
  if (source.detector !== "foreground-aggregate-crop") return false;
  if (layer.layerType !== "diagram-zone") return false;
  if (!box.w || !box.h || Number(box.w) < 600 || Number(box.h) < 260) return false;
  if (/screenshot|photo|chart-snapshot/i.test(`${source.expressionForm || ""} ${source.expressionSubtype || ""}`)) return false;
  const atoms = comparisonMatrixVisualAtoms(image).filter((atom) => String(atom?.kind || "") === "grid-line-candidate");
  const vertical = atoms.filter((atom) => atom.axis === "v" || Number(atom?.box?.h || 0) > Number(atom?.box?.w || 0) * 4).length;
  const horizontal = atoms.filter((atom) => atom.axis === "h" || Number(atom?.box?.w || 0) > Number(atom?.box?.h || 0) * 4).length;
  const readiness = String(understanding.nativeReadiness || "");
  const family = String(source.componentTemplateFamilyApplied || understanding.componentStrategy?.templateFamily || "");
  return atoms.length >= 8
    && vertical >= 4
    && horizontal >= 1
    && (Number(understanding.confidence || 0) >= 0.72 || readiness === "native-rebuild" || family === "matrix");
}

function regularPolygonPoints(sides, rotation = 0) {
  const count = Math.max(3, Math.floor(Number(sides) || 0));
  return Array.from({ length: count }, (_, index) => {
    const angle = rotation - Math.PI / 2 + (Math.PI * 2 * index) / count;
    return {
      x: round(0.5 + Math.cos(angle) * 0.5, 4),
      y: round(0.5 + Math.sin(angle) * 0.5, 4)
    };
  });
}

function boxAreaValue(box = {}) {
  return Math.max(0, Number(box.w || 0)) * Math.max(0, Number(box.h || 0));
}

function triangleTopologyNativeTextBoxes(image, topology, textBoxes = []) {
  return [
    ...triangleTopologyCenterTextBoxes(image, topology, textBoxes),
    ...triangleTopologyTopTextBoxes(image, topology, textBoxes),
    ...triangleTopologyBottomTextBoxes(image, topology, textBoxes),
    ...triangleTopologySideTextBoxes(image, topology, textBoxes)
  ];
}

function triangleTopologyCenterTextBoxes(image, topology, textBoxes = []) {
  const centerBand = expandPtBox({
    x: topology.center.x - topology.center.w * 0.9,
    y: topology.center.y + topology.center.h * 0.55,
    w: topology.center.w * 3.1,
    h: topology.center.h * 1.05
  }, DEFAULT_SLIDE, 0, 0);
  return (textBoxes || [])
    .filter((item) => item?.box && typeof item.text === "string" && /基线|一致性/.test(item.text))
    .filter((item) => boxCenterInside(item.box, centerBand))
    .slice(0, 1)
    .map((item, index) => ({
      ...JSON.parse(JSON.stringify(item)),
      id: `${image.id || "triangle-topology"}-native-center-text-${index}`,
      font: {
        ...(item.font || {}),
        family: item.font?.family || "Microsoft YaHei",
        sizePt: fitTriangleTopologyEvidenceFontSize(item, "center-baseline"),
        color: visibleNativeTextColor(item),
        weight: inferWeight(item, item.font?.weight),
        align: item.font?.align || "center",
        valign: "middle",
        opacity: 1
      },
      style: {
        ...(item.style || {}),
        visibility: "visible",
        opacity: 1,
        marginLeftPt: 0,
        marginRightPt: 0,
        marginTopPt: 0,
        marginBottomPt: 0
      },
      source: {
        ...(item.source || {}),
        editable: true,
        nativeRebuild: true,
        detector: "triangle-topology-native-center-text",
        layerSourceId: image.id || null
      }
    }));
}

function triangleTopologyTopTextBoxes(image, topology, textBoxes = []) {
  const diagramBox = image?.box || topology?.center || DEFAULT_SLIDE;
  const topBand = expandPtBox({
    x: diagramBox.x + diagramBox.w * 0.48,
    y: diagramBox.y - diagramBox.h * 0.02,
    w: diagramBox.w * 0.42,
    h: diagramBox.h * 0.22
  }, DEFAULT_SLIDE, 0, 0);
  const candidates = (textBoxes || [])
    .filter((item) => item?.box && typeof item.text === "string" && /原型|高仿|Hif|HiFi/i.test(item.text))
    .filter((item) => boxCenterInside(item.box, topBand))
    .filter((item) => !isTriangleTopologyTopFragment(item.text));
  const selected = candidates.length > 0
    ? candidates
    : (textBoxes || [])
      .filter((item) => item?.box && typeof item.text === "string" && /原型|高仿|Hif|HiFi/i.test(item.text))
      .filter((item) => boxCenterInside(item.box, topBand))
      .slice(0, 1);
  return selected
    .slice(0, 2)
    .map((item, index) => ({
      ...JSON.parse(JSON.stringify(item)),
      id: `${image.id || "triangle-topology"}-native-top-text-${index}`,
      text: normalizeTriangleTopologyTopText(item.text),
      font: {
        ...(item.font || {}),
        family: item.font?.family || "Microsoft YaHei",
        sizePt: fitTriangleTopologyEvidenceFontSize(item, "top-node"),
        color: visibleNativeTextColor(item),
        weight: inferWeight(item, item.font?.weight),
        align: item.font?.align || "center",
        valign: "middle",
        opacity: 1
      },
      style: {
        ...(item.style || {}),
        visibility: "visible",
        opacity: 1,
        marginLeftPt: 0,
        marginRightPt: 0,
        marginTopPt: 0,
        marginBottomPt: 0
      },
      source: {
        ...(item.source || {}),
        editable: true,
        nativeRebuild: true,
        detector: "triangle-topology-native-top-text",
        layerSourceId: image.id || null
      }
    }));
}

function triangleTopologyBottomTextBoxes(image, topology, textBoxes = []) {
  const diagramBox = image?.box || topology?.center || DEFAULT_SLIDE;
  const bottomBand = expandPtBox({
    x: diagramBox.x + diagramBox.w * 0.22,
    y: diagramBox.y + diagramBox.h * 0.78,
    w: diagramBox.w * 0.58,
    h: diagramBox.h * 0.25
  }, DEFAULT_SLIDE, 0, 0);
  return (textBoxes || [])
    .filter((item) => item?.box && typeof item.text === "string" && /辅以|描述|推导|PRD/i.test(item.text))
    .filter((item) => boxCenterInside(item.box, bottomBand))
    .slice(0, 1)
    .map((item, index) => ({
      ...JSON.parse(JSON.stringify(item)),
      id: `${image.id || "triangle-topology"}-native-bottom-text-${index}`,
      font: {
        ...(item.font || {}),
        family: item.font?.family || "Microsoft YaHei",
        sizePt: fitTriangleTopologyEvidenceFontSize(item, "bottom-edge"),
        color: visibleNativeTextColor(item),
        weight: inferWeight(item, item.font?.weight),
        align: item.font?.align || "center",
        valign: "middle",
        opacity: 1
      },
      style: {
        ...(item.style || {}),
        visibility: "visible",
        opacity: 1,
        marginLeftPt: 0,
        marginRightPt: 0,
        marginTopPt: 0,
        marginBottomPt: 0
      },
      source: {
        ...(item.source || {}),
        editable: true,
        nativeRebuild: true,
        detector: "triangle-topology-native-bottom-text",
        layerSourceId: image.id || null
      }
    }));
}

function triangleTopologySideTextBoxes(image, topology, textBoxes = []) {
  const diagramBox = image?.box || topology?.center || DEFAULT_SLIDE;
  const sideBands = [
    {
      side: "right",
      rotation: 60,
      box: expandPtBox({
        x: diagramBox.x + diagramBox.w * 0.66,
        y: diagramBox.y + diagramBox.h * 0.20,
        w: diagramBox.w * 0.36,
        h: diagramBox.h * 0.48
      }, DEFAULT_SLIDE, 0, 0),
      pattern: /原型|可视化|验证/i
    },
    {
      side: "left",
      rotation: -60,
      box: expandPtBox({
        x: diagramBox.x - diagramBox.w * 0.02,
        y: diagramBox.y + diagramBox.h * 0.20,
        w: diagramBox.w * 0.34,
        h: diagramBox.h * 0.48
      }, DEFAULT_SLIDE, 0, 0),
      pattern: /评审|锁定|基线/i
    }
  ];
  const results = [];
  for (const band of sideBands) {
    const item = (textBoxes || [])
      .filter((candidate) => candidate?.box && typeof candidate.text === "string" && band.pattern.test(candidate.text))
      .filter((candidate) => boxCenterInside(candidate.box, band.box))
      .sort((a, b) => textBoxArea(b) - textBoxArea(a))[0];
    if (!item) continue;
    results.push(rotatedTriangleTopologyTextBox(image, item, band.rotation, band.side, results.length));
  }
  return results;
}

function rotatedTriangleTopologyTextBox(image, item, rotation, side, index) {
  const sourceBox = item.box || {};
  const cx = Number(sourceBox.x || 0) + Number(sourceBox.w || 0) / 2;
  const cy = Number(sourceBox.y || 0) + Number(sourceBox.h || 0) / 2;
  const width = Math.max(Number(sourceBox.h || 0) * 1.08, Number(sourceBox.w || 0) * 1.25, 110);
  const height = Math.max(18, Math.min(28, Number(sourceBox.w || 0) * 0.32));
  const text = normalizeTriangleTopologySideText(item.text, side);
  const fittedSizePt = fitTriangleTopologyEvidenceFontSize({ ...item, text, box: { x: 0, y: 0, w: width, h: height }, rotation }, `${side}-edge`);
  return {
    ...JSON.parse(JSON.stringify(item)),
    id: `${image.id || "triangle-topology"}-native-side-text-${side}-${index}`,
    text,
    box: {
      x: round(cx - width / 2),
      y: round(cy - height / 2),
      w: round(width),
      h: round(height)
    },
    rotation,
    font: {
      ...(item.font || {}),
      family: item.font?.family || "Microsoft YaHei",
      sizePt: fittedSizePt,
      color: visibleNativeTextColor(item),
      weight: inferWeight(item, item.font?.weight),
      align: "center",
      valign: "middle",
      opacity: 1
    },
    style: {
      ...(item.style || {}),
      visibility: "visible",
      opacity: 1,
      wrap: false,
      marginLeftPt: 0,
      marginRightPt: 0,
      marginTopPt: 0,
      marginBottomPt: 0
    },
    source: {
      ...(item.source || {}),
      editable: true,
      nativeRebuild: true,
      detector: "triangle-topology-native-side-text",
      layerSourceId: image.id || null,
      side,
      evidenceBox: sourceBox
    }
  };
}

function normalizeTriangleTopologySideText(text, side) {
  const raw = String(text || "");
  if (side !== "left") return raw;
  if (!/评审|锁定|基线/.test(raw)) return raw;
  return raw.replace(/^Al(?=评审|审核|锁定|基线)/, "AI");
}

function isTriangleTopologyTopFragment(text) {
  const normalized = String(text || "").trim();
  if (/^hif$/i.test(normalized)) return false;
  return /^[a-z]{1,4}$/i.test(normalized) && !/^hifi$/i.test(normalized);
}

function textBoxArea(item) {
  const box = item?.box || {};
  return Math.max(0, Number(box.w || 0)) * Math.max(0, Number(box.h || 0));
}

function visibleNativeTextColor(item, fallback = "#1F1F1F") {
  if (item?.style?.visibility === "hidden" || Number(item?.font?.opacity) === 0 || Number(item?.style?.opacity) === 0) {
    return fallback;
  }
  return normalizeHex(item?.font?.color, fallback);
}

function sampleTriangleTopologyArrowFill(sourceImage, box, slideSize = DEFAULT_SLIDE) {
  if (!sourceImage || !box) return null;
  const sampleBox = ptToPxBox(box, sourceImage, slideSize, 0);
  const buckets = Array.from({ length: 12 }, () => []);
  const xEnd = Math.min(sourceImage.width, sampleBox.x + sampleBox.w);
  const yEnd = Math.min(sourceImage.height, sampleBox.y + sampleBox.h);
  for (let y = Math.max(0, sampleBox.y); y < yEnd; y += 2) {
    for (let x = Math.max(0, sampleBox.x); x < xEnd; x += 2) {
      const color = pixel(sourceImage, x, y);
      const hsl = rgbToHsl(color);
      if (color.a < 64 || hsl.s < 0.24 || hsl.l < 0.16 || hsl.l > 0.88) continue;
      buckets[Math.floor(hsl.h / 30) % buckets.length].push(color);
    }
  }
  const colors = buckets.sort((a, b) => b.length - a.length)[0];
  if (!colors || colors.length < 20) return null;
  return rgbToHex(averageColor(colors));
}

module.exports = { triangleTopologyNativeTextBoxes, triangleTopologyBottomTextBoxes, visibleNativeTextColor, triangleTopologyCenterTextBoxes, triangleTopologySideTextBoxes, rotatedTriangleTopologyTextBox, normalizeTriangleTopologySideText, textBoxArea, triangleTopologyTopTextBoxes, isTriangleTopologyTopFragment, sampleTriangleTopologyArrowFill, isTerminalVisionDenseRadialCandidate, boxAreaValue, regularPolygonPoints, eraseDenseRadialSearchControlFromCrop, createAggregateGridAtomSkeletonShapes, shouldObjectifyAggregateGridAtomSkeleton };
