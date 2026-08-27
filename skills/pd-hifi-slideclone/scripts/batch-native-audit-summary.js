#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { auditNativeFragmentation } = require("./native-fragmentation-audit");
const { auditGraphicReconstructionDecisions } = require("./graphic-reconstruction-decision-audit");
const { evaluateDecisionGate } = require("./graphic-reconstruction-decision-gate");
const { auditPluginComponentTargets } = require("./plugin-component-target-audit");

function parseArgs(argv = process.argv) {
  const args = {
    irDir: path.join("ppt文档", "组件策略可编辑版本"),
    out: path.join("runs", "batch-native-audit-summary.json"),
    markdownOut: "",
    maxProtectedCropAreaRatio: 0.28,
    minDecks: 0,
    minPages: 0,
    maxDownloadGatedPluginTargets: null,
    maxUnknownProtectedCrops: null,
    maxProtectedGenericStructuredDiagrams: null,
    failOnFindings: true
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--ir-dir" && next) {
      args.irDir = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if ((arg === "--markdown-out" || arg === "--md") && next) {
      args.markdownOut = next;
      index += 1;
    } else if (arg === "--max-protected-crop-area-ratio" && next) {
      args.maxProtectedCropAreaRatio = Number(next);
      index += 1;
    } else if (arg === "--min-decks" && next) {
      args.minDecks = Number(next);
      index += 1;
    } else if (arg === "--min-pages" && next) {
      args.minPages = Number(next);
      index += 1;
    } else if (arg === "--max-download-gated-plugin-targets" && next) {
      args.maxDownloadGatedPluginTargets = Number(next);
      index += 1;
    } else if (arg === "--max-unknown-protected-crops" && next) {
      args.maxUnknownProtectedCrops = Number(next);
      index += 1;
    } else if (arg === "--max-protected-generic-structured-diagrams" && next) {
      args.maxProtectedGenericStructuredDiagrams = Number(next);
      index += 1;
    } else if (arg === "--no-fail" || arg === "--allow-findings") {
      args.failOnFindings = false;
    } else if (arg === "--fail-on-findings") {
      args.failOnFindings = true;
    } else {
      throw new Error(`Unknown batch-native-audit-summary argument: ${arg}`);
    }
  }
  return args;
}

