"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { COMPONENT_FAMILY_IDS } = require("./lib/component-coverage-family");

const DEFAULT_MANIFEST = path.join("skills", "pd-hifi-slideclone", "examples", "image-to-editable-component-recall-corpus.manifest.json");
const DEFAULT_OUT = path.join("runs", "image-to-editable-component-recall", "corpus-plan.json");
const MAX_CASES = 128;
const MAX_FAMILIES = 32;
const MAX_TEXT = 500;
const ACCEPTANCE_REPORT_PROFILE = "image-to-editable-component-recall-report";
const ACCEPTANCE_GATE_PROFILE = "image-to-editable-component-recall-gate";

function parseArgs(argv = process.argv) {
  const args = {
    manifest: DEFAULT_MANIFEST,
    out: DEFAULT_OUT,
    requireArtifacts: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--manifest" && next) {
      args.manifest = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (arg === "--require-artifacts") {
      args.requireArtifacts = true;
    } else {
      throw new Error(`Unknown image-to-editable-component-recall-corpus argument: ${arg}`);
    }
  }
  return args;
}

function buildImageToEditableComponentRecallCorpusPlan(options = {}) {
  const manifestFile = path.resolve(options.manifest || DEFAULT_MANIFEST);
  const manifest = readJson(manifestFile);
  const normalized = validateCorpusManifest(manifest);
  const cases = normalized.cases.map((entry) => normalizeCaseArtifacts(entry, options));
  const familyCounts = {};
  for (const entry of cases) {
    for (const family of entry.expectedComponentFamilies) familyCounts[family] = (familyCounts[family] || 0) + 1;
  }
  const missingRequiredComponentFamilies = normalized.requiredComponentFamilies.filter((family) => !familyCounts[family]);
  if (missingRequiredComponentFamilies.length > 0) {
    throw new Error(`image-to-editable recall corpus is missing required component families: ${missingRequiredComponentFamilies.join(", ")}`);
  }
  return {
    provider: "image-to-editable-component-recall-corpus-v1",
    generatedAt: new Date().toISOString(),
    manifest: path.relative(process.cwd(), manifestFile).replace(/\\/gu, "/"),
    id: normalized.id,
    description: normalized.description,
    summary: {
      caseCount: cases.length,
      requiredComponentFamilyTypes: normalized.requiredComponentFamilies.length,
      coveredComponentFamilyTypes: Object.keys(familyCounts).length,
      requiredComponentFamilies: normalized.requiredComponentFamilies,
      coveredComponentFamilyCounts: sortObject(familyCounts),
      missingRequiredComponentFamilies,
      acceptanceProfiles: normalized.acceptanceProfiles
    },
    cases
  };
}

function validateCorpusManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new TypeError("image-to-editable recall corpus manifest must be an object");
  const id = safeId(manifest.id, "manifest id");
  const description = safeText(manifest.description || "", "manifest description", MAX_TEXT);
  const requiredComponentFamilies = componentFamilies(manifest.requiredComponentFamilies || [], "requiredComponentFamilies");
  const acceptanceProfiles = validateAcceptanceProfiles(manifest.acceptanceProfiles || {});
  if (!Array.isArray(manifest.cases) || manifest.cases.length < 1 || manifest.cases.length > MAX_CASES) {
    throw new TypeError(`image-to-editable recall corpus cases must contain between 1 and ${MAX_CASES} entries`);
  }
  const seen = new Set();
  const cases = manifest.cases.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new TypeError(`corpus case ${index} must be an object`);
    const caseId = safeId(entry.id, `corpus case ${index} id`);
    if (seen.has(caseId)) throw new Error(`Duplicate image-to-editable recall corpus case id: ${caseId}`);
    seen.add(caseId);
    const expectedComponentFamilies = componentFamilies(entry.expectedComponentFamilies || [], `corpus case ${caseId} expectedComponentFamilies`);
    if (expectedComponentFamilies.length < 1) throw new Error(`corpus case ${caseId} must declare expected component families`);
    const artifacts = normalizeArtifacts(entry.artifacts, caseId);
    return Object.freeze({
      id: caseId,
      title: safeText(entry.title || caseId, `corpus case ${caseId} title`, 160),
      source: normalizeSource(entry.source, caseId),
      expectedComponentFamilies,
      artifacts,
      acceptance: normalizeAcceptance(entry.acceptance || {}, caseId, acceptanceProfiles)
    });
  });
  return Object.freeze({ id, description, requiredComponentFamilies, acceptanceProfiles, cases });
}

