"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createEditableSourceArchive } = require("../packages/slideclone-core/team-raw-image-archive");
const { extractProjectArchive } = require("../packages/project-audit-core/team-worker");
const { validatePackage } = require("../packages/slideclone-core/team-worker");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-archive-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "assets"));
  fs.copyFileSync(path.join(__dirname, "../skills/pd-hifi-slideclone/examples/ocr-text-smoke.source.png"), path.join(root, "assets/source.png"));
  const deck = { version: "1.0", slideSize: { widthPt: 960, heightPt: 540 }, pages: [{ pageIndex: 0, source: { pageImage: "assets/source.png" },
    textBoxes: [{ id: "title", text: "Editable component", box: { x: 10, y: 10, w: 200, h: 40 } }],
    shapes: [{ id: "card", type: "rect", box: { x: 10, y: 60, w: 200, h: 80 }, style: { fill: "#DDEEFF" } }], images: [], tables: [], charts: [] }] };
  const inputFile = path.join(root, "layout.json");
  const outputFile = path.join(root, "source.tar.gz");
  const write = () => fs.writeFileSync(inputFile, JSON.stringify(deck));
  write();
  return { root, deck, inputFile, outputFile, write };
}

test("structured source transport preserves native components and includes only referenced assets", t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, "assets/unrelated.png"), "not uploaded");
  fs.writeFileSync(path.join(f.root, "private.txt"), "not uploaded");
  const result = createEditableSourceArchive(f);
  assert.equal(result.kind, "deck-ir");
  assert.equal(result.assets, 1);
  assert.equal(result.pages, 1);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  const out = path.join(f.root, "unpacked"); fs.mkdirSync(out);
  extractProjectArchive(fs.readFileSync(f.outputFile), out);
  assert.equal(validatePackage(out).kind, "deck-ir");
  const recovered = JSON.parse(fs.readFileSync(path.join(out, "deck.json")));
  assert.deepEqual(recovered.pages[0].shapes, f.deck.pages[0].shapes);
  assert.deepEqual(recovered.pages[0].textBoxes, f.deck.pages[0].textBoxes);
  assert.deepEqual(recovered.pages[0].images, []);
  assert.deepEqual(fs.readdirSync(out).sort(), ["assets", "deck.json"]);
  assert.equal(fs.readdirSync(path.join(out, "assets")).length, 1);
  assert.equal(recovered.pages[0].source.pageImage, "assets/item-0001.png");
  assert.throws(() => createEditableSourceArchive(f), /already exists/);
});

test("structured transport rejects absent, partial, excessive and unsafe source references before writing", t => {
  for (const change of [
    f => { f.deck.pages = []; },
    f => { delete f.deck.pages[0].source; },
    f => { f.deck.pages.push({ ...f.deck.pages[0], pageIndex: 1, source: {} }); },
    f => { f.deck.pages = Array.from({ length: 21 }, (_, pageIndex) => ({ ...f.deck.pages[0], pageIndex })); },
    f => { f.deck.pages[0].source.pageImage = "../private.png"; },
    f => { f.deck.pages[0].source.pageImage = "assets/missing.png"; },
    f => { f.deck.pages[0].source.pageImage = "https://example.com/source.png"; },
    f => { f.deck.pages[0].source.pageImage = 12; }
  ]) {
    const f = fixture(t); change(f); f.write();
    assert.throws(() => createEditableSourceArchive(f));
    assert.equal(fs.existsSync(f.outputFile), false);
  }
});

test("structured transport rejects invalid JSON, oversized assets and asset junctions", t => {
  const f = fixture(t);
  fs.writeFileSync(f.inputFile, "{"); assert.throws(() => createEditableSourceArchive(f), /JSON/);
  f.write();
  const image = path.join(f.root, "assets/source.png");
  fs.writeFileSync(image, Buffer.alloc(20 * 1024 * 1024 + 1));
  assert.throws(() => createEditableSourceArchive(f), /limits/);
  const external = fs.mkdtempSync(path.join(os.tmpdir(), "native-external-"));
  t.after(() => fs.rmSync(external, { recursive: true, force: true }));
  fs.writeFileSync(path.join(external, "source.png"), "external");
  fs.symlinkSync(external, path.join(f.root, "assets/linked"), "junction");
  f.deck.pages[0].source.pageImage = "assets/linked/source.png"; f.write();
  assert.throws(() => createEditableSourceArchive(f), /owned|root/);
  assert.equal(fs.existsSync(f.outputFile), false);
});
