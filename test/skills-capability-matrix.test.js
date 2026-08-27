"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSkillsCapabilityMatrixObjects,
  filterSkillsCapabilityMatrixTextBoxes,
  isolateLightNeutralIcon,
  shouldObjectifySkillsCapabilityMatrix
} = require("../skills/pd-hifi-slideclone/scripts/lib/skills-capability-matrix");

function fixture() {
  const labels = [
    "Skills能力矩阵：重塑智能产品工作流", "原始材料", "Skills能力中枢", "需求理解", "PRD评审",
    "PRD生成", "原型生成", "高质量产品资产"
  ].map((text) => ({ text, box: { x: 100, y: 100, w: 120, h: 20 } }));
  const images = [
    { id: "input", box: { x: 55, y: 216, w: 131, h: 106 }, source: { detector: "product-illustration-segment-crop" } },
    { id: "hub", box: { x: 223, y: 173, w: 192, h: 193 }, source: { detector: "product-illustration-segment-crop" } },
    { id: "stages", box: { x: 461, y: 137, w: 260, h: 265 }, source: { detector: "product-illustration-segment-crop" } },
    { id: "output", box: { x: 771, y: 216, w: 133, h: 107 }, source: { detector: "product-illustration-segment-crop" } }
  ];
  return { page: { images, textBoxes: labels }, labels };
}

test("skills capability matrix requires complete semantics and four structural segments", () => {
  const { page, labels } = fixture();
  assert.equal(shouldObjectifySkillsCapabilityMatrix(page, labels), true);
  assert.equal(shouldObjectifySkillsCapabilityMatrix({ ...page, images: page.images.slice(0, 3) }, labels), false);
  assert.equal(shouldObjectifySkillsCapabilityMatrix(page, labels.filter((item) => item.text !== "原型生成")), false);
});

test("skills capability matrix icon mask keeps light neutral strokes and removes blue card pixels", () => {
  const rgba = Buffer.from([
    30, 105, 198, 255,
    220, 231, 218, 255,
    170, 181, 168, 255,
    65, 163, 110, 255
  ]);
  const result = isolateLightNeutralIcon({ width: 4, height: 1, rgba });

  assert.equal(result.rgba[3], 0);
  assert.ok(result.rgba[7] > 200);
  assert.ok(result.rgba[11] > 0);
  assert.equal(result.rgba[15], 0);
});

test("skills capability matrix rebuilds structural units and retains only pictorial icons", () => {
  const { page, labels } = fixture();
  const result = createSkillsCapabilityMatrixObjects(page, labels);
  assert.equal(result.matched, true);
  assert.equal(result.sourceIds.length, 4);
  assert.equal(result.shapes.filter((shape) => shape.source.detector.endsWith("stage-card")).length, 4);
  assert.equal(result.shapes.filter((shape) => shape.source.detector.endsWith("route")).length, 13);
  assert.equal(result.textBoxes.length, 12);
  assert.equal(page.images.every((image) => image.source.skillsCapabilityMatrixObjectified === true), true);
  assert.deepEqual(result.shapes.find((shape) => shape.id === "skills-matrix-input-card").box, page.images[0].box);
  assert.deepEqual(result.shapes.find((shape) => shape.id === "skills-matrix-hub").box, page.images[1].box);
  assert.deepEqual(result.shapes.find((shape) => shape.id === "skills-matrix-output-card").box, page.images[3].box);
  assert.deepEqual(result.shapes.find((shape) => shape.id === "skills-matrix-stage-understanding").box, { x: 469, y: 137, w: 111, h: 117 });
  assert.deepEqual(result.shapes.find((shape) => shape.id === "skills-matrix-input-card").source.evidenceBox, page.images[0].box);
});

test("skills capability matrix ownership removes duplicate OCR and icon noise", () => {
  const { labels } = fixture();
  const native = [{ text: "需求理解", source: { detector: "skills-capability-matrix-native-text" } }];
  const splitOcr = ["Skills能力矩阵：", "重塑智能产品工作流", "Skills", "能力中枢", "高质量", "产品资产"]
    .map((text) => ({ text }));
  const filtered = filterSkillsCapabilityMatrixTextBoxes([...labels, ...splitOcr, { text: "Q" }, { text: "图" }, ...native], true);
  assert.equal(filtered.filter((item) => item.text === "需求理解").length, 1);
  assert.equal(filtered.some((item) => item.text === "Q" || item.text === "图"), false);
  assert.equal(filtered.some((item) => splitOcr.some((fragment) => fragment.text === item.text)), false);
});

test("skills capability matrix measures card and icon boxes from source pixels", () => {
  const { page, labels } = fixture();
  const sourceImage = solidImage(960, 540, [255, 255, 255, 255]);
  fill(sourceImage, { x: 63, y: 229, w: 111, h: 83 }, [150, 150, 150, 255]);
  fill(sourceImage, { x: 235, y: 186, w: 197, h: 168 }, [29, 106, 198, 255]);
  fill(sourceImage, { x: 477, y: 144, w: 105, h: 111 }, [30, 105, 198, 255]);
  fill(sourceImage, { x: 602, y: 144, w: 105, h: 111 }, [30, 105, 198, 255]);
  fill(sourceImage, { x: 477, y: 285, w: 105, h: 110 }, [30, 105, 198, 255]);
  fill(sourceImage, { x: 602, y: 285, w: 105, h: 110 }, [30, 105, 198, 255]);
  fill(sourceImage, { x: 785, y: 228, w: 112, h: 84 }, [65, 163, 110, 255]);
  const result = createSkillsCapabilityMatrixObjects(page, labels, { widthPt: 960, heightPt: 540 }, { sourceImage });
  const understanding = result.shapes.find((shape) => shape.id === "skills-matrix-stage-understanding");

  assert.deepEqual(understanding.box, { x: 477, y: 144, w: 105, h: 111 });
});

function solidImage(width, height, color) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) rgba.set(color, offset);
  return { width, height, rgba };
}

function fill(image, box, color) {
  for (let y = box.y; y < box.y + box.h; y += 1) {
    for (let x = box.x; x < box.x + box.w; x += 1) image.rgba.set(color, (y * image.width + x) * 4);
  }
}
