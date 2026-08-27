"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { watchPluginComponentDownloads } = require("./watch-plugin-component-downloads");
const { buildPluginComponentInventory } = require("./lib/plugin-component-registry");

function parseArgs(argv) {
  const args = {
    queue: "",
    out: path.join("runs", "plugin-component-inventory", "plugin-apply-session"),
    actionOrders: [],
    maxActions: 1,
    durationMs: 60000,
    pollMs: 1000,
    watch: true,
    watchProvider: "",
    watchRoots: [],
    activePowerPoint: false,
    includeDefaultRoots: true,
    refreshInventory: true,
    inventoryRoots: [],
    learnStructure: true,
    learnMaxAssets: 20,
    learnMaxSlides: 4,
    learnMaxComponentCatalogItems: 12,
    maxDepth: 6,
    maxFilesPerRoot: 800,
    maxTotalFiles: 3000
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === "--queue" || arg === "--in") && next) {
      args.queue = next;
      i += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      i += 1;
    } else if ((arg === "--action-order" || arg === "--order") && next) {
      args.actionOrders.push(Number(next));
      i += 1;
    } else if (arg === "--max-actions" && next) {
      args.maxActions = Number(next);
      i += 1;
    } else if (arg === "--duration-ms" && next) {
      args.durationMs = Number(next);
      i += 1;
    } else if (arg === "--poll-ms" && next) {
      args.pollMs = Number(next);
      i += 1;
    } else if (arg === "--watch-provider" && next) {
      args.watchProvider = next;
      i += 1;
    } else if (arg === "--watch-root" && next) {
      args.watchRoots.push(next);
      i += 1;
    } else if (arg === "--active-powerpoint" || arg === "--active-ppt") {
      args.activePowerPoint = true;
    } else if (arg === "--inventory-root" && next) {
      args.inventoryRoots.push(next);
      i += 1;
    } else if (arg === "--learn-max-assets" && next) {
      args.learnMaxAssets = Number(next);
      i += 1;
    } else if (arg === "--learn-max-slides" && next) {
      args.learnMaxSlides = Number(next);
      i += 1;
    } else if (arg === "--learn-max-component-catalog-items" && next) {
      args.learnMaxComponentCatalogItems = Number(next);
      i += 1;
    } else if (arg === "--max-depth" && next) {
      args.maxDepth = Number(next);
      i += 1;
    } else if (arg === "--max-files-per-root" && next) {
      args.maxFilesPerRoot = Number(next);
      i += 1;
    } else if (arg === "--max-total-files" && next) {
      args.maxTotalFiles = Number(next);
      i += 1;
    } else if (arg === "--no-watch") {
      args.watch = false;
    } else if (arg === "--no-default-roots") {
      args.includeDefaultRoots = false;
    } else if (arg === "--no-refresh-inventory") {
      args.refreshInventory = false;
    } else if (arg === "--learn-structure") {
      args.learnStructure = true;
    } else if (arg === "--no-learn-structure") {
      args.learnStructure = false;
    } else {
      throw new Error(`Unknown component-plugin-apply-session argument: ${arg}`);
    }
  }
  if (!args.queue) throw new Error("--queue is required");
  args.maxActions = clampInteger(args.maxActions, 1, 20, 1);
  args.durationMs = clampInteger(args.durationMs, 0, 10 * 60 * 1000, 60000);
  args.pollMs = clampInteger(args.pollMs, 100, 60000, 1000);
  args.actionOrders = sanitizePositiveInts(args.actionOrders);
  return args;
}

