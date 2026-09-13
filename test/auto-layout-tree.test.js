"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveAutoLayout } = require("../packages/slideclone-core/auto-layout-tree");

test("resolveAutoLayout lays out single item at bounds", () => {
  const item = { type: "item", id: "single", payload: { label: "Hero" } };
  const bounds = { x: 50, y: 100, w: 400, h: 300 };
  const result = resolveAutoLayout(item, bounds);

  assert.equal(result.items.length, 1);
  assert.equal(result.containers.length, 0);
  assert.deepEqual(result.items[0], {
    id: "single",
    type: "item",
    x: 50,
    y: 100,
    w: 400,
    h: 300,
    payload: { label: "Hero" }
  });
});

test("resolveAutoLayout distributes flex items horizontally with gap and padding", () => {
  const container = {
    type: "container",
    id: "row",
    direction: "horizontal",
    gap: 10,
    padding: { top: 20, right: 20, bottom: 20, left: 20 },
    children: [
      { type: "item", id: "item1", flex: 1 },
      { type: "item", id: "item2", flex: 2 },
      { type: "item", id: "item3", flex: 1 }
    ]
  };

  // Bounds w = 360, padding left+right = 40 => innerW = 320
  // Gaps = 2 * 10 = 20 => available for flex = 300
  // Flex sum = 4 => flex 1 = 75, flex 2 = 150
  // Bounds h = 200, padding top+bottom = 40 => innerH = 160
  const bounds = { x: 0, y: 0, w: 360, h: 200 };
  const result = resolveAutoLayout(container, bounds);

  assert.equal(result.items.length, 3);
  assert.equal(result.containers.length, 1);

  // item 1
  assert.equal(result.items[0].x, 20);
  assert.equal(result.items[0].y, 20);
  assert.equal(result.items[0].w, 75);
  assert.equal(result.items[0].h, 160);

  // item 2: x = 20 + 75 + 10 = 105
  assert.equal(result.items[1].x, 105);
  assert.equal(result.items[1].y, 20);
  assert.equal(result.items[1].w, 150);
  assert.equal(result.items[1].h, 160);

  // item 3: x = 105 + 150 + 10 = 265
  assert.equal(result.items[2].x, 265);
  assert.equal(result.items[2].y, 20);
  assert.equal(result.items[2].w, 75);
  assert.equal(result.items[2].h, 160);
});

test("resolveAutoLayout lays out vertical container with fixed items and space-between", () => {
  const container = {
    type: "container",
    id: "col",
    direction: "vertical",
    justifyContent: "space-between",
    children: [
      { type: "item", id: "header", height: 30 },
      { type: "item", id: "body", height: 50 },
      { type: "item", id: "footer", height: 20 }
    ]
  };

  // Bounds h = 200, items total height = 100 => unallocated = 100
  // space-between across 3 items => 2 gaps => 50 each
  const bounds = { x: 10, y: 10, w: 100, h: 200 };
  const result = resolveAutoLayout(container, bounds);

  assert.equal(result.items.length, 3);
  assert.equal(result.items[0].y, 10);
  assert.equal(result.items[0].h, 30);

  // item 1 y = 10 + 30 + 50 = 90
  assert.equal(result.items[1].y, 90);
  assert.equal(result.items[1].h, 50);

  // item 2 y = 90 + 50 + 50 = 190
  assert.equal(result.items[2].y, 190);
  assert.equal(result.items[2].h, 20);
});

test("resolveAutoLayout supports nested layout trees", () => {
  const root = {
    type: "container",
    id: "root",
    direction: "horizontal",
    gap: 20,
    children: [
      {
        type: "container",
        id: "col1",
        direction: "vertical",
        flex: 1,
        gap: 10,
        children: [
          { type: "item", id: "card1_a", flex: 1 },
          { type: "item", id: "card1_b", flex: 1 }
        ]
      },
      {
        type: "container",
        id: "col2",
        direction: "vertical",
        flex: 1,
        children: [
          { type: "item", id: "card2_main", flex: 1 }
        ]
      }
    ]
  };

  const bounds = { x: 0, y: 0, w: 420, h: 300 };
  const result = resolveAutoLayout(root, bounds);

  assert.equal(result.items.length, 3);
  assert.equal(result.containers.length, 3); // root, col1, col2

  // col1 w = (420 - 20) / 2 = 200, x = 0
  // col2 w = 200, x = 220
  const card1A = result.items.find((i) => i.id === "card1_a");
  const card2Main = result.items.find((i) => i.id === "card2_main");

  assert.ok(card1A);
  assert.ok(card2Main);
  assert.equal(card1A.w, 200);
  assert.equal(card1A.x, 0);
  assert.equal(card2Main.w, 200);
  assert.equal(card2Main.x, 220);
});

test("resolveAutoLayout handles defensive error paths", () => {
  assert.throws(() => resolveAutoLayout(null, { x: 0, y: 0, w: 100, h: 100 }), /layout node must be an object/);
  assert.throws(() => resolveAutoLayout({}, null), /bounds must be an object/);
  assert.throws(() => resolveAutoLayout({}, { x: 0, y: 0, w: NaN, h: 100 }), /bounds\.w must be a finite number/);
  assert.throws(() => resolveAutoLayout({}, { x: 0, y: 0, w: -1, h: 100 }), /bounds\.w must be a number between 0/);
  assert.throws(() => resolveAutoLayout({}, { x: null, y: 0, w: 100, h: 100 }), /bounds\.x must be a finite number/);
  assert.throws(() => resolveAutoLayout({ padding: { top: "" }, children: [{ type: "item" }] }, { x: 0, y: 0, w: 100, h: 100 }), /padding\.top must be a finite number/);

  // Depth limit protection
  let deep = { type: "item", id: "leaf" };
  for (let i = 0; i < 25; i += 1) {
    deep = { type: "container", children: [deep] };
  }
  assert.throws(() => resolveAutoLayout(deep, { x: 0, y: 0, w: 100, h: 100 }), /maximum layout nesting depth/);
});

test("resolveAutoLayout rejects invalid explicit layout fields", () => {
  const bounds = { x: 0, y: 0, w: 100, h: 100 };

  assert.throws(() => resolveAutoLayout({ type: "unknown" }, bounds), /node\.type must be one of/);
  assert.throws(() => resolveAutoLayout({ id: "" }, bounds), /node\.id must not be empty/);
  assert.throws(() => resolveAutoLayout({ id: "row\nprivate-token" }, bounds), /node\.id must be a single-line string/);
  assert.throws(() => resolveAutoLayout({ direction: "diagonal", children: [{ type: "item" }] }, bounds), /direction must be one of/);
  assert.throws(() => resolveAutoLayout({ alignItems: "baseline", children: [{ type: "item" }] }, bounds), /alignItems must be one of/);
  assert.throws(() => resolveAutoLayout({ justifyContent: "evenly", children: [{ type: "item" }] }, bounds), /justifyContent must be one of/);
  assert.throws(() => resolveAutoLayout({ children: {} }, bounds), /node\.children must be an array/);
  assert.throws(() => resolveAutoLayout({ gap: -1, children: [{ type: "item" }] }, bounds), /gap must be a number between 0/);
  assert.throws(() => resolveAutoLayout({ padding: -1, children: [{ type: "item" }] }, bounds), /padding must be a number between 0/);
  assert.throws(() => resolveAutoLayout({ children: [{ type: "item", flex: -1 }] }, bounds), /child\[0\]\.flex must be a number between 0/);
  assert.throws(() => resolveAutoLayout({ children: [{ type: "item", width: -1 }] }, bounds), /child\[0\]\.width must be a number between 0/);
});
