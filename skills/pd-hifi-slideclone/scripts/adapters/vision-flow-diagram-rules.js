"use strict";

const fs = require("fs");
const path = require("path");
const { readPng, writePng, cropPng } = require("../lib/png");

module.exports = async function visionFlowDiagramRules(input, context = {}) {
  const pageWidth = input.page?.widthPx || input.page?.width || 2667;
  const pageHeight = input.page?.heightPx || input.page?.height || 1488;
  const slideWidth = input.slideSize?.widthPt || 960;
  const slideHeight = input.slideSize?.heightPt || 540;
  const sourceScale = {
    x: slideWidth / 2667,
    y: slideHeight / 1488
  };
  const pageScale = {
    x: slideWidth / pageWidth,
    y: slideHeight / pageHeight
  };
  const regions = input.page?.regionProposals || [];
  const uiRegion = regions.find((region) => region.type === "embedded-ui-screenshot") || regions[1];
  const docRegion = regions.find((region) => region.type === "embedded-document-screenshot") || regions[0];
  const uiContainer = boxFromRegionOrFallback(uiRegion, { x: 1056, y: 536, w: 488, h: 604 }, pageScale, sourceScale);
  const docContainer = boxFromRegionOrFallback(docRegion, { x: 1560, y: 536, w: 536, h: 604 }, pageScale, sourceScale);
  const palette = samplePalette(input, {
    sourceScale,
    pageWidth,
    pageHeight,
    uiContainer,
    docContainer
  });

  const shapes = [
    withShadow(scaleVisual(roundRect("banner", { x: 112, y: 260, w: 2444, h: 126 }, palette.bannerFill, "none", 0, "bannerFill", palette), sourceScale), "soft"),

    withShadow(scaleVisual(roundRect("left-prd", { x: 112, y: 580, w: 360, h: 184 }, palette.lightCardFill, "none", 0, "lightCardFill", palette), sourceScale), "card"),
    withShadow(scaleVisual(roundRect("left-dom", { x: 112, y: 912, w: 360, h: 188 }, palette.lightCardFill, "none", 0, "lightCardFill", palette), sourceScale), "card"),
    withShadow(scaleVisual(roundRect("engine", { x: 613, y: 540, w: 322, h: 596 }, palette.blueFill, palette.blueStroke, 1, "blueFill", palette), sourceScale), "strong"),

    withShadow(roundRect("ui-card", uiContainer, palette.lightCardFill, "none", 0, "lightCardFill", palette), "card"),
    withShadow(roundRect("doc-card", docContainer, palette.lightCardFill, "none", 0, "lightCardFill", palette), "card"),

    withShadow(scaleVisual(roundRect("portal-button", { x: 2188, y: 744, w: 370, h: 180 }, palette.blueFill, palette.blueStroke, 1, "blueFill", palette), sourceScale), "strong"),

    scaleVisual(elbow("left-prd-to-engine", 472, 670, 613, 790, palette.grayLine, 4, null, "grayLine", palette), sourceScale),
    scaleVisual(elbow("left-dom-to-engine", 472, 1008, 613, 870, palette.grayLine, 4, null, "grayLine", palette), sourceScale),
    ...arrow("engine-to-ui", 935, 670, 1045, 670, palette.greenLine, "greenLine", palette).map((item) => scaleVisual(item, sourceScale)),
    ...arrow("engine-to-doc-lower", 935, 998, 1045, 998, palette.greenLine, "greenLine", palette).map((item) => scaleVisual(item, sourceScale)),
    scaleVisual(elbow("card-upper-to-portal", 2096, 672, 2188, 812, palette.greenLine, 5, "triangle", "greenLine", palette), sourceScale),
    scaleVisual(elbow("card-lower-to-portal", 2096, 996, 2188, 856, palette.greenLine, 5, "triangle", "greenLine", palette), sourceScale)
  ];

  const textBoxes = [
    scaleText(text("title", "视觉还原与操作同步：彻底消灭文档与界面的割裂", { x: 112, y: 90, w: 1700, h: 70 }, 26, "#000000", "bold"), sourceScale),
    scaleText(text("banner-text", "【Gem 提炼】：将文字方案具象化为高保真交互原型，并自动化生成产品操作手册。", { x: 298, y: 296, w: 1650, h: 46 }, 17, "#000000", "bold"), sourceScale),
    scaleText(text("prd-text", "标准 PRD 文本", { x: 160, y: 642, w: 260, h: 46 }, 17, "#000000", "bold", "center", "middle"), sourceScale),
    scaleText(text("dom-text", "线上系统 DOM /\nFigma 原文件", { x: 142, y: 960, w: 300, h: 86 }, 16, "#000000", "bold", "center", "middle"), sourceScale),
    scaleText(text("engine-title", "形态转换引擎", { x: 660, y: 596, w: 230, h: 44 }, 17, "#FFFFFF", "bold", "center"), sourceScale),
    text("ui-card-title", "可点击交互原型", nudgeBox(titleBox(uiContainer), 0, -2), 14.4, "#000000", "bold"),
    text("doc-card-title", "自动截屏操作手册", nudgeBox(titleBox(docContainer), 0, -2), 14.4, "#000000", "bold"),
    scaleText(text("portal-text", "PM Portal\n门户展示", { x: 2235, y: 792, w: 270, h: 78 }, 17, "#FFFFFF", "regular", "center", "middle"), sourceScale),
    scaleText(text("portal-caption", "路由与菜单全自动打通，\n形成资产最终闭环展示", { x: 2188, y: 970, w: 370, h: 92 }, 15, "#000000", "bold", "center", "middle"), sourceScale)
  ];

  const images = [docRegion, uiRegion]
    .filter(Boolean)
    .map((region, index) => regionImage(input, region, index, pageScale));
  images.push(...iconImages(input, context, {
    sourceScale,
    pageWidth,
    pageHeight,
    uiContainer,
    docContainer
  }));

  return {
    ok: true,
    provider: "vision-flow-diagram-rules",
    data: {
      background: { fill: "#FFFFFF" },
      textBoxes: textBoxes.map((item) => withPageImage(item, input.sourceImage)),
      shapes: shapes.map((item) => withPageImage(item, input.sourceImage)),
      images,
      tables: [],
      charts: [],
      icons: []
    }
  };
};

