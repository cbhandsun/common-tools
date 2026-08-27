#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { normalizeTargetMotif } = require("./lib/component-motifs");

function parseArgs(argv = process.argv) {
  const args = {
    harvestQueue: "",
    irDir: path.join("ppt文档", "组件策略可编辑版本"),
    inventory: "",
    out: path.join("runs", "component-ir-replacement-plan.json"),
    markdownOut: "",
    failOnMissingTargets: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if ((arg === "--harvest-queue" || arg === "--queue") && next) {
      args.harvestQueue = next;
      index += 1;
    } else if (arg === "--ir-dir" && next) {
      args.irDir = next;
      index += 1;
    } else if ((arg === "--inventory" || arg === "--component-inventory") && next) {
      args.inventory = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if ((arg === "--markdown-out" || arg === "--md") && next) {
      args.markdownOut = next;
      index += 1;
    } else if (arg === "--fail-on-missing-targets") {
      args.failOnMissingTargets = true;
    } else {
      throw new Error(`Unknown component-ir-replacement-plan argument: ${arg}`);
    }
  }
  if (!args.harvestQueue) throw new Error("--harvest-queue is required");
  return args;
}

function buildComponentIrReplacementPlan(options = {}) {
  const harvestQueueFile = path.resolve(String(options.harvestQueue || ""));
  if (!fs.existsSync(harvestQueueFile)) throw new Error(`Harvest queue was not found: ${harvestQueueFile}`);
  const irDir = path.resolve(String(options.irDir || path.join("ppt文档", "组件策略可编辑版本")));
  const queue = readJson(harvestQueueFile);
  const inventory = options.inventory ? loadInventory(options.inventory) : null;
  const irIndex = buildIrIndex(irDir);
  const operations = [];
  for (const task of safeArray(queue.tasks)) {
    for (const target of safeArray(task.affectedTargets)) {
      operations.push(buildOperation({ task, target, irIndex, inventory }));
    }
  }
  const summary = summarizeOperations(operations, safeArray(queue.tasks).length);
  const plan = {
    provider: "component-ir-replacement-plan-v1",
    createdAt: new Date().toISOString(),
    harvestQueue: harvestQueueFile,
    irDir,
    inventory: inventory?.file || "",
    summary,
    operations
  };
  if (options.out) {
    const out = path.resolve(String(options.out));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  }
  if (options.markdownOut) {
    const out = path.resolve(String(options.markdownOut));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, renderMarkdown(plan), "utf8");
  }
  if (options.failOnMissingTargets === true && summary.missingTarget > 0) {
    const error = new Error(`Missing IR targets for ${summary.missingTarget} replacement operation(s).`);
    error.plan = plan;
    throw error;
  }
  return plan;
}

function buildOperation({ task = {}, target = {}, irIndex = new Map(), inventory = null } = {}) {
  const deck = safeString(target.deck);
  const slide = finiteInt(target.slide, null);
  const imageId = safeString(target.imageId);
  const imageIndex = finiteInt(target.imageIndex, null);
  const irDeck = irIndex.get(deck);
  const image = findTargetImage(irDeck?.ir, { slide, imageId, imageIndex });
  const targetDisposition = image ? targetUnitDisposition(image, target) : "";
  const nonSemanticTarget = Boolean(targetDisposition) && targetDisposition !== "semantic-native-structure";
  const sample = inventory ? findComponentSample({
    ...task,
    layerKey: target.layerKey,
    targetStructureProfile: inferTargetStructureProfile(image)
  }, inventory) : null;
  const missing = [];
  if (!irDeck) missing.push("ir-deck-not-found");
  if (!image) missing.push("target-image-not-found");
  if (nonSemanticTarget) missing.push(`non-semantic-target:${targetDisposition}`);
  if (!sample) missing.push("component-sample-not-found");
  const resolvedTarget = Boolean(irDeck && image);
  const status = !resolvedTarget
    ? "missing_target"
    : nonSemanticTarget
      ? "blocked_non_semantic_target"
      : sample
        ? "ready"
        : "pending_sample";
  return {
    operation: "replace-ir-image-with-component-sample",
    status,
    deck,
    slide,
    pageIndex: slide !== null ? slide - 1 : null,
    imageId,
    imageIndex,
    layerKey: safeString(target.layerKey),
    targetBox: image?.box || null,
    sourceImage: image ? {
      id: safeString(image.id),
      detector: safeString(image.source?.detector),
      expressionForm: safeString(image.source?.expressionForm),
      expressionSubtype: safeString(image.source?.expressionSubtype),
      unitDisposition: targetDisposition,
      expressionPolicyKind: safeString(
        image.source?.expressionPolicy?.kind
        || image.source?.componentRenderStrategy?.expressionPolicy?.kind
        || image.source?.layer?.componentRenderStrategy?.expressionPolicy?.kind
      )
    } : null,
    component: {
      provider: safeString(task.provider),
      kind: safeString(task.kind),
      componentId: safeString(task.componentId),
      title: safeString(task.title),
      targetMotifs: safeArray(task.targetMotifs),
      searchKeywords: safeArray(task.searchKeywords)
    },
    sample,
    missing,
    nextAction: sample || nonSemanticTarget ? null : {
      harvestCommand: safeString(task.harvestCommand),
      workflow: safeArray(task.workflow)
    }
  };
}

