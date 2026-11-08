"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { admit, diagnosticFor } = require("../scripts/lib/direct-scene-contract");
const { classifyTestFile } = require("../scripts/test-suites");

function fixture() {
  return { background: "#ffffff", complete: true, omissions: [], regions: [["r", [0, 0, 1000, 1000], 2, 1, [0]]],
    objects: [["a", "r", "container", [0, 0, 100, 100], [["rect", [0, 0, 100, 100], "#ffffff", "#000000", 1, "solid", null]]],
      ["b", "r", "container", [200, 0, 100, 100], [["rect", [200, 0, 100, 100], "#ffffff", "#000000", 1, "solid", null]]]],
    edges: [["e", "r", "a", "b", [[100, 50], [200, 50]], "#000000", 1, "solid", "forward"]] };
}
function rejection(value, count = 1) {
  try { admit(value, count); } catch (error) {
    assert(error instanceof TypeError);
    assert.equal(error.message, "DIRECT_SCENE_CONTRACT");
    const diagnostic = diagnosticFor(error);
    assert.deepEqual(Object.keys(diagnostic).sort(), ["code", "path", "reason"]);
    assert.match(diagnostic.path, /^\$(?:\.(?:objects|regions|edges|omissions|complete|background))?(?:\[\d+\])*$/);
    return diagnostic;
  }
  assert.fail("Invalid proposal was accepted");
}

test("normal proposals preserve normalized output, ownership and input immutability", () => {
  const input = fixture(), before = structuredClone(input), output = admit(input, 1);
  assert.equal(output.complete, true);
  assert.equal(output.totalParts, 2);
  assert.equal(output.labelCoverage, 1);
  assert.equal(output.inventory, true);
  assert.deepEqual(output.plan, { background: input.background, regions: input.regions, objects: input.objects, edges: input.edges });
  assert.deepEqual(input, before);
  output.plan.objects[0][3][0] = 5;
  assert.deepEqual(input, before);
  assert.equal(classifyTestFile(__filename), "unit");
});

test("every rejection reports only a fixed reason and an index-based schema path", () => {
  const cases = [
    [(p) => { p.extra = "private-token"; }, "$", "root_keys"],
    [(p) => { p.complete = "private-token"; }, "$.complete", "boolean_required"],
    [(p) => { p.background = "none"; }, "$.background", "background_required"],
    [(p) => { p.omissions = ["private\ncontent"]; }, "$.omissions[0]", "invalid_omission"],
    [(p) => { p.regions[0].pop(); }, "$.regions[0]", "tuple_length"],
    [(p) => { p.regions[0][2] = 1.5; }, "$.regions[0][2]", "integer_required"],
    [(p) => { p.regions[0][4].push(0); }, "$.regions[0][4][1]", "duplicate_label"],
    [(p) => { p.objects.push(p.objects[0]); }, "$.objects[2][0]", "duplicate_id"],
    [(p) => { p.objects[0][0] = "private-token?"; }, "$.objects[0][0]", "invalid_id"],
    [(p) => { p.objects[0][1] = "private-token"; }, "$.objects[0][1]", "unknown_region"],
    [(p) => { p.objects[0][2] = "private-token"; }, "$.objects[0][2]", "invalid_kind"],
    [(p) => { p.objects[0][3][0] = -1; }, "$.objects[0][3][0]", "number_range"],
    [(p) => { p.objects[0][3][2] = 0; }, "$.objects[0][3]", "invalid_box"],
    [(p) => { p.objects[0][4] = []; }, "$.objects[0][4]", "parts_required"],
    [(p) => { p.objects[0][4][0][0] = "private-token"; }, "$.objects[0][4][0][0]", "invalid_part_type"],
    [(p) => { p.objects[0][4][0][1][2] = 101; }, "$.objects[0][4][0][1]", "part_outside_object"],
    [(p) => { p.objects[0][4][0][2] = "url(private-token)"; }, "$.objects[0][4][0][2]", "invalid_color"],
    [(p) => { p.objects[0][4][0][5] = "private-token"; }, "$.objects[0][4][0][5]", "invalid_dash"],
    [(p) => { p.objects[0][4][0][6] = []; }, "$.objects[0][4][0][6]", "unexpected_path"],
    [(p) => { p.objects[0][4][0][0] = "freeform"; p.objects[0][4][0][6] = [[9]]; }, "$.objects[0][4][0][6]", "invalid_freeform"],
    [(p) => { p.edges[0][2] = "private-token"; }, "$.edges[0]", "invalid_endpoints"],
    [(p) => { p.edges[0][4] = []; }, "$.edges[0][4]", "points_required"],
    [(p) => { p.edges[0][4] = [[1, 1], [1, 1]]; }, "$.edges[0][4][1]", "degenerate_segment"],
    [(p) => { p.edges[0][5] = "none"; }, "$.edges[0][5]", "stroke_required"],
    [(p) => { p.edges[0][8] = "private-token"; }, "$.edges[0][8]", "invalid_arrow"],
    [(p) => { p.objects = Array(97).fill(p.objects[0]); }, "$.objects", "list_limit_or_type"]
  ];
  for (const [mutate, path, reason] of cases) {
    const input = fixture(); mutate(input);
    const diagnostic = rejection(input);
    assert.deepEqual(diagnostic, { code: "DIRECT_SCENE_CONTRACT", path, reason });
    assert(!JSON.stringify(diagnostic).includes("private"));
  }
});

test("empty and incomplete proposals retain the existing incomplete verdict", () => {
  for (const mutate of [(p) => { p.complete = false; }, (p) => { p.omissions = ["unrepresented unit"]; },
    (p) => { p.regions[0][2] = 3; }, (p) => { p.regions[0][4] = []; }]) {
    const input = fixture(); mutate(input); assert.equal(admit(input, 1).complete, false);
  }
  assert.equal(admit({ background: "#ffffff", complete: true, omissions: [], regions: [], objects: [], edges: [] }, 0).complete, false);
  for (const value of [null, "", [], {}]) rejection(value);
  for (const count of [-1, 513, NaN, "1"]) assert.equal(rejection(fixture(), count).reason, "invalid_label_count");
});

test("hostile, sparse, extreme and executable input fails without exposing values or running hooks", () => {
  let invoked = 0;
  const accessor = fixture(); Object.defineProperty(accessor, "background", { get() { invoked++; throw Error("private-token"); }, enumerable: true });
  const hook = fixture(); hook.toJSON = () => { invoked++; throw Error("private-token"); };
  const cyclic = fixture(); cyclic.objects = cyclic;
  const sparse = fixture(); delete sparse.objects[0];
  const huge = fixture(); huge.omissions = ["x".repeat(1048577)];
  let deep = {}; const nested = deep; for (let i = 0; i < 20; i++) { deep.next = {}; deep = deep.next; }
  for (const input of [accessor, hook, cyclic, sparse, huge, nested, new Date(), { [Symbol("private-token")]: 1 }, { __proto__: { private: true } }]) {
    assert(!JSON.stringify(rejection(input)).includes("private"));
  }
  assert.equal(invoked, 0);
  assert.equal(diagnosticFor(new TypeError("private-token")), null);
  assert.equal(diagnosticFor({ diagnostic: { path: "private-token" } }), null);
  const freeform = fixture(); freeform.objects[0][4][0][0] = "freeform";
  freeform.objects[0][4][0][6] = [[0, 0, 0], [1, 1, 1], [4]];
  assert.equal(admit(freeform, 1).complete, true);
});