function samplePalette(input, geometry) {
  const fallback = {
    bannerFill: "#DDF6E8",
    lightCardFill: "#EFF1F2",
    blueFill: "#168BE8",
    blueStroke: "#0D74C5",
    greenLine: "#22B96B",
    grayLine: "#A7A7A7",
    samples: {}
  };
  if (!input.sourceImage || !fs.existsSync(input.sourceImage)) return fallback;
  let image;
  try {
    image = readPng(input.sourceImage);
  } catch {
    return fallback;
  }

  const sampled = {
    bannerFill: guardedSample(image, geometry, { x: 520, y: 300, w: 620, h: 34 }, fallback.bannerFill, 30),
    lightCardFill: guardedSample(image, geometry, { x: 175, y: 600, w: 210, h: 34 }, fallback.lightCardFill, 32),
    blueFill: guardedSample(image, geometry, { x: 675, y: 650, w: 170, h: 42 }, fallback.blueFill, 48),
    blueStroke: fallback.blueStroke,
    greenLine: guardedSample(image, geometry, { x: 955, y: 660, w: 84, h: 20 }, fallback.greenLine, 42, { minSaturation: 0.18 }),
    grayLine: guardedSample(image, geometry, { x: 498, y: 700, w: 46, h: 28 }, fallback.grayLine, 42, { maxLightness: 0.86 }),
    samples: {}
  };
  sampled.blueStroke = darken(sampled.blueFill, 0.78);
  sampled.samples = {
    bannerFill: sampled.bannerFill,
    lightCardFill: sampled.lightCardFill,
    blueFill: sampled.blueFill,
    blueStroke: sampled.blueStroke,
    greenLine: sampled.greenLine,
    grayLine: sampled.grayLine
  };
  return sampled;
}

function guardedSample(image, geometry, box, fallback, maxDistance, options = {}) {
  const pageBox = canonicalToPageBox(box, geometry.pageWidth, geometry.pageHeight);
  const color = robustAverageColor(image, pageBox, fallback, options);
  if (!color) return fallback;
  return hexDistance(color, fallback) <= maxDistance ? color : fallback;
}

