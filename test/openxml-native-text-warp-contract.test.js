"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { validateDeckPageStructures } = require("../packages/slideclone-core/deck-ir-structure");
const { createMinimalDeckIr, runBuilder, invokeBuilder } = require("./helpers/openxml-contract-fixtures");
const { readZipEntry } = require("../packages/ooxml-core/pptx-inventory");

test("native text warp admission accepts only an explicit plain single-line preset", () => {
  const deck = createMinimalDeckIr("Native editable text"), text = deck.pages[0].textBoxes[0];
  assert.doesNotThrow(() => validateDeckPageStructures(deck.pages));
  text.style.textWarp = "textPlain";
  assert.doesNotThrow(() => validateDeckPageStructures(deck.pages));
  for (const value of [null, "", "textWave1", "TEXTPLAIN", false, 1, {}, []]) {
    text.style.textWarp = value;
    assert.throws(() => validateDeckPageStructures(deck.pages), /native text warp/u);
  }
  delete text.style.textWarp; text.style.TextWarp = "textPlain";
  assert.throws(() => validateDeckPageStructures(deck.pages), /casing/u);
});

test("native text warp rejects mixed runs, multiline, wrapping and autofit requests", () => {
  for (const change of [{ text: "one\ntwo" }, { text: "one\rtwo" }, { runs: [] }, { wrap: true },
    { style: { textWarp: "textPlain", wrap: true } }, { style: { textWarp: "textPlain", wrap: "false" } },
    { style: { textWarp: "textPlain", fit: "SHRINK" } }]) {
    const deck = createMinimalDeckIr("Native editable text");
    deck.pages[0].textBoxes[0].style.textWarp = "textPlain";
    Object.assign(deck.pages[0].textBoxes[0], change);
    assert.throws(() => validateDeckPageStructures(deck.pages), /native text warp/u);
  }
});

test("builder retains real editable text in plain native WordArt without pictures or glyph paths", { timeout: 60000 }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-text-warp-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const deck = createMinimalDeckIr("Native editable text"), text = deck.pages[0].textBoxes[0];
  text.style.textWarp = "textPlain";
  const ir = path.join(root, "deck.json"), out = path.join(root, "deck.pptx");
  fs.writeFileSync(ir, JSON.stringify(deck));
  runBuilder(["--ir", ir, "--out", out]);
  const xml = readZipEntry(out, "ppt/slides/slide1.xml").toString("utf8");
  assert.match(xml, /<a:bodyPr\b[^>]*\bfromWordArt="1"/u);
  assert.match(xml, /<a:bodyPr\b[^>]*\bwrap="none"/u);
  assert.match(xml, /<a:prstTxWarp\b[^>]*\bprst="textPlain"/u);
  assert.match(xml, /<a:t>Native editable text<\/a:t>/u);
  assert.doesNotMatch(xml, /<p:pic\b|<a:custGeom\b|<a:normAutofit\b/u);
  delete text.style.textWarp;
  fs.writeFileSync(ir, JSON.stringify(deck)); runBuilder(["--ir", ir, "--out", out]);
  const ordinary = readZipEntry(out, "ppt/slides/slide1.xml").toString("utf8");
  assert.doesNotMatch(ordinary, /fromWordArt=|prstTxWarp/u);
});

test("builder emits text-only component groups with editable members and leaves unrelated text separate", { timeout: 60000 }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-text-only-group-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const deck = createMinimalDeckIr("First"), first = deck.pages[0].textBoxes[0];
  first.source = { nativeComponentGroupId: "editable-line" };
  first.style.textWarp = "textPlain";
  const second = structuredClone(first);
  second.id = "second"; second.text = "Second"; second.box.x += 80;
  delete second.source.nativeComponentGroupId;
  second.style.nativeComponentGroupId = "editable-line";
  const unrelated = structuredClone(first);
  unrelated.id = "unrelated"; unrelated.text = "Separate";
  delete unrelated.source.nativeComponentGroupId;
  deck.pages[0].textBoxes.push(second, unrelated);
  const ir = path.join(root, "deck.json"), out = path.join(root, "deck.pptx");
  fs.writeFileSync(ir, JSON.stringify(deck)); runBuilder(["--ir", ir, "--out", out]);
  const xml = readZipEntry(out, "ppt/slides/slide1.xml").toString("utf8");
  const groups = [...xml.matchAll(/<p:grpSp>[\s\S]*?<\/p:grpSp>/gu)].map(match => match[0]);
  assert.equal(groups.length, 1);
  assert.match(groups[0], /name="editable-line"/u);
  assert.match(groups[0], /<a:t>First<\/a:t>/u);
  assert.match(groups[0], /<a:t>Second<\/a:t>/u);
  assert.doesNotMatch(groups[0], /<a:t>Separate<\/a:t>|<p:pic\b|<a:custGeom\b|<p:ph\b/u);
  for (const content of ["First", "Second", "Separate"]) {
    assert.equal([...xml.matchAll(new RegExp(`<a:t>${content}</a:t>`, "gu"))].length, 1);
  }
  assert.equal((groups[0].match(/<p:sp>/gu) || []).length, 2);
});

test("native group dispatch preserves singleton text and emits mixed groups exactly once", { timeout: 60000 }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-text-group-dispatch-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const deck = createMinimalDeckIr("Singleton"), text = deck.pages[0].textBoxes[0];
  text.source = { nativeComponentGroupId: "line-unit" };
  const ir = path.join(root, "deck.json"), out = path.join(root, "deck.pptx");
  fs.writeFileSync(ir, JSON.stringify(deck)); runBuilder(["--ir", ir, "--out", out]);
  let xml = readZipEntry(out, "ppt/slides/slide1.xml").toString("utf8");
  assert.doesNotMatch(xml, /<p:grpSp>/u);
  assert.match(xml, /<a:t>Singleton<\/a:t>/u);
  deck.pages[0].shapes.push({ id: "panel", type: "rect", box: { x: 0, y: 0, w: 300, h: 80 },
    style: { fill: "#FFFFFF", stroke: "#000000" }, source: { nativeComponentGroupId: "line-unit" } });
  fs.writeFileSync(ir, JSON.stringify(deck)); runBuilder(["--ir", ir, "--out", out]);
  xml = readZipEntry(out, "ppt/slides/slide1.xml").toString("utf8");
  assert.equal((xml.match(/<p:grpSp>/gu) || []).length, 1);
  assert.equal((xml.match(/<a:t>Singleton<\/a:t>/gu) || []).length, 1);
  const group = xml.match(/<p:grpSp>[\s\S]*?<\/p:grpSp>/u)?.[0];
  assert.ok(group);
  assert.equal((group.match(/<p:sp>/gu) || []).length, 2);
});

test("direct native builder fails closed on unsupported, malformed and conflicting warp fields", { timeout: 60000 }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-text-warp-invalid-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const patch of [{ style: { textWarp: null } }, { style: { textWarp: false } }, { style: { textWarp: "textWave1" } },
    { style: { TextWarp: "textPlain" } }, { runs: [] }, { text: "one\ntwo" }, { wrap: true },
    { style: { textWarp: "textPlain", wrap: "false" } }, { style: { textWarp: "textPlain", fit: "shrink" } }]) {
    const deck = createMinimalDeckIr("Native editable text"), text = deck.pages[0].textBoxes[0];
    text.style.textWarp = "textPlain"; Object.assign(text, patch);
    const ir = path.join(root, "deck.json"), out = path.join(root, "deck.pptx");
    fs.writeFileSync(ir, JSON.stringify(deck));
    assert.notEqual(invokeBuilder(["--ir", ir, "--out", out]).status, 0);
  }
});
