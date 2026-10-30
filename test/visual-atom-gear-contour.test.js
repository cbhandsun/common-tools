"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { looksLikeGear } = require("../packages/slideclone-core/scene-plan/visual-atom-shape-recognition");
const { foregroundComponents } = require("../packages/slideclone-core/scene-plan/visual-atom-components");
const { extractVisualAtoms } = require("../packages/slideclone-core/scene-plan/visual-atom-extractor");
const { blankImage, fillGear, fillEllipse, fillRect } = require("./helpers/visual-atoms-fixtures");
const captured = require("./fixtures/visual-atom-gear-badge-contours.json");
const { gearContourHasTeeth } = require("../packages/slideclone-core/scene-plan/visual-atom-gear-contour");

test("source number-badge silhouettes are not gears despite their holes and pixel roughness", () => {
  for (const component of captured.components) {
    assert.equal(looksLikeGear(component), false);
  }
});

test("actual teeth retain native gear recognition at small and large raster sizes", () => {
  for (const size of [32, 48, 72, 132]) {
    const image = blankImage(220, 220, "#ffffff");
    fillGear(image, 30, 30, size, "#64748b");
    const region = { x: 0, y: 0, w: 220, h: 220 };
    const component = foregroundComponents(image, region, [255, 255, 255], []).sort((a, b) => b.pixelCount - a.pixelCount)[0];
    assert.equal(looksLikeGear(component), true, `size ${size}`);
  }
});

test("gear extraction retains the existing mixed-diagram native gear behavior", () => {
  const image = blankImage(460, 260, "#ffffff");
  fillGear(image, 82, 48, 132, "#64748b");
  fillRect(image, 292, 96, 104, 44, "#27ae60");
  assert.ok(extractVisualAtoms(image, { x: 0, y: 0, w: 460, h: 260 }, { widthPt: 460, heightPt: 260 })
    .some(atom => atom.kind === "native-gear-candidate"));
});

test("smooth annuli preserve their outer silhouette regardless of central holes", () => {
  for (const size of [32, 48, 72, 132]) {
    const image = blankImage(220, 220, "#ffffff");
    fillEllipse(image, 30, 30, size, size, "#64748b");
    fillEllipse(image, 30 + size * .28, 30 + size * .28, size * .44, size * .44, "#ffffff");
    const components = foregroundComponents(image, { x: 0, y: 0, w: 220, h: 220 }, [255, 255, 255], []);
    assert.ok(components.length > 0);
    assert.ok(components.every(component => !looksLikeGear(component)));
  }
});

function profiles() {
  const image = blankImage(100, 100, "#ffffff");
  fillGear(image, 20, 20, 48, "#64748b");
  const component = foregroundComponents(image, { x: 0, y: 0, w: 100, h: 100 }, [255, 255, 255], [])[0];
  return { rows: component.rowProfile, columns: component.colProfile };
}

test("contour evidence requires opposing notches in both axes and preserves its input", () => {
  const { rows, columns } = profiles(), before = structuredClone({ rows, columns });
  assert.equal(gearContourHasTeeth(rows, columns), true);
  for (const key of ["minX", "maxX"]) {
    assert.equal(gearContourHasTeeth(rows.map(row => ({ ...row, [key]: key === "minX" ? 20 : 70 })), columns), false);
  }
  for (const key of ["minY", "maxY"]) {
    assert.equal(gearContourHasTeeth(rows, columns.map(col => ({ ...col, [key]: key === "minY" ? 20 : 70 }))), false);
  }
  assert.deepEqual({ rows, columns }, before);
});

test("contour evidence rejects empty, partial, unordered and invalid numeric scan lines", () => {
  const { rows, columns } = profiles();
  for (const invalid of [null, undefined, {}, [], [rows[0]], new Array(16385), rows.slice().reverse(),
    rows.slice(1).map((row, i) => ({ ...row, y: row.y + (i > 3 ? 1 : 0) })),
    rows.map((row, i) => i ? row : { ...row, minX: Infinity }),
    rows.map((row, i) => i ? row : { ...row, maxX: -1 }),
    rows.map((row, i) => i ? row : { ...row, count: "5" }),
    rows.map((row, i) => i ? row : { ...row, count: 16385 }),
    rows.map((row, i) => i ? row : { ...row, minX: .5 }),
    rows.map((row, i) => i ? row : { ...row, maxX: row.minX - 1 })]) {
    assert.equal(gearContourHasTeeth(invalid, columns), false);
    assert.equal(gearContourHasTeeth(rows, invalid), false);
  }
});

test("contour evidence never invokes accessors, proxies or inherited coordinate properties", () => {
  const { rows, columns } = profiles();
  const badRows = rows.slice();
  let calls = 0;
  Object.defineProperty(badRows, "0", { get() { calls++; throw new Error("array getter"); } });
  assert.equal(gearContourHasTeeth(badRows, columns), false);
  const badRow = { ...rows[0], get minX() { calls++; throw new Error("row getter"); } };
  assert.equal(gearContourHasTeeth([badRow, ...rows.slice(1)], columns), false);
  const inherited = Object.create(rows[0]);
  assert.equal(gearContourHasTeeth([inherited, ...rows.slice(1)], columns), false);
  const proxy = new Proxy(rows, { getOwnPropertyDescriptor() { calls++; throw new Error("proxy trap"); } });
  assert.equal(gearContourHasTeeth(proxy, columns), false);
  const rowProxy = new Proxy(rows[0], { getPrototypeOf() { calls++; throw new Error("row trap"); } });
  assert.equal(gearContourHasTeeth([rowProxy, ...rows.slice(1)], columns), false);
  const revoked = Proxy.revocable(rows, {}); revoked.revoke();
  assert.equal(gearContourHasTeeth(revoked.proxy, columns), false);
  assert.equal(calls, 0);
});

test("contour work is bounded at the supported source profile size", () => {
  const rows = Array.from({ length: 16384 }, (_, i) => ({ y: i, count: 2,
    minX: i % 3 === 1 ? 1 : 0, maxX: i % 3 === 1 ? 8 : 9 }));
  const columns = rows.map(row => ({ x: row.y, count: 2, minY: row.minX, maxY: row.maxX }));
  assert.equal(gearContourHasTeeth(rows, columns), true);
  assert.equal(gearContourHasTeeth([...rows, { ...rows[0], y: 16384 }], columns), false);
});
