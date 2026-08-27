"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { applyReviewPatches, ReviewPatchError } = require("../skills/pd-hifi-slideclone/scripts/lib/review-patch");

function fixture() {
  return {
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      sourceImage: "page.png",
      textBoxes: [{
        id: "title",
        text: "Before",
        box: { x: 10, y: 20, w: 300, h: 50 },
        font: { family: "Arial", sizePt: 30, color: "#111111", align: "left" },
        source: { pageImage: "page.png", evidenceBox: { x: 10, y: 20, w: 300, h: 50 } }
      }],
      shapes: [{
        id: "accent",
        type: "rect",
        box: { x: 10, y: 90, w: 200, h: 8 },
        style: { fill: "#0066CC" },
        source: { pageImage: "page.png", evidenceBox: { x: 10, y: 90, w: 200, h: 8 } }
      }],
      images: [], tables: [], charts: [], icons: []
    }]
  };
}

test("review patches apply allowlisted geometry, text, style, and review fields", () => {
  const input = fixture();
  const result = applyReviewPatches(input, [{
    operationId: "op-1",
    pageIndex: 0,
    collection: "textBoxes",
    elementId: "title",
    changes: {
      box: { x: 42.5, w: 320 },
      text: "After",
      font: { family: "Aptos", sizePt: 32, color: "#123456", align: "center" },
      style: { fill: "none", opacity: 0.8 },
      review: { status: "accepted", note: "Checked" }
    }
  }]);
  assert.equal(input.pages[0].textBoxes[0].text, "Before");
  assert.deepEqual(result.ir.pages[0].textBoxes[0].box, { x: 42.5, y: 20, w: 320, h: 50 });
  assert.equal(result.ir.pages[0].textBoxes[0].text, "After");
  assert.equal(result.ir.pages[0].textBoxes[0].review.status, "accepted");
  assert.deepEqual(result.audit[0].fields, ["box", "font", "review", "style", "text"]);
});

test("review patches reject path and source mutation attempts", () => {
  for (const changes of [{ assetPath: "../../secret" }, { source: { pageImage: "elsewhere.png" } }, { box: { constructor: 1 } }]) {
    assert.throws(() => applyReviewPatches(fixture(), [{ pageIndex: 0, collection: "shapes", elementId: "accent", changes }]), ReviewPatchError);
  }
});

test("review patches reject invalid targets, values, and unsafe text", () => {
  const invalid = [
    { pageIndex: 0, collection: "shapes", elementId: "missing", changes: { box: { x: 1 } } },
    { pageIndex: 0, collection: "shapes", elementId: "accent", changes: { box: { w: 0 } } },
    { pageIndex: 0, collection: "shapes", elementId: "accent", changes: { box: { x: 5000 } } },
    { pageIndex: 0, collection: "shapes", elementId: "accent", changes: { text: "not allowed" } },
    { pageIndex: 0, collection: "shapes", elementId: "accent", changes: { style: { fill: "url(javascript:alert(1))" } } },
    { pageIndex: 0, collection: "textBoxes", elementId: "title", changes: { text: "bad\u0000text" } }
  ];
  for (const patch of invalid) assert.throws(() => applyReviewPatches(fixture(), [patch]), ReviewPatchError);
});

test("review patches reject duplicate operation ids and overlapping targets", () => {
  assert.throws(() => applyReviewPatches(fixture(), [
    { operationId: "duplicate", pageIndex: 0, collection: "shapes", elementId: "accent", changes: { box: { x: 1 } } },
    { operationId: "duplicate", pageIndex: 0, collection: "textBoxes", elementId: "title", changes: { box: { x: 2 } } }
  ]), /duplicate operationId/);
  assert.throws(() => applyReviewPatches(fixture(), [
    { pageIndex: 0, collection: "shapes", elementId: "accent", changes: { box: { x: 1 } } },
    { pageIndex: 0, collection: "shapes", elementId: "accent", changes: { box: { y: 2 } } }
  ]), /duplicate patch target/);
});

test("review patches run the supplied whole-IR validator before returning", () => {
  assert.throws(() => applyReviewPatches(fixture(), [
    { pageIndex: 0, collection: "shapes", elementId: "accent", changes: { box: { x: 1 } } }
  ], { validateIr: () => ({ ok: false, errors: ["regression"] }) }), /patched IR is invalid: regression/);
});
