"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  auditStructuralNativeReadiness,
  scoreStructuralImageCandidate,
  isImageObjectified,
  isProtectedIntentionalCrop
} = require("./structural-native-audit");
const { classifyGraphicExpressionPolicy } = require("./lib/graphic-expression-policy");
const { resolveImageExpressionFamily } = require("./lib/expression-family-normalizer");

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function parseArgs(argv) {
  const args = {
    ir: "",
    shortlist: "",
    out: path.join("runs", "plugin-component-inventory", "graphic-reconstruction-decision-audit.json"),
    markdownOut: ""
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === "--ir" || arg === "--input") && next) {
      args.ir = next;
      i += 1;
    } else if ((arg === "--shortlist" || arg === "--harvest-shortlist") && next) {
      args.shortlist = next;
      i += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      i += 1;
    } else if ((arg === "--markdown-out" || arg === "--guide-out") && next) {
      args.markdownOut = next;
      i += 1;
    } else {
      throw new Error(`Unknown graphic-reconstruction-decision-audit argument: ${arg}`);
    }
  }
  if (!args.ir) throw new Error("--ir is required");
  return args;
}

function auditGraphicReconstructionDecisions(options = {}) {
  const irFile = path.resolve(String(options.ir || ""));
  const ir = readJson(irFile);
  const slideSize = ir.slideSize || DEFAULT_SLIDE;
  const shortlist = options.shortlist ? readJson(path.resolve(String(options.shortlist))) : null;
  const shortlistIndex = indexShortlistActions(shortlist);
  const matchedActionKeys = new Set();
  const structuralAudit = auditStructuralNativeReadiness(ir, {
    deck: path.basename(irFile),
    irDir: path.dirname(irFile),
    slideSize
  });
  const structuralByImage = new Map(
    structuralAudit.candidates.map((item) => [`${item.pageIndex}:${item.imageIndex}`, item])
  );
  const decisions = [];

  safeArray(ir.pages).forEach((page, pageIndex) => {
    safeArray(page.images).forEach((image, imageIndex) => {
      const structural = structuralByImage.get(`${pageIndex}:${imageIndex}`) || null;
      const decision = classifyImageDecision({
        image,
        imageIndex,
        pageIndex,
        slideSize,
        structural,
        shortlistIndex
      });
      if (decision) {
        if (decision.pluginAction?.actionKey) matchedActionKeys.add(decision.pluginAction.actionKey);
        decisions.push(decision);
      }
    });
  });
  decisions.push(...componentLayerDecisionsFromShortlist(shortlist, matchedActionKeys));

  const summary = summarizeDecisions(decisions);
  return {
    provider: "graphic-reconstruction-decision-audit-v1",
    generatedAt: new Date().toISOString(),
    ir: irFile,
    shortlist: options.shortlist ? path.resolve(String(options.shortlist)) : "",
    ok: summary.actionableNativeGaps === 0,
    summary,
    structuralTotals: structuralAudit.totals,
    decisions,
    actionableGaps: decisions.filter((item) => item.decision === "rebuild-native-gap"),
    protectedCrops: decisions.filter((item) => item.decision === "preserve-local-crop"),
    pluginTemplateTargets: decisions.filter((item) => item.decision === "harvest-or-apply-plugin-template")
  };
}

function classifyImageDecision({ image = {}, imageIndex = 0, pageIndex = 0, slideSize = DEFAULT_SLIDE, structural = null, shortlistIndex = new Map() } = {}) {
  const source = image.source || {};
  const layer = source.layer || {};
  const expressionPolicy = classifyGraphicExpressionPolicy(image);
  const score = scoreStructuralImageCandidate(image, slideSize);
  const isStructural = score.isCandidate || structural || expressionPolicy.allowNativeRebuild === true || expressionPolicy.allowPluginTemplate === true;
  const objectified = isImageObjectified(image);
  const protectedByMinimumUnit = expressionPolicy.protectCrop === true && expressionPolicy.allowNativeRebuild !== true;
  const protectedCrop = !objectified && (protectedByMinimumUnit || isProtectedIntentionalCrop(image));
  const sourceIds = candidateSourceIds(image);
  const matchingActions = sourceIds.flatMap((id) => shortlistIndex.get(id) || []);
  const componentStrategyAction = componentRenderStrategyAction(image);
  const bestAction = protectedCrop ? null : matchingActions[0] || componentStrategyAction;
  if (!isStructural && !protectedCrop && !bestAction) return null;

  let decision = "defer-low-confidence";
  const reasons = [...score.reasons];
  reasons.push(
    `expression-policy:${expressionPolicy.kind}`,
    `minimum-unit:${expressionPolicy.minimumUnitPolicy}`
  );
  for (const reason of safeArray(expressionPolicy.reasons).slice(0, 4)) reasons.push(`expression-policy-reason:${reason}`);
  if (objectified) {
    decision = "already-native-or-objectified";
    reasons.push("objectified");
  } else if (protectedCrop) {
    decision = "preserve-local-crop";
    reasons.push("protected-icon-illustration-or-screenshot");
  } else if (bestAction) {
    decision = "harvest-or-apply-plugin-template";
    reasons.push(`plugin-shortlist:${bestAction.status}`);
  } else if (structural?.status === "covered-by-probe") {
    decision = "native-rebuild-probe-covered";
    reasons.push("native-rebuild-probe-covered");
  } else if (structural?.status === "actionable-gap" || /replace-with-native-components|native-rebuild/i.test(String(source.recommendedAction || ""))) {
    decision = "rebuild-native-gap";
    reasons.push("needs-native-rebuild-rule-or-component-template");
  }

  return {
    pageIndex,
    slide: pageIndex + 1,
    imageIndex,
    imageId: safeString(image.id),
    detector: safeString(source.detector),
    layerType: safeString(layer.layerType),
    expressionFamily: safeString(imageExpressionFamily(image)),
    expressionForm: safeString(source.expressionForm),
    expressionSubtype: safeString(source.expressionSubtype),
    recommendedAction: safeString(source.recommendedAction),
    expressionPolicy: summarizeExpressionPolicy(expressionPolicy),
    box: sanitizeBox(image.box),
    areaRatio: imageAreaRatio(image.box, slideSize),
    decision,
    structuralStatus: safeString(structural?.status),
    score: score.score,
    reasons: uniqueStrings(reasons).slice(0, 14),
    sourceIds,
    fidelityException: summarizeFidelityException(source, layer),
    pluginAction: bestAction ? summarizePluginAction(bestAction) : null
  };
}

