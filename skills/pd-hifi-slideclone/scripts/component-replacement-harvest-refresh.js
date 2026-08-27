"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  harvestAppliedPptComponents
} = require("./harvest-applied-ppt-components");
const {
  buildPluginComponentInventory,
  defaultPluginComponentRoots
} = require("./lib/plugin-component-registry");
const {
  runComponentReplacementCloseLoop
} = require("./component-replacement-close-loop");
const {
  evaluateCloseLoopGate
} = require("./component-replacement-close-loop-gate");

function parseArgs(argv) {
  const args = {
    queue: "",
    out: path.join("runs", "component-replacement-harvest-refresh"),
    input: "",
    inventoryOut: "",
    closeLoopOut: "",
    gateOut: "",
    discoverRoot: "",
    discoverLimit: 30,
    learnStructure: true,
    concurrency: 1,
    decisionIr: "",
    decisionSearchCandidates: false,
    decisionCandidates: "",
    decisionShortlist: "",
    decisionReport: "",
    decisionCandidateSize: 6,
    maxDecisionActionableGaps: 0,
    minDecisionPluginTargets: 0,
    minDecisionProtectedCrops: 0,
    allowDecisionDefer: false,
    allowNeedsHarvestGate: true,
    failOnGate: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if ((arg === "--queue" || arg === "--harvest-queue") && next) {
      args.queue = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if ((arg === "--input" || arg === "--pptx-root") && next) {
      args.input = next;
      index += 1;
    } else if (arg === "--inventory-out" && next) {
      args.inventoryOut = next;
      index += 1;
    } else if (arg === "--close-loop-out" && next) {
      args.closeLoopOut = next;
      index += 1;
    } else if (arg === "--gate-out" && next) {
      args.gateOut = next;
      index += 1;
    } else if (arg === "--discover-root" && next) {
      args.discoverRoot = next;
      index += 1;
    } else if (arg === "--discover-limit" && next) {
      args.discoverLimit = Number(next);
      index += 1;
    } else if (arg === "--no-learn-structure") {
      args.learnStructure = false;
    } else if (arg === "--concurrency" && next) {
      args.concurrency = Number(next);
      index += 1;
    } else if ((arg === "--decision-ir" || arg === "--graphic-decision-ir") && next) {
      args.decisionIr = next;
      index += 1;
    } else if (arg === "--decision-search-candidates") {
      args.decisionSearchCandidates = true;
    } else if ((arg === "--decision-candidates" || arg === "--graphic-decision-candidates") && next) {
      args.decisionCandidates = next;
      index += 1;
    } else if ((arg === "--decision-shortlist" || arg === "--graphic-decision-shortlist") && next) {
      args.decisionShortlist = next;
      index += 1;
    } else if ((arg === "--decision-report" || arg === "--graphic-decision-report") && next) {
      args.decisionReport = next;
      index += 1;
    } else if (arg === "--decision-candidate-size" && next) {
      args.decisionCandidateSize = Number(next);
      index += 1;
    } else if (arg === "--max-decision-actionable-gaps" && next) {
      args.maxDecisionActionableGaps = Number(next);
      index += 1;
    } else if (arg === "--min-decision-plugin-targets" && next) {
      args.minDecisionPluginTargets = Number(next);
      index += 1;
    } else if (arg === "--min-decision-protected-crops" && next) {
      args.minDecisionProtectedCrops = Number(next);
      index += 1;
    } else if (arg === "--allow-decision-defer") {
      args.allowDecisionDefer = true;
    } else if (arg === "--disallow-needs-harvest-gate") {
      args.allowNeedsHarvestGate = false;
    } else if (arg === "--fail-on-gate") {
      args.failOnGate = true;
    } else {
      throw new Error(`Unknown component-replacement-harvest-refresh argument: ${arg}`);
    }
  }
  if (!args.queue) throw new Error("--queue is required.");
  return args;
}

async function runComponentReplacementHarvestRefresh(options = {}) {
  const args = normalizeOptions(options);
  const queue = readJson(args.queue);
  const tasks = Array.isArray(queue?.tasks) ? queue.tasks : [];
  fs.mkdirSync(args.out, { recursive: true });

  const harvests = harvestNeededProviders(tasks, args);
  const inventory = buildPluginComponentInventory({
    roots: refreshInventoryRoots(harvests),
    learnStructure: args.learnStructure,
    learnMaxAssets: 60,
    learnMaxSlides: 4,
    learnMaxComponentCatalogItems: 16,
    maxDepth: 6,
    maxFilesPerRoot: 1200,
    maxTotalFiles: 5000
  });
  const aliasCandidates = buildQueueBoundAliasCandidates(tasks, harvests);
  if (aliasCandidates.length > 0) {
    inventory.candidates = [...aliasCandidates, ...(Array.isArray(inventory.candidates) ? inventory.candidates : [])];
    inventory.summary = summarizeInventoryWithAliases(inventory.summary, aliasCandidates);
  }
  fs.mkdirSync(path.dirname(args.inventoryOut), { recursive: true });
  fs.writeFileSync(args.inventoryOut, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");

  const manifest = buildAffectedPptxManifest(queue, args);
  const closeLoop = await runComponentReplacementCloseLoop(buildCloseLoopOptions({
    args,
    manifestFile: manifest.file
  }));
  const gate = evaluateHarvestRefreshGate({ args, closeLoop });
  if (args.failOnGate && gate.status !== "passed") {
    throw new Error(`component replacement harvest refresh gate failed: ${gate.findings.join("; ") || "unknown failure"}`);
  }
  const report = {
    provider: "component-replacement-harvest-refresh-v1",
    createdAt: new Date().toISOString(),
    queue: args.queue,
    out: args.out,
    harvests,
    inventory: args.inventoryOut,
    inventorySummary: inventory.summary || null,
    manifest: manifest.file,
    closeLoopReport: closeLoop.reportFile,
    gateReport: gate.reportFile,
    status: closeLoop.status,
    gateStatus: gate.status,
    totals: closeLoop.totals
  };
  const reportFile = path.join(args.out, "component-replacement-harvest-refresh-report.json");
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return {
    ...report,
    reportFile
  };
}

function normalizeOptions(options = {}) {
  const out = path.resolve(String(options.out || path.join("runs", "component-replacement-harvest-refresh")));
  return {
    queue: path.resolve(String(options.queue || "")),
    out,
    input: options.input ? path.resolve(String(options.input)) : "",
    inventoryOut: path.resolve(String(options.inventoryOut || path.join(out, "refreshed-component-inventory.json"))),
    closeLoopOut: path.resolve(String(options.closeLoopOut || path.join(out, "close-loop"))),
    gateOut: path.resolve(String(options.gateOut || path.join(out, "component-replacement-close-loop-gate.json"))),
    discoverRoot: options.discoverRoot ? path.resolve(String(options.discoverRoot)) : "",
    discoverLimit: normalizePositiveInt(options.discoverLimit, 30),
    learnStructure: options.learnStructure !== false,
    concurrency: normalizePositiveInt(options.concurrency, 1),
    decisionIr: options.decisionIr ? path.resolve(String(options.decisionIr)) : "",
    decisionSearchCandidates: options.decisionSearchCandidates === true,
    decisionCandidates: options.decisionCandidates ? path.resolve(String(options.decisionCandidates)) : "",
    decisionShortlist: options.decisionShortlist ? path.resolve(String(options.decisionShortlist)) : "",
    decisionReport: options.decisionReport ? path.resolve(String(options.decisionReport)) : "",
    decisionCandidateSize: normalizePositiveInt(options.decisionCandidateSize, 6),
    maxDecisionActionableGaps: normalizeNonNegativeInt(options.maxDecisionActionableGaps, 0),
    minDecisionPluginTargets: normalizeNonNegativeInt(options.minDecisionPluginTargets, 0),
    minDecisionProtectedCrops: normalizeNonNegativeInt(options.minDecisionProtectedCrops, 0),
    allowDecisionDefer: options.allowDecisionDefer === true,
    allowNeedsHarvestGate: options.allowNeedsHarvestGate !== false,
    failOnGate: options.failOnGate === true
  };
}

function buildCloseLoopOptions({ args = {}, manifestFile = "" } = {}) {
  return {
    manifest: manifestFile,
    inventory: args.inventoryOut,
    out: args.closeLoopOut,
    concurrency: args.concurrency,
    allowMissing: true,
    ...(args.decisionReport ? { decisionReport: args.decisionReport } : {}),
    ...(args.decisionIr ? { decisionIr: args.decisionIr } : {}),
    ...(args.decisionShortlist ? { decisionShortlist: args.decisionShortlist } : {}),
    ...(args.decisionCandidates ? { decisionCandidates: args.decisionCandidates } : {}),
    decisionSearchCandidates: args.decisionSearchCandidates === true,
    decisionCandidateSize: args.decisionCandidateSize,
    maxDecisionActionableGaps: args.maxDecisionActionableGaps,
    minDecisionPluginTargets: args.minDecisionPluginTargets,
    minDecisionProtectedCrops: args.minDecisionProtectedCrops,
    allowDecisionDefer: args.allowDecisionDefer === true
  };
}

function evaluateHarvestRefreshGate({ args = {}, closeLoop = {} } = {}) {
  const gate = evaluateCloseLoopGate({
    report: closeLoop.reportFile,
    out: args.gateOut,
    allowNeedsHarvest: args.allowNeedsHarvestGate !== false
  });
  return {
    ...gate,
    reportFile: args.gateOut
  };
}

function harvestNeededProviders(tasks = [], args = {}) {
  const providers = [...new Set(tasks.map((task) => safeText(task.provider)).filter(Boolean))];
  const harvests = [];
  for (const provider of providers) {
    if (provider !== "officeplus" && provider !== "islide") continue;
    const out = path.join(args.out, `harvested-${provider}-local-components`);
    const manifest = harvestAppliedPptComponents({
      provider,
      out,
      discoverOfficePlusLocal: provider === "officeplus",
      discoverISlideTemp: provider === "islide",
      discoverRoot: args.discoverRoot,
      discoverLimit: args.discoverLimit,
      maxFiles: args.discoverLimit
    });
    harvests.push({
      provider,
      out,
      discoveredCount: manifest.discoveredCount || 0,
      copiedCount: manifest.copiedCount || 0,
      manifestFile: path.join(out, "manifest.json")
    });
  }
  return harvests;
}

function refreshInventoryRoots(harvests = []) {
  return [
    ...harvests.map((harvest) => harvest.out),
    ...defaultPluginComponentRoots()
  ];
}

function buildQueueBoundAliasCandidates(tasks = [], harvests = []) {
  const aliases = [];
  const tasksByProvider = groupByProvider(tasks);
  for (const harvest of harvests) {
    const provider = safeText(harvest.provider);
    const providerTasks = tasksByProvider.get(provider) || [];
    if (providerTasks.length !== 1 || Number(harvest.copiedCount || 0) !== 1) continue;
    if (!fs.existsSync(harvest.manifestFile)) continue;
    const manifest = readJson(harvest.manifestFile);
    const component = Array.isArray(manifest.components) ? manifest.components[0] : null;
    if (!component?.path || !fs.existsSync(component.path)) continue;
    const task = providerTasks[0];
    const compatibility = queueBoundCompatibility(task, component);
    if (!compatibility.compatible) continue;
    aliases.push({
      id: safeAliasId(task.componentId),
      provider,
      path: path.resolve(String(component.path)),
      name: `${safeAliasId(task.componentId)}${task.title ? `-${safeFileToken(task.title)}` : ""}.pptx`,
      assetKind: "presentation-template",
      roleTags: [
        "applied-component",
        `${provider}-applied-component`,
        "queue-bound-component-sample",
        ...(Array.isArray(component.roleTags) ? component.roleTags : [])
      ],
      reusePolicy: "queue-bound-harvested-component-sample",
      score: 180,
      queueBinding: {
        componentId: task.componentId,
        title: task.title || "",
        targetMotifs: Array.isArray(task.targetMotifs) ? task.targetMotifs : [],
        sourceManifest: harvest.manifestFile,
        compatibility
      },
      ...(component.learningSummary ? { learningSummary: component.learningSummary } : {}),
      ...(component.structureSignature ? { structureSignature: component.structureSignature } : {})
    });
  }
  return aliases;
}

function queueBoundCompatibility(task = {}, component = {}) {
  const targetMotifs = normalizeMotifs(task.targetMotifs);
  const sampleMotifs = normalizeMotifs([
    ...(Array.isArray(component.structureSignature?.motifs) ? component.structureSignature.motifs : []),
    component.structureSignature?.primaryMotif,
    component.structureSignature?.primaryKind
  ]);
  if (targetMotifs.length === 0 || sampleMotifs.length === 0) {
    return {
      compatible: false,
      reason: "insufficient-structure-signal",
      targetMotifs,
      sampleMotifs
    };
  }
  const compatible = targetMotifs.some((target) => sampleMotifs.some((sample) => motifsCompatible(target, sample)));
  return {
    compatible,
    reason: compatible ? "motif-overlap" : "motif-mismatch",
    targetMotifs,
    sampleMotifs
  };
}

function motifsCompatible(target, sample) {
  if (!target || !sample) return false;
  if (target === sample) return true;
  const aliases = {
    "linear-arrow-chain": new Set(["timeline", "process-chain", "step-flow", "linear-arrow-chain"]),
    "branch-card-flow": new Set(["tree-link", "card-grid", "branch-card-flow"]),
    "lens-funnel-flow": new Set(["funnel", "magnifier", "lens-funnel-flow"]),
    "arc-arrow": new Set(["cycle-loop", "ring-node", "arc-arrow"])
  };
  return aliases[target]?.has(sample) === true || aliases[sample]?.has(target) === true;
}

function normalizeMotifs(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .map((value) => safeText(value).replace(/_/g, "-"))
    .filter(Boolean))];
}

