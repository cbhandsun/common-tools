#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { buildOpenXmlDecks } = require("./adapters/pptx-openxml-dotnet");
const { runComponentAssetSelfFidelityBatch } = require("./component-asset-self-fidelity-batch");
const { harvestAppliedPptComponents, sanitizeProvider } = require("./harvest-applied-ppt-components");

const DEFAULT_OUT = path.join("runs", "plugin-component-inventory", "isolated-collection");
const DEFAULT_PROVIDER = "islide";

function parseArgs(argv = process.argv) {
  const args = {
    init: false,
    ingest: "",
    out: DEFAULT_OUT,
    provider: DEFAULT_PROVIDER,
    label: "plugin-component",
    verifyFidelity: false,
    promoteFidelityReport: ""
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--init") {
      args.init = true;
    } else if (arg === "--ingest" && next) {
      args.ingest = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (arg === "--provider" && next) {
      args.provider = next;
      index += 1;
    } else if (arg === "--label" && next) {
      args.label = next;
      index += 1;
    } else if (arg === "--verify-fidelity") {
      args.verifyFidelity = true;
    } else if (arg === "--promote-fidelity-report" && next) {
      args.promoteFidelityReport = next;
      index += 1;
    } else {
      throw new Error(`Unknown component-isolated-collection-session argument: ${arg}`);
    }
  }
  if (!args.init && !args.ingest && !args.promoteFidelityReport) {
    throw new Error("Specify --init, --ingest <saved-fixture.pptx>, or --promote-fidelity-report <report.json>.");
  }
  args.provider = sanitizeProvider(args.provider);
  args.label = sanitizeLabel(args.label);
  return args;
}

async function runCollectionSession(options = {}) {
  const args = {
    init: false,
    ingest: "",
    out: DEFAULT_OUT,
    provider: DEFAULT_PROVIDER,
    label: "plugin-component",
    verifyFidelity: false,
    promoteFidelityReport: "",
    ...options
  };
  args.provider = sanitizeProvider(args.provider);
  args.label = sanitizeLabel(args.label);
  const outDir = path.resolve(String(args.out || DEFAULT_OUT));
  const paths = sessionPaths(outDir, args.provider);
  fs.mkdirSync(outDir, { recursive: true });
  let initialized = null;
  if (args.init === true) initialized = await initializeCollectionSession({ ...args, outDir, paths });
  let ingested = null;
  if (args.ingest) ingested = await ingestCollectionFixture({ ...args, outDir, paths });
  let promoted = null;
  if (args.promoteFidelityReport) {
    promoted = promoteFidelityReport({ reportFile: args.promoteFidelityReport, paths });
  }
  return {
    provider: "component-isolated-collection-session-v1",
    outDir,
    initialized,
    ingested,
    promoted,
    paths
  };
}