function summarizeBatchNativeAudit(options = {}) {
  const irDir = path.resolve(String(options.irDir || ""));
  const thresholds = {
    maxProtectedCropAreaRatio: normalizeRatio(options.maxProtectedCropAreaRatio, 0.28),
    minDecks: normalizeNonNegativeInt(options.minDecks, 0),
    minPages: normalizeNonNegativeInt(options.minPages, 0),
    maxDownloadGatedPluginTargets: normalizeOptionalNonNegativeInt(options.maxDownloadGatedPluginTargets),
    maxUnknownProtectedCrops: normalizeOptionalNonNegativeInt(options.maxUnknownProtectedCrops),
    maxProtectedGenericStructuredDiagrams: normalizeOptionalNonNegativeInt(options.maxProtectedGenericStructuredDiagrams)
  };
  const files = fs.existsSync(irDir)
    ? fs.readdirSync(irDir)
      .filter((name) => !name.startsWith(".") && /\.native\.ir\.json$/i.test(name))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => path.join(irDir, name))
    : [];
  const decks = files.map((file) => summarizeDeck(file, { maxProtectedCropAreaRatio: thresholds.maxProtectedCropAreaRatio }));
  const pluginTargets = auditPluginComponentTargets({ irDir, maxExamples: 10 });
  const totals = decks.reduce((acc, deck) => {
    acc.decks += 1;
    acc.pages += deck.pages;
    acc.shapes += deck.shapes;
    acc.textBoxes += deck.textBoxes;
    acc.images += deck.images;
    acc.fragmentationRisks += deck.fragmentationRisks;
    acc.actionableNativeGaps += deck.actionableNativeGaps;
    acc.protectedCrops += deck.protectedCrops;
    acc.nativeCovered += deck.nativeCovered;
    acc.decisionGateFailures += deck.decisionGate.status === "passed" ? 0 : 1;
    acc.oversizedProtectedCrops += deck.decisionGate.summary.oversizedProtectedCrops;
    acc.missingProtectedCropEvidence += deck.decisionGate.summary.missingProtectedCropEvidence;
    acc.semanticProtectedCropsWithoutEvidence += deck.decisionGate.summary.semanticProtectedCropsWithoutEvidence;
    mergeExpressionFamilyCounts(acc.expressionFamilies, deck.expressionFamilyCounts);
    return acc;
  }, {
    decks: 0,
    pages: 0,
    shapes: 0,
    textBoxes: 0,
    images: 0,
    fragmentationRisks: 0,
    actionableNativeGaps: 0,
    protectedCrops: 0,
    nativeCovered: 0,
    decisionGateFailures: 0,
    oversizedProtectedCrops: 0,
    missingProtectedCropEvidence: 0,
    semanticProtectedCropsWithoutEvidence: 0,
    expressionFamilies: {},
    embeddedPluginTargets: Number(pluginTargets.totals?.embeddedPluginTargets || 0),
    executablePluginTargets: Number(pluginTargets.totals?.executableTargets || 0),
    importReadyPluginTargets: Number(pluginTargets.totals?.importReadyTargets || 0),
    downloadGatedPluginTargets: Number(pluginTargets.totals?.downloadGatedTargets || 0),
    protectedPluginCropTargets: Number(pluginTargets.totals?.protectedCropTargets || 0),
    protectedNonSemanticPluginTargets: Number(pluginTargets.totals?.protectedNonSemanticTargets || 0),
    unsafePluginTargets: Number(pluginTargets.totals?.unsafeRejectedTargets || 0)
  });
  totals.unknownProtectedCrops = Number(totals.expressionFamilies?.unknown?.protectedCrops || 0);
  totals.protectedGenericStructuredDiagrams = decks.reduce(
    (sum, deck) => sum + safeArray(deck.protectedGenericStructuredDiagrams).length,
    0
  );
  const unknownProtectedCropExamples = decks
    .flatMap((deck) => safeArray(deck.unknownProtectedCrops).map((item) => ({ deck: deck.deck, ...item })))
    .slice(0, 50);
  const protectedGenericStructuredDiagramExamples = decks
    .flatMap((deck) => safeArray(deck.protectedGenericStructuredDiagrams).map((item) => ({ deck: deck.deck, ...item })))
    .slice(0, 50);
  const findings = batchFindings(totals, thresholds);
  return {
    provider: "batch-native-audit-summary-v1",
    generatedAt: new Date().toISOString(),
    irDir,
    ok: findings.length === 0,
    thresholds,
    findings,
    totals,
    unknownProtectedCropExamples,
    protectedGenericStructuredDiagramExamples,
    pluginTargets: {
      summary: pluginTargets.totals,
      decks: pluginTargets.decks.map((deck) => ({
        deck: deck.deck,
        embeddedPluginTargets: deck.summary.embeddedPluginTargets,
        executableTargets: deck.summary.executableTargets,
        protectedCropTargets: deck.summary.protectedCropTargets,
        protectedNonSemanticTargets: deck.summary.protectedNonSemanticTargets,
        unsafeRejectedTargets: deck.summary.unsafeRejectedTargets,
        deferTargets: deck.summary.deferTargets
      }))
    },
    decks
  };
}

function batchFindings(totals = {}, thresholds = {}) {
  const findings = [];
  if (Number(totals.decks || 0) < Number(thresholds.minDecks || 0)) {
    findings.push(`decks ${Number(totals.decks || 0)} is below required ${Number(thresholds.minDecks || 0)}`);
  }
  if (Number(totals.pages || 0) < Number(thresholds.minPages || 0)) {
    findings.push(`pages ${Number(totals.pages || 0)} is below required ${Number(thresholds.minPages || 0)}`);
  }
  if (Number(totals.fragmentationRisks || 0) > 0) {
    findings.push(`fragmentationRisks remain: ${Number(totals.fragmentationRisks || 0)}`);
  }
  if (Number(totals.actionableNativeGaps || 0) > 0) {
    findings.push(`actionableNativeGaps remain: ${Number(totals.actionableNativeGaps || 0)}`);
  }
  if (Number(totals.unsafePluginTargets || 0) > 0) {
    findings.push(`unsafePluginTargets remain: ${Number(totals.unsafePluginTargets || 0)}`);
  }
  if (thresholds.maxDownloadGatedPluginTargets !== null
    && Number(totals.downloadGatedPluginTargets || 0) > Number(thresholds.maxDownloadGatedPluginTargets)) {
    findings.push(`downloadGatedPluginTargets ${Number(totals.downloadGatedPluginTargets || 0)} exceeds allowed ${Number(thresholds.maxDownloadGatedPluginTargets)}`);
  }
  if (thresholds.maxUnknownProtectedCrops !== null
    && Number(totals.unknownProtectedCrops || 0) > Number(thresholds.maxUnknownProtectedCrops)) {
    findings.push(`unknownProtectedCrops ${Number(totals.unknownProtectedCrops || 0)} exceeds allowed ${Number(thresholds.maxUnknownProtectedCrops)}`);
  }
  if (thresholds.maxProtectedGenericStructuredDiagrams !== null
    && Number(totals.protectedGenericStructuredDiagrams || 0) > Number(thresholds.maxProtectedGenericStructuredDiagrams)) {
    findings.push(`protectedGenericStructuredDiagrams ${Number(totals.protectedGenericStructuredDiagrams || 0)} exceeds allowed ${Number(thresholds.maxProtectedGenericStructuredDiagrams)}`);
  }
  if (Number(totals.decisionGateFailures || 0) > 0) {
    findings.push(`decisionGateFailures remain: ${Number(totals.decisionGateFailures || 0)}`);
  }
  if (Number(totals.oversizedProtectedCrops || 0) > 0) {
    findings.push(`oversizedProtectedCrops remain: ${Number(totals.oversizedProtectedCrops || 0)}`);
  }
  if (Number(totals.missingProtectedCropEvidence || 0) > 0) {
    findings.push(`missingProtectedCropEvidence remain: ${Number(totals.missingProtectedCropEvidence || 0)}`);
  }
  if (Number(totals.semanticProtectedCropsWithoutEvidence || 0) > 0) {
    findings.push(`semanticProtectedCropsWithoutEvidence remain: ${Number(totals.semanticProtectedCropsWithoutEvidence || 0)}`);
  }
  return findings;
}

