#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { classifyGraphicExpressionPolicy } = require("./lib/graphic-expression-policy");

const DEFAULT_IR_DIR = path.join("ppt文档", "组件策略可编辑版本");

function parseArgs(argv = process.argv) {
  const args = {
    ir: "",
    irDir: DEFAULT_IR_DIR,
    out: path.join("runs", "plugin-component-target-audit.json"),
    markdownOut: "",
    maxExamples: 50
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--ir" && next) {
      args.ir = next;
      index += 1;
    } else if (arg === "--ir-dir" && next) {
      args.irDir = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if ((arg === "--markdown-out" || arg === "--md") && next) {
      args.markdownOut = next;
      index += 1;
    } else if (arg === "--max-examples" && next) {
      args.maxExamples = Number(next);
      index += 1;
    } else {
      throw new Error(`Unknown plugin-component-target-audit argument: ${arg}`);
    }
  }
  return args;
}

function auditPluginComponentTargets(options = {}) {
  const files = resolveInputFiles(options);
  const maxExamples = normalizePositiveInt(options.maxExamples, 50);
  const decks = files.map((file) => auditDeck(file, { maxExamples }));
  const totals = decks.reduce((acc, deck) => {
    acc.decks += 1;
    acc.pages += deck.pages;
    acc.images += deck.images;
    acc.embeddedPluginTargets += deck.summary.embeddedPluginTargets;
    acc.executableTargets += deck.summary.executableTargets;
    acc.importReadyTargets += deck.summary.importReadyTargets;
    acc.downloadGatedTargets += deck.summary.downloadGatedTargets;
    acc.protectedCropTargets += deck.summary.protectedCropTargets;
    acc.protectedNonSemanticTargets += deck.summary.protectedNonSemanticTargets;
    acc.unsafeRejectedTargets += deck.summary.unsafeRejectedTargets;
    acc.deferTargets += deck.summary.deferTargets;
    mergeCounts(acc.byProvider, deck.summary.byProvider);
    mergeCounts(acc.byTemplateFamily, deck.summary.byTemplateFamily);
    mergeCounts(acc.byExpressionKind, deck.summary.byExpressionKind);
    mergeCounts(acc.rejectedByReason, deck.summary.rejectedByReason);
    return acc;
  }, emptyTotals());
  return {
    provider: "plugin-component-target-audit-v1",
    generatedAt: new Date().toISOString(),
    input: {
      ir: options.ir ? path.resolve(String(options.ir)) : "",
      irDir: options.ir ? "" : path.resolve(String(options.irDir || DEFAULT_IR_DIR))
    },
    ok: totals.unsafeRejectedTargets === 0,
    totals,
    decks
  };
}

function auditDeck(file, options = {}) {
  const ir = readJson(file);
  const pages = safeArray(ir.pages);
  const rows = [];
  pages.forEach((page, pageIndex) => {
    safeArray(page.images).forEach((image, imageIndex) => {
      const row = classifyPluginTargetImage({
        deck: path.basename(file).replace(/\.native\.ir\.json$/i, ""),
        file,
        pageIndex,
        imageIndex,
        image
      });
      if (row) rows.push(row);
    });
  });
  const summary = summarizeRows(rows);
  return {
    deck: path.basename(file).replace(/\.native\.ir\.json$/i, ""),
    file,
    pages: pages.length,
    images: pages.reduce((sum, page) => sum + safeArray(page.images).length, 0),
    summary,
    executableTargets: rows.filter((row) => row.decision === "executable-plugin-target").slice(0, options.maxExamples),
    importReadyTargets: rows.filter((row) => row.decision === "executable-plugin-target" && row.pluginAction?.implementationStatus === "import-ready").slice(0, options.maxExamples),
    downloadGatedTargets: rows.filter((row) => row.decision === "executable-plugin-target" && row.pluginAction?.implementationStatus === "download-gated").slice(0, options.maxExamples),
    protectedCropTargets: rows.filter((row) => row.decision === "preserve-local-crop").slice(0, options.maxExamples),
    rejectedTargets: rows.filter((row) => row.decision === "reject-unsafe-plugin-target").slice(0, options.maxExamples),
    deferTargets: rows.filter((row) => row.decision === "defer-until-structure-evidence").slice(0, options.maxExamples)
  };
}