async function runPluginApplySession(options = {}) {
  const args = { ...parseArgs(["node", "component-plugin-apply-session.js", "--queue", String(options.queue || "")]), ...options };
  const queueFile = path.resolve(String(args.queue || ""));
  const outDir = path.resolve(String(args.out || path.join("runs", "plugin-component-inventory", "plugin-apply-session")));
  const queue = readJson(queueFile);
  const actions = selectActions(queue, args);
  const watchProvider = normalizeWatchProvider(args.watchProvider || inferWatchProvider(actions));
  const watchedRoot = path.join(outDir, "watched-plugin-components");
  const guideFile = path.join(outDir, "plugin-action-guide.md");
  const reportFile = path.join(outDir, "plugin-apply-session.json");
  const inventoryFile = path.join(outDir, "component-inventory.json");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(guideFile, renderActionGuide({
    queueFile,
    actions,
    watchProvider,
    durationMs: args.durationMs,
    activePowerPoint: args.activePowerPoint === true
  }), "utf8");

  const watchReport = args.watch === false ? null : await watchPluginComponentDownloads({
    out: watchedRoot,
    provider: watchProvider,
    roots: Array.isArray(args.watchRoots) ? args.watchRoots : [],
    activePowerPoint: args.activePowerPoint === true,
    includeDefaultRoots: args.includeDefaultRoots !== false,
    durationMs: args.durationMs,
    pollMs: args.pollMs,
    maxFiles: args.maxTotalFiles
  });

  const inventoryRoots = collectInventoryRoots({
    explicitRoots: args.inventoryRoots,
    watchedRoot,
    watchReport
  });
  const inventory = args.refreshInventory === false ? null : buildPluginComponentInventory({
    roots: inventoryRoots,
    maxDepth: clampInteger(args.maxDepth, 1, 12, 6),
    maxFilesPerRoot: clampInteger(args.maxFilesPerRoot, 1, 5000, 800),
    maxTotalFiles: clampInteger(args.maxTotalFiles, 1, 20000, 3000),
    learnStructure: args.learnStructure !== false,
    learnMaxAssets: clampInteger(args.learnMaxAssets, 1, 200, 20),
    learnMaxSlides: clampInteger(args.learnMaxSlides, 1, 30, 4),
    learnMaxComponentCatalogItems: clampInteger(args.learnMaxComponentCatalogItems, 1, 100, 12)
  });
  if (inventory) fs.writeFileSync(inventoryFile, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  const fulfillment = summarizeSessionFulfillment({ actions, inventory });

  const report = {
    provider: "component-plugin-apply-session-v1",
    queue: queueFile,
    outDir,
    generatedAt: new Date().toISOString(),
    guide: guideFile,
    actions: actions.map(summarizeAction),
    watch: watchReport ? {
      provider: watchReport.provider,
      durationMs: watchReport.durationMs,
      activePowerPointFile: watchReport.activePowerPointFile || null,
      roots: watchReport.roots,
      changedCount: watchReport.changedCount,
      harvests: watchReport.harvests
    } : null,
    inventory: inventory ? {
      file: inventoryFile,
      roots: inventoryRoots,
      summary: inventory.summary
    } : null,
    fulfillment
  };
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

function selectActions(queue = {}, options = {}) {
  const actions = Array.isArray(queue.actions) ? queue.actions : [];
  const orders = new Set(sanitizePositiveInts(options.actionOrders));
  const selected = orders.size > 0
    ? actions.filter((action) => orders.has(Number(action.order)))
    : actions.slice(0, clampInteger(options.maxActions, 1, 20, 1));
  return selected
    .map(sanitizeAction)
    .filter((action) => action.provider && action.title && action.action?.instruction);
}

function sanitizeAction(action = {}) {
  const provider = normalizeProvider(action.provider);
  const instruction = action.action && typeof action.action === "object" ? action.action : {};
  return {
    order: clampInteger(action.order, 1, 10000, 1),
    provider,
    kind: safeString(action.kind).toLowerCase(),
    id: safeString(action.id).slice(0, 120),
    title: safeString(action.title).slice(0, 200),
    score: Number.isFinite(Number(action.score)) ? Number(action.score) : 0,
    acquisition: sanitizeAcquisitionEvidence(action),
    targetMotifs: sanitizeStringArray(action.targetMotifs).slice(0, 8),
    affectedTargets: sanitizeAffectedTargets(action.affectedTargets),
    affectedSlides: sanitizeAffectedSlides(action.affectedSlides),
    suitability: sanitizeSuitability(action.suitability),
    action: {
      tab: safeString(instruction.tab).slice(0, 40),
      library: safeString(instruction.library).slice(0, 80),
      searchText: safeString(instruction.searchText).slice(0, 100),
      expectedCandidateId: safeString(instruction.expectedCandidateId).slice(0, 120),
      expectedTitle: safeString(instruction.expectedTitle).slice(0, 200),
      instruction: safeString(instruction.instruction).slice(0, 500)
    }
  };
}

function renderActionGuide({ queueFile, actions, watchProvider, durationMs, activePowerPoint = false }) {
  const lines = [
    "# Plugin Component Apply Session",
    "",
    `Queue: ${queueFile}`,
    `Watch provider: ${watchProvider}`,
    `Watch active PowerPoint file: ${activePowerPoint ? "yes" : "no"}`,
    `Watch window: ${durationMs} ms`,
    "",
    "## Steps",
    "",
    "1. Keep this command running while you apply/download the component in PowerPoint.",
    "2. In PowerPoint, use the plugin tab and search text below.",
    "3. Click download/apply so the plugin inserts the component into the active slide or writes it to its cache.",
    "4. If the plugin inserts directly into the active PPT instead of creating a cache file, run the active-slide harvest command below after each apply.",
    "5. After the watch window ends, inspect component-inventory.json for newly learned assets.",
    "",
    "## Active Slide Harvest",
    "",
    "Use this when iSlide/OfficePLUS applies the component directly into the current PowerPoint file:",
    "",
    "```powershell",
    "node skills\\pd-hifi-slideclone\\scripts\\harvest-active-powerpoint-component.js --provider <officeplus|islide> --label <candidate-id-or-short-name>",
    "```",
    ""
  ];
  for (const action of actions) {
    lines.push(
      `## Action ${action.order}: ${action.provider} ${action.kind}`,
      "",
      `Title: ${action.title}`,
      `Candidate ID: ${action.id}`,
      `Score: ${action.score}`,
      ...renderAcquisitionLines(action.acquisition),
      `Suitability: ${action.suitability.tier} (${action.suitability.score})`,
      ...(action.suitability.reasons.length ? [`Suitability reasons: ${action.suitability.reasons.join(", ")}`] : []),
      `Search: ${action.action.searchText}`,
      `Plugin tab: ${action.action.tab}`,
      `Library: ${action.action.library}`,
      "",
      action.action.instruction,
      "",
      "Active-slide harvest after apply:",
      "",
      "```powershell",
      activeSlideHarvestCommand(action),
      "```",
      ""
    );
  }
  return `${lines.join("\n")}\n`;
}

function activeSlideHarvestCommand(action = {}) {
  const provider = normalizeProvider(action.provider) || "islide";
  const fallback = [provider, action.kind, action.order ? `action-${action.order}` : ""].filter(Boolean).join("-");
  const label = sanitizeHarvestLabel(action.id) || sanitizeHarvestLabel(fallback) || "component";
  return `node skills\\pd-hifi-slideclone\\scripts\\harvest-active-powerpoint-component.js --provider ${provider} --label ${label}`;
}

function collectInventoryRoots({ explicitRoots = [], watchedRoot = "", watchReport = null } = {}) {
  const roots = [];
  roots.push(...(Array.isArray(explicitRoots) ? explicitRoots : [explicitRoots]).filter(Boolean));
  for (const harvest of Array.isArray(watchReport?.harvests) ? watchReport.harvests : []) {
    if (harvest.outRoot) roots.push(harvest.outRoot);
  }
  if (watchedRoot) {
    roots.push(path.join(watchedRoot, "islide"));
    roots.push(path.join(watchedRoot, "officeplus"));
  }
  return uniqueExistingPaths(roots);
}

function inferWatchProvider(actions = []) {
  const providers = new Set(actions.map((action) => action.provider).filter(Boolean));
  if (providers.size === 1) return [...providers][0];
  return "all";
}

function summarizeAction(action = {}) {
  return {
    order: action.order,
    provider: action.provider,
    kind: action.kind,
    id: action.id,
    title: action.title,
    score: action.score,
    targetMotifs: action.targetMotifs || [],
    affectedTargets: action.affectedTargets || [],
    affectedSlides: action.affectedSlides || [],
    ...(hasAcquisitionEvidence(action.acquisition) ? { acquisition: action.acquisition } : {}),
    suitability: action.suitability,
    searchText: action.action?.searchText || "",
    instruction: action.action?.instruction || ""
  };
}

function sanitizeAffectedTargets(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((target) => {
      const source = target && typeof target === "object" ? target : {};
      return {
        deck: safeString(source.deck).slice(0, 160),
        slide: Number.isFinite(Number(source.slide)) ? Math.trunc(Number(source.slide)) : null,
        imageId: safeString(source.imageId).slice(0, 160),
        imageIndex: Number.isFinite(Number(source.imageIndex)) ? Math.trunc(Number(source.imageIndex)) : null,
        layerKey: safeString(source.layerKey).slice(0, 240)
      };
    })
    .filter((target) => target.deck || target.slide !== null || target.imageId)
    .slice(0, 200);
}

function sanitizeAffectedSlides(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((item) => {
      const source = item && typeof item === "object" ? item : {};
      return {
        deck: safeString(source.deck).slice(0, 160),
        slide: Number.isFinite(Number(source.slide)) ? Math.trunc(Number(source.slide)) : null
      };
    })
    .filter((item) => item.deck || item.slide !== null)
    .slice(0, 200);
}

function sanitizeAcquisitionEvidence(action = {}) {
  const downloadLookup = action.downloadLookup && typeof action.downloadLookup === "object"
    ? {
      status: safeString(action.downloadLookup.status).slice(0, 80),
      httpStatus: Number.isFinite(Number(action.downloadLookup.httpStatus))
        ? Math.trunc(Number(action.downloadLookup.httpStatus))
        : null
    }
    : null;
  return {
    mode: safeString(action.acquisitionMode).slice(0, 80),
    sourceFile: safeString(action.sourceFile || action.fileName).slice(0, 220),
    fileName: safeString(action.fileName).slice(0, 160),
    paymentType: safeString(action.paymentType).slice(0, 80),
    price: safeString(action.price).slice(0, 80),
    downloadLookup: downloadLookup && (downloadLookup.status || downloadLookup.httpStatus !== null) ? downloadLookup : null
  };
}

function hasAcquisitionEvidence(acquisition = {}) {
  return Boolean(
    acquisition.mode
    || acquisition.sourceFile
    || acquisition.fileName
    || acquisition.paymentType
    || acquisition.price
    || acquisition.downloadLookup
  );
}

function renderAcquisitionLines(acquisition = {}) {
  if (!hasAcquisitionEvidence(acquisition)) return [];
  const lines = [];
  if (acquisition.mode) lines.push(`Acquisition mode: ${acquisition.mode}`);
  if (acquisition.sourceFile) lines.push(`Source file: ${acquisition.sourceFile}`);
  else if (acquisition.fileName) lines.push(`Source file: ${acquisition.fileName}`);
  if (acquisition.paymentType) lines.push(`Payment type: ${acquisition.paymentType}`);
  if (acquisition.price) lines.push(`Price: ${acquisition.price}`);
  if (acquisition.downloadLookup?.status) {
    const suffix = acquisition.downloadLookup.httpStatus !== null && acquisition.downloadLookup.httpStatus !== undefined
      ? ` (${acquisition.downloadLookup.httpStatus})`
      : "";
    lines.push(`Download lookup: ${acquisition.downloadLookup.status}${suffix}`);
  }
  return lines;
}

function summarizeSessionFulfillment({ actions = [], inventory = null } = {}) {
  const targetMotifs = [...new Set(actions.flatMap((action) => action.targetMotifs || []).filter(Boolean))];
  const coverage = inventory?.summary?.byStructureMotif || {};
  const rows = targetMotifs.map((motif) => {
    const structureMatches = Math.max(0, Math.round(Number(coverage[motif] || 0)));
    return {
      motif,
      status: structureMatches > 0 ? "fulfilled" : "pending",
      structureMatches,
      actions: actions
        .filter((action) => (action.targetMotifs || []).includes(motif))
        .map((action) => ({
          order: action.order,
          provider: action.provider,
          kind: action.kind,
          searchText: action.action?.searchText || ""
        }))
    };
  });
  const fulfilled = rows.filter((row) => row.status === "fulfilled").length;
  return {
    provider: "component-plugin-apply-session-fulfillment-v1",
    targetMotifs,
    fulfilled,
    pending: rows.length - fulfilled,
    rows
  };
}

function sanitizeSuitability(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const tier = /^(strong|weak|rejected)$/.test(safeString(source.tier)) ? safeString(source.tier) : "unknown";
  const score = Number.isFinite(Number(source.score)) ? Math.max(0, Math.min(100, Math.round(Number(source.score) * 100) / 100)) : 0;
  return {
    score,
    tier,
    reasons: sanitizeStringArray(source.reasons).slice(0, 8),
    rejectionReasons: sanitizeStringArray(source.rejectionReasons).slice(0, 8)
  };
}

function sanitizeStringArray(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((value) => safeString(value).slice(0, 100))
    .filter(Boolean);
}

function sanitizePositiveInts(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => Math.trunc(Number(value)))
    .filter((value) => Number.isFinite(value) && value > 0))];
}

