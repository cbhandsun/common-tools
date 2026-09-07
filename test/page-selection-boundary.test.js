"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { parsePageSelection, planSelectedPages, shouldIncludePage } = require("../skills/pd-hifi-slideclone/scripts/lib/page-selection");

test("page selection rejects malformed empty-set lookalikes instead of selecting every page", () => {
  for (const selection of [{ size: 0 }, [], false, 0, "", new Map(), new Set([-1]), new Set([100000]), new Set(["1"])]) {
    assert.throws(() => shouldIncludePage(selection, {}, 0), /pageSelection/);
    assert.throws(() => planSelectedPages([{}], selection), /pageSelection/);
  }
});

test("page selection never executes object coercion or echoes invalid input", () => {
  let coercions = 0;
  const hostile = { toString() { coercions += 1; return "1"; } };
  assert.throws(() => parsePageSelection(hostile), /page selection/);
  assert.throws(() => parsePageSelection([hostile]), /page selection/);
  assert.equal(coercions, 0);
  assert.throws(() => parsePageSelection("token=fixture-private-content"), (error) => !error.message.includes("fixture-private-content"));
});

test("page selection preserves ordered source planning, reversed ranges, duplicates and numeric inputs", () => {
  assert.deepEqual([...parsePageSelection("3-1,2,5")], [0, 1, 2, 4]);
  assert.deepEqual([...parsePageSelection([" 2 ", 1])], [1, 0]);
  assert.deepEqual([...parsePageSelection(1)], [0]);
  const pages = [{ pageIndex: 0 }, { pageIndex: 9 }, { pageIndex: 2 }];
  const plan = planSelectedPages(pages, new Set([9, 2]));
  assert.deepEqual(plan.map(({ page, pageIndex, selectedPageOrdinal }) => [page === pages[pageIndex], pageIndex, selectedPageOrdinal]), [[true, 1, 0], [true, 2, 1]]);
});

test("page selection accepts intentional emptiness but bounds hostile and extreme inputs", () => {
  for (const value of [null, undefined, "", false, [], " , "]) assert.equal(parsePageSelection(value), null);
  assert.deepEqual(planSelectedPages([], null), []);
  assert.equal(shouldIncludePage(new Set(), {}, 0), true);
  for (const value of ["0", "100001", "1-20000", new Array(10001).fill("1"), "1".repeat(1048577), [Infinity], true]) assert.throws(() => parsePageSelection(value));
  assert.throws(() => planSelectedPages(new Array(100001).fill({}), null), /bounded array/);
});
