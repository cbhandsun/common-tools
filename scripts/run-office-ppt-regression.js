#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { resolveLibreOffice, resolvePdfToPpm } = require("../skills/pd-hifi-slideclone/scripts/libreoffice-benchmark");
const { collectOfficeRegressionEvidence } = require("./lib/office-regression-evidence");

const DEFAULT_OUT = "artifacts/ppt-office-regression";
const ALLOWED_SUITES = new Set(["smoke", "full"]);

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return process.stdout.write(`${usage()}\n`);
  const plan = buildOfficeRegressionPlan(args, process.env, process.cwd(), process.platform);
  verifyOfficeRegressionInputs(plan);
  prepareQualityHistory(plan);
  const powerPointExecutable = verifyPowerPointInstallation();
  const environmentEvidence = collectOfficeRegressionEvidence({
    powerPointExecutable,
    libreOfficeExecutable: plan.libreOfficeExecutable,
    pdfToPpmExecutable: plan.pdfToPpmExecutable,
    corpusFile: plan.corpusFile,
    builderRoot: plan.builderRoot
  });
  writeJsonAtomic(plan.environmentFile, environmentEvidence);
  archiveQualityHistory(plan);
  runNode(plan.corpusArgs, plan.environment);
  const reportFile = path.join(plan.outDir, "real-pptx-corpus.report.json");
  if (!fs.statSync(reportFile, { throwIfNoEntry: false })?.isFile()) throw new Error("corpus run did not produce its report");
  const crossRendererReportFile = path.join(plan.outDir, "cross-renderer", "cross-renderer-report.json");
  runNode([
    "scripts/cross-renderer-corpus-audit.js",
    "--current", reportFile,
    "--renderer", "powerpoint",
    "--max-cases", "4",
    "--case-timeout-ms", "600000",
    "--out", path.join(plan.outDir, "cross-renderer")
  ], plan.environment);
  runNode(["scripts/ppt-create-office-smoke.js", "--out", path.join(plan.outDir, "ppt-create-smoke")], plan.environment);
  const historyCohort = readHistoryCohort(plan.historyFile, environmentEvidence.fingerprint);
  const trendArgs = [
    "skills/pd-hifi-slideclone/scripts/quality-trend-gate.js",
    "--current", reportFile,
    "--history", plan.historyFile,
    "--environment", plan.environmentFile,
    "--snapshot-id", snapshotId(process.env),
    "--record",
    "--out", path.join(plan.outDir, "quality-trend-report.json")
  ];
  const baselineBootstrap = requiresCohortBootstrap(historyCohort);
  if (baselineBootstrap) trendArgs.push("--minimum-history", "0", "--required-target-ratio", "0");
  runNode(trendArgs, plan.environment);
  archiveQualityHistory(plan);
  process.stdout.write(`${JSON.stringify({
    passed: true,
    suite: plan.suite,
    reportFile,
    crossRendererReportFile,
    pptCreateOfficeSmokeReportFile: path.join(plan.outDir, "ppt-create-smoke", "ppt-create-office-smoke-report.json"),
    historyProvider: plan.historyProvider,
    environmentFingerprint: environmentEvidence.fingerprint,
    baselineBootstrap
  }, null, 2)}\n`);
}

