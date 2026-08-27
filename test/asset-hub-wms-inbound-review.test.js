"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createAssetHubWmsInboundReviewObjects,
  normalizeAssetHubWmsInboundReviewOcrTextBoxes
} = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");

function sourceImage() {
  return { width: 960, height: 540, rgba: Buffer.alloc(960 * 540 * 4, 255) };
}

test("WMS inbound review replaces one dominant residual with native cards and two minimum crops", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wms-review-"));
  try {
    const page = {
      images: [{
        id: "underlay",
        box: { x: 45, y: 125, w: 870, h: 390 },
        source: { detector: "mixed-diagram-graphic-underlay-crop" }
      }]
    };
    const textBoxes = [{
      id: "badge",
      text: "真实案例证明 物流 WMS 入库单管理 V39B 核心主链路 前置评审 复杂增量规则",
      box: { x: 45, y: 30, w: 430, h: 22 }
    }];
    const result = createAssetHubWmsInboundReviewObjects(page, textBoxes, { widthPt: 960, heightPt: 540 }, {
      sourceImage: sourceImage(),
      assetDir: root,
      irDir: root,
      deckName: "asset-hub",
      pageIndex: 5
    });

    assert.equal(result.images.length, 0);
    assert.equal(result.images.every((image) => image.source.intentionalMinimumUnitCrop === true), true);
    assert.equal(result.shapes.filter((shape) => shape.source.detector === "asset-hub-wms-review-native-output-card").length, 3);
    assert.equal(result.shapes.every((shape) => shape.source.componentOwnerKind === "three-column-review"), true);
    const check = result.shapes.find((shape) => shape.id === "asset-hub-wms-review-check-bg-0");
    assert.ok(check.box.x + check.box.w < 716);
    assert.equal(page.images[0].source.assetHubWmsInboundReviewObjectified, true);
    assert.equal(result.images.every((image) => fs.existsSync(path.join(root, image.assetPath))), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("WMS inbound review preserves source line geometry and groups output-card OCR fragments", () => {
  const textBoxes = [
    { id: "t1", text: "生成《开发参考》：", box: { x: 709.97, y: 192.38, w: 146.94, h: 16.88 } },
    { id: "b1", text: "直接将复杂逻辑拆解出5个精确", box: {} },
    { id: "b2", text: "的BE/FE研发与QA任务。", box: {} },
    { id: "t2", text: "生成交互资产：", box: { x: 710.72, y: 297.75, w: 110.96, h: 16.88 } },
    { id: "b3", text: "自动对接快速收货、物流追踪码", box: {} },
    { id: "b4", text: "码等6种弹弹窗的交互限制，", box: {} },
    { id: "t3", text: "资产落盘：", box: { x: 710.72, y: 410.63, w: 74.22, h: 18 } },
    { id: "b5", text: "已审PRD与前端代码解析无缝", box: {} },
    { id: "b6", text: "汇入物流域标准仓。", box: {} }
  ];

  normalizeAssetHubWmsInboundReviewOcrTextBoxes(textBoxes, { widthPt: 960, heightPt: 540 });

  assert.equal(textBoxes.length, 9);
  const titles = textBoxes.filter((item) => /^(生成|资产落盘)/.test(item.text) && item.font?.sizePt === 14.4);
  assert.equal(titles.length, 3);
  assert.deepEqual(titles.map((item) => item.box.x), [709.97, 710.72, 710.72]);
  assert.equal(titles.every((item) => item.style.wrap === false), true);
  const bodies = textBoxes.filter((item) => item.source?.nativeComponentRole === "output-card-body");
  assert.equal(bodies.length, 6);
  assert.equal(bodies.every((item) => item.source.componentOwnerKind === "three-column-review"), true);
  assert.equal(textBoxes.some((item) => item.text === "码等 6 种弹窗的交互限制。"), true);
  assert.equal(textBoxes.some((item) => /弹弹窗/.test(item.text)), false);
});

test("WMS inbound review fails closed without dominant visual evidence", () => {
  const result = createAssetHubWmsInboundReviewObjects({ images: [] }, [{ text: "V39B 核心主链路 前置评审" }]);
  assert.deepEqual(result, { shapes: [], textBoxes: [], images: [] });
});
