"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DETECTOR_PREFIX,
  createProductManagerFrictionNetworkObjects,
  normalizeProductManagerFrictionNarrativeTextBoxes
} = require("../skills/pd-hifi-slideclone/scripts/lib/product-manager-friction-network");

const slideSize = { widthPt: 960, heightPt: 540 };

function candidateImage(overrides = {}) {
  return {
    id: "native-graphic-0",
    box: { x: 66.72, y: 120.75, w: 596.77, h: 275.25 },
    source: {
      detector: "foreground-graphic-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "dense-complex-diagram",
      recommendedAction: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident"
    },
    ...overrides
  };
}

function semanticTextBoxes() {
  return [
    { text: "产品经理日常工作中的高频摩擦" },
    { text: "产品交付" },
    { text: "需求杂乱：非结构化信息难以快速收敛为核心业务逻辑。" },
    { text: "评审低效：风险发现滞后。" },
    { text: "文档反复：重复性写作耗费大量时间。" },
    { text: "原型割裂：各方理解不一。" }
  ];
}

test("does not claim unrelated dense diagrams", () => {
  const result = createProductManagerFrictionNetworkObjects(
    [candidateImage()],
    [{ text: "企业级资产管理架构" }],
    slideSize
  );

  assert.equal(result.matched, false);
  assert.deepEqual(result.shapes, []);
  assert.deepEqual(result.textBoxes, []);
});

test("rebuilds the product-manager friction network into editable minimum units", () => {
  const image = candidateImage();
  const inputTextBoxes = semanticTextBoxes();
  const result = createProductManagerFrictionNetworkObjects([image], inputTextBoxes, slideSize);

  assert.equal(result.matched, true);
  assert.deepEqual(result.sourceIds, ["native-graphic-0"]);
  const routes = result.shapes.filter((shape) => shape.source.detector === `${DETECTOR_PREFIX}route`);
  assert.equal(routes.length, 15);
  assert.equal(routes.every((shape) => shape.type === "freeform"), true);
  assert.equal(routes.every((shape) => shape.style.closePath === false), true);
  assert.equal(routes.every((shape) => shape.style.freeformSegments[0].type === "moveTo"), true);
  assert.equal(routes.every((shape) => shape.style.freeformSegments.slice(1).every((segment) => segment.type === "cubicBezTo")), true);
  assert.equal(routes.every((shape) => shape.style.freeformSegments.some((segment) => segment.type === "cubicBezTo")), true);
  assert.equal(result.shapes.filter((shape) => shape.type === "rect").length, 5);
  assert.equal(result.shapes.filter((shape) => shape.type === "diamond").length, 3);
  assert.equal(result.textBoxes.length, 7);
  assert.equal(result.textBoxes.every((textBox) => textBox.source.editable === true), true);
  assert.equal(result.shapes.every((shape) => shape.source.detector.startsWith(DETECTOR_PREFIX)), true);
  assert.equal(new Set(result.shapes.map((shape) => shape.source.nativeComponentGroupId)).size, 9);
  assert.equal(routes.every((shape) => shape.source.nativeComponentGroupId === "product-manager-friction-network-routing"), true);
  assert.equal(result.shapes.filter((shape) => shape.type === "rect" && shape.source.detector.endsWith("input-card")).every((shape) => shape.style.gradient?.stops?.length === 2), true);
  assert.equal(result.shapes.filter((shape) => shape.type === "diamond").every((shape) => shape.style.gradient?.stops?.length === 3), true);
  assert.equal(result.textBoxes.every((textBox) => textBox.style.nativeComponentGroupId === textBox.source.nativeComponentGroupId), true);
  const narrative = inputTextBoxes.filter((textBox) => /需求杂乱|评审低效|文档反复|原型割裂/.test(textBox.text));
  assert.equal(narrative.length, 4);
  assert.equal(narrative.every((textBox) => textBox.text.startsWith("•  ")), true);
  assert.equal(narrative.every((textBox) => textBox.runs?.[1]?.font?.weight === "bold"), true);
  assert.equal(image.source.productManagerFrictionNetworkObjectified, true);
  assert.equal(image.source.nonEditableReason, null);
});

test("rejects unsafe candidate sizes and image-like expression forms", () => {
  const tiny = candidateImage({ box: { x: 20, y: 20, w: 40, h: 40 } });
  const illustration = candidateImage({
    source: { detector: "foreground-graphic-crop", expressionForm: "illustration" }
  });

  assert.equal(createProductManagerFrictionNetworkObjects([tiny], semanticTextBoxes(), slideSize).matched, false);
  assert.equal(createProductManagerFrictionNetworkObjects([illustration], semanticTextBoxes(), slideSize).matched, false);
});

test("applies native rich-text bullets to the final narrative text collection", () => {
  const textBoxes = [
    { id: "note-a", text: "需求杂乱：信息难以收敛。", font: { sizePt: 12 } },
    { id: "note-b", text: "·文档反复：重复性写作。", font: { sizePt: 12 } },
    { id: "unrelated", text: "产品交付", font: { sizePt: 18 } }
  ];

  normalizeProductManagerFrictionNarrativeTextBoxes(textBoxes);

  assert.equal(textBoxes[0].text, "•  需求杂乱：信息难以收敛。");
  assert.equal(textBoxes[1].text, "•  文档反复：重复性写作。");
  assert.equal(textBoxes[0].box, undefined);
  assert.equal(textBoxes[0].font.sizePt, 12);
  assert.deepEqual(textBoxes[0].runs.map((run) => run.font.weight), ["regular", "bold", "regular"]);
  assert.equal(textBoxes[2].runs, undefined);
});
