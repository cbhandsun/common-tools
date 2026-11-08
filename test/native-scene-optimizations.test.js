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
  bindShapesToThemePalette,
  detectAdaptiveCardHierarchy,
  extractAdaptiveThemePalette,
  extractGridTablesFromShapesAndText,
  mergePolylineSegmentsToBentConnectors
} = require("../packages/slideclone-core/diagram-native-scene-enhancer");
const {
  renderPicXml,
  renderShapeXml,
  renderTableXml,
  renderTextBoxXml,
  renderThemeXml
} = require("../packages/slideclone-core/svg/deck-ir-to-pptx-buffer");
const { correctContextualOcrLines } = require("../packages/slideclone-core/ocr/ocr-source-deck");
const { createPrintableHtml } = require("../packages/ppt-create-core/export");
const { createIrPreviewHtml } = require("../packages/ppt-create-core/ir-editor");

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

test("6. detectAdaptiveCardHierarchy discovers nested containers and cards from unknown diagram rasters", () => {
  const width = 320;
  const height = 180;
  const data = new Uint8Array(width * height * 4);
  // Fill white background
  data.fill(255);
  // Paint outer container [20..280, 20..160] with light blue #E0F2FE (224, 242, 254)
  for (let y = 20; y <= 160; y += 1) {
    for (let x = 20; x <= 280; x += 1) {
      const idx = (y * width + x) * 4;
      data[idx] = 224;
      data[idx + 1] = 242;
      data[idx + 2] = 254;
      data[idx + 3] = 255;
    }
  }
  // Paint inner card [50..140, 50..120] with mint green #DCFCE7 (220, 252, 231) separated by white border
  for (let y = 46; y <= 124; y += 1) {
    for (let x = 46; x <= 144; x += 1) {
      const idx = (y * width + x) * 4;
      const isMargin = y < 50 || y > 120 || x < 50 || x > 140;
      data[idx] = isMargin ? 255 : 220;
      data[idx + 1] = isMargin ? 255 : 252;
      data[idx + 2] = isMargin ? 255 : 231;
      data[idx + 3] = 255;
    }
  }

  const detected = detectAdaptiveCardHierarchy(
    { width, height, data },
    { widthPt: 960, heightPt: 540 },
    [{ id: "tb-inner", box: { x: 200, y: 200, w: 60, h: 20 } }]
  );
  assert.ok(detected.length >= 2, "expected outer container and inner card to be detected");
  const container = detected.find((s) => s.source.role === "container");
  const innerCard = detected.find((s) => s.source.parentContainerId === container?.id);
  assert.ok(container, "expected parent container role");
  assert.ok(innerCard, "expected child card linked via parentContainerId");
});

test("7. mergePolylineSegmentsToBentConnectors merges orthogonal segment chains into bentConnector2 / bentConnector3", () => {
  const segs = [
    {
      id: "conn-z-seg-1",
      type: "line",
      box: { x: 100, y: 100, w: 40, h: 0 },
      style: { stroke: "#1E293B", strokeWidthPt: 1.5, dash: "dash" },
      source: { startConnection: { shapeId: "card-a", side: "right", siteIndex: 3 } }
    },
    {
      id: "conn-z-seg-2",
      type: "line",
      box: { x: 140, y: 100, w: 0, h: 80 },
      style: { stroke: "#1E293B", strokeWidthPt: 1.5, dash: "dash" }
    },
    {
      id: "conn-z-seg-3",
      type: "line",
      box: { x: 140, y: 180, w: 60, h: 0 },
      style: { stroke: "#1E293B", strokeWidthPt: 1.5, dash: "dash", endArrow: "triangle" },
      source: { endConnection: { shapeId: "card-b", side: "left", siteIndex: 1 } }
    }
  ];
  const merged = mergePolylineSegmentsToBentConnectors(segs);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "conn-z");
  assert.equal(merged[0].style.connectorType, "bentConnector3");
  assert.equal(merged[0].style.endArrow, "triangle");
  assert.equal(merged[0].source.startConnection.shapeId, "card-a");
  assert.equal(merged[0].source.endConnection.shapeId, "card-b");

  const idMap = new Map([["card-a", 10], ["card-b", 11], ["conn-z", 12]]);
  const xml = renderShapeXml(merged[0], 12, idMap);
  assert.match(xml, /<a:prstGeom prst="bentConnector3"><a:avLst><a:gd name="adj1" fmla="val \d+"\/>/);
  assert.match(xml, /<a:stCxn id="10" idx="3"\/>/);
  assert.match(xml, /<a:endCxn id="11" idx="1"\/>/);
});