function targetUnitDisposition(image = {}, target = {}) {
  return safeString(
    target.unitDisposition
    || image.source?.unitDisposition
    || image.source?.expressionPolicy?.unitDisposition
    || image.source?.componentRenderStrategy?.expressionPolicy?.unitDisposition
    || image.source?.layer?.componentRenderStrategy?.expressionPolicy?.unitDisposition
    || image.source?.layer?.unitDisposition
  );
}

function buildIrIndex(irDir) {
  const index = new Map();
  if (!fs.existsSync(irDir)) return index;
  for (const name of fs.readdirSync(irDir).filter((item) => /\.native\.ir\.json$/i.test(item))) {
    const deck = name.replace(/\.native\.ir\.json$/i, "");
    const file = path.join(irDir, name);
    index.set(deck, {
      deck,
      file,
      ir: readJson(file)
    });
  }
  return index;
}

function findTargetImage(ir, target = {}) {
  if (!ir || !Array.isArray(ir.pages)) return null;
  const page = ir.pages[Number(target.slide) - 1];
  if (!page || !Array.isArray(page.images)) return null;
  if (target.imageId) {
    const byId = page.images.find((image) => safeString(image.id) === target.imageId);
    if (byId) return byId;
  }
  if (Number.isInteger(target.imageIndex) && target.imageIndex >= 0) {
    return page.images[target.imageIndex] || null;
  }
  return null;
}

function loadInventory(file) {
  const inventoryFile = path.resolve(String(file || ""));
  if (!fs.existsSync(inventoryFile)) throw new Error(`Component inventory was not found: ${inventoryFile}`);
  const payload = readJson(inventoryFile);
  const candidates = [
    ...safeArray(payload.candidates),
    ...safeArray(payload.components),
    ...safeArray(payload.layers).flatMap((layer) =>
      safeArray(layer?.localAssets).map((asset) => ({
        ...asset,
        manifestLayerKey: safeString(layer?.layerKey),
        manifestTemplateFamily: safeString(layer?.templateFamily),
        manifestTargetMotifs: safeArray(layer?.readiness?.targetMotifs)
      }))
    )
  ].map(normalizeCandidate).filter((candidate) => candidate.id || candidate.path || candidate.name);
  return {
    file: inventoryFile,
    candidates
  };
}

function normalizeCandidate(candidate = {}) {
  return {
    id: safeString(candidate.id),
    provider: safeString(candidate.provider),
    path: safeString(candidate.path || candidate.file),
    name: safeString(candidate.name || (candidate.path ? path.basename(String(candidate.path)) : "")),
    assetKind: safeString(candidate.assetKind),
    roleTags: safeArray(candidate.roleTags).map(safeString),
    structureSignature: candidate.structureSignature || candidate.learningSummary?.structureSignature || null,
    structureProfile: summarizeCandidateStructureProfile(candidate),
    recommendedComponentGroups: safeArray(candidate.recommendedComponentGroups).map(normalizeRecommendedGroup).filter((group) => group.id),
    queueBinding: normalizeQueueBinding(candidate.queueBinding),
    manifestLayerKey: safeString(candidate.manifestLayerKey),
    manifestTemplateFamily: safeString(candidate.manifestTemplateFamily),
    manifestTargetMotifs: safeArray(candidate.manifestTargetMotifs).map(normalizeMotifToken).filter(Boolean),
    score: Number.isFinite(Number(candidate.score)) ? Number(candidate.score) : null
  };
}

