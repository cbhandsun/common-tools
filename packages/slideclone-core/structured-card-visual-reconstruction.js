"use strict";
const fs = require("node:fs");
const { round, centerOfBox, expandPtBox, luma, pixel, saturation } = require("./raster-native-detection");
const { visualAtomNativeShape, nativeGearApproximationShapes } = require("./visual-atom-native-shapes");
const { clampPtBoxToSlide } = require("./structured-residual-splitting");
const { lineBox } = require("./workflow-shape-primitives");
const { readPng } = require("./png");
const { resolveAssetPathForIr } = require("./residual-primitive-erasure");
const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function structuredIllustrationWarningIconShapes(image = {}, irDir = null, index = 0, slideSize = DEFAULT_SLIDE) {
  const variant = structuredIllustrationWarningIconVariant(image, irDir);
  if (!variant) return [];
  const box = clampPtBoxToSlide(image.box || {}, slideSize);
  const base = image.id || `structured-warning-${index}`;
  const fill = "#F97316";
  const source = (part, partBox) => ({
    editable: true,
    nativeRebuild: true,
    detector: "structured-illustration-warning-icon-native",
    layerSourceId: image.source?.parentImageId || image.id || null,
    layerType: image.source?.layer?.layerType || "illustration-zone",
    residualSourceId: image.id || null,
    residualDetector: image.source?.detector || null,
    iconPart: part,
    confidence: 0.88,
    regionBox: partBox
  });
  if (variant === "wave-warning") {
    return structuredIllustrationWaveWarningIconShapes({ base, box, fill, source, index, slideSize });
  }
  const triangleBox = structuredIllustrationSmallWarningTriangleBox(box);
  const bar = {
    x: triangleBox.x + triangleBox.w * 0.46,
    y: triangleBox.y + triangleBox.h * 0.25,
    w: triangleBox.w * 0.10,
    h: triangleBox.h * 0.42
  };
  const dot = {
    x: triangleBox.x + triangleBox.w * 0.455,
    y: triangleBox.y + triangleBox.h * 0.73,
    w: triangleBox.w * 0.12,
    h: triangleBox.h * 0.12
  };
  const shapes = [
    {
      id: `${base}-native-warning-triangle-${index}`,
      type: "triangle",
      box: clampPtBoxToSlide(triangleBox, slideSize),
      style: { fill, stroke: "none", strokeWidthPt: 0, opacity: 1 },
      source: source("triangle", triangleBox)
    },
    {
      id: `${base}-native-warning-bar-${index}`,
      type: "rect",
      box: clampPtBoxToSlide(bar, slideSize),
      style: { fill: "#FFFFFF", stroke: "none", strokeWidthPt: 0, radiusRatio: 0.1 },
      source: source("exclamation-bar", bar)
    },
    {
      id: `${base}-native-warning-dot-${index}`,
      type: "ellipse",
      box: clampPtBoxToSlide(dot, slideSize),
      style: { fill: "#FFFFFF", stroke: "none", strokeWidthPt: 0 },
      source: source("exclamation-dot", dot)
    }
  ];
  return shapes;
}

function structuredIllustrationSmallWarningTriangleBox(box = {}) {
  const size = Math.min(Number(box.w || 0) * 0.46, Number(box.h || 0) * 0.52);
  return {
    x: round(Number(box.x || 0) + Number(box.w || 0) * 0.08),
    y: round(Number(box.y || 0) + Number(box.h || 0) * 0.13),
    w: round(size),
    h: round(size)
  };
}

