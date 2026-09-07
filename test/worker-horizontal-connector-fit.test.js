"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createNativeRebuilder } = require("../packages/remote-mcp-server/bin/common-tools-team-image-worker");
const { readPng, writePng } = require("../packages/slideclone-core/png");

test("production Worker fits footer arrows and gray nodes while preserving the original source", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "worker-arrow-fit-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "assets"));
  const inputFile = path.join(root, "assets/source.png");
  const width = 960, height = 720, rgba = Buffer.alloc(width * height * 4, 255);
  const pixel = (x, y) => rgba.set([0, 120, 255, 255], (y * width + x) * 4);
  for (let x = 250; x <= 380; x++) for (let y = 583; y <= 585; y++) pixel(x, y);
  for (let dx = 0; dx <= 6; dx++) for (let dy = -Math.floor(dx / 2); dy <= Math.floor(dx / 2); dy++) pixel(380 - dx, 584 + dy);
  const gray = (x, y) => rgba.set([167, 167, 167, 255], (y * width + x) * 4);
  for (let x = 414; x <= 546; x++) { gray(x, 181); gray(x, 224); }
  for (let y = 181; y <= 224; y++) { gray(414, y); gray(546, y); }
  writePng(inputFile, { width, height, rgba });
  const line = (text, x, y, w = 100, h = 24) => ({ text, confidence: 0.99, box: { x, y, w, h } });
  const ocr = { lines: [line("动态本体：知识图谱升级", 190, 20, 520, 42),
    line("传统知识图谱问题", 60, 105, 180, 28), line("动态本体思路", 385, 105, 160, 28), line("本体生长能力", 710, 105, 160, 28),
    line("系统A", 80, 260), line("系统B", 200, 290), line("系统C", 100, 380),
    line("翻译层", 430, 190), line("人员", 445, 285), line("高空事件", 700, 190),
    line("工单文本", 700, 285), line("视频数据", 700, 320), line("新型事件", 820, 285),
    line("数据接入层", 105, 560), line("本体生成层", 420, 560), line("应用服务层", 730, 560), line("升级终点：感知决策行动反馈", 300, 660, 350, 24)] };
  const rebuild = createNativeRebuilder({ rawImageOcrProfile: { kind: "umi" } }, { loadImplementation: () => ({
    rebuildDeckFromWorkDir(workDir) { return JSON.parse(fs.readFileSync(path.join(workDir, "ir/deck.json"), "utf8")); }
  }) });
  const result = await rebuild({ root, metadata: { inputFile, assetPath: "assets/source.png", dimensions: { widthPx: width, heightPx: height } }, ocr, isCancellationRequested: async () => false });
  const arrow = result.deck.pages[0].shapes.find(shape => shape.id === "team-knowledge-graph-layer-flow-1");
  assert.ok(Math.abs(arrow.box.y - 584) <= 1);
  assert.ok(Math.abs(arrow.box.x - 250) <= 1);
  assert.ok(Math.abs(arrow.box.x + arrow.box.w - 380) <= 1);
  const translator = result.deck.pages[0].shapes.find(shape => shape.id === "team-knowledge-graph-node-2");
  assert.deepEqual(translator.box, { x: 414, y: 181, w: 132, h: 43 });
  assert.equal(result.deck.meta.grayBorderRefinement.acceptedNodes, 1);
  const { validateDeckIr } = require("../packages/slideclone-core/team-worker");
  assert.doesNotThrow(() => validateDeckIr(result.deck, root), "in-memory semantic output must satisfy the same boundary as serialized IR");
  const feedback = result.deck.pages[0].shapes.filter(shape => /feedback-(left|right)-horizontal$/u.test(shape.id));
  assert.equal(feedback.length, 2);
  assert.ok(feedback.every(shape => !Object.hasOwn(shape.style, "endArrow")), "absent arrowheads must be omitted rather than undefined");
  const residual = readPng(path.join(root, "assets/deck-p01-full-residual.png"));
  const i = (584 * width + 300) * 4;
  assert.ok(residual.rgba[i + 2] - residual.rgba[i] < 40, "aligned source shaft is erased instead of remaining as a duplicate");
  assert.deepEqual(readPng(inputFile).rgba, rgba, "source is unchanged");
});
