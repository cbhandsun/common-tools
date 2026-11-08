"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { validateDeckIr } = require("../packages/slideclone-core/deck-ir-admission");
const { extractProjectArchive } = require("../packages/archive-core");
const { validatePackage } = require("../packages/slideclone-worker-adapter/team-worker");
const { buildOpenXmlDecksSync } = require("../packages/slideclone-native-engine");
const {
  compileSvgToDeckIr,
  parseSvgPathToAbsoluteCommands
} = require("../packages/slideclone-core/svg/svg-to-deck-ir");
const {
  createEditableSourceArchive
} = require("../packages/slideclone-worker-adapter/team-raw-image-archive");
const {
  createDeckIrFromSvgSlides,
  embedSvgIntoSlidePage
} = require("../packages/ppt-create-core");

const SAMPLE_ARCH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540">
  <defs>
    <linearGradient id="layerBlue" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#DCEBFF"/>
      <stop offset="100%" stop-color="#EAF4FF"/>
    </linearGradient>
    <marker id="arrowEnd" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
      <path d="M0,0 L8,4 L0,8 Z" fill="#6873A8"/>
    </marker>
  </defs>
  <rect x="0" y="0" width="960" height="540" fill="#FFFFFF"/>
  <g id="entry-layer" transform="translate(0, 0)">
    <rect x="36" y="28" width="888" height="120" rx="14" fill="url(#layerBlue)" stroke="#BDD8FF" stroke-width="1.5"/>
    <text x="64" y="72" font-size="22" font-weight="bold" fill="#18345E">业务入口层</text>
    <text x="64" y="102" font-size="14" fill="#4A628A">接收用户需求并返回结果</text>
    <rect x="280" y="46" width="180" height="84" rx="10" fill="#FFFFFF" stroke="#D8E8FF"/>
    <text x="370" y="94" font-size="16" font-weight="bold" text-anchor="middle" fill="#23406B">聊天界面</text>
  </g>
  <line x1="480" y1="148" x2="480" y2="208" stroke="#6873A8" stroke-width="2.5" stroke-dasharray="6,4" marker-end="url(#arrowEnd)"/>
  <circle cx="480" cy="260" r="36" fill="#EEF2FF" stroke="#6366F1" stroke-width="2"/>
  <path d="M 120 420 C 220 360, 340 360, 440 420 A 40 40 0 0 1 520 420 L 600 420 Z" fill="#F0FDF4" stroke="#16A34A" stroke-width="2"/>