function classifyPluginTargetImage({ deck = "", file = "", pageIndex = 0, imageIndex = 0, image = {} } = {}) {
  const strategy = image?.source?.componentRenderStrategy || {};
  if (strategy.mode !== "plugin-component-template") return null;
  const source = image.source || {};
  const layer = source.layer || {};
  const policyInput = {
    ...source,
    image,
    source,
    layer,
    detector: source.detector,
    layerType: layer.layerType || source.layerType,
    expressionForm: source.expressionForm,
    expressionSubtype: source.expressionSubtype,
    recommendedAction: source.recommendedAction || source.expressionRecommendation,
    diagramUnderstanding: layer.diagramUnderstanding || source.diagramUnderstanding
  };
  const expressionPolicy = classifyGraphicExpressionPolicy(policyInput);
  const structural = classifyStructuralExpression(policyInput);
  const action = componentActionFromStrategy(strategy, { image, source });
  const base = {
    deck,
    file,
    slide: pageIndex + 1,
    pageIndex,
    imageIndex,
    imageId: safeString(image.id),
    detector: safeString(source.detector),
    layerType: safeString(layer.layerType || source.layerType),
    expressionForm: safeString(source.expressionForm),
    expressionSubtype: safeString(source.expressionSubtype),
    recommendedAction: safeString(source.recommendedAction || source.expressionRecommendation),
    expressionPolicy,
    structural,
    pluginAction: action,
    box: normalizeBox(image.box)
  };

  if (isPerspectiveIllustrationMinimumUnit(policyInput)) {
    return {
      ...base,
      decision: "preserve-local-crop",
      reasons: [
        "perspective-illustration-minimum-unit",
        "fidelity-crop-preferred-over-mismatched-card-grid-template"
      ]
    };
  }

  if (expressionPolicy.protectCrop && !expressionPolicy.allowPluginTemplate) {
    return {
      ...base,
      decision: "preserve-local-crop",
      reasons: [
        "expression-policy-protects-crop",
        ...expressionPolicy.reasons
      ]
    };
  }

  if (!structural.executable) {
    const decision = structural.hasWeakStructure ? "defer-until-structure-evidence" : "reject-unsafe-plugin-target";
    return {
      ...base,
      decision,
      reasons: structural.reasons
    };
  }

  if (!action.id && !action.title) {
    return {
      ...base,
      decision: "defer-until-structure-evidence",
      reasons: ["missing-plugin-component-identity"]
    };
  }

  return {
    ...base,
    decision: "executable-plugin-target",
    reasons: [
      "structured-expression-safe-for-plugin-component",
      ...structural.reasons
    ]
  };
}

function isPerspectiveIllustrationMinimumUnit(input = {}) {
  const source = input.source || {};
  const layer = input.layer || {};
  const understanding = input.diagramUnderstanding || layer.diagramUnderstanding || source.diagramUnderstanding || {};
  const text = [
    input.detector,
    input.layerType,
    input.expressionForm,
    input.expressionSubtype,
    input.recommendedAction,
    source.reason,
    source.nonEditableReason,
    source.strategy,
    source.box?.name,
    layer.box?.name
  ].map(safeString).join(" ").toLowerCase();
  const residuals = safeArray(understanding.residuals);
  const atomKinds = {
    ...understanding.visualAtomKindCounts
  };
  const hasPerspectiveCue = /perspective|island|透视|孤岛|示意|illustration/.test(text);
  const hasFidelityCue = /preserve|fidelity|local-crop|保真|裁片/.test(text);
  const hasScreenshotOrComplexResidual = residuals.some((item) => /screenshot|complex|illustration|crop/.test(safeString(item?.kind).toLowerCase()))
    || Number(atomKinds["screenshot-crop-candidate"] || 0) > 0
    || Number(atomKinds["complex-shape-crop-candidate"] || 0) > 0;
  const nodeCount = finiteNumber(understanding.nodeCount, 0) + safeArray(understanding.nodes).length;
  const connectorCount = finiteNumber(understanding.connectorCount, 0) + safeArray(understanding.connectors).length;
  const hasSemanticStructure = nodeCount >= 2 || connectorCount >= 2;
  return hasPerspectiveCue && hasFidelityCue && hasScreenshotOrComplexResidual && !hasSemanticStructure;
}

