"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { MAX_ADMITTED_SHAPES, runSemanticRebuildTransaction } = require("../packages/slideclone-core/archetypes/semantic-rebuild-transaction");

function pageFixture() {
  return {
    shapes: [{ id: "original-shape", source: { nested: { retained: true } } }],
    images: [{ id: "original-image", source: { tags: ["source"] } }],
    source: { semanticNativeStructure: { profile: "fixture" } },
    intent: { primarySemanticStructureNative: false }
  };
}

test("semantic rebuild transaction publishes an admitted draft in stage order", async () => {
  const page = pageFixture();
  const before = structuredClone(page);
  const stages = [];
  const result = await runSemanticRebuildTransaction({
    page,
    rebuild: ({ page: draft }) => { stages.push("rebuild"); draft.source.semanticNativeStructure.rebuilt = true; return { matched: true, addedShapes: 1 }; },
    refine: ({ page: draft }) => { stages.push("refine"); draft.images.push({ id: "draft-image" }); return { matched: true }; },
    connect: ({ page: draft }) => { stages.push("connect"); draft.shapes.push({ id: "draft-link" }); return { matched: true, added: 1 }; },
    admit: ({ page: draft }) => { stages.push("admit"); return { shapes: [...draft.shapes, { id: "admitted" }], evidence: { rejected: 0 } }; },
    isCancellationRequested: () => false
  });

  assert.deepEqual(stages, ["rebuild", "refine", "connect", "admit"]);
  assert.equal(result.status, "published");
  assert.equal(result.published, true);
  assert.notEqual(result.page, page);
  assert.deepEqual(page, before);
  assert.deepEqual(result.page.shapes.map((shape) => shape.id), ["original-shape", "draft-link", "admitted"]);
  assert.deepEqual(result.admissionEvidence, { rejected: 0 });
});

test("semantic rebuild transaction keeps the original page for unmatched and rejected drafts", async () => {
  for (const mode of ["unmatched", "rejected"]) {
    const page = pageFixture();
    const before = structuredClone(page);
    const calls = [];
    const result = await runSemanticRebuildTransaction({
      page,
      rebuild: ({ page: draft }) => {
        calls.push("rebuild");
        draft.source.semanticNativeStructure.leaked = mode;
        draft.shapes[0].source.nested.retained = false;
        return { matched: mode !== "unmatched", addedShapes: 1 };
      },
      refine: ({ page: draft }) => { calls.push("refine"); draft.images.length = 0; return { matched: true }; },
      connect: () => { calls.push("connect"); return { matched: true }; },
      admit: ({ page: draft }) => {
        calls.push("admit");
        draft.shapes.push({ id: "rejected-draft-shape" });
        return { shapes: draft.shapes, evidence: { rejected: 1 } };
      }
    });
    assert.equal(result.status, mode);
    assert.equal(result.published, false);
    assert.equal(result.page, page);
    assert.deepEqual(page, before);
    assert.deepEqual(calls, mode === "unmatched" ? ["rebuild"] : ["rebuild", "refine", "connect", "admit"]);
  }
});

test("semantic rebuild transaction rejects malformed or oversized admission output", async () => {
  const oversized = Array.from({ length: MAX_ADMITTED_SHAPES + 1 }, (_, index) => ({ id: `shape-${index}` }));
  const invalid = [
    {},
    { shapes: null, evidence: { rejected: 0 } },
    { shapes: [], evidence: null },
    { shapes: [null], evidence: { rejected: 0 } },
    { shapes: [], evidence: { rejected: -1 } },
    { shapes: [], evidence: { rejected: 0.5 } },
    { shapes: [], evidence: { rejected: "0" } },
    { shapes: [], evidence: { rejected: MAX_ADMITTED_SHAPES + 1 } },
    { shapes: oversized, evidence: { rejected: 0 } }
  ];
  for (const admission of invalid) {
    const page = pageFixture();
    const before = structuredClone(page);
    await assert.rejects(runSemanticRebuildTransaction({
      page,
      rebuild: ({ page: draft }) => { draft.shapes.length = 0; return { matched: true }; },
      admit: () => admission
    }), /admission/u);
    assert.deepEqual(page, before);
  }
  const oversizedPage = pageFixture();
  oversizedPage.shapes = oversized;
  await assert.rejects(runSemanticRebuildTransaction({ page: oversizedPage, rebuild: () => ({ matched: true }) }), /clone volume/u);
});

test("semantic rebuild transaction accepts the empty-shape admission boundary", async () => {
  const page = pageFixture();
  const result = await runSemanticRebuildTransaction({
    page,
    rebuild: () => ({ matched: true }),
    admit: () => ({ shapes: [], evidence: { rejected: 0 } })
  });
  assert.equal(result.published, true);
  assert.deepEqual(result.page.shapes, []);
  assert.deepEqual(page, pageFixture());
});

test("semantic rebuild transaction propagates stage failures without publishing", async () => {
  const page = pageFixture();
  const before = structuredClone(page);
  const failure = new Error("bounded stage failure");
  await assert.rejects(runSemanticRebuildTransaction({
    page,
    rebuild: ({ page: draft }) => { draft.images.length = 0; return { matched: true }; },
    refine: () => { throw failure; }
  }), (error) => error === failure);
  assert.deepEqual(page, before);
});

test("semantic rebuild transaction cancels between stages and validates cancellation results", async () => {
  const page = pageFixture();
  const before = structuredClone(page);
  let checks = 0;
  const calls = [];
  await assert.rejects(runSemanticRebuildTransaction({
    page,
    rebuild: ({ page: draft }) => { calls.push("rebuild"); draft.images.length = 0; return { matched: true }; },
    refine: () => { calls.push("refine"); return { matched: true }; },
    connect: () => { calls.push("connect"); return { matched: true }; },
    isCancellationRequested: () => ++checks >= 3
  }), /cancelled/u);
  assert.deepEqual(calls, ["rebuild", "refine"]);
  assert.deepEqual(page, before);
  await assert.rejects(runSemanticRebuildTransaction({ page, rebuild: () => ({ matched: true }), isCancellationRequested: () => "no" }), /cancellation result/u);
  await assert.rejects(runSemanticRebuildTransaction({ page, rebuild: () => ({ matched: true }), isCancellationRequested: () => { throw new Error("private content"); } }), (error) => error.message === "semantic rebuild cancellation could not be verified" && !error.message.includes("private"));
});
