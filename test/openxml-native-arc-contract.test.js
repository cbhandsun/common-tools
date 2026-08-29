"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildOpenXmlDecksSync } = require("../skills/pd-hifi-slideclone/scripts/adapters/pptx-openxml-dotnet");
const { readZipEntryText } = require("../skills/pd-hifi-slideclone/scripts/lib/pptx-zip");

test("OpenXML builder keeps fixed-cycle arrows attached to native arc geometry", { timeout: 60_000 }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-native-arc-"));
  const irFile = path.join(root, "deck.ir.json");
  const outFile = path.join(root, "deck.pptx");
  fs.writeFileSync(irFile, JSON.stringify({
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      background: { fill: "#FFFFFF" },
      shapes: [{
        id: "fixed-cycle-native-arc",
        type: "arc",
        box: { x: 360, y: 160, w: 180, h: 180 },
        style: { shapeType: "arc", fill: "none", stroke: "#2563EB", strokeWidthPt: 2.1, adjustments: [15, 145], endArrow: "triangle" },
      }],
      textBoxes: [], images: [], tables: [], charts: [],
    }],
  }));
  buildOpenXmlDecksSync([{ irFile, outFile }], {
    skillRoot: path.join(__dirname, "..", "skills", "pd-hifi-slideclone"),
    config: { openXmlBuilder: { cache: false } },
  });
  const xml = readZipEntryText(outFile, "ppt/slides/slide1.xml");
  const arcXml = xml.slice(xml.indexOf('name="fixed-cycle-native-arc"'));
  assert.match(arcXml, /<a:prstGeom[^>]+prst="arc"/);
  assert.match(arcXml, /<a:gd name="adj1" fmla="val 900000"/);
  assert.match(arcXml, /<a:gd name="adj2" fmla="val 8700000"/);
  assert.match(arcXml, /<a:tailEnd type="triangle"/);
});
