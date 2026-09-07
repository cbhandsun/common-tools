"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const test = require("node:test");
const { validateDeckIr } = require("../packages/slideclone-core/team-worker");

function deck(bindings) {
  const page = {
    pageIndex: 0,
    textBoxes: [], shapes: [], images: [], tables: [], charts: [], icons: []
  };
  if (bindings !== undefined) page.intent = { templatePlaceholderBindings: bindings };
  return {
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [page]
  };
}

function binding(overrides = {}) {
  return { objectId: "title-1", collection: "textBoxes", placeholderType: "title", placeholderIndex: 0, ...overrides };
}

function admit(bindings) {
  return validateDeckIr(deck(bindings), os.tmpdir());
}

test("Deck IR admits builder-compatible template placeholder bindings", () => {
  assert.equal(admit(undefined).pages, 1);
  assert.equal(admit(null).pages, 1);
  assert.equal(admit([]).pages, 1);
  const maximum = Array.from({length:128}, (_, index) => binding({objectId:`object-${index}`, placeholderIndex:65535-index}));
  const before = structuredClone(maximum);
  assert.equal(admit(maximum).pages, 1);
  assert.deepEqual(maximum, before);
  assert.equal(admit([
    binding(),
    binding({ objectId: "image-1", collection: "images", placeholderType: " PIC ", placeholderIndex: 1, role: null }),
    binding({ objectId: "table-1", collection: "tables", placeholderType: "tbl", placeholderIndex: 2 }),
    binding({ objectId: "chart-1", collection: "charts", placeholderType: "ChArT", placeholderIndex: 3 })
  ]).pages, 1);
});

test("Deck IR rejects malformed template placeholder bindings before builder deserialization", () => {
  const invalid = [
    binding({ objectId: "" }),
    binding({ objectId: "   " }),
    binding({ objectId: "x".repeat(257) }),
    binding({ collection: "Shapes" }),
    binding({ collection: null }),
    binding({ placeholderType: "unknown" }),
    binding({ placeholderType: "  " }),
    binding({ placeholderType: null }),
    binding({ placeholderIndex: -1 }),
    binding({ placeholderIndex: 65536 }),
    binding({ placeholderIndex: null })
  ];
  for (const value of invalid) assert.throws(() => admit([value]), /template placeholder binding is invalid/);
  assert.throws(() => admit(Array.from({ length: 129 }, (_, index) => binding({ objectId: `object-${index}`, placeholderIndex: index }))), /data collection is invalid/);
});

test("Deck IR applies the builder's raw template binding uniqueness keys without leaking input", () => {
  assert.throws(() => admit([binding(), binding({ placeholderType: "body", placeholderIndex: 1 })]), /template placeholder binding is invalid/);
  assert.throws(() => admit([binding(), binding({ objectId: "body-1" })]), /template placeholder binding is invalid/);
  assert.equal(admit([binding(), binding({ objectId: "body-1", placeholderType: " TITLE ", placeholderIndex: 0 })]).pages, 1);

  const privateValue = "private-binding-value";
  assert.throws(() => admit([binding({ objectId: privateValue.repeat(20) })]), error => error.message === "editable deck template placeholder binding is invalid" && !error.message.includes(privateValue));
});
