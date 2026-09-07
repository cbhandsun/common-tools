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
