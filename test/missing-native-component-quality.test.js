"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const fs = require("node:fs");
const { compareImages } = require("../packages/slideclone-core/diff-pixel-png");
const { detectMissingNativeComponentRegions } = require("../packages/slideclone-core/missing-native-component-quality");
const { writePng } = require("../packages/slideclone-core/png");
const { compactDeckFinalPrimitiveCandidate, fitDeckMissingNativeVisualAtomShapes, fitDeckWorstComponentFidelityPrimitives, tryBuildFinalMissingNativeVisualAtomCandidate } = require("../packages/slideclone-worker-adapter/team-worker");

function image(width, height, color = 255) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    rgba[offset] = color;
    rgba[offset + 1] = color;
    rgba[offset + 2] = color;
    rgba[offset + 3] = 255;
  }
  return { width, height, rgba };
}

function fillRect(target, left, top, width, height, rgba) {
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      const offset = (y * target.width + x) * 4;
      for (const [index, value] of rgba.entries()) target.rgba[offset + index] = value;
    }
  }
}
function fillTriangle(target, left, top, width, height, rgba) {
  for (let y = 0; y < height; y += 1) {
    const rowWidth = Math.max(1, Math.round(width * (y + 1) / height));
    for (let x = 0; x < rowWidth; x += 1) {
      const px = left + x;
      const py = top + y;
      if (px >= 0 && py >= 0 && px < target.width && py < target.height) {
        const offset = (py * target.width + px) * 4;
        for (const [index, value] of rgba.entries()) target.rgba[offset + index] = value;
      }
    }
  }
}

function fillQuadraticCurve(target, left, top, width, height, rgba, samples = 100) {
  for (let step = 0; step <= samples; step += 1) {
    const t = step / samples;
    const x = Math.round(left + width * t);
    const y = Math.round(top + height * (0.18 + 0.64 * (2 * t - 1) * (2 * t - 1)));
    fillRect(target, x, y, 3, 3, rgba);
  }
}

function fillLine(target, x1, y1, x2, y2, thickness, rgba) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let step = 0; step <= steps; step += 1) {
    const t = steps === 0 ? 0 : step / steps;
    const x = Math.round(x1 + (x2 - x1) * t);
    const y = Math.round(y1 + (y2 - y1) * t);
    fillRect(target, x - Math.floor(thickness / 2), y - Math.floor(thickness / 2), thickness, thickness, rgba);
  }
}

