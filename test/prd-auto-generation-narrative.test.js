"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  NARRATIVE_PREFIXES,
  createPrdAutoGenerationNarrativeTextBoxes
} = require("../skills/pd-hifi-slideclone/scripts/lib/prd-auto-generation-narrative");

test("PRD auto-generation narrative preserves OCR evidence and rich text semantics", () => {
  const raw = NARRATIVE_PREFIXES.map((prefix, index) => ({
    text: `${prefix}第 ${index + 1} 条说明`,
    box: { x: 100, y: 390 + index * 28, w: 430, h: 16 },
    font: { sizePt: index === 0 ? 8 : 12 },
    source: { confidence: 0.9 }
  }));
  const result = createPrdAutoGenerationNarrativeTextBoxes(raw);

  assert.equal(result.length, 4);
  assert.deepEqual(result[0].source.evidenceBox, raw[0].box);
  assert.deepEqual(result[0].box, raw[0].box);
  assert.equal(result[0].font.sizePt, 9.5);
  assert.equal(result[0].runs[0].font.weight, "bold");
  assert.equal(result[0].runs[1].font.weight, "regular");
  assert.ok(result.every((item) => item.source.nativeComponentGroupId === "prd-auto-generation-narrative"));
});

test("PRD auto-generation narrative fails closed for malformed and unrelated input", () => {
  assert.deepEqual(createPrdAutoGenerationNarrativeTextBoxes(null), []);
  assert.deepEqual(createPrdAutoGenerationNarrativeTextBoxes([{ text: "无关文本", box: { x: 1, y: 2, w: 3, h: 4 } }]), []);
  assert.deepEqual(createPrdAutoGenerationNarrativeTextBoxes([{ text: `${NARRATIVE_PREFIXES[0]}正文`, box: { x: 1, y: 2, w: -3, h: 4 } }]), []);
  assert.deepEqual(createPrdAutoGenerationNarrativeTextBoxes([{ text: NARRATIVE_PREFIXES[0], box: { x: 1, y: 2, w: 3, h: 4 } }]), []);
});