function buildOfficeRegressionPlan(args, environment, cwd, platform) {
  if (platform !== "win32") throw new Error("Office PPT regression requires Windows");
  const suite = String(args.suite || "full").toLowerCase();
  if (!ALLOWED_SUITES.has(suite)) throw new Error("--suite must be smoke or full");
  const workRootValue = args["work-root"] || environment.SLIDECLONE_REAL_PPTX_WORK_ROOT;
  if (!workRootValue || typeof workRootValue !== "string" || workRootValue.length > 2048) {
    throw new Error("--work-root or SLIDECLONE_REAL_PPTX_WORK_ROOT is required");
  }
  const workRoot = path.resolve(workRootValue);
  if (!path.isAbsolute(workRoot)) throw new Error("work root must resolve to an absolute path");
  const outDir = safeWorkspacePath(cwd, args.out || DEFAULT_OUT, "output directory");
  const workspaceHistoryFile = safeWorkspacePath(cwd, args.history || `.ci-state/ppt-quality-history-${suite}.json`, "history file");
  const persistentHistoryRoot = optionalPersistentHistoryRoot(environment.SLIDECLONE_QUALITY_HISTORY_ROOT);
  const historyFile = persistentHistoryRoot
    ? path.join(persistentHistoryRoot, `ppt-quality-history-${suite}.json`)
    : workspaceHistoryFile;
  const corpusFile = path.resolve(cwd, "skills", "pd-hifi-slideclone", "examples", "real-pptx-corpus.manifest.json");
  const builderRoot = path.resolve(cwd, "skills", "pd-hifi-slideclone", "dotnet", "OpenXmlDeckBuilder");
  return Object.freeze({
    suite,
    workRoot,
    outDir,
    historyFile,
    historyProvider: persistentHistoryRoot ? "persistent-directory" : "actions-cache",
    workspaceHistoryFile,
    historyArchiveFile: path.join(outDir, "quality-history.snapshot.json"),
    environmentFile: path.join(outDir, "office-environment.json"),
    corpusFile,
    builderRoot,
    libreOfficeExecutable: resolveLibreOffice(),
    pdfToPpmExecutable: resolvePdfToPpm(),
    corpusArgs: Object.freeze([
      "skills/pd-hifi-slideclone/scripts/real-pptx-corpus-runner.js",
      "--suite", suite,
      "--concurrency", "1",
      "--fresh", "true",
      "--case-timeout-ms", "600000",
      "--out", outDir
    ]),
    environment: Object.freeze({ ...environment, SLIDECLONE_REAL_PPTX_WORK_ROOT: workRoot })
  });
}

function verifyOfficeRegressionInputs(plan) {
  if (!fs.statSync(plan.workRoot, { throwIfNoEntry: false })?.isDirectory()) throw new Error("real PPTX work root does not exist");
  const requiredDecks = plan.suite === "smoke"
    ? ["AI_Product_Asset_OS", "Digital_Product_Brain", "PM_Portal_AI_Skills_Engine"]
    : ["AI_Product_Asset_OS", "Digital_Product_Brain", "PM_Portal_AI_Skills_Engine", "Intelligent_R_D_Asset_Blueprint", "PM_Portal_AI_Asset_Hub", "AI_Powered_Product_Workflow_Transformation"];
  const missing = requiredDecks.filter((deck) => !fs.statSync(path.join(plan.workRoot, `${deck}.work`), { throwIfNoEntry: false })?.isDirectory());
  if (missing.length) throw new Error(`real PPTX work root is missing ${missing.length} required deck directories`);
  for (const executable of [plan.libreOfficeExecutable, plan.pdfToPpmExecutable]) {
    if (!fs.statSync(executable, { throwIfNoEntry: false })?.isFile()) throw new Error("Office regression rendering dependency is unavailable");
  }
  fs.mkdirSync(plan.outDir, { recursive: true });
  fs.mkdirSync(path.dirname(plan.historyFile), { recursive: true });
}

function prepareQualityHistory(plan) {
  fs.mkdirSync(path.dirname(plan.historyFile), { recursive: true });
  fs.mkdirSync(path.dirname(plan.workspaceHistoryFile), { recursive: true });
  if (plan.historyFile === plan.workspaceHistoryFile) return;
  if (!fs.existsSync(plan.historyFile) && fs.existsSync(plan.workspaceHistoryFile)) {
    copyFileAtomic(plan.workspaceHistoryFile, plan.historyFile);
  }
}

function archiveQualityHistory(plan) {
  if (!fs.existsSync(plan.historyFile)) return false;
  readHistoryCount(plan.historyFile);
  if (plan.historyFile !== plan.workspaceHistoryFile) copyFileAtomic(plan.historyFile, plan.workspaceHistoryFile);
  copyFileAtomic(plan.historyFile, plan.historyArchiveFile);
  return true;
}

function verifyPowerPointInstallation(commandRunner = spawnSync, stat = (file) => fs.statSync(file, { throwIfNoEntry: false })) {
  const keys = [
    "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\POWERPNT.EXE",
    "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\POWERPNT.EXE"
  ];
  for (const key of keys) {
    const result = commandRunner("reg.exe", ["query", key, "/ve"], { encoding: "utf8", windowsHide: true, timeout: 10000 });
    if (result.status !== 0 || typeof result.stdout !== "string") continue;
    const executable = /REG_SZ\s+([^\r\n]+)/u.exec(result.stdout)?.[1]?.trim().replace(/^"|"$/gu, "");
    if (executable && stat(executable)?.isFile()) return executable;
  }
  throw new Error("PowerPoint installation preflight failed");
}

