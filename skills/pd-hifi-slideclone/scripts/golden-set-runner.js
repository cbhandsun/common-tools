#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { createProgressLineForwarder, redactSecrets } = require("./lib/progress-reporter");

const MAX_CHILD_OUTPUT_CHARS = 64 * 1024 * 1024;

const skillRoot = path.resolve(__dirname, "..");
const defaultManifest = path.join(skillRoot, "examples", "golden-set.manifest.json");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === "true" || args.h === "true") {
    process.stdout.write(`${goldenSetRunnerUsage()}\n`);
    return;
  }
  const manifestFile = path.resolve(args.manifest || defaultManifest);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const outputDir = path.resolve(args.out || path.join(process.cwd(), "runs", "golden-set"));
  const caseTimeoutMs = parsePositiveInt(args["case-timeout-ms"], 180_000);
  const concurrency = parsePositiveInt(args.concurrency, 2);
  ensureDir(path.join(outputDir, "reports"));

  const cases = selectCases(manifest, args);
  const results = await runCases(cases, {
    timeoutMs: caseTimeoutMs,
    concurrency,
    onStart: ({ index, total, entry }) => process.stderr.write(`[golden-set] ${index + 1}/${total} start ${entry.id}\n`),
    onDone: ({ index, total, entry, result, elapsedMs }) => process.stderr.write(`[golden-set] ${index + 1}/${total} done ${entry.id} ${result.ok === true ? "ok" : "failed"} ${elapsedMs}ms\n`)
  });

  const report = {
    provider: "golden-set-runner",
    manifestFile,
    generatedAt: new Date().toISOString(),
    totals: summarizeTotals(results),
    cases: results
  };
  const reportFile = path.join(outputDir, "reports", "golden-set.report.json");
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    reportFile,
    totalCases: report.totals.totalCases,
    passingCases: report.totals.passingCases,
    commandPassingCases: report.totals.commandPassingCases,
    improvingCases: report.totals.improvingCases,
    failingCases: report.totals.failingCases
  }, null, 2)}\n`);
  if (report.totals.failingCases > 0) process.exitCode = 1;
}

async function runCases(cases = [], options = {}) {
  const entries = Array.isArray(cases) ? cases : [];
  const concurrency = Math.min(entries.length || 1, parsePositiveInt(options.concurrency, 1));
  const run = typeof options.runCase === "function" ? options.runCase : runCaseAsync;
  const results = new Array(entries.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= entries.length) return;
      const entry = entries[index];
      const startedAt = Date.now();
      options.onStart?.({ index, total: entries.length, entry });
      let result;
      try {
        result = await run(entry, { timeoutMs: options.timeoutMs });
      } catch (error) {
        result = {
          id: entry?.id || `case-${index + 1}`,
          pageType: entry?.pageType || null,
          mode: entry?.mode || "unknown",
          ok: false,
          error: error.message || String(error)
        };
      }
      const elapsedMs = Date.now() - startedAt;
      results[index] = { ...result, elapsedMs };
      options.onDone?.({ index, total: entries.length, entry, result, elapsedMs });
    }
  }));
  return results;
}

function runCase(entry, options = {}) {
  const command = Array.isArray(entry.command) ? [...entry.command] : [];
  if (command.length === 0) throw new Error(`golden-set case "${entry.id}" has no command.`);
  const executable = normalizeExecutable(command.shift());
  const timeoutMs = caseTimeoutMs(entry, options.timeoutMs);
  const run = spawnSync(executable, command, {
    cwd: process.cwd(),
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs
  });
  if (run.status !== 0) {
    return {
      id: entry.id,
      pageType: entry.pageType || null,
      mode: entry.mode || "unknown",
      ok: false,
      command: [executable, ...command],
      timeoutMs,
      timedOut: run.error?.code === "ETIMEDOUT" || run.signal === "SIGTERM",
      error: safeChildError(run.error?.message || run.stderr || run.stdout || `exit ${run.status}`)
    };
  }
  if (entry.mode === "command-passes") {
    return evaluateCase(entry, {
      stdout: String(run.stdout || "").trim(),
      stderr: String(run.stderr || "").trim()
    }, [executable, ...command]);
  }
  const payload = parseLastJsonObject(run.stdout);
  return evaluateCase(entry, payload, [executable, ...command]);
}

function runCaseAsync(entry, options = {}) {
  const command = Array.isArray(entry.command) ? [...entry.command] : [];
  if (command.length === 0) return Promise.reject(new Error(`golden-set case "${entry.id}" has no command.`));
  const executable = normalizeExecutable(command.shift());
  const timeoutMs = caseTimeoutMs(entry, options.timeoutMs);
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let outputOverflow = false;
    const progress = createProgressLineForwarder({ stream: process.stderr });
    const child = spawn(executable, command, {
      cwd: process.cwd(),
      windowsHide: true,
      shell: false
    });
    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      const appended = appendBounded(stdout, chunk, MAX_CHILD_OUTPUT_CHARS);
      stdout = appended.value;
      outputOverflow ||= appended.overflow;
      if (outputOverflow) child.kill();
    });
    child.stderr.on("data", (chunk) => {
      const appended = appendBounded(stderr, chunk, MAX_CHILD_OUTPUT_CHARS);
      stderr = appended.value;
      outputOverflow ||= appended.overflow;
      progress.write(chunk);
      if (outputOverflow) child.kill();
    });
    child.on("error", (error) => {
      settle({
        id: entry.id,
        pageType: entry.pageType || null,
        mode: entry.mode || "unknown",
        ok: false,
        command: [executable, ...command],
        timeoutMs,
        timedOut,
        error: safeChildError(error.message)
      });
    });
    child.on("close", (status, signal) => {
      progress.flush();
      if (outputOverflow) {
        settle({
          id: entry.id,
          pageType: entry.pageType || null,
          mode: entry.mode || "unknown",
          ok: false,
          command: [executable, ...command],
          timeoutMs,
          timedOut: false,
          error: "child output exceeded the bounded limit"
        });
        return;
      }
      if (status !== 0) {
        settle({
          id: entry.id,
          pageType: entry.pageType || null,
          mode: entry.mode || "unknown",
          ok: false,
          command: [executable, ...command],
          timeoutMs,
          timedOut: timedOut || signal === "SIGTERM",
          error: safeChildError(stderr || stdout || `exit ${status}`)
        });
        return;
      }
      try {
        const payload = entry.mode === "command-passes"
          ? { stdout: String(stdout || "").trim(), stderr: String(stderr || "").trim() }
          : parseLastJsonObject(stdout);
        settle(evaluateCase(entry, payload, [executable, ...command]));
      } catch (error) {
        settle({
          id: entry.id,
          pageType: entry.pageType || null,
          mode: entry.mode || "unknown",
          ok: false,
          command: [executable, ...command],
          timeoutMs,
          timedOut,
          error: safeChildError(error.message)
        });
      }
    });
  });
}

function evaluateCase(entry, payload, command) {
  const base = {
    id: entry.id,
    pageType: entry.pageType || null,
    mode: entry.mode || "unknown",
    ok: true,
    command
  };
  if (entry.mode === "delivery") {
    const report = readReport(payload.reportFile);
    const qualityPassed = (report?.passed ?? payload.passed) === true;
    const expectations = evaluateDeliveryExpectations(report, entry.expect);
    return {
      ...base,
      passed: qualityPassed && expectations.passed,
      qualityPassed,
      expectations,
      status: report?.status || payload.status || null,
      metrics: report?.metrics || payload.metrics || payload.summary || null,
      reportFile: payload.reportFile || null,
      timings: payload.timings || null,
      render: payload.render || null
    };
  }
  if (entry.mode === "coverage-improves") {
    const baseline = Number(payload.baselineTextCoverage);
    const polished = Number(payload.polishedTextCoverage);
    const improved = Number.isFinite(baseline) && Number.isFinite(polished) && polished > baseline;
    return {
      ...base,
      improved,
      baselineTextCoverage: Number.isFinite(baseline) ? baseline : null,
      polishedTextCoverage: Number.isFinite(polished) ? polished : null,
      textCoverageDelta: typeof payload.textCoverageDelta === "number" ? payload.textCoverageDelta : null,
      suggestionCount: payload.suggestionCount ?? null,
      reportFile: payload.reportFile || null
    };
  }
  if (entry.mode === "score-improves") {
    const report = readReport(payload.reportFile);
    const baselineScore = numberOrNull(report?.baseline?.score);
    const finalScore = numberOrNull(
      report?.textMicroAdjust?.selected?.score
      ?? report?.fontFit?.selected?.score
      ?? payload.textMicroAdjust?.selected?.score
      ?? payload.fontFit?.selected?.score
    );
    const improved = Number.isFinite(baselineScore) && Number.isFinite(finalScore) && finalScore < baselineScore;
    return {
      ...base,
      improved,
      baselineScore,
      finalScore,
      baselineMetrics: report?.baseline?.metrics || null,
      finalMetrics: report?.compare?.summary || payload.metrics || null,
      reportFile: payload.reportFile || null
    };
  }
  if (entry.mode === "sentinel-fail") {
    const textCoverage = Number(payload.baselineTextCoverage ?? payload.textCoverage);
    const caught = payload.passed === false && Number.isFinite(textCoverage) && textCoverage < 0.95;
    return {
      ...base,
      caught,
      textCoverage: Number.isFinite(textCoverage) ? textCoverage : null,
      reportFile: payload.reportFile || null
    };
  }
  if (entry.mode === "command-passes") {
    return {
      ...base,
      passed: true,
      stdout: payload.stdout || null,
      stderr: payload.stderr || null
    };
  }
  return {
    ...base,
    payload
  };
}

function evaluateDeliveryExpectations(report, rawExpectations) {
  if (rawExpectations === undefined) return { configured: false, passed: true, checks: [] };
  if (!rawExpectations || typeof rawExpectations !== "object" || Array.isArray(rawExpectations)) {
    return invalidExpectation("expect", "must be an object");
  }
  const checks = [];
  const shapeCount = report?.editabilityProfile?.logicalShapes ?? report?.editability?.shapes;
  const textBoxCount = report?.editabilityProfile?.logicalTextBoxes ?? report?.editability?.textBoxes;
  addBoundedExpectationCheck(checks, "maxImages", rawExpectations.maxImages, report?.editability?.images, "max", { integer: true, min: 0, max: 10000 });
  addBoundedExpectationCheck(checks, "minShapes", rawExpectations.minShapes, shapeCount, "min", { integer: true, min: 0, max: 100000 });
  addBoundedExpectationCheck(checks, "maxShapes", rawExpectations.maxShapes, shapeCount, "max", { integer: true, min: 0, max: 100000 });
  addBoundedExpectationCheck(checks, "minTables", rawExpectations.minTables, report?.editability?.tables, "min", { integer: true, min: 0, max: 10000 });
  addBoundedExpectationCheck(checks, "minTextBoxes", rawExpectations.minTextBoxes, textBoxCount, "min", { integer: true, min: 0, max: 100000 });
  addBoundedExpectationCheck(checks, "maxTextBoxes", rawExpectations.maxTextBoxes, textBoxCount, "max", { integer: true, min: 0, max: 100000 });
  addBoundedExpectationCheck(checks, "maxRasterImageAreaRatio", rawExpectations.maxRasterImageAreaRatio, report?.editability?.rasterImageAreaRatio, "max", { min: 0, max: 1 });
  addBoundedExpectationCheck(checks, "maxSingleRasterImageAreaRatio", rawExpectations.maxSingleRasterImageAreaRatio, report?.editabilityProfile?.maxRasterImageAreaRatio, "max", { min: 0, max: 1 });
  addBoundedExpectationCheck(checks, "maxPixelDiffRatio", rawExpectations.maxPixelDiffRatio, report?.deckMetrics?.pixelDiffRatio, "max", { min: 0, max: 1 });
  addBoundedExpectationCheck(checks, "maxForegroundMissingRatio", rawExpectations.maxForegroundMissingRatio, report?.deckMetrics?.foregroundMissingRatio, "max", { min: 0, max: 1 });
  addBoundedExpectationCheck(checks, "minLayoutMeanIoU", rawExpectations.minLayoutMeanIoU, report?.deckMetrics?.layoutMeanIoU, "min", { min: 0, max: 1 });
  addBoundedExpectationCheck(checks, "minIntentionalMinimumUnitCrops", rawExpectations.minIntentionalMinimumUnitCrops, report?.visualUnitDecisionProfile?.intentionalMinimumUnitCrops, "min", { integer: true, min: 0, max: 10000 });
  addBoundedExpectationCheck(checks, "maxActionableUnexplainedCrops", rawExpectations.maxActionableUnexplainedCrops, report?.visualUnitDecisionProfile?.actionableUnexplainedCrops, "max", { integer: true, min: 0, max: 10000 });
  addBoundedExpectationCheck(checks, "minNativeComponentGroups", rawExpectations.minNativeComponentGroups, report?.nativeComponentProfile?.groups, "min", { integer: true, min: 0, max: 100000 });
  addBoundedExpectationCheck(checks, "maxNativeComponentGroups", rawExpectations.maxNativeComponentGroups, report?.nativeComponentProfile?.groups, "max", { integer: true, min: 0, max: 100000 });
  addBoundedExpectationCheck(checks, "maxUngroupedNativeComponentParts", rawExpectations.maxUngroupedNativeComponentParts, report?.nativeComponentProfile?.ungroupedNativeComponentParts, "max", { integer: true, min: 0, max: 100000 });
  if (rawExpectations.allowedImageDetectors !== undefined) {
    const allowed = sanitizeDetectorExpectation(rawExpectations.allowedImageDetectors);
    const actual = Object.keys(report?.editabilityProfile?.detectorCounts || {});
    const unexpected = allowed.ok ? actual.filter((detector) => !allowed.values.includes(detector)) : actual;
    checks.push({
      name: "allowedImageDetectors",
      expected: allowed.ok ? allowed.values : null,
      actual,
      passed: allowed.ok && unexpected.length === 0,
      unexpected,
      error: allowed.error || null
    });
  }
  if (rawExpectations.allowedImageExpressionForms !== undefined) {
    const allowed = sanitizeStringListExpectation(rawExpectations.allowedImageExpressionForms, "image expression forms");
    const actual = Object.keys(report?.editabilityProfile?.imageExpressionCounts || {});
    const unexpected = allowed.ok ? actual.filter((form) => !allowed.values.includes(form)) : actual;
    checks.push({
      name: "allowedImageExpressionForms",
      expected: allowed.ok ? allowed.values : null,
      actual,
      passed: allowed.ok && unexpected.length === 0,
      unexpected,
      error: allowed.error || null
    });
  }
  const knownKeys = new Set([
    "maxImages",
    "minShapes",
    "maxShapes",
    "minTables",
    "minTextBoxes",
    "maxTextBoxes",
    "maxRasterImageAreaRatio",
    "maxSingleRasterImageAreaRatio",
    "maxPixelDiffRatio",
    "maxForegroundMissingRatio",
    "minLayoutMeanIoU",
    "minIntentionalMinimumUnitCrops",
    "maxActionableUnexplainedCrops",
    "minNativeComponentGroups",
    "maxNativeComponentGroups",
    "maxUngroupedNativeComponentParts",
    "allowedImageDetectors",
    "allowedImageExpressionForms"
  ]);
  const unknownKeys = Object.keys(rawExpectations).filter((key) => !knownKeys.has(key));
  if (unknownKeys.length > 0) {
    checks.push({ name: "expect", passed: false, error: `unknown expectation keys: ${unknownKeys.join(",")}` });
  }
  return { configured: true, passed: checks.every((check) => check.passed === true), checks };
}

function addBoundedExpectationCheck(checks, name, expectedValue, actualValue, direction, limits) {
  if (expectedValue === undefined) return;
  const expected = Number(expectedValue);
  const actual = Number(actualValue);
  const expectedValid = Number.isFinite(expected)
    && expected >= limits.min
    && expected <= limits.max
    && (!limits.integer || Number.isInteger(expected));
  const actualValid = Number.isFinite(actual);
  const passed = expectedValid && actualValid && (direction === "min" ? actual >= expected : actual <= expected);
  checks.push({
    name,
    expected: expectedValid ? expected : null,
    actual: actualValid ? actual : null,
    passed,
    error: expectedValid ? (actualValid ? null : "required report evidence is missing") : "expectation is outside its allowed boundary"
  });
}

function sanitizeDetectorExpectation(value) {
  return sanitizeStringListExpectation(value, "detector names");
}

function sanitizeStringListExpectation(value, label) {
  if (!Array.isArray(value) || value.length > 128) return { ok: false, values: [], error: `must be an array of at most 128 ${label}` };
  const values = [...new Set(value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean))];
  if (values.length !== value.length || values.some((item) => item.length > 128)) {
    return { ok: false, values: [], error: `${label} must be unique non-empty strings of at most 128 characters` };
  }
  return { ok: true, values, error: null };
}

function invalidExpectation(name, error) {
  return { configured: true, passed: false, checks: [{ name, passed: false, error }] };
}

function summarizeTotals(results) {
  return {
    totalCases: results.length,
    passingCases: results.filter((item) => item.mode === "delivery" && item.passed === true).length,
    commandPassingCases: results.filter((item) => item.mode === "command-passes" && item.passed === true).length,
    improvingCases: results.filter((item) =>
      (item.mode === "coverage-improves" || item.mode === "score-improves")
      && item.improved === true).length,
    sentinelCaught: results.filter((item) => item.mode === "sentinel-fail" && item.caught === true).length,
    failingCases: results.filter((item) =>
      item.ok !== true
      || (item.mode === "delivery" && item.passed !== true)
      || (item.mode === "coverage-improves" && item.improved !== true)
      || (item.mode === "score-improves" && item.improved !== true)
      || (item.mode === "sentinel-fail" && item.caught !== true)
      || (item.mode === "command-passes" && item.passed !== true)).length
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function selectCases(manifest = {}, args = {}) {
  const allCases = Array.isArray(manifest.cases) ? manifest.cases : [];
  const caseById = new Map();
  for (const entry of allCases) {
    const id = String(entry?.id || "").trim();
    if (!id) throw new Error("Golden-set cases must have non-empty ids.");
    if (caseById.has(id)) throw new Error(`Duplicate golden-set case id: ${id}`);
    caseById.set(id, entry);
  }
  const requestedIds = [...new Set([
    ...parseCsv(args.case),
    ...parseCsv(args.only)
  ])];
  const requestedSuites = parseCsv(args.suite);
  const selectedIds = new Set(requestedIds);
  for (const suiteName of requestedSuites) {
    const suiteIds = manifest?.suites?.[suiteName];
    if (!Array.isArray(suiteIds)) throw new Error(`Unknown --suite id: ${suiteName}`);
    for (const id of suiteIds) selectedIds.add(String(id || "").trim());
  }
  if (selectedIds.size === 0) return allCases;
  const unknownIds = [...selectedIds].filter((id) => !caseById.has(id));
  if (unknownIds.length > 0) throw new Error(`Unknown --case id: ${unknownIds.join(",")}`);
  return allCases.filter((entry) => selectedIds.has(entry.id));
}

function parseCsv(value) {
  return [...new Set(String(value || "").split(",").map((item) => item.trim()).filter(Boolean))];
}

function goldenSetRunnerUsage() {
  return [
    "Usage: node golden-set-runner.js [options]",
    "  --manifest <file>          Golden-set manifest (default: examples/golden-set.manifest.json)",
    "  --out <dir>                Output directory (default: runs/golden-set)",
    "  --case-timeout-ms <ms>     Per-case timeout (default: 180000)",
    "  --concurrency <n>          Concurrent cases (default: 2)",
    "  --case <id[,id]>           Run only selected case ids",
    "  --only <id[,id]>           Alias for --case",
    "  --suite <id[,id]>          Run named manifest suites",
    "  --help, -h                 Print this help without running any cases"
  ].join("\n");
}

function normalizeExecutable(command) {
  if (command === "node" && process.env.RUNTIME_NODE) {
    const runtimeNode = path.resolve(process.env.RUNTIME_NODE);
    if (!path.isAbsolute(runtimeNode) || !fs.existsSync(runtimeNode)) throw new Error("RUNTIME_NODE must reference an existing absolute Node.js executable");
    return runtimeNode;
  }
  if (process.platform === "win32" && command === "npm") return "npm.cmd";
  return command;
}

function parseLastJsonObject(stdout) {
  const text = String(stdout || "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Unable to find JSON payload in bounded child output");
  return JSON.parse(text.slice(start, end + 1));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readReport(reportFile) {
  if (!reportFile) return null;
  try {
    return JSON.parse(fs.readFileSync(reportFile, "utf8"));
  } catch {
    return null;
  }
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parsePositiveInt(value, fallback) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function caseTimeoutMs(entry, fallback) {
  return parsePositiveInt(entry?.timeoutMs, parsePositiveInt(fallback, 180_000));
}

function appendBounded(current, chunk, limit) {
  const combined = `${current}${String(chunk || "")}`;
  return { value: combined.slice(-limit), overflow: combined.length > limit };
}

function safeChildError(value) {
  return redactSecrets(String(value || "")).replace(/[\r\n]+/g, " ").slice(-4000);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  caseTimeoutMs,
  evaluateCase,
  evaluateDeliveryExpectations,
  parsePositiveInt,
  goldenSetRunnerUsage,
  runCases,
  selectCases,
  summarizeTotals
};
