"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createSegmentedAssetOsClosedLoopCycleObjects
} = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");

test("Asset OS closed loop emits seven semantic components around minimum-unit crops", () => {
  const assetDir = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-asset-os-closed-loop-"));
  try {
    const sourceImage = { width: 960, height: 540, rgba: Buffer.alloc(960 * 540 * 4, 240) };
    const source = { detector: "product-illustration-segment-crop" };
    const page = {
      images: [
        { id: "segment-a", box: { x: 90, y: 120, w: 180, h: 300 }, source: { ...source } },
        { id: "segment-b", box: { x: 270, y: 120, w: 180, h: 300 }, source: { ...source } },
        { id: "segment-c", box: { x: 450, y: 120, w: 180, h: 300 }, source: { ...source } },
        { id: "segment-d", box: { x: 630, y: 120, w: 180, h: 300 }, source: { ...source } }
      ],
      textBoxes: [
        { text: "AI Skills 全链路工作流闭环", box: { x: 90, y: 75, w: 300, h: 25 } },
        { text: "多源混沌输入", box: { x: 100, y: 330, w: 120, h: 20 } },
        { text: "（飞书、代码、零散文档）", box: { x: 90, y: 355, w: 150, h: 20 } },
        { text: "需求理解", box: { x: 360, y: 170, w: 75, h: 20 } },
        { text: "PRD 生成", box: { x: 690, y: 170, w: 75, h: 20 } },
        { text: "原型映射", box: { x: 360, y: 365, w: 75, h: 20 } },
        { text: "智能评审", box: { x: 690, y: 365, w: 75, h: 20 } },
        { text: "资产自动入库沉淀", box: { x: 500, y: 270, w: 140, h: 20 } },
        { text: "单点独立调用与热插拔", box: { x: 775, y: 275, w: 160, h: 20 } }
      ]
    };

    const result = createSegmentedAssetOsClosedLoopCycleObjects(page, { widthPt: 960, heightPt: 540 }, {
      sourceImage,
      assetDir,
      irDir: assetDir,
      deckName: "fixture",
      pageIndex: 0
    });
    const parts = [...result.shapes, ...result.images, ...result.textBoxes];
    const groups = [...new Set(parts.map((item) => item.source?.nativeComponentGroupId).filter(Boolean))];

    assert.deepEqual(groups.sort(), [
      "asset-os-closed-loop-core",
      "asset-os-closed-loop-demand",
      "asset-os-closed-loop-input",
      "asset-os-closed-loop-output",
      "asset-os-closed-loop-prd",
      "asset-os-closed-loop-prototype",
      "asset-os-closed-loop-review"
    ]);
    assert.ok(parts.every((item) => item.source?.nativeComponentGroupId));
    assert.equal(result.images.length, 10);
    assert.ok(result.images.every((item) => item.source.protectedMinimumUnit === true));
    assert.ok(result.textBoxes.every((item) => item.style.nativeComponentGroupId === item.source.nativeComponentGroupId));
  } finally {
    fs.rmSync(assetDir, { recursive: true, force: true });
  }
});