function validateAcceptanceProfiles(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("acceptanceProfiles must be an object");
  const recallReport = safeId(value.recallReport || ACCEPTANCE_REPORT_PROFILE, "acceptance recallReport profile");
  const coverageGate = safeId(value.coverageGate || ACCEPTANCE_GATE_PROFILE, "acceptance coverageGate profile");
  if (recallReport !== ACCEPTANCE_REPORT_PROFILE) throw new Error("acceptance recallReport profile must use image-to-editable-component-recall-report");
  if (coverageGate !== ACCEPTANCE_GATE_PROFILE) throw new Error("acceptance coverageGate profile must use image-to-editable-component-recall-gate");
  return Object.freeze({ recallReport, coverageGate });
}

function normalizeCaseArtifacts(entry, options = {}) {
  const outputIr = resolveArtifactPath(entry.artifacts.outputIr, "outputIr", { file: true, required: options.requireArtifacts });
  const artifacts = {
    inputWorkDir: resolveArtifactPath(entry.artifacts.inputWorkDir, "inputWorkDir", { directory: true, required: options.requireArtifacts }),
    outputIr,
    outputPptx: resolveArtifactPath(entry.artifacts.outputPptx, "outputPptx", { file: true, required: options.requireArtifacts }),
    componentCandidateReport: entry.artifacts.componentCandidateReport
      ? resolveArtifactPath(entry.artifacts.componentCandidateReport, "componentCandidateReport", { file: true, required: options.requireArtifacts })
      : ""
  };
  const observedComponentFamilies = options.requireArtifacts ? observedComponentFamiliesFromIr(outputIr, entry.id) : [];
  const missingExpectedComponentFamilies = entry.expectedComponentFamilies.filter((family) => !observedComponentFamilies.includes(family));
  if (options.requireArtifacts && missingExpectedComponentFamilies.length > 0) {
    throw new Error(`corpus case ${entry.id} outputIr is missing expected component families: ${missingExpectedComponentFamilies.join(", ")}`);
  }
  return Object.freeze({
    ...entry,
    artifacts,
    observedComponentFamilies,
    missingExpectedComponentFamilies
  });
}

function normalizeArtifacts(value, caseId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`corpus case ${caseId} artifacts must be an object`);
  return Object.freeze({
    inputWorkDir: safeRelativePath(value.inputWorkDir, `corpus case ${caseId} inputWorkDir`),
    outputIr: safeRelativePath(value.outputIr, `corpus case ${caseId} outputIr`),
    outputPptx: safeRelativePath(value.outputPptx, `corpus case ${caseId} outputPptx`),
    componentCandidateReport: value.componentCandidateReport == null ? "" : safeRelativePath(value.componentCandidateReport, `corpus case ${caseId} componentCandidateReport`)
  });
}

function normalizeSource(value, caseId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`corpus case ${caseId} source must be an object`);
  const kind = safeId(value.kind || "image", `corpus case ${caseId} source kind`);
  if (!["image", "pdf", "image-pptx"].includes(kind)) throw new Error(`corpus case ${caseId} source kind is unsupported`);
  return Object.freeze({
    kind,
    path: safeRelativePath(value.path, `corpus case ${caseId} source path`),
    page: value.page == null ? null : boundedInteger(value.page, `corpus case ${caseId} source page`, 1, 10000),
    provenance: safeText(value.provenance || "", `corpus case ${caseId} source provenance`, MAX_TEXT)
  });
}

function normalizeAcceptance(value, caseId, profiles) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`corpus case ${caseId} acceptance must be an object`);
  const reportProfile = safeId(value.recallReportProfile || profiles.recallReport, `corpus case ${caseId} recallReportProfile`);
  const gateProfile = safeId(value.coverageGateProfile || profiles.coverageGate, `corpus case ${caseId} coverageGateProfile`);
  if (reportProfile !== profiles.recallReport || gateProfile !== profiles.coverageGate) {
    throw new Error(`corpus case ${caseId} acceptance profiles must match manifest acceptanceProfiles`);
  }
  return Object.freeze({
    recallReportProfile: reportProfile,
    coverageGateProfile: gateProfile,
    requiredEvidence: Object.freeze([
      "source.componentAnalysis",
      "image-to-editable-component-recall-report",
      "component-coverage-matrix",
      "outputPptx"
    ])
  });
}