function summarizeFidelityException(source = {}, layer = {}) {
  const strategy = source.componentRenderStrategy || layer.componentRenderStrategy || {};
  const approved = source.largeFidelityCropApproved === true;
  if (!approved) return null;
  return {
    approved: true,
    reason: safeString(source.largeFidelityCropApprovalReason),
    preserveLocalCrop: safeString(strategy.mode) === "preserve-local-crop"
  };
}

function summarizeExpressionPolicy(policy = {}) {
  return {
    kind: safeString(policy.kind),
    minimumUnitPolicy: safeString(policy.minimumUnitPolicy),
    unitDisposition: safeString(policy.unitDisposition),
    allowNativeRebuild: policy.allowNativeRebuild === true,
    protectCrop: policy.protectCrop === true,
    allowPluginTemplate: policy.allowPluginTemplate === true,
    reasons: safeArray(policy.reasons).map(safeString).filter(Boolean).slice(0, 8)
  };
}

function imageExpressionFamily(image = {}) {
  return resolveImageExpressionFamily(image);
}

function indexShortlistActions(shortlist = null) {
  const map = new Map();
  for (const action of safeArray(shortlist?.actions)) {
    for (const id of actionSourceIds(action)) {
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(action);
    }
  }
  for (const actions of map.values()) actions.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  return map;
}

function actionSourceIds(action = {}) {
  return uniqueStrings(actionIdentityValues(action));
}

function candidateSourceIds(image = {}) {
  const source = image.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};
  const strategy = understanding.componentStrategy || {};
  return uniqueStrings([
    safeString(image.id),
    safeString(source.layerSourceId),
    safeString(source.layerId),
    safeString(source.imageId),
    safeString(source.componentOwnerId),
    safeString(layer.componentOwnerId),
    safeString(layer.id),
    safeString(strategy.componentOwnerId),
    ...safeArray(strategy.candidateComponentIds).map(safeString)
  ]);
}

function summarizePluginAction(action = {}) {
  return {
    actionKey: actionKey(action),
    status: safeString(action.status),
    provider: safeString(action.provider),
    kind: safeString(action.kind),
    id: safeString(action.id),
    title: safeString(action.title),
    score: Number(action.score || 0),
    searchText: safeString(action.action?.searchText || action.matchedKeywords)
  };
}

function componentRenderStrategyAction(image = {}) {
  const strategy = image?.source?.componentRenderStrategy || {};
  if (strategy?.mode !== "plugin-component-template") return null;
  const best = strategy.bestCandidate || {};
  const plan = strategy.applicationPlan || {};
  return {
    status: "component-render-strategy-target",
    provider: safeString(best.sourceProvider || plan.sourceProvider),
    kind: safeString(best.kind || plan.componentKind || "component"),
    id: safeString(best.id || plan.componentId),
    title: safeString(best.title),
    score: Number(best.candidateScore || best.score || best.confidence * 100 || 0),
    action: { searchText: safeString(best.title || best.id || plan.componentId) },
    layerId: safeString(image?.source?.layerSourceId || image?.source?.layerId || image?.id),
    taskId: safeString(plan.componentId || best.id)
  };
}