function structuredIllustrationWarningIconVariant(image = {}, irDir = null) {
  const source = image.source || {};
  if (source.detector !== "structured-illustration-sparse-residual-crop") return null;
  if (source.residualSplitMode !== "structured-illustration-sparse-residual") return null;
  const box = image.box || {};
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const aspect = w / Math.max(1, h);
  const smallIcon = w >= 18 && h >= 16 && w <= 58 && h <= 58 && aspect >= 0.75 && aspect <= 1.45;
  const waveIcon = w >= 88 && h >= 52 && w <= 150 && h <= 100 && aspect >= 1.25 && aspect <= 1.85;
  if (!smallIcon && !waveIcon) return null;
  const assetFile = resolveAssetPathForIr(image.assetPath, irDir);
  if (!assetFile || !fs.existsSync(assetFile)) return null;
  const png = readPng(assetFile);
  if (smallIcon && residualLooksLikeSmallOrangeWarningIcon(png)) return "small-warning";
  if (waveIcon && residualLooksLikeWaveWarningIcon(png)) return "wave-warning";
  return null;
}

function structuredIllustrationWaveWarningIconShapes({ base, box, fill, source, index, slideSize = DEFAULT_SLIDE }) {
  const triangleBox = {
    x: box.x + box.w * 0.30,
    y: box.y + box.h * 0.16,
    w: box.w * 0.40,
    h: box.h * 0.70
  };
  const bar = {
    x: triangleBox.x + triangleBox.w * 0.46,
    y: triangleBox.y + triangleBox.h * 0.26,
    w: triangleBox.w * 0.10,
    h: triangleBox.h * 0.42
  };
  const dot = {
    x: triangleBox.x + triangleBox.w * 0.455,
    y: triangleBox.y + triangleBox.h * 0.73,
    w: triangleBox.w * 0.12,
    h: triangleBox.h * 0.12
  };
  const waveColor = "#F6B894";
  const arcShape = (side, arcIndex, arcBox) => ({
    id: `${base}-native-warning-wave-${side}-${arcIndex}-${index}`,
    type: "arc",
    box: clampPtBoxToSlide(arcBox, slideSize),
    style: {
      fill: "none",
      stroke: waveColor,
      strokeWidthPt: 2.2,
      opacity: 0.92,
      adjustments: side === "left" ? [135, 225] : [-45, 45]
    },
    source: source(`wave-${side}-${arcIndex}`, arcBox)
  });
  const leftCx = triangleBox.x + triangleBox.w * 0.08;
  const rightCx = triangleBox.x + triangleBox.w * 0.92;
  const cy = triangleBox.y + triangleBox.h * 0.46;
  const waveSizes = [0.34, 0.52, 0.70];
  const waves = waveSizes.flatMap((ratio, waveIndex) => {
    const aw = box.w * ratio * 0.34;
    const ah = box.h * ratio * 0.82;
    return [
      arcShape("left", waveIndex, { x: leftCx - aw * 0.62 - waveIndex * box.w * 0.035, y: cy - ah / 2, w: aw, h: ah }),
      arcShape("right", waveIndex, { x: rightCx - aw * 0.38 + waveIndex * box.w * 0.035, y: cy - ah / 2, w: aw, h: ah })
    ];
  });
  return [
    ...waves,
    {
      id: `${base}-native-warning-triangle-${index}`,
      type: "triangle",
      box: clampPtBoxToSlide(triangleBox, slideSize),
      style: { fill, stroke: "none", strokeWidthPt: 0, opacity: 1 },
      source: source("triangle", triangleBox)
    },
    {
      id: `${base}-native-warning-bar-${index}`,
      type: "rect",
      box: clampPtBoxToSlide(bar, slideSize),
      style: { fill: "#FFFFFF", stroke: "none", strokeWidthPt: 0, radiusRatio: 0.1 },
      source: source("exclamation-bar", bar)
    },
    {
      id: `${base}-native-warning-dot-${index}`,
      type: "ellipse",
      box: clampPtBoxToSlide(dot, slideSize),
      style: { fill: "#FFFFFF", stroke: "none", strokeWidthPt: 0 },
      source: source("exclamation-dot", dot)
    }
  ];
}

