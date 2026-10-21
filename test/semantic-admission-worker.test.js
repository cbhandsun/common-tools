"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createRawImageNativeRebuilder, shouldOmitFullSlideResidual } = require("../packages/slideclone-core/team-native-rebuild");
const { writePng } = require("../packages/slideclone-core/png");
const { createNativeRebuilder } = require("../packages/remote-mcp-server/bin/common-tools-team-image-worker");
const {paintOcrFixtureInk}=require("./helpers/ocr-ink-fixture.cjs");

function request(root) {
  const inputFile = path.join(root, "source.png");
  const line = (text, x, y, w = 100, h = 24) => ({ text, confidence: 0.99, box: { x, y, w, h } });
  const value={ root, metadata: { inputFile, assetPath: "assets/source.png", dimensions: { widthPx: 960, heightPx: 720 } },
    ocr: { lines: [line("动态本体：知识图谱升级", 190, 20, 520, 42),
      line("传统知识图谱问题", 60, 105, 180, 28), line("动态本体思路", 385, 105, 160, 28), line("本体生长能力", 710, 105, 160, 28),
      line("系统A", 80, 260), line("系统B", 200, 290), line("系统C", 100, 380),
      line("翻译层", 430, 190), line("人员", 445, 285), line("高空事件", 700, 190),
      line("工单文本", 700, 285), line("视频数据", 700, 320), line("新型事件", 820, 285),
      line("数据接入层", 105, 560), line("本体生成层", 420, 560), line("应用服务层", 730, 560)] },
    isCancellationRequested: () => false };
  writePng(inputFile,paintOcrFixtureInk({width:960,height:720,rgba:Buffer.alloc(960*720*4,255)},value.ocr.lines));
  return value;
}
const rebuildDeckFromWorkDir = workDir => JSON.parse(fs.readFileSync(path.join(workDir, "ir", "deck.json"), "utf8"));

test("semantic admission transaction rejection discards the draft before residual erasure", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "semantic-admission-worker-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls = [];
  const rebuildDeckWithSentinel = workDir => {
    const deck = rebuildDeckFromWorkDir(workDir);
    deck.pages[0].shapes.push({ id: "transaction-sentinel", type: "rect", box: { x: 1, y: 1, w: 2, h: 2 }, source: { nested: { retained: true } } });
    deck.pages[0].source = { ...(deck.pages[0].source || {}), transactionSentinel: { nested: { retained: true } } };
    return deck;
  };
  const rebuild = createRawImageNativeRebuilder({ rebuildDeckFromWorkDir: rebuildDeckWithSentinel,
    admitSemanticShapes: ({ page, sourceFile }) => {
      calls.push("admission"); assert.ok(fs.existsSync(sourceFile));
      const rejected = page.shapes.filter(shape => shape.type === "arc").length;
      assert.equal(rejected, 2);
      page.shapes.push({ id: "rejected-draft-marker", type: "rect", box: { x: 5, y: 5, w: 5, h: 5 } });
      page.source.transactionSentinel.nested.retained = false;
      return { shapes: page.shapes.filter(shape => shape.type !== "arc"), evidence: { candidates: 2, accepted: 0, rejected } };
    },
    createFullSlideResidual: ({ objects }) => {
      calls.push("residual"); assert.equal(objects.some(shape => shape.type === "arc"), false);
      return { erasedObjects: objects.length };
    }
  });
  const result = await rebuild(request(root));
  assert.deepEqual(calls, ["admission", "residual"]);
  assert.deepEqual(result.deck.meta.semanticNative.shapeAdmission, { candidates: 2, accepted: 0, rejected: 2 });
  assert.deepEqual(result.deck.pages[0].source.transactionSentinel, { nested: { retained: true } });
  assert.ok(result.deck.pages[0].shapes.some(shape => shape.id === "transaction-sentinel" && shape.source.nested.retained === true));
  assert.equal(result.deck.pages[0].shapes.some(shape => shape.id === "rejected-draft-marker"), false);
  assert.equal(result.deck.pages[0].shapes.some(shape => String(shape.id || "").startsWith("team-knowledge-graph-")), false);
  assert.ok(result.deck.pages[0].images.some(image => image.id === "full-slide-residual"));
  assert.equal(result.deck.pages[0].shapes.some(shape => shape.type === "arc"), false);
});

test("rejected semantic shapes prevent omission even when icon refinement succeeded", () => {
  const complete = { matched: true, imageRefinement: { matched: true }, pictorialConnectors: { matched: true } };
  assert.equal(shouldOmitFullSlideResidual({ ...complete, shapeAdmission: { rejected: 2 } }), false);
  assert.equal(shouldOmitFullSlideResidual({ ...complete, shapeAdmission: { rejected: 0 } }), true);
});

test("production Worker checks actual source pixels before retaining semantic arcs", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "semantic-admission-production-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const rebuild = createNativeRebuilder({ rawImageOcrProfile: { kind: "umi" } }, { loadImplementation: () => ({ rebuildDeckFromWorkDir }) });
  const result = await rebuild(request(root));
  const { horizontalConnectorFit, relationFit, sourceCurveFit, ...arcAdmission } = result.deck.meta.semanticNative.shapeAdmission;
  assert.equal(sourceCurveFit.accepted, 0);
  assert.deepEqual(arcAdmission, { candidates: 2, accepted: 0, rejected: 2 });
  assert.equal(horizontalConnectorFit.candidates, 2);
  assert.equal(horizontalConnectorFit.accepted, 0);
  assert.equal(relationFit.upperAccepted, false);
  assert.equal(relationFit.lowerAccepted, false);
  assert.equal(horizontalConnectorFit.connectors.length, 2);
  assert.ok(horizontalConnectorFit.connectors.every(connector => connector.accepted === false && connector.reason === "insufficient-or-ambiguous-source-evidence"));
  assert.equal(result.deck.pages[0].shapes.some(shape => shape.type === "arc"), false);
  assert.ok(result.deck.pages[0].images.some(image => image.id === "full-slide-residual"));
  assert.equal(result.nativeComponentQuality.passed, true);
});

test("semantic admission failure propagates before raster erasure", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "semantic-admission-failure-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const failure = new Error("source evidence unavailable");
  const rebuild = createRawImageNativeRebuilder({ rebuildDeckFromWorkDir,
    admitSemanticShapes: () => { throw failure; },
    createFullSlideResidual: () => assert.fail("must not erase source content after admission failure") });
  await assert.rejects(() => rebuild(request(root)), error => error === failure);
  assert.throws(() => createRawImageNativeRebuilder({ rebuildDeckFromWorkDir, admitSemanticShapes: {} }), /admission is invalid/u);
});
