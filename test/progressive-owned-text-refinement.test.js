"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createProgressiveOwnedTextRefiner } = require("../packages/slideclone-worker-adapter/progressive-owned-text-refinement");
const { ownedTextTargetWindow, OWNED_TEXT_SEARCH_TARGET_LIMIT } = require("../packages/slideclone-core/owned-text-target-window");
const target = index => ({ pageIndex: 0, id: `text-${index}`, textRevision: "a".repeat(64), sourceHash: "b".repeat(64) });
function request(t, baseline) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "owned-windows-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "source.png"); fs.writeFileSync(file, "source-image");
  return { root, sourceImages: [file], baseline };
}

test("no-op and rollback windows cannot starve the next improving target", async t => {
  for (const mode of ["no-op", "rollback"]) {
    const initial = { quality: { passed: false }, mode }, accepted = { quality: { passed: true }, renderedImages: ["fresh.png"] };
    let calls = 0;
    const refine = createProgressiveOwnedTextRefiner(async (input, history, collect) => {
      calls++;
      if (calls === 1) {
        assert.equal(input.baseline, initial); assert.deepEqual(history, []);
        collect([0, 1, 2, 3].map(target)); return initial;
      }
      assert.deepEqual(history, [0, 1, 2, 3].map(target));
      assert.equal(input.baseline, initial); collect([target(4)]); return accepted;
    });
    const result = await refine(request(t, initial));
    assert.deepEqual(result, { ...accepted, ownedTextTargetHistory: [0, 1, 2, 3, 4].map(target) });
    assert.equal(calls, 2);
  }
});
test("each accepted window supplies fresh IR, quality and renders, and total work is bounded", async t => {
  let calls = 0;
  const refine = createProgressiveOwnedTextRefiner(async (input, history, collect) => {
    assert.equal(input.baseline.revision, calls); assert.equal(history.length, calls * 4);
    collect(Array.from({ length: 4 }, (_, i) => target(calls * 4 + i)));
    calls++;
    return { quality: { passed: false }, revision: calls, renderedImages: [`render-${calls}.png`] };
  });
  const result = await refine(request(t, { revision: 0 }));
  assert.equal(calls, 3); assert.equal(result.revision, 3); assert.deepEqual(result.renderedImages, ["render-3.png"]);
});
test("empty windows stop and invalid, repeated or oversized claims fail closed", async t => {
  let calls = 0;
  const original = {};
  assert.equal(await createProgressiveOwnedTextRefiner(async () => { calls++; return original; })(request(t, original)), original);
  assert.equal(calls, 1);
  for (const mode of ["double", "oversized", "repeated", "malformed"]) {
    const refine = createProgressiveOwnedTextRefiner(async (_input, _history, collect) => {
      collect(mode === "oversized" ? [0, 1, 2, 3, 4].map(target) : mode === "malformed" ? {} : [target(0)]);
      if (mode === "double") collect([]);
      return {};
    });
    await assert.rejects(refine(request(t, {})));
  }
  const failure = new Error("provider failed");
  await assert.rejects(createProgressiveOwnedTextRefiner(async () => { throw failure; })(request(t, {})), error => error === failure);
  await assert.rejects(createProgressiveOwnedTextRefiner(async () => ({}))(null), TypeError);
});
test("source drift during verification or between windows rejects the whole run", async t => {
  const input = request(t, {}); let calls = 0;
  const refine = createProgressiveOwnedTextRefiner(async (_input, _history, collect) => {
    calls++; collect([target(calls)]);
    fs.writeFileSync(input.sourceImages[0], "changed-source"); return {};
  });
  await assert.rejects(refine(input), /source changed/u); assert.equal(calls, 1);
});
test("failure or cancellation in later windows propagates and never starts another window", async t => {
  for (const failingWindow of [2, 3]) {
    let calls = 0; const failure = new Error("cancelled provider");
    const refine = createProgressiveOwnedTextRefiner(async (_input, _history, collect) => {
      calls++;
      if (calls === failingWindow) throw failure;
      collect([target(calls)]); return { quality: { passed: false } };
    });
    await assert.rejects(refine(request(t, {})), error => error === failure);
    assert.equal(calls, failingWindow);
  }
});
test("numeric telemetry aggregates accepted and rejected windows without text content", async t => {
  let calls = 0;
  const refine = createProgressiveOwnedTextRefiner(async (_input, _history, collect) => {
    calls++;
    collect([target(calls)], { proposed: 1, changed: calls === 2 ? 1 : 0, rolledBack: calls === 1 ? 1 : 0 });
    return { quality: { passed: calls === 2, metrics: {} } };
  });
  const result = await refine(request(t, {}));
  assert.deepEqual(result.quality.metrics, {
    "native-only-owned-text-refinement-windows": 2, "native-only-owned-text-refinement-probed": 2,
    "native-only-owned-text-refinement-proposed": 2, "native-only-owned-text-refinement-changed": 1,
    "native-only-owned-text-refinement-rolled-back": 1 });
  for (const statistics of [{ proposed: "1", changed: 0, rolledBack: 0 }, { proposed: 0, changed: 1, rolledBack: 0 },
    { proposed: 1, changed: 1, rolledBack: 1 }, { proposed: 2, changed: 0, rolledBack: 0 }]) {
    await assert.rejects(createProgressiveOwnedTextRefiner(async (_input, _history, collect) => {
      collect([target(0)], statistics); return {};
    })(request(t, {})), /statistics/u);
  }
});

test("carried history skips prior no-ops but admits a changed revision without reusing measurements", async t => {
  const ranked = Array.from({ length: 24 }, (_, i) => target(i));
  const seen = [];
  const refine = createProgressiveOwnedTextRefiner(async (input, history, collect) => {
    const next = ownedTextTargetWindow(ranked, history);
    seen.push(next.map(item => item.id)); collect(next);
    return input.baseline;
  });
  const input = request(t, { quality: { passed: false, metrics: {} } });
  const first = await refine(input);
  assert.equal(first.ownedTextTargetHistory.length, 12);
  const second = await refine({ ...input, baseline: first });
  assert.deepEqual(seen.flat(), ranked.map(item => item.id));
  assert.equal(second.ownedTextTargetHistory.length, 24);
  ranked[0] = { ...ranked[0], textRevision: "c".repeat(64) };
  const third = await refine({ ...input, baseline: second });
  assert.deepEqual(seen[6], ["text-0"]);
  assert.equal(third.ownedTextTargetHistory.length, 25);
  assert.equal(third.ownedTextTargetHistory[24].textRevision, "c".repeat(64));
});

test("carried history exhausts the existing search budget and rejects malformed revisions", async t => {
  const history = Array.from({ length: OWNED_TEXT_SEARCH_TARGET_LIMIT }, (_, i) => target(i));
  const refine = createProgressiveOwnedTextRefiner(async () => { throw new Error("exhausted search must not render"); });
  const baseline = { ownedTextTargetHistory: history, quality: { passed: false } };
  const input = request(t, baseline);
  assert.equal(await refine(input), baseline);
  for (const invalid of [new Array(1), [target(0), target(0)], [...history, target(36)], [{ ...target(0), sourceHash: "invalid" }]]) {
    await assert.rejects(refine({ ...input, baseline: { ownedTextTargetHistory: invalid } }), TypeError);
  }
});