</svg>`;

test("compileSvgToDeckIr compiles SVG gradients, groups, connectors, Bezier/arc paths, and textBoxes into valid Deck IR", () => {
  const ir = compileSvgToDeckIr(SAMPLE_ARCH_SVG, { title: "AI Agent SVG Architecture" });
  validateDeckIr(ir, __dirname);
  assert.equal(ir.pages.length, 1);
  const page = ir.pages[0];
  assert.equal(page.background.fill, "#FFFFFF");

  const gradientCard = page.shapes.find((shape) => shape.type === "roundRect" && shape.style.gradient);
  assert.ok(gradientCard, "expected roundRect with linearGradient fill");
  assert.equal(gradientCard.style.gradient.stops.length, 2);
  assert.equal(gradientCard.source?.nativeComponentGroupId !== undefined, true);

  const connector = page.shapes.find((shape) => shape.type === "line");
  assert.ok(connector, "expected line connector");
  assert.equal(connector.style.endArrow, "triangle");
  assert.equal(connector.style.dash, "dash");

  const circle = page.shapes.find((shape) => shape.type === "ellipse");
  assert.ok(circle, "expected ellipse shape from <circle>");

  const freeform = page.shapes.find((shape) => shape.type === "freeform");
  assert.ok(freeform, "expected freeform shape from <path>");
  assert.equal(freeform.style.closePath, true);
  assert.equal(freeform.style.freeformSegments.some((seg) => seg.type === "cubicBezTo"), true);

  assert.equal(page.textBoxes.length, 3);
  assert.equal(page.textBoxes[0].text, "业务入口层");
  assert.equal(page.textBoxes[0].font.weight, "bold");
  assert.equal(page.textBoxes[2].font.align, "center");
});

test("parseSvgPathToAbsoluteCommands converts relative and arc commands to absolute cubic/line segments", () => {
  const commands = parseSvgPathToAbsoluteCommands("M 10 20 l 30 40 h 20 v -10 q 10 -20 30 0 a 15 15 0 0 1 30 0 z");
  assert.equal(commands[0].type, "moveTo");
  assert.equal(commands.some((cmd) => cmd.type === "cubicBezTo"), true);
  assert.equal(commands[commands.length - 1].type, "close");
});

test("createEditableSourceArchive packages single and multi-page SVG files into a validated deck-ir archive", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-svg-archive-"));
  try {
    const svg1 = path.join(root, "slide-1.svg");
    const svg2 = path.join(root, "slide-2.svg");
    const outArchive = path.join(root, "editable-svg.tar.gz");
    fs.writeFileSync(svg1, SAMPLE_ARCH_SVG, "utf8");
    fs.writeFileSync(svg2, SAMPLE_ARCH_SVG.replace("业务入口层", "控制与治理层"), "utf8");

    const result = createEditableSourceArchive({
      inputFiles: [svg1, svg2],
      outputFile: outArchive
    });
    assert.equal(result.kind, "deck-ir");
    assert.equal(result.sourceKind, "svg");
    assert.equal(result.pages, 2);

    const extracted = path.join(root, "extracted");
    fs.mkdirSync(extracted, { recursive: true });
    extractProjectArchive(fs.readFileSync(outArchive), extracted, { label: "editable" });
    const admission = validatePackage(extracted);
    assert.equal(admission.kind, "deck-ir");
    assert.equal(admission.pages, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("ppt-create svg-deck embeds SVG diagrams into slide slots, creates multi-slide SVG decks, and builds native OpenXML PPTX", () => {
  const deck = createDeckIrFromSvgSlides({
    theme: "technical-blue-v1",
    slides: [
      { id: "slide-arch", svg: SAMPLE_ARCH_SVG },
      {
        id: "slide-hybrid",
        title: "混合版式：原生标题栏 + 内嵌 SVG 架构图",
        summary: "将行业 SVG 图形编译为原生 OpenXML 形状与文本框",
        svg: SAMPLE_ARCH_SVG
      }
    ]
  });

  validateDeckIr(deck, __dirname);
  assert.equal(deck.pages.length, 2);
  assert.equal(deck.pages[1].shapes[0].id, "slide-hybrid-header-rule");
  assert.equal(deck.pages[1].shapes.length > 4, true);

  const customPage = {
    pageIndex: 0,
    background: { fill: "#FFFFFF" },
    shapes: [],
    textBoxes: [],
    images: [],
    tables: [],
    charts: []
  };
  embedSvgIntoSlidePage(customPage, SAMPLE_ARCH_SVG, { x: 100, y: 80, w: 480, h: 270 }, { idPrefix: "slot1" });
  assert.equal(customPage.shapes.every((s) => s.id.startsWith("slot1-svg-")), true);
  assert.equal(customPage.textBoxes.every((t) => t.id.startsWith("slot1-svg-")), true);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-svg-pptx-"));
  try {
    const irPath = path.join(root, "deck.json");
    const pptxPath = path.join(root, "deck.pptx");
    const directPptxPath = path.join(root, "direct-buffer.pptx");
    fs.writeFileSync(irPath, JSON.stringify(deck, null, 2), "utf8");
    buildOpenXmlDecksSync([{ irFile: irPath, outFile: pptxPath, workDir: root }]);
    assert.equal(fs.existsSync(pptxPath), true);
    assert.equal(fs.statSync(pptxPath).size > 5000, true);

    const { buildPptxBufferFromDeckIr } = require("../packages/slideclone-core/svg/deck-ir-to-pptx-buffer");
    const { inspectPptx } = require("../packages/ooxml-core");
    const pptxBuf = buildPptxBufferFromDeckIr(deck);
    fs.writeFileSync(directPptxPath, pptxBuf);
    const inspected = inspectPptx(directPptxPath);
    assert.equal(inspected.slideCount, 2);
    assert.equal(inspected.unresolvedRelationshipCount, 0);
    assert.equal(inspected.invalidRelationshipCount, 0);
    assert.equal(inspected.emptySlideCount, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
