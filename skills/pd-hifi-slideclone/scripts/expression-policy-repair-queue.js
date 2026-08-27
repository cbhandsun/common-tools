#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const args = {
    coverageMatrix: "",
    batchNativeAudit: "",
    qualityMatrix: "",
    out: path.join("runs", "expression-policy-repair-queue.json"),
    markdownOut: "",
    maxActions: 200
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if ((arg === "--coverage-matrix" || arg === "--coverage" || arg === "--in") && next) {
      args.coverageMatrix = next;
      index += 1;
    } else if ((arg === "--batch-native-audit" || arg === "--batch-audit") && next) {
      args.batchNativeAudit = next;
      index += 1;
    } else if ((arg === "--quality-matrix" || arg === "--quality") && next) {
      args.qualityMatrix = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if ((arg === "--markdown-out" || arg === "--md") && next) {
      args.markdownOut = next;
      index += 1;
    } else if (arg === "--max-actions" && next) {
      args.maxActions = Number(next);
      index += 1;
    } else {
      throw new Error(`Unknown expression-policy-repair-queue argument: ${arg}`);
    }
  }
  if (!args.coverageMatrix && !args.batchNativeAudit && !args.qualityMatrix) {
    throw new Error("--coverage-matrix, --batch-native-audit, or --quality-matrix is required");
  }
  args.maxActions = clampInteger(args.maxActions, 1, 500, 200);
  return args;
}

function buildExpressionPolicyRepairQueue(coverageMatrix = {}, options = {}) {
  const actions = [
    ...collectExpressionPolicyRepairActions(coverageMatrix),
    ...collectBatchNativeAuditRepairActions(options.batchNativeAudit || {}),
    ...collectQualityMatrixRepairActions(options.qualityMatrix || {})
  ]
    .filter(dedupeActions())
    .sort((a, b) => actionRank(a) - actionRank(b)
      || safeString(a.deck).localeCompare(safeString(b.deck))
      || Number(a.page || 0) - Number(b.page || 0)
      || Number(a.image || 0) - Number(b.image || 0))
    .slice(0, clampInteger(options.maxActions, 1, 500, 200));
  return {
    provider: "expression-policy-repair-queue-v1",
    generatedAt: new Date().toISOString(),
    sourceMatrix: safeString(options.sourceMatrix || ""),
    sourceBatchAudit: safeString(options.sourceBatchAudit || ""),
    sourceQualityMatrix: safeString(options.sourceQualityMatrix || ""),
    summary: summarizeActions(actions),
    actions
  };
}

