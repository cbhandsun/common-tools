"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chainLayout, createSkillChainOrchestrationObjects, filterSkillChainOrchestrationTextBoxes, isolateOrangeShield, shouldObjectifySkillChainOrchestration } = require("../skills/pd-hifi-slideclone/scripts/lib/skill-chain-orchestration");

function fixture() {
  const labels = ["Skills协作模式：单点调用与链式编排", "产品经理工作台", "理解", "生成", "评审", "原型", "资产库", "PRD", "评审记录"].map((text) => ({ text }));
  return { page: { images: [{ id: "underlay", box: { x: 40, y: 130, w: 880, h: 300 }, source: { detector: "graphic-underlay" } }] }, labels };
}

test("skill chain orchestration requires complete semantics and visual evidence", () => { const { page, labels } = fixture(); assert.equal(shouldObjectifySkillChainOrchestration(page, labels), true); assert.equal(shouldObjectifySkillChainOrchestration({ images: [] }, labels), false); assert.equal(shouldObjectifySkillChainOrchestration(page, labels.filter((item) => item.text !== "评审记录")), false); });
test("skill chain orchestration rebuilds semantic nodes and two routing modes", () => { const { page, labels } = fixture(); const result = createSkillChainOrchestrationObjects(page, labels); assert.equal(result.matched, true); assert.equal(result.shapes.filter((shape) => shape.source.detector.endsWith("stage-card")).length, 4); assert.equal(result.shapes.filter((shape) => shape.source.nativeComponentGroupId.endsWith("gray-routing")).length, 7); assert.equal(result.shapes.filter((shape) => shape.source.nativeComponentGroupId.endsWith("green-chain")).length, 6); assert.equal(result.shapes.length, 22); assert.equal(result.textBoxes.length, 14); });
test("orange shield mask keeps orange and nearby white mark but removes distant white", () => { const image = { width: 3, height: 1, rgba: Buffer.from([230, 110, 30, 255, 250, 250, 250, 255, 250, 250, 250, 255]) }; const result = isolateOrangeShield(image); assert.equal(result.rgba[3], 255); assert.equal(result.rgba[7], 255); });
test("shield crop stays in an image-only component group", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-chain-shield-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { page, labels } = fixture();
  const sourceImage = { width: 960, height: 540, rgba: Buffer.alloc(960 * 540 * 4, 255) };
  const result = createSkillChainOrchestrationObjects(page, labels, undefined, {
    sourceImage,
    assetDir: root,
    irDir: root,
    deckName: "fixture",
    pageIndex: 9
  });
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0].source.nativeComponentGroupId, "skill-chain-orchestration-warning-shield");
  assert.equal(result.images[0].source.semanticParentGroupId, "skill-chain-orchestration-stage-review");
});
test("skill chain ownership removes OCR copies", () => { const native = { text: "资产库", source: { detector: "skill-chain-orchestration-native-text" } }; assert.deepEqual(filterSkillChainOrchestrationTextBoxes([{ text: "资产库" }, native], true), [native]); });
test("skill chain text uses nearest OCR evidence for duplicate labels and narrative notes", () => {
  const { page, labels } = fixture();
  const evidence = [
    ...labels,
    { text: "原型", box: { x: 631, y: 289, w: 42, h: 24 }, font: { sizePt: 17 } },
    { text: "原型", box: { x: 815, y: 260, w: 33, h: 20 }, font: { sizePt: 14 } },
    { text: "极简跨界调用：支持将单一Skill抽离使用，精准解决即时痛点。", box: { x: 57, y: 445, w: 344, h: 14 }, font: { sizePt: 10 } }
  ];
  const result = createSkillChainOrchestrationObjects(page, evidence);
  assert.deepEqual(result.textBoxes.find((item) => item.id === "skill-chain-stage-label-prototype").box, evidence[evidence.length - 3].box);
  assert.deepEqual(result.textBoxes.find((item) => item.id === "skill-chain-repository-item-label-1").box, evidence[evidence.length - 2].box);
  const note = result.textBoxes.find((item) => item.id === "skill-chain-note-minimal");
  assert.deepEqual(note.source.evidenceBox, evidence[evidence.length - 1].box);
  assert.equal(note.font.sizePt, 10);
  assert.equal(note.runs[0].font.weight, "bold");
});

test("skill chain layout follows detected source component bounds", () => {
  const layout = chainLayout({ widthPt: 960, heightPt: 540 });
  assert.deepEqual(layout.stages.map(({ box }) => box), [
    { x: 214.4, y: 263.6, w: 77.6, h: 76.9 },
    { x: 348.2, y: 263.6, w: 77.2, h: 76.9 },
    { x: 481.7, y: 263.6, w: 76.8, h: 76.9 },
    { x: 614.4, y: 263.6, w: 77.6, h: 76.9 }
  ]);
  assert.deepEqual(layout.repository, { x: 756.5, y: 147.8, w: 148.8, h: 197.6 });
});