function robustAverageColor(image, box, fallback, options = {}) {
  const x1 = clamp(Math.floor(box.x), 0, image.width - 1);
  const y1 = clamp(Math.floor(box.y), 0, image.height - 1);
  const x2 = clamp(Math.ceil(box.x + box.w), x1 + 1, image.width);
  const y2 = clamp(Math.ceil(box.y + box.h), y1 + 1, image.height);
  const values = [];
  for (let y = y1; y < y2; y += 1) {
    for (let x = x1; x < x2; x += 1) {
      const offset = (y * image.width + x) * 4;
      const a = image.rgba[offset + 3];
      if (a < 128) continue;
      const r = image.rgba[offset];
      const g = image.rgba[offset + 1];
      const b = image.rgba[offset + 2];
      const hsl = rgbToHsl(r, g, b);
      if (options.minSaturation && hsl.s < options.minSaturation) continue;
      if (options.maxLightness && hsl.l > options.maxLightness) continue;
      values.push({ r, g, b, l: hsl.l });
    }
  }
  if (values.length < 8) return fallback;
  values.sort((a, b) => a.l - b.l);
  const trim = Math.floor(values.length * 0.18);
  const kept = values.slice(trim, Math.max(trim + 1, values.length - trim));
  const total = kept.reduce((acc, value) => ({
    r: acc.r + value.r,
    g: acc.g + value.g,
    b: acc.b + value.b
  }), { r: 0, g: 0, b: 0 });
  return rgbHex(
    Math.round(total.r / kept.length),
    Math.round(total.g / kept.length),
    Math.round(total.b / kept.length)
  );
}

function sampledStyle(key, palette) {
  if (!key || !palette?.samples?.[key]) return null;
  return {
    sampledStyle: {
      key,
      value: palette.samples[key],
      provider: "vision-flow-diagram-rules"
    }
  };
}

function withShadow(item, variant = "card") {
  const presets = {
    soft: { color: "#000000", alpha: 0.13, blurPt: 3.8, distancePt: 1.0, angleDeg: 45 },
    card: { color: "#000000", alpha: 0.16, blurPt: 4.2, distancePt: 1.3, angleDeg: 45 },
    strong: { color: "#000000", alpha: 0.2, blurPt: 4.6, distancePt: 1.6, angleDeg: 45 }
  };
  return {
    ...item,
    style: {
      ...(item.style || {}),
      shadow: presets[variant] || presets.card
    }
  };
}

function iconImages(input, context, geometry) {
  const icons = [];
  const specs = [
    { id: "banner-gem", box: { x: 135, y: 270, w: 95, h: 100 } },
    { id: "engine-wand", box: { x: 710, y: 720, w: 120, h: 120 } },
    { id: "engine-camera", box: { x: 705, y: 900, w: 125, h: 105 } }
  ];

  const uiGemBox = {
    x: geometry.uiContainer.x + geometry.uiContainer.w - 48,
    y: geometry.uiContainer.y + 7,
    w: 40,
    h: 40
  };
  const docGemBox = {
    x: geometry.docContainer.x + geometry.docContainer.w - 63,
    y: geometry.docContainer.y + 7,
    w: 40,
    h: 40
  };
  specs.push(
    { id: "ui-gem", slideBox: uiGemBox },
    { id: "doc-gem", slideBox: docGemBox }
  );

  for (const spec of specs) {
    const image = cropIconImage(input, context, spec, geometry);
    if (image) icons.push(image);
  }
  return icons;
}

function cropIconImage(input, context, spec, geometry) {
  if (!input.sourceImage || !fs.existsSync(input.sourceImage)) return null;
  const slideBox = spec.slideBox || scaleBox(spec.box, geometry.sourceScale);
  const cropBox = spec.slideBox
    ? slideBoxToPageBox(spec.slideBox, geometry.pageWidth, geometry.pageHeight, input.slideSize)
    : canonicalToPageBox(spec.box, geometry.pageWidth, geometry.pageHeight);
  const outputDir = path.join(context.outputDir || path.dirname(input.sourceImage), "normalized", "icon-crops");
  fs.mkdirSync(outputDir, { recursive: true });
  const cropFile = path.join(outputDir, `page-${input.pageIndex + 1}.${spec.id}.png`);
  const source = readPng(input.sourceImage);
  const crop = transparentizeBackground(cropPng(source, cropBox));
  writePng(cropFile, crop);
  return {
    id: `p${input.pageIndex}-${spec.id}`,
    type: "icon-crop",
    box: slideBox,
    assetPath: cropFile,
    style: {
      opacity: 1,
      assetPath: cropFile,
      strategy: "crop-as-image"
    },
    source: {
      pageImage: input.sourceImage,
      cropImage: cropFile,
      visionProvider: "vision-flow-diagram-rules",
      confidence: 0.85,
      evidenceBox: slideBox,
      evidenceBoxPx: cropBox,
      editable: false,
      nonEditableReason: "Small complex icon retained as a precise raster to avoid shape approximation artifacts."
    }
  };
}

function transparentizeBackground(image) {
  const bg = averageCornerColor(image);
  const rgba = Buffer.from(image.rgba);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const r = rgba[offset];
      const g = rgba[offset + 1];
      const b = rgba[offset + 2];
      const distance = colorDistance({ r, g, b }, bg);
      if (distance <= 34) {
        rgba[offset + 3] = 0;
      } else if (distance <= 48) {
        rgba[offset + 3] = Math.round(255 * ((distance - 34) / 14));
      }
    }
  }
  return { ...image, rgba };
}