test("missing native component detector reports uncovered foreground loss", () => {
  const source = image(40, 20);
  const generated = image(40, 20);
  fillRect(source, 6, 5, 6, 5, [24, 72, 168, 255]);

  const regions = detectMissingNativeComponentRegions(source, generated, [], { widthPt: 40, heightPt: 20 }, {
    threshold: 24,
    foregroundTolerancePx: 0,
    foregroundToleranceDelta: 0,
  });

  assert.equal(regions.length, 1);
  assert.equal(regions[0].id, "missing-native-component-001");
  assert.equal(regions[0].role, "missing-native-component");
  assert.deepEqual(regions[0].box, { x: 6, y: 5, w: 6, h: 5 });
  assert.equal(regions[0].source.missingForegroundPixels, 30);
  assert.equal(regions[0].source.missingPixelDensity, 1);
  assert.match(regions[0].source.missingComponentFingerprint, /^6:5:6:5:32:#1848A8$/u);
});

test("missing native component detector suppresses existing object coverage", () => {
  const source = image(40, 20);
  const generated = image(40, 20);
  fillRect(source, 6, 5, 6, 5, [0, 0, 0, 255]);

  const regions = detectMissingNativeComponentRegions(source, generated, [
    { id: "existing-icon", kind: "shape", role: "shape", box: { x: 5, y: 4, w: 8, h: 7 } },
  ], { widthPt: 40, heightPt: 20 }, {
    threshold: 24,
    foregroundTolerancePx: 0,
    foregroundToleranceDelta: 0,
  });

  assert.deepEqual(regions, []);
});

test("missing native component detector marks text-adjacent fragments for text repair", () => {
  const source = image(120, 50);
  const generated = image(120, 50);
  fillRect(source, 82, 14, 4, 10, [0, 0, 0, 255]);

  const regions = detectMissingNativeComponentRegions(source, generated, [
    { id: "title-text", kind: "text", role: "text", box: { x: 10, y: 10, w: 70, h: 18 } },
  ], { widthPt: 120, heightPt: 50 }, {
    threshold: 24,
    foregroundTolerancePx: 0,
    foregroundToleranceDelta: 0,
  });

  assert.equal(regions.length, 1);
  assert.equal(regions[0].textAdjacent, true);
  assert.equal(regions[0].repairHint, "text");
  assert.equal(regions[0].nearestTextId, "title-text");
  assert.equal(regions[0].source.repairHint, "text");
});

test("missing native component detector marks text edge fragments for text repair", () => {
  const source = image(120, 50);
  const generated = image(120, 50);
  fillRect(source, 42, 7, 8, 3, [0, 0, 0, 255]);

  const regions = detectMissingNativeComponentRegions(source, generated, [
    { id: "title-text", kind: "text", role: "text", box: { x: 10, y: 10, w: 70, h: 18 } },
  ], { widthPt: 120, heightPt: 50 }, {
    threshold: 24,
    foregroundTolerancePx: 0,
    foregroundToleranceDelta: 0,
  });

  assert.equal(regions.length, 1);
  assert.equal(regions[0].textAdjacent, true);
  assert.equal(regions[0].repairHint, "text");
  assert.equal(regions[0].nearestTextId, "title-text");
});

test("missing native component detector joins diagonal foreground into one stable target", () => {
  const source = image(48, 40);
  const generated = image(48, 40);
  fillRect(source, 6, 5, 4, 6, [0, 0, 0, 255]);
  fillRect(source, 10, 11, 4, 6, [0, 0, 0, 255]);

  const regions = detectMissingNativeComponentRegions(source, generated, [], { widthPt: 48, heightPt: 40 }, {
    threshold: 24,
    foregroundTolerancePx: 0,
    foregroundToleranceDelta: 0,
  });

  assert.equal(regions.length, 1);
  assert.deepEqual(regions[0].box, { x: 6, y: 5, w: 8, h: 12 });
  assert.equal(regions[0].source.missingForegroundPixels, 48);
  assert.ok(regions[0].source.missingPixelDensity < 0.6);
});

test("missing native detector masks connector corridors instead of broad connector boxes", () => {
  const source = image(500, 300);
  const generated = image(500, 300);
  fillLine(source, 40, 60, 220, 60, 3, [20, 100, 230, 255]);
  fillLine(generated, 40, 60, 220, 60, 3, [20, 100, 230, 255]);
  fillQuadraticCurve(source, 40, 78, 180, 72, [20, 100, 230, 255]);

  const regions = detectMissingNativeComponentRegions(source, generated, [{
    id: "wide-bbox-straight-connector",
    kind: "shape",
    role: "connector-straight",
    box: { x: 36, y: 40, w: 188, h: 124 },
    geometry: {
      type: "segment",
      startX: 40,
      startY: 60,
      endX: 220,
      endY: 60,
      corridorPt: 2
    }
  }], { widthPt: 500, heightPt: 300 }, {
    threshold: 24,
    foregroundTolerancePx: 0,
    foregroundToleranceDelta: 0,
  });

  assert.ok(regions.some((region) => region.box.y > 78 && region.box.h > 20));
});

test("pixel diff surfaces missing native components in component worst rows", () => {
  const source = image(40, 20);
  const generated = image(40, 20);
  fillRect(source, 6, 5, 6, 5, [0, 0, 0, 255]);

  const metric = compareImages(0, source, generated, {
    threshold: 24,
    foregroundTolerancePx: 0,
    foregroundToleranceDelta: 0,
    componentRegions: [],
    slideSize: { widthPt: 40, heightPt: 20 },
  }, "render.png", path.join(os.tmpdir(), `slideclone-missing-component-${process.pid}.png`));

  assert.equal(metric.componentQuality.attentionCount, 1);
  assert.equal(metric.componentQuality.worst[0].id, "missing-native-component-001");
  assert.equal(metric.componentQuality.worst[0].role, "missing-native-component");
  assert.deepEqual(metric.componentQuality.worst[0].box, { x: 6, y: 5, w: 6, h: 5 });
  assert.equal(metric.componentQuality.worst[0].foregroundMissingRatio, 1);
});

test("worst component primitive repair can target missing native component rows", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-missing-component-repair-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = image(40, 20);
  const rendered = image(40, 20);
  fillRect(source, 6, 5, 6, 5, [0, 0, 0, 255]);
  const sourceFile = path.join(root, "source.png");
  const renderedFile = path.join(root, "rendered.png");
  writePng(sourceFile, source);
  writePng(renderedFile, rendered);

  const deck = { slideSize: { widthPt: 40, heightPt: 20 }, pages: [{ shapes: [], textBoxes: [], images: [] }] };
  const result = fitDeckWorstComponentFidelityPrimitives(deck, {
    sourceImages: [sourceFile],
    renderedImages: [renderedFile],
    visualQuality: {
      componentWorst: [{
        pageIndex: 0,
        id: "missing-native-component-001",
        kind: "missing",
        role: "missing-native-component",
        attention: true,
        box: { x: 6, y: 5, w: 6, h: 5 }
      }]
    },
    maximumRuns: 50,
    targetKinds: ["missing"]
  });

  assert.equal(result.candidateComponents, 1);
  assert.ok(result.addedShapes > 0);
  assert.equal(result.deck.pages[0].shapes.every((shape) => shape.type === "rect"), true);
  assert.equal(result.deck.pages[0].shapes.every((shape) => shape.source.sourceComponentKind === "missing"), true);
});