async function initializeCollectionSession(options = {}) {
  const outDir = path.resolve(String(options.outDir || options.out || DEFAULT_OUT));
  const provider = sanitizeProvider(options.provider || DEFAULT_PROVIDER);
  const paths = options.paths || sessionPaths(outDir, provider);
  fs.mkdirSync(paths.fixtureDir, { recursive: true });
  const fixtureIr = buildCollectionFixtureIr();
  fs.writeFileSync(paths.fixtureIr, `${JSON.stringify(fixtureIr, null, 2)}\n`, "utf8");
  const guide = buildCollectionGuide({ provider, fixturePptx: paths.fixturePptx, outDir });
  fs.writeFileSync(paths.guide, guide, "utf8");
  const buildFixture = typeof options.buildFixture === "function" ? options.buildFixture : buildFixturePptx;
  await buildFixture({ irFile: paths.fixtureIr, outFile: paths.fixturePptx, outDir });
  const report = {
    provider: "component-isolated-collection-fixture-v1",
    createdAt: new Date().toISOString(),
    fixturePptx: paths.fixturePptx,
    fixtureIr: paths.fixtureIr,
    guide: paths.guide,
    status: fs.existsSync(paths.fixturePptx) ? "ready" : "build-failed"
  };
  if (report.status !== "ready") throw new Error("Isolated collection fixture was not created.");
  fs.writeFileSync(paths.fixtureReport, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function ingestCollectionFixture(options = {}) {
  const outDir = path.resolve(String(options.outDir || options.out || DEFAULT_OUT));
  const provider = sanitizeProvider(options.provider || DEFAULT_PROVIDER);
  const label = sanitizeLabel(options.label || "plugin-component");
  const paths = options.paths || sessionPaths(outDir, provider);
  const source = path.resolve(String(options.ingest || ""));
  if (!source || !/\.pptx$/i.test(source) || !fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new Error("--ingest must be an existing .pptx collection fixture.");
  }
  if (!isPathInside(source, paths.fixtureDir)) {
    throw new Error("--ingest must stay inside this session's fixture directory.");
  }
  const fixtureValidation = inspectPptxFixture(source);
  if (!fixtureValidation.valid) {
    return writeInvalidFixtureReport({
      source,
      label,
      provider,
      paths,
      validation: fixtureValidation
    });
  }
  fs.mkdirSync(paths.stagingDir, { recursive: true });
  const harvested = harvestAppliedPptComponents({
    sources: [source],
    out: paths.stagingDir,
    provider,
    maxFiles: 1,
    includeStructure: true,
    structureMaxSlides: 2,
    structureMaxComponentCatalogItems: 20
  });
  const verification = harvested.components.map((component) => verifyNativeComponent(component));
  const accepted = verification.filter((item) => item.status === "verified");
  const rejected = verification.filter((item) => item.status !== "verified");
  let verifiedManifest = materializeVerifiedComponents({
    outDir: paths.verifiedProviderDir,
    provider,
    label,
    accepted
  });
  let fidelity = null;
  if (shouldRunSelfFidelity(options.verifyFidelity, accepted)) {
    fidelity = await runComponentAssetSelfFidelityBatch({
      files: verifiedManifest.components.map((component) => component.path),
      out: path.join(outDir, "self-fidelity", provider),
      concurrency: 2,
      maxAssets: Math.max(1, verifiedManifest.components.length),
      maxDepth: 0,
      maxScannedEntries: 100,
      maxPixelDiffRatio: 0.15,
      maxForegroundMissingRatio: 0.18,
      maxMeanDelta: 28,
      maxRegionPixelDiffRatio: 0.18,
      maxRegionForegroundMissingRatio: 0.2,
      maxRegionMeanDelta: 36
    });
    verifiedManifest = promoteFidelityVerifiedComponents({
      manifest: verifiedManifest,
      report: fidelity,
      manifestFile: path.join(paths.verifiedProviderDir, "manifest.json")
    });
  }
  const report = {
    provider: "component-isolated-collection-ingest-v1",
    collectionProvider: provider,
    createdAt: new Date().toISOString(),
    fixture: source,
    label,
    stagingManifest: path.join(paths.stagingDir, "manifest.json"),
    verifiedManifest: path.join(paths.verifiedProviderDir, "manifest.json"),
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    accepted,
    rejected,
    verifiedManifestSummary: {
      copiedCount: verifiedManifest.copiedCount,
      verification: fidelity
        ? "native-structure-and-self-fidelity"
        : accepted.length > 0 ? "native-structure-only" : "rejected-before-self-fidelity",
      selfFidelityPromoted: fidelity?.summary?.promoted || 0
    },
    ...(fidelity ? { fidelity: compactFidelityReport(fidelity) } : {}),
    nextStep: fidelity
      ? "Refresh the component inventory using the verified directory; only fidelity-promoted assets should be broadly reused."
      : accepted.length > 0
      ? "Run component self-fidelity before broad promotion; this asset is structure-verified but not visual-replay-promoted."
      : "Apply a component to the isolated fixture and save it before ingesting again."
  };
  fs.writeFileSync(paths.ingestReport, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  appendIngestHistory(paths.ingestHistory, report);
  return report;
}

// Reject failed downloads before OpenXML harvesting or rendering consumes time.
function inspectPptxFixture(source) {
  try {
    const sizeBytes = fs.statSync(source).size;
    if (sizeBytes < 4) {
      return { valid: false, sizeBytes, reasons: ["pptx-file-too-small"] };
    }
    const signature = Buffer.alloc(4);
    const file = fs.openSync(source, "r");
    try {
      fs.readSync(file, signature, 0, signature.length, 0);
    } finally {
      fs.closeSync(file);
    }
    return signature.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
      ? { valid: true, sizeBytes, reasons: [] }
      : { valid: false, sizeBytes, reasons: ["invalid-pptx-zip-signature"] };
  } catch {
    return { valid: false, sizeBytes: 0, reasons: ["pptx-file-read-failed"] };
  }
}

function writeInvalidFixtureReport({ source, label, provider, paths, validation }) {
  const rejected = [{
    source,
    name: path.basename(source),
    sha256: "",
    status: "rejected",
    reasons: validation.reasons,
    component: {
      provider,
      source,
      path: source,
      name: path.basename(source),
      sizeBytes: validation.sizeBytes,
      assetKind: "presentation-template",
      roleTags: ["applied-component", `${provider}-applied-component`, "invalid-fixture"]
    }
  }];
  const report = {
    provider: "component-isolated-collection-ingest-v1",
    collectionProvider: provider,
    createdAt: new Date().toISOString(),
    fixture: source,
    label,
    stagingManifest: path.join(paths.stagingDir, "manifest.json"),
    verifiedManifest: path.join(paths.verifiedProviderDir, "manifest.json"),
    acceptedCount: 0,
    rejectedCount: 1,
    accepted: [],
    rejected,
    verifiedManifestSummary: {
      copiedCount: 0,
      verification: "preflight-rejected",
      selfFidelityPromoted: 0
    },
    nextStep: "Save a valid PowerPoint fixture after applying a component, then ingest it again."
  };
  fs.writeFileSync(paths.ingestReport, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  appendIngestHistory(paths.ingestHistory, report);
  return report;
}

function appendIngestHistory(file, report = {}) {
  const record = {
    provider: String(report.collectionProvider || report.provider || "unknown"),
    createdAt: String(report.createdAt || new Date().toISOString()),
    fixture: String(report.fixture || ""),
    label: String(report.label || ""),
    acceptedCount: nonNegativeInt(report.acceptedCount),
    rejectedCount: nonNegativeInt(report.rejectedCount),
    rejectionReasons: uniqueStrings((report.rejected || []).flatMap((item) => item?.reasons || []))
  };
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, "utf8");
}

async function buildFixturePptx({ irFile, outFile, outDir }) {
  await buildOpenXmlDecks([{ irFile, outFile }], {
    skillRoot: path.resolve(__dirname, ".."),
    outputDir: outDir,
    configFile: path.join(process.cwd(), "slideclone.config.json"),
    config: {}
  });
}

function buildCollectionFixtureIr() {
  return {
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      background: { fill: "#FFFFFF" },
      shapes: [],
      textBoxes: [],
      images: [],
      tables: [],
      charts: [],
      source: { detector: "isolated-plugin-component-collection" }
    }]
  };
}

function buildCollectionGuide({ provider, fixturePptx, outDir }) {
  return [
    "# Isolated Plugin Component Collection",
    "",
    "This deck is disposable. Do not apply components to a business presentation during collection.",
    "",
    "1. Open the fixture PPTX below in PowerPoint.",
    `2. In ${provider}, apply one component to the blank slide and save the fixture in place.`,
    "3. Run the ingest command below. It accepts only this session fixture directory.",
    "4. Structure-verified assets enter the local registry. Run self-fidelity before broad promotion.",
    "",
    `Fixture: ${fixturePptx}`,
    "",
    "```powershell",
    `node skills\\pd-hifi-slideclone\\scripts\\component-isolated-collection-session.js --ingest \"${fixturePptx}\" --provider ${provider} --label <component-name> --out \"${outDir}\"`,
    "```",
    "",
    "```powershell",
    `node skills\\pd-hifi-slideclone\\scripts\\component-asset-self-fidelity-batch.js --root \"${path.join(outDir, "verified", provider)}\" --out \"${path.join(outDir, "self-fidelity", provider)}\" --concurrency 2 --fail-on-reject`,
    "```",
    ""
  ].join("\n");
}

function verifyNativeComponent(component = {}) {
  const summary = component.learningSummary || {};
  const catalog = Array.isArray(summary.componentCatalog) ? summary.componentCatalog : [];
  const groups = catalog
    .map((group) => ({ group, metrics: groupMetrics(group) }))
    .filter((entry) => entry.metrics.nativeObjectCount >= 3)
    .filter((entry) => entry.metrics.pictureRatio <= 0.45)
    .filter((entry) => ["high", "medium"].includes(String(entry.group?.reuseReadiness?.level || "").toLowerCase()))
    .sort((a, b) => b.metrics.nativeObjectCount - a.metrics.nativeObjectCount || a.metrics.pictureRatio - b.metrics.pictureRatio);
  const best = groups[0];
  const reasons = [];
  if (summary.status !== "ok") reasons.push("openxml-learning-failed");
  if (catalog.length === 0) reasons.push("no-component-groups");
  if (!best) reasons.push("no-editable-native-group");
  return {
    source: component.path,
    name: component.name,
    sha256: component.sha256,
    status: reasons.length === 0 ? "verified" : "rejected",
    reasons,
    ...(best ? {
      groupId: best.group.id,
      structure: best.group.structure || null,
      nativeObjectCount: best.metrics.nativeObjectCount,
      pictureCount: best.metrics.pictureCount,
      pictureRatio: best.metrics.pictureRatio
    } : {}),
    component
  };
}

function groupMetrics(group = {}) {
  const shapeCount = nonNegativeInt(group.shapeCount);
  const connectorCount = nonNegativeInt(group.connectorCount);
  const textRuns = nonNegativeInt(group.textRuns);
  const pictureCount = nonNegativeInt(group.pictureCount);
  const nativeObjectCount = shapeCount + connectorCount + textRuns;
  const totalObjectCount = nativeObjectCount + pictureCount;
  return {
    nativeObjectCount,
    pictureCount,
    pictureRatio: totalObjectCount > 0 ? round(pictureCount / totalObjectCount) : 1
  };
}

function materializeVerifiedComponents({ outDir, provider, label, accepted = [] } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const manifestFile = path.join(outDir, "manifest.json");
  const existingComponents = readExistingComponents(manifestFile);
  const componentsByKey = new Map();
  for (const component of existingComponents) {
    componentsByKey.set(componentIdentity(component), component);
  }
  let copiedCount = 0;
  for (const item of accepted) {
    const source = item.component?.path;
    if (!source || !fs.existsSync(source)) continue;
    const target = path.join(outDir, path.basename(source));
    fs.copyFileSync(source, target);
    copiedCount += 1;
    const component = {
      ...item.component,
      path: target,
      roleTags: uniqueStrings([
        ...(item.component?.roleTags || []),
        "isolated-collection",
        "native-structure-verified"
      ]),
      collection: {
        label,
        verification: "native-structure-only",
        groupId: item.groupId,
        nativeObjectCount: item.nativeObjectCount,
        pictureRatio: item.pictureRatio
      }
    };
    const key = componentIdentity(component);
    const existing = componentsByKey.get(key);
    componentsByKey.set(key, existing ? mergeComponentRecords(existing, component) : component);
  }
  const components = [...componentsByKey.values()]
    .sort((left, right) => String(left.name || "").localeCompare(String(right.name || "")));
  const manifest = {
    provider: "isolated-plugin-component-collection-v1",
    createdAt: new Date().toISOString(),
    collectionProvider: provider,
    copiedCount,
    componentCount: components.length,
    components
  };
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

function readExistingComponents(manifestFile) {
  if (!manifestFile || !fs.existsSync(manifestFile)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    return Array.isArray(parsed?.components) ? parsed.components.filter((component) => component && typeof component === "object") : [];
  } catch {
    return [];
  }
}

function componentIdentity(component = {}) {
  const sha256 = String(component.sha256 || "").trim().toLowerCase();
  if (sha256) return `sha256:${sha256}`;
  return `path:${path.resolve(String(component.path || "")).toLowerCase()}`;
}

function mergeComponentRecords(existing = {}, incoming = {}) {
  return {
    ...existing,
    ...incoming,
    roleTags: uniqueStrings([...(existing.roleTags || []), ...(incoming.roleTags || [])]),
    selfFidelityPromoted: existing.selfFidelityPromoted === true || incoming.selfFidelityPromoted === true,
    selfFidelity: existing.selfFidelity || incoming.selfFidelity || undefined
  };
}

function promoteFidelityVerifiedComponents({ manifest = {}, report = {}, manifestFile = "" } = {}) {
  const passed = new Map((Array.isArray(report.results) ? report.results : [])
    .filter((result) => result?.passed === true && typeof result.file === "string")
    .map((result) => [path.resolve(result.file).toLowerCase(), result]));
  const components = (Array.isArray(manifest.components) ? manifest.components : []).map((component) => {
    const result = passed.get(path.resolve(String(component.path || "")).toLowerCase());
    if (!result) return component;
    return {
      ...component,
      roleTags: uniqueStrings([...(component.roleTags || []), "self-fidelity-promoted"]),
      selfFidelityPromoted: true,
      selfFidelity: {
        passed: true,
        reportFile: String(result.reportFile || ""),
        replayPptx: String(result.replayPptx || "")
      }
    };
  });
  const promoted = { ...manifest, components };
  if (manifestFile) fs.writeFileSync(manifestFile, `${JSON.stringify(promoted, null, 2)}\n`, "utf8");
  return promoted;
}

function promoteFidelityReport({ reportFile = "", paths = {} } = {}) {
  const manifestFile = String(paths.verifiedProviderDir || "")
    ? path.join(paths.verifiedProviderDir, "manifest.json")
    : "";
  const resolvedReport = path.resolve(String(reportFile || ""));
  if (!manifestFile || !fs.existsSync(manifestFile)) {
    throw new Error("Verified component manifest is missing for this provider.");
  }
  if (!fs.existsSync(resolvedReport) || !fs.statSync(resolvedReport).isFile()) {
    throw new Error("--promote-fidelity-report must be an existing report file.");
  }
  let report;
  try {
    report = JSON.parse(fs.readFileSync(resolvedReport, "utf8"));
  } catch {
    throw new Error("--promote-fidelity-report must contain valid JSON.");
  }
  if (!Array.isArray(report?.results)) {
    throw new Error("--promote-fidelity-report must contain a results array.");
  }
  const verifiedRoot = path.resolve(String(paths.verifiedProviderDir || ""));
  const allowedResults = report.results.filter((result) => result?.passed === true
    && typeof result.file === "string"
    && isPathInside(result.file, verifiedRoot));
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const before = new Set((manifest.components || [])
    .filter((component) => component?.selfFidelityPromoted === true)
    .map(componentIdentity));
  const promoted = promoteFidelityVerifiedComponents({
    manifest,
    report: { results: allowedResults },
    manifestFile
  });
  const newlyPromoted = (promoted.components || [])
    .filter((component) => component?.selfFidelityPromoted === true && !before.has(componentIdentity(component)))
    .length;
  return {
    reportFile: resolvedReport,
    manifestFile,
    promoted: newlyPromoted,
    ignored: report.results.length - allowedResults.length
  };
}

function compactFidelityReport(report = {}) {
  return {
    reportFile: String(report.reportFile || ""),
    promoted: nonNegativeInt(report.summary?.promoted),
    rejected: nonNegativeInt(report.summary?.rejected),
    skipped: nonNegativeInt(report.summary?.skipped)
  };
}

function sessionPaths(outDir, provider) {
  const fixtureDir = path.join(outDir, "fixture");
  return {
    fixtureDir,
    fixtureIr: path.join(fixtureDir, "collection-fixture.ir.json"),
    fixturePptx: path.join(fixtureDir, "collection-fixture.pptx"),
    fixtureReport: path.join(fixtureDir, "collection-fixture.report.json"),
    guide: path.join(outDir, "collection-guide.md"),
    ingestHistory: path.join(outDir, "collection-ingest-history.jsonl"),
    stagingDir: path.join(outDir, "staging", provider),
    verifiedProviderDir: path.join(outDir, "verified", provider),
    ingestReport: path.join(outDir, "collection-ingest.report.json")
  };
}

function isPathInside(file, root) {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function sanitizeLabel(value) {
  const label = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return label || "plugin-component";
}

function nonNegativeInt(value) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function round(value) {
  return Math.round(Number(value) * 10000) / 10000;
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
}

function argsBoolean(value) {
  return value === true || value === "true" || value === "1";
}

function shouldRunSelfFidelity(verifyFidelity, accepted = []) {
  return argsBoolean(verifyFidelity) && Array.isArray(accepted) && accepted.length > 0;
}

async function main() {
  const args = parseArgs(process.argv);
  const result = await runCollectionSession(args);
  process.stdout.write(`${JSON.stringify({
    fixture: result.initialized?.fixturePptx || null,
    accepted: result.ingested?.acceptedCount ?? null,
    rejected: result.ingested?.rejectedCount ?? null,
    promoted: result.promoted?.promoted ?? null,
    outDir: result.outDir
  }, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildCollectionFixtureIr,
  buildCollectionGuide,
  groupMetrics,
  ingestCollectionFixture,
  initializeCollectionSession,
  isPathInside,
  materializeVerifiedComponents,
  parseArgs,
  promoteFidelityReport,
  runCollectionSession,
  sessionPaths,
  verifyNativeComponent,
  _private: {
    argsBoolean,
    appendIngestHistory,
    compactFidelityReport,
    componentIdentity,
    inspectPptxFixture,
    mergeComponentRecords,
    promoteFidelityReport,
    promoteFidelityVerifiedComponents,
    readExistingComponents,
    sanitizeLabel,
    shouldRunSelfFidelity
  }
};
