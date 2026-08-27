"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createAssetOsFlowObjects
} = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");

test("Asset OS flow emits seven semantic components around protected icons", () => {
  const assetDir = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-asset-os-flow-"));
  try {
    const sourceImage = { width: 960, height: 540, rgba: Buffer.alloc(960 * 540 * 4, 240) };
    const image = {
      id: "asset-flow-source",
      box: { x: 210, y: 170, w: 540, h: 310 },
      source: {
        detector: "sparse-diagram-underlay",
        layer: { layerType: "diagram-zone", diagramUnderstanding: { archetype: "flow-card-chain" } }
      }
    };
    const labels = [
      ["标准化PRD", 330, 220], ["交互原型", 500, 220], ["操作手册", 635, 220],
      ["业务需求", 325, 445], ["历史文档", 475, 445], ["飞书截图", 630, 445]
    ].map(([text, x, y]) => ({ text, box: { x, y, w: 70, h: 20 } }));

    const flow = createAssetOsFlowObjects([image], labels, { widthPt: 960, heightPt: 540 }, {
      sourceImage,
      assetDir,
      irDir: assetDir,
      deckName: "fixture",
      pageIndex: 0
    });
    const parts = [...flow.shapes, ...flow.images, ...flow.textBoxes];
    const groups = [...new Set(parts.map((item) => item.source?.nativeComponentGroupId).filter(Boolean))];

    assert.equal(groups.length, 7);
    assert.ok(parts.every((item) => item.source.nativeComponentGroupId));
    assert.ok(flow.images.every((item) => item.source.protectedMinimumUnit === true));
    assert.ok(flow.textBoxes.every((item) => item.style.nativeComponentGroupId === item.source.nativeComponentGroupId));
  } finally {
    fs.rmSync(assetDir, { recursive: true, force: true });
  }
});