test("final primitive candidates drop oversized diagnostic meta before admission", () => {
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 160, heightPt: 90 },
    meta: {
      semanticNative: { shapeAdmission: { samples: 2549608, accepted: 12 } },
      grayBorderRefinement: { samples: 591350 }
    },
    pages: [{ shapes: [], textBoxes: [], images: [] }]
  };

  const compacted = compactDeckFinalPrimitiveCandidate(deck);

  assert.equal(compacted.meta.semanticNative.shapeAdmission.samples, undefined);
  assert.equal(compacted.meta.semanticNative.shapeAdmission.accepted, 12);
  assert.equal(compacted.meta.grayBorderRefinement.samples, undefined);
});

test("missing native component rows can seed visual atom native shapes", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-missing-atom-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = image(80, 40);
  fillRect(source, 20, 18, 34, 3, [20, 90, 180, 255]);
  const sourceFile = path.join(root, "source.png");
  writePng(sourceFile, source);
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 80, heightPt: 40 },
    pages: [{ shapes: [], textBoxes: [], images: [] }]
  };

  const result = fitDeckMissingNativeVisualAtomShapes(deck, {
    sourceImages: [sourceFile],
    visualQuality: {
      componentWorst: [{
        pageIndex: 0,
        id: "missing-native-component-001",
        kind: "missing",
        role: "missing-native-component",
        box: { x: 20, y: 18, w: 34, h: 3 }
      }]
    },
    paddingPt: 8,
    maximumAtoms: 4
  });

  assert.ok(result.addedShapes >= 1);
  assert.equal(result.deck.pages[0].images.length, 0);
  assert.equal(result.deck.pages[0].shapes.some((shape) => shape.type === "line" || shape.source.atomKind === "grid-line-candidate"), true);
  assert.equal(result.deck.pages[0].shapes.every((shape) => shape.source.missingNativeComponentId === "missing-native-component-001"), true);
});

test("missing native visual atom targets cluster adjacent fragments into one recognition window", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-missing-atom-cluster-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = image(160, 100);
  fillRect(source, 20, 26, 64, 3, [20, 90, 180, 255]);
  fillRect(source, 96, 8, 8, 8, [20, 90, 180, 255]);
  const sourceFile = path.join(root, "source.png");
  writePng(sourceFile, source);
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 160, heightPt: 100 },
    pages: [{ shapes: [], textBoxes: [], images: [] }]
  };

  const result = fitDeckMissingNativeVisualAtomShapes(deck, {
    sourceImages: [sourceFile],
    visualQuality: {
      componentWorst: [
        { pageIndex: 0, id: "missing-native-component-001", kind: "missing", role: "missing-native-component", box: { x: 20, y: 26, w: 18, h: 3 } },
        { pageIndex: 0, id: "missing-native-component-002", kind: "missing", role: "missing-native-component", box: { x: 42, y: 26, w: 18, h: 3 } },
        { pageIndex: 0, id: "missing-native-component-003", kind: "missing", role: "missing-native-component", box: { x: 96, y: 8, w: 8, h: 8 } }
      ]
    },
    paddingPt: 2,
    maximumTargets: 8,
    maximumAtoms: 8
  });

  assert.ok(result.addedShapes >= 1);
  assert.ok(result.candidateTargets <= 2);
  assert.ok(result.candidateTargets < 3);
  for (const shape of result.deck.pages[0].shapes) {
    assert.ok(shape.source.sourceMissingNativeComponentIds.length > 0);
    assert.equal(shape.source.sourceMissingNativeComponentIds.every(id => ["missing-native-component-001", "missing-native-component-002", "missing-native-component-003"].includes(id)), true);
  }
});

test("missing native visual atom fit bundles adjacent line fragments as one dashed connector", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-missing-atom-line-bundle-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = image(120, 60);
  fillRect(source, 20, 26, 12, 3, [20, 90, 180, 255]);
  fillRect(source, 38, 26, 12, 3, [20, 90, 180, 255]);
  fillRect(source, 56, 26, 12, 3, [20, 90, 180, 255]);
  const sourceFile = path.join(root, "source.png");
  writePng(sourceFile, source);

  const result = fitDeckMissingNativeVisualAtomShapes({
    version: "1.0",
    slideSize: { widthPt: 120, heightPt: 60 },
    pages: [{ shapes: [], textBoxes: [], images: [] }]
  }, {
    sourceImages: [sourceFile],
    visualQuality: {
      componentWorst: [
        { pageIndex: 0, id: "missing-native-component-001", kind: "missing", role: "missing-native-component", box: { x: 20, y: 26, w: 12, h: 3 } },
        { pageIndex: 0, id: "missing-native-component-002", kind: "missing", role: "missing-native-component", box: { x: 38, y: 26, w: 12, h: 3 } },
        { pageIndex: 0, id: "missing-native-component-003", kind: "missing", role: "missing-native-component", box: { x: 56, y: 26, w: 12, h: 3 } }
      ]
    },
    paddingPt: 2,
    maximumTargets: 6,
    maximumAtoms: 8
  });

  const bundle = result.deck.pages[0].shapes.find((shape) => shape.source?.detector === "missing-native-line-bundle");
  assert.ok(bundle);
  assert.equal(bundle.type, "line");
  assert.equal(bundle.style.dash, "dash");
  assert.ok(Number(bundle.box?.w || 0) >= 40);
  assert.ok(Number(bundle.source?.bundledVisualAtomCount || 0) >= 2);
  assert.deepEqual(new Set(bundle.source.sourceMissingNativeComponentIds), new Set(["missing-native-component-001", "missing-native-component-002", "missing-native-component-003"]));
});