function averageCornerColor(image) {
  const samples = [];
  const size = Math.max(2, Math.floor(Math.min(image.width, image.height) * 0.18));
  const corners = [
    [0, 0],
    [Math.max(0, image.width - size), 0],
    [0, Math.max(0, image.height - size)],
    [Math.max(0, image.width - size), Math.max(0, image.height - size)]
  ];
  for (const [sx, sy] of corners) {
    for (let y = sy; y < Math.min(image.height, sy + size); y += 1) {
      for (let x = sx; x < Math.min(image.width, sx + size); x += 1) {
        const offset = (y * image.width + x) * 4;
        samples.push({
          r: image.rgba[offset],
          g: image.rgba[offset + 1],
          b: image.rgba[offset + 2]
        });
      }
    }
  }
  const total = samples.reduce((acc, item) => ({
    r: acc.r + item.r,
    g: acc.g + item.g,
    b: acc.b + item.b
  }), { r: 0, g: 0, b: 0 });
  return {
    r: total.r / samples.length,
    g: total.g / samples.length,
    b: total.b / samples.length
  };
}

function colorDistance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function canonicalToPageBox(box, pageWidth, pageHeight) {
  return {
    x: round(box.x * pageWidth / 2667),
    y: round(box.y * pageHeight / 1488),
    w: round(box.w * pageWidth / 2667),
    h: round(box.h * pageHeight / 1488)
  };
}

function slideBoxToPageBox(box, pageWidth, pageHeight, slideSize = {}) {
  const widthPt = slideSize.widthPt || 960;
  const heightPt = slideSize.heightPt || 540;
  return {
    x: round(box.x * pageWidth / widthPt),
    y: round(box.y * pageHeight / heightPt),
    w: round(box.w * pageWidth / widthPt),
    h: round(box.h * pageHeight / heightPt)
  };
}

function boxFromRegionOrFallback(region, fallbackBox, pageScale, sourceScale) {
  return region?.containerBox
    ? scaleBox(region.containerBox, pageScale)
    : scaleBox(fallbackBox, sourceScale);
}

function titleBox(container) {
  return {
    x: round(container.x + 14),
    y: round(container.y + 17),
    w: round(Math.max(72, container.w - 62)),
    h: 21
  };
}

function text(id, value, box, sizePt, color, weight = "regular", align = "left", valign = "top") {
  return {
    id,
    role: "body",
    text: value,
    box,
    font: {
      family: "Microsoft YaHei",
      sizePt,
      color,
      weight,
      align,
      valign
    },
    style: {
      marginLeftPt: 0,
      marginRightPt: 0,
      marginTopPt: 0,
      marginBottomPt: 0
    },
    source: source(box, true)
  };
}

function roundRect(id, box, fill, stroke, strokeWidthPt, sampleKey = null, palette = null) {
  return {
    id,
    type: "rounded-rect",
    box,
    style: { fill, stroke, strokeWidthPt, radiusRatio: radiusFor(id) },
    source: source(box, true, sampledStyle(sampleKey, palette))
  };
}

function diamond(id, box, fill) {
  return { id, type: "diamond", box, style: { fill, stroke: "none" }, source: source(box, true) };
}

function ellipse(id, box, fill, stroke, strokeWidthPt) {
  return { id, type: "ellipse", box, style: { fill, stroke, strokeWidthPt }, source: source(box, true) };
}

function rightTriangle(id, box, fill) {
  return { id, type: "right-triangle", box, style: { fill, stroke: "none" }, source: source(box, true) };
}

function line(id, x1, y1, x2, y2, stroke, widthPt, endArrow = null, sampleKey = null, palette = null) {
  return {
    id,
    type: "line",
    box: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 },
    style: { stroke, strokeWidthPt: widthPt, ...(endArrow ? { endArrow } : {}) },
    source: source({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, true, sampledStyle(sampleKey, palette))
  };
}

function elbow(id, x1, y1, x2, y2, stroke, widthPt, endArrow = null, sampleKey = null, palette = null) {
  return {
    ...line(id, x1, y1, x2, y2, stroke, widthPt, endArrow, sampleKey, palette),
    style: {
      stroke,
      strokeWidthPt: widthPt,
      connectorType: "elbow",
      ...(endArrow ? { endArrow } : {})
    }
  };
}

