"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { validateDeckPageStructures } = require("../packages/slideclone-core/deck-ir-structure");
const { runBuilder, invokeBuilder, createMinimalDeckIr } = require("./helpers/openxml-contract-fixtures");
const { readZipEntry } = require("../packages/ooxml-core/pptx-inventory");

test("native character spacing admission validates text and run fonts without coercion", () => {
  for (const asRun of [false, true]) {
    const make = value => {
      const deck = createMinimalDeckIr("Editable text");
      const text = deck.pages[0].textBoxes[0];
      if (asRun) text.runs = [{ text: text.text, font: { characterSpacingPt: value } }];
      else text.font.characterSpacingPt = value;
      return deck.pages;
    };
    for (const value of [undefined, null, 0, -12, 12, -0.75, 0.125])
      assert.doesNotThrow(() => validateDeckPageStructures(make(value)));
    for (const value of [-12.01, 12.01, Infinity, NaN, "1", false, {}, []])
      assert.throws(() => validateDeckPageStructures(make(value)), /font number|character spacing/);
    const pages = make(undefined), font = asRun ? pages[0].textBoxes[0].runs[0].font : pages[0].textBoxes[0].font;
    font.CharacterSpacingPt = 1;
    assert.throws(() => validateDeckPageStructures(pages), /casing/);
  }
});

test("builder emits signed native spacing with run overrides and preserves editable text", { timeout: 60000 }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-spacing-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const deck = createMinimalDeckIr("Editable text");
  deck.pages[0].textBoxes[0].font.characterSpacingPt = -0.755;
  deck.pages[0].textBoxes[0].runs = [{ text: "native", font: { characterSpacingPt: 0.125 } }, { text: " inherited" }];
  const ir = path.join(root, "deck.json"), out = path.join(root, "deck.pptx");
  fs.writeFileSync(ir, JSON.stringify(deck));
  runBuilder(["--ir", ir, "--out", out]);
  const xml = readZipEntry(out, "ppt/slides/slide1.xml").toString("utf8");
  assert.match(xml, /<a:rPr\b[^>]*\bspc="13"/);
  assert.match(xml, /<a:rPr\b[^>]*\bspc="-76"/);
  assert.match(xml, /<a:t>native<\/a:t>/);
  assert.match(xml, /<a:t> inherited<\/a:t>/);
  assert.doesNotMatch(xml, /<p:pic\b|<a:custGeom\b/);
  delete deck.pages[0].textBoxes[0].font.characterSpacingPt;
  delete deck.pages[0].textBoxes[0].runs;
  fs.writeFileSync(ir, JSON.stringify(deck));
  runBuilder(["--ir", ir, "--out", out]);
  assert.doesNotMatch(readZipEntry(out, "ppt/slides/slide1.xml").toString("utf8"), /\bspc=/);
});

test("direct builder rejects excessive or malformed native spacing rather than clamping", { timeout: 60000 }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-spacing-invalid-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const value of [-12.01, 12.01, "1", true]) {
    const deck = createMinimalDeckIr("Editable text");
    deck.pages[0].textBoxes[0].font.characterSpacingPt = value;
    const ir = path.join(root, "deck.json"), out = path.join(root, "deck.pptx");
    fs.writeFileSync(ir, JSON.stringify(deck));
    assert.notEqual(invokeBuilder(["--ir", ir, "--out", out]).status, 0);
  }
});