function createStructuredIllustrationCardVisualAtomShapes(page = {}, cardShellShapes = [], existingShapes = [], slideSize = DEFAULT_SLIDE) {
  if (!page || !Array.isArray(page.images)) return [];
  const cardBackgrounds = (cardShellShapes || [])
    .filter((shape) => shape?.source?.detector === "structured-illustration-card-native-background")
    .sort((a, b) => Number(a.box?.x || 0) - Number(b.box?.x || 0));
  if (cardBackgrounds.length < 2) return [];
  const existingAtomIds = new Set((existingShapes || [])
    .map((shape) => shape?.source?.atomId)
    .filter(Boolean));
  const seen = new Set();
  const shapes = [];
  for (const image of page.images || []) {
    if (image?.source?.detector !== "structured-illustration-card-residual-crop") continue;
    const atoms = image?.source?.layer?.visualAtoms || [];
    if (!Array.isArray(atoms) || atoms.length === 0) continue;
    const pseudoImage = {
      ...image,
      source: {
        ...(image.source || {}),
        layer: {
          ...(image.source?.layer || {}),
          layerType: "illustration-zone"
        }
      }
    };
    for (let index = 0; index < atoms.length; index += 1) {
      const atom = atoms[index];
      if (!atom?.box) continue;
      const card = structuredIllustrationCardForAtom(atom, cardBackgrounds);
      if (!card) continue;
      const key = `${atom.id || ""}:${round(atom.box.x)}:${round(atom.box.y)}:${round(atom.box.w)}:${round(atom.box.h)}`;
      if (seen.has(key) || existingAtomIds.has(atom.id)) continue;
      const nativeAtom = structuredIllustrationNativeAtomForCard(atom, card);
      if (!nativeAtom) {
        const glyphs = structuredIllustrationResidualAtomGlyphShapes(pseudoImage, atom, card, shapes.length, slideSize);
        if (glyphs.length > 0) {
          seen.add(key);
          shapes.push(...glyphs);
        }
        continue;
      }
      const shape = visualAtomNativeShape(pseudoImage, nativeAtom, shapes.length, {});
      const emitted = Array.isArray(shape) ? shape.filter(Boolean) : shape ? [shape] : [];
      if (emitted.length === 0) continue;
      seen.add(key);
      for (const item of emitted) {
        item.source = {
          ...(item.source || {}),
          detector: `${item.source?.detector || "visual-atom-native"}-structured-card`,
          structuredCardAtomObjectified: true,
          cardIndex: card.index,
          layerType: "illustration-zone"
        };
      }
      shapes.push(...emitted);
    }
  }
  return shapes;
}

function structuredIllustrationCardForAtom(atom = {}, cardBackgrounds = []) {
  const center = centerOfBox(atom.box || {});
  return (cardBackgrounds || [])
    .map((shape, index) => ({ ...shape, index }))
    .find((shape) => center.x >= Number(shape.box?.x || 0)
      && center.x <= Number(shape.box?.x || 0) + Number(shape.box?.w || 0)
      && center.y >= Number(shape.box?.y || 0)
      && center.y <= Number(shape.box?.y || 0) + Number(shape.box?.h || 0));
}

function structuredIllustrationNativeAtomForCard(atom = {}, card = {}) {
  if (atom.nativeCandidate !== true) return null;
  const kind = String(atom.kind || "");
  const box = atom.box || {};
  void (card.box || {});
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  if (kind === "grid-line-candidate") {
    return null;
  }
  if (kind === "native-scatter-point-candidate" && (w > 52 || h > 52)) return null;
  if (kind === "connector-line-candidate" && Math.max(w, h) < 18) return null;
  return {
    ...atom,
    nativeCandidate: true,
    residualCandidate: false
  };
}