function lineGroup(prefix, items) {
  return items.map((item, index) => line(`${prefix}-${index + 1}`, item[0], item[1], item[2], item[3], item[4], item[5], item[6] || null));
}

function arrow(id, x1, y1, x2, y2, stroke, sampleKey = null, palette = null) {
  return [
    line(`${id}-arrow`, x1, y1, x2, y2, stroke, 5, "triangle", sampleKey, palette)
  ];
}

function regionImage(input, region, index, scale) {
  const box = region.box || { x: 0, y: 0, w: 100, h: 100 };
  const slideBox = scaleBox(box, scale);
  return {
    id: `p${input.pageIndex}-region-${String(index + 1).padStart(2, "0")}`,
    type: region.type || "embedded-screenshot",
    box: slideBox,
    assetPath: region.cropImage,
    style: {
      opacity: 1,
      assetPath: region.cropImage,
      strategy: region.strategy || "crop-as-image + editable-overlay"
    },
    source: {
      pageImage: input.sourceImage,
      cropImage: region.cropImage,
      visionProvider: "normalize-regions",
      confidence: region.confidence || 0,
      evidenceBox: slideBox,
      evidenceBoxPx: box,
      editable: false,
      nonEditableReason: "Embedded screenshot retained as a precise raster while surrounding card/title/flow elements are editable.",
      regionReason: region.reason
    }
  };
}

function source(box, editable, extra = null) {
  return {
    visionProvider: "vision-flow-diagram-rules",
    confidence: 0.72,
    evidenceBox: box,
    editable,
    ...(extra || {})
  };
}

function withPageImage(item, pageImage) {
  return {
    ...item,
    source: {
      ...(item.source || {}),
      pageImage
    }
  };
}

function scaleVisual(item, scale) {
  const box = scaleBox(item.box, scale);
  const style = { ...(item.style || {}) };
  if (item.type === "line" && typeof style.strokeWidthPt === "number") {
    style.strokeWidthPt = lineWidthFor(item.id, style.strokeWidthPt);
  }
  return {
    ...item,
    box,
    style,
    source: {
      ...(item.source || {}),
      evidenceBox: box
    }
  };
}

function scaleText(item, scale) {
  const move = textMoveFor(item.id);
  const box = move
    ? nudgeBox(scaleBox(item.box, scale), move.dx, move.dy)
    : scaleBox(item.box, scale);
  const factor = textScaleFor(item.id);
  return {
    ...item,
    box,
    font: {
      ...item.font,
      sizePt: round(item.font.sizePt * Math.min(scale.x, scale.y) * 2.72 * factor)
    },
    source: {
      ...(item.source || {}),
      evidenceBox: box
    }
  };
}

function radiusFor(id) {
  if (id === "banner") return 0.035;
  if (id === "engine" || id === "portal-button") return 0.055;
  if (/card$/.test(id)) return 0.06;
  return 0.045;
}

function lineWidthFor(id, current) {
  if (/cards-to-portal|to-portal|card-/.test(id)) return Math.max(1.5, current * 0.82);
  if (/engine-to/.test(id)) return Math.max(1.5, current * 0.86);
  return Math.max(1.2, current * 0.78);
}

function textScaleFor(id) {
  if (id === "title") return 0.94;
  if (id === "banner-text") return 0.9;
  if (id === "engine-title") return 0.92;
  if (id === "ui-card-title" || id === "doc-card-title") return 0.9;
  if (id === "portal-caption") return 0.9;
  return 0.94;
}

function textMoveFor(id) {
  const moves = {
    title: { dx: 0, dy: 1.5 },
    "banner-text": { dx: -3, dy: 0 },
    "engine-title": { dx: 0, dy: -2 },
    "portal-caption": { dx: 0, dy: -3 }
  };
  return moves[id] || null;
}

function nudgeBox(box, dx, dy) {
  return {
    ...box,
    x: round(box.x + dx),
    y: round(box.y + dy)
  };
}

function scaleBox(box, scale) {
  return {
    x: round(box.x * scale.x),
    y: round(box.y * scale.y),
    w: round(box.w * scale.x),
    h: round(box.h * scale.y)
  };
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h / 6, s, l };
}

function rgbHex(r, g, b) {
  return `#${[r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function darken(hex, factor) {
  const value = String(hex || "").trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return "#0D74C5";
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return rgbHex(r * factor, g * factor, b * factor);
}

function hexDistance(a, b) {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return Number.POSITIVE_INFINITY;
  return colorDistance(ca, cb);
}

function parseHex(hex) {
  const value = String(hex || "").trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return null;
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(value * 100) / 100;
}
