"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  buildQualityArgs,
  buildRebuildArgs,
  isStructuralOnly,
  normalizeDeckId,
  normalizePages,
  normalizeRenderer,
  newestPathMtime,
  outputIsFresh,
  outputsAreFresh,
  outputsExist,
  qualityReportPassed,
  ratioArg,
  stageReuseEnabled
} = require("../skills/pd-hifi-slideclone/scripts/complex-graphic-golden-smoke");

test("stage reuse requires complete outputs and a report newer than every input", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "complex-golden-cache-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ir = path.join(dir, "deck.ir.json");
  const pptx = path.join(dir, "deck.pptx");
  const report = path.join(dir, "report.json");
  fs.writeFileSync(ir, "{}", "utf8");
  fs.writeFileSync(pptx, "pptx", "utf8");
  assert.equal(outputsExist([ir, pptx]), true);
  assert.equal(outputsExist([ir, path.join(dir, "missing")]), false);
  assert.equal(outputIsFresh(report, [ir, pptx]), false);
  fs.writeFileSync(report, "{}", "utf8");
  const now = Date.now() / 1000;
  fs.utimesSync(ir, now - 2, now - 2);
  fs.utimesSync(pptx, now - 1, now - 1);
  fs.utimesSync(report, now, now);
  assert.equal(outputIsFresh(report, [ir, pptx]), true);
  fs.utimesSync(ir, now + 1, now + 1);
  assert.equal(outputIsFresh(report, [ir, pptx]), false);
});

test("incremental reuse invalidates outputs when a nested source input changes", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "complex-golden-inputs-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const sourceDir = path.join(dir, "source", "nested");
  const source = path.join(sourceDir, "page.png");
  const ir = path.join(dir, "deck.ir.json");
  const pptx = path.join(dir, "deck.pptx");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(source, "source", "utf8");
  fs.writeFileSync(ir, "{}", "utf8");
  fs.writeFileSync(pptx, "pptx", "utf8");
  const now = Date.now() / 1000;
  fs.utimesSync(source, now - 2, now - 2);
  fs.utimesSync(ir, now - 1, now - 1);
  fs.utimesSync(pptx, now - 1, now - 1);
  assert.equal(newestPathMtime(sourceDir) > 0, true);
  assert.equal(outputsAreFresh([ir, pptx], [sourceDir]), true);
  fs.utimesSync(source, now + 1, now + 1);
  assert.equal(outputsAreFresh([ir, pptx], [sourceDir]), false);
  assert.equal(outputsAreFresh([ir, path.join(dir, "missing")], [sourceDir]), false);
});

test("incremental stage reuse is on by default but remains explicitly controllable", () => {
  assert.equal(stageReuseEnabled({}, "reuse-rebuild"), true);
  assert.equal(stageReuseEnabled({ "reuse-rebuild": "true" }, "reuse-rebuild"), true);
  assert.equal(stageReuseEnabled({ "reuse-rebuild": "false" }, "reuse-rebuild"), false);
  assert.equal(stageReuseEnabled({ force: "true" }, "reuse-rebuild"), false);
});

test("structural-only mode skips the expensive visual quality pass only when explicitly requested", () => {
  assert.equal(isStructuralOnly({ "structural-only": "true" }), true);
  assert.equal(isStructuralOnly({ quality: "false" }), true);
  assert.equal(isStructuralOnly({}), false);
  assert.equal(isStructuralOnly({ quality: "true" }), false);
});

test("normalizes safe deck ids and page lists", () => {
  assert.equal(normalizeDeckId("PM_Portal_AI_Skills_Engine"), "PM_Portal_AI_Skills_Engine");
  assert.equal(normalizeDeckId("产品AI工作台-效率先锋三页"), "产品AI工作台-效率先锋三页");
  assert.equal(normalizeDeckId("产品工作台 (三页)"), "产品工作台 (三页)");
  assert.equal(normalizePages("12, 2,12,5"), "12,2,5");
});

test("rejects unsafe deck ids", () => {
  for (const value of [
    "",
    ".",
    "..",
    "../deck",
    "deck/name",
    "deck\\name",
    "deck‮name",
    "deck.",
    "CON",
    "LPT1.pptx",
    "a".repeat(121)
  ]) {
    assert.throws(() => normalizeDeckId(value));
  }
});

test("rejects invalid or extreme page selections", () => {
  for (const value of ["", "0", "-1", "1-3", "NaN", "10001", `${Array.from({ length: 101 }, (_, index) => index + 1).join(",")}`]) {
    assert.throws(() => normalizePages(value));
  }
});

test("renderer selection is explicit and fail-closed", () => {
  assert.equal(normalizeRenderer("PowerPoint"), "powerpoint");
  assert.equal(normalizeRenderer("LibreOffice"), "libreoffice");
  assert.throws(() => normalizeRenderer("remote"), /--renderer/);
  const args = buildQualityArgs({ ir: "deck.ir.json", pptx: "deck.pptx", qualityDir: "quality", renderer: "libreoffice" });
  assert.equal(args[args.indexOf("--renderer") + 1], "libreoffice");
});

