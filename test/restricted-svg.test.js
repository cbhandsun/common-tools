"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { expandRestrictedSvgGraphics, parseRestrictedSvg, RestrictedSvgError } = require("../skills/pd-hifi-slideclone/scripts/lib/restricted-svg");

test("restricted SVG parses a closed geometry subset into normalized DrawingML-ready shapes", () => {
  const result = parseRestrictedSvg(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect id="card" x="5" y="5" width="40" height="30" rx="4" fill="#FFFFFF" stroke="#112233" stroke-width="2"/>
      <circle id="dot" cx="75" cy="20" r="10" fill="#2F80ED"/>
      <path id="wave" d="M 10 70 C 25 40, 50 100, 90 60 Q 95 55 98 70 Z" fill="none" stroke="#FF0000"/>
      <polygon id="triangle" points="10,90 30,60 50,90" fill="#00AA55"/>
    </svg>
  `, { idPrefix: "graphic" });
  assert.deepEqual(result.viewBox, { x: 0, y: 0, width: 100, height: 100 });
  assert.deepEqual(result.elements.map((item) => item.type), ["roundrect", "ellipse", "freeform", "freeform"]);
  assert.equal(result.elements[2].style.freeformSegments[1].type, "cubicBezTo");
  assert.equal(result.elements[2].style.freeformSegments.at(-1).type, "close");
  assert.deepEqual(result.elements[3].style.freeformSegments.at(-1), { type: "close", points: [] });
});

test("restricted SVG supports relative, horizontal, vertical, and quadratic path commands", () => {
  const result = parseRestrictedSvg(`<svg viewBox="0 0 20 20"><path d="m 1 1 h 5 v 5 l -2 2 q 2 2 4 0 z" fill="none" stroke="#000000"/></svg>`);
  const segments = result.elements[0].style.freeformSegments;
  assert.deepEqual(segments.map((item) => item.type), ["moveTo", "lnTo", "lnTo", "lnTo", "quadBezTo", "close"]);
  assert.deepEqual(segments[1].points[0], { x: 0.3, y: 0.05 });
});

test("restricted SVG rejects active content, external references, CSS, entities, nesting, arcs, and out-of-viewBox geometry", () => {
  const malicious = [
    `<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///secret">]><svg viewBox="0 0 1 1"><path d="M0 0L1 1"/></svg>`,
    `<svg viewBox="0 0 1 1"><script/></svg>`,
    `<svg viewBox="0 0 1 1"><image href="https://example.invalid/x.png"/></svg>`,
    `<svg viewBox="0 0 1 1"><path style="fill:red" d="M0 0L1 1"/></svg>`,
    `<svg viewBox="0 0 1 1"><g><path d="M0 0L1 1"/></g></svg>`,
    `<svg viewBox="0 0 10 10"><path d="M0 0 A5 5 0 0 1 10 10"/></svg>`,
    `<svg viewBox="0 0 10 10"><line x1="0" y1="0" x2="11" y2="1"/></svg>`,
    `<svg viewBox="0 0 1 1"><path d="M0 0L1 1" fill="url(javascript:alert(1))"/></svg>`
  ];
  for (const value of malicious) assert.throws(() => parseRestrictedSvg(value), RestrictedSvgError);
});

test("restricted SVG expansion replaces the carrier with native elements and traceable hashes", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "restricted-svg-"));
  try {
    fs.writeFileSync(path.join(directory, "graphic.svg"), `<svg viewBox="0 0 100 50"><rect id="left" x="0" y="0" width="40" height="50" fill="#112233"/><line id="edge" x1="40" y1="25" x2="100" y2="25" stroke="#FFFFFF" stroke-width="2"/></svg>`);
    const input = { pages: [{ shapes: [{ id: "carrier", type: "source_graphic", assetPath: "graphic.svg", box: { x: 100, y: 50, w: 400, h: 200 }, source: { confidence: 1 } }], icons: [] }] };
    const output = expandRestrictedSvgGraphics(input, { baseDir: directory });
    assert.equal(input.pages[0].shapes.length, 1);
    assert.equal(output.pages[0].shapes.length, 2);
    assert.deepEqual(output.pages[0].shapes[0].box, { x: 100, y: 50, w: 160, h: 200 });
    assert.equal(output.pages[0].shapes[1].style.strokeWidthPt, 8);
    assert.match(output.pages[0].shapes[0].source.svgSha256, /^[a-f0-9]{64}$/);
    assert.equal(output.pages[0].shapes[0].source.sourceGraphicId, "carrier");
    assert.equal(output.pages[0].shapes[0].source.reconstruction.realization, "native_shape");
    assert.equal(output.pages[0].shapes[0].assetPath, undefined);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("restricted SVG expansion contains asset reads to the IR directory by default", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "restricted-svg-root-"));
  const sibling = fs.mkdtempSync(path.join(os.tmpdir(), "restricted-svg-outside-"));
  try {
    const outside = path.join(sibling, "outside.svg");
    fs.writeFileSync(outside, `<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>`);
    const input = { pages: [{ shapes: [{ id: "carrier", type: "source_graphic", assetPath: outside, box: { x: 0, y: 0, w: 1, h: 1 } }], icons: [] }] };
    assert.throws(() => expandRestrictedSvgGraphics(input, { baseDir: root }), /must stay within the IR directory/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(sibling, { recursive: true, force: true });
  }
});

test("restricted SVG rejects duplicate element ids and collisions with existing IR layers", () => {
  assert.throws(() => parseRestrictedSvg(`<svg viewBox="0 0 2 1"><rect id="same" width="1" height="1"/><rect id="same" x="1" width="1" height="1"/></svg>`), /duplicated/);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "restricted-svg-id-"));
  try {
    fs.writeFileSync(path.join(directory, "graphic.svg"), `<svg viewBox="0 0 1 1"><rect id="existing" width="1" height="1"/></svg>`);
    const input = { pages: [{ shapes: [{ id: "existing", type: "rect", box: { x: 0, y: 0, w: 1, h: 1 } }, { id: "carrier", type: "source_graphic", assetPath: "graphic.svg", box: { x: 0, y: 0, w: 1, h: 1 } }], icons: [] }] };
    assert.throws(() => expandRestrictedSvgGraphics(input, { baseDir: directory }), /duplicate element id existing/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
