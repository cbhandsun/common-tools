"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  applyResidualClaims,
  collectCandidateClaims,
  migrateLegacyResidualOwnership,
  recordResidualDropDecision,
  resolveResidualDropDecision,
  shouldDropResidual,
  syncCandidateResidualOwnership,
  validateResidualOwnership
} = require("../skills/pd-hifi-slideclone/scripts/lib/residual-ownership");

test("residual ownership synchronizes candidate evidence without losing layer metadata", () => {
  const images = [{ id: "source-1", source: { layer: { role: "graphic" }, preserved: true } }];
  const candidates = [{
    id: "source-1",
    box: { x: 10, y: 20, w: 100, h: 80 },
    source: { networkDiagramObjectified: true, layer: { detector: "network" } }
  }];
  assert.equal(syncCandidateResidualOwnership(images, candidates, {
    ownerFamily: "network-native",
    objectifiedFlags: ["networkDiagramObjectified"],
    dropResidual: true
  }), true);
  assert.equal(images[0].source.preserved, true);
  assert.deepEqual(images[0].source.layer, { role: "graphic", detector: "network" });
  assert.equal(images[0].source.dropErasedResidualAfterNativeRebuild, true);
  assert.deepEqual(validateResidualOwnership(images[0].source.residualOwnership), { ok: true, errors: [] });
});

test("legacy residual flags migrate once into named ownership before splitting", () => {
  const images = [{
    id: "network",
    box: { x: 1, y: 2, w: 30, h: 40 },
    source: { networkDiagramObjectified: true, dropErasedResidualAfterNativeRebuild: true }
  }];
  assert.equal(migrateLegacyResidualOwnership(images), 1);
  assert.deepEqual(images[0].source.residualOwnership.owners, ["network-native"]);
  assert.equal(shouldDropResidual(images[0]), true);
  delete images[0].source.dropErasedResidualAfterNativeRebuild;
  assert.equal(shouldDropResidual(images[0]), true);
});

test("residual ownership supports empty, unmatched, and cumulative claims", () => {
  const images = [{ id: "same", source: {} }];
  assert.equal(syncCandidateResidualOwnership(images, [], { objectifiedFlags: ["done"] }), false);
  assert.equal(syncCandidateResidualOwnership(images, [{ id: "same", source: {} }], { objectifiedFlags: ["done"] }), false);
  assert.equal(applyResidualClaims(images, collectCandidateClaims([
    { id: "same", source: { done: true } }
  ], { ownerFamily: "first", objectifiedFlags: ["done"] })), true);
  assert.equal(applyResidualClaims(images, collectCandidateClaims([
    { id: "same", source: { second: true } }
  ], { ownerFamily: "second", objectifiedFlags: ["second"] })), true);
  assert.deepEqual(images[0].source.residualOwnership.owners, ["first", "second"]);
});

test("residual ownership rejects malformed and unsafe claim boundaries", () => {
  const claims = collectCandidateClaims([
    { id: "../../escape", source: { done: true } },
    { id: "valid", box: { x: 0, y: 0, w: Infinity, h: 2 }, source: { done: true } }
  ], { ownerFamily: "owner with spaces", objectifiedFlags: ["done", "bad flag"] });
  assert.equal(claims.length, 1);
  assert.equal(claims[0].ownerFamily, "legacy-native-rebuilder");
  assert.equal(claims[0].box, null);
  assert.equal(validateResidualOwnership({}).ok, false);
  assert.equal(syncCandidateResidualOwnership(null, [], {}), false);
});

test("residual drop policy records one reason-coded owner decision", () => {
  const decision = resolveResidualDropDecision([
    { matched: false, owner: "ignored", reasonCode: "residual.ignored" },
    { matched: true, owner: "visual-atom", reasonCode: "residual.native-visual-atom-covered" },
    { matched: true, owner: "table-zone", reasonCode: "residual.lower-priority" }
  ]);
  assert.deepEqual(decision, {
    contractVersion: "1.0",
    dropResidual: true,
    owner: "visual-atom",
    reasonCode: "residual.native-visual-atom-covered"
  });
  const image = { id: "residual", box: { x: 1, y: 2, w: 3, h: 4 }, source: {} };
  assert.equal(recordResidualDropDecision(image, decision), true);
  assert.equal(image.source.residualSplitDropped, true);
  assert.equal(image.source.residualOwnership.dropResidual, true);
  assert.deepEqual(image.source.residualOwnership.owners, ["visual-atom"]);
  assert.deepEqual(image.source.residualOwnership.reasonCodes, ["residual.native-visual-atom-covered"]);
});

test("residual drop policy safely handles empty and malformed decisions", () => {
  assert.deepEqual(resolveResidualDropDecision(), {
    contractVersion: "1.0",
    dropResidual: false,
    owner: null,
    reasonCode: null
  });
  assert.equal(recordResidualDropDecision({}, {}), false);
  const image = { source: {} };
  const sanitized = resolveResidualDropDecision([{ matched: true, owner: "bad owner", reasonCode: "bad reason" }]);
  assert.equal(sanitized.owner, "residual-policy");
  assert.equal(sanitized.reasonCode, "residual.drop-policy-matched");
  assert.equal(recordResidualDropDecision(image, sanitized), true);
});
