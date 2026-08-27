#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  buildExpressionPolicyRepairsByLayer,
  expressionPolicyRepairDispositionForImage,
  findExpressionPolicyRepairForLayer
} = require("./component-strategy-rebuild");

function parseArgs(argv) {
  const args = {
    repairQueue: "",
    parallelReport: "",
    out: path.join("runs", "expression-policy-repair-queue-coverage.json"),
    minMatchedRatio: 0,
    failOnGap: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if ((arg === "--repair-queue" || arg === "--queue") && next) {
      args.repairQueue = next;
      index += 1;
    } else if ((arg === "--parallel-report" || arg === "--report") && next) {
      args.parallelReport = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (arg === "--min-matched-ratio" && next) {
      args.minMatchedRatio = Number(next);
      index += 1;
    } else if (arg === "--fail-on-gap") {
      args.failOnGap = true;
    } else {
      throw new Error(`Unknown expression-policy-repair-queue-coverage argument: ${arg}`);
    }
  }
  if (!args.repairQueue) throw new Error("--repair-queue is required");
  if (!args.parallelReport) throw new Error("--parallel-report is required");
  args.minMatchedRatio = clampNumber(args.minMatchedRatio, 0, 1, 0);
  return args;
}

function auditRepairQueueCoverage({ repairQueue = {}, parallelReport = {} } = {}) {
  const actions = Array.isArray(repairQueue.actions) ? repairQueue.actions : [];
  const actionsByDeck = groupActionsByDeck(actions);
  const decks = [];
  let matchedActions = 0;
  let finalDeckMatchedActions = 0;
  let candidateLayers = 0;
  let finalDeckImages = 0;
  const finalDeckDispositionCounts = {};
  const finalDeckDispositionKindCounts = {};

  for (const result of Array.isArray(parallelReport.results) ? parallelReport.results : []) {
    const deck = deckNameFromResult(result);
    const deckActions = actionsByDeck.get(deck) || [];
    const candidateReport = readOptionalJson(result.componentCandidateReport);
    const layers = Array.isArray(candidateReport?.layers) ? candidateReport.layers : [];
    const finalDeck = readOptionalJson(result.outputIr);
    const finalImageLayers = finalDeckImageLayers(finalDeck);
    candidateLayers += layers.length;
    finalDeckImages += finalImageLayers.length;
    const repairsByLayer = buildExpressionPolicyRepairsByLayer({ actions: deckActions }, { deck });
    const matchedKeys = new Set();
    for (const layer of layers) {
      const repair = findExpressionPolicyRepairForLayer(repairsByLayer, layer);
      if (repair) matchedKeys.add(actionIdentity(repair));
    }
    const finalDeckMatchedKeys = new Set();
    const finalDeckDispositions = [];
    for (const layer of finalImageLayers) {
      const repair = findExpressionPolicyRepairForLayer(repairsByLayer, layer);
      if (!repair) continue;
      finalDeckMatchedKeys.add(actionIdentity(repair));
      const disposition = expressionPolicyRepairDispositionForImage(
        finalDeckLayerAsImage(layer),
        repair,
        { pageIndex: layer.pageIndex, imageIndex: layer.imageIndex }
      );
      incrementCount(finalDeckDispositionCounts, disposition.action || "unknown");
      incrementCount(finalDeckDispositionKindCounts, disposition.expressionKind || "unknown");
      finalDeckDispositions.push(finalDeckDispositionSummary(layer, repair, disposition));
    }
    matchedActions += matchedKeys.size;
    finalDeckMatchedActions += finalDeckMatchedKeys.size;
    const unmatched = deckActions
      .filter((action) => !matchedKeys.has(actionIdentity(action)))
      .map(actionSummary);
    const finalDeckUnmatched = deckActions
      .filter((action) => !finalDeckMatchedKeys.has(actionIdentity(action)))
      .map(actionSummary);
    decks.push({
      deck,
      queuedActions: deckActions.length,
      candidateLayers: layers.length,
      finalDeckImages: finalImageLayers.length,
      matchedActions: matchedKeys.size,
      finalDeckMatchedActions: finalDeckMatchedKeys.size,
      unmatchedActions: unmatched.length,
      finalDeckUnmatchedActions: finalDeckUnmatched.length,
      matchedRatio: ratio(matchedKeys.size, deckActions.length),
      finalDeckMatchedRatio: ratio(finalDeckMatchedKeys.size, deckActions.length),
      finalDeckDispositionCounts: countObject(finalDeckDispositions, (item) => item.action),
      finalDeckDispositionKindCounts: countObject(finalDeckDispositions, (item) => item.expressionKind),
      finalDeckDispositions,
      unmatched,
      finalDeckUnmatched
    });
  }

  for (const [deck, deckActions] of actionsByDeck.entries()) {
    if (decks.some((entry) => entry.deck === deck)) continue;
    decks.push({
      deck,
      queuedActions: deckActions.length,
      candidateLayers: 0,
      finalDeckImages: 0,
      matchedActions: 0,
      finalDeckMatchedActions: 0,
      unmatchedActions: deckActions.length,
      finalDeckUnmatchedActions: deckActions.length,
      matchedRatio: 0,
      finalDeckMatchedRatio: 0,
      finalDeckDispositionCounts: {},
      finalDeckDispositionKindCounts: {},
      finalDeckDispositions: [],
      unmatched: deckActions.map(actionSummary),
      finalDeckUnmatched: deckActions.map(actionSummary)
    });
  }

  const queuedActions = actions.length;
  return {
    provider: "expression-policy-repair-queue-coverage-v1",
    generatedAt: new Date().toISOString(),
    totals: {
      queuedActions,
      matchedActions,
      finalDeckMatchedActions,
      unmatchedActions: Math.max(0, queuedActions - matchedActions),
      finalDeckUnmatchedActions: Math.max(0, queuedActions - finalDeckMatchedActions),
      candidateLayers,
      finalDeckImages,
      matchedRatio: ratio(matchedActions, queuedActions),
      finalDeckMatchedRatio: ratio(finalDeckMatchedActions, queuedActions),
      finalDeckDispositionCounts,
      finalDeckDispositionKindCounts,
      finalDeckReplacementCandidates: Number(finalDeckDispositionCounts["replacement-candidate"] || 0),
      finalDeckFidelityCrops: Number(finalDeckDispositionCounts["preserve-fidelity-crop"] || 0)
    },
    decks
  };
}

function finalDeckLayerAsImage(layer = {}) {
  const source = layer.source && typeof layer.source === "object" ? layer.source : {};
  return {
    id: safeString(layer.imageId || source.imageId || source.id),
    box: layer.box || null,
    source
  };
}

function finalDeckDispositionSummary(layer = {}, repair = {}, disposition = {}) {
  return {
    action: safeString(disposition.action),
    expressionKind: safeString(disposition.expressionKind),
    minimumUnitPolicy: safeString(disposition.minimumUnitPolicy),
    unitDisposition: safeString(disposition.unitDisposition),
    reason: safeString(disposition.reason),
    page: Number(layer.pageIndex || 0) + 1,
    image: Number(layer.imageIndex || 0) + 1,
    imageId: safeString(layer.imageId),
    detector: safeString(layer.source?.detector || layer.detector || repair.detector),
    violation: safeString(repair.violation),
    repairMode: safeString(repair.repair?.mode || repair.mode),
    box: layer.box || repair.box || null
  };
}

function finalDeckImageLayers(deck = {}) {
  const pages = Array.isArray(deck?.pages) ? deck.pages : [];
  const layers = [];
  for (const [pageIndex, page] of pages.entries()) {
    const images = Array.isArray(page?.images) ? page.images : [];
    for (const [imageIndex, image] of images.entries()) {
      const source = image?.source && typeof image.source === "object" ? image.source : {};
      const layer = source.layer && typeof source.layer === "object" ? source.layer : {};
      layers.push({
        ...layer,
        pageIndex,
        imageIndex,
        imageId: safeString(image?.id || source.imageId || source.id),
        sourceImageId: safeString(source.parentImageId || source.layerSourceId || layer.sourceImageId),
        box: image?.box || layer.box,
        source: {
          ...source,
          imageId: safeString(image?.id || source.imageId || source.id),
          id: safeString(image?.id || source.id)
        }
      });
    }
  }
  return layers;
}

function groupActionsByDeck(actions = []) {
  const grouped = new Map();
  for (const action of actions) {
    const deck = safeString(action.deck || "unknown");
    if (!grouped.has(deck)) grouped.set(deck, []);
    grouped.get(deck).push(action);
  }
  return grouped;
}

function deckNameFromResult(result = {}) {
  const outputIr = safeString(result.outputIr);
  if (outputIr) return path.basename(outputIr).replace(/\.native\.ir\.json$/i, "");
  const candidateReport = safeString(result.componentCandidateReport);
  if (candidateReport) return path.basename(candidateReport).replace(/\.component-candidates\.json$/i, "");
  return safeString(result.deck || result.name || "unknown");
}

function actionIdentity(action = {}) {
  return [
    safeString(action.deck),
    safeString(action.page),
    safeString(action.imageId || action.image),
    safeString(action.violation),
    safeString(action.detector)
  ].join("|");
}

function actionSummary(action = {}) {
  return {
    page: Number(action.page || 0),
    image: Number(action.image || 0),
    imageId: safeString(action.imageId),
    detector: safeString(action.detector),
    violation: safeString(action.violation),
    repairMode: safeString(action.repair?.mode),
    box: action.box || null
  };
}

function ratio(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 10000) / 10000 : 1;
}