function summarizeInventoryWithAliases(summary = {}, aliases = []) {
  const next = {
    ...(summary || {}),
    total: Number(summary?.total || 0) + aliases.length,
    queueBoundAliases: Number(summary?.queueBoundAliases || 0) + aliases.length,
    byProvider: { ...(summary?.byProvider || {}) },
    byAssetKind: { ...(summary?.byAssetKind || {}) }
  };
  for (const alias of aliases) {
    increment(next.byProvider, alias.provider || "unknown");
    increment(next.byAssetKind, alias.assetKind || "unknown");
  }
  return next;
}

function groupByProvider(tasks = []) {
  const map = new Map();
  for (const task of tasks) {
    const provider = safeText(task.provider);
    if (!provider) continue;
    if (!map.has(provider)) map.set(provider, []);
    map.get(provider).push(task);
  }
  return map;
}

function buildAffectedPptxManifest(queue = {}, args = {}) {
  const files = args.input
    ? [args.input]
    : [...new Set((Array.isArray(queue.tasks) ? queue.tasks : [])
      .flatMap((task) => Array.isArray(task.affectedFiles) ? task.affectedFiles : [])
      .map((file) => file.inputPptx)
      .filter(Boolean)
      .map((file) => path.resolve(String(file))))];
  if (files.length === 0) throw new Error("No affected PPTX files found in harvest queue; pass --input.");
  for (const file of files) {
    if (!fs.existsSync(file)) throw new Error(`Affected PPTX file was not found: ${file}`);
    if (path.extname(file).toLowerCase() !== ".pptx") throw new Error(`Affected file must be .pptx: ${file}`);
  }
  const manifest = {
    provider: "component-replacement-harvest-refresh-manifest-v1",
    createdAt: new Date().toISOString(),
    files
  };
  const file = path.join(args.out, "affected-pptx-manifest.json");
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return {
    file,
    files
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(String(file)), "utf8"));
}

function normalizePositiveInt(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeNonNegativeInt(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function increment(target, key) {
  const safeKey = String(key || "unknown");
  target[safeKey] = Number(target[safeKey] || 0) + 1;
}

function safeAliasId(value) {
  return String(value || "component")
    .replace(/[^\w:.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "component";
}

function safeFileToken(value) {
  return String(value || "")
    .replace(/[^\p{L}\p{N}_.-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function safeText(value) {
  return String(value || "").replace(/[\u0000-\u001F\u007F]/g, "").trim().toLowerCase();
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const report = await runComponentReplacementHarvestRefresh(args);
    console.log(JSON.stringify({
      status: report.status,
      gateStatus: report.gateStatus,
      harvests: report.harvests,
      inventory: report.inventory,
      closeLoopReport: report.closeLoopReport,
      gateReport: report.gateReport,
      reportFile: report.reportFile
    }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildAffectedPptxManifest,
  buildCloseLoopOptions,
  buildQueueBoundAliasCandidates,
  evaluateHarvestRefreshGate,
  harvestNeededProviders,
  parseArgs,
  queueBoundCompatibility,
  refreshInventoryRoots,
  runComponentReplacementHarvestRefresh
};