function normalizeProvider(value) {
  const provider = safeString(value).toLowerCase();
  return /^(officeplus|islide)$/.test(provider) ? provider : "";
}

function normalizeWatchProvider(value) {
  const provider = safeString(value).toLowerCase();
  return /^(officeplus|islide|all)$/.test(provider) ? provider : "all";
}

function uniqueExistingPaths(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const full = path.resolve(String(value || ""));
    const key = full.toLowerCase();
    if (!full || seen.has(key) || !fs.existsSync(full)) continue;
    seen.add(key);
    result.push(full);
  }
  return result;
}

function clampInteger(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function sanitizeHarvestLabel(value) {
  return safeString(value)
    .replace(/^(?:islide|officeplus|plugin)-applied-/i, "")
    .replace(/^applied-/i, "")
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/^-|-$/g, "");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(String(file)), "utf8"));
}

async function main() {
  const args = parseArgs(process.argv);
  const report = await runPluginApplySession(args);
  console.log(`plugin apply session actions: ${report.actions.length}`);
  console.log(`changed plugin component files: ${report.watch?.changedCount ?? 0}`);
  console.log(`guide: ${report.guide}`);
  console.log(`report: ${path.join(report.outDir, "plugin-apply-session.json")}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  });
}

module.exports = {
  collectInventoryRoots,
  parseArgs,
  renderActionGuide,
  runPluginApplySession,
  selectActions,
  _private: {
    activeSlideHarvestCommand,
    inferWatchProvider,
    sanitizeHarvestLabel,
    sanitizeSuitability,
    sanitizeAction,
    sanitizeAffectedTargets,
    sanitizeAcquisitionEvidence,
    renderAcquisitionLines,
    summarizeAction,
    summarizeSessionFulfillment
  }
};