function summarizeDeck(file, options = {}) {
  const ir = readJson(file);
  const fragmentation = auditNativeFragmentation(ir);
  const decisions = auditGraphicReconstructionDecisions({ ir: file });
  const decisionGate = evaluateDecisionGate({
    report: decisions,
    maxActionableGaps: 0,
    maxProtectedCropAreaRatio: options.maxProtectedCropAreaRatio,
    requireNoDefer: true,
    requireProtectedCropEvidence: true
  });
  const pages = Array.isArray(ir.pages) ? ir.pages : [];
  const pageShapeCounts = pages.map((page, pageIndex) => ({
    pageIndex,
    slide: pageIndex + 1,
    shapes: safeArray(page.shapes).length,
    textBoxes: safeArray(page.textBoxes).length,
    images: safeArray(page.images).length
  }));
  const expressionFamilyCounts = summarizeExpressionFamilies(decisions.decisions);
  return {
    deck: path.basename(file).replace(/\.native\.ir\.json$/i, ""),
    file,
    pages: pages.length,
    shapes: Number(fragmentation.totals.shapes || 0),
    textBoxes: Number(fragmentation.totals.textBoxes || 0),
    images: Number(fragmentation.totals.images || 0),
    fragmentationRisks: Number(fragmentation.totals.fragmentationRisks || 0),
    actionableNativeGaps: Number(decisions.summary?.actionableNativeGaps || 0),
    protectedCrops: Number(decisions.summary?.protectedCrops || 0),
    nativeCovered: Number(decisions.summary?.nativeCovered || 0),
    decisionCounts: decisions.summary?.byDecision || {},
    expressionFamilyCounts,
    decisionGate: {
      status: decisionGate.status,
      findings: safeArray(decisionGate.findings),
      summary: {
        oversizedProtectedCrops: Number(decisionGate.summary?.oversizedProtectedCrops || 0),
        missingProtectedCropEvidence: Number(decisionGate.summary?.missingProtectedCropEvidence || 0),
        semanticProtectedCropsWithoutEvidence: Number(decisionGate.summary?.semanticProtectedCropsWithoutEvidence || 0),
        deferred: Number(decisionGate.summary?.deferred || 0),
        invalidDecisions: Number(decisionGate.summary?.invalidDecisions || 0)
      },
      examples: decisionGate.examples || {}
    },
    topShapePages: pageShapeCounts
      .sort((a, b) => b.shapes - a.shapes)
      .slice(0, 3),
    risks: fragmentation.fragmentationRisks.map((risk) => ({
      type: risk.type,
      severity: risk.severity,
      slide: Number(risk.pageIndex) + 1,
      layerId: risk.layerId,
      shapeCount: risk.shapeCount || null,
      message: risk.message
    })),
    actionableGaps: safeArray(decisions.actionableGaps).map((gap) => ({
      slide: gap.slide,
      imageId: gap.imageId,
      detector: gap.detector,
      layerType: gap.layerType,
      expressionForm: gap.expressionForm,
      expressionSubtype: gap.expressionSubtype,
      expressionFamily: gap.expressionFamily,
      reasons: gap.reasons
    })),
    oversizedProtectedCrops: safeArray(decisionGate.examples?.oversizedProtectedCrops),
    missingProtectedCropEvidence: safeArray(decisionGate.examples?.missingProtectedCropEvidence),
    semanticProtectedCropsWithoutEvidence: safeArray(decisionGate.examples?.semanticProtectedCropsWithoutEvidence),
    unknownProtectedCrops: safeArray(decisions.decisions)
      .filter((decision) => decision.decision === "preserve-local-crop"
        && (!safeString(decision.expressionFamily) || safeString(decision.expressionFamily).toLowerCase() === "unknown"))
      .map((decision) => ({
        slide: decision.slide,
        imageId: decision.imageId,
        detector: decision.detector,
        expressionForm: decision.expressionForm,
        expressionSubtype: decision.expressionSubtype,
        areaRatio: decision.areaRatio,
        recommendedAction: decision.recommendedAction
      })),
    protectedGenericStructuredDiagrams: safeArray(decisions.decisions)
      .filter((decision) => decision.decision === "preserve-local-crop"
        && safeString(decision.expressionFamily).toLowerCase() === "generic-structured-diagram"
        && decision.fidelityException?.approved !== true)
      .map((decision) => ({
        slide: decision.slide,
        imageId: decision.imageId,
        detector: decision.detector,
        expressionForm: decision.expressionForm,
        expressionSubtype: decision.expressionSubtype,
        areaRatio: decision.areaRatio,
        recommendedAction: decision.recommendedAction
      }))
  };
}

