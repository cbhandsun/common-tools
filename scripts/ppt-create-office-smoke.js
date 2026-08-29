#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createDeckIr } = require("../packages/ppt-create-core/layout");
const { inspectPptx } = require("../packages/ppt-create-core/export");
const { createBundledSlidecloneRunner } = require("../packages/cli/slideclone-runner");
const { createEditableJob, runEditableJob } = require("../packages/slideclone-core");
const { buildPptx } = require("../packages/remote-mcp-server/bin/common-tools-team-ppt-create-worker");
const { validatePowerPointEditableRoundTrip } = require("../skills/pd-hifi-slideclone/scripts/adapters/validate-powerpoint-editable-roundtrip");

function entry(id, label) { return { id, label, detail: `${label} detail` }; }
function buildSemanticOfficeSpec() {
  return { version: "1.0", title: "Common Tools semantic Office smoke", theme: "clean-light-v1", seed: "office-semantic-smoke", slides: [
    { id: "cover", role: "cover", title: "Semantic Office smoke" },
    { id: "matrix", role: "content", title: "Decision matrix", layout: "analysis-canvas-v1", items: [{ id: "matrix-note", label: "Four bounded quadrants" }], visual: { kind: "analysis", model: "quadrant", entries: [{ ...entry("q1", "Invest"), group: "q1" }, { ...entry("q2", "Test"), group: "q2" }, { ...entry("q3", "Maintain"), group: "q3" }, { ...entry("q4", "Exit"), group: "q4" }] } },
    { id: "funnel", role: "content", title: "Conversion funnel", layout: "analysis-canvas-v1", items: [{ id: "funnel-note", label: "Narrowing stages" }], visual: { kind: "analysis", model: "funnel", entries: [entry("visit", "Visit"), entry("trial", "Trial"), entry("buy", "Buy")] } },
    { id: "timeline", role: "content", title: "Delivery timeline", layout: "analysis-canvas-v1", items: [{ id: "timeline-note", label: "Sequenced milestones" }], visual: { kind: "analysis", model: "timeline", entries: [entry("discover", "Discover"), entry("build", "Build"), entry("ship", "Ship")] } },
    { id: "org", role: "content", title: "Operating model", layout: "analysis-canvas-v1", items: [{ id: "org-note", label: "Hierarchy remains editable" }], visual: { kind: "analysis", model: "org-chart", entries: [entry("lead", "Lead"), entry("product", "Product"), entry("engineering", "Engineering")], links: [{ id: "lead-product", from: "lead", to: "product" }, { id: "lead-engineering", from: "lead", to: "engineering" }] } }
  ] };
}
function newWorkspaceOutput(workspaceRoot, value) {
  const root = path.resolve(workspaceRoot); const outputRoot = path.resolve(value); const relative = path.relative(root, outputRoot);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || fs.existsSync(outputRoot)) throw new Error("PPT creation Office smoke output must be a new workspace child");
  if (!fs.statSync(path.dirname(outputRoot), { throwIfNoEntry: false })?.isDirectory()) throw new Error("PPT creation Office smoke output parent is unavailable");
  return outputRoot;
}
function buildImageBatchOfficeDeck(outputRoot) {
  const inputDir = path.join(outputRoot, "image-batch-input"); const batchOutput = path.join(outputRoot, "image-batch-output"); const stateRoot = path.join(outputRoot, "image-batch-state");
  fs.mkdirSync(inputDir); const fixture = path.resolve(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"); const inputs = [path.join(inputDir, "page-02.png"), path.join(inputDir, "page-01.png")];
  for (const input of inputs) fs.copyFileSync(fixture, input, fs.constants.COPYFILE_EXCL);
  const config = path.join(outputRoot, "image-batch.config.json");
  fs.writeFileSync(config, `${JSON.stringify({ inputDir, outputDir: batchOutput, pagePattern: "*.png", slide: { widthPt: 960, heightPt: 540 }, adapters: { normalize: "scripts/adapters/normalize-placeholder.js", ocr: "scripts/adapters/ocr-placeholder.js", vision: "scripts/adapters/vision-placeholder.js", pptx: "scripts/adapters/pptx-openxml-dotnet.js", render: "scripts/adapters/render-placeholder.js", diff: "scripts/adapters/diff-placeholder.js", compare: "scripts/adapters/compare-placeholder.js", polish: "scripts/adapters/polish-placeholder.js", compress: "scripts/adapters/compress-placeholder.js" }, thresholds: { pixelDiffRatio: 0.08, layoutMeanIoU: 0.86, textCoverage: 0.95, maxCriticalOffsetPt: 8, maxOutOfBoundsPt: 1, maxImageAspectRatioDelta: 0.03, maxRasterImageAreaRatio: 0.25 }, openXmlBuilder: { configuration: "Release", targetFramework: "net8.0-windows", powerPointSafe: false }, postprocess: { compare: false, polish: false, compress: false } }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  const job = createEditableJob({ workspaceRoot: process.cwd(), stateRoot, ownerId: "office-regression", inputs, output: batchOutput, config });
  const completed = runEditableJob({ stateRoot, ownerId: "office-regression", id: job.id, executeSlideclone: createBundledSlidecloneRunner({ repositoryRoot: path.resolve(__dirname, "..") }) });
  if (completed.status !== "succeeded" || completed.quality?.passed !== true) throw new Error("image batch Office smoke build failed");
  const deck = completed.artifacts.find((artifact) => artifact.name === path.join("pptx", "deck.pptx"));
  if (!deck) throw new Error("image batch Office smoke produced no PPTX");
  inspectPptx(deck.uri); return deck.uri;
}
async function main(argumentsList = process.argv.slice(2)) {
  const outputIndex = argumentsList.indexOf("--out"); const value = outputIndex >= 0 ? argumentsList[outputIndex + 1] : undefined;
  if (!value || outputIndex !== argumentsList.length - 2) throw new Error("Usage: node scripts/ppt-create-office-smoke.js --out <new-directory>");
  const outputRoot = newWorkspaceOutput(process.cwd(), value);
  fs.mkdirSync(outputRoot); const ir = createDeckIr(buildSemanticOfficeSpec()); const irFile = path.join(outputRoot, "semantic-office-smoke.ir.json"); const pptxFile = path.join(outputRoot, "semantic-office-smoke.pptx");
  fs.writeFileSync(irFile, `${JSON.stringify(ir, null, 2)}\n`, { flag: "wx", mode: 0o600 }); buildPptx({ irFile, outFile: pptxFile }); inspectPptx(pptxFile); const imageBatchPptx = buildImageBatchOfficeDeck(outputRoot);
  const report = await validatePowerPointEditableRoundTrip([{ file: pptxFile, mode: "shape-text" }, { file: imageBatchPptx, mode: "auto" }], { outputDir: outputRoot, timeoutMs: 300_000 });
  fs.writeFileSync(path.join(outputRoot, "ppt-create-office-smoke-report.json"), `${JSON.stringify({ version: "1.0", passed: report.passed === true, packageValidated: true, pageCount: ir.pages.length, semanticComponentCount: ir.pages.reduce((sum, page) => sum + (page.semanticComponents || []).length, 0), imageBatchPageCount: 2, imageBatchOfficeRoundTripValidated: report.passed === true }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
}
if (require.main === module) main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "PPT creation Office smoke failed"}\n`); process.exitCode = 1; });

module.exports = { buildImageBatchOfficeDeck, buildSemanticOfficeSpec, main, newWorkspaceOutput };