function componentLayerDecisionsFromShortlist(shortlist = null, matchedActionKeys = new Set()) {
  return safeArray(shortlist?.actions)
    .filter((action) => !matchedActionKeys.has(actionKey(action)))
    .map((action) => {
      const slide = Number.isFinite(Number(action.slide)) ? Number(action.slide) : null;
      return {
        pageIndex: slide ? slide - 1 : null,
        slide,
        imageIndex: null,
        imageId: "",
        detector: "plugin-component-shortlist",
        layerType: "diagram-zone",
        expressionForm: "component-template",
        expressionSubtype: safeString(action.structureSignature?.layout || action.status),
        recommendedAction: "harvest-or-apply-plugin-template",
        decision: "harvest-or-apply-plugin-template",
        structuralStatus: "",
        score: Number(action.score || 0),
        reasons: uniqueStrings([
          `plugin-shortlist:${safeString(action.status)}`,
          ...safeArray(action.reasons)
        ]).slice(0, 14),
        sourceIds: uniqueStrings(actionIdentityValues(action)),
        pluginAction: summarizePluginAction(action)
      };
    });
}

function actionKey(action = {}) {
  return [
    safeString(action.provider),
    safeString(action.kind),
    safeString(action.id),
    safeString(action.layerId),
    safeString(action.taskId)
  ].join("|");
}

function actionIdentityValues(action = {}) {
  return [
    safeString(action.layerId),
    safeString(action.taskId),
    safeString(action.id),
    safeString(action.taskTitle)
  ];
}

function summarizeDecisions(decisions = []) {
  const byDecision = {};
  const byPage = {};
  for (const decision of decisions) {
    byDecision[decision.decision] = (byDecision[decision.decision] || 0) + 1;
    const pageKey = `p${decision.slide}`;
    if (!byPage[pageKey]) byPage[pageKey] = {};
    byPage[pageKey][decision.decision] = (byPage[pageKey][decision.decision] || 0) + 1;
  }
  return {
    total: decisions.length,
    byDecision,
    byPage,
    protectedCrops: byDecision["preserve-local-crop"] || 0,
    pluginTemplateTargets: byDecision["harvest-or-apply-plugin-template"] || 0,
    nativeCovered: (byDecision["already-native-or-objectified"] || 0) + (byDecision["native-rebuild-probe-covered"] || 0),
    actionableNativeGaps: byDecision["rebuild-native-gap"] || 0
  };
}

function imageAreaRatio(box = {}, slideSize = DEFAULT_SLIDE) {
  const area = Math.max(0, Number(box?.w || 0)) * Math.max(0, Number(box?.h || 0));
  const slideArea = Math.max(1, Number(slideSize?.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize?.heightPt || DEFAULT_SLIDE.heightPt));
  return Math.round((area / slideArea) * 10000) / 10000;
}

function sanitizeBox(box = {}) {
  return {
    x: finiteNumber(box.x),
    y: finiteNumber(box.y),
    w: finiteNumber(box.w),
    h: finiteNumber(box.h)
  };
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 1000) / 1000 : 0;
}

function renderDecisionAuditMarkdown(report = {}) {
  const lines = [
    "# Graphic Reconstruction Decision Audit",
    "",
    `Generated: ${safeString(report.generatedAt || new Date().toISOString())}`,
    `OK: ${report.ok ? "yes" : "no"}`,
    `Total decisions: ${Number(report.summary?.total || 0)}`,
    "",
    "Decision counts:",
    ""
  ];
  for (const [decision, count] of Object.entries(report.summary?.byDecision || {})) {
    lines.push(`- ${decision}: ${count}`);
  }
  lines.push("");
  for (const item of safeArray(report.decisions)) {
    const location = item.imageIndex === null || item.imageIndex === undefined
      ? `p${item.slide || "?"} component`
      : `p${item.slide} image ${item.imageIndex}`;
    lines.push(`## ${location}: ${safeString(item.decision)}`);
    lines.push("");
    lines.push(`- Image: ${safeString(item.imageId) || "(anonymous)"}`);
    lines.push(`- Detector: ${safeString(item.detector) || "(none)"}`);
    lines.push(`- Expression: ${safeString(item.expressionForm)} / ${safeString(item.expressionSubtype)}`);
    lines.push(`- Reasons: ${safeArray(item.reasons).join(", ")}`);
    if (item.pluginAction) {
      lines.push(`- Plugin: ${item.pluginAction.provider} ${item.pluginAction.kind} ${item.pluginAction.id} ${item.pluginAction.title}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function uniqueStrings(values = []) {
  return [...new Set(safeArray(values).map(safeString).filter(Boolean))];
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
  const args = parseArgs(process.argv);
  const report = auditGraphicReconstructionDecisions(args);
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (args.markdownOut) {
    fs.mkdirSync(path.dirname(path.resolve(args.markdownOut)), { recursive: true });
    fs.writeFileSync(path.resolve(args.markdownOut), renderDecisionAuditMarkdown(report), "utf8");
  }
  console.log(`${JSON.stringify(report.summary, null, 2)}`);
  console.log(`report: ${path.resolve(args.out)}`);
  if (args.markdownOut) console.log(`guide: ${path.resolve(args.markdownOut)}`);
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
  auditGraphicReconstructionDecisions,
  classifyImageDecision,
  indexShortlistActions,
  parseArgs,
  renderDecisionAuditMarkdown,
  _private: {
    actionSourceIds,
    actionKey,
    candidateSourceIds,
    componentRenderStrategyAction,
    componentLayerDecisionsFromShortlist,
    summarizeFidelityException,
    summarizeExpressionPolicy,
    summarizeDecisions
  }
};