function normalizeQueueBinding(binding = {}) {
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) return null;
  const normalized = {
    componentId: safeString(binding.componentId),
    title: safeString(binding.title),
    targetMotifs: safeArray(binding.targetMotifs).map(normalizeMotifToken).filter(Boolean),
    sourceManifest: safeString(binding.sourceManifest),
    compatibility: binding.compatibility && typeof binding.compatibility === "object" ? {
      compatible: binding.compatibility.compatible === true,
      reason: safeString(binding.compatibility.reason)
    } : null
  };
  return normalized.componentId || normalized.targetMotifs.length > 0 || normalized.title ? normalized : null;
}

function normalizeRecommendedGroup(group = {}) {
  return {
    id: safeString(group.id),
    name: safeString(group.name),
    slide: Number.isFinite(Number(group.slide)) ? Math.trunc(Number(group.slide)) : null,
    groupIndex: Number.isFinite(Number(group.groupIndex)) ? Math.trunc(Number(group.groupIndex)) : null,
    matchScore: Number.isFinite(Number(group.matchScore)) ? Number(group.matchScore) : null,
    componentScore: Number.isFinite(Number(group.componentScore)) ? Number(group.componentScore) : null,
    structure: group.structure && typeof group.structure === "object" ? {
      kind: safeString(group.structure.kind),
      motifs: safeArray(group.structure.motifs).map(safeString).filter(Boolean),
      motifCounts: sanitizeNumberMap(group.structure.motifCounts)
    } : null,
    reuseReadiness: group.reuseReadiness && typeof group.reuseReadiness === "object" ? {
      level: safeString(group.reuseReadiness.level),
      score: Number.isFinite(Number(group.reuseReadiness.score)) ? Number(group.reuseReadiness.score) : null
    } : null
  };
}

function findComponentSample(task = {}, inventory = {}) {
  const componentId = normalizeToken(task.componentId);
  const provider = normalizeToken(task.provider);
  const motifs = new Set(safeArray(task.targetMotifs).map(normalizeMotifToken).filter(Boolean));
  const scored = safeArray(inventory.candidates).map((candidate) => {
    const haystack = normalizeToken([
      candidate.id,
      candidate.provider,
      candidate.path,
      candidate.name,
      candidate.assetKind,
      candidate.queueBinding?.componentId,
      candidate.queueBinding?.title,
      ...safeArray(candidate.roleTags)
    ].join(" "));
    let score = 0;
    const providerMatches = !provider || normalizeToken(candidate.provider) === provider;
    const candidateMotifs = new Set([
      ...safeArray(candidate.structureSignature?.motifs),
      candidate.structureSignature?.primaryMotif,
      candidate.structureSignature?.primaryKind,
      ...safeArray(candidate.manifestTargetMotifs),
      ...safeArray(candidate.queueBinding?.targetMotifs)
    ].map(normalizeMotifToken).filter(Boolean));
    const matchingMotifs = [...motifs].filter((motif) => candidateMotifs.has(motif));
    const profile = candidate.structureProfile || summarizeCandidateStructureProfile(candidate);
    const targetFamily = normalizeToken(task.targetStructureProfile?.family);
    const candidateKind = normalizeToken(profile.kind);
    const structureConflict = targetFamily
      && isExplicitCandidateStructureKind(candidateKind)
      && candidateKind !== targetFamily;
    const structureCompatible = isCandidateStructureCompatible(candidate, task.targetStructureProfile)
      || (structureConflict && matchingMotifs.length > 0);
    const evidence = {
      componentId: false,
      queueBinding: false,
      motifOverlap: 0,
      recommendedGroup: false,
      layerKey: false
    };
    if (!structureCompatible) return { candidate, score: 0, group: null, evidence };
    if (componentId && haystack.includes(componentId)) {
      score += 100;
      evidence.componentId = true;
    }
    if (componentId && normalizeToken(candidate.queueBinding?.componentId) === componentId) {
      score += 140;
      evidence.queueBinding = true;
    }
    if (!providerMatches) score -= 80;
    if (provider && providerMatches) score += 20;
    for (const motif of matchingMotifs) {
      score += 16;
      evidence.motifOverlap += 1;
    }
    if (candidate.queueBinding?.compatibility?.compatible === true) score += 12;
    const group = bestRecommendedGroupForTask(task, candidate);
    if (group) {
      score += Math.min(60, Number(group.matchScore || 0) * 0.35 + Number(group.componentScore || 0) * 0.12);
      evidence.recommendedGroup = true;
    }
    if (candidate.manifestLayerKey && safeString(task.layerKey) && candidate.manifestLayerKey === safeString(task.layerKey)) {
      score += 34;
      evidence.layerKey = true;
    }
    return { candidate, score, group, evidence };
  }).filter((item) => item.score > 0 && hasSampleMatchEvidence(item.evidence, provider, item.candidate)).sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return null;
  return {
    provider: best.candidate.provider,
    path: best.candidate.path || null,
    name: best.candidate.name || null,
    assetKind: best.candidate.assetKind || null,
    roleTags: best.candidate.roleTags,
    matchScore: best.score,
    structureSignature: best.candidate.structureSignature || null,
    ...(best.candidate.queueBinding ? { queueBinding: best.candidate.queueBinding } : {}),
    ...(best.group ? { recommendedGroup: best.group } : {}),
    ...(best.candidate.manifestLayerKey ? {
      manifestLayerKey: best.candidate.manifestLayerKey,
      manifestTemplateFamily: best.candidate.manifestTemplateFamily,
      manifestTargetMotifs: best.candidate.manifestTargetMotifs
    } : {})
  };
}

