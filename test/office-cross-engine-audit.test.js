"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  buildCrossRendererPlans,
  createExecutionFailureResult,
  evaluateCrossRendererCase,
  normalizeRenderer,
  parseArgs,
  runCrossRendererPlan,
  safeWorkspacePath
} = require("../scripts/cross-renderer-corpus-audit");

function qualityReport(pixel = 0.1, foreground = 0.2, passed = true) {
  return {
    provider: "quality-gate-real-pptx",
    gate: { passed },
    deckMetrics: { pixelDiffRatio: pixel, foregroundMissingRatio: foreground }
  };
}

test("cross-renderer audit builds bounded PowerPoint quality plans from corpus evidence", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cross-engine-plan-"));
  const irFile = path.join(directory, "deck.json");
  const pptxFile = path.join(directory, "deck.pptx");
  const primaryReportFile = path.join(directory, "quality.json");
  fs.writeFileSync(irFile, "{}");
  fs.writeFileSync(pptxFile, "fixture");
  fs.writeFileSync(primaryReportFile, JSON.stringify({ ...qualityReport(), irFile, pptxFile }));
  const plans = buildCrossRendererPlans({
    provider: "real-pptx-corpus-runner",
    cases: [{ id: "system-map", reportFile: primaryReportFile }]
  }, { renderer: "powerpoint", maxCases: 1, outputDir: path.join(directory, "out") });
  assert.equal(plans.length, 1);
  assert.equal(plans[0].id, "system-map");
  assert.deepEqual(plans[0].args.slice(0, 2), ["skills/pd-hifi-slideclone/scripts/quality-gate-real-pptx.js", "--ir"]);
  assert.equal(plans[0].args[plans[0].args.indexOf("--renderer") + 1], "powerpoint");
  assert.equal(plans[0].args[plans[0].args.indexOf("--reuse-render") + 1], "false");
});

test("cross-renderer audit skips specialist corpus reports before applying the case limit", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cross-engine-specialist-"));
  const irFile = path.join(directory, "deck.json");
  const pptxFile = path.join(directory, "deck.pptx");
  const specialistReportFile = path.join(directory, "chart.json");
  const primaryReportFile = path.join(directory, "quality.json");
  fs.writeFileSync(irFile, "{}");
  fs.writeFileSync(pptxFile, "fixture");
  fs.writeFileSync(specialistReportFile, JSON.stringify({ provider: "chart-native-render-golden-v1" }));
  fs.writeFileSync(primaryReportFile, JSON.stringify({ ...qualityReport(), irFile, pptxFile }));

  const plans = buildCrossRendererPlans({
    provider: "real-pptx-corpus-runner",
    cases: [
      { id: "native-chart", reportFile: specialistReportFile },
      { id: "system-map", reportFile: primaryReportFile }
    ]
  }, { renderer: "powerpoint", maxCases: 1, outputDir: path.join(directory, "out") });

  assert.equal(plans.length, 1);
  assert.equal(plans[0].id, "system-map");
});

test("cross-renderer audit passes bounded drift and rejects renderer or quality regression", () => {
  const passing = evaluateCrossRendererCase(qualityReport(0.1, 0.2), qualityReport(0.14, 0.24), {
    id: "case-one", renderer: "powerpoint", elapsedMs: 100
  });
  assert.equal(passing.passed, true);
  assert.deepEqual(passing.failures, []);
  const failing = evaluateCrossRendererCase(qualityReport(0.1, 0.2), qualityReport(0.19, 0.31, false), {
    id: "case-one", renderer: "powerpoint", elapsedMs: 100
  });
  assert.equal(failing.passed, false);
  assert.deepEqual(failing.failures, [
    "cross-renderer-quality-gate",
    "cross-renderer-pixel-regression",
    "cross-renderer-foreground-regression"
  ]);
});

test("cross-renderer PowerPoint execution retries once and returns path-free failure evidence", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cross-engine-retry-"));
  fs.writeFileSync(path.join(directory, "quality-gate-report.json"), JSON.stringify(qualityReport()));
  const plan = { id: "case-one", args: ["quality.js"], outputDir: directory, primaryReport: qualityReport() };
  let calls = 0;
  const result = runCrossRendererPlan(plan, {
    renderer: "powerpoint",
    timeoutMs: 1000,
    now: () => 100,
    spawn: () => { calls += 1; return { status: 1, signal: null, error: calls === 1 ? { code: "ETIMEDOUT" } : null }; }
  });
  assert.equal(calls, 2);
  assert.equal(fs.existsSync(path.join(directory, "quality-gate-report.json")), false);
  assert.deepEqual(result.failures, ["cross-renderer-execution"]);
  assert.deepEqual(result.execution, { exitCode: 1, signal: null, timedOut: false });
  assert.equal(JSON.stringify(result).includes(directory), false);
  assert.deepEqual(createExecutionFailureResult("case-one", "libreoffice", { status: null, signal: "SIGTERM", error: { code: "ETIMEDOUT" } }, 1, 10).execution,
    { exitCode: null, signal: "SIGTERM", timedOut: true });
});

test("cross-renderer boundaries reject malformed, extreme and escaping input", () => {
  assert.throws(() => buildCrossRendererPlans({}, { renderer: "powerpoint", maxCases: 1, outputDir: "out" }), /corpus report/);
  assert.throws(() => buildCrossRendererPlans({ provider: "real-pptx-corpus-runner", cases: [{ id: "../unsafe" }] }, {
    renderer: "powerpoint", maxCases: 1, outputDir: "out"
  }), /case id/);
  assert.throws(() => normalizeRenderer("unknown"), /invalid/);
  assert.throws(() => parseArgs(["--token", "secret"]), /Unknown option/);
  assert.throws(() => parseArgs(["positional"]), /Unexpected positional/);
  assert.throws(() => safeWorkspacePath(process.cwd(), "../escape", "output"), /inside the workspace/);
  assert.throws(() => evaluateCrossRendererCase(qualityReport(), qualityReport(2, 0.1), {
    id: "case", renderer: "powerpoint", elapsedMs: 1
  }), /pixel diff/);
});
