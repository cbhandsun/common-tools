"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { buildOpenXmlDecks } = require("../skills/pd-hifi-slideclone/scripts/adapters/pptx-openxml-dotnet");
const {
  buildReconstructionInventory,
  enrichReconstructionContracts,
  validateReconstructionContracts
} = require("../skills/pd-hifi-slideclone/scripts/lib/reconstruction-contract");
const { auditSourceMediaExclusion } = require("../skills/pd-hifi-slideclone/scripts/lib/source-media-exclusion");
const { listZipEntries, readZipEntry } = require("../skills/pd-hifi-slideclone/scripts/lib/pptx-inventory");
const { writePng } = require("../skills/pd-hifi-slideclone/scripts/lib/png");

const skillRoot = path.resolve(__dirname, "..", "skills", "pd-hifi-slideclone");

test("production OpenXML path combines reconstruction contracts, restricted SVG, native charts, and source-media exclusion", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-reconstruction-e2e-"));
  try {
    const sourceImage = path.join(directory, "page.png");
    writeGradientPng(sourceImage);
    fs.writeFileSync(
      path.join(directory, "graphic.svg"),
      '<svg viewBox="0 0 100 100"><rect id="panel" x="5" y="10" width="35" height="50" rx="4" fill="#112233"/><path id="curve" d="M45 80 C55 10 80 10 95 80" fill="none" stroke="#2F80ED" stroke-width="2"/></svg>',
      "utf8"
    );
    const evidence = (x, y, w, h) => ({ pageImage: sourceImage, evidenceBox: { x, y, w, h }, confidence: 0.99, boundaryComplete: true });
    const ir = enrichReconstructionContracts({
      version: "1.0",
      slideSize: { widthPt: 960, heightPt: 540 },
      pages: [{
        pageIndex: 0,
        sourceImage,
        background: { fill: "#FFFFFF" },
        textBoxes: [{ id: "title", text: "Editable reconstruction", box: { x: 40, y: 25, w: 480, h: 40 }, font: { family: "Arial", sizePt: 24, color: "#111111" }, source: evidence(40, 25, 480, 40) }],
        shapes: [{ id: "graphic", type: "source_graphic", assetPath: "graphic.svg", box: { x: 40, y: 100, w: 360, h: 300 }, source: evidence(40, 100, 360, 300) }],
        images: [],
        tables: [],
        charts: [{ id: "sales", type: "column", box: { x: 440, y: 100, w: 460, h: 300 }, categories: ["Q1", "Q2", "Q3"], series: [{ name: "Revenue", values: [12, 18, 25] }], style: { barFill: "#2F80ED", textColor: "#111111" }, source: evidence(440, 100, 460, 300) }],
        icons: []
      }]
    }, { baseDir: directory });
    assert.deepEqual(validateReconstructionContracts(ir), { ok: true, errors: [], warnings: [] });
    assert.equal(buildReconstructionInventory(ir).pages[0].regions.length, 3);

    const irFile = path.join(directory, "deck.ir.json");
    const outFile = path.join(directory, "deck.pptx");
    fs.writeFileSync(irFile, `${JSON.stringify(ir, null, 2)}\n`, "utf8");
    await buildOpenXmlDecks([{ irFile, outFile }], {
      skillRoot,
      configFile: path.join(directory, "slideclone.config.json"),
      config: { openXmlBuilder: { configuration: "Release", retainBuildArtifacts: true } }
    });

    const entries = listZipEntries(outFile).map((entry) => entry.name);
    assert.ok(entries.some((name) => /\/charts\/chart\d+\.xml$/.test(name)), "native ChartPart is missing");
    assert.ok(entries.some((name) => /\/embeddings\//.test(name)), "editable chart workbook is missing");
    assert.equal(entries.some((name) => /^ppt\/media\//.test(name)), false, "source or SVG media leaked into the PPTX");
    const slideXml = readZipEntry(outFile, "ppt/slides/slide1.xml").toString("utf8");
    assert.match(slideXml, /name="panel"/);
    assert.match(slideXml, /name="curve"/);
    assert.match(slideXml, /Editable reconstruction/);
    const sourceAudit = auditSourceMediaExclusion({ ir, pptxFile: outFile, baseDir: directory });
    assert.equal(sourceAudit.passed, true, JSON.stringify(sourceAudit.errors));
    assert.equal(sourceAudit.disallowedMatches, 0);

    const safeIrFile = fs.readdirSync(directory).find((name) => name.startsWith(".openxml-safe-") && name.endsWith("-deck.ir.json"));
    assert.ok(safeIrFile, "retained OpenXML-safe IR is missing");
    const safeIr = JSON.parse(fs.readFileSync(path.join(directory, safeIrFile), "utf8"));
    assert.equal(safeIr.pages[0].shapes.some((shape) => shape.type === "source_graphic"), false);
    assert.match(safeIr.pages[0].charts[0].nativePayload.fallbackSha256, /^[a-f0-9]{64}$/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function writeGradientPng(file) {
  const width = 64;
  const height = 36;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      rgba[offset] = x * 4;
      rgba[offset + 1] = y * 7;
      rgba[offset + 2] = (x + y) * 2;
    }
  }
  writePng(file, { width, height, rgba });
}
