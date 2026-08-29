"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const normalizeCli = require("../skills/pd-hifi-slideclone/scripts/adapters/normalize-cli");

const fixture = path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png");

test("built-in image normalizer honors an explicitly scoped input file", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-normalize-scope-"));
  try {
    const inputDir = path.join(root, "input");
    const outputDir = path.join(root, "output");
    const selected = path.join(inputDir, "selected.png");
    const adjacent = path.join(inputDir, "adjacent.png");
    fs.mkdirSync(inputDir);
    fs.copyFileSync(fixture, selected);
    fs.copyFileSync(fixture, adjacent);
    const result = await normalizeCli({ inputDir, outputDir }, { inputFiles: [selected] });
    assert.equal(result.ok, true);
    assert.equal(result.data.pageImages.length, 1);
    assert.equal(result.data.pageImages[0].originalSource, fs.realpathSync.native(selected));
    assert.equal(fs.existsSync(path.join(outputDir, "normalized", "001.png")), true);
    assert.equal(fs.existsSync(path.join(outputDir, "normalized", "002.png")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("built-in image normalizer rejects a requested file outside its input directory", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-normalize-outside-"));
  try {
    const inputDir = path.join(root, "input");
    const outputDir = path.join(root, "output");
    const outside = path.join(root, "outside.png");
    fs.mkdirSync(inputDir);
    fs.copyFileSync(fixture, outside);
    await assert.rejects(
      normalizeCli({ inputDir, outputDir }, { inputFiles: [outside] }),
      /outside input directory/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("PDF normalization probes one extra page and rejects oversized documents", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-normalize-page-limit-"));
  try {
    const pdf = path.join(root, "source.pdf");
    fs.writeFileSync(pdf, "%PDF-1.7\n%%EOF\n");
    let observedArgs = [];
    await assert.rejects(
      normalizeCli.renderPdf(pdf, root, 0, {
        config: { normalize: { maxPages: 20 } }
      }, {
        resolvePdfToPpm: () => "pdftoppm",
        run: async (_command, args) => {
          observedArgs = args;
          const prefix = args.at(-1);
          for (let page = 1; page <= 21; page += 1) {
            fs.copyFileSync(fixture, `${prefix}-${page}.png`);
          }
        }
      }),
      /exceeds the 20-page normalization limit/
    );
    assert.deepEqual(observedArgs.slice(0, 6), ["-png", "-r", "144", "-f", "1", "-l"]);
    assert.equal(observedArgs[6], "21");
    assert.equal(fs.readdirSync(root).some((name) => name.startsWith("pdf-") && name.endsWith(".png")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