function resolveArtifactPath(value, label, options = {}) {
  const relative = safeRelativePath(value, label);
  const resolved = path.resolve(relative);
  if (options.required) {
    const stat = fs.lstatSync(resolved, { throwIfNoEntry: false });
    if (options.directory && !stat?.isDirectory()) throw new Error(`${label} is missing`);
    if (options.file && !stat?.isFile()) throw new Error(`${label} is missing`);
    if (stat?.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link`);
  }
  return path.relative(process.cwd(), resolved).replace(/\\/gu, "/");
}

function observedComponentFamiliesFromIr(file, caseId) {
  const deck = readJson(path.resolve(file));
  if (!deck || typeof deck !== "object" || Array.isArray(deck) || !Array.isArray(deck.pages)) {
    throw new Error(`corpus case ${caseId} outputIr must contain pages`);
  }
  const families = new Set();
  for (const page of deck.pages) {
    const evidence = page?.source?.componentAnalysis;
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence) || evidence.provider !== "team-component-analysis-v1") continue;
    addFamiliesFromCounts(families, evidence.detectedComponentFamilyCounts);
    addFamiliesFromCounts(families, evidence.matchedComponentFamilyCounts);
    addFamiliesFromCounts(families, evidence.strategyComponentFamilyCounts);
    if (Array.isArray(evidence.componentFamilies)) {
      for (const row of evidence.componentFamilies) {
        const family = String(row?.family || "");
        const evidenceCount = Number(row?.detectedLayers || 0) + Number(row?.matchedLayers || 0) + Number(row?.strategyLayers || 0);
        if (COMPONENT_FAMILY_IDS.includes(family) && evidenceCount > 0) families.add(family);
      }
    }
  }
  return Object.freeze([...families].sort((a, b) => a.localeCompare(b)));
}

function addFamiliesFromCounts(target, counts) {
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return;
  for (const [family, count] of Object.entries(counts)) {
    if (COMPONENT_FAMILY_IDS.includes(family) && Number(count) > 0) target.add(family);
  }
}

function componentFamilies(value, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_FAMILIES) throw new TypeError(`${label} must be a non-empty bounded array`);
  const out = value.map((item) => safeId(item, label));
  const unknown = out.filter((family) => !COMPONENT_FAMILY_IDS.includes(family));
  if (unknown.length > 0) throw new Error(`${label} contains unknown component families: ${unknown.join(", ")}`);
  if (new Set(out).size !== out.length) throw new Error(`${label} must not contain duplicates`);
  return Object.freeze([...out].sort((a, b) => a.localeCompare(b)));
}

function safeRelativePath(value, label) {
  const text = safeText(value, label, 1024).replace(/\\/gu, "/");
  if (!text || path.isAbsolute(text) || text.split("/").includes("..")) throw new TypeError(`${label} must be a safe relative path`);
  return text;
}

function safeId(value, label) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 128 || !/^[a-z0-9][a-z0-9_.-]*$/u.test(text)) throw new TypeError(`${label} must be a non-empty safe identifier`);
  return text;
}

function safeText(value, label, maximum) {
  const text = String(value ?? "").trim();
  if (text.length > maximum || /[\u0000-\u001F\u007F]/u.test(text)) throw new TypeError(`${label} is invalid`);
  return text;
}

function boundedInteger(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw new TypeError(`${label} must be an integer between ${minimum} and ${maximum}`);
  return number;
}

function sortObject(value = {}) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, ""));
}

function main() {
  const args = parseArgs(process.argv);
  const plan = buildImageToEditableComponentRecallCorpusPlan(args);
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  process.stdout.write(`caseCount: ${plan.summary.caseCount}\n`);
  process.stdout.write(`coveredComponentFamilyTypes: ${plan.summary.coveredComponentFamilyTypes}\n`);
  process.stdout.write(`plan: ${path.resolve(args.out)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${String(error?.message || error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_MANIFEST,
  DEFAULT_OUT,
  buildImageToEditableComponentRecallCorpusPlan,
  main,
  parseArgs,
  validateCorpusManifest,
  _private: {
    componentFamilies,
    normalizeSource,
    observedComponentFamiliesFromIr,
    safeRelativePath
  }
};