test("missing native visual atom fit ignores neighboring atoms that do not overlap the missing target", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-missing-atom-overlap-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = image(120, 80);
  fillRect(source, 20, 30, 42, 3, [20, 90, 180, 255]);
  fillRect(source, 78, 14, 3, 42, [20, 90, 180, 255]);
  const sourceFile = path.join(root, "source.png");
  writePng(sourceFile, source);
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 120, heightPt: 80 },
    pages: [{ shapes: [], textBoxes: [], images: [] }]
  };

  const result = fitDeckMissingNativeVisualAtomShapes(deck, {
    sourceImages: [sourceFile],
    visualQuality: {
      componentWorst: [{
        pageIndex: 0,
        id: "missing-native-component-001",
        kind: "missing",
        role: "missing-native-component",
        box: { x: 20, y: 30, w: 42, h: 3 }
      }]
    },
    paddingPt: 24,
    maximumAtoms: 8
  });

  assert.ok(result.addedShapes >= 1);
  assert.equal(result.deck.pages[0].shapes.some((shape) => shape.type === "line" && Math.abs(Number(shape.box?.w || 0)) < 0.01 && Number(shape.box?.h || 0) > 20), false);
  assert.equal(result.deck.pages[0].shapes.some((shape) => Number(shape.box?.w || 0) <= 4 && Number(shape.box?.h || 0) > 20), false);
});

test("missing native visual atom fit ignores text-adjacent missing fragments", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-missing-atom-text-adjacent-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = image(120, 80);
  fillRect(source, 20, 30, 42, 3, [20, 90, 180, 255]);
  fillRect(source, 72, 30, 18, 3, [20, 90, 180, 255]);
  const sourceFile = path.join(root, "source.png");
  writePng(sourceFile, source);

  const result = fitDeckMissingNativeVisualAtomShapes({
    version: "1.0",
    slideSize: { widthPt: 120, heightPt: 80 },
    pages: [{ shapes: [], textBoxes: [], images: [] }]
  }, {
    sourceImages: [sourceFile],
    visualQuality: {
      componentWorst: [
        { pageIndex: 0, id: "missing-native-component-001", kind: "missing", role: "missing-native-component", box: { x: 20, y: 30, w: 42, h: 3 } },
        { pageIndex: 0, id: "missing-native-component-002", kind: "missing", role: "missing-native-component", textAdjacent: true, repairHint: "text", box: { x: 72, y: 30, w: 18, h: 3 } }
      ]
    },
    paddingPt: 2,
    maximumTargets: 4,
    maximumAtoms: 8
  });

  assert.ok(result.addedShapes >= 1);
  assert.ok(result.changedComponentKeys.includes("0:missing-native-component-001"));
  assert.equal(result.changedComponentKeys.includes("0:missing-native-component-002"), false);
  assert.equal(result.deck.pages[0].shapes.some((shape) => shape.source?.missingNativeComponentId === "missing-native-component-002"), false);
});

test("missing native visual atom fit promotes block-like foreground blobs to native freeforms", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-missing-atom-freeform-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = image(120, 80);
  fillTriangle(source, 30, 20, 28, 22, [20, 90, 180, 255]);
  const sourceFile = path.join(root, "source.png");
  writePng(sourceFile, source);

  const result = fitDeckMissingNativeVisualAtomShapes({
    version: "1.0",
    slideSize: { widthPt: 120, heightPt: 80 },
    pages: [{ shapes: [], textBoxes: [], images: [] }]
  }, {
    sourceImages: [sourceFile],
    visualQuality: {
      componentWorst: [
        { pageIndex: 0, id: "missing-native-component-001", kind: "missing", role: "missing-native-component", box: { x: 30, y: 20, w: 28, h: 22 } }
      ]
    },
    paddingPt: 2,
    maximumTargets: 4,
    maximumAtoms: 8
  });

  const nativeShape = result.deck.pages[0].shapes.find((shape) =>
    shape.source?.detector === "missing-native-blob-freeform-component"
    || shape.source?.detector === "visual-atom-native-triangle");
  assert.ok(nativeShape);
  assert.equal(nativeShape.source.missingNativeComponentId, "missing-native-component-001");
  assert.ok(result.changedComponentKeys.includes("0:missing-native-component-001"));
});

