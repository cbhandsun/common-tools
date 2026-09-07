"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { fixture } = require("./helpers/page-shape-fixture.cjs");
const { createPageShapeFinalizer } = require("../packages/slideclone-core/page-shape-finalizer");

test("shape production preserves source order and replaces semantic guesses in sequence", () => {
  const f = fixture();
  const title = { id: "title" }, kpi = { id: "kpi" }, matrix = { id: "matrix" };
  f.inputs.titleChromeShapes = [title];
  f.inputs.retainedKpiEvidenceShapes = [kpi];
  f.inputs.skillsCapabilityMatrix = { matched: true, shapes: [matrix] };
  f.run();
  assert.deepEqual(f.calls[0].items, [title, kpi]);
  assert.equal(f.calls[0].args[0], f.inputs.slideSize);
  assert.deepEqual(f.page.shapes, [title, kpi, matrix]);
  const chain = { id: "chain" }, landing = { id: "landing" };
  f.inputs.skillChainOrchestration = { matched: true, shapes: [chain] };
  f.inputs.assetLandingTriad = { matched: true, shapes: [landing] };
  f.run();
  assert.deepEqual(f.page.shapes, [landing]);
  assert.equal(f.page.shapes[0], landing);
});

test("late OCR replacement wins after matrix replacement and value-table clearing", () => {
  const f = fixture();
  f.inputs.productBrainCoreValueHybrid.shapes = [{ source: { detector: "product-brain-core-value-native-box" } }];
  f.inputs.traditionalCollaborationBreakdown.shapes = [{ source: { detector: "traditional-collaboration-breakdown-native-box" } }];
  f.inputs.paradigmShiftMatrix = { matched: true, shapes: [{ id: "matrix" }] };
  f.inputs.valueTransformationTable.matched = true;
  const ocr = { id: "ocr" };
  f.inputs.ocrGridTable = { matched: true, shapes: [ocr] };
  const result = f.run();
  assert.deepEqual(f.page.shapes, [ocr]);
  assert.equal(result.productBrainCoreValueHybridActive, true);
  assert.equal(result.traditionalCollaborationBreakdownActive, true);
});

test("generic skeletons retain their output order and obey document ownership", () => {
  const f = fixture();
  const horizontal = { id: "horizontal" }, generic = { id: "generic" }, wms = { id: "wms" };
  f.inputs.horizontalStepChainShapes = [horizontal];
  f.inputs.genericNodeDiagramSkeletonShapes = [generic];
  f.inputs.wmsRouteChainShapes = [wms];
  f.run();
  assert.deepEqual(f.page.shapes, [horizontal, generic, wms]);
  f.inputs.documentVersionGovernanceActive = true;
  f.run();
  assert.deepEqual(f.page.shapes, []);
});

test("shape arbitration is recorded before orthogonal route promotion", () => {
  const f = fixture();
  const owned = { id: "owned" }, promoted = { id: "promoted" };
  const arbitration = { items: [owned], dropped: [{ id: "generic" }], claims: [{}] };
  f.operations.arbitrateNativeObjectOwnership = () => arbitration;
  f.operations.promoteOrthogonalConnectorRoutes = items => { assert.equal(items, arbitration.items); return [promoted]; };
  const result = f.run();
  assert.equal(result.shapeOwnershipArbitration, arbitration);
  assert.deepEqual(f.page.shapes, [promoted]);
});

test("system map fidelity filters generic content and keeps matching chrome references", () => {
  const f = fixture();
  const chrome = { source: { detector: "system-map-fidelity-chrome-title" } };
  f.inputs.systemMapDiagram.shapes = [{ source: { detector: "dense-complex-diagram-native-scaffold-node" } }, { id: "generic" }];
  f.inputs.systemMapFidelityChrome.shapes = [chrome];
  f.inputs.unreadableSystemMapFidelityProtected = true;
  f.run();
  assert.deepEqual(f.page.shapes, [chrome]);
  assert.equal(f.page.shapes[0], chrome);
});

test("shape stage handles empty and large collections and propagates failures", () => {
  const f = fixture();
  assert.equal(f.run().productBrainCoreValueHybridActive, false);
  assert.deepEqual(f.page.shapes, []);
  f.inputs.titleChromeShapes = Array.from({ length: 10000 }, (_, id) => ({ id }));
  f.run();
  assert.equal(f.page.shapes.length, 10000);
  const failure = new Error("controlled shape failure");
  f.operations.sanitizeNativeShapes = () => { throw failure; };
  assert.throws(f.run, error => error === failure);
  assert.throws(() => createPageShapeFinalizer({}), /operations are incomplete/);
});