function inferTargetStructureProfile(image = {}) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const diagram = layer.diagramUnderstanding || source.diagramUnderstanding || {};
  const expression = [
    source.expressionForm,
    source.expressionSubtype,
    source.detector,
    layer.layerType,
    diagram.archetype
  ].map(normalizeToken).join(" ");
  const cycleLike = /cycle|loop|circular|circle|blockarc|uturn|环形|循环|圆弧/.test(expression);
  const matrixLike = /matrix|grid|table|comparison|heatmap/.test(expression);
  const timelineLike = /timeline|roadmap|milestone|时间轴|路线图|里程碑/.test(expression);
  const hubLike = /hub|spoke|relationship|network|relation|关系图|关系|网络|辐射/.test(expression);
  const processLike = /process|flow|workflow|pipeline|route|流程图|流程|步骤|阶段/.test(expression);
  const visualNodeCount = finiteInt(diagram.visualNodeCount, 0);
  const semanticNodeCount = finiteInt(diagram.nodeCount, 0);
  const nodeCount = visualNodeCount > 0 ? visualNodeCount : semanticNodeCount;
  return {
    family: cycleLike
      ? "cycle-loop"
      : matrixLike
        ? "matrix"
        : timelineLike
          ? "timeline"
          : hubLike
            ? "hub-spoke"
            : processLike
              ? "process-chain"
              : "",
    nodeCount: nodeCount > 0 ? nodeCount : 0
  };
}

function summarizeCandidateStructureProfile(candidate = {}) {
  const groups = safeArray(candidate.learningSummary?.componentCatalog)
    .map((group) => group?.structure || {})
    .filter((structure) => structure && typeof structure === "object");
  const nodeCount = groups.reduce((max, structure) => Math.max(max, finiteInt(structure.nodeCount, 0)), 0);
  const kind = normalizeToken(
    candidate.structureSignature?.primaryKind
    || groups.find((structure) => safeString(structure.kind))?.kind
  );
  return { kind, nodeCount };
}

function isCandidateStructureCompatible(candidate = {}, target = {}) {
  const family = normalizeToken(target?.family);
  const targetNodes = finiteInt(target?.nodeCount, 0);
  const profile = candidate.structureProfile || summarizeCandidateStructureProfile(candidate);
  const candidateKind = normalizeToken(profile.kind);
  if (family && isExplicitCandidateStructureKind(candidateKind) && candidateKind !== family) return false;
  if (family !== "matrix" || targetNodes < 6) return true;
  const candidateNodes = finiteInt(profile.nodeCount, 0);
  // Unknown legacy assets remain eligible; learned assets must carry enough cells
  // to recreate a dense matrix instead of overlaying a four-quadrant card.
  if (candidateNodes === 0) return true;
  return candidateNodes >= Math.ceil(targetNodes * 0.8);
}

