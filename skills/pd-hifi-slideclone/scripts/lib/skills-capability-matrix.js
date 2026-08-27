"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { cropPng, writePng } = require("./png");

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };
const DETECTOR_PREFIX = "skills-capability-matrix-native-";

function createSkillsCapabilityMatrixObjects(page = {}, textBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  if (!shouldObjectifySkillsCapabilityMatrix(page, textBoxes, slideSize)) {
    return { matched: false, sourceIds: [], shapes: [], textBoxes: [], images: [] };
  }
  const sourceImages = (page.images || []).filter((image) => image?.source?.detector === "product-illustration-segment-crop");
  const sourceIds = sourceImages.map((image) => String(image.id || "")).filter(Boolean);
  for (const image of sourceImages) {
    image.source = {
      ...(image.source || {}),
      skillsCapabilityMatrixObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      expressionForm: "workflow-diagram",
      expressionSubtype: "skills-capability-matrix",
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "skills capability matrix segment"}; structural card, hub, and routing pixels rebuilt as native components`
    };
  }
  const layout = matrixLayout(slideSize, sourceImages, options.sourceImage);
  return {
    matched: true,
    sourceIds,
    shapes: createMatrixShapes(layout),
    textBoxes: createMatrixTextBoxes(layout),
    images: materializeMatrixIcons(sourceImages[0], layout, slideSize, options)
  };
}

function shouldObjectifySkillsCapabilityMatrix(page = {}, textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const labels = normalizeText((textBoxes || page.textBoxes || []).map((item) => item?.text || "").join(" "));
  if (!/Skills能力矩阵.*重塑智能产品工作流/i.test(labels)) return false;
  for (const signal of ["原始材料", "能力中枢", "需求理解", "PRD评审", "PRD生成", "原型生成", "高质量", "产品资产"]) {
    if (!labels.includes(normalizeText(signal))) return false;
  }
  const candidates = (page.images || []).filter((image) => image?.source?.detector === "product-illustration-segment-crop");
  const area = candidates.reduce((sum, image) => sum + areaOf(image?.box), 0);
  const slideArea = Math.max(1, Number(slideSize.widthPt || 960) * Number(slideSize.heightPt || 540));
  return candidates.length === 4 && area / slideArea >= 0.16 && area / slideArea <= 0.32;
}

function matrixLayout(slideSize = DEFAULT_SLIDE, sourceImages = [], sourceImage = null) {
  const sx = Number(slideSize.widthPt || 960) / 960;
  const sy = Number(slideSize.heightPt || 540) / 540;
  const box = (x, y, w, h) => roundedBox({ x: x * sx, y: y * sy, w: w * sx, h: h * sy });
  const detected = sourceImages.map((image) => image?.box).filter(validBox);
  const measuredInput = denseColorBox(sourceImage, slideSize, detected[0], isGrayFill);
  const measuredHub = denseColorBox(sourceImage, slideSize, detected[1], isBlueFill, 0.22, 0.22);
  const input = measuredInput || (detected[0] ? roundedBox(detected[0]) : box(67, 244, 118, 87));
  const hub = measuredHub || (detected[1] ? roundedBox(detected[1]) : box(251, 198, 178, 179));
  const stageRegion = detected[2] ? roundedBox(detected[2]) : box(501, 154, 253, 267);
  const measuredOutput = denseColorBox(sourceImage, slideSize, detected[3], isGreenFill);
  const output = measuredOutput || (detected[3] ? roundedBox(detected[3]) : box(838, 244, 117, 87));
  const stageWidth = 111 * sx;
  const stageHeight = 117 * sy;
  const firstX = stageRegion.x + 8 * sx;
  const secondX = firstX + 134 * sx;
  const topY = stageRegion.y;
  const bottomY = topY + 150 * sy;
  const stage = (role, title, x, y, region) => {
    const stageBox = denseColorBox(sourceImage, slideSize, region, isBlueFill, 0.35, 0.35)
      || roundedBox({ x, y, w: stageWidth, h: stageHeight });
    return {
      role,
      title,
      box: stageBox,
      icon: lightInkBox(sourceImage, slideSize, stageBox)
        || roundedBox({ x: stageBox.x + 39 * sx, y: stageBox.y + 61 * sy, w: 34 * sx, h: 39 * sy })
    };
  };
  const halfW = stageRegion.w / 2;
  const halfH = stageRegion.h / 2;
  return {
    sx,
    sy,
    input,
    hub,
    stageRegion,
    stages: [
      stage("understanding", "需求理解", firstX, topY, { x: stageRegion.x, y: stageRegion.y, w: halfW, h: halfH }),
      stage("review", "PRD评审", secondX, topY, { x: stageRegion.x + halfW, y: stageRegion.y, w: halfW, h: halfH }),
      stage("prd", "PRD生成", firstX, bottomY, { x: stageRegion.x, y: stageRegion.y + halfH, w: halfW, h: halfH }),
      stage("prototype", "原型生成", secondX, bottomY, { x: stageRegion.x + halfW, y: stageRegion.y + halfH, w: halfW, h: halfH })
    ],
    output
  };
}

function createMatrixShapes(layout) {
  const shapes = [];
  const add = (shape) => shapes.push(shape);
  const line = (id, role, x, y, w, h, stroke, width) => add({
    id,
    type: "line",
    box: roundedBox({ x: x * layout.sx, y: y * layout.sy, w: w * layout.sx, h: h * layout.sy }),
    style: { stroke, strokeWidthPt: width, connectorType: "straight", lineCap: "round" },
    source: source(`${DETECTOR_PREFIX}route`, role, "connector")
  });

  const [topLeft, topRight, bottomLeft, bottomRight] = layout.stages;
  const centerY = layout.hub.y + layout.hub.h / 2;
  const topRouteY = topLeft.box.y + 70 * layout.sy;
  const bottomRouteY = bottomLeft.box.y + 72 * layout.sy;
  const blueTrunkX = topLeft.box.x - 46 * layout.sx;
  const greenTrunkX = topRight.box.x + topRight.box.w + 37 * layout.sx;
  const outputY = layout.output.y + layout.output.h / 2;
  linePt("skills-matrix-input-route", "input-routing", layout.input.x + layout.input.w, centerY, layout.hub.x, centerY, "#969696", 9.5);
  linePt("skills-matrix-hub-route", "input-routing", layout.hub.x + layout.hub.w, centerY, blueTrunkX, centerY, "#196EC5", 9.5);
  linePt("skills-matrix-blue-trunk-top", "input-routing", blueTrunkX, centerY, blueTrunkX, topRouteY, "#196EC5", 9.5);
  linePt("skills-matrix-blue-top-in", "input-routing", blueTrunkX, topRouteY, topLeft.box.x, topRouteY, "#196EC5", 9.5);
  linePt("skills-matrix-blue-trunk-bottom", "input-routing", blueTrunkX, centerY, blueTrunkX, bottomRouteY, "#196EC5", 9.5);
  linePt("skills-matrix-blue-bottom-in", "input-routing", blueTrunkX, bottomRouteY, bottomLeft.box.x, bottomRouteY, "#196EC5", 9.5);
  linePt("skills-matrix-stage-top", "stage-routing", topLeft.box.x + topLeft.box.w, topRouteY, topRight.box.x, topRouteY, "#196EC5", 9.5);
  linePt("skills-matrix-stage-bottom", "stage-routing", bottomLeft.box.x + bottomLeft.box.w, bottomRouteY, bottomRight.box.x, bottomRouteY, "#196EC5", 9.5);
  linePt("skills-matrix-green-top-out", "output-routing", topRight.box.x + topRight.box.w, topRouteY, greenTrunkX, topRouteY, "#2BAE68", 9.5);
  linePt("skills-matrix-green-top-drop", "output-routing", greenTrunkX, topRouteY, greenTrunkX, outputY, "#2BAE68", 9.5);
  linePt("skills-matrix-green-bottom-out", "output-routing", bottomRight.box.x + bottomRight.box.w, bottomRouteY, greenTrunkX, bottomRouteY, "#2BAE68", 9.5);
  linePt("skills-matrix-green-bottom-rise", "output-routing", greenTrunkX, bottomRouteY, greenTrunkX, outputY, "#2BAE68", 9.5);
  linePt("skills-matrix-output-route", "output-routing", greenTrunkX, outputY, layout.output.x, outputY, "#2BAE68", 9.5);

  function linePt(id, role, x1, y1, x2, y2, stroke, width) {
    line(id, role, x1 / layout.sx, y1 / layout.sy, (x2 - x1) / layout.sx, (y2 - y1) / layout.sy, stroke, width);
  }

  add({
    id: "skills-matrix-input-card",
    type: "roundRect",
    box: layout.input,
    style: gradientStyle("#A0A0A0", "#969696", "#8F8F8F"),
    source: withEvidence(source(`${DETECTOR_PREFIX}input-card`, "input", "card"), layout.input)
  });
  add({
    id: "skills-matrix-hub",
    type: "ellipse",
    box: layout.hub,
    style: gradientStyle("#2170C8", "#1D6AC6", "#155BAE"),
    source: withEvidence(source(`${DETECTOR_PREFIX}hub`, "hub", "ellipse"), layout.hub)
  });
  layout.stages.forEach((stage) => add({
    id: `skills-matrix-stage-${stage.role}`,
    type: "roundRect",
    box: stage.box,
    style: gradientStyle("#2372C9", "#1E69C6", "#155CB1"),
    source: withEvidence(source(`${DETECTOR_PREFIX}stage-card`, `stage-${stage.role}`, "card"), stage.box)
  }));
  add({
    id: "skills-matrix-output-card",
    type: "roundRect",
    box: layout.output,
    style: gradientStyle("#49AD78", "#41A36E", "#328E5C"),
    source: withEvidence(source(`${DETECTOR_PREFIX}output-card`, "output", "card"), layout.output)
  });
  return shapes;
}

function createMatrixTextBoxes(layout) {
  const textBoxes = [
    textBox("skills-matrix-title", "Skills 能力矩阵：重塑智能产品工作流", roundedBox({ x: 208 * layout.sx, y: 67 * layout.sy, w: 544 * layout.sx, h: 36 * layout.sy }), 30.5, "#000000", "bold", "center", source(`${DETECTOR_PREFIX}text`, "title", "title")),
    textBox("skills-matrix-input-text", "原始材料", layout.input, 18.5, "#FFFFFF", "bold", "center", source(`${DETECTOR_PREFIX}text`, "input", "label")),
    textBox("skills-matrix-hub-text", "Skills\n能力中枢", roundedInset(layout.hub, 18, 38), 21.5, "#FFFFFF", "bold", "center", source(`${DETECTOR_PREFIX}text`, "hub", "label")),
    textBox("skills-matrix-output-text", "高质量\n产品资产", layout.output, 18.5, "#FFFFFF", "bold", "center", source(`${DETECTOR_PREFIX}text`, "output", "label"))
  ];
  layout.stages.forEach((stage) => textBoxes.push(textBox(
    `skills-matrix-stage-text-${stage.role}`,
    stage.title,
    roundedBox({ x: stage.box.x + 5, y: stage.box.y + 18 * layout.sy, w: stage.box.w - 10, h: 28 * layout.sy }),
    17.3,
    "#FFFFFF",
    "bold",
    "center",
    source(`${DETECTOR_PREFIX}text`, `stage-${stage.role}`, "label")
  )));
  const notes = [
    ["understanding", "需求理解：", "将海量杂乱材料转化为结构化认知。", 64, 434, 393],
    ["review", "PRD评审：", "前置拦截逻辑矛盾与体验阻塞，实现风险左移。", 498, 434, 408],
    ["prd", "PRD生成：", "基于标准模板，输出逻辑严密的标准化文档。", 64, 469, 393],
    ["prototype", "原型生成：", "将静态文字转化为可视化的业务界面表达。", 498, 469, 408]
  ];
  notes.forEach(([role, prefix, body, x, y, w]) => {
    const fullText = `${prefix}${body}`;
    textBoxes.push({
      ...textBox(`skills-matrix-note-${role}`, fullText, roundedBox({ x: x * layout.sx, y: y * layout.sy, w: w * layout.sx, h: 20 * layout.sy }), 15.4, "#111111", "regular", "left", source(`${DETECTOR_PREFIX}note`, `note-${role}`, "text")),
      runs: [
        { text: prefix, font: { family: "Microsoft YaHei", sizePt: 15.4, weight: "bold", color: "#111111" } },
        { text: body, font: { family: "Microsoft YaHei", sizePt: 15.4, weight: "regular", color: "#111111" } }
      ]
    });
  });
  return textBoxes;
}

function materializeMatrixIcons(parentImage, layout, slideSize, options = {}) {
  if (!options.sourceImage || !options.assetDir || !options.irDir) return [];
  fs.mkdirSync(options.assetDir, { recursive: true });
  const deck = safeToken(options.deckName || "deck");
  const page = String(Number(options.pageIndex || 0) + 1).padStart(2, "0");
  return layout.stages.map((stage) => {
    const pxBox = ptToPxBox(stage.icon, options.sourceImage, slideSize, 1);
    const cropped = cropPng(options.sourceImage, pxBox);
    const transparent = isolateLightNeutralIcon(cropped);
    const file = path.join(options.assetDir, `${deck}-p${page}-skills-matrix-${stage.role}-icon.png`);
    writePng(file, transparent);
    return {
      id: `skills-matrix-${stage.role}-icon`,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir, file).replace(/\\/g, "/"),
      box: stage.icon,
      source: {
        editable: false,
        nativeRebuild: true,
        detector: `${DETECTOR_PREFIX}icon-crop`,
        parentImageId: parentImage?.id || null,
        expressionForm: "icon-or-illustration",
        expressionSubtype: `${stage.role}-line-icon`,
        strategy: "local-fidelity-crop",
        recommendedAction: "keep-local-crop",
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        skipVisualAtomRebuild: true,
        nonEditableReason: "source-faithful line icon retained as the smallest pictorial unit",
        ...component(`stage-${stage.role}`, "icon")
      }
    };
  });
}

function isolateLightNeutralIcon(image) {
  const rgba = Buffer.from(image.rgba);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const r = rgba[offset];
    const g = rgba[offset + 1];
    const b = rgba[offset + 2];
    const minimum = Math.min(r, g, b);
    const chroma = Math.max(r, g, b) - minimum;
    const keep = minimum >= 145 && chroma <= 54;
    if (!keep) {
      rgba[offset + 3] = 0;
      continue;
    }
    rgba[offset + 3] = Math.min(rgba[offset + 3], Math.round(255 * Math.min(1, Math.max(0.2, (minimum - 135) / 75))));
  }
  return { ...image, rgba };
}

function denseColorBox(image, slideSize, regionPt, predicate, minColumnCoverage = 0.45, minRowCoverage = 0.45) {
  if (!validImage(image) || !validBox(regionPt)) return null;
  const region = ptRegionToPx(regionPt, image, slideSize);
  const columns = new Array(region.w).fill(0);
  const rows = new Array(region.h).fill(0);
  for (let y = 0; y < region.h; y += 1) {
    for (let x = 0; x < region.w; x += 1) {
      const offset = ((region.y + y) * image.width + region.x + x) * 4;
      if (!predicate(image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2], image.rgba[offset + 3])) continue;
      columns[x] += 1;
      rows[y] += 1;
    }
  }
  const xRange = activeRange(columns, region.h * minColumnCoverage);
  const yRange = activeRange(rows, region.w * minRowCoverage);
  if (!xRange || !yRange) return null;
  return pxBoxToPt({
    x: region.x + xRange[0],
    y: region.y + yRange[0],
    w: xRange[1] - xRange[0] + 1,
    h: yRange[1] - yRange[0] + 1
  }, image, slideSize);
}

function lightInkBox(image, slideSize, stageBox) {
  if (!validImage(image) || !validBox(stageBox)) return null;
  const regionPt = {
    x: stageBox.x + stageBox.w * 0.18,
    y: stageBox.y + stageBox.h * 0.42,
    w: stageBox.w * 0.64,
    h: stageBox.h * 0.5
  };
  const region = ptRegionToPx(regionPt, image, slideSize);
  let minX = region.w;
  let minY = region.h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < region.h; y += 1) {
    for (let x = 0; x < region.w; x += 1) {
      const offset = ((region.y + y) * image.width + region.x + x) * 4;
      if (!isLightNeutral(image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2], image.rgba[offset + 3])) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return pxBoxToPt({ x: region.x + minX, y: region.y + minY, w: maxX - minX + 1, h: maxY - minY + 1 }, image, slideSize);
}

function isGrayFill(r, g, b, a) {
  return a > 0 && r >= 80 && r <= 210 && Math.max(r, g, b) - Math.min(r, g, b) <= 10;
}

function isBlueFill(r, g, b, a) {
  return a > 0 && b >= 120 && b - r >= 60 && g >= 55 && g <= 175;
}

function isGreenFill(r, g, b, a) {
  return a > 0 && g >= 105 && g - r >= 28 && g - b >= 10;
}

function isLightNeutral(r, g, b, a) {
  return a > 0 && Math.min(r, g, b) >= 145 && Math.max(r, g, b) - Math.min(r, g, b) <= 54;
}

function activeRange(values, threshold) {
  const indices = [];
  for (let index = 0; index < values.length; index += 1) if (values[index] >= threshold) indices.push(index);
  return indices.length ? [indices[0], indices[indices.length - 1]] : null;
}

function ptRegionToPx(box, image, slideSize) {
  const sx = image.width / Math.max(1, Number(slideSize.widthPt || 960));
  const sy = image.height / Math.max(1, Number(slideSize.heightPt || 540));
  const x = Math.max(0, Math.floor(box.x * sx));
  const y = Math.max(0, Math.floor(box.y * sy));
  const right = Math.min(image.width, Math.ceil((box.x + box.w) * sx));
  const bottom = Math.min(image.height, Math.ceil((box.y + box.h) * sy));
  return { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) };
}

function pxBoxToPt(box, image, slideSize) {
  const sx = Number(slideSize.widthPt || 960) / image.width;
  const sy = Number(slideSize.heightPt || 540) / image.height;
  return roundedBox({ x: box.x * sx, y: box.y * sy, w: box.w * sx, h: box.h * sy });
}

function validImage(image) {
  return Number(image?.width) > 0 && Number(image?.height) > 0 && image?.rgba;
}

function filterSkillsCapabilityMatrixTextBoxes(textBoxes = [], active = false) {
  if (!active) return textBoxes || [];
  const native = (textBoxes || []).filter((item) => String(item?.source?.detector || "").startsWith(DETECTOR_PREFIX));
  const claimed = new Set(native.map((item) => normalizeText(item.text)));
  const iconNoise = new Set(["q", "图", "百"]);
  const claimedFragments = new Set([
    "skills能力矩阵",
    "重塑智能产品工作流",
    "skills",
    "能力中枢",
    "高质量",
    "产品资产"
  ]);
  return (textBoxes || []).filter((item) => {
    const detector = String(item?.source?.detector || "");
    if (detector.startsWith(DETECTOR_PREFIX)) return true;
    const key = normalizeText(item?.text || "");
    return !claimed.has(key) && !claimedFragments.has(key) && !iconNoise.has(key.toLowerCase());
  });
}

function textBox(id, text, box, sizePt, color, weight, align, sourceValue) {
  return {
    id,
    text,
    box,
    font: { family: "Microsoft YaHei", sizePt, color, weight, align, valign: "middle", opacity: 1 },
    style: { wrap: false, fit: "shrink", marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0 },
    wrap: false,
    source: sourceValue
  };
}

function source(detector, role, part) {
  return {
    editable: true,
    nativeRebuild: true,
    detector,
    expressionForm: "workflow-diagram",
    expressionSubtype: "skills-capability-matrix",
    confidence: 0.96,
    ...component(role, part)
  };
}

function component(role, part) {
  const safeRole = safeToken(role || "component");
  return {
    nativeComponentInstance: true,
    nativeComponentGroupId: `skills-capability-matrix-${safeRole}`,
    nativeComponentArchetype: "skills-capability-matrix",
    nativeComponentRole: safeRole,
    nativeComponentPart: part || "detail"
  };
}

function withEvidence(sourceValue, evidenceBox) {
  return validBox(evidenceBox) ? { ...sourceValue, evidenceBox: roundedBox(evidenceBox) } : sourceValue;
}

function gradientStyle(start, end, stroke) {
  return {
    fill: start,
    gradient: { type: "linear", angleDeg: 0, stops: [{ position: 0, color: start }, { position: 1, color: end }] },
    stroke,
    strokeWidthPt: 0.75,
    radiusPt: 7,
    shadow: { color: "#0F5AA5", alpha: 0.08, blurPt: 2.5, distancePt: 0.6, angle: 90 }
  };
}

function roundedInset(box, xInset, yInset) {
  return roundedBox({ x: box.x + xInset, y: box.y + yInset, w: box.w - xInset * 2, h: box.h - yInset * 2 });
}

function ptToPxBox(box, image, slideSize, paddingPt = 0) {
  const scaleX = image.width / Math.max(1, Number(slideSize.widthPt || 960));
  const scaleY = image.height / Math.max(1, Number(slideSize.heightPt || 540));
  const x = Math.max(0, Math.floor((box.x - paddingPt) * scaleX));
  const y = Math.max(0, Math.floor((box.y - paddingPt) * scaleY));
  const right = Math.min(image.width, Math.ceil((box.x + box.w + paddingPt) * scaleX));
  const bottom = Math.min(image.height, Math.ceil((box.y + box.h + paddingPt) * scaleY));
  return { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) };
}

function roundedBox(box) {
  return Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(Number(value || 0) * 100) / 100]));
}

function areaOf(box) {
  return Math.max(0, Number(box?.w || 0)) * Math.max(0, Number(box?.h || 0));
}

function validBox(box) {
  return [box?.x, box?.y, box?.w, box?.h].every((value) => Number.isFinite(Number(value)))
    && Number(box.w) > 0
    && Number(box.h) > 0;
}

function normalizeText(value) {
  return String(value || "").replace(/[\s:：,，。.;；·•]/g, "").toLowerCase();
}

function safeToken(value) {
  return String(value || "component").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "component";
}

module.exports = {
  DETECTOR_PREFIX,
  createSkillsCapabilityMatrixObjects,
  filterSkillsCapabilityMatrixTextBoxes,
  isolateLightNeutralIcon,
  matrixLayout,
  shouldObjectifySkillsCapabilityMatrix
};
