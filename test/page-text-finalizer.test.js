"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { fixture } = require("./helpers/page-text-fixture.cjs");
const { createPageTextFinalizer } = require("../packages/slideclone-core/page-text-finalizer");

test("final text stage preserves producer order, references and ownership metadata", () => {
  const f = fixture();
  const native = { id: "native" }, diagram = { id: "diagram" }, semantic = { id: "semantic" };
  f.inputs.retainedComponentBackfillFilteredNativeTextBoxes = [native];
  f.inputs.retainedComponentBackfillFilteredDiagramTextBoxes = [diagram];
  f.inputs.skillsCapabilityMatrix = { matched: true, textBoxes: [semantic] };
  let initiallyAnnotated;
  const annotate = f.operations.annotateTextBoxesWithNativeComponentGroups;
  f.operations.annotateTextBoxesWithNativeComponentGroups = (items, ...args) => { initiallyAnnotated = [...items]; return annotate(items, ...args); };
  f.inputs.shapeOwnershipArbitration = { dropped: [{ id: "shape-drop" }], claims: [{}] };
  f.operations.arbitrateNativeObjectOwnership = items => ({ items, dropped: [{ id: "text-drop" }], claims: [{}, {}] });
  assert.equal(f.run(), f.page);
  assert.deepEqual(f.page.textBoxes, [native, diagram, semantic]);
  assert.deepEqual(initiallyAnnotated, [native, diagram], "matched specialist text is appended after initial grouping");
  assert.equal(f.page.textBoxes[0], native);
  assert.equal(f.calls[0].name, "annotateTextBoxesWithNativeComponentGroups");
  assert.equal(f.calls[0].args[0], f.page.shapes);
  assert.deepEqual(f.calls.slice(-2).map(call => call.name), ["normalizeTextBoxFontWeights", "normalizeTriangleTopologyFinalTypography"]);
  assert.deepEqual(f.page.source, { kept: true, nativeOwnershipArbitration: { droppedShapes: [{ id: "shape-drop" }], droppedTextBoxes: [{ id: "text-drop" }], droppedShapeCount: 1, droppedTextBoxCount: 1, claimCount: 3 } });
});

test("specialist overrides precede OCR reinsertion and later component annotation", () => {
  const f = fixture();
  const matrix = { id: "matrix" }, friction = { id: "friction" }, outside = { id: "outside" };
  f.inputs.visualOperationSyncActive = true;
  f.inputs.visualOperationSync.textBoxes = [{ id: "visual" }];
  f.inputs.paradigmShiftMatrix = { matched: true, textBoxes: [matrix] };
  f.inputs.productManagerFrictionNetwork = { matched: true, textBoxes: [friction] };
  f.inputs.ocrGridTable = { matched: true, consumedIds: ["matrix"], outsideTextBoxes: [outside] };
  let beforeOcr;
  f.operations.annotateReviewRiskGateTextComponents = items => { beforeOcr = [...items]; return items; };
  let afterOcr;
  f.operations.annotateTriangleTopologyTextComponents = items => { afterOcr = [...items]; return items; };
  f.run();
  assert.deepEqual(beforeOcr, [matrix, friction]);
  assert.deepEqual(afterOcr, [friction, outside]);
  assert.equal(f.page.textBoxes[1], outside);
});

test("fragmented specialist text replaces normalized duplicates before backfill filtering", () => {
  const f = fixture();
  const specialist = { id: "special", text: "MATCH" }, unrelated = { id: "__proto__", text: "keep" };
  f.inputs.retainedComponentBackfillFilteredNativeTextBoxes = [{ id: "duplicate", text: "match" }, unrelated];
  f.inputs.assetOsFragmentedAssetChainActive = true;
  f.inputs.assetOsFragmentedAssetChain.textBoxes = [specialist];
  let seen;
  f.operations.filterTextBoxesConsumedByComponentTemplateBackfill = items => { seen = [...items]; return items; };
  f.run();
  assert.deepEqual(seen, [unrelated, specialist]);
  assert.equal(f.page.textBoxes[0], unrelated);
});

test("stage handles empty and large internal collections and propagates operation failure", () => {
  const empty = fixture();
  empty.run();
  assert.deepEqual(empty.page.textBoxes, []);
  const large = fixture();
  large.inputs.retainedComponentBackfillFilteredNativeTextBoxes = Array.from({ length: 10000 }, (_, id) => ({ id }));
  large.run();
  assert.equal(large.page.textBoxes.length, 10000);
  assert.equal(large.page.textBoxes[9999], large.inputs.retainedComponentBackfillFilteredNativeTextBoxes[9999]);
  const failed = fixture();
  const error = new Error("controlled stage failure");
  failed.operations.filterPrdAutoGenerationDuplicateTextBoxes = () => { throw error; };
  assert.throws(failed.run, value => value === error);
  assert.equal(failed.calls.some(call => call.name === "normalizeTextBoxFontWeights"), false);
  assert.throws(() => createPageTextFinalizer({}), /operations are incomplete/);
});