function isExplicitCandidateStructureKind(kind = "") {
  return !["", "unknown", "mixed"].includes(normalizeToken(kind));
}

function hasSampleMatchEvidence(evidence = {}, provider = "", candidate = {}) {
  const providerMatches = !provider || normalizeToken(candidate.provider) === provider;
  return evidence.queueBinding === true ||
    (providerMatches && (
      evidence.componentId === true ||
      evidence.motifOverlap > 0 ||
      evidence.recommendedGroup === true ||
      evidence.layerKey === true
    ));
}

function bestRecommendedGroupForTask(task = {}, candidate = {}) {
  const groups = safeArray(candidate.recommendedComponentGroups);
  if (groups.length === 0) return null;
  const motifs = new Set(safeArray(task.targetMotifs).map(normalizeMotifToken).filter(Boolean));
  const scored = groups.map((group) => {
    let score = Number(group.matchScore || 0);
    const groupMotifs = new Set([
      ...safeArray(group.structure?.motifs),
      ...Object.keys(group.structure?.motifCounts || {}),
      group.structure?.kind
    ].map(normalizeMotifToken).filter(Boolean));
    for (const motif of motifs) if (groupMotifs.has(motif)) score += 20;
    if (safeString(group.reuseReadiness?.level).toLowerCase() === "high") score += 12;
    if (safeString(group.reuseReadiness?.level).toLowerCase() === "avoid") score -= 40;
    return { group, score };
  }).sort((a, b) => b.score - a.score || safeString(a.group.id).localeCompare(safeString(b.group.id)));
  return scored[0]?.score > 0 ? scored[0].group : null;
}

function summarizeOperations(operations = [], taskCount = 0) {
  const byStatus = {};
  const byDeck = {};
  for (const op of operations) {
    increment(byStatus, op.status);
    increment(byDeck, op.deck || "unknown");
  }
  return {
    taskCount,
    operationCount: operations.length,
    ready: byStatus.ready || 0,
    pendingSample: byStatus.pending_sample || 0,
    missingTarget: byStatus.missing_target || 0,
    blockedNonSemanticTarget: byStatus.blocked_non_semantic_target || 0,
    byStatus,
    byDeck
  };
}

function renderMarkdown(plan = {}) {
  const lines = [
    "# Component IR Replacement Plan",
    "",
    `Tasks: ${plan.summary?.taskCount || 0}`,
    `Operations: ${plan.summary?.operationCount || 0}`,
    `Ready: ${plan.summary?.ready || 0}`,
    `Pending samples: ${plan.summary?.pendingSample || 0}`,
    `Missing targets: ${plan.summary?.missingTarget || 0}`,
    ""
  ];
  for (const op of safeArray(plan.operations).slice(0, 80)) {
    lines.push(`- ${op.status}: ${op.deck} p${op.slide} ${op.imageId} -> ${op.component.componentId} ${op.targetBox ? `(${op.targetBox.w}x${op.targetBox.h})` : ""}`);
  }
  if (safeArray(plan.operations).length > 80) lines.push(`- ... ${plan.operations.length - 80} more`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function increment(target, key) {
  const safeKey = safeString(key || "unknown");
  target[safeKey] = Number(target[safeKey] || 0) + 1;
}

function finiteInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function normalizeToken(value) {
  return safeString(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function normalizeMotifToken(value) {
  return normalizeTargetMotif(value) || normalizeToken(value);
}

function sanitizeNumberMap(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    const safeKey = safeString(key);
    const number = Number(raw);
    if (!safeKey || !Number.isFinite(number)) continue;
    out[safeKey] = number;
  }
  return out;
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
  try {
    const args = parseArgs();
    const plan = buildComponentIrReplacementPlan(args);
    console.log(JSON.stringify(plan.summary, null, 2));
  } catch (error) {
    if (error.plan) console.log(JSON.stringify(error.plan.summary, null, 2));
    console.error(String(error?.message || error));
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  buildComponentIrReplacementPlan,
  buildIrIndex,
  findComponentSample,
  findTargetImage,
  inferTargetStructureProfile,
  isCandidateStructureCompatible,
  parseArgs,
  renderMarkdown
};