test("8. extractGridTablesFromShapesAndText reconstructs 2D cell grids into native <a:tbl> OpenXML tables", () => {
  const shapes = [
    { id: "c-0-0", type: "rect", box: { x: 100, y: 100, w: 120, h: 36 }, style: { fill: "#EFF6FF", stroke: "#94A3B8" } },
    { id: "c-0-1", type: "rect", box: { x: 220, y: 100, w: 140, h: 36 }, style: { fill: "#EFF6FF", stroke: "#94A3B8" } },
    { id: "c-1-0", type: "rect", box: { x: 100, y: 136, w: 120, h: 36 }, style: { fill: "#FFFFFF", stroke: "#94A3B8" } },
    { id: "c-1-1", type: "rect", box: { x: 220, y: 136, w: 140, h: 36 }, style: { fill: "#FFFFFF", stroke: "#94A3B8" } }
  ];
  const textBoxes = [
    { id: "t-0-0", text: "模块", box: { x: 110, y: 108, w: 80, h: 20 }, font: { weight: "bold", color: "#0F172A" } },
    { id: "t-0-1", text: "职责", box: { x: 230, y: 108, w: 80, h: 20 }, font: { weight: "bold", color: "#0F172A" } },
    { id: "t-1-0", text: "Router", box: { x: 110, y: 144, w: 80, h: 20 }, font: { weight: "normal", color: "#334155" } },
    { id: "t-1-1", text: "会话路由", box: { x: 230, y: 144, w: 80, h: 20 }, font: { weight: "normal", color: "#334155" } }
  ];
  const { tables, remainingShapes, remainingTextBoxes } = extractGridTablesFromShapesAndText(shapes, textBoxes);
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].rows, [["模块", "职责"], ["Router", "会话路由"]]);
  assert.equal(remainingShapes.length, 0);
  assert.equal(remainingTextBoxes.length, 0);

  const tblXml = renderTableXml(tables[0], 55);
  assert.match(tblXml, /<p:graphicFrame>/);
  assert.match(tblXml, /<a:tbl>/);
  assert.match(tblXml, /<a:t>会话路由<\/a:t>/);
});

test("9. extractAdaptiveThemePalette & bindShapesToThemePalette generate dynamic <a:clrScheme> and <a:schemeClr>", () => {
  const ir = {
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [
      {
        pageIndex: 0,
        background: { fill: "#FFFFFF" },
        shapes: [
          { id: "s1", type: "roundRect", box: { x: 20, y: 20, w: 100, h: 60 }, style: { fill: "#E1F3FD", stroke: "#2563EB" } },
          { id: "s2", type: "roundRect", box: { x: 140, y: 20, w: 100, h: 60 }, style: { fill: "#DCFCE7", stroke: "#16A34A" } }
        ],
        textBoxes: [{ id: "t1", text: "标题", box: { x: 20, y: 20, w: 80, h: 24 }, font: { color: "#0F172A" } }]
      }
    ]
  };
  const palette = extractAdaptiveThemePalette(ir);
  assert.equal(palette.lt1, "FFFFFF");
  assert.equal(palette.dk1, "0F172A");
  const themeXml = renderThemeXml(palette);
  assert.match(themeXml, /<a:clrScheme name="CommonTools">/);
  assert.match(themeXml, new RegExp(`<a:accent1><a:srgbClr val="${palette.accent1}"/></a:accent1>`));

  const boundShapes = bindShapesToThemePalette(ir.pages[0].shapes, palette);
  assert.ok(boundShapes[0].style.schemeColor.val);
  const schemeShapeXml = renderShapeXml(
    { ...boundShapes[0], style: { ...boundShapes[0].style, useSchemeColor: true } },
    30
  );
  assert.match(schemeShapeXml, /<a:schemeClr val="/);
});

test("10. createIrPreviewHtml embeds smart alignment guides CSS and live connector-following logic", () => {
  const html = createIrPreviewHtml({
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [
      {
        pageIndex: 0,
        shapes: [
          { id: "card-1", type: "roundRect", box: { x: 100, y: 100, w: 160, h: 80 }, style: { fill: "#E0F2FE", stroke: "#0284C7" } },
          {
            id: "conn-1",
            type: "line",
            box: { x: 260, y: 140, w: 100, h: 0 },
            style: { stroke: "#0284C7" },
            source: { startConnection: { shapeId: "card-1", side: "right", siteIndex: 3 } }
          }
        ],
        textBoxes: []
      }
    ]
  });
  assert.match(html, /\.smart-guide-x\{/);
  assert.match(html, /\.smart-guide-y\{/);
  assert.match(html, /function snapWithGuides\(/);
  assert.match(html, /function followConnectors\(/);
});
