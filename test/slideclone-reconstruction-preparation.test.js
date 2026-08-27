"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { writePng } = require("../skills/pd-hifi-slideclone/scripts/lib/png");
const { prepareReconstructionIrForBuild } = require("../skills/pd-hifi-slideclone/scripts/slideclone");

test("every IR build preparation enriches and validates reconstruction evidence", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-prepare-ir-"));
  try {
    const sourceImage = path.join(directory, "page.png");
    writePng(sourceImage, { width: 8, height: 6, rgba: Buffer.alloc(8 * 6 * 4, 255) });
    const evidenceBox = { x: 20, y: 30, w: 300, h: 50 };
    const raw = {
      version: "1.0",
      slideSize: { widthPt: 960, heightPt: 540 },
      pages: [{
        pageIndex: 0,
        sourceImage,
        textBoxes: [{ id: "title", text: "Prepared", box: evidenceBox, font: { family: "Arial" }, source: { pageImage: sourceImage, evidenceBox, confidence: 0.99 } }],
        shapes: [], images: [], tables: [], charts: [], icons: []
      }]
    };
    const prepared = prepareReconstructionIrForBuild(raw, { irFile: path.join(directory, "deck.polished.1.json") });
    assert.equal(prepared.validation.ok, true, prepared.validation.errors.join("\n"));
    assert.match(prepared.ir.pages[0].reconstruction.canonicalPageSha256, /^[a-f0-9]{64}$/);
    assert.equal(prepared.ir.pages[0].textBoxes[0].source.reconstruction.realization, "native_text");
    assert.equal(prepared.inventory.pages[0].regions.length, 1);

    raw.pages[0].charts.push({
      id: "unknown-data",
      type: "column",
      box: { x: 20, y: 100, w: 300, h: 200 },
      source: { pageImage: sourceImage, evidenceBox: { x: 20, y: 100, w: 300, h: 200 } }
    });
    const invalid = prepareReconstructionIrForBuild(raw, { irFile: path.join(directory, "deck.polished.2.json") });
    assert.equal(invalid.validation.ok, false);
    assert.match(invalid.validation.errors.join("\n"), /manual_required/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