function structuredIllustrationResidualAtomGlyphShapes(image = {}, atom = {}, card = {}, startIndex = 0, slideSize = DEFAULT_SLIDE) {
  const kind = String(atom.kind || "");
  const hint = String(atom.shapeHint || "");
  const box = atom.box || {};
  const cardBox = card.box || {};
  if (kind === "icon-crop-candidate" && hint === "rect" && isStructuredIllustrationTitleWarningAtom(atom, cardBox)) {
    return structuredIllustrationWarningIconShapes(
      { ...image, id: `${image.id || "structured-card"}-title-warning-${startIndex}`, box },
      startIndex,
      slideSize,
      "small-warning"
    );
  }
  if (kind === "icon-crop-candidate" && hint === "complex" && card.index === 1 && Number(box.w || 0) >= 80 && Number(box.h || 0) >= 45) {
    const glyphBox = structuredIllustrationMiddleGearPersonTemplateBox(card.box || box, box);
    const source = (part, partBox = box) => ({
      editable: true,
      nativeRebuild: true,
      detector: "structured-illustration-card-gear-person-native",
      layerSourceId: image.id || null,
      atomId: atom.id || null,
      atomKind: atom.kind || null,
      shapeHint: atom.shapeHint || null,
      layerType: "illustration-zone",
      iconPart: part,
      confidence: atom.density ?? 0.56,
      regionBox: partBox
    });
    const base = `${image.id || "structured-card"}-gear-person-${startIndex}`;
    return [
      ...structuredIllustrationGearPersonGearShapes(base, glyphBox, source, slideSize),
      ...structuredIllustrationGearPersonHumanShapes(base, glyphBox, source),
      ...structuredIllustrationGearPersonMotionShapes(base, glyphBox, source)
    ];
  }
  return [];
}

function structuredIllustrationMiddleGearPersonTemplateBox(cardBox = {}, evidenceBox = null) {
  const x = Number(cardBox.x || 0);
  const y = Number(cardBox.y || 0);
  const w = Number(cardBox.w || 0);
  const h = Number(cardBox.h || 0);
  if (isStructuredIllustrationGearPersonEvidenceBox(evidenceBox, cardBox)) {
    return clampPtBoxToSlide(expandPtBox(evidenceBox, DEFAULT_SLIDE, 18, 18), DEFAULT_SLIDE);
  }
  return {
    x: round(x + w * 0.12),
    y: round(y + h * 0.34),
    w: round(w * 0.76),
    h: round(h * 0.34)
  };
}

function isStructuredIllustrationGearPersonEvidenceBox(evidenceBox = {}, cardBox = {}) {
  if (!evidenceBox?.w || !evidenceBox?.h || !cardBox?.w || !cardBox?.h) return false;
  const center = centerOfBox(evidenceBox);
  const cardX = Number(cardBox.x || 0);
  const cardY = Number(cardBox.y || 0);
  const cardW = Number(cardBox.w || 0);
  const cardH = Number(cardBox.h || 0);
  const areaRatio = Number(evidenceBox.w || 0) * Number(evidenceBox.h || 0) / Math.max(1, cardW * cardH);
  const aspect = Number(evidenceBox.w || 0) / Math.max(1, Number(evidenceBox.h || 0));
  return center.x >= cardX + cardW * 0.16
    && center.x <= cardX + cardW * 0.86
    && center.y >= cardY + cardH * 0.30
    && center.y <= cardY + cardH * 0.76
    && areaRatio >= 0.035
    && areaRatio <= 0.28
    && aspect >= 0.8
    && aspect <= 2.2;
}

function isStructuredIllustrationTitleWarningAtom(atom = {}, cardBox = {}) {
  const box = atom.box || {};
  const color = String(atom.color || "").toLowerCase();
  return /#f6|#f7|#f8|#f9/.test(color)
    && Number(box.y || 0) <= Number(cardBox.y || 0) + Number(cardBox.h || 0) * 0.12
    && Number(box.w || 0) >= 24
    && Number(box.w || 0) <= 56
    && Number(box.h || 0) >= 18
    && Number(box.h || 0) <= 42
    && Number(atom.density || 0) >= 0.48;
}