function countObject(items = [], keyFn = (item) => item) {
  const counts = {};
  for (const item of Array.isArray(items) ? items : []) {
    incrementCount(counts, keyFn(item) || "unknown");
  }
  return counts;
}

function incrementCount(target = {}, key = "unknown", amount = 1) {
  const safeKey = safeString(key || "unknown") || "unknown";
  target[safeKey] = Number(target[safeKey] || 0) + amount;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(String(file)), "utf8").replace(/^\uFEFF/, ""));
}

function readOptionalJson(file) {
  const resolved = path.resolve(String(file || ""));
  if (!file || !fs.existsSync(resolved)) return null;
  return readJson(resolved);
}

function main() {
  const args = parseArgs(process.argv);
  const report = auditRepairQueueCoverage({
    repairQueue: readJson(args.repairQueue),
    parallelReport: readJson(args.parallelReport)
  });
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    reportFile: path.resolve(args.out),
    ...report.totals
  }, null, 2));
  if (args.failOnGap && report.totals.unmatchedActions > 0) process.exitCode = 1;
  if (args.minMatchedRatio > 0 && report.totals.matchedRatio < args.minMatchedRatio) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(safeString(error?.message || error));
    process.exitCode = 1;
  }
}

module.exports = {
  actionIdentity,
  auditRepairQueueCoverage,
  deckNameFromResult,
  finalDeckDispositionSummary,
  finalDeckLayerAsImage,
  finalDeckImageLayers,
  parseArgs
};
