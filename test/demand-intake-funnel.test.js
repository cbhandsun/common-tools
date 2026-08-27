"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createDemandIntakeFunnelObjects,
  filterDemandIntakeFunnelTextBoxes,
  funnelLayout,
  isolateLightBlueIcon,
  shouldObjectifyDemandIntakeFunnel
} = require("../skills/pd-hifi-slideclone/scripts/lib/demand-intake-funnel");

function fixture() {
  const labels = ["需求理解：从杂乱信息到结构化输入", "会议纪要", "业务描述", "竞品截图", "旧系统", "说明", "需求理解", "Skill", "业务流程", "角色边界", "待确认问题"]
    .map((text) => ({ text }));
  const images = [
    { id: "inputs", box: { x: 94, y: 105, w: 189, h: 295 }, source: { detector: "product-illustration-segment-crop" } },
    { id: "funnel", box: { x: 349, y: 114, w: 285, h: 286 }, source: { detector: "product-illustration-segment-crop" } },
    { id: "outputs", box: { x: 716, y: 153, w: 117, h: 216 }, source: { detector: "product-illustration-segment-crop" } }
  ];
  return { page: { images }, labels };
}

test("demand intake funnel requires complete semantics and three structural segments", () => {
  const { page, labels } = fixture();
  assert.equal(shouldObjectifyDemandIntakeFunnel(page, labels), true);
  assert.equal(shouldObjectifyDemandIntakeFunnel({ images: page.images.slice(0, 2) }, labels), false);
  assert.equal(shouldObjectifyDemandIntakeFunnel(page, labels.filter((item) => item.text !== "待确认问题")), false);
});

test("demand intake icon mask keeps light-blue strokes and removes blue, white, and green backgrounds", () => {
  const rgba = Buffer.from([
    48, 128, 208, 255,
    112, 176, 240, 255,
    255, 255, 255, 255,
    64, 176, 112, 255
  ]);
  const result = isolateLightBlueIcon({ width: 4, height: 1, rgba });
  assert.equal(result.rgba[3], 0);
  assert.ok(result.rgba[7] > 0);
  assert.equal(result.rgba[11], 0);
  assert.equal(result.rgba[15], 0);
});

test("demand intake funnel calibrates its primary blue body from source pixels", () => {
  const sourceImage = { width: 960, height: 540, rgba: Buffer.alloc(960 * 540 * 4, 255) };
  for (let y = 126; y < 418; y += 1) {
    for (let x = 338; x < 635; x += 1) {
      const offset = (y * sourceImage.width + x) * 4;
      sourceImage.rgba[offset] = 37;
      sourceImage.rgba[offset + 1] = 124;
      sourceImage.rgba[offset + 2] = 207;
    }
  }
  const layout = funnelLayout({ widthPt: 960, heightPt: 540 }, [], sourceImage);
  assert.deepEqual(layout.funnel, { x: 338, y: 126, w: 297, h: 292 });
  assert.deepEqual(layout.lip, { x: 336.52, y: 126, w: 57.92, h: 292 });
});

test("demand intake funnel rebuilds notes, funnel, routes, outputs, and semantic text", () => {
  const { page, labels } = fixture();
  const result = createDemandIntakeFunnelObjects(page, labels);
  assert.equal(result.matched, true);
  assert.equal(result.sourceIds.length, 3);
  assert.equal(result.shapes.filter((shape) => shape.source.detector.endsWith("input-note")).length, 4);
  assert.equal(result.shapes.filter((shape) => shape.source.detector.endsWith("output-card")).length, 3);
  assert.equal(result.shapes.length, 22);
  assert.equal(result.textBoxes.length, 14);
  assert.equal(result.images.length, 0);
});

test("demand intake funnel anchors semantic text and output cards to OCR evidence", () => {
  const { page, labels } = fixture();
  const evidence = labels.map((item, index) => ({
    ...item,
    box: { x: 100 + index * 10, y: 120 + index * 5, w: 70, h: 20 },
    font: { sizePt: 11 + index }
  }));
  const result = createDemandIntakeFunnelObjects(page, evidence);
  const title = result.textBoxes.find((item) => item.id === "demand-intake-title");
  const processText = result.textBoxes.find((item) => item.id === "demand-intake-output-text-process");
  const processCard = result.shapes.find((item) => item.id === "demand-intake-output-card-process");

  assert.deepEqual(title.box, evidence[0].box);
  assert.equal(title.font.sizePt, 11);
  assert.deepEqual(processText.box, evidence[8].box);
  assert.deepEqual(processCard.box, { x: 150, y: 147, w: 130, h: 46 });
  assert.deepEqual(processText.source.evidenceBox, evidence[8].box);
});

test("demand intake funnel removes duplicate OCR and split labels", () => {
  const source = [{ text: "旧系统" }, { text: "说明" }, { text: "需求理解" }, { text: "Skill" }, { text: "业务流程" }];
  const native = [{ text: "业务流程", source: { detector: "demand-intake-funnel-native-text" } }];
  const filtered = filterDemandIntakeFunnelTextBoxes([...source, ...native], true);
  assert.deepEqual(filtered.map((item) => item.text), ["业务流程"]);
});
