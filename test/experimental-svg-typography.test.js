"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createSvgSceneModel } = require("../packages/slideclone-core/archetypes/experimental-svg-scene");
const { createUniformSvgTypography } = require("../packages/slideclone-core/typography/experimental-svg-typography");
const { createSvgSceneView } = require("../packages/slideclone-core/archetypes/experimental-svg-view");
const { JSDOM } = require("jsdom");
const api = createSvgSceneModel(), typography = createUniformSvgTypography(api);
const options = { family: "Portable Font 3952", regions: [{ id: "panel", box: { x: 0, y: 0, w: 150, h: 300 } }] };
const measure = text => ({ width: [...text].length * 100, height: text.trim() ? 100 : 0 });
function fixture() {
  return api.parseDeck({ slideSize: { widthPt: 200, heightPt: 300 }, pages: [{ shapes: [], textBoxes: [10, 11, 25].map((h, i) => ({
    id: String(i), text: "示例", box: { x: 10, y: i * 40, w: h * 2, h }, font: { family: i ? "Other" : "Original", sizePt: h },
    style: { textWarp: "textPlain" }, positionedRuns: [0, 1].map(n => ({ text: n ? "例" : "示", box: { x: 10 + n * h, y: i * 40, w: h, h } }))
  })) }] });
}
test("uniform typography shares regional body styles, preserves headings and complete editable strings", () => {
  const original = fixture(), before = structuredClone(original), { scene, report } = typography.normalize(original, options, measure);
  assert.deepEqual(original, before);
  assert.deepEqual(scene.objects.map(o => o.text), original.objects.map(o => o.text));
  assert.equal(scene.objects[0].runs[0].font.sizePt, scene.objects[1].runs[0].font.sizePt);
  assert.ok(scene.objects[2].runs[0].font.sizePt > scene.objects[0].runs[0].font.sizePt);
  assert.equal(scene.objects[2].runs[0].font.weight, "bold");
  assert.ok(scene.objects.every(o => !o.fit && o.runs.length === 1 && o.runs[0].font.family === options.family));
  assert.ok(scene.objects.every(o => o.flow));
  assert.equal(report.styles.length, 2);
  assert.deepEqual(api.parseDeck(api.exportDeck(scene)), scene);
  assert.equal(api.editText(scene, "0", "新增 ΩЖ漢字").objects[0].runs[0].font.family, options.family);
});
test("typography handles empty text/pages, overflow and bounded extreme measurements without deforming letters", () => {
  const empty = api.parseDeck({ slideSize: { widthPt: 200, heightPt: 300 }, pages: [{ shapes: [], textBoxes: [] }] });
  assert.equal(typography.normalize(empty, options, measure).report.textObjects, 0);
  const scene = api.editText(fixture(), "0", "");
  assert.equal(typography.normalize(scene, options, measure).scene.objects[0].text, "");
  const wide = api.editText(fixture(), "0", "a".repeat(100));
  const result = typography.normalize(wide, options, measure);
  assert.ok(result.report.overflow.some(o => o.id === "0"));
  assert.ok(result.scene.objects.every(o => o.fit === false));
});
test("typography rejects malformed regions, unsafe families and measurement failures", () => {
  for (const value of [null, {}, { ...options, family: "x';url(y)" }, { ...options, regions: [options.regions[0], options.regions[0]] },
    { ...options, regions: [{ id: "a", box: { x: 0, y: 0, w: Infinity, h: 1 } }] }]) assert.throws(() => typography.normalize(fixture(), value, measure));
  for (const m of [() => null, () => ({ width: NaN, height: 1 }), () => ({ width: 0, height: 0 }), () => { throw new Error("Font unavailable"); }])
    assert.throws(() => typography.normalize(fixture(), options, m));
  assert.throws(() => api.parseDeck({ slideSize: { widthPt: 200, heightPt: 300 }, pages: [{ shapes: [], textBoxes: [{ id: "bad", text: "a", box: { x: 0, y: 0, w: 1, h: 1 }, font: { sizePt: 1 }, style: { textLayout: "unsupported" } }] }] }));
});
test("uniform SVG lines use actual ink baselines with unit scale and preserve two visible arrowheads", () => {
  const dom = new JSDOM('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  try {
    dom.window.SVGElement.prototype.getBBox = () => { throw new Error("Uniform flow must use ink measurement"); };
    const { scene } = typography.normalize(fixture(), options, measure);
    const d = api.exportDeck(scene);
    d.pages[0].shapes.push({ id: "arrow", type: "freeform", box: { x: 1, y: 1, w: 100, h: 100 }, style: { freeformPath: [[0, 0, 0], [2, 0, 1, 1, 0, 1, 1]], stroke: "#000000", strokeWidthPt: 1, startArrow: "triangle", endArrow: "triangle" } });
    const svg = dom.window.document.querySelector("svg");
    createSvgSceneView(dom.window.document, api, () => ({ x: 0, y: -8, width: 20, height: 10 })).draw(svg, api.parseDeck(d));
    assert.equal(svg.querySelectorAll("text").length, 3);
    assert.ok([...svg.querySelectorAll("text")].every(t => t.getAttribute("transform").endsWith("scale(1 1)")));
    assert.equal(svg.querySelectorAll("path[data-arrow-end]").length, 2);
    assert.deepEqual([...svg.querySelectorAll("path[data-arrow-end]")].map(p => p.getAttribute("data-arrow-end")), ["start", "end"]);
  } finally { dom.window.close(); }
});
