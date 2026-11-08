"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createSvgSceneModel } = require("../packages/slideclone-core/archetypes/experimental-svg-scene");
const api = createSvgSceneModel();
const { JSDOM } = require("jsdom");
const { createSvgSceneView } = require("../packages/slideclone-core/archetypes/experimental-svg-view");
function deck() {
  return { slideSize: { widthPt: 960, heightPt: 1280 }, pages: [{ shapes: [
    { id: "node", type: "freeform", box: { x: 10, y: 20, w: 30, h: 40 }, style: { freeformPath: "[[0,0,0],[2,0.2,0.3,0.6,0.7,1,1],[4]]" } },
    { id: "edge", type: "line", box: { x: 40, y: 40, w: 80, h: 0 }, style: { startAnchor: { elementId: "node", side: "right", position: 0.5 } } }
  ], textBoxes: [{ id: "text", text: "文字", box: { x: 1, y: 1, w: 30, h: 20 }, font: { family: "Noto Sans SC", sizePt: 12 } }] }] };
}
test("SVG scene preserves text, cubic curves, bindings and immutable edits", () => {
  const scene = api.parseDeck(deck());
  assert.match(api.pathData(scene.objects[0]), /C/u);
  const changed = api.move(scene, "node", 5, 6, 2);
  assert.deepEqual(api.endpoints(changed, changed.objects[1])[0], { x: 75, y: 66 });
  assert.deepEqual(api.endpoints(scene, scene.objects[1])[0], { x: 40, y: 40 });
  const edited = api.editText(scene, "text", "新增 ΩЖ漢字 709 <script>alert(1)</script>");
  assert.equal(edited.objects[2].runs[0].text, edited.objects[2].text);
  assert.equal(edited.objects[2].fit, false);
  assert.equal(api.editText(scene, "text", "").objects[2].text, "");
  assert.equal(api.editPoint(scene, "node", 1, 0, 0.4, 0.5).objects[0].path[1][1], 0.4);
  assert.equal(scene.objects[0].path[1][1], 0.2);
  assert.deepEqual(api.parseDeck(api.exportDeck(changed)), changed);
});
test("SVG scene admits empty pages and rejects malformed, extreme and unsafe inputs", () => {
  assert.equal(api.parseDeck({ slideSize: { widthPt: 960, heightPt: 1280 }, pages: [{ shapes: [], textBoxes: [] }] }).objects.length, 0);
  for (const v of [null, {}, [], { pages: [] }]) assert.throws(() => api.parseDeck(v));
  for (const mutate of [d => { d.slideSize.widthPt = Infinity; }, d => { d.pages[0].images = [{}]; }, d => { d.pages[0].shapes[0].style.fill = "url(https://example.com)"; }, d => { d.pages[0].textBoxes[0].font.family = "x';url(x)"; }, d => { d.pages[0].shapes[0].style.freeformPath = "[[0,2,0]]"; }, d => { d.pages[0].shapes[1].style.startAnchor.elementId = "missing"; }, d => { d.pages[0].textBoxes[0].id = "node"; }, d => { d.pages[0].shapes[1].style.startArrow = "diamond"; }, d => { d.pages[0].shapes[1].style.connectorType = "curved"; }]) {
    const d = deck(); mutate(d); assert.throws(() => api.parseDeck(d));
  }
  const s = api.parseDeck(deck());
  for (const args of [[NaN, 0, 1], [0, 0, 0], [9000, 0, 1]]) assert.throws(() => api.move(s, "node", ...args));
  assert.throws(() => api.editText(s, "missing", "abc"));
  assert.throws(() => api.editText(s, "text", "a".repeat(4097)));
  assert.throws(() => api.editPoint(s, "node", 1, -1, 0, 0));
  assert.throws(() => api.editPoint(s, "node", 2, 0, 0, 0));
});

function arrowDeck(path, type = "freeform") {
  return { slideSize: { widthPt: 960, heightPt: 1280 }, pages: [{ shapes: [{
    id: "arrow", type, box: { x: 10, y: 20, w: 100, h: 50 },
    style: { stroke: "#000000", strokeWidthPt: 2, startArrow: "triangle", endArrow: "triangle", freeformPath: path }
  }], textBoxes: [] }] };
}

function arrowVertices(arrow) {
  const numbers = arrow.d.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gu).map(Number);
  return { tip: numbers.slice(0, 2), base: [(numbers[2] + numbers[4]) / 2, (numbers[3] + numbers[5]) / 2] };
}