test("missing native freeform repair splits saturated blobs without filling pale card backgrounds", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-missing-atom-contours-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = image(140, 100);
  fillRect(source, 25, 18, 84, 64, [238, 242, 247, 255]);
  fillRect(source, 34, 28, 18, 22, [27, 115, 234, 255]);
  fillRect(source, 82, 54, 16, 18, [41, 109, 229, 255]);
  const sourceFile = path.join(root, "source.png");
  writePng(sourceFile, source);

  const result = fitDeckMissingNativeVisualAtomShapes({
    version: "1.0",
    slideSize: { widthPt: 140, heightPt: 100 },
    pages: [{ shapes: [], textBoxes: [], images: [] }]
  }, {
    sourceImages: [sourceFile],
    visualQuality: {
      componentWorst: [
        { pageIndex: 0, id: "missing-native-component-001", kind: "missing", role: "missing-native-component", box: { x: 25, y: 18, w: 84, h: 64 } }
      ]
    },
    paddingPt: 2,
    maximumTargets: 4,
    maximumAtoms: 8
  });

  const nativeShapes = result.deck.pages[0].shapes.filter((shape) =>
    shape.source?.detector === "missing-native-blob-freeform-component"
    || shape.source?.detector === "visual-atom-native-rect");
  assert.equal(nativeShapes.length, 2);
  assert.equal(nativeShapes.every((shape) => Number(shape.box?.w || 0) < 30 && Number(shape.box?.h || 0) < 30), true);
  assert.equal(nativeShapes.some((shape) => Number(shape.box?.w || 0) >= 80 || Number(shape.box?.h || 0) >= 60), false);
  assert.equal(nativeShapes.every((shape) => /^#(?:1B73EA|296DE5)$/iu.test(shape.style.fill)), true);
});

test("missing native freeform repair uses rendered residual mask when available", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-missing-atom-render-mask-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = image(140, 100);
  const rendered = image(140, 100);
  fillRect(source, 25, 18, 84, 64, [238, 242, 247, 255]);
  fillRect(rendered, 25, 18, 84, 64, [238, 242, 247, 255]);
  fillRect(source, 34, 28, 18, 22, [27, 115, 234, 255]);
  fillRect(rendered, 34, 28, 18, 22, [27, 115, 234, 255]);
  fillRect(source, 82, 54, 16, 18, [41, 109, 229, 255]);
  const sourceFile = path.join(root, "source.png");
  const renderedFile = path.join(root, "rendered.png");
  writePng(sourceFile, source);
  writePng(renderedFile, rendered);

  const result = fitDeckMissingNativeVisualAtomShapes({
    version: "1.0",
    slideSize: { widthPt: 140, heightPt: 100 },
    pages: [{ shapes: [], textBoxes: [], images: [] }]
  }, {
    sourceImages: [sourceFile],
    renderedImages: [renderedFile],
    visualQuality: {
      componentWorst: [
        { pageIndex: 0, id: "missing-native-component-001", kind: "missing", role: "missing-native-component", box: { x: 25, y: 18, w: 84, h: 64 } }
      ]
    },
    paddingPt: 2,
    maximumTargets: 4,
    maximumAtoms: 8
  });

  const nativeShapes = result.deck.pages[0].shapes.filter((shape) =>
    shape.source?.detector === "missing-native-blob-freeform-component"
    || shape.source?.detector === "visual-atom-native-rect");
  assert.equal(nativeShapes.length, 1);
  assert.deepEqual(nativeShapes[0].box, { x: 82, y: 54, w: 16, h: 18 });
  assert.equal(nativeShapes[0].style.fill.toUpperCase(), "#296DE5");
});