function classifyStructuralExpression(input = {}) {
  const layer = input.layer || {};
  const understanding = input.diagramUnderstanding || layer.diagramUnderstanding || input.source?.diagramUnderstanding || {};
  const family = safeString(understanding.componentStrategy?.templateFamily).toLowerCase();
  const archetype = safeString(understanding.archetype).toLowerCase();
  const text = [
    input.detector,
    input.layerType,
    input.expressionForm,
    input.expressionSubtype,
    input.recommendedAction,
    family,
    archetype
  ].map(safeString).join(" ").toLowerCase();
  const nodeCount = finiteNumber(understanding.nodeCount, 0)
    + finiteNumber(understanding.visualNodeCount, 0)
    + safeArray(understanding.nodes).length;
  const connectorCount = finiteNumber(understanding.connectorCount, 0)
    + finiteNumber(understanding.visualConnectorCount, 0)
    + safeArray(understanding.connectors).length;
  const atomCount = finiteNumber(understanding.visualAtomCount, 0)
    + safeArray(understanding.visualAtoms).length;
  const gridLineCount = finiteNumber(understanding.visualAtomKindCounts?.["grid-line-candidate"], 0);
  const reasons = [];
  const isChartOrTable = /table|matrix|grid|chart|graph|plot/.test(text);
  const isDiagram = /diagram|flow|process|relationship|timeline|tree|topology|network|hub|spoke|cycle|funnel|architecture/.test(text);
  const isUnsafeAsset = /icon-or-illustration|illustration-zone|visual-example|screenshot|screen-capture|ui-capture|photo|bitmap|logo|brand|decorative|texture|示意图|图标|截图|插画/.test(text)
    && !/(table|matrix|grid|chart|diagram|flow|process|relationship|timeline|tree|topology|network|architecture)/.test(text);
  const hasStrongStructure = nodeCount >= 2
    || connectorCount >= 1
    || atomCount >= 4
    || gridLineCount >= 2
    || /replace-with-native-components|native-rebuild|rebuild-native|hybrid-native/.test(text);

  if (isUnsafeAsset) {
    reasons.push("obvious-icon-screenshot-or-decorative-asset");
    return { executable: false, hasWeakStructure: false, reasons, nodeCount, connectorCount, atomCount };
  }
  if ((isChartOrTable || isDiagram) && hasStrongStructure) {
    if (isChartOrTable) reasons.push("chart-table-matrix-minimum-unit");
    if (isDiagram) reasons.push("diagram-flow-relationship-minimum-unit");
    reasons.push("semantic-structure-evidence");
    return { executable: true, hasWeakStructure: false, reasons, nodeCount, connectorCount, atomCount };
  }
  if (isChartOrTable || isDiagram) {
    reasons.push("structural-expression-with-insufficient-evidence");
    return { executable: false, hasWeakStructure: true, reasons, nodeCount, connectorCount, atomCount };
  }
  reasons.push("not-a-structural-graphic-expression");
  return { executable: false, hasWeakStructure: false, reasons, nodeCount, connectorCount, atomCount };
}

function componentActionFromStrategy(strategy = {}, context = {}) {
  const best = strategy.bestCandidate || {};
  const plan = strategy.applicationPlan || {};
  const implementationMode = safeString(strategy.implementationMode);
  const localEvidence = localComponentEvidenceFromImage(context.image || {}, context.source || {});
  const implementationStatus = localEvidence
    ? "import-ready"
    : classifyImplementationStatus({ implementationMode, best, plan });
  return {
    provider: safeString(best.sourceProvider || best.provider || plan.sourceProvider),
    kind: safeString(best.kind || plan.componentKind),
    id: safeString(best.id || plan.componentId),
    title: safeString(best.title),
    confidence: finiteNumber(best.candidateScore ?? best.score ?? strategy.componentConfidence, null),
    implementationMode,
    implementationStatus,
    ...(localEvidence ? { localEvidence } : {}),
    targetStep: safeString(plan.targetStep)
  };
}

