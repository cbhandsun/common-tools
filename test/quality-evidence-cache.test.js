"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createQualityEvidenceIdentity,
  readQualityEvidenceCache,
  writeQualityEvidenceCache
} = require("../skills/pd-hifi-slideclone/scripts/lib/quality-evidence-cache");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-quality-evidence-"));
  const source = path.join(root, "source.png");
  const rendered = path.join(root, "rendered.png");
  const implementation = path.join(root, "implementation.js");
  fs.writeFileSync(source, "source-bytes", "utf8");
  fs.writeFileSync(rendered, "rendered-bytes", "utf8");
  fs.writeFileSync(implementation, "module.exports = 1;", "utf8");
  const ir = { slideSize: { widthPt: 960, heightPt: 540 }, pages: [{ pageIndex: 0, sourceImage: source, textBoxes: [{ id: "t", text: "hello", box: { x: 1, y: 2, w: 3, h: 4 } }] }] };
  const render = { renderedPages: [{ pageIndex: 0, image: rendered }] };
  const identity = createQualityEvidenceIdentity({ ir, render, implementationFiles: [implementation] });
  return { root, source, rendered, implementation, ir, render, identity };
}

test("quality evidence cache restores verified artifacts and rewrites output paths", () => {
  const state = fixture();
  const firstOut = path.join(state.root, "first");
  fs.mkdirSync(path.join(firstOut, "diff"), { recursive: true });
  fs.mkdirSync(path.join(firstOut, "compare"), { recursive: true });
  fs.writeFileSync(path.join(firstOut, "diff", "page.png"), "diff", "utf8");
  fs.writeFileSync(path.join(firstOut, "compare", "report.json"), "{}", "utf8");
  fs.writeFileSync(path.join(firstOut, "quality-contact-sheet.png"), "sheet", "utf8");
  const cacheDir = path.join(state.root, "cache");
  writeQualityEvidenceCache({
    cacheDir,
    identity: state.identity,
    outputDir: firstOut,
    diff: { reportFile: path.join(firstOut, "diff", "report.json"), sourceImage: state.source },
    compare: { reportFile: path.join(firstOut, "compare", "report.json"), renderedImage: state.rendered },
    contactSheet: path.join(firstOut, "quality-contact-sheet.png")
  });

  const secondOut = path.join(state.root, "second");
  const restored = readQualityEvidenceCache({ cacheDir, identity: state.identity, outputDir: secondOut });
  assert.equal(restored.diff.reportFile, path.join(secondOut, "diff", "report.json"));
  assert.equal(restored.diff.sourceImage, state.source);
  assert.equal(restored.compare.renderedImage, state.rendered);
  assert.equal(restored.contactSheet, path.join(secondOut, "quality-contact-sheet.png"));
  assert.equal(fs.readFileSync(path.join(secondOut, "diff", "page.png"), "utf8"), "diff");
});

test("quality evidence identity changes with rendered content and implementation", () => {
  const state = fixture();
  const original = state.identity.key;
  fs.writeFileSync(state.rendered, "changed-render", "utf8");
  const changedRender = createQualityEvidenceIdentity({ ir: state.ir, render: state.render, implementationFiles: [state.implementation] });
  assert.notEqual(changedRender.key, original);
  fs.writeFileSync(state.implementation, "module.exports = 2;", "utf8");
  const changedImplementation = createQualityEvidenceIdentity({ ir: state.ir, render: state.render, implementationFiles: [state.implementation] });
  assert.notEqual(changedImplementation.key, changedRender.key);
});

test("quality evidence cache refuses a corrupted artifact", () => {
  const state = fixture();
  const outputDir = path.join(state.root, "out");
  fs.mkdirSync(path.join(outputDir, "diff"), { recursive: true });
  fs.writeFileSync(path.join(outputDir, "diff", "page.png"), "diff", "utf8");
  const cacheDir = path.join(state.root, "cache");
  writeQualityEvidenceCache({ cacheDir, identity: state.identity, outputDir, diff: {}, compare: {} });
  const entry = path.join(cacheDir, state.identity.key.slice(0, 2), state.identity.key, "files", "diff", "page.png");
  fs.writeFileSync(entry, "corrupt", "utf8");
  assert.equal(readQualityEvidenceCache({ cacheDir, identity: state.identity, outputDir: path.join(state.root, "restore") }), null);
});