test("missing native sparse curve repair preserves the ink contour instead of a guessed bezier or convex blob", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-missing-atom-curve-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = image(160, 110);
  fillQuadraticCurve(source, 46, 22, 66, 54, [41, 109, 229, 255]);
  const sourceFile = path.join(root, "source.png");
  writePng(sourceFile, source);

  const result = fitDeckMissingNativeVisualAtomShapes({
    version: "1.0",
    slideSize: { widthPt: 160, heightPt: 110 },
    pages: [{ shapes: [], textBoxes: [], images: [] }]
  }, {
    sourceImages: [sourceFile],
    visualQuality: {
      componentWorst: [
        { pageIndex: 0, id: "missing-native-component-speck", kind: "missing", role: "missing-native-component", severity: 10, contributionScore: 8, box: { x: 5, y: 5, w: 3, h: 3 } },
        { pageIndex: 0, id: "missing-native-component-curve", kind: "missing", role: "missing-native-component", severity: 0.5, contributionScore: 1800, box: { x: 44, y: 20, w: 74, h: 62 } }
      ]
    },
    paddingPt: 2,
    repairMode: "curves-only",
    maximumTargets: 1,
    maximumAtoms: 8
  });

  const curve = result.deck.pages[0].shapes.find((shape) =>
    shape.source?.detector === "missing-native-curve-freeform-component"
    || shape.source?.detector === "missing-native-open-curve-component");
  assert.ok(curve);
  assert.equal(curve.type, "freeform");
  assert.equal(curve.style.stroke, "none");
  assert.equal(curve.style.closePath, true);
  assert.ok(curve.style.freeformSegments.length <= 120);
  assert.equal(curve.style.freeformSegments.some((segment) => segment.type === "cubicBezTo"), false);
  assert.equal(curve.style.freeformSegments.at(-1).type, "close");
  assert.ok(curve.source.sourceContourTolerancePx <= 1);
  const vertices = curve.style.freeformSegments.flatMap((segment) => segment.points);
  const area = Math.abs(vertices.reduce((sum, point, index) => {
    const next = vertices[(index + 1) % vertices.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
  assert.ok(area < 0.18, "a sparse stroke must not fill the empty interior of its bounding box");
  assert.equal(result.deck.pages[0].shapes.some((shape) => shape.source?.detector === "missing-native-blob-freeform-component"), false);
  assert.ok(result.deck.pages[0].shapes.every((shape) => shape.source?.detector === "missing-native-curve-freeform-component"));
  assert.ok(result.changedComponentKeys.includes("0:missing-native-component-curve"));
  assert.equal(result.changedComponentKeys.includes("0:missing-native-component-speck"), false);
});

test("missing native curve repair joins clustered windows across a matching middle without inventing a bridge", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-curve-joined-window-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = image(400, 250);
  fillQuadraticCurve(source, 50, 30, 200, 160, [41, 109, 229, 255], 500);
  const generated = image(400, 250);
  // The center already matches. It must stay in the recovered source path.
  for (let y = 0; y < source.height; y++) for (let x = 125; x < 175; x++) {
    const offset = (y * source.width + x) * 4;
    source.rgba.copy(generated.rgba, offset, offset, offset + 4);
  }
  const sourceFile = path.join(root, "source.png"), generatedFile = path.join(root, "generated.png");
  writePng(sourceFile, source);
  writePng(generatedFile, generated);
  const result = fitDeckMissingNativeVisualAtomShapes({ version: "1.0",
    slideSize: { widthPt: 400, heightPt: 250 }, pages: [{ shapes: [], textBoxes: [], images: [] }] }, {
    sourceImages: [sourceFile], renderedImages: [generatedFile], repairMode: "curves-only", maximumTargets: 4,
    visualQuality: { componentWorst: [
      { pageIndex: 0, id: "missing-curve-left", kind: "missing", role: "missing-native-component", box: { x: 48, y: 55, w: 85, h: 111 }, source: { dominantColor: "#296DE5", missingPixelDensity: 0.08 } },
      { pageIndex: 0, id: "missing-curve-right", kind: "missing", role: "missing-native-component", box: { x: 169, y: 55, w: 85, h: 111 }, source: { dominantColor: "#296DE5", missingPixelDensity: 0.08 } }
    ] }
  });
  assert.equal(result.deck.pages[0].shapes.length, 1);
  const curve = result.deck.pages[0].shapes[0];
  assert.ok(curve.box.w >= 200);
  assert.ok(curve.style.freeformSegments.length <= 120);
  assert.equal(curve.style.freeformSegments.filter(segment => segment.type === "moveTo").length, 1);
  assert.deepEqual(new Set(curve.source.sourceMissingNativeComponentIds), new Set(["missing-curve-left", "missing-curve-right"]));
  assert.equal(result.deck.pages[0].images.length, 0);
  const rows = [
    { pageIndex: 0, id: "missing-curve-left", kind: "missing", role: "missing-native-component", severity: 4, pixelDiffRatio: 1, foregroundMissingRatio: 1,
      box: { x: 48, y: 55, w: 85, h: 111 }, source: { dominantColor: "#296DE5", missingPixelDensity: 0.08 } },
    { pageIndex: 0, id: "missing-curve-right", kind: "missing", role: "missing-native-component", severity: 4, pixelDiffRatio: 1, foregroundMissingRatio: 1,
      box: { x: 169, y: 55, w: 85, h: 111 }, source: { dominantColor: "#296DE5", missingPixelDensity: 0.08 } }
  ];
  const checks = [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }];
  let firstCandidate = null;
  const candidate = await tryBuildFinalMissingNativeVisualAtomCandidate({ root,
    metadata: { generatedDeck: { version: "1.0", slideSize: { widthPt: 400, heightPt: 250 },
      pages: [{ pageIndex: 0, shapes: [], textBoxes: [], images: [] }] } }, sourceImages: [sourceFile],
    visualQuality: { checks, componentWorst: rows, metrics: { "pixel-diff-ratio": 0.11, "foreground-missing-ratio": 0.08,
      "mean-absolute-delta": 14, "component-regions-attention": 2, "worst-component-normalized-severity": 4 } },
    isCancellationRequested: async () => false,
    runBuild: async ({ deckFile, pptxFile }) => {
      if (!firstCandidate) firstCandidate = JSON.parse(fs.readFileSync(deckFile, "utf8"));
      fs.writeFileSync(pptxFile, "test-pptx");
    },
    rawImageQualityVerifier: async () => ({ checks, metrics: { "pixel-diff-ratio": 0.10, "foreground-missing-ratio": 0.07,
      "mean-absolute-delta": 13, "component-regions-attention": 1, "worst-component-normalized-severity": 3 },
      componentLocalMetrics: rows.map(row => ({ ...row, severity: 3, pixelDiffRatio: 0.75, foregroundMissingRatio: 0.7 })) })
  });
  assert.equal(candidate.accepted, true);
  assert.equal(firstCandidate.pages[0].shapes.length, 1);
  assert.equal(firstCandidate.pages[0].shapes[0].type, "freeform");
  assert.deepEqual(firstCandidate.pages[0].shapes[0].box, curve.box);
  assert.deepEqual(firstCandidate.pages[0].shapes[0].style.freeformSegments, curve.style.freeformSegments);
});

test("missing native curve repair rejects a source window beyond its pixel budget before tracing", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-curve-pixel-boundary-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceFile = path.join(root, "source.png");
  const source = { width: 2000, height: 2000, rgba: Buffer.alloc(2000 * 2000 * 4, 255) };
  fillQuadraticCurve(source, 100, 100, 1400, 650, [41, 109, 229, 255], 1000);
  writePng(sourceFile, source);
  const result = fitDeckMissingNativeVisualAtomShapes({ version: "1.0", slideSize: { widthPt: 200, heightPt: 200 },
    pages: [{ shapes: [], textBoxes: [], images: [] }] }, { sourceImages: [sourceFile], repairMode: "curves-only",
    visualQuality: { componentWorst: [{ pageIndex: 0, id: "missing-large-curve", kind: "missing", role: "missing-native-component",
      box: { x: 5, y: 5, w: 150, h: 70 } }] } });
  assert.equal(result.addedShapes, 0);
  assert.equal(result.deck.pages[0].images.length, 0);
});

