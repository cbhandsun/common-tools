"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createRawImageNativeRebuilder } = require("../packages/slideclone-core/team-native-rebuild");
const { writePng } = require("../packages/slideclone-core/png");
const { createImageComponentResolver } = require("../packages/remote-mcp-server/image-component-analysis");

function createRequest(root) {
  const inputFile = path.join(root, "source.png");
  writePng(inputFile, { width: 2, height: 2, rgba: Buffer.alloc(16, 255) });
  return {
    root,
    metadata: { inputFile, assetPath: "assets/source.png", dimensions: { widthPx: 2, heightPx: 2 } },
    ocr: { lines: [{ text: "Title", confidence: 0.99, box: { x: 0, y: 0, w: 2, h: 1 } }] },
    isCancellationRequested: () => false
  };
}

function generatedDeck() {
  return {
    slideSize: { widthPt: 720, heightPt: 540 },
    pages: [{ source: {}, intent: {}, images: [], textBoxes: [], shapes: [] }]
  };
}

function knowledgeGraphOcrLines() {
  const box = (text, x, y, w = 100, h = 24) => ({ text, confidence: 0.99, box: { x, y, w, h } });
  return [
    box("动态本体：知识图谱升级", 190, 20, 520, 42),
    box("传统知识图谱问题", 60, 105, 180, 28), box("动态本体思路", 385, 105, 160, 28), box("本体生长能力", 710, 105, 160, 28),
    box("系统A", 80, 260), box("系统B", 200, 290), box("系统C", 100, 380),
    box("翻译层", 430, 190), box("人员", 445, 285), box("属性", 360, 355), box("事件", 540, 355),
    box("✓", 360, 205, 28, 28), box("✓", 570, 205, 28, 28), box("✓", 360, 390, 28, 28),
    box("高空事件", 700, 190), box("工单文本", 700, 285), box("视频数据", 700, 320), box("新型事件", 820, 285),
    box("数据接入层", 105, 560), box("本体生成层", 420, 560), box("应用服务层", 730, 560)
  ];
}

function paintBorder(rgba, width, { x, y, w, h }, color) {
  const paint = (px, py) => rgba.set(color, (py * width + px) * 4);
  for (let px = x; px <= x + w; px += 1) { paint(px, y); paint(px, y + h); }
  for (let py = y; py <= y + h; py += 1) { paint(x, py); paint(x + w, py); }
}

test("raw native rebuilder passes resolver Map identities to the generator and stores page evidence", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "team-component-wiring-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const strategy = new Map([["0:0", { mode: "native" }]]);
  const assets = new Map([["0:0", { id: "asset" }]]);
  let received;
  const rebuild = createRawImageNativeRebuilder({
    resolveComponentIndexes: async () => ({ componentStrategyIndex: strategy, componentAssetIndex: assets, evidence: { candidateCount: 1 } }),
    rebuildDeckFromWorkDir(_workDir, options) { received = options; return generatedDeck(); }
  });

  const result = await rebuild(createRequest(root));
  assert.equal(received.componentStrategyIndex, strategy);
  assert.equal(received.componentAssetIndex, assets);
  assert.deepEqual(result.deck.pages[0].source.componentAnalysis, { candidateCount: 1 });
});

test("raw native rebuilder runs once without an optional component resolver", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "team-component-wiring-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let calls = 0;
  const rebuild = createRawImageNativeRebuilder({ rebuildDeckFromWorkDir() { calls += 1; return generatedDeck(); } });
  await rebuild(createRequest(root));
  assert.equal(calls, 1);
});

test("raw native rebuilder applies a validated semantic fallback through the declarative pipeline", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "team-declarative-fallback-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const request = createRequest(root);
  request.metadata.semanticFallback = {
    archetype: "process_flow",
    items: [
      { title: "识别", body: "语义输入", badge: "01" },
      { title: "生成", body: "本地布局", badge: "02" }
    ]
  };
  const rebuild = createRawImageNativeRebuilder({ rebuildDeckFromWorkDir() { return generatedDeck(); } });

  const result = await rebuild(request);
  const page = result.deck.pages[0];

  assert.equal(page.source.declarativeRebuild.status, "matched");
  assert.equal(page.source.declarativeRebuild.matchedPlugin, "builtin-step-chain");
  assert.ok(page.shapes.some((shape) => shape.source?.declarativeRebuilder === true));
  assert.ok(page.textBoxes.some((textBox) => textBox.source?.declarativeRebuilder === true && textBox.text === "识别"));
});

test("raw native rebuilder applies default source-backed knowledge graph border refinement", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "team-default-gray-border-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const inputFile = path.join(root, "source.png");
  const rgba = Buffer.alloc(960 * 720 * 4, 255);
  paintBorder(rgba, 960, { x: 790, y: 250, w: 160, h: 96 }, [20, 115, 230, 255]);
  writePng(inputFile, { width: 960, height: 720, rgba });
  const rebuild = createRawImageNativeRebuilder({
    rebuildDeckFromWorkDir(workDir) {
      return JSON.parse(fs.readFileSync(path.join(workDir, "ir", "deck.json"), "utf8"));
    }
  });

  const result = await rebuild({
    root,
    metadata: { inputFile, assetPath: "assets/source.png", dimensions: { widthPx: 960, heightPx: 720 } },
    ocr: { lines: knowledgeGraphOcrLines() },
    isCancellationRequested: () => false
  });
  const fitted = result.deck.pages[0].shapes.find((shape) => shape.id === "team-knowledge-graph-node-5");

  assert.equal(result.deck.meta.grayBorderRefinement.acceptedNodes, 1);
  assert.deepEqual(fitted.box, { x: 790, y: 250, w: 160, h: 96 });
});

test("raw native rebuilder rejects unsafe semantic fallback geometry before final generation", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "team-declarative-fallback-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const request = createRequest(root);
  request.metadata.semanticFallback = { items: [{ title: "bad", x: 10 }] };
  let calls = 0;
  const rebuild = createRawImageNativeRebuilder({ rebuildDeckFromWorkDir() { calls += 1; return generatedDeck(); } });

  await assert.rejects(() => rebuild(request), /must not contain geometry key "x"/);
  assert.equal(calls, 0);
});

test("invalid component indexes and resolver failures stop before the final generator", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "team-component-wiring-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let calls = 0;
  const implementation = () => { calls += 1; return generatedDeck(); };
  const invalid = createRawImageNativeRebuilder({
    resolveComponentIndexes: () => ({ componentStrategyIndex: {} }),
    rebuildDeckFromWorkDir: implementation
  });
  await assert.rejects(() => invalid(createRequest(root)), /component index is invalid/);
  const failure = new Error("catalog unavailable");
  const rejected = createRawImageNativeRebuilder({
    resolveComponentIndexes: () => { throw failure; },
    rebuildDeckFromWorkDir: implementation
  });
  await assert.rejects(() => rejected(createRequest(root)), error => error === failure);
  assert.equal(calls, 0);
});

test("image component resolver does not load services when unconfigured and rejects an invalid root", () => {
  let loaded = 0;
  const implementation = { getComponentAnalysisServices() { loaded += 1; throw new Error("must not load"); } };
  assert.equal(createImageComponentResolver({ implementation }), undefined);
  assert.equal(loaded, 0);
  assert.throws(() => createImageComponentResolver({ root: "relative", implementation: {
    getComponentAnalysisServices() {
      return { readComponentAssetRegistry() {}, registryCandidates() {} };
    }
  } }), /absolute path/);
});
