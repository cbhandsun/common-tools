"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { traceDiagonalConnectorFromRaster } = require("../packages/slideclone-core/diagonal-connector-contours");
const { fitDeckMissingNativeVisualAtomShapes, tryBuildFinalMissingNativeVisualAtomCandidate } = require("../packages/slideclone-worker-adapter/team-worker");
const { writePng } = require("../packages/slideclone-core/png");

function image(width = 120, height = 120) {
  return { width, height, rgba: Buffer.alloc(width * height * 4, 255) };
}
function paint(raster, predicate) {
  for (let y = 0; y < raster.height; y++) for (let x = 0; x < raster.width; x++) {
    if (predicate(x, y)) raster.rgba.set([20, 85, 230, 255], (y * raster.width + x) * 4);
  }
  return raster;
}
function arrow(upward = false, wideHead = false, doubleHead = false) {
  return paint(image(), (x, originalY) => {
    const y = upward ? 119 - originalY : originalY;
    const t = (x + y - 24) / Math.SQRT2, n = (y - x) / Math.SQRT2;
    return (t >= 0 && t <= 100 && Math.abs(n) <= 2)
      || (t >= 80 && t <= 110 && Math.abs(n) <= (110 - t) * (wideHead ? 0.7 : 0.5))
      || (doubleHead && t >= 0 && t <= 30 && Math.abs(n) <= t * 0.5);
  });
}
const box = { x: 0, y: 0, w: 120, h: 120 };
const slideSize = { widthPt: 120, heightPt: 120 };

test("diagonal stems and arrowheads retain source geometry in a single native contour", () => {
  for (const upward of [false, true]) {
    const raster = arrow(upward), before = Buffer.from(raster.rgba);
    const result = traceDiagonalConnectorFromRaster({ image: raster, box, slideSize });
    assert.ok(result); assert.equal(result.color, "#1455e6");
    assert.ok(result.segments.length <= 120); assert.ok(result.evidence.tolerancePx <= 1);
    assert.equal(result.segments.filter(segment => segment.type === "close").length, 1);
    assert.ok(result.evidence.thinBins >= 6); assert.ok(result.evidence.occupiedBins >= 14);
    assert.equal(Math.sign(result.evidence.axisY), upward ? -1 : 1);
    assert.deepEqual(raster.rgba, before);
  }
});

test("wide and bidirectional arrowheads do not disqualify a geometrically verified narrow stem", () => {
  for (const raster of [arrow(false, true), arrow(true, false, true)]) {
    const result = traceDiagonalConnectorFromRaster({ image: raster, box, slideSize });
    assert.ok(result); assert.equal(result.segments.filter(segment => segment.type === "close").length, 1);
  }
});

test("diagonal evidence rejects filled icons, axis lines, curved strokes and disconnected fragments", () => {
  const candidates = [image(),
    paint(image(), (x, y) => x >= 10 && x < 90 && y >= 10 && y < 90),
    paint(image(), (x, y) => x >= 10 && x < 100 && y >= 40 && y < 44),
    paint(image(), (x, y) => Math.abs(y - (15 + 0.01 * x * x)) < 2),
    paint(image(), (x, y) => Math.abs(y - x) < 3 && x >= 10 && x <= 100 && x % 16 < 4),
    paint(image(), (x, y) => Math.abs(Math.hypot(x - 60, y - 60) - 40) < 2)
  ];
  for (const raster of candidates) assert.equal(traceDiagonalConnectorFromRaster({ image: raster, box, slideSize }), null);
  const transparent = arrow();
  for (let i = 3; i < transparent.rgba.length; i += 4) transparent.rgba[i] = 0;
  assert.equal(traceDiagonalConnectorFromRaster({ image: transparent, box, slideSize }), null);
});