test("missing native repair rejects unknown modes without echoing their value", () => {
  assert.throws(() => fitDeckMissingNativeVisualAtomShapes({}, { repairMode: "private-value" }),
    error => /mode/.test(error.message) && !error.message.includes("private-value"));
});

test("missing native separated line fragments emit an editable curve bundle", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-missing-atom-curve-bundle-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = image(180, 120);
  fillRect(source, 48, 28, 88, 3, [41, 109, 229, 255]);
  fillRect(source, 50, 78, 84, 3, [54, 124, 237, 255]);
  const sourceFile = path.join(root, "source.png");
  writePng(sourceFile, source);

  const result = fitDeckMissingNativeVisualAtomShapes({
    version: "1.0",
    slideSize: { widthPt: 180, heightPt: 120 },
    pages: [{ shapes: [], textBoxes: [], images: [] }]
  }, {
    sourceImages: [sourceFile],
    visualQuality: {
      componentWorst: [
        { pageIndex: 0, id: "missing-native-component-curve-bundle", kind: "missing", role: "missing-native-component", box: { x: 42, y: 24, w: 102, h: 62 } }
      ]
    },
    paddingPt: 4,
    maximumTargets: 4,
    maximumAtoms: 8
  });

  const curve = result.deck.pages[0].shapes.find((shape) => shape.source?.detector === "missing-native-curve-bundle");
  assert.ok(curve);
  assert.deepEqual(curve.source.sourceMissingNativeComponentIds, ["missing-native-component-curve-bundle"]);
  assert.equal(curve.type, "freeform");
  assert.equal(curve.style.fill, "none");
  assert.equal(curve.style.closePath, false);
  assert.equal(curve.style.freeformSegments.filter((segment) => segment.type === "cubicBezTo").length, 2);
  assert.ok(result.changedComponentKeys.includes("0:missing-native-component-curve-bundle"));
});

test("missing native visual atom clustering keeps perpendicular fragments as separate targets", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-missing-atom-orientation-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = image(120, 80);
  fillRect(source, 20, 30, 42, 3, [20, 90, 180, 255]);
  fillRect(source, 64, 18, 3, 38, [20, 90, 180, 255]);
  const sourceFile = path.join(root, "source.png");
  writePng(sourceFile, source);
  const result = fitDeckMissingNativeVisualAtomShapes({
    version: "1.0",
    slideSize: { widthPt: 120, heightPt: 80 },
    pages: [{ shapes: [], textBoxes: [], images: [] }]
  }, {
    sourceImages: [sourceFile],
    visualQuality: {
      componentWorst: [
        { pageIndex: 0, id: "missing-native-component-001", kind: "missing", role: "missing-native-component", box: { x: 20, y: 30, w: 42, h: 3 } },
        { pageIndex: 0, id: "missing-native-component-002", kind: "missing", role: "missing-native-component", box: { x: 64, y: 18, w: 3, h: 38 } }
      ]
    },
    paddingPt: 10,
    maximumTargets: 4,
    maximumAtoms: 8
  });

  assert.equal(result.candidateTargets, 2);
  assert.ok(result.changedComponentKeys.includes("0:missing-native-component-001"));
  assert.ok(result.changedComponentKeys.includes("0:missing-native-component-002"));
});

