"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { runBuilder } = require("./helpers/openxml-contract-fixtures");
const { readZipEntry } = require("../packages/ooxml-core/pptx-inventory");

test("native gradient angles wrap without changing direction or emitting invalid DrawingML", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gradient-angle-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const values = [-45, -360, 450, 360, 0, 359.9999999, -0.0000001, Number.MAX_VALUE];
  const expected = values.map(v => Math.round(((v % 360) + 360) % 360 * 60000) % 21600000);
  const deck = { version: "1.0", slideSize: { widthPt: 320, heightPt: 280 }, pages: [{ pageIndex: 0,
    sourceImage: "", background: { fill: "#FFFFFF" }, textBoxes: [], images: [], tables: [], charts: [],
    shapes: values.map((angleDeg, i) => ({ id: `line-${i}`, type: "line", box: { x: 10, y: 10 + 10 * i, w: 200, h: 5 },
      style: { stroke: "#336699", strokeWidthPt: 2, strokeGradient: { type: "linear", angleDeg,
        stops: [{ position: 0, color: "#336699" }, { position: 1, color: "#CC3300" }] } } })) }] };
  const ir = path.join(root, "deck.json"), pptx = path.join(root, "deck.pptx");
  fs.writeFileSync(ir, JSON.stringify(deck)); runBuilder(["--ir", ir, "--out", pptx]);
  const xml = readZipEntry(pptx, "ppt/slides/slide1.xml").toString("utf8");
  const actual = [...xml.matchAll(/<a:lin ang="(\d+)"/gu)].map(match => Number(match[1]));
  assert.deepEqual(actual, expected); assert.ok(actual.every(n => n >= 0 && n < 21600000));
  const { discoverTestFiles } = require("../scripts/test-sharded");
  assert.ok(discoverTestFiles(process.cwd(), "contract").some(f => path.basename(f.file) === path.basename(__filename)));
});
