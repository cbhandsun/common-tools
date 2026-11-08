"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createMinimalDeckIr, runBuilder, invokeBuilder } = require("./helpers/openxml-contract-fixtures");
const { readZipEntry } = require("../packages/ooxml-core/pptx-inventory");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-shadow-scale-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const deck = createMinimalDeckIr("Editable");
  deck.pages[0].shapes = [{ id: "card", type: "rect", box: { x: 100, y: 100, w: 336, h: 114 }, style: {
    fill: "#FFF7F4", stroke: "none", shadow: { color: "#FD5809", alpha: 0.7, blurPt: 19, distancePt: 3, angleDeg: 90 }
  } }];
  const ir = path.join(root, "deck.json"), out = path.join(root, "deck.pptx");
  const save = () => fs.writeFileSync(ir, JSON.stringify(deck));
  const build = () => { save(); runBuilder(["--ir", ir, "--out", out]); return readZipEntry(out, "ppt/slides/slide1.xml").toString("utf8"); };
  return { deck, ir, out, build, save, shadow: deck.pages[0].shapes[0].style.shadow };
}

test("actual writer contracts only the native shadow and preserves default XML", { timeout: 60000 }, t => {
  const { deck, shadow, build } = fixture(t);
  const baseline = build();
  const effect = baseline.match(/<a:outerShdw\b[^>]*>[\s\S]*?<\/a:outerShdw>/u)[0];
  assert.equal(effect, '<a:outerShdw blurRad="241300" dist="38100" dir="5400000" algn="ctr" rotWithShape="0"><a:srgbClr val="FD5809"><a:alpha val="70000" /></a:srgbClr></a:outerShdw>');
  Object.assign(shadow, { scaleX: 0.95238095238, scaleY: 0.87280701754 });
  const scaled = build(), scaledEffect = scaled.match(/<a:outerShdw\b[^>]*>[\s\S]*?<\/a:outerShdw>/u)[0];
  assert.match(scaledEffect, /\bsx="95238"/u);
  assert.match(scaledEffect, /\bsy="87281"/u);
  assert.equal(scaled.replace(scaledEffect, effect), baseline);
  assert.doesNotMatch(scaled, /<p:pic\b/u);
  delete shadow.scaleX; delete shadow.scaleY;
  assert.equal(build(), baseline);
  for (const [axis, value, attribute, expected] of [["scaleX", 0.00001, "sx", 1], ["scaleY", 1, "sy", 100000], ["scaleX", 0.000025, "sx", 3]]) {
    shadow[axis] = value;
    const xml = build();
    assert.ok(xml.includes(`${attribute}="${expected}"`));
    delete shadow[axis];
  }
  deck.pages[0].shapes[0].type = "line";
  shadow.scaleX = 0.95;
  assert.match(build(), /<p:cxnSp\b[\s\S]*?<a:outerShdw\b[^>]*\bsx="95000"/u);
});

test("direct writer rejects invalid scaling and duplicate fields with safe diagnostics", { timeout: 60000 }, t => {
  const { deck, shadow, ir, out, save } = fixture(t);
  const invoke = () => {
    const result = invokeBuilder(["--ir", ir, "--out", out]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Native shadow/u);
    assert.doesNotMatch(result.stderr, /private-token/u);
  };
  for (const key of ["scaleX", "scaleY"]) {
    for (const value of [null, "private-token", false, {}, [], 0, -1, 0.00000999, 1.000001]) {
      shadow[key] = value; save(); invoke();
    }
    shadow[key] = 0.9; save();
    const text = fs.readFileSync(ir, "utf8");
    fs.writeFileSync(ir, text.replace(`"${key}":0.9`, `"${key}":1e9999`)); invoke();
    fs.writeFileSync(ir, text.replace(`"${key}":0.9`, `"${key}":0.9,"${key}":0.9`)); invoke();
    delete shadow[key];
  }
  for (const key of ["ScaleX", "scaley"]) { shadow[key] = 0.9; save(); invoke(); delete shadow[key]; }
  save();
  const text = fs.readFileSync(ir, "utf8");
  fs.writeFileSync(ir, text.replace('"shadow":{', '"Shadow":{')); invoke();
  fs.writeFileSync(ir, text.replace('"shadow":{', '"shadow":{},"shadow":{')); invoke();
  deck.pages[0].shapes[0].style.shadow = "private-token"; save(); invoke();
});