test("final missing native visual atom candidate accepts only quality-gated target improvements", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-missing-atom-gated-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = image(160, 100);
  fillRect(source, 20, 26, 64, 3, [20, 90, 180, 255]);
  const sourceFile = path.join(root, "source.png");
  writePng(sourceFile, source);
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 160, heightPt: 100 },
    pages: [{ pageIndex: 0, shapes: [], textBoxes: [], images: [] }]
  };
  const visualQuality = {
    checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
    metrics: {
      "pixel-diff-ratio": 0.11,
      "foreground-missing-ratio": 0.08,
      "mean-absolute-delta": 14,
      "component-regions-attention": 2,
      "worst-component-normalized-severity": 4
    },
    componentWorst: [
      { pageIndex: 0, id: "missing-native-component-001", kind: "missing", role: "missing-native-component", severity: 4, pixelDiffRatio: 1, foregroundMissingRatio: 1, box: { x: 20, y: 26, w: 18, h: 3 } },
      { pageIndex: 0, id: "missing-native-component-002", kind: "missing", role: "missing-native-component", severity: 3.5, pixelDiffRatio: 1, foregroundMissingRatio: 1, box: { x: 42, y: 26, w: 18, h: 3 } }
    ]
  };
  let builds = 0;

  const result = await tryBuildFinalMissingNativeVisualAtomCandidate({
    root,
    metadata: { generatedDeck: deck },
    sourceImages: [sourceFile],
    visualQuality,
    isCancellationRequested: async () => false,
    runBuild: async ({ deckFile, pptxFile }) => {
      builds += 1;
      assert.ok(fs.existsSync(deckFile));
      fs.writeFileSync(pptxFile, `pptx-${builds}`);
    },
    rawImageQualityVerifier: async ({ deck: candidateDeck }) => {
      assert.ok(candidateDeck.pages[0].shapes.length > 0);
      return {
        checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
        metrics: {
          "pixel-diff-ratio": 0.109,
          "foreground-missing-ratio": 0.078,
          "mean-absolute-delta": 13.9,
          "component-regions-attention": 1,
          "worst-component-normalized-severity": 3.4
        },
        componentWorst: [
          { pageIndex: 0, id: "missing-native-component-002", kind: "missing", role: "missing-native-component", severity: 3.4, pixelDiffRatio: 0.8, foregroundMissingRatio: 0.8, box: { x: 42, y: 26, w: 18, h: 3 } }
        ],
        componentLocalMetrics: [
          { pageIndex: 0, id: "missing-native-component-001", kind: "missing", role: "missing-native-component", severity: 3.2, pixelDiffRatio: 0.75, foregroundMissingRatio: 0.75 },
          { pageIndex: 0, id: "missing-native-component-002", kind: "missing", role: "missing-native-component", severity: 3.4, pixelDiffRatio: 0.8, foregroundMissingRatio: 0.8 }
        ]
      };
    }
  });

  assert.equal(result.accepted, true);
  assert.ok(builds > 0);
  assert.ok(result.addedShapes > 0);
  assert.equal(result.deck.pages[0].images.length, 0);
  assert.deepEqual(result.deck.meta.finalMissingNativeVisualAtomFit.changedComponentKeys, ["0:missing-native-component-001", "0:missing-native-component-002"]);
});

test("final missing native visual atom candidate rejects global-only metric gains without target improvement", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-missing-atom-reject-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = image(120, 80);
  fillRect(source, 20, 18, 34, 3, [20, 90, 180, 255]);
  const sourceFile = path.join(root, "source.png");
  writePng(sourceFile, source);
  const visualQuality = {
    checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
    metrics: {
      "pixel-diff-ratio": 0.11,
      "foreground-missing-ratio": 0.08,
      "mean-absolute-delta": 14,
      "component-regions-attention": 1,
      "worst-component-normalized-severity": 4
    },
    componentWorst: [
      { pageIndex: 0, id: "missing-native-component-001", kind: "missing", role: "missing-native-component", severity: 4, pixelDiffRatio: 1, foregroundMissingRatio: 1, box: { x: 20, y: 18, w: 34, h: 3 } }
    ]
  };
  const result = await tryBuildFinalMissingNativeVisualAtomCandidate({
    root,
    metadata: { generatedDeck: { version: "1.0", slideSize: { widthPt: 120, heightPt: 80 }, pages: [{ pageIndex: 0, shapes: [], textBoxes: [], images: [] }] } },
    sourceImages: [sourceFile],
    visualQuality,
    isCancellationRequested: async () => false,
    runBuild: async ({ pptxFile }) => fs.writeFileSync(pptxFile, "pptx"),
    rawImageQualityVerifier: async () => ({
      checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
      metrics: {
        "pixel-diff-ratio": 0.109,
        "foreground-missing-ratio": 0.078,
        "mean-absolute-delta": 13.9,
        "component-regions-attention": 1,
        "worst-component-normalized-severity": 4
      },
      componentWorst: visualQuality.componentWorst
    })
  });

  assert.equal(result.accepted, false);
  assert.ok(result.addedShapes > 0);
});
