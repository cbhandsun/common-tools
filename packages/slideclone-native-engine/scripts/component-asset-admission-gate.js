#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  COMPONENT_FAMILY_IDS,
  componentFamiliesForMotifs,
  inferComponentFamiliesFromText,
  sanitizeMotifs,
  uniqueComponentFamilies
} = require("./lib/component-motifs");

const PROVIDER = "component-asset-admission-gate-v1";
const SELF_FIDELITY_PROVIDER = "component-asset-self-fidelity-batch-v1";
const DEFAULT_OUT = path.join("runs", "component-asset-admission-gate.json");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = buildComponentAssetAdmissionGate(args);
  ensureDir(path.dirname(report.reportFile));
  fs.writeFileSync(report.reportFile, `${JSON.stringify(stripRuntimeOnlyFields(report), null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    admitted: report.summary.admitted,
    rejected: report.summary.rejected,
    componentFamilyTypes: report.summary.componentFamilyTypes,
    reportFile: report.reportFile
  }, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

function parseArgs(argv = []) {
  const args = {
    selfFidelityReport: "",
    out: DEFAULT_OUT,
    minAdmitted: 1,
    minComponentFamilyTypes: 1,
    requiredComponentFamilies: [],
    failOnReject: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--self-fidelity-report" && next) {
      args.selfFidelityReport = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (arg === "--min-admitted" && next) {
      args.minAdmitted = boundedInteger(next, 0, 10000, args.minAdmitted);
      index += 1;
    } else if (arg === "--min-component-family-types" && next) {
      args.minComponentFamilyTypes = boundedInteger(next, 0, COMPONENT_FAMILY_IDS.length, args.minComponentFamilyTypes);
      index += 1;
    } else if (arg === "--required-component-families" && next) {
      args.requiredComponentFamilies = parseComponentFamilies(next);
      index += 1;
    } else if (arg === "--fail-on-reject") {
      args.failOnReject = true;
    } else {
      throw new Error(`Unknown component asset admission argument: ${arg}`);
    }
  }
  return args;
}

function buildComponentAssetAdmissionGate(options = {}) {
  const selfFidelityReport = requireFile(options.selfFidelityReport, "--self-fidelity-report");
  const source = readJson(selfFidelityReport);
  if (source.provider !== SELF_FIDELITY_PROVIDER) {
    throw new Error(`component asset admission requires ${SELF_FIDELITY_PROVIDER}, got ${safeString(source.provider || "unknown")}`);
  }
  const requiredComponentFamilies = parseComponentFamilies(options.requiredComponentFamilies || []);
  const minAdmitted = boundedInteger(options.minAdmitted, 0, 10000, 1);
  const minComponentFamilyTypes = boundedInteger(options.minComponentFamilyTypes, 0, COMPONENT_FAMILY_IDS.length, 1);
  const candidates = collectCandidates(source);
  const admittedAssets = [];
  const rejectedAssets = [];
  for (const candidate of candidates) {
    const assessment = assessCandidate(candidate);
    if (assessment.admitted) {
      admittedAssets.push(assessment.asset);
    } else {
      rejectedAssets.push({
        file: assessment.asset.file,
        sha256: assessment.asset.sha256,
        provider: assessment.asset.provider,
        groupId: assessment.asset.groupId,
        families: assessment.asset.families,
        reasons: assessment.reasons
      });
    }
  }
  const componentFamilyCounts = countFamilies(admittedAssets);
  const componentFamilyTypes = Object.keys(componentFamilyCounts).length;
  const missingRequiredComponentFamilies = requiredComponentFamilies
    .filter((family) => !componentFamilyCounts[family]);
  const componentFamilyAdmissionPlan = summarizeComponentFamilyAdmissionPlan({
    requiredComponentFamilies,
    admittedAssets,
    rejectedAssets
  });
  const gateReasons = [];
  if (admittedAssets.length < minAdmitted) gateReasons.push("min-admitted-not-met");
  if (componentFamilyTypes < minComponentFamilyTypes) gateReasons.push("min-component-family-types-not-met");
  if (missingRequiredComponentFamilies.length > 0) gateReasons.push("required-component-families-missing");
  if (options.failOnReject === true && rejectedAssets.length > 0) gateReasons.push("candidate-assets-rejected");
  const reportFile = path.resolve(String(options.out || DEFAULT_OUT));
  return {
    provider: PROVIDER,
    generatedAt: new Date().toISOString(),
    sourceReport: path.resolve(selfFidelityReport),
    reportFile,
    passed: gateReasons.length === 0,
    gateReasons,
    thresholds: {
      minAdmitted,
      minComponentFamilyTypes,
      requiredComponentFamilies,
      failOnReject: options.failOnReject === true
    },
    summary: {
      candidates: candidates.length,
      admitted: admittedAssets.length,
      rejected: rejectedAssets.length,
      componentFamilyTypes,
      componentFamilyCounts,
      missingRequiredComponentFamilies
    },
    componentFamilyAdmissionPlan,
    admittedAssets,
    rejectedAssets
  };
}

function collectCandidates(report = {}) {
  const results = Array.isArray(report.results) ? report.results : [];
  const promotedAssets = Array.isArray(report.promotedAssets) ? report.promotedAssets : [];
  const seedAssets = results.length > 0 ? results : promotedAssets;
  const byIdentity = new Map();
  for (const asset of promotedAssets) byIdentity.set(candidateKey(asset), asset);
  const candidates = seedAssets.map((item) => {
    const promotedAsset = byIdentity.get(candidateKey(item)) || {};
    return {
      ...item,
      ...promotedAsset,
      group: promotedAsset.group || item.group,
      nativeObjects: item.nativeObjects || promotedAsset.nativeObjects,
      comparison: item.comparison || promotedAsset.comparison,
      regionSummary: item.regionSummary || promotedAsset.regionSummary,
      passed: item.passed === true || promotedAsset.passed === true
    };
  });
  const seen = new Set(candidates.map(candidateKey));
  for (const asset of promotedAssets) {
    if (!seen.has(candidateKey(asset))) candidates.push(asset);
  }
  return candidates;
}

function assessCandidate(candidate = {}) {
  const reasons = [];
  const file = safeString(candidate.file);
  const sha256 = safeString(candidate.sha256).toLowerCase();
  const provider = safeString(candidate.provider || "unknown-provider");
  const group = candidate.group && typeof candidate.group === "object" ? candidate.group : {};
  const families = inferFamilies(group);
  const motifs = sanitizeMotifs(group?.structure?.motifs || []);
  if (candidate.passed !== true) reasons.push("self-fidelity-not-passed");
  if (!/^[a-f0-9]{64}$/u.test(sha256)) reasons.push("invalid-sha256");
  if (!file) {
    reasons.push("missing-asset-file");
  } else {
    try {
      const stat = fs.statSync(path.resolve(file));
      if (!stat.isFile() || stat.size <= 0) reasons.push("asset-file-not-readable");
      if (/^[a-f0-9]{64}$/u.test(sha256) && hashFileSync(path.resolve(file)) !== sha256) reasons.push("asset-sha256-mismatch");
    } catch {
      reasons.push("asset-file-not-readable");
    }
  }
  for (const [key, reason] of [["reportFile", "missing-self-fidelity-report"], ["replayPptx", "missing-replay-pptx"]]) {
    if (!readableFile(candidate[key])) reasons.push(reason);
  }
  if (families.length === 0) reasons.push("missing-known-component-family");
  if (countNativeEditableObjects(candidate.nativeObjects) < 1) reasons.push("missing-native-editable-object-evidence");
  if (!candidate.comparison || candidate.comparison.ok !== true) reasons.push("visual-comparison-not-ok");
  if (!candidate.regionSummary || numberOrZero(candidate.regionSummary.regions) < 1) reasons.push("missing-region-comparison-evidence");
  if (candidate.regionSummary && numberOrZero(candidate.regionSummary.passed) < numberOrZero(candidate.regionSummary.regions)) {
    reasons.push("region-comparison-not-fully-passed");
  }
  return {
    admitted: reasons.length === 0,
    reasons,
    asset: {
      file,
      sha256,
      provider,
      groupId: safeString(group.id),
      groupName: safeString(group.name),
      motifs,
      families,
      reportFile: pathOrEmpty(candidate.reportFile),
      replayPptx: pathOrEmpty(candidate.replayPptx),
      nativeObjects: normalizeNativeObjects(candidate.nativeObjects),
      comparison: normalizeComparison(candidate.comparison),
      regionSummary: normalizeRegionSummary(candidate.regionSummary)
    }
  };
}

function inferFamilies(group = {}) {
  const motifFamilies = componentFamiliesForMotifs(group?.structure?.motifs || []);
  const textFamilies = inferComponentFamiliesFromText([
    group.id,
    group.name,
    group.structure?.kind,
    ...(Array.isArray(group.structure?.roles) ? group.structure.roles : [])
  ].map(safeString).join(" "));
  return uniqueComponentFamilies([...motifFamilies, ...textFamilies]);
}

function countFamilies(assets = []) {
  const counts = {};
  for (const asset of assets) {
    for (const family of Array.isArray(asset.families) ? asset.families : []) {
      counts[family] = (counts[family] || 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0])));
}

function summarizeComponentFamilyAdmissionPlan({
  requiredComponentFamilies = [],
  admittedAssets = [],
  rejectedAssets = []
} = {}) {
  const families = uniqueComponentFamilies([
    ...requiredComponentFamilies,
    ...admittedAssets.flatMap((asset) => asset.families || []),
    ...rejectedAssets.flatMap((asset) => asset.families || [])
  ]);
  return families.map((family, index) => {
    const admitted = admittedAssets.filter((asset) => Array.isArray(asset.families) && asset.families.includes(family));
    const rejected = rejectedAssets.filter((asset) => Array.isArray(asset.families) && asset.families.includes(family));
    const status = admitted.length > 0 ? "admitted" : rejected.length > 0 ? "rejected-candidates" : "missing";
    return {
      rank: index + 1,
      family,
      status,
      required: requiredComponentFamilies.includes(family),
      admittedAssets: admitted.length,
      rejectedCandidates: rejected.length,
      rejectionReasons: countRejectionReasons(rejected),
      nextAction: componentFamilyAdmissionNextAction(status),
      evidenceMetrics: [
        "componentAssetAdmission.summary.componentFamilyCounts",
        "componentAssetAdmission.admittedAssets",
        "componentAssetAdmission.rejectedAssets"
      ]
    };
  });
}

function componentFamilyAdmissionNextAction(status = "") {
  if (status === "admitted") return "reuse-admitted-component-asset";
  if (status === "rejected-candidates") return "repair-or-replace-rejected-component-asset";
  return "collect-and-run-component-self-fidelity";
}

function countRejectionReasons(assets = []) {
  const counts = {};
  for (const asset of assets) {
    for (const reason of Array.isArray(asset.reasons) ? asset.reasons : []) {
      counts[reason] = (counts[reason] || 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0])));
}

function countNativeEditableObjects(nativeObjects = {}) {
  return numberOrZero(nativeObjects?.shapes) + numberOrZero(nativeObjects?.textBoxes);
}

function normalizeNativeObjects(nativeObjects = {}) {
  return {
    shapes: numberOrZero(nativeObjects?.shapes),
    textBoxes: numberOrZero(nativeObjects?.textBoxes),
    images: numberOrZero(nativeObjects?.images)
  };
}

function normalizeComparison(comparison = {}) {
  return {
    ok: comparison?.ok === true,
    pixelDiffRatio: finiteOrNull(comparison?.pixelDiffRatio),
    foregroundMissingRatio: finiteOrNull(comparison?.foregroundMissingRatio),
    meanAbsoluteDelta: finiteOrNull(comparison?.meanAbsoluteDelta)
  };
}

function normalizeRegionSummary(regionSummary = {}) {
  return {
    regions: numberOrZero(regionSummary?.regions),
    passed: numberOrZero(regionSummary?.passed),
    maxPixelDiffRatio: finiteOrNull(regionSummary?.maxPixelDiffRatio),
    maxForegroundMissingRatio: finiteOrNull(regionSummary?.maxForegroundMissingRatio),
    maxMeanAbsoluteDelta: finiteOrNull(regionSummary?.maxMeanAbsoluteDelta)
  };
}

function requireFile(file, flagName) {
  if (!file) throw new Error(`${flagName} is required`);
  const resolved = path.resolve(String(file));
  if (!readableFile(resolved)) throw new Error(`${flagName} not found: ${resolved}`);
  return resolved;
}

function readableFile(file) {
  try {
    const stat = fs.statSync(path.resolve(String(file || "")));
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, ""));
}

function hashFileSync(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function parseComponentFamilies(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  const families = raw.map(safeString).filter(Boolean);
  const unknown = families.filter((family) => !COMPONENT_FAMILY_IDS.includes(family));
  if (unknown.length > 0) throw new Error(`Unknown component families: ${unknown.join(", ")}`);
  return uniqueComponentFamilies(families);
}

function candidateKey(item = {}) {
  return `${safeString(item.file)}\n${safeString(item.sha256).toLowerCase()}`;
}

function pathOrEmpty(value) {
  const text = safeString(value);
  return text ? path.resolve(text) : "";
}

function stripRuntimeOnlyFields(report = {}) {
  const { reportFile, ...rest } = report;
  return rest;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function boundedInteger(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/gu, "").trim();
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  assessCandidate,
  buildComponentAssetAdmissionGate,
  collectCandidates,
  inferFamilies,
  main,
  summarizeComponentFamilyAdmissionPlan,
  parseArgs
};
