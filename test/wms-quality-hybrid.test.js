"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createProductBrainWmsQualityGateObjects,
  filterTextBoxesClaimedByProductBrainWmsQualityGate
} = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");

function blankImage(width, height) {
  const rgba = Buffer.alloc(width * height * 4, 255);
  return { width, height, rgba };
}

function qualityGateFixture() {
  return {
    images: [{
      id: "wms-quality-gate-underlay",
      box: { x: 62, y: 132, w: 842, h: 312 },
      source: {
        detector: "cycle-illustration-underlay-crop",
        reason: "input-complexity-portal-output-preserved-as-content-region-crop"
      }
    }],
    textBoxes: [
      { text: "实战案例：物流WMS「入库单管理」的质量前置", box: { x: 132, y: 66, w: 710, h: 50 } },
      { text: "Input Complexity", box: { x: 161, y: 136, w: 190, h: 31 } },
      { text: "Portal Output", box: { x: 636, y: 136, w: 170, h: 31 } },
      { text: "Clear calculation formulas", box: { x: 695, y: 196, w: 193, h: 24 } },
      { text: "FE/BE/QA tasks automatically extracted", box: { x: 695, y: 279, w: 193, h: 36 } },
      { text: "开发参考", box: { x: 552, y: 279, w: 110, h: 31 } },
      { text: "交互验证", box: { x: 552, y: 361, w: 110, h: 31 } }
    ]
  };
}

test("WMS quality gate preserves the tangled input network as one minimum unit", () => {
  const fixture = qualityGateFixture();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wms-quality-hybrid-"));
  const assetDir = path.join(tempDir, "assets");
  const result = createProductBrainWmsQualityGateObjects(
    { images: fixture.images },
    fixture.textBoxes,
    { widthPt: 960, heightPt: 540 },
    {
      sourceImage: blankImage(960, 540),
      assetDir,
      irDir: tempDir,
      deckName: "Digital_Product_Brain",
      pageIndex: 8
    }
  );

  assert.equal(result.images.length, 1);
  assert.equal(result.images[0].source.detector, "product-brain-wms-quality-input-complexity-crop");
  assert.equal(result.images[0].source.intentionalMinimumUnitCrop, true);
  assert.ok((result.images[0].box.w * result.images[0].box.h) / (960 * 540) < 0.18);
  assert.equal(fs.existsSync(path.join(tempDir, result.images[0].assetPath)), true);
  assert.equal(result.shapes.some((shape) => shape.source.detector === "product-brain-wms-quality-native-network-line"), false);
  assert.equal(result.shapes.some((shape) => shape.source.detector === "product-brain-wms-quality-native-network-node"), false);
  assert.equal(result.shapes.filter((shape) => shape.source.detector === "product-brain-wms-quality-native-output-left").length, 3);
  assert.equal(result.shapes.filter((shape) => shape.source.detector === "product-brain-wms-quality-native-output-right").length, 3);
  assert.equal(result.textBoxes.some((textBox) => textBox.text.includes("V39B越库校验")), false);
  assert.equal(result.textBoxes.some((textBox) => textBox.text === "The Digital Architect's Canvas"), true);
});

test("WMS quality gate owns page text when its specialized strategy is active", () => {
  const filtered = filterTextBoxesClaimedByProductBrainWmsQualityGate([
    { text: "keep", source: { detector: "product-brain-wms-quality-native-text" } },
    { text: "drop", source: { detector: "generic-ocr-text" } }
  ], true);

  assert.deepEqual(filtered.map((item) => item.text), ["keep"]);
});