function runNode(args, environment) {
  const result = spawnSync(process.execPath, args, { cwd: process.cwd(), env: environment, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Office regression stage failed with exit code ${result.status}`);
}

function readHistoryCount(file) {
  if (!fs.existsSync(file)) return 0;
  const parsed = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, ""));
  if (parsed?.version !== 1 || !Array.isArray(parsed.snapshots) || parsed.snapshots.length > 1000) throw new Error("quality history is invalid");
  return parsed.snapshots.length;
}

function readHistoryCohort(file, environmentFingerprint) {
  if (!fs.existsSync(file)) return { total: 0, compatible: 0, fingerprinted: 0, legacyOnly: false };
  const parsed = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, ""));
  if (parsed?.version !== 1 || !Array.isArray(parsed.snapshots) || parsed.snapshots.length > 1000) throw new Error("quality history is invalid");
  const fingerprint = String(environmentFingerprint || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(fingerprint)) throw new TypeError("environment fingerprint is invalid");
  const fingerprinted = parsed.snapshots.filter((item) => item?.environmentFingerprint).length;
  const compatible = parsed.snapshots.filter((item) => String(item?.environmentFingerprint || "").toLowerCase() === fingerprint).length;
  return {
    total: parsed.snapshots.length,
    compatible,
    fingerprinted,
    legacyOnly: parsed.snapshots.length > 0 && fingerprinted === 0
  };
}

function requiresCohortBootstrap(cohort) {
  if (!cohort || typeof cohort !== "object") throw new TypeError("quality history cohort is invalid");
  const { total, compatible, fingerprinted, legacyOnly } = cohort;
  if (![total, compatible, fingerprinted].every((value) => Number.isInteger(value) && value >= 0)
    || compatible > total || fingerprinted > total || typeof legacyOnly !== "boolean") {
    throw new TypeError("quality history cohort is invalid");
  }
  return total === 0 || compatible === 0 || legacyOnly;
}

function safeWorkspacePath(cwd, value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) throw new TypeError(`${label} is invalid`);
  const root = path.resolve(cwd);
  const resolved = path.resolve(root, value);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} must stay inside the workspace`);
  return resolved;
}

function optionalPersistentHistoryRoot(value) {
  if (value == null || String(value).trim() === "") return "";
  const text = String(value).trim();
  if (text.length > 2048 || [...text].some((character) => { const code = character.codePointAt(0); return code <= 0x1f || code === 0x7f; }) || !path.isAbsolute(text)) {
    throw new TypeError("SLIDECLONE_QUALITY_HISTORY_ROOT must be a safe absolute path");
  }
  const root = path.resolve(text);
  if (root === path.parse(root).root) throw new Error("SLIDECLONE_QUALITY_HISTORY_ROOT cannot be a filesystem root");
  return root;
}

function copyFileAtomic(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.copyFileSync(source, temporary);
    fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function snapshotId(environment) {
  const raw = environment.GITHUB_SHA
    ? `${environment.GITHUB_SHA}-${environment.GITHUB_RUN_ID || "local"}`
    : `local-${new Date().toISOString()}`;
  return raw.replace(/[^A-Za-z0-9._:-]/gu, "-").slice(0, 160);
}

function parseArgs(argv) {
  const args = {};
  const allowed = new Set(["suite", "work-root", "out", "history", "help"]);
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) throw new Error(`Unexpected positional argument: ${item}`);
    const key = item.slice(2);
    if (!allowed.has(key)) throw new Error(`Unknown option: --${key}`);
    if (key === "help") { args.help = true; continue; }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${key}`);
    args[key] = next;
    index += 1;
  }
  return args;
}

function usage() {
  return "Usage: node scripts/run-office-ppt-regression.js --work-root <external-work-root> [--suite smoke|full]";
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = {
  archiveQualityHistory,
  buildOfficeRegressionPlan,
  optionalPersistentHistoryRoot,
  parseArgs,
  prepareQualityHistory,
  readHistoryCohort,
  readHistoryCount,
  requiresCohortBootstrap,
  safeWorkspacePath,
  snapshotId,
  verifyPowerPointInstallation
};