test("diagonal source admission rejects malformed, unsafe and excessive windows", () => {
  for (const value of [{}, { image: { ...arrow(), rgba: Buffer.alloc(1) }, box, slideSize },
    { image: arrow(), box: { ...box, x: -1 }, slideSize },
    { image: arrow(), box: { ...box, w: Infinity }, slideSize },
    { image: arrow(), box, slideSize: { widthPt: "private", heightPt: 120 } },
    { image: arrow(), box: { ...box, w: 121 }, slideSize }]) {
    assert.equal(traceDiagonalConnectorFromRaster(value), null);
  }
  const large = image(513, 512);
  assert.equal(traceDiagonalConnectorFromRaster({ image: large, box: { x: 0, y: 0, w: 513, h: 512 },
    slideSize: { widthPt: 513, heightPt: 512 } }), null);
});

test("missing native recovery emits focused diagonal candidates and protects text-adjacent regions", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "diagonal-connector-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceFile = path.join(root, "source.png"); writePng(sourceFile, arrow());
  const deck = { version: "1.0", slideSize, pages: [{ shapes: [], textBoxes: [], images: [] }] };
  const row = { kind: "missing", role: "missing-native-component", id: "missing-diagonal", pageIndex: 0, box,
    contributionScore: 1000, source: { dominantColor: "#1455E6", missingPixelDensity: 0.2 } };
  const options = { sourceImages: [sourceFile], visualQuality: { componentWorst: [row] }, repairMode: "diagonals-only" };
  const result = fitDeckMissingNativeVisualAtomShapes(deck, options);
  assert.equal(result.addedShapes, 1); assert.deepEqual(result.changedComponentKeys, ["0:missing-diagonal"]);
  assert.equal(result.deck.pages[0].images.length, 0);
  assert.equal(result.deck.pages[0].shapes[0].source.detector, "missing-native-diagonal-connector-contour");
  assert.equal(result.deck.pages[0].shapes[0].source.componentQualityRole, "connector-straight");
  assert.equal(deck.pages[0].shapes.length, 0);
  assert.equal(fitDeckMissingNativeVisualAtomShapes(deck, { ...options,
    visualQuality: { componentWorst: [{ ...row, textAdjacent: true }] } }).addedShapes, 0);
});

test("production search evaluates a focused diagonal candidate under unchanged global and local gates", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "diagonal-candidate-gate-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceFile = path.join(root, "source.png"); writePng(sourceFile, arrow());
  const row = { kind: "missing", role: "missing-native-component", id: "missing-diagonal", pageIndex: 0, box,
    severity: 4, pixelDiffRatio: 1, foregroundMissingRatio: 1 };
  const quality = { checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
    metrics: { "pixel-diff-ratio": 0.11, "foreground-missing-ratio": 0.08, "mean-absolute-delta": 14,
      "component-regions-attention": 1, "worst-component-normalized-severity": 4 }, componentWorst: [row] };
  let evaluated = 0;
  let focused = 0;
  const expected = traceDiagonalConnectorFromRaster({ image: arrow(), box, slideSize }).segments;
  const invoke = improveLocal => tryBuildFinalMissingNativeVisualAtomCandidate({ root,
    metadata: { generatedDeck: { version: "1.0", slideSize, pages: [{ pageIndex: 0, shapes: [], textBoxes: [], images: [] }] } },
    sourceImages: [sourceFile], visualQuality: quality, isCancellationRequested: async () => false,
    runBuild: async ({ pptxFile }) => fs.writeFileSync(pptxFile, "test-artifact"),
    rawImageQualityVerifier: async ({ deck }) => {
      evaluated++;
      assert.equal(deck.pages[0].shapes.length, 1);
      if (JSON.stringify(deck.pages[0].shapes[0].style.freeformSegments) !== JSON.stringify(expected)) return quality;
      focused++;
      const local = { ...row, severity: improveLocal ? 3 : 4, pixelDiffRatio: improveLocal ? 0.7 : 1,
        foregroundMissingRatio: improveLocal ? 0.7 : 1 };
      return { ...quality, metrics: { ...quality.metrics, "pixel-diff-ratio": 0.109,
        "foreground-missing-ratio": 0.078, "mean-absolute-delta": 13.9 },
        componentWorst: [local], componentLocalMetrics: [local] };
    }
  });
  assert.equal((await invoke(true)).accepted, true);
  assert.equal((await invoke(false)).accepted, false);
  assert.ok(evaluated >= 2);
  assert.ok(focused >= 2);
});
