"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  cloneBaseDeck,
  discoverBaseDecks,
  discoverRepairDecks,
  mergeDeck,
  pageIndexForRepairPage,
  parseArgs
} = require("../skills/pd-hifi-slideclone/scripts/minimum-unit-gap-repair-merge");

test("minimum unit gap repair merge parses CLI options", () => {
  const args = parseArgs([
    "node",
    "minimum-unit-gap-repair-merge.js",
    "--base-ir-dir",
    "base",
    "--repair-root",
    "repair",
    "--out",
    "out",
    "--only",
    "Deck_A",
    "--repair-only",
    "--skip-pptx",
    "--pptx-engine",
    "openxml",
    "--report-file",
    "report.json"
  ]);

  assert.equal(args.baseIrDir, "base");
  assert.equal(args.repairRoot, "repair");
  assert.equal(args.out, "out");
  assert.equal(args.only, "Deck_A");
  assert.equal(args.repairOnly, true);
  assert.equal(args.skipPptx, true);
  assert.equal(args.pptxEngine, "openxml");
  assert.equal(args.reportFile, "report.json");
});

test("minimum unit gap repair merge discovers base deck IR files and ignores safe temp files", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "minimum-unit-gap-base-discover-"));
  writeJson(path.join(tmp, "Deck_A.native.ir.json"), { pages: [] });
  writeJson(path.join(tmp, ".openxml-safe-Deck_A.native.ir.json"), { pages: [] });
  writeJson(path.join(tmp, "Deck_B.other.json"), { pages: [] });

  const decks = discoverBaseDecks(tmp);

  assert.deepEqual(decks.map((deck) => deck.deck), ["Deck_A"]);
});

test("minimum unit gap repair merge can copy an unchanged base deck", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "minimum-unit-gap-copy-base-"));
  const baseFile = path.join(tmp, "Deck_A.native.ir.json");
  writeJson(baseFile, {
    meta: { source: "base" },
    pages: [page("base-1", 0), page("base-2", 1)]
  });

  const copied = cloneBaseDeck({ baseIrFile: baseFile });

  assert.deepEqual(copied.replacedPages, []);
  assert.equal(copied.ir.pages.length, 2);
  assert.equal(copied.ir.pages[0].marker, "base-1");
  assert.equal(copied.ir.meta.minimumUnitGapRepairSource, null);
  assert.deepEqual(copied.ir.meta.minimumUnitGapRepairReplacedPages, []);
});

test("minimum unit gap repair merge replaces repair pages by original pageIndex", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "minimum-unit-gap-repair-merge-"));
  const baseFile = path.join(tmp, "Deck_A.native.ir.json");
  const repairFile = path.join(tmp, "Deck_A.repair.native.ir.json");
  writeJson(baseFile, {
    meta: { source: "base" },
    pages: [
      page("base-1", 0),
      page("base-2", 1),
      page("base-3", 2)
    ]
  });
  writeJson(repairFile, {
    pages: [
      { ...page("repair-2", 1), shapes: [{ id: "native-shape" }] }
    ]
  });

  const merged = mergeDeck({
    deck: "Deck_A",
    baseIrFile: baseFile,
    repairIrFile: repairFile
  });

  assert.deepEqual(merged.replacedPages, [2]);
  assert.equal(merged.ir.pages.length, 3);
  assert.equal(merged.ir.pages[0].marker, "base-1");
  assert.equal(merged.ir.pages[1].marker, "repair-2");
  assert.equal(merged.ir.pages[1].pageIndex, 1);
  assert.equal(merged.ir.pages[2].marker, "base-3");
  assert.deepEqual(merged.ir.meta.minimumUnitGapRepairReplacedPages, [2]);
});

test("minimum unit gap repair merge discovers deck repair IR files", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "minimum-unit-gap-repair-discover-"));
  fs.mkdirSync(path.join(tmp, "Deck_A"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "Deck_B"), { recursive: true });
  writeJson(path.join(tmp, "Deck_A", "Deck_A.native.ir.json"), { pages: [] });
  writeJson(path.join(tmp, "Deck_B", "not-a-deck.native.ir.json"), { pages: [] });

  const decks = discoverRepairDecks(tmp);

  assert.deepEqual(decks.map((deck) => deck.deck), ["Deck_A"]);
});

test("minimum unit gap repair merge resolves pageIndex from one-based page fields", () => {
  assert.equal(pageIndexForRepairPage({ pageIndex: 4 }), 4);
  assert.equal(pageIndexForRepairPage({ slide: 3 }), 2);
  assert.equal(pageIndexForRepairPage({ page: 2 }), 1);
  assert.equal(pageIndexForRepairPage({}), -1);
});

function page(marker, pageIndex) {
  return {
    marker,
    pageIndex,
    background: { fill: "#fff" },
    shapes: [],
    images: [],
    textBoxes: []
  };
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
