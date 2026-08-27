#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

async function main() {
  const args = parseArgs(process.argv);
  const queueFile = path.resolve(args.repairQueue);
  const queue = readJson(queueFile);
  const plans = buildDeckPlans(queue, args);
  const outRoot = path.resolve(args.out);
  fs.mkdirSync(outRoot, { recursive: true });

  if (args.dryRun) {
    const report = makeReport({ args, queueFile, outRoot, plans, results: [] });
    writeJson(args.reportFile || path.join(outRoot, "minimum-unit-gap-repair-runner-report.json"), report);
    process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
    return;
  }

  const results = await runLimited(plans, args.deckConcurrency, (plan) => runDeckPlan({
    plan,
    args,
    queueFile,
    outRoot
  }));
  const report = makeReport({ args, queueFile, outRoot, plans, results });
  writeJson(args.reportFile || path.join(outRoot, "minimum-unit-gap-repair-runner-report.json"), report);
  process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
  if (results.some((result) => result.status !== "converted")) process.exitCode = 1;
}

function parseArgs(argv = process.argv) {
  const args = {
    repairQueue: path.join("runs", "minimum-unit-gap-repair-queue.json"),
    workRoot: path.join("ppt文档", "可编辑版本"),
    out: path.join("runs", "minimum-unit-gap-repair-queue-pptx"),
    reportFile: "",
    only: "",
    pages: "",
    maxPages: 20,
    minAreaRatio: 0,
    deckConcurrency: 1,
    pageConcurrency: 2,
    pageShardSize: 1,
    heartbeatMs: 30000,
    dryRun: false,
    skipPptx: false,
    reuseAnalysis: false,
    reuseFinalPageCache: false,
    componentAssets: false,
    harvestIslideTemp: false,
    componentInventoryCache: "",
    componentLearningCache: "",
    objectifyComponentGroupMatches: false,
    componentGroupMatchMinScore: 72,
    replaceSafeComponentTemplateCrops: false,
    pptxEngine: "openxml"
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if ((arg === "--repair-queue" || arg === "--queue") && next) {
      args.repairQueue = next;
      index += 1;
    } else if (arg === "--work-root" && next) {
      args.workRoot = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (arg === "--report-file" && next) {
      args.reportFile = next;
      index += 1;
    } else if (arg === "--only" && next) {
      args.only = next;
      index += 1;
    } else if (arg === "--pages" && next) {
      args.pages = next;
      index += 1;
    } else if (arg === "--max-pages" && next) {
      args.maxPages = Number(next);
      index += 1;
    } else if (arg === "--min-area-ratio" && next) {
      args.minAreaRatio = Number(next);
      index += 1;
    } else if ((arg === "--deck-concurrency" || arg === "--concurrency") && next) {
      args.deckConcurrency = Number(next);
      index += 1;
    } else if (arg === "--page-concurrency" && next) {
      args.pageConcurrency = Number(next);
      index += 1;
    } else if (arg === "--page-shard-size" && next) {
      args.pageShardSize = Number(next);
      index += 1;
    } else if (arg === "--heartbeat-ms" && next) {
      args.heartbeatMs = Number(next);
      index += 1;
    } else if (arg === "--component-inventory-cache" && next) {
      args.componentInventoryCache = next;
      index += 1;
    } else if (arg === "--component-learning-cache" && next) {
      args.componentLearningCache = next;
      index += 1;
    } else if (arg === "--component-group-match-min-score" && next) {
      args.componentGroupMatchMinScore = Number(next);
      index += 1;
    } else if (arg === "--pptx-engine" && next) {
      args.pptxEngine = next;
      index += 1;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--skip-pptx") {
      args.skipPptx = true;
    } else if (arg === "--reuse-analysis") {
      args.reuseAnalysis = true;
    } else if (arg === "--reuse-final-page-cache") {
      args.reuseFinalPageCache = true;
    } else if (arg === "--component-assets") {
      args.componentAssets = true;
      if (next && /^(true|false)$/i.test(next)) {
        args.componentAssets = /^true$/i.test(next);
        index += 1;
      }
    } else if (arg === "--harvest-islide-temp") {
      args.harvestIslideTemp = true;
    } else if (arg === "--objectify-component-group-matches") {
      args.objectifyComponentGroupMatches = true;
      if (next && /^(true|false)$/i.test(next)) {
        args.objectifyComponentGroupMatches = /^true$/i.test(next);
        index += 1;
      }
    } else if (arg === "--replace-safe-component-template-crops") {
      args.replaceSafeComponentTemplateCrops = true;
    } else if (arg === "--hybrid-component-template-residuals") {
      args.hybridComponentTemplateResiduals = true;
    } else if (arg === "--erase-specialized-hybrid-residual-text") {
      args.eraseSpecializedHybridResidualText = true;
    } else {
      throw new Error(`Unknown minimum-unit-gap-repair-runner argument: ${arg}`);
    }
  }
  args.maxPages = clampInteger(args.maxPages, 1, 500, 20);
  args.minAreaRatio = clampNumber(args.minAreaRatio, 0, 1, 0);
  args.deckConcurrency = clampInteger(args.deckConcurrency, 1, 8, 1);
  args.pageConcurrency = clampInteger(args.pageConcurrency, 1, 8, 2);
  args.pageShardSize = clampInteger(args.pageShardSize, 1, 20, 1);
  args.heartbeatMs = clampInteger(args.heartbeatMs, 0, 600000, 30000);
  args.componentGroupMatchMinScore = clampNumber(args.componentGroupMatchMinScore, 0, 100, 72);
  if (!args.repairQueue) throw new Error("--repair-queue is required");
  return args;
}

function buildDeckPlans(queue = {}, options = {}) {
  const selectedPages = parsePageSet(options.pages);
  const selectedDeck = safeString(options.only).toLowerCase();
  const byDeck = new Map();
  for (const action of Array.isArray(queue.actions) ? queue.actions : []) {
    if (!isStructuralRebuildAction(action)) continue;
    const deck = safeString(action.deck);
    const page = clampInteger(action.page, 1, 10000, 0);
    if (!deck || !page) continue;
    if (selectedDeck && deck.toLowerCase() !== selectedDeck) continue;
    if (selectedPages.size > 0 && !selectedPages.has(page)) continue;
    if (Number(action.areaRatio || 0) < Number(options.minAreaRatio || 0)) continue;
    if (!byDeck.has(deck)) byDeck.set(deck, new Map());
    const pages = byDeck.get(deck);
    const existing = pages.get(page) || { page, actions: [], maxAreaRatio: 0, motifs: new Set(), routes: new Set() };
    existing.actions.push(actionSummary(action));
    existing.maxAreaRatio = Math.max(existing.maxAreaRatio, Number(action.areaRatio || 0));
    for (const motif of safeArray(action.targetMotifs)) existing.motifs.add(safeString(motif));
    existing.routes.add(safeString(action.templateFamily || action.recommendedRoute || action.repair?.mode));
    pages.set(page, existing);
  }
  const pageRows = [...byDeck.entries()].flatMap(([deck, pages]) => [...pages.values()].map((page) => ({ deck, page: page.page })))
    .sort((a, b) => a.deck.localeCompare(b.deck) || a.page - b.page)
    .slice(0, clampInteger(options.maxPages, 1, 500, 20));
  const allowed = new Set(pageRows.map((item) => `${item.deck}\u0000${item.page}`));
  return [...byDeck.entries()].map(([deck, pages]) => {
    const selected = [...pages.values()]
      .filter((page) => allowed.has(`${deck}\u0000${page.page}`))
      .sort((a, b) => a.page - b.page)
      .map((page) => ({
        ...page,
        motifs: [...page.motifs].filter(Boolean).sort(),
        routes: [...page.routes].filter(Boolean).sort()
      }));
    return {
      deck,
      pages: selected.map((page) => page.page),
      pageDetails: selected,
      actions: selected.reduce((sum, page) => sum + page.actions.length, 0)
    };
  }).filter((plan) => plan.pages.length > 0);
}

function isStructuralRebuildAction(action = {}) {
  const repair = action.repair && typeof action.repair === "object" ? action.repair : {};
  if (isProtectedNonSemanticAction(action)) return false;
  const text = [
    action.violation,
    action.disposition,
    action.currentMode,
    action.templateFamily,
    action.layerType,
    action.detector,
    action.candidateTitle,
    repair.mode,
    repair.reason
  ].map(safeString).join(" ").toLowerCase();
  if (repair.forcePreserveLocalCrop === true) return false;
  if (/preserve-as-single-crop|preserve-fidelity-crop|fidelity-crop-not-actionable/.test(text)) return false;
  if (/screenshot|photo|logo|icon-or-illustration|illustration-zone|visual-example|图标|截图|插画|示意图/.test(text)
    && !/table|matrix|grid|chart|diagram|flow|process|relationship|timeline|radial|tree|表格|矩阵|图表|流程|关系/.test(text)) {
    return false;
  }
  return repair.requireSemanticStructureEvidence === true
    || /minimum-unit-structural-crop-gap|reclassify-structural-diagram|structured-native|component-template/.test(text);
}

function isProtectedNonSemanticAction(action = {}) {
  const unitDisposition = safeString(
    action.unitDisposition
      || action.expressionPolicy?.unitDisposition
      || action.policy?.unitDisposition
      || ""
  );
  if ([
    "intentional-visual-crop",
    "intentional-decorative-crop",
    "hybrid-crop-with-native-overlays"
  ].includes(unitDisposition)) {
    return true;
  }
  const policyKind = safeString(
    action.expressionPolicy?.kind
      || action.policy?.kind
      || action.kind
      || ""
  );
  return ["standalone-visual-asset", "decorative-texture"].includes(policyKind);
}

function runDeckPlan({ plan, args, queueFile, outRoot }) {
  return new Promise((resolve) => {
    const deckOut = path.join(outRoot, safeFileStem(plan.deck));
    const childArgs = [
      path.join(__dirname, "component-strategy-rebuild-page-shards.js"),
      "--work-root", args.workRoot,
      "--out", deckOut,
      "--only", plan.deck,
      "--pages", plan.pages.join(","),
      "--concurrency", String(args.pageConcurrency),
      "--page-shard-size", String(args.pageShardSize),
      "--heartbeat-ms", String(args.heartbeatMs),
      "--expression-policy-repair-queue", queueFile,
      "--pptx-engine", args.pptxEngine
    ];
    if (args.skipPptx) childArgs.push("--skip-pptx");
    if (args.reuseAnalysis) childArgs.push("--reuse-analysis");
    if (args.reuseFinalPageCache) childArgs.push("--reuse-final-page-cache");
    if (args.componentAssets) childArgs.push("--component-assets", "true");
    if (args.harvestIslideTemp) childArgs.push("--harvest-islide-temp");
    if (args.componentInventoryCache) childArgs.push("--component-inventory-cache", args.componentInventoryCache);
    if (args.componentLearningCache) childArgs.push("--component-learning-cache", args.componentLearningCache);
    if (args.objectifyComponentGroupMatches) childArgs.push("--objectify-component-group-matches", "true");
    if (args.componentGroupMatchMinScore) childArgs.push("--component-group-match-min-score", String(args.componentGroupMatchMinScore));
    if (args.replaceSafeComponentTemplateCrops) childArgs.push("--replace-safe-component-template-crops", "true");
    if (args.hybridComponentTemplateResiduals) childArgs.push("--hybrid-component-template-residuals", "true");
    if (args.eraseSpecializedHybridResidualText) childArgs.push("--erase-specialized-hybrid-residual-text", "true");

    const startedAt = Date.now();
    const child = spawn(process.execPath, childArgs, {
      cwd: path.resolve(__dirname, "..", "..", ".."),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on("error", (error) => resolve(deckResult(plan, deckOut, startedAt, "failed", error.message, stdout, stderr)));
    child.on("close", (code) => {
      const result = deckResult(plan, deckOut, startedAt, code === 0 ? "converted" : "failed", "", stdout, stderr);
      result.exitCode = code;
      const parsed = parseLastJson(stdout);
      if (parsed) {
        result.outputIr = parsed.outputIr || null;
        result.outputPptx = parsed.outputPptx || null;
        result.pageShardReport = parsed.reportFile || null;
        result.totals = parsed;
      }
      resolve(result);
    });
  });
}

function deckResult(plan, deckOut, startedAt, status, error, stdout, stderr) {
  return {
    deck: plan.deck,
    pages: plan.pages,
    actions: plan.actions,
    out: deckOut,
    status,
    elapsedMs: Date.now() - startedAt,
    error: safeString(error).slice(0, 1000) || null,
    stdoutTail: safeString(stdout).slice(-2000),
    stderrTail: safeString(stderr).slice(-2000)
  };
}

async function runLimited(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function loop() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, loop));
  return results;
}

function makeReport({ args, queueFile, outRoot, plans, results }) {
  return {
    provider: "minimum-unit-gap-repair-runner-v1",
    generatedAt: new Date().toISOString(),
    queueFile,
    outRoot,
    options: {
      maxPages: args.maxPages,
      minAreaRatio: args.minAreaRatio,
      deckConcurrency: args.deckConcurrency,
      pageConcurrency: args.pageConcurrency,
      skipPptx: args.skipPptx,
      dryRun: args.dryRun
    },
    summary: {
      decks: plans.length,
      pages: plans.reduce((sum, plan) => sum + plan.pages.length, 0),
      actions: plans.reduce((sum, plan) => sum + plan.actions, 0),
      convertedDecks: results.filter((result) => result.status === "converted").length,
      failedDecks: results.filter((result) => result.status === "failed").length
    },
    plans,
    results
  };
}

function actionSummary(action = {}) {
  return {
    page: clampInteger(action.page, 1, 10000, 0),
    image: clampInteger(action.image, 1, 10000, 0),
    imageId: safeString(action.imageId),
    areaRatio: Number.isFinite(Number(action.areaRatio)) ? Number(action.areaRatio) : null,
    templateFamily: safeString(action.templateFamily),
    targetMotifs: safeArray(action.targetMotifs).map(safeString).filter(Boolean)
  };
}

function parsePageSet(value) {
  const set = new Set();
  for (const part of safeString(value).split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const match = /^(\d+)-(\d+)$/.exec(trimmed);
    if (match) {
      const start = Number(match[1]);
      const end = Number(match[2]);
      for (let page = Math.min(start, end); page <= Math.max(start, end); page += 1) set.add(page);
    } else if (/^\d+$/.test(trimmed)) {
      set.add(Number(trimmed));
    }
  }
  return set;
}

function parseLastJson(stdout) {
  const text = safeString(stdout).trim();
  if (!text) return null;
  const start = text.lastIndexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return null;
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value) {
  return value == null ? "" : String(value);
}

function safeFileStem(value) {
  return safeString(value).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 160) || "deck";
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  buildDeckPlans,
  isStructuralRebuildAction,
  parseArgs,
  parsePageSet
};