function collectExpressionPolicyRepairActions(coverageMatrix = {}) {
  const seen = new Set();
  const violations = [
    ...safeArray(coverageMatrix?.totals?.expressionPolicyViolations),
    ...safeArray(coverageMatrix?.rows).flatMap((row) =>
      safeArray(row?.expressionPolicyViolations).map((item) => ({
        ...item,
        deck: item.deck || row.deck
      }))
    )
  ];
  const actions = [];
  for (const violation of violations) {
    const action = actionFromViolation(violation);
    const key = [
      action.deck,
      action.page,
      action.image,
      action.violation,
      action.detector,
      action.candidateTitle
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    actions.push(action);
  }
  const residuals = [
    ...safeArray(coverageMatrix?.totals?.actionableResiduals),
    ...safeArray(coverageMatrix?.rows).flatMap((row) =>
      safeArray(row?.actionableResiduals).map((item) => ({
        ...item,
        deck: item.deck || row.deck
      }))
    )
  ];
  for (const residual of residuals) {
    const action = actionFromActionableResidual(residual);
    const key = [
      action.deck,
      action.page,
      action.image,
      action.violation,
      action.detector,
      action.candidateTitle
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    actions.push(action);
  }
  return actions.sort((a, b) => actionRank(a) - actionRank(b)
    || safeString(a.deck).localeCompare(safeString(b.deck))
    || Number(a.page || 0) - Number(b.page || 0)
    || Number(a.image || 0) - Number(b.image || 0));
}

function collectBatchNativeAuditRepairActions(batchAudit = {}) {
  const actions = [];
  for (const deck of safeArray(batchAudit.decks)) {
    for (const risk of safeArray(deck.oversizedProtectedCrops)) {
      actions.push(actionFromOversizedProtectedCrop({
        ...risk,
        deck: risk.deck || deck.deck || deck.name || deck.file
      }));
    }
    for (const risk of safeArray(deck.missingProtectedCropEvidence)) {
      actions.push(actionFromMissingProtectedCropEvidence({
        ...risk,
        deck: risk.deck || deck.deck || deck.name || deck.file
      }));
    }
  }
  return actions.filter(dedupeActions());
}

function collectQualityMatrixRepairActions(qualityMatrix = {}) {
  const actions = [];
  const richCandidateKeys = new Set();
  const candidateSources = [
    ...safeArray(qualityMatrix?.totals?.topComponentTemplateRepairCandidates),
    ...safeArray(qualityMatrix.rows).flatMap((row) =>
      safeArray(row?.componentTemplateRepairCandidates).map((item) => ({
        ...item,
        deck: item.deck || row.deck
      }))
    )
  ];
  for (const candidate of candidateSources) {
    if (isProtectedNonSemanticCandidate(candidate)) continue;
    const action = actionFromActionableComponentTemplateCrop(candidate);
    richCandidateKeys.add(componentTemplateActionLocationKey(action));
    actions.push(action);
  }
  for (const row of safeArray(qualityMatrix.rows)) {
    const deck = safeString(row.deck || row.name || row.file);
    for (const group of safeArray(row.componentTemplateCropStatusTopActionableReasons)) {
      for (const example of safeArray(group.examples)) {
        const mergedExample = {
          ...example,
          deck,
          reason: example.reason || group.reason,
          count: group.count
        };
        if (isProtectedNonSemanticCandidate(mergedExample)) continue;
        const action = actionFromActionableComponentTemplateCrop({
          ...mergedExample
        });
        if (richCandidateKeys.has(componentTemplateActionLocationKey(action))) continue;
        actions.push(action);
      }
    }
  }
  const visualUnitCandidateSources = [
    ...safeArray(qualityMatrix?.totals?.topVisualUnitRepairCandidates),
    ...safeArray(qualityMatrix.rows).flatMap((row) =>
      safeArray(row?.visualUnitRepairCandidates).map((item) => ({
        ...item,
        deck: item.deck || row.deck
      }))
    )
  ];
  for (const candidate of visualUnitCandidateSources) {
    if (isProtectedNonSemanticCandidate(candidate)) continue;
    actions.push(actionFromActionableVisualUnitCrop(candidate));
  }
  return actions.filter(dedupeActions());
}

function isProtectedNonSemanticCandidate(candidate = {}) {
  const unitDisposition = safeString(
    candidate.unitDisposition
      || candidate.expressionPolicy?.unitDisposition
      || candidate.policy?.unitDisposition
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
    candidate.expressionPolicy?.kind
      || candidate.policy?.kind
      || candidate.kind
      || ""
  );
  if (["standalone-visual-asset", "decorative-texture"].includes(policyKind)) {
    return true;
  }
  const disposition = safeString(candidate.disposition || candidate.reason || candidate.recommendedAction || "").toLowerCase();
  return /preserve-local-crop|protected-non-semantic|standalone-asset|decorative-texture/.test(disposition);
}

function componentTemplateActionLocationKey(action = {}) {
  return [
    action.deck,
    action.page,
    action.imageId || action.image,
    action.violation
  ].join("|");
}

function actionFromViolation(violation = {}) {
  const kind = safeString(violation.violation || "unknown");
  const preserveMode = kind === "screenshot-replaced-by-template"
    ? "preserve-crop-with-native-overlays"
    : "preserve-local-crop";
  return {
    deck: safeString(violation.deck || ""),
    page: clampInteger(violation.page, 1, 10000, 1),
    image: clampInteger(violation.image, 1, 10000, 1),
    violation: kind,
    layerType: safeString(violation.layerType || ""),
    detector: safeString(violation.detector || ""),
    disposition: safeString(violation.disposition || ""),
    currentMode: safeString(violation.mode || violation.outcome || ""),
    candidateTitle: safeString(violation.candidateTitle || ""),
    areaRatio: numberOrNull(violation.areaRatio),
    repair: {
      mode: preserveMode,
      disableComponentTemplate: true,
      forcePreserveLocalCrop: true,
      allowNativeOverlays: kind === "screenshot-replaced-by-template",
      reason: repairReason(kind)
    }
  };
}

function actionFromOversizedProtectedCrop(risk = {}) {
  return {
    deck: safeString(risk.deck || ""),
    page: clampInteger(risk.page || risk.slide, 1, 10000, 1),
    image: clampInteger(risk.image || risk.imageId, 1, 10000, 1),
    violation: "oversized-protected-diagram-crop",
    layerType: safeString(risk.layerType || ""),
    detector: safeString(risk.detector || ""),
    disposition: safeString(risk.disposition || ""),
    currentMode: safeString(risk.mode || risk.outcome || risk.decision || "preserve-local-crop"),
    candidateTitle: safeString(risk.candidateTitle || risk.expressionSubtype || risk.expressionForm || ""),
    areaRatio: numberOrNull(risk.areaRatio),
    repair: {
      mode: "reclassify-structural-diagram-or-component-template",
      disableComponentTemplate: false,
      forcePreserveLocalCrop: false,
      allowNativeOverlays: true,
      requireSemanticStructureEvidence: true,
      reason: repairReason("oversized-protected-diagram-crop")
    }
  };
}

function actionFromMissingProtectedCropEvidence(risk = {}) {
  return {
    deck: safeString(risk.deck || ""),
    page: clampInteger(risk.page || risk.slide, 1, 10000, 1),
    image: clampInteger(risk.image || risk.imageId, 1, 10000, 1),
    violation: "protected-crop-missing-evidence",
    layerType: safeString(risk.layerType || ""),
    detector: safeString(risk.detector || ""),
    disposition: safeString(risk.disposition || ""),
    currentMode: safeString(risk.mode || risk.outcome || risk.decision || "preserve-local-crop"),
    candidateTitle: safeString(risk.candidateTitle || risk.expressionSubtype || risk.expressionForm || ""),
    areaRatio: numberOrNull(risk.areaRatio),
    repair: {
      mode: "add-expression-policy-evidence",
      disableComponentTemplate: false,
      forcePreserveLocalCrop: false,
      allowNativeOverlays: false,
      requireSemanticStructureEvidence: false,
      reason: repairReason("protected-crop-missing-evidence")
    }
  };
}

function actionFromActionableComponentTemplateCrop(example = {}) {
  const imageId = safeString(example.imageId || example.id || "");
  const targetMotifs = safeArray(example.targetMotifs).map(safeString).filter(Boolean).slice(0, 12);
  const componentId = safeString(example.componentId || example.componentGroupId || "");
  const componentTitle = safeString(example.componentTitle || example.candidateTitle || example.family || "");
  return {
    deck: safeString(example.deck || ""),
    page: clampInteger(Number(example.page ?? example.pageIndex) + (example.pageIndex !== undefined ? 1 : 0), 1, 10000, 1),
    image: inferImageOrdinal(example.image ?? imageId),
    imageId,
    violation: "actionable-component-template-retained-crop",
    layerType: safeString(example.layerType || ""),
    detector: safeString(example.detector || ""),
    disposition: safeString(example.reason || ""),
    currentMode: "plugin-component-template-retained-crop",
    candidateTitle: componentTitle,
    componentId,
    componentTitle,
    sourceProvider: safeString(example.sourceProvider || ""),
    templateFamily: safeString(example.family || ""),
    targetMotifs,
    priority: numberOrNull(example.priority),
    areaRatio: numberOrNull(example.areaRatio),
    box: normalizeBox(example.box),
    repair: {
      mode: "reclassify-structural-diagram-or-component-template",
      disableComponentTemplate: false,
      forcePreserveLocalCrop: false,
      allowNativeOverlays: true,
      requireSemanticStructureEvidence: true,
      prioritizePluginTemplateReplacement: true,
      componentId,
      targetMotifs,
      reason: repairReason("actionable-component-template-retained-crop")
    }
  };
}

function actionFromActionableVisualUnitCrop(example = {}) {
  const imageId = safeString(example.imageId || example.id || "");
  const expressionSubtype = safeString(example.expressionSubtype || "");
  const expressionForm = safeString(example.expressionForm || "");
  const family = inferVisualUnitTemplateFamily(example);
  const targetMotifs = inferVisualUnitTargetMotifs(example, family);
  return {
    deck: safeString(example.deck || ""),
    page: clampInteger(Number(example.page ?? example.pageIndex) + (example.pageIndex !== undefined ? 1 : 0), 1, 10000, 1),
    image: inferImageOrdinal(example.image ?? imageId),
    imageId,
    violation: "actionable-unexplained-visual-unit-crop",
    layerType: safeString(example.layerType || ""),
    detector: safeString(example.detector || ""),
    disposition: safeString(example.reason || "actionable-unexplained-crop"),
    currentMode: "unexplained-non-editable-crop",
    candidateTitle: safeString(example.candidateTitle || expressionSubtype || expressionForm || family),
    templateFamily: family,
    targetMotifs,
    priority: numberOrNull(example.priority),
    areaRatio: numberOrNull(example.areaRatio),
    box: normalizeBox(example.box),
    repair: {
      mode: "classify-visual-unit-then-rebuild-or-protect",
      disableComponentTemplate: false,
      forcePreserveLocalCrop: false,
      allowNativeOverlays: true,
      requireSemanticStructureEvidence: true,
      prioritizePluginTemplateReplacement: /chart|matrix|process|flow|relationship|cycle|radial/.test(family),
      targetMotifs,
      reason: repairReason("actionable-unexplained-visual-unit-crop")
    }
  };
}

function inferVisualUnitTemplateFamily(example = {}) {
  const text = [
    example.templateFamily,
    example.family,
    example.detector,
    example.expressionForm,
    example.expressionSubtype,
    example.recommendedAction,
    example.reason
  ].map(safeString).join(" ").toLowerCase();
  if (/table|matrix|grid|表格|矩阵|网格/.test(text)) return "matrix-grid";
  if (/chart|axis|series|plot|bar|line|pie|donut|图表|坐标轴|柱状|折线|饼图|环形/.test(text)) return "chart";
  if (/cycle|arc|loop|ring|循环|圆弧|环形/.test(text)) return "cycle-arrow";
  if (/hub|spoke|radial|中心|辐射/.test(text)) return "hub-spoke";
  if (/tree|hierarchy|org|层级|树|组织/.test(text)) return "tree-hierarchy";
  if (/flow|process|chain|arrow|timeline|流程|步骤|箭头|时间线/.test(text)) return "process-flow";
  return "generic-structure";
}

function inferVisualUnitTargetMotifs(example = {}, family = "") {
  const explicit = safeArray(example.targetMotifs).map(safeString).filter(Boolean).slice(0, 12);
  if (explicit.length > 0) return explicit;
  if (family === "matrix-grid") return ["card-grid"];
  if (family === "chart") return ["pie-share-chart"];
  if (family === "cycle-arrow") return ["arc-arrow"];
  if (family === "hub-spoke") return ["radial-link"];
  if (family === "tree-hierarchy") return ["tree-link"];
  if (family === "process-flow") return ["linear-arrow-chain"];
  return ["whole-process-template"];
}

function actionFromActionableResidual(residual = {}) {
  const mode = safeString(residual.mode || "");
  const disposition = safeString(residual.disposition || "native-rebuild-candidate");
  const pluginReference = mode === "preserve-crop-with-component-reference";
  return {
    deck: safeString(residual.deck || ""),
    page: clampInteger(residual.page, 1, 10000, 1),
    image: clampInteger(residual.image, 1, 10000, 1),
    violation: pluginReference ? "unresolved-component-reference-crop" : "actionable-native-residual-crop",
    layerType: safeString(residual.layerType || ""),
    detector: safeString(residual.detector || ""),
    disposition,
    currentMode: mode,
    candidateTitle: safeString(residual.candidateTitle || residual.family || ""),
    areaRatio: numberOrNull(residual.areaRatio),
    box: normalizeBox(residual.box),
    repair: {
      mode: pluginReference ? "apply-real-plugin-component-or-specialized-native-rebuilder" : "reclassify-structural-diagram-or-component-template",
      disableComponentTemplate: false,
      forcePreserveLocalCrop: false,
      allowNativeOverlays: true,
      requireSemanticStructureEvidence: true,
      prioritizePluginTemplateReplacement: pluginReference,
      reason: repairReason(pluginReference ? "unresolved-component-reference-crop" : "actionable-native-residual-crop")
    }
  };
}

function repairReason(kind) {
  if (kind === "screenshot-replaced-by-template") {
    return "Screenshot/document regions should keep the original crop and only rebuild safe native overlays.";
  }
  if (kind === "standalone-asset-over-objectified") {
    return "Standalone icon/illustration/example assets should remain one movable crop instead of becoming a mismatched component template.";
  }
  if (kind === "oversized-protected-diagram-crop") {
    return "Large non-screenshot diagram crops should be parsed into semantic native units or matched plugin templates instead of remaining one bitmap.";
  }
  if (kind === "protected-crop-missing-evidence") {
    return "Protected crop decisions need explicit detector, expression form, and recommended-action evidence before they can bypass native reconstruction.";
  }
  if (kind === "actionable-component-template-retained-crop") {
    return "A structure-like component template crop is still retained as a bitmap; try a stronger plugin template or semantic native reconstruction.";
  }
  if (kind === "unresolved-component-reference-crop") {
    return "A polished plugin reference exists but the source crop remains; apply a real component download/import or add a specialized native rebuilder for this structure.";
  }
  if (kind === "actionable-native-residual-crop") {
    return "A semantic visual layer still has a structural residual crop; rebuild it with native atoms or a fitted plugin component.";
  }
  if (kind === "actionable-unexplained-visual-unit-crop") {
    return "A non-editable crop has no accepted minimum-unit explanation; classify its expression form, then rebuild semantic structure or explicitly protect it as a visual asset.";
  }
  return "Expression policy violation should be reviewed before component replacement.";
}

function summarizeActions(actions = []) {
  const byViolation = {};
  const byDeck = {};
  const byRepairMode = {};
  for (const action of actions) {
    addCount(byViolation, action.violation);
    addCount(byDeck, action.deck || "unknown");
    addCount(byRepairMode, action.repair?.mode || "unknown");
  }
  return {
    actions: actions.length,
    byViolation,
    byDeck,
    byRepairMode
  };
}

function renderRepairQueueMarkdown(queue = {}) {
  const lines = [
    "# Expression Policy Repair Queue",
    "",
    `Actions: ${queue.summary?.actions || 0}`,
    "",
    "## Summary",
    "",
    `Violations: ${JSON.stringify(queue.summary?.byViolation || {})}`,
    `Repair modes: ${JSON.stringify(queue.summary?.byRepairMode || {})}`,
    "",
    "## Actions",
    ""
  ];
  for (const action of safeArray(queue.actions)) {
    lines.push(
      `### ${action.deck || "unknown"} p${action.page} image ${action.image}`,
      "",
      `Violation: ${action.violation}`,
      `Current mode: ${action.currentMode}`,
      `Repair mode: ${action.repair.mode}`,
      `Detector: ${action.detector}`,
      `Candidate: ${action.candidateTitle}`,
      `Reason: ${action.repair.reason}`,
      ""
    );
  }
  return `${lines.join("\n")}\n`;
}

function actionRank(action = {}) {
  if (action.violation === "screenshot-replaced-by-template") return 0;
  if (action.violation === "oversized-protected-diagram-crop") return 1;
  if (action.violation === "actionable-unexplained-visual-unit-crop") return 1.5;
  if (action.violation === "protected-crop-missing-evidence") return 2;
  if (action.violation === "standalone-asset-over-objectified") return 3;
  return 4;
}

function dedupeActions() {
  const seen = new Set();
  return (action) => {
    const key = [
      action.deck,
      action.page,
      action.image,
      action.imageId || "",
      action.violation,
      action.detector,
      action.candidateTitle
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function addCount(target, key) {
  const safe = safeString(key || "unknown") || "unknown";
  target[safe] = (target[safe] || 0) + 1;
}

function clampInteger(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function inferImageOrdinal(value) {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return Math.trunc(number);
  const text = safeString(value);
  const match = text.match(/(?:^|[-_])(\d+)(?:\D*)$/);
  if (match) return clampInteger(Number(match[1]) + 1, 1, 10000, 1);
  return 1;
}

function normalizeBox(box = {}) {
  const normalized = {
    x: numberOrNull(box.x),
    y: numberOrNull(box.y),
    w: numberOrNull(box.w),
    h: numberOrNull(box.h)
  };
  return Object.values(normalized).some((value) => value !== null) ? normalized : null;
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(String(file)), "utf8").replace(/^\uFEFF/, ""));
}

function main() {
  const args = parseArgs(process.argv);
  const sourceMatrix = args.coverageMatrix ? path.resolve(args.coverageMatrix) : "";
  const sourceBatchAudit = args.batchNativeAudit ? path.resolve(args.batchNativeAudit) : "";
  const sourceQualityMatrix = args.qualityMatrix ? path.resolve(args.qualityMatrix) : "";
  const queue = buildExpressionPolicyRepairQueue(
    sourceMatrix ? readJson(sourceMatrix) : {},
    {
    sourceMatrix,
    sourceBatchAudit,
    sourceQualityMatrix,
    batchNativeAudit: sourceBatchAudit ? readJson(sourceBatchAudit) : {},
    qualityMatrix: sourceQualityMatrix ? readJson(sourceQualityMatrix) : {},
    maxActions: args.maxActions
    }
  );
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(queue, null, 2)}\n`, "utf8");
  if (args.markdownOut) {
    fs.mkdirSync(path.dirname(path.resolve(args.markdownOut)), { recursive: true });
    fs.writeFileSync(path.resolve(args.markdownOut), renderRepairQueueMarkdown(queue), "utf8");
  }
  console.log(`expression policy repair actions: ${queue.summary.actions}`);
  console.log(`report: ${path.resolve(args.out)}`);
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
  actionFromViolation,
  actionFromActionableVisualUnitCrop,
  buildExpressionPolicyRepairQueue,
  collectBatchNativeAuditRepairActions,
  collectExpressionPolicyRepairActions,
  collectQualityMatrixRepairActions,
  inferImageOrdinal,
  parseArgs,
  renderRepairQueueMarkdown,
  summarizeActions
};