function localComponentEvidenceFromImage(image = {}, source = {}) {
  const readiness = source.componentAssetReadiness || image.componentAssetReadiness || {};
  const status = safeString(readiness.status).toLowerCase();
  const assets = safeArray(source.componentLocalAssets || image.componentLocalAssets);
  const ready = /applied-plugin-motif-ready|applied-plugin-template-learning-ready|local-template-learning-ready/.test(status);
  const usableAsset = assets.find((asset) => {
    const assetKind = safeString(asset.assetKind).toLowerCase();
    const assetPath = safeString(asset.path);
    if (!assetPath) return false;
    return assetKind === "presentation-template"
      || safeArray(asset.roleTags).map((tag) => safeString(tag).toLowerCase()).some((tag) => /applied-component|downloaded-component|template-layout/.test(tag));
  });
  if (!ready || !usableAsset) return null;
  return {
    status,
    provider: safeString(usableAsset.provider),
    assetId: safeString(usableAsset.id),
    path: safeString(usableAsset.path),
    matchScore: finiteNumber(usableAsset.matchScore, null),
    targetMotifs: safeArray(readiness.targetMotifs).map(safeString).filter(Boolean).slice(0, 12)
  };
}

function classifyImplementationStatus({ implementationMode = "", best = {}, plan = {} } = {}) {
  const localEvidence = safeString(best.localPath || plan.localPath || best.assetPath || plan.assetPath || best.pptxPath || plan.pptxPath);
  if (localEvidence) return "import-ready";
  const text = [
    implementationMode,
    best.downloadUrl,
    plan.downloadUrl,
    plan.targetStep
  ].map(safeString).join(" ").toLowerCase();
  if (/auth-or-download-required|download-required|login-required|when-download-is-available/.test(text)) return "download-gated";
  if (/import-ready|local-component|applied-component/.test(text)) return "import-ready";
  if (safeString(best.downloadUrl || plan.downloadUrl)) return "import-ready";
  return "unresolved";
}

function summarizeRows(rows = []) {
  const summary = {
    embeddedPluginTargets: rows.length,
    executableTargets: 0,
    importReadyTargets: 0,
    downloadGatedTargets: 0,
    protectedCropTargets: 0,
    protectedNonSemanticTargets: 0,
    unsafeRejectedTargets: 0,
    deferTargets: 0,
    byProvider: {},
    byTemplateFamily: {},
    byExpressionKind: {},
    rejectedByReason: {}
  };
  for (const row of rows) {
    if (row.decision === "executable-plugin-target") {
      summary.executableTargets += 1;
      if (row.pluginAction?.implementationStatus === "import-ready") summary.importReadyTargets += 1;
      else if (row.pluginAction?.implementationStatus === "download-gated") summary.downloadGatedTargets += 1;
    }
    else if (row.decision === "preserve-local-crop") {
      summary.protectedCropTargets += 1;
      if (isProtectedNonSemanticTarget(row)) summary.protectedNonSemanticTargets += 1;
    }
    else if (row.decision === "reject-unsafe-plugin-target") summary.unsafeRejectedTargets += 1;
    else if (row.decision === "defer-until-structure-evidence") summary.deferTargets += 1;
    addCount(summary.byProvider, row.pluginAction?.provider || "unknown");
    addCount(summary.byTemplateFamily, row.expressionPolicy?.kind || "unknown");
    addCount(summary.byExpressionKind, row.decision);
    if (row.decision !== "executable-plugin-target") {
      for (const reason of row.reasons || ["unknown"]) addCount(summary.rejectedByReason, reason);
    }
  }
  return summary;
}

