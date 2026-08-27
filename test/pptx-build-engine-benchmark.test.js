"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildOptionsForEngine,
  collectIrFiles,
  inspectDeckStructure,
  parseArgs,
  resolveEngines,
  safeFileStem,
  summarizeBenchmarkResults
} = require("../skills/pd-hifi-slideclone/scripts/pptx-build-engine-benchmark");
const { buildPptxBatch } = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");

test("pptx build benchmark parses repeated IR inputs safely", () => {
  const args = parseArgs([
    "--ir", "a.native.ir.json",
    "--ir", "b.native.ir.json",
    "--engine", "python,openxml-batch",
    "--max-files", "2"
  ]);

  assert.deepEqual(args.ir, ["a.native.ir.json", "b.native.ir.json"]);
  assert.equal(args.engine, "python,openxml-batch");
  assert.equal(args["max-files"], "2");
});

test("pptx build benchmark resolves supported engines uniquely", () => {
  assert.deepEqual(resolveEngines("python openxml-single openxml-batch python nope"), [
    "python",
    "openxml-single",
    "openxml-batch"
  ]);
  assert.deepEqual(resolveEngines(""), []);
});

test("pptx build benchmark collects explicit and directory IR files", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pptx-build-benchmark-ir-"));
  const first = path.join(tmp, "a.native.ir.json");
  const second = path.join(tmp, "b.ir.json");
  const ignored = path.join(tmp, "ignored.txt");
  const temporarySafeIr = path.join(tmp, ".openxml-safe-a.native.ir.json");
  fs.writeFileSync(first, "{}\n", "utf8");
  fs.writeFileSync(second, "{}\n", "utf8");
  fs.writeFileSync(ignored, "{}\n", "utf8");
  fs.writeFileSync(temporarySafeIr, "{}\n", "utf8");

  const files = collectIrFiles({ ir: first, "ir-dir": tmp });

  assert.deepEqual(files.sort(), [first, second].sort());
});

test("pptx build benchmark maps engine options to buildPptxBatch options", () => {
  assert.deepEqual(buildOptionsForEngine("python", { python: "py.exe" }), {
    "pptx-engine": "python",
    python: "py.exe"
  });
  assert.equal(buildOptionsForEngine("openxml-single", { "openxml-builder-exe": "builder.exe" }).pptxEngine, undefined);
  assert.equal(buildOptionsForEngine("openxml-single", { "openxml-builder-exe": "builder.exe" })["pptx-engine"], "openxml");
  assert.equal(buildOptionsForEngine("openxml-batch", {}).openXmlBatch, true);
});

test("pptx build benchmark summarizes fastest and failed engines", () => {
  const summary = summarizeBenchmarkResults([
    { engine: "python", ok: true, elapsedMs: 30 },
    { engine: "openxml-single", ok: false, elapsedMs: 10 },
    { engine: "openxml-batch", ok: true, elapsedMs: 20 }
  ]);

  assert.equal(summary.fastest, "openxml-batch");
  assert.deepEqual(summary.passedEngines, ["python", "openxml-batch"]);
  assert.deepEqual(summary.failedEngines, ["openxml-single"]);
  assert.equal(summary.timings.python, 30);
});

test("pptx build benchmark inspects structure across all slides", { timeout: 60_000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pptx-build-benchmark-zip-"));
  const irFile = path.join(tmp, "deck.ir.json");
  const pptx = path.join(tmp, "deck.pptx");
  fs.writeFileSync(irFile, `${JSON.stringify(createTwoSlideStructureIr(), null, 2)}\n`, "utf8");
  buildPptxBatch([{ irFile, outFile: pptx }], { "pptx-engine": "openxml" });

  const structure = inspectDeckStructure(pptx);
  assert.equal(structure.shapes >= 2, true);
});

function createTwoSlideStructureIr() {
  return {
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [
      {
        pageIndex: 0,
        sourceImage: "",
        background: { fill: "#FFFFFF" },
        shapes: [{
          id: "box-1",
          type: "rect",
          box: { x: 100, y: 100, w: 120, h: 60 },
          style: { fill: "#EAF2FF", stroke: "#4472C4", strokeWidth: 1 }
        }],
        textBoxes: [],
        images: [],
        tables: [],
        charts: []
      },
      {
        pageIndex: 1,
        sourceImage: "",
        background: { fill: "#FFFFFF" },
        shapes: [
          {
            id: "box-2",
            type: "rect",
            box: { x: 100, y: 100, w: 120, h: 60 },
            style: { fill: "#E2F0D9", stroke: "#70AD47", strokeWidth: 1 }
          },
          {
            id: "connector-1",
            type: "connector",
            box: { x: 220, y: 130, w: 160, h: 0 },
            style: { stroke: "#333333", strokeWidth: 2, endArrow: true }
          }
        ],
        textBoxes: [],
        images: [],
        tables: [],
        charts: []
      }
    ]
  };
}

test("pptx build benchmark sanitizes output file stems", () => {
  assert.equal(safeFileStem('a/b:c*"deck"'), "a_b_c__deck_");
  assert.equal(safeFileStem(""), "deck");
});