function residualLooksLikeSmallOrangeWarningIcon(image) {
  if (!image || image.width < 16 || image.height < 16 || image.width > 96 || image.height > 96) return false;
  let colored = 0;
  let orange = 0;
  let white = 0;
  let total = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const color = pixel(image, x, y);
      if (color.a < 64) continue;
      total += 1;
      const lightness = luma(color);
      const sat = saturation(color);
      if (lightness > 246 && sat < 0.12) {
        white += 1;
        continue;
      }
      if (sat > 0.35 && color.r > color.g * 1.35 && color.r > color.b * 1.7) orange += 1;
      if (!(lightness > 248 && sat < 0.1)) colored += 1;
    }
  }
  const safeTotal = Math.max(1, total);
  const coloredRatio = colored / safeTotal;
  const orangeRatio = orange / safeTotal;
  const whiteRatio = white / safeTotal;
  return coloredRatio >= 0.18
    && coloredRatio <= 0.68
    && orangeRatio >= 0.14
    && whiteRatio >= 0.22;
}

function residualLooksLikeWaveWarningIcon(image) {
  if (!image || image.width < 96 || image.height < 64 || image.width > 240 || image.height > 160) return false;
  let total = 0;
  let colored = 0;
  let orange = 0;
  let paleOrange = 0;
  let white = 0;
  let dark = 0;
  let leftPale = 0;
  let rightPale = 0;
  const centerX = image.width / 2;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const color = pixel(image, x, y);
      if (color.a < 64) continue;
      total += 1;
      const lightness = luma(color);
      const sat = saturation(color);
      if (lightness > 246 && sat < 0.12) {
        white += 1;
        continue;
      }
      if (lightness < 95) dark += 1;
      const isOrange = sat > 0.35 && color.r > color.g * 1.22 && color.r > color.b * 1.55;
      const isPaleOrange = sat > 0.16 && color.r > color.b * 1.18 && color.r >= color.g * 0.95 && lightness > 145;
      if (isOrange) orange += 1;
      if (isPaleOrange) {
        paleOrange += 1;
        if (x < centerX - image.width * 0.18) leftPale += 1;
        if (x > centerX + image.width * 0.18) rightPale += 1;
      }
      if (!(lightness > 248 && sat < 0.1)) colored += 1;
    }
  }
  const safeTotal = Math.max(1, total);
  const coloredRatio = colored / safeTotal;
  const orangeRatio = orange / safeTotal;
  const paleRatio = paleOrange / safeTotal;
  const whiteRatio = white / safeTotal;
  const darkRatio = dark / safeTotal;
  return coloredRatio >= 0.16
    && coloredRatio <= 0.66
    && orangeRatio >= 0.12
    && paleRatio >= 0.05
    && whiteRatio >= 0.32
    && darkRatio <= 0.03
    && leftPale >= 20
    && rightPale >= 20;
}

function structuredIllustrationGearPersonGearShapes(base, box, source, slideSize = DEFAULT_SLIDE) {
  const gearFill = "#CBD5E1";
  const gearStroke = "#334155";
  const gears = [
    { name: "left-large", cx: -0.01, cy: 0.47, s: 0.40, teeth: true },
    { name: "top-left", cx: 0.22, cy: 0.18, s: 0.31, teeth: true },
    { name: "top-small", cx: 0.64, cy: 0.12, s: 0.24, teeth: true },
    { name: "right-large", cx: 1.02, cy: 0.36, s: 0.48, teeth: true },
    { name: "lower-left", cx: 0.33, cy: 0.63, s: 0.21, teeth: true },
    { name: "bottom", cx: 0.63, cy: 0.78, s: 0.33, teeth: true },
    { name: "right-small", cx: 0.88, cy: 0.68, s: 0.20, teeth: true }
  ];
  return gears.flatMap((gear, index) => nativeGearApproximationShapes({
    id: `${base}-native-gear-${gear.name}-${index}`,
    cx: Number(box.x || 0) + Number(box.w || 0) * gear.cx,
    cy: Number(box.y || 0) + Number(box.h || 0) * gear.cy,
    size: Math.min(Number(box.w || 0), Number(box.h || 0)) * gear.s,
    fill: gearFill,
    stroke: gearStroke,
    source: (part, partBox) => source(`gear-${gear.name}-${part}`, partBox),
    slideSize
  }));
}