test("OCR coverage threshold accepts only finite ratios", () => {
  assert.equal(ratioArg(undefined, 0.8), 0.8);
  assert.equal(ratioArg("0", 0.8), 0);
  assert.equal(ratioArg("1", 0.8), 1);
  for (const value of ["NaN", -0.1, 1.1, Infinity]) assert.throws(() => ratioArg(value, 0.8));
});

test("strict quality rejects low layout IoU when structural evidence exists", () => {
  const report = {
    gate: {
      passed: true,
      failures: [],
      textOverlayRiskBoxes: 0,
      residualLayerCandidates: 0,
      actionableRetainedComponentTemplateCrops: 0,
      actionableUnexplainedCrops: 0,
      nativeObjectConflicts: 0
    },
    summary: { passed: true, rejected: 0 },
    deckMetrics: { layoutMeanIoU: 0.79 }
  };

  assert.equal(qualityReportPassed(report, { minimumLayoutIoU: 0.8 }), false);
  assert.equal(qualityReportPassed({ ...report, deckMetrics: { layoutMeanIoU: 0.8 } }, { minimumLayoutIoU: 0.8 }), true);
  assert.equal(qualityReportPassed({ ...report, deckMetrics: { layoutMeanIoU: null } }, { minimumLayoutIoU: 0.8 }), true);
});

test("rebuild args enable smart layers, OpenXML, and progress", () => {
  const args = buildRebuildArgs({ workRoot: "work", deck: "deck", pages: "2,5", out: "out" });
  assert.deepEqual(args.slice(0, 1), ["skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native.js"]);
  assert.equal(args[args.indexOf("--smart-native-layers") + 1], "true");
  assert.equal(args[args.indexOf("--pptx-engine") + 1], "openxml");
  assert.equal(args[args.indexOf("--progress") + 1], "true");
});

test("quality args enforce every complex-graphic safety gate", () => {
  const args = buildQualityArgs({ ir: "deck.ir.json", pptx: "deck.pptx", qualityDir: "quality" });
  assert.equal(args[args.indexOf("--reuse-render") + 1], "true");
  assert.equal(args[args.indexOf("--contact-pages") + 1], "0");
  assert.equal(args[args.indexOf("--heartbeat-ms") + 1], "10000");
  for (const flag of [
    "--fail-on-rejected",
    "--fail-on-text-overlay-risk",
    "--fail-on-residual-layer-candidates",
    "--fail-on-actionable-component-template-retained-crops",
    "--fail-on-actionable-unexplained-crops",
    "--fail-on-native-object-conflicts"
  ]) {
    assert.equal(args[args.indexOf(flag) + 1], "true", `${flag} must be strict`);
  }
});

test("quality args enable real local OCR only when a coverage threshold is requested", () => {
  const visualArgs = buildQualityArgs({ ir: "deck.ir.json", pptx: "deck.pptx", qualityDir: "quality" });
  const ocrArgs = buildQualityArgs({
    ir: "deck.ir.json",
    pptx: "deck.pptx",
    qualityDir: "quality",
    minimumTextCoverage: 0.8
  });
  assert.equal(visualArgs.includes("--text-ocr"), false);
  assert.equal(ocrArgs[ocrArgs.indexOf("--text-ocr") + 1], "true");
  assert.equal(ocrArgs[ocrArgs.indexOf("--text-ocr-adapter") + 1], "scripts/adapters/ocr-paddleocr-local.js");
  assert.equal(ocrArgs[ocrArgs.indexOf("--min-text-coverage") + 1], "0.8");
});

test("quality report success is derived from explicit strict invariants", () => {
  const report = {
    gate: {
      passed: true,
      failures: [],
      textOverlayRiskBoxes: 0,
      residualLayerCandidates: 0,
      actionableRetainedComponentTemplateCrops: 0,
      actionableUnexplainedCrops: 0,
      nativeObjectConflicts: 0
    },
    summary: { passed: true, rejected: 0 }
  };
  assert.equal(qualityReportPassed(report), true);
  assert.equal(qualityReportPassed({ ...report, deckMetrics: { textCoverage: 0.9 } }, { minimumTextCoverage: 0.8 }), true);
  assert.equal(qualityReportPassed({ ...report, deckMetrics: { textCoverage: 0.79 } }, { minimumTextCoverage: 0.8 }), false);
  assert.equal(qualityReportPassed(report, { minimumTextCoverage: 0.8 }), false);
  assert.equal(qualityReportPassed({ ...report, gate: { ...report.gate, nativeObjectConflicts: 1 } }), false);
  assert.equal(qualityReportPassed({ ...report, summary: { passed: false, rejected: 0 } }), false);
  assert.equal(qualityReportPassed(null), false);
});