test("SVG arrows follow both ends of line, quadratic and cubic paths and survive export", () => {
  for (const input of [
    arrowDeck([[0, 0, 0], [1, 1, 1]]),
    arrowDeck([[0, 0, 0], [3, 0, 1, 1, 1]]),
    arrowDeck([[0, 0, 0], [2, 0, 1, 1, 0, 1, 1]]),
    arrowDeck(undefined, "line")
  ]) {
    const scene = api.parseDeck(input), arrows = api.arrowPaths(scene, scene.objects[0]);
    assert.deepEqual(arrows.map(a => a.end), ["start", "end"]);
    assert.deepEqual(arrowVertices(arrows[0]).tip, [10, 20]);
    assert.deepEqual(arrowVertices(arrows[1]).tip, [110, 70]);
    assert.deepEqual(api.parseDeck(api.exportDeck(scene)), scene);
    assert.deepEqual(api.arrowPaths(api.parseDeck(api.exportDeck(scene)), scene.objects[0]), arrows);
  }
  const cubic = api.parseDeck(arrowDeck([[0, 0, 0], [2, 0, 1, 1, 0, 1, 1]]));
  const arrows = api.arrowPaths(cubic, cubic.objects[0]);
  assert.deepEqual(arrowVertices(arrows[0]).base, [10, 26]);
  assert.deepEqual(arrowVertices(arrows[1]).base, [110, 64]);
  const quadratic = api.parseDeck(arrowDeck([[0, 0, 0], [3, 0, 1, 1, 1]]));
  assert.deepEqual(arrowVertices(api.arrowPaths(quadratic, quadratic.objects[0])[1]).base, [104, 70]);
});

test("SVG arrow tangents skip repeated controls and point segments without losing endpoints", () => {
  const scene = api.parseDeck(arrowDeck([[0, 0, 0], [1, 0, 0], [2, 0, 0, 0, 1, 1, 1], [3, 1, 1, 1, 1]]));
  const arrows = api.arrowPaths(scene, scene.objects[0]);
  assert.deepEqual(arrowVertices(arrows[0]), { tip: [10, 20], base: [10, 26] });
  assert.deepEqual(arrowVertices(arrows[1]), { tip: [110, 70], base: [104, 70] });
  const input = deck();
  Object.assign(input.pages[0].shapes[1].style, { stroke: "#123456", strokeWidthPt: 100, startArrow: "triangle", endArrow: "triangle" });
  const bound = api.parseDeck(input), moved = api.move(bound, "node", 5, 6, 2);
  assert.deepEqual(arrowVertices(api.arrowPaths(moved, moved.objects[1])[0]).tip, [75, 66]);
  assert.equal(api.arrowPaths(bound, bound.objects[0]).length, 0);
});

test("SVG arrow boundaries reject unsupported or degenerate geometry and invalid edits", () => {
  for (const path of [
    [[0, 0, 0]], [[0, 0, 0], [1, 0, 0]], [[0, 0, 0], [2, 0, 0, 0, 0, 0, 0]],
    [[0, 0, 0], [1, 1, 1], [4]], [[0, 0, 0], [1, 1, 1], [0, 0.5, 0.5], [1, 1, 1]]
  ]) assert.throws(() => api.parseDeck(arrowDeck(path)), /nondegenerate open path/u);
  for (const mutation of [
    d => { d.pages[0].shapes[0].style.strokeWidthPt = 0; },
    d => { d.pages[0].shapes[0].style.stroke = "none"; },
    d => { d.pages[0].shapes[0].style.startArrow = "<script>"; },
    d => { d.pages[0].shapes[0].style.endArrow = null; }
  ]) { const input = arrowDeck([[0, 0, 0], [1, 1, 1]]); mutation(input); assert.throws(() => api.parseDeck(input)); }
  const scene = api.parseDeck(arrowDeck([[0, 0, 0], [1, 1, 1]]));
  assert.throws(() => api.editPoint(scene, "arrow", 1, 0, 0, 0), /nondegenerate open path/u);
  assert.deepEqual(scene.objects[0].path[1], [1, 1, 1]);
  const input = deck();
  Object.assign(input.pages[0].shapes[1].style, { stroke: "#000000", strokeWidthPt: 1, endArrow: "triangle", endAnchor: input.pages[0].shapes[1].style.startAnchor });
  assert.throws(() => api.parseDeck(input), /nondegenerate open path/u);
});
test("SVG view quotes numbered font families and inserts untrusted strings only as text", () => {
  const dom = new JSDOM('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  try {
    dom.window.SVGElement.prototype.getBBox = () => ({ x: 0, y: -12, width: 20, height: 14 });
    const d = deck(); d.pages[0].textBoxes[0].font.family = "CT Browser Source 3952";
    const scene = api.editText(api.parseDeck(d), "text", '<script>alert(1)</script><image href="https://example.com">');
    const svg = dom.window.document.querySelector("svg");
    const counts = createSvgSceneView(dom.window.document, api).draw(svg, scene);
    assert.equal(svg.querySelector("text").getAttribute("font-family"), '"CT Browser Source 3952"');
    assert.equal(svg.querySelector("text").textContent, scene.objects[2].text);
    assert.equal(svg.querySelectorAll("script,image").length, 0);
    assert.equal(counts.objects, 3);
    assert.equal(counts.textRuns, 1);
  } finally { dom.window.close(); }
});
