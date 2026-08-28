"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { promoteNativeChartPayload } = require("../skills/pd-hifi-slideclone/scripts/lib/chart-native-payload");
const { readZipEntry } = require("../skills/pd-hifi-slideclone/scripts/lib/pptx-inventory");

const projectFile = path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "dotnet", "OpenXmlDeckBuilder", "OpenXmlDeckBuilder.csproj");

function build(irFile, pptxFile) {
  const result = spawnSync(process.env.DOTNET_BIN || "dotnet", ["run", "--project", projectFile, "--", "--ir", irFile, "--out", pptxFile], { cwd: path.dirname(projectFile), encoding: "utf8", windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("OpenXmlDeckBuilder emits indexed native placeholders for text, pictures, tables, and charts", { timeout: 60_000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-native-placeholder-bindings-"));
  try {
    const irFile = path.join(tmp, "deck.ir.json"); const pptxFile = path.join(tmp, "deck.pptx");
    fs.writeFileSync(path.join(tmp, "pixel.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l8fK8QAAAABJRU5ErkJggg==", "base64"));
    const chart = { id: "bound-chart", type: "column", box: { x: 340, y: 100, w: 220, h: 160 }, style: {}, categories: ["A", "B"], series: [{ name: "Value", values: [1, 2] }] }; chart.nativePayload = promoteNativeChartPayload(chart);
    const textBox = { id: "title", role: "title", text: "Bound title", box: { x: 100, y: 20, w: 400, h: 60 }, font: { family: "Arial", sizePt: 24, weight: "bold", color: "#111111", align: "left", valign: "top", lineHeightMultiple: 1 }, style: {} };
    const bindings = [["title", "textBoxes", "title", 4], ["bound-image", "images", "pic", 5], ["bound-table", "tables", "tbl", 6], ["bound-chart", "charts", "chart", 7]].map(([objectId, collection, placeholderType, placeholderIndex]) => ({ objectId, collection, placeholderType, placeholderIndex }));
    const deck = { version: "1.0", slideSize: { widthPt: 960, heightPt: 540 }, pages: [{ pageIndex: 0, sourceImage: "", background: { fill: "#FFFFFF" }, shapes: [], textBoxes: [textBox], images: [{ id: "bound-image", type: "image", assetPath: "pixel.png", box: { x: 20, y: 100, w: 100, h: 80 }, style: {}, source: {} }], tables: [{ id: "bound-table", type: "table", box: { x: 140, y: 100, w: 180, h: 80 }, style: {}, rows: [["A", "B"], ["1", "2"]] }], charts: [chart], intent: { templatePlaceholderBindings: bindings } }] };
    fs.writeFileSync(irFile, JSON.stringify(deck)); build(irFile, pptxFile);
    const slide = readZipEntry(pptxFile, "ppt/slides/slide1.xml").toString("utf8");
    for (const [name, type, index] of [["title", "title", 4], ["bound-image", "pic", 5], ["bound-table", "tbl", 6], ["bound-chart", "chart", 7]]) {
      const start = slide.indexOf(`name="${name}"`); assert.ok(start >= 0, `expected ${name}`);
      assert.match(slide.slice(start, start + 900), new RegExp(`<p:ph(?=[^>]*type="${type}")(?=[^>]*idx="${index}")[^>]*/>`));
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