function renderMarkdown(report = {}) {
  const lines = [
    "# Plugin Component Target Audit",
    "",
    `OK: ${report.ok ? "yes" : "no"}`,
    `Decks: ${report.totals?.decks || 0}`,
    `Embedded plugin targets: ${report.totals?.embeddedPluginTargets || 0}`,
    `Executable structural targets: ${report.totals?.executableTargets || 0}`,
    `Protected crops: ${report.totals?.protectedCropTargets || 0}`,
    `Protected non-semantic targets: ${report.totals?.protectedNonSemanticTargets || 0}`,
    `Unsafe rejected targets: ${report.totals?.unsafeRejectedTargets || 0}`,
    `Deferred targets: ${report.totals?.deferTargets || 0}`,
    "",
    "Rule: charts, tables, matrices, flows, relationships, timelines, and similar semantic diagrams may enter plugin/native reconstruction. Obvious icons, illustrations, screenshots, decorative textures, and visual examples stay as fidelity crops unless a stronger structural classifier later proves otherwise.",
    ""
  ];
  for (const deck of safeArray(report.decks)) {
    lines.push(`## ${deck.deck}`);
    lines.push("");
    lines.push(`- embedded/executable/protected/nonsemantic/rejected/deferred: ${deck.summary.embeddedPluginTargets}/${deck.summary.executableTargets}/${deck.summary.protectedCropTargets}/${deck.summary.protectedNonSemanticTargets || 0}/${deck.summary.unsafeRejectedTargets}/${deck.summary.deferTargets}`);
    const first = safeArray(deck.executableTargets)[0];
    if (first) {
      lines.push(`- top executable: p${first.slide} ${first.pluginAction.provider} ${first.pluginAction.id || first.pluginAction.title} (${first.expressionSubtype || first.layerType})`);
    }
    const protectedCrop = safeArray(deck.protectedCropTargets)[0];
    if (protectedCrop) {
      lines.push(`- top protected crop: p${protectedCrop.slide} ${protectedCrop.expressionSubtype || protectedCrop.detector}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function resolveInputFiles(options = {}) {
  if (options.ir) return [path.resolve(String(options.ir))];
  const irDir = path.resolve(String(options.irDir || DEFAULT_IR_DIR));
  if (!fs.existsSync(irDir)) return [];
  return fs.readdirSync(irDir)
    .filter((name) => isCanonicalNativeIrFile(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => path.join(irDir, name));
}

function isCanonicalNativeIrFile(name = "") {
  return !String(name || "").startsWith(".")
    && /\.native\.ir\.json$/i.test(String(name || ""));
}

function emptyTotals() {
  return {
    decks: 0,
    pages: 0,
    images: 0,
    embeddedPluginTargets: 0,
    executableTargets: 0,
    importReadyTargets: 0,
    downloadGatedTargets: 0,
    protectedCropTargets: 0,
    protectedNonSemanticTargets: 0,
    unsafeRejectedTargets: 0,
    deferTargets: 0,
    byProvider: {},
    byTemplateFamily: {},
    byExpressionKind: {},
    rejectedByReason: {}
  };
}

function isProtectedNonSemanticTarget(row = {}) {
  const disposition = safeString(row.expressionPolicy?.unitDisposition).toLowerCase();
  if (disposition === "intentional-visual-crop"
    || disposition === "intentional-decorative-crop"
    || disposition === "hybrid-crop-with-native-overlays") {
    return true;
  }
  return row.expressionPolicy?.kind === "standalone-visual-asset"
    || row.expressionPolicy?.kind === "decorative-texture";
}

function normalizeBox(box = {}) {
  return {
    x: finiteNumber(box.x, 0),
    y: finiteNumber(box.y, 0),
    w: finiteNumber(box.w, 0),
    h: finiteNumber(box.h, 0)
  };
}

function mergeCounts(target = {}, source = {}) {
  for (const [key, value] of Object.entries(source || {})) {
    target[key] = (target[key] || 0) + Number(value || 0);
  }
}

function addCount(target = {}, key = "") {
  const safeKey = safeString(key || "unknown");
  target[safeKey] = (target[safeKey] || 0) + 1;
}

function normalizePositiveInt(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(String(file)), "utf8").replace(/^\uFEFF/, ""));
}

function main() {
  const args = parseArgs();
  const report = auditPluginComponentTargets(args);
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
  if (!report.ok) process.exitCode = 1;
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
  auditPluginComponentTargets,
  classifyPluginTargetImage,
  classifyStructuralExpression,
  classifyImplementationStatus,
  parseArgs,
  renderMarkdown
};