function structuredIllustrationGearPersonHumanShapes(base, box, source) {
  const color = "#334155";
  const x = Number(box.x || 0);
  const y = Number(box.y || 0);
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const line = (name, x1, y1, x2, y2, width) => ({
    id: `${base}-native-person-${name}`,
    type: "line",
    box: lineBox({ x: x + w * x1, y: y + h * y1 }, { x: x + w * x2, y: y + h * y2 }),
    style: { stroke: color, strokeWidthPt: width, connectorType: "straight", lineCap: "round", opacity: 0.96 },
    source: source(`person-${name}`)
  });
  const headBox = { x: x + w * 0.38, y: y + h * 0.29, w: w * 0.11, h: h * 0.12 };
  return [
    {
      id: `${base}-native-person-head`,
      type: "ellipse",
      box: clampPtBoxToSlide(headBox),
      style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 0.98 },
      source: source("person-head", headBox)
    },
    line("torso", 0.47, 0.33, 0.56, 0.55, 7.6),
    line("left-arm", 0.50, 0.40, 0.33, 0.51, 6.8),
    line("right-arm", 0.54, 0.42, 0.72, 0.34, 6.8),
    line("left-leg", 0.56, 0.55, 0.49, 0.76, 7.2),
    line("right-leg", 0.57, 0.55, 0.72, 0.66, 7.2),
    line("back-sash", 0.42, 0.49, 0.67, 0.40, 4.8)
  ];
}

function structuredIllustrationGearPersonMotionShapes(base, box, source) {
  const x = Number(box.x || 0);
  const y = Number(box.y || 0);
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const motionColor = "#334155";
  const line = (name, x1, y1, x2, y2, width = 1.3) => ({
    id: `${base}-native-motion-${name}`,
    type: "line",
    box: lineBox({ x: x + w * x1, y: y + h * y1 }, { x: x + w * x2, y: y + h * y2 }),
    style: { stroke: motionColor, strokeWidthPt: width, connectorType: "straight", lineCap: "round", opacity: 0.78 },
    source: source(`motion-${name}`)
  });
  return [
    line("right-1", 0.91, 0.84, 0.96, 0.78),
    line("right-2", 0.95, 0.88, 1.00, 0.82),
    line("right-top", 0.96, 0.29, 0.99, 0.22, 1.1),
    line("left-1", 0.07, 0.50, 0.00, 0.57),
    line("left-2", 0.10, 0.57, 0.04, 0.63),
    line("left-top", 0.12, 0.32, 0.06, 0.27, 1.1)
  ];
}

module.exports = { createStructuredIllustrationCardVisualAtomShapes, structuredIllustrationCardForAtom, structuredIllustrationNativeAtomForCard, structuredIllustrationResidualAtomGlyphShapes, isStructuredIllustrationTitleWarningAtom, structuredIllustrationGearPersonGearShapes, structuredIllustrationGearPersonHumanShapes, structuredIllustrationGearPersonMotionShapes, structuredIllustrationMiddleGearPersonTemplateBox, isStructuredIllustrationGearPersonEvidenceBox, structuredIllustrationWarningIconShapes, structuredIllustrationSmallWarningTriangleBox, structuredIllustrationWarningIconVariant, residualLooksLikeSmallOrangeWarningIcon, residualLooksLikeWaveWarningIcon, structuredIllustrationWaveWarningIconShapes };
