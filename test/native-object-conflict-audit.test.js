"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  findDuplicateTextPairs,
  summarizeNativeObjectConflicts
} = require("../skills/pd-hifi-slideclone/scripts/lib/native-object-conflict-audit");
const {
  summarizeQualityGateStatus
} = require("../skills/pd-hifi-slideclone/scripts/quality-gate-real-pptx");

function textBox(id, text, box, detector = "") {
  return { id, text, box, source: { detector } };
}

test("native conflict audit detects duplicate and contained text in overlapping boxes", () => {
  const pairs = findDuplicateTextPairs([
    textBox("generic-label", "业务认知", { x: 60, y: 160, w: 80, h: 24 }, "structured-case-matrix-semantic-node-text"),
    textBox("special-label", "业务认知", { x: 48, y: 150, w: 108, h: 52 }, "temporary-answer-workflow-native-text"),
    textBox("fragment", "与经验", { x: 184, y: 178, w: 60, h: 22 }, "structured-case-matrix-semantic-node-text"),
    textBox("full-cell", "强依赖产品经理个人记忆\n与经验", { x: 182, y: 150, w: 216, h: 52 }, "temporary-answer-workflow-native-text")
  ]);

  assert.equal(pairs.length, 2);
  assert.deepEqual(pairs.map((pair) => pair.relation).sort(), ["contained-normalized-text", "same-normalized-text"]);
});

test("native conflict audit ignores repeated labels that do not overlap", () => {
  const pairs = findDuplicateTextPairs([
    textBox("left", "输入", { x: 10, y: 10, w: 50, h: 20 }),
    textBox("right", "输入", { x: 500, y: 10, w: 50, h: 20 })
  ]);

  assert.equal(pairs.length, 0);
});

test("native conflict audit reports unresolved ownership and recorded resolved drops", () => {
  const profile = summarizeNativeObjectConflicts({
    pages: [{
      pageIndex: 2,
      source: { nativeOwnershipArbitration: { droppedShapeCount: 4, droppedTextBoxCount: 2 } },
      shapes: [
        { id: "owner", box: { x: 80, y: 100, w: 600, h: 300 }, source: { detector: "temporary-answer-workflow-native-cell" } },
        { id: "generic", box: { x: 100, y: 120, w: 300, h: 2 }, source: { detector: "visual-atom-native-connector" } }
      ],
      textBoxes: []
    }]
  });

  assert.equal(profile.unresolvedOwnershipConflictCount, 1);
  assert.equal(profile.resolvedDroppedShapeCount, 4);
  assert.equal(profile.resolvedDroppedTextBoxCount, 2);
  assert.equal(profile.pagesWithUnresolvedConflicts, 1);
});

test("native conflict audit safely handles invalid IR boundaries", () => {
  assert.deepEqual(summarizeNativeObjectConflicts(null), {
    provider: "native-object-conflict-audit-v1",
    pages: 0,
    unresolvedOwnershipConflictCount: 0,
    duplicateTextPairCount: 0,
    resolvedDroppedShapeCount: 0,
    resolvedDroppedTextBoxCount: 0,
    pagesWithUnresolvedConflicts: 0,
    unresolvedConflictCount: 0,
    pagesDetail: []
  });
});

test("quality gate can fail explicitly on unresolved native object conflicts", () => {
  const relaxed = summarizeQualityGateStatus({
    summary: { rejected: 0 },
    nativeObjectConflictProfile: { unresolvedConflictCount: 2, duplicateTextPairCount: 1 }
  });
  const strict = summarizeQualityGateStatus({
    summary: { rejected: 0 },
    nativeObjectConflictProfile: { unresolvedConflictCount: 2, duplicateTextPairCount: 1 },
    requireNoNativeObjectConflicts: true
  });

  assert.equal(relaxed.passed, true);
  assert.equal(relaxed.nativeObjectConflicts, 2);
  assert.equal(strict.passed, false);
  assert.ok(strict.failures.includes("native-object-conflicts"));
});
