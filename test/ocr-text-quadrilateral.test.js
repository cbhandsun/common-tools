"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { admitOcrPolygon, projectOcrPolygon, projectOcrTextBox, rotatedTextEnvelope } = require("../packages/slideclone-core/ocr-text-quadrilateral");
const { admitOcrResult } = require("../packages/slideclone-core/ocr-result-admission");
const { boundedOcrSourceDeck } = require("../packages/slideclone-core/ocr-source-deck");
const { visibleTextBoxes } = require("../packages/slideclone-native-engine/scripts/lib/native-rebuild-visible-text");
const { fitHighConfidenceSingleLineOcrToEvidence } = require("../packages/slideclone-core/text-box-micro-adjust");
const { residualEraseObjects } = require("../packages/slideclone-core/team-native-rebuild");
const { normalizeLines } = require("../packages/slideclone-core/team-paddleocr-profile");

const dimensions = { widthPx: 960, heightPx: 720 };
function fixture(rotation = -15) {
  const angle = rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const polygon = [[-50, -10], [50, -10], [50, 10], [-50, 10]].map(([x, y]) => [200 + x * cos - y * sin, 150 + x * sin + y * cos]);
  const xs = polygon.map(point => point[0]), ys = polygon.map(point => point[1]);
  const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  return { text: "Editable rotated label", confidence: 0.99, box, polygon };
}
function close(actual, expected) { assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} != ${expected}`); }
function deck(line) { return boundedOcrSourceDeck({ metadata: { dimensions }, ocr: { lines: [line] }, sourceImage: "assets/source.png" }); }

test("Paddle polygons survive admission and yield native editable text with intrinsic font height and rotation", () => {
  for (const angle of [-25, -10, 10, 25, 90]) {
    const input = fixture(angle), original = structuredClone(input);
    const normalized = normalizeLines([{ text: input.text, confidence: input.confidence, polygon: input.polygon }], dimensions);
    const admitted = admitOcrResult(normalized, dimensions);
    const ir = deck(admitted.lines[0]), source = ir.pages[0].textBoxes[0];
    close(source.font.sizePt, 14.4);
    assert.deepEqual(source.source.evidenceBox, input.box);
    const native = visibleTextBoxes([source], null, ir.slideSize)[0];
    assert.equal(native.text, input.text);
    close(native.rotation, angle);
    close(native.box.w, 100); close(native.box.h, 20);
    assert.equal(native.source.editable, true);
    assert.equal(native.source.ocrQuadrilateralProjected, true);
    assert.equal(fitHighConfidenceSingleLineOcrToEvidence([native])[0], native);
    const erasure = residualEraseObjects({ textBoxes: [native] })[0];
    for (const key of ["x", "y", "w", "h"]) close(erasure.box[key], input.box[key]);
    assert.equal(erasure.rotation, 0);
    assert.deepEqual(input, original);
  }
});

test("missing polygons and horizontal geometry retain existing axis-aligned behavior", () => {
  assert.equal(admitOcrPolygon(undefined, dimensions, fixture().box), undefined);
  assert.deepEqual(admitOcrResult({ lines: [] }, dimensions), { lines: [] });
  const legacy = fixture(0); delete legacy.polygon;
  const ir = deck(legacy), text = ir.pages[0].textBoxes[0];
  assert.equal(text.source.ocrPolygonPt, undefined);
  assert.equal(projectOcrTextBox(text), text);
  const horizontal = deck(fixture(0)).pages[0].textBoxes[0];
  assert.equal(projectOcrTextBox(horizontal), horizontal);
  assert.equal(rotatedTextEnvelope(horizontal), null);
  assert.equal(projectOcrPolygon(undefined), null);
});

test("source snapshots are immutable and stale geometry or moved owners cannot be projected", () => {
  const input = fixture(), admitted = admitOcrResult({ lines: [input] }, dimensions);
  input.polygon[0][0]++;
  assert.notEqual(admitted.lines[0].polygon[0][0], input.polygon[0][0]);
  assert.ok(Object.isFrozen(admitted.lines[0].polygon));
  assert.ok(Object.isFrozen(admitted.lines[0].polygon[0]));
  assert.throws(() => admitOcrResult({ lines: [input] }, dimensions), /stale/);
  const text = deck(fixture()).pages[0].textBoxes[0];
  const moved = { ...text, box: { ...text.box, x: text.box.x + 2 } };
  assert.equal(projectOcrTextBox(moved), moved);
  const stale = structuredClone(text); stale.source.ocrPolygonPt[0][0]++;
  assert.throws(() => projectOcrTextBox(stale), /stale/);
});

test("perspective, crossed, degenerate and excessive polygons never authorize native rotation", () => {
  assert.equal(projectOcrPolygon([[10, 10], [100, 10], [70, 90], [40, 90]]), null);
  assert.equal(projectOcrPolygon([[10, 10], [100, 50], [10, 50], [100, 10]]), null);
  assert.equal(projectOcrPolygon([[10, 10], [10, 10], [10, 10], [10, 10]]), null);
  const line = fixture();
  for (const polygon of [null, [], new Array(4), Array.from({ length: 17 }, () => [1, 1]),
    [[-1, 1], [1, 1], [1, 2], [-1, 2]], [[1, 1], [961, 1], [961, 10], [1, 10]],
    [[NaN, 1], [1, 1], [1, 2], [0, 2]]]) {
    assert.throws(() => admitOcrPolygon(polygon, dimensions, line.box), TypeError);
  }
  assert.throws(() => admitOcrPolygon(line.polygon, { widthPx: 40000, heightPx: 1 }, line.box), TypeError);
  assert.throws(() => rotatedTextEnvelope({ rotation: 10, box: { x: 0, y: 0, w: -1, h: 1 } }), TypeError);
});

test("polygon accessors, proxies, sparse arrays and coercion are rejected without executing input", () => {
  let invoked = 0;
  const line = fixture(), polygon = structuredClone(line.polygon);
  Object.defineProperty(polygon[0], "0", { get() { invoked++; return 1; } });
  const proxy = new Proxy(line.polygon, { get() { invoked++; return undefined; } });
  for (const input of [polygon, proxy]) assert.throws(() => admitOcrPolygon(input, dimensions, line.box), TypeError);
  const coercion = { valueOf() { invoked++; return 1; } };
  const invalid = structuredClone(line.polygon); invalid[0][0] = coercion;
  assert.throws(() => admitOcrPolygon(invalid, dimensions, line.box), TypeError);
  const accessor = { ...line, get polygon() { invoked++; return line.polygon; } };
  assert.throws(() => admitOcrResult({ lines: [accessor] }, dimensions), TypeError);
  assert.equal(invoked, 0);
});
