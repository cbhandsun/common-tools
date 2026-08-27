"use strict";

const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildComponentAssetReplayIr,
  parsePresentationSlideSize,
  selectReplayGroup
} = require("../skills/pd-hifi-slideclone/scripts/lib/component-asset-replay-fixture");

function replayGroup(id, count, overrides = {}) {
  return {
    id,
    boundsPt: { x: 100, y: 80, w: 500, h: 260 },
    componentScore: 80,
    pictureCount: 0,
    connectorCount: 2,
    reuseReadiness: { level: "high", score: 95 },
    structure: { kind: "process-chain", motifs: ["linear-arrow-chain"] },
    childLayout: { children: Array.from({ length: 4 }, (_, index) => ({ kind: "shape", box: { x: index * 0.2, y: 0.2, w: 0.15, h: 0.2 } })) },
    replayChildLayout: { children: Array.from({ length: count }, (_, index) => ({
      kind: index % 3 === 2 ? "connector" : "shape",
      box: { x: (index % 4) * 0.2, y: Math.floor(index / 4) * 0.25, w: 0.14, h: 0.12 },
      style: index % 3 === 2 ? { stroke: "#185ABD" } : { fill: "#EAF3FF", shapeType: "roundRect" }
    })) },
    ...overrides
  };
}

test("component replay fixture selects the strongest complete editable group", () => {
  const selected = selectReplayGroup([
    replayGroup("picture-heavy", 20, { pictureCount: 4 }),
    replayGroup("complete", 12),
    replayGroup("three-part-arrow", 3),
    replayGroup("too-small", 2)
  ]);
  assert.equal(selected.id, "complete");
});

test("component replay fixture admits a three-part editable arrow but rejects two-part fragments", () => {
  assert.equal(selectReplayGroup([replayGroup("three-part-arrow", 3)]).id, "three-part-arrow");
  assert.equal(selectReplayGroup([replayGroup("two-part-fragment", 2)]), null);
});

test("component replay fixture builds a bounded native IR page", () => {
  const sourceImage = path.resolve("runs", "fixture-source.png");
  const ir = buildComponentAssetReplayIr({
    summary: { componentCatalog: [replayGroup("complete", 12)] },
    sourceImage,
    slideSize: { widthPt: 960, heightPt: 540 },
    asset: { provider: "OfficePLUS<script>", name: "fixture.pptx", path: path.resolve("fixture.pptx") }
  });

  assert.equal(ir.pages.length, 1);
  assert.equal(ir.pages[0].sourceImage, sourceImage);
  assert.ok(ir.pages[0].shapes.length >= 4);
  assert.equal(ir.pages[0].source.componentProvider, "officeplus-script");
  assert.ok(ir.pages[0].shapes.every((shape) => shape.source.appliedPluginDirectReplay === true));
});

test("component replay fixture reconstructs a three-part applied arrow as native shapes", () => {
  const threePartArrow = replayGroup("three-part-arrow", 3, {
    childLayout: { children: Array.from({ length: 3 }, (_, index) => ({
      kind: "shape",
      box: { x: index * 0.28, y: 0.2, w: 0.22, h: 0.2 },
      style: { fill: "#EAF3FF", shapeType: "roundRect" }
    })) },
    replayChildLayout: { children: Array.from({ length: 3 }, (_, index) => ({
      kind: "shape",
      box: { x: index * 0.28, y: 0.2, w: 0.22, h: 0.2 },
      style: { fill: "#EAF3FF", shapeType: "roundRect" }
    })) }
  });
  const ir = buildComponentAssetReplayIr({
    summary: { componentCatalog: [threePartArrow] },
    sourceImage: path.resolve("runs", "fixture-source.png"),
    slideSize: { widthPt: 960, heightPt: 540 },
    asset: { provider: "islide", name: "three-part-arrow.pptx", path: path.resolve("fixture.pptx") }
  });

  const directReplayShapes = ir.pages[0].shapes.filter((shape) => shape.source.appliedPluginDirectReplay === true);
  assert.ok(ir.pages[0].shapes.length >= 3);
  assert.equal(directReplayShapes.length, 3);
});

test("component replay fixture admits hybrid plugin groups without globally relaxing picture policy", () => {
  const group = replayGroup("hybrid-roadmap", 10, {
    pictureCount: 2,
    shapeCount: 8,
    replayChildLayout: {
      children: [
        ...Array.from({ length: 8 }, (_, index) => ({
          kind: "shape",
          box: { x: (index % 4) * 0.22, y: Math.floor(index / 4) * 0.34, w: 0.18, h: 0.22 },
          style: { fill: "#EAF3FF", shapeType: index % 2 ? "ellipse" : "roundRect" }
        })),
        { kind: "picture", box: { x: 0.08, y: 0.08, w: 0.06, h: 0.10 }, style: { picture: { embedRelId: "rId7", mediaTarget: "ppt/media/icon1.png" } } },
        { kind: "picture", box: { x: 0.52, y: 0.42, w: 0.06, h: 0.10 }, style: { picture: { embedRelId: "rId8", mediaTarget: "ppt/media/icon2.png" } } }
      ]
    }
  });
  const ir = buildComponentAssetReplayIr({
    summary: { componentCatalog: [group] },
    sourceImage: path.resolve("runs", "fixture-source.png"),
    slideSize: { widthPt: 960, heightPt: 540 },
    asset: { provider: "officeplus", name: "hybrid-roadmap.pptx", path: path.resolve("hybrid-roadmap.pptx") },
    assetDir: path.resolve("runs", "fixture-component-assets")
  });

  assert.equal(ir.pages[0].shapes.length, 10);
  assert.equal(ir.pages[0].shapes.filter((shape) => shape.source.appliedPluginPictureShell === true).length, 2);
  assert.equal(ir.pages[0].source.componentProvider, "officeplus");
});

test("component replay fixture parses slide size and rejects invalid boundaries", () => {
  assert.deepEqual(parsePresentationSlideSize('<p:presentation><p:sldSz cy="6858000" cx="12192000"/></p:presentation>'), {
    widthPt: 960,
    heightPt: 540
  });
  assert.deepEqual(parsePresentationSlideSize('<p:sldSz cx="0" cy="NaN"/>'), { widthPt: 960, heightPt: 540 });
  assert.throws(() => buildComponentAssetReplayIr({ summary: { componentCatalog: [] } }), /No reusable/);
});
