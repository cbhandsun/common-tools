#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createDeckIr } = require("../packages/ppt-create-core/layout");
const { inspectPptx } = require("../packages/ppt-create-core/export");
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
async function main(argumentsList = process.argv.slice(2)) {
  const outputIndex = argumentsList.indexOf("--out"); const value = outputIndex >= 0 ? argumentsList[outputIndex + 1] : undefined;
  if (!value || outputIndex !== argumentsList.length - 2) throw new Error("Usage: node scripts/ppt-create-office-smoke.js --out <new-directory>");
  const outputRoot = newWorkspaceOutput(process.cwd(), value);
  fs.mkdirSync(outputRoot); const ir = createDeckIr(buildSemanticOfficeSpec()); const irFile = path.join(outputRoot, "semantic-office-smoke.ir.json"); const pptxFile = path.join(outputRoot, "semantic-office-smoke.pptx");
  fs.writeFileSync(irFile, `${JSON.stringify(ir, null, 2)}\n`, { flag: "wx", mode: 0o600 }); buildPptx({ irFile, outFile: pptxFile }); inspectPptx(pptxFile);
  const report = await validatePowerPointEditableRoundTrip([{ file: pptxFile, mode: "shape-text" }], { outputDir: outputRoot, timeoutMs: 300_000 });
  fs.writeFileSync(path.join(outputRoot, "ppt-create-office-smoke-report.json"), `${JSON.stringify({ version: "1.0", passed: report.passed === true, packageValidated: true, pageCount: ir.pages.length, semanticComponentCount: ir.pages.reduce((sum, page) => sum + (page.semanticComponents || []).length, 0) }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
}
if (require.main === module) main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "PPT creation Office smoke failed"}\n`); process.exitCode = 1; });

module.exports = { buildSemanticOfficeSpec, main, newWorkspaceOutput };
