"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  bindConnectorsToShapeAnchors,
  enrichShapesWithGradientsAndShadows,
  mergeCardParagraphsAndBullets,
  traceRasterIconToSvg
} = require("../packages/slideclone-core/diagram-native-scene-extractor");
const {
  renderPicXml,
  renderShapeXml,
  renderTextBoxXml
} = require("../packages/slideclone-core/svg/deck-ir-to-pptx-buffer");
const { correctContextualOcrLines } = require("../packages/slideclone-core/ocr/ocr-source-deck");
const { createPrintableHtml } = require("../packages/ppt-create-core/export");

test("1. traceRasterIconToSvg vectorizes opaque raster icons and renderPicXml emits <asvg:svgBlip>", () => {
  const width = 16;
  const height = 16;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 4; y < 12; y += 1) {
    for (let x = 4; x < 12; x += 1) {
      const off = (y * width + x) * 4;
      rgba[off] = 37;
      rgba[off + 1] = 99;
      rgba[off + 2] = 235;
      rgba[off + 3] = 255;
    }
  }
  const svg = traceRasterIconToSvg({ width, height, rgba });
  assert.ok(svg.startsWith("<svg "), "expected valid SVG root");
  assert.match(svg, /<path fill="#[0-9A-F]{6}" d="M4 4H12V12H4Z"\/>/);

  const picXml = renderPicXml(
    { id: "icon-1", box: { x: 10, y: 20, w: 32, h: 32 } },
    10,
    "rId_icon_1",
    "rId_icon_1_svg"
  );
  assert.match(picXml, /<a:blip r:embed="rId_icon_1">/);
  assert.match(picXml, /<asvg:svgBlip xmlns:asvg="http:\/\/schemas\.microsoft\.com\/office\/drawing\/2016\/SVG\/main" r:embed="rId_icon_1_svg"\/>/);
});

test("2. enrichShapesWithGradientsAndShadows adds card shadows and linear gradients rendered in OpenXML and HTML", () => {
  const width = 192;
  const height = 108;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const off = (y * width + x) * 4;
      // Top-to-bottom subtle gradient inside card (#E2E8F0 = 226, 232, 240)
      rgba[off] = Math.round(244 - (y / height) * 42);
      rgba[off + 1] = Math.round(248 - (y / height) * 38);
      rgba[off + 2] = 245;
      rgba[off + 3] = 255;
    }
  }
  const rawShapes = [
    {
      id: "scene-card-1",
      type: "roundRect",
      box: { x: 40, y: 80, w: 260, h: 140 },
      style: { fill: "#E2E8F0", stroke: "#CBD5E1", strokeWidthPt: 1, radiusPt: 10 },
      source: { editable: true, role: "card" }
    }
  ];
  const shapes = enrichShapesWithGradientsAndShadows(rawShapes, { width, height, rgba }, { widthPt: 960, heightPt: 540 });
  assert.ok(shapes[0].style.shadow, "expected card drop shadow to be attached");
  assert.ok(shapes[0].style.gradient, "expected linear gradient to be detected from raster");

  const shapeXml = renderShapeXml(shapes[0], 5);
  assert.match(shapeXml, /<a:gradFill\b/);
  assert.match(shapeXml, /<a:outerShdw\b/);

  const html = createPrintableHtml({
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{ pageIndex: 1, background: { fill: "#FFFFFF" }, shapes, textBoxes: [], images: [] }]
  });
  assert.match(html, /linear-gradient\(/);
  assert.match(html, /box-shadow:/);
});

test("3. bindConnectorsToShapeAnchors binds connector endpoints to nearest card border sites (<a:stCxn> / <a:endCxn>)", () => {
  const rawShapes = [
    {
      id: "card-left",
      type: "roundRect",
      box: { x: 100, y: 100, w: 200, h: 100 },
      style: { fill: "#FFFFFF", stroke: "#94A3B8", strokeWidthPt: 1 },
      source: { role: "card" }
    },
    {
      id: "card-right",
      type: "roundRect",
      box: { x: 400, y: 100, w: 200, h: 100 },
      style: { fill: "#FFFFFF", stroke: "#94A3B8", strokeWidthPt: 1 },
      source: { role: "card" }
    },
    {
      id: "conn-1",
      type: "connector",
      box: { x: 302, y: 150, w: 96, h: 0 },
      style: { stroke: "#3B82F6", strokeWidthPt: 2, endArrow: "triangle" },
      source: { role: "connector" }
    }
  ];
  const shapes = bindConnectorsToShapeAnchors(rawShapes, 18);
  assert.equal(shapes[2].source.startConnection.shapeId, "card-left");
  assert.equal(shapes[2].source.startConnection.siteIndex, 3);
  assert.equal(shapes[2].source.endConnection.shapeId, "card-right");
  assert.equal(shapes[2].source.endConnection.siteIndex, 1);

  const idMap = new Map([["card-left", 101], ["card-right", 102], ["conn-1", 103]]);
  const connXml = renderShapeXml(shapes[2], 103, idMap);
  assert.match(connXml, /<a:stCxn id="101" idx="3"\/>/);
  assert.match(connXml, /<a:endCxn id="102" idx="1"\/>/);
});

test("4. mergeCardParagraphsAndBullets merges multi-line card paragraphs and structures bullet lists (<a:buChar>)", () => {
  const shapes = [
    {
      id: "card-1",
      type: "roundRect",
      box: { x: 50, y: 100, w: 300, h: 180 },
      style: { fill: "#FFFFFF" },
      source: { role: "card" }
    }
  ];
  const textBoxes = [
    {
      id: "tb-title",
      text: "核心架构优势",
      box: { x: 66, y: 112, w: 180, h: 24 },
      font: { family: "Microsoft YaHei", sizePt: 16, weight: "bold", color: "#0F172A", align: "left" }
    },
    {
      id: "tb-b1",
      text: "• 支持多模态视觉与矢量化融合",
      box: { x: 66, y: 148, w: 240, h: 18 },
      font: { family: "Microsoft YaHei", sizePt: 12, weight: "normal", color: "#334155", align: "left" }
    },
    {
      id: "tb-b2",
      text: "• 原生连接符拓扑自动锚定",
      box: { x: 66, y: 170, w: 240, h: 18 },
      font: { family: "Microsoft YaHei", sizePt: 12, weight: "normal", color: "#334155", align: "left" }
    }
  ];
  const merged = mergeCardParagraphsAndBullets(textBoxes, shapes);
  assert.equal(merged.length, 2, "expected consecutive body lines in card to merge into 1 textBox");
  assert.deepEqual(merged[1].style.bullet, { type: "bullet", char: "•" });

  const tbXml = renderTextBoxXml(merged[1], 20);
  assert.match(tbXml, /<a:buChar char="•"\/>/);
});

test("5. correctContextualOcrLines calibrates low-confidence homoglyph confusions from high-confidence slide tokens", () => {
  const rawLines = [
    { text: "OpenXML Pipeline Architecture", confidence: 0.98, box: { x: 10, y: 10, w: 200, h: 24 } },
    { text: "0penXML Stage & Al Agent", confidence: 0.84, box: { x: 10, y: 50, w: 200, h: 24 }, wordPositionHints: [{ text: "0penXML", x: 10, w: 60 }] },
    { text: "AI Agent Controller", confidence: 0.96, box: { x: 10, y: 90, w: 200, h: 24 } }
  ];
  const calibrated = correctContextualOcrLines(rawLines);
  assert.equal(calibrated[1].text, "OpenXML Stage & AI Agent");
  assert.equal(calibrated[1].wordPositionHints, undefined);
});