function renderMarkdown(report = {}) {
  const lines = [
    "# Batch Native Audit Summary",
    "",
    `OK: ${report.ok ? "yes" : "no"}`,
    `Decks: ${report.totals?.decks || 0}`,
    `Pages: ${report.totals?.pages || 0}`,
    `Fragmentation risks: ${report.totals?.fragmentationRisks || 0}`,
    `Actionable native gaps: ${report.totals?.actionableNativeGaps || 0}`,
    `Decision gate failures: ${report.totals?.decisionGateFailures || 0}`,
    `Oversized protected crops: ${report.totals?.oversizedProtectedCrops || 0}`,
    `Missing protected crop evidence: ${report.totals?.missingProtectedCropEvidence || 0}`,
    `Semantic protected crops without evidence: ${report.totals?.semanticProtectedCropsWithoutEvidence || 0}`,
    `Unknown protected crops: ${report.totals?.unknownProtectedCrops || 0}`,
    `Protected generic structured diagrams: ${report.totals?.protectedGenericStructuredDiagrams || 0}`,
    `Executable plugin targets: ${report.totals?.executablePluginTargets || 0}`,
    `Import-ready plugin targets: ${report.totals?.importReadyPluginTargets || 0}`,
    `Download-gated plugin targets: ${report.totals?.downloadGatedPluginTargets || 0}`,
    `Protected plugin crop targets: ${report.totals?.protectedPluginCropTargets || 0}`,
    `Protected non-semantic plugin targets: ${report.totals?.protectedNonSemanticPluginTargets || 0}`,
    `Unsafe plugin targets: ${report.totals?.unsafePluginTargets || 0}`,
    ""
  ];
  const families = Object.entries(report.totals?.expressionFamilies || {})
    .sort((a, b) => Number(b[1]?.total || 0) - Number(a[1]?.total || 0));
  if (families.length) {
    lines.push("Expression families:");
    for (const [family, counts] of families) {
      lines.push(`- ${family}: total=${counts.total || 0}, protected=${counts.protectedCrops || 0}, plugin=${counts.pluginTemplateTargets || 0}, nativeGaps=${counts.actionableNativeGaps || 0}`);
    }
    lines.push("");
  }
  if (safeArray(report.findings).length) {
    lines.push("Findings:");
    for (const finding of safeArray(report.findings)) lines.push(`- ${finding}`);
    lines.push("");
  }
  if (safeArray(report.unknownProtectedCropExamples).length) {
    lines.push("Unknown protected crop examples:");
    for (const item of safeArray(report.unknownProtectedCropExamples).slice(0, 20)) {
      lines.push(`- ${item.deck} p${item.slide || "?"}: ${item.detector || item.imageId || "(unknown)"} form=${item.expressionForm || "unknown"} subtype=${item.expressionSubtype || "unknown"} area=${item.areaRatio || 0}`);
    }
    lines.push("");
  }
  if (safeArray(report.protectedGenericStructuredDiagramExamples).length) {
    lines.push("Protected generic structured diagram examples:");
    for (const item of safeArray(report.protectedGenericStructuredDiagramExamples).slice(0, 20)) {
      lines.push(`- ${item.deck} p${item.slide || "?"}: ${item.detector || item.imageId || "(unknown)"} subtype=${item.expressionSubtype || "unknown"} area=${item.areaRatio || 0}`);
    }
    lines.push("");
  }
  for (const deck of safeArray(report.decks)) {
    lines.push(`## ${deck.deck}`);
    lines.push("");
    lines.push(`- pages/shapes/images: ${deck.pages}/${deck.shapes}/${deck.images}`);
    lines.push(`- fragmentationRisks: ${deck.fragmentationRisks}`);
    lines.push(`- actionableNativeGaps: ${deck.actionableNativeGaps}`);
    lines.push(`- decisionGate: ${deck.decisionGate.status}`);
    lines.push(`- decisions: ${JSON.stringify(deck.decisionCounts)}`);
    if (Object.keys(deck.expressionFamilyCounts || {}).length) {
      lines.push(`- expressionFamilies: ${JSON.stringify(deck.expressionFamilyCounts)}`);
    }
    if (deck.risks.length) {
      lines.push(`- top risk: p${deck.risks[0].slide} ${deck.risks[0].type} ${deck.risks[0].layerId || ""}`);
    }
    if (deck.actionableGaps.length) {
      lines.push(`- top gap: p${deck.actionableGaps[0].slide} ${deck.actionableGaps[0].expressionSubtype || deck.actionableGaps[0].detector}`);
    }
    if (deck.oversizedProtectedCrops.length) {
      const item = deck.oversizedProtectedCrops[0];
      lines.push(`- oversized protected crop: p${item.slide || "?"} ${item.expressionSubtype || item.detector || item.imageId}`);
    }
    if (deck.missingProtectedCropEvidence.length) {
      const item = deck.missingProtectedCropEvidence[0];
      lines.push(`- missing protected crop evidence: p${item.slide || "?"} ${item.detector || item.imageId || "(unknown)"}`);
    }
    if (deck.semanticProtectedCropsWithoutEvidence.length) {
      const item = deck.semanticProtectedCropsWithoutEvidence[0];
      lines.push(`- semantic protected crop missing exemption: p${item.slide || "?"} ${item.expressionSubtype || item.detector || item.imageId}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function summarizeExpressionFamilies(decisions = []) {
  const counts = {};
  for (const decision of safeArray(decisions)) {
    const family = safeExpressionFamily(decision.expressionFamily);
    const entry = counts[family] || {
      total: 0,
      protectedCrops: 0,
      pluginTemplateTargets: 0,
      actionableNativeGaps: 0,
      deferred: 0
    };
    entry.total += 1;
    if (decision.decision === "preserve-local-crop") entry.protectedCrops += 1;
    if (decision.decision === "harvest-or-apply-plugin-template") entry.pluginTemplateTargets += 1;
    if (decision.decision === "rebuild-native-gap") entry.actionableNativeGaps += 1;
    if (decision.decision === "defer-low-confidence") entry.deferred += 1;
    counts[family] = entry;
  }
  return counts;
}

function mergeExpressionFamilyCounts(target = {}, source = {}) {
  for (const [family, counts] of Object.entries(source || {})) {
    const key = safeExpressionFamily(family);
    const entry = target[key] || {
      total: 0,
      protectedCrops: 0,
      pluginTemplateTargets: 0,
      actionableNativeGaps: 0,
      deferred: 0
    };
    entry.total += Number(counts.total || 0);
    entry.protectedCrops += Number(counts.protectedCrops || 0);
    entry.pluginTemplateTargets += Number(counts.pluginTemplateTargets || 0);
    entry.actionableNativeGaps += Number(counts.actionableNativeGaps || 0);
    entry.deferred += Number(counts.deferred || 0);
    target[key] = entry;
  }
  return target;
}

function safeExpressionFamily(value) {
  return safeString(value) || "unknown";
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function normalizeRatio(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.min(1, number) : fallback;
}

function normalizeNonNegativeInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

function normalizeOptionalNonNegativeInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(String(file)), "utf8").replace(/^\uFEFF/, ""));
}

function main() {
  const args = parseArgs();
  const report = summarizeBatchNativeAudit(args);
  if (args.out) {
    const out = path.resolve(args.out);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  if (args.markdownOut) {
    const out = path.resolve(args.markdownOut);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, renderMarkdown(report), "utf8");
  }
  console.log(JSON.stringify(report.totals, null, 2));
  if (!report.ok && args.failOnFindings !== false) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  renderMarkdown,
  summarizeBatchNativeAudit
};
