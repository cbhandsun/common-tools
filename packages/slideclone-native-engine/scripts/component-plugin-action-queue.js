"use strict";

const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const args = {
    search: "",
    coverageMatrix: "",
    repairCoverage: "",
    motifRecall: "",
    harvestShortlist: "",
    targetAudit: "",
    officePlusResolve: "",
    out: path.join("runs", "plugin-component-inventory", "component-plugin-action-queue.json"),
    markdownOut: "",
    maxActions: 10,
    minScore: 50,
    minSuitability: 35
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === "--search" || arg === "--in") && next) {
      args.search = next;
      i += 1;
    } else if ((arg === "--coverage-matrix" || arg === "--coverage") && next) {
      args.coverageMatrix = next;
      i += 1;
    } else if ((arg === "--repair-coverage" || arg === "--expression-policy-coverage") && next) {
      args.repairCoverage = next;
      i += 1;
    } else if ((arg === "--motif-recall" || arg === "--recall") && next) {
      args.motifRecall = next;
      i += 1;
    } else if ((arg === "--harvest-shortlist" || arg === "--shortlist") && next) {
      args.harvestShortlist = next;
      i += 1;
    } else if ((arg === "--target-audit" || arg === "--plugin-target-audit") && next) {
      args.targetAudit = next;
      i += 1;
    } else if ((arg === "--officeplus-resolve" || arg === "--resolve") && next) {
      args.officePlusResolve = next;
      i += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      i += 1;
    } else if ((arg === "--markdown-out" || arg === "--guide-out") && next) {
      args.markdownOut = next;
      i += 1;
    } else if (arg === "--max-actions" && next) {
      args.maxActions = Number(next);
      i += 1;
    } else if (arg === "--min-score" && next) {
      args.minScore = Number(next);
      i += 1;
    } else if (arg === "--min-suitability" && next) {
      args.minSuitability = Number(next);
      i += 1;
    } else {
      throw new Error(`Unknown component-plugin-action-queue argument: ${arg}`);
    }
  }
  if (!args.search && !args.coverageMatrix && !args.repairCoverage && !args.motifRecall && !args.harvestShortlist && !args.targetAudit) {
    throw new Error("--search, --coverage-matrix, --repair-coverage, --motif-recall, --harvest-shortlist, or --target-audit is required");
  }
  return args;
}

function buildPluginActionQueue(options = {}) {
  if (options.coverageMatrix) return buildPluginActionQueueFromCoverageMatrix(options);
  if (options.repairCoverage) return buildPluginActionQueueFromRepairCoverage(options);
  if (options.motifRecall) return buildPluginActionQueueFromMotifRecall(options);
  if (options.harvestShortlist) return buildPluginActionQueueFromHarvestShortlist(options);
  if (options.targetAudit) return buildPluginActionQueueFromTargetAudit(options);
  const searchFile = path.resolve(String(options.search || ""));
  const searchReport = readJson(searchFile);
  const maxActions = normalizePositiveInt(options.maxActions, 10);
  const minScore = Number.isFinite(Number(options.minScore)) ? Number(options.minScore) : 50;
  const minSuitability = Number.isFinite(Number(options.minSuitability)) ? Number(options.minSuitability) : 35;
  const candidates = collectActionCandidates(searchReport);
  const eligibilityOptions = { minScore, minSuitability };
  const rejectedCandidates = candidates
    .filter((action) => !isActionEligible(action, eligibilityOptions))
    .map((action) => ({ ...action, rejectionReasons: actionEligibilityRejectionReasons(action, eligibilityOptions) }));
  const actions = candidates
    .filter((action) => isActionEligible(action, eligibilityOptions))
    .sort(compareActionPriority)
    .slice(0, maxActions)
    .map((action, index) => ({
      ...action,
      order: index + 1,
      watcherRecommended: true,
      watcherProvider: action.provider === "officeplus" ? "officeplus" : "islide",
      postActionHarvestHint: action.provider === "officeplus"
        ? "run watch-plugin-component-downloads while applying this OfficePLUS component, then harvest OfficePLUS local cache"
        : "run watch-plugin-component-downloads while applying this iSlide component, then harvest iSlide temp cache"
    }));
  return {
    provider: "component-plugin-action-queue-v1",
    search: searchFile,
    generatedAt: new Date().toISOString(),
    summary: summarizeActions(actions, rejectedCandidates),
    rejectedCandidates: rejectedCandidates.map(summarizeRejectedAction).slice(0, 50),
    actions
  };
}

function buildPluginActionQueueFromRepairCoverage(options = {}) {
  const repairCoverageFile = path.resolve(String(options.repairCoverage || ""));
  const coverage = readJson(repairCoverageFile);
  const maxActions = normalizePositiveInt(options.maxActions, 10);
  const actions = selectBalancedRepairCoverageActions(
    collectRepairCoverageBacklogActions(coverage),
    maxActions
  )
    .map((action, index) => ({
      ...action,
      order: index + 1,
      watcherRecommended: true,
      watcherProvider: action.provider === "officeplus" ? "officeplus" : "islide",
      postActionHarvestHint: action.provider === "officeplus"
        ? "run component-plugin-apply-session while applying this OfficePLUS repair-coverage target, then refresh replacement inventory"
        : "run component-plugin-apply-session while applying this iSlide repair-coverage target, then refresh replacement inventory"
    }));
  return {
    provider: "component-plugin-action-queue-v1",
    repairCoverage: repairCoverageFile,
    generatedAt: new Date().toISOString(),
    summary: {
      ...summarizeActions(actions),
      protectedNonSemanticSkips: countProtectedRepairCoverageSkips(coverage)
    },
    actions
  };
}

function selectBalancedRepairCoverageActions(actions = [], maxActions = 10) {
  const limit = normalizePositiveInt(maxActions, 10);
  const sorted = [...actions].sort(compareActionPriority);
  const providerBuckets = new Map();
  for (const action of sorted) {
    const provider = normalizeProvider(action.provider);
    if (!providerBuckets.has(provider)) providerBuckets.set(provider, []);
    providerBuckets.get(provider).push(action);
  }
  const providers = [...providerBuckets.keys()].sort((a, b) => {
    if (a === "officeplus") return -1;
    if (b === "officeplus") return 1;
    return a.localeCompare(b);
  });
  if (providers.length <= 1) return sorted.slice(0, limit);
  const selected = [];
  while (selected.length < limit) {
    let changed = false;
    for (const provider of providers) {
      const bucket = providerBuckets.get(provider) || [];
      const next = bucket.shift();
      if (!next) continue;
      selected.push(next);
      changed = true;
      if (selected.length >= limit) break;
    }
    if (!changed) break;
  }
  return selected;
}

function buildPluginActionQueueFromTargetAudit(options = {}) {
  const targetAuditFile = path.resolve(String(options.targetAudit || ""));
  const targetAudit = readJson(targetAuditFile);
  const maxActions = normalizePositiveInt(options.maxActions, 10);
  const minScore = Number.isFinite(Number(options.minScore)) ? Number(options.minScore) : 50;
  const minSuitability = Number.isFinite(Number(options.minSuitability)) ? Number(options.minSuitability) : 35;
  const candidates = collectTargetAuditActions(targetAudit);
  const eligibilityOptions = { minScore, minSuitability };
  const rejectedCandidates = candidates
    .filter((action) => !isActionEligible(action, eligibilityOptions))
    .map((action) => ({ ...action, rejectionReasons: actionEligibilityRejectionReasons(action, eligibilityOptions) }));
  const actions = candidates
    .filter((action) => isActionEligible(action, eligibilityOptions))
    .sort(compareActionPriority)
    .slice(0, maxActions)
    .map((action, index) => ({
      ...action,
      order: index + 1,
      watcherRecommended: true,
      watcherProvider: action.provider === "officeplus" ? "officeplus" : "islide",
      postActionHarvestHint: action.provider === "officeplus"
        ? "run component-plugin-apply-session while applying this safe OfficePLUS structural target, then refresh replacement inventory"
        : "run component-plugin-apply-session while applying this safe iSlide structural target, then refresh replacement inventory"
    }));
  return {
    provider: "component-plugin-action-queue-v1",
    targetAudit: targetAuditFile,
    generatedAt: new Date().toISOString(),
    summary: {
      ...summarizeActions(actions, rejectedCandidates),
      protectedNonSemanticSkips: countProtectedTargetAuditSkips(targetAudit)
    },
    rejectedCandidates: rejectedCandidates.map(summarizeRejectedAction).slice(0, 50),
    actions
  };
}

function buildPluginActionQueueFromHarvestShortlist(options = {}) {
  const shortlistFile = path.resolve(String(options.harvestShortlist || ""));
  const shortlist = readJson(shortlistFile);
  const resolveIndex = options.officePlusResolve ? indexOfficePlusResolve(readJson(options.officePlusResolve)) : new Map();
  const maxActions = normalizePositiveInt(options.maxActions, 10);
  const minScore = Number.isFinite(Number(options.minScore)) ? Number(options.minScore) : 50;
  const minSuitability = Number.isFinite(Number(options.minSuitability)) ? Number(options.minSuitability) : 35;
  const candidates = collectHarvestShortlistActions(shortlist, { resolveIndex });
  const eligibilityOptions = { minScore, minSuitability };
  const rejectedCandidates = candidates
    .filter((action) => !isActionEligible(action, eligibilityOptions))
    .map((action) => ({ ...action, rejectionReasons: actionEligibilityRejectionReasons(action, eligibilityOptions) }));
  const actions = candidates
    .filter((action) => isActionEligible(action, eligibilityOptions))
    .sort(compareActionPriority)
    .slice(0, maxActions)
    .map((action, index) => ({
      ...action,
      order: index + 1,
      watcherRecommended: true,
      watcherProvider: action.provider === "officeplus" ? "officeplus" : "islide",
      postActionHarvestHint: action.provider === "officeplus"
        ? "run component-plugin-apply-session while applying this OfficePLUS shortlist item, then run component-replacement-harvest-refresh"
        : "run component-plugin-apply-session while applying this iSlide shortlist item, then run component-replacement-harvest-refresh"
    }));
  return {
    provider: "component-plugin-action-queue-v1",
    harvestShortlist: shortlistFile,
    officePlusResolve: options.officePlusResolve ? path.resolve(String(options.officePlusResolve)) : "",
    generatedAt: new Date().toISOString(),
    summary: summarizeActions(actions, rejectedCandidates),
    rejectedCandidates: rejectedCandidates.map(summarizeRejectedAction).slice(0, 50),
    actions
  };
}

function buildPluginActionQueueFromMotifRecall(options = {}) {
  const recallFile = path.resolve(String(options.motifRecall || ""));
  const recall = readJson(recallFile);
  const maxActions = normalizePositiveInt(options.maxActions, 10);
  const actions = collectMotifRecallActions(recall)
    .sort(compareActionPriority)
    .slice(0, maxActions)
    .map((action, index) => ({
      ...action,
      order: index + 1,
      watcherRecommended: true,
      watcherProvider: action.provider === "officeplus" ? "officeplus" : "islide",
      postActionHarvestHint: action.provider === "officeplus"
        ? "run watch-plugin-component-downloads while applying this OfficePLUS motif-gap item, then harvest OfficePLUS local cache"
        : "run watch-plugin-component-downloads while applying this iSlide motif-gap item, then harvest iSlide temp cache"
    }));
  return {
    provider: "component-plugin-action-queue-v1",
    motifRecall: recallFile,
    generatedAt: new Date().toISOString(),
    summary: summarizeActions(actions),
    actions
  };
}

function buildPluginActionQueueFromCoverageMatrix(options = {}) {
  const coverageFile = path.resolve(String(options.coverageMatrix || ""));
  const matrix = readJson(coverageFile);
  const maxActions = normalizePositiveInt(options.maxActions, 10);
  const actions = collectCoverageBacklogActions(matrix)
    .sort(compareActionPriority)
    .slice(0, maxActions)
    .map((action, index) => ({
      ...action,
      order: index + 1,
      watcherRecommended: true,
      watcherProvider: action.provider === "officeplus" ? "officeplus" : "islide",
      postActionHarvestHint: action.provider === "officeplus"
        ? "run watch-plugin-component-downloads while applying this OfficePLUS backlog item, then harvest OfficePLUS local cache"
        : "run watch-plugin-component-downloads while applying this iSlide backlog item, then harvest iSlide temp cache"
    }));
  return {
    provider: "component-plugin-action-queue-v1",
    coverageMatrix: coverageFile,
    generatedAt: new Date().toISOString(),
    summary: summarizeActions(actions),
    actions
  };
}

function collectActionCandidates(searchReport = {}) {
  const actions = [];
  for (const result of Array.isArray(searchReport.results) ? searchReport.results : []) {
    const task = result.task || {};
    for (const document of Array.isArray(result.bestDocuments) ? result.bestDocuments : []) {
      const action = actionFromDocument({ task, document });
      if (action) actions.push(action);
    }
  }
  return dedupeActions(actions);
}

function collectCoverageBacklogActions(matrix = {}) {
  const examples = [
    ...coverageExamples(matrix?.totals?.componentAssetAcquisitionExamples),
    ...(Array.isArray(matrix.rows) ? matrix.rows.flatMap((row) => coverageExamples(row.componentAssetAcquisitionExamples, row.deck)) : [])
  ];
  return dedupeActions(examples.map(actionFromCoverageExample).filter(Boolean));
}

function collectRepairCoverageBacklogActions(repairCoverage = {}) {
  const actions = [];
  for (const deck of Array.isArray(repairCoverage?.decks) ? repairCoverage.decks : []) {
    for (const disposition of Array.isArray(deck.finalDeckDispositions) ? deck.finalDeckDispositions : []) {
      if (safeString(disposition.action) !== "replacement-candidate") continue;
      actions.push(...repairCoverageDispositionActions({
        ...disposition,
        deck: safeString(disposition.deck || deck.deck)
      }));
    }
  }
  return dedupeActions(actions);
}

function repairCoverageDispositionActions(disposition = {}) {
  if (!isRepairCoverageSemanticStructure(disposition)) return [];
  const profile = repairCoverageSearchProfile(disposition);
  return [
    actionFromRepairCoverageDisposition(disposition, {
      ...profile,
      provider: "officeplus",
      kind: "component"
    }),
    actionFromRepairCoverageDisposition(disposition, {
      ...profile,
      provider: "islide",
      kind: "smartdiagram"
    })
  ].filter(Boolean);
}

function actionFromRepairCoverageDisposition(disposition = {}, profile = {}) {
  if (!isRepairCoverageSemanticStructure(disposition)) return null;
  const provider = normalizeProvider(profile.provider);
  const kind = safeString(profile.kind).toLowerCase();
  const keywords = safeString(profile.keywords);
  const deck = safeString(disposition.deck || "repair-coverage");
  if (!provider || !kind || !keywords) return null;
  const targetMotifs = sanitizeMotifs(profile.targetMotifs);
  const layerKey = [
    deck,
    `p${Number(disposition.page || 0) || 0}`,
    safeString(disposition.imageId || `image-${Number(disposition.image || 0) || 0}`)
  ].filter(Boolean).join(":");
  const motifText = targetMotifs.length ? targetMotifs.join(",") : "whole-process-template";
  const id = repairCoverageActionId({ deck, slide: disposition.page, imageId: disposition.imageId, provider, kind, motifText });
  const title = `${provider} ${kind} repair target for ${motifText}: ${keywords}`;
  const action = {
    provider,
    kind,
    id,
    title,
    layerKey,
    deck,
    slide: Number(disposition.page || 0) || null,
    imageId: safeString(disposition.imageId),
    imageIndex: Number.isFinite(Number(disposition.image)) ? Number(disposition.image) - 1 : null,
    score: repairCoverageActionScore({ provider, kind, targetMotifs, disposition }),
    matchedKeywords: keywords,
    searchKeywords: [keywords, ...sanitizeStringArray(profile.alternateKeywords)].filter(Boolean).slice(0, 6),
    targetMotifs,
    templateFamily: safeString(profile.templateFamily),
    fileName: "",
    coverUrl: "",
    reuseHint: "repair-coverage-replacement-candidate",
    paymentType: null,
    price: null,
    downloadLookup: null,
    acquisitionReason: [
      "expression-policy-final-disposition:replacement-candidate",
      safeString(disposition.detector),
      safeString(disposition.minimumUnitPolicy),
      safeString(disposition.reason)
    ].filter(Boolean).join("; ").slice(0, 300),
    affectedTargets: [{
      deck,
      slide: Number(disposition.page || 0) || null,
      imageId: safeString(disposition.imageId),
      imageIndex: Number.isFinite(Number(disposition.image)) ? Number(disposition.image) - 1 : null,
      layerKey
    }].filter((target) => target.deck || target.slide !== null || target.imageId || target.layerKey),
    affectedSlides: [{ deck, slide: Number(disposition.page || 0) || null }].filter((item) => item.slide),
    action: repairCoverageActionInstruction({ provider, kind, id, title, keywords, motifText, disposition })
  };
  return {
    ...action,
    suitability: evaluateRepairCoverageActionSuitability(action, disposition)
  };
}

function repairCoverageActionId({ deck, slide, imageId, provider, kind, motifText } = {}) {
  return [
    "repair",
    deck,
    `p${Number(slide || 0) || 0}`,
    imageId,
    provider,
    kind,
    motifText
  ].map((part) => safeString(part).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48))
    .filter(Boolean)
    .join(":")
    .slice(0, 180);
}

function repairCoverageSearchProfile(disposition = {}) {
  const text = [
    disposition.detector,
    disposition.expressionKind,
    disposition.minimumUnitPolicy,
    disposition.violation,
    disposition.imageId
  ].map(safeString).join(" ").toLowerCase();
  if (/table|matrix|grid|表格|矩阵/.test(text)) {
    return repairCoverageProfile("矩阵卡片表格图示", ["卡片矩阵", "表格流程图"], ["card-grid"], "matrix-grid");
  }
  if (/arc|cycle|circular|loop|ring|循环|圆弧|环形/.test(text)) {
    return repairCoverageProfile("循环箭头流程图", ["圆弧箭头", "环形流程"], ["arc-arrow"], "cycle-arrow");
  }
  if (/tree|hierarchy|org|层级|树/.test(text)) {
    return repairCoverageProfile("树状层级关系图", ["组织结构图", "层级关系"], ["tree-link"], "tree-hierarchy");
  }
  if (/hub|spoke|radial|中心|辐射/.test(text)) {
    return repairCoverageProfile("中心辐射关系图", ["放射关系图", "径向关系"], ["radial-link"], "hub-spoke");
  }
  if (/pie|share|donut|chart|图表|饼图/.test(text)) {
    return repairCoverageProfile("占比图表组件", ["饼图图示", "数据图表"], ["pie-share-chart"], "chart");
  }
  if (/flow|process|chain|arrow|collaboration|wms|流程|箭头/.test(text)) {
    return repairCoverageProfile("流程箭头组件", ["步骤流程图", "线性流程"], ["linear-arrow-chain", "whole-process-template"], "process-flow");
  }
  return repairCoverageProfile("结构关系图组件", ["流程图组件", "关系图"], ["whole-process-template"], "generic-structure");
}

function repairCoverageProfile(keywords, alternateKeywords, targetMotifs, templateFamily) {
  return { keywords, alternateKeywords, targetMotifs, templateFamily };
}

function repairCoverageActionInstruction({ provider, kind, id, title, keywords, motifText, disposition }) {
  const tab = provider === "officeplus" ? "OfficePLUS" : "iSlide";
  const verb = provider === "officeplus" ? "apply/download" : "download/apply";
  return {
    mode: "plugin-ui-search-repair-coverage",
    tab,
    library: kind,
    searchText: keywords,
    expectedCandidateId: id,
    expectedTitle: title,
    instruction: `Open ${tab}, search "${keywords}", choose the best matching ${kind} for ${motifText}, ${verb} it into a blank active slide, then harvest it for ${safeString(disposition.deck)} slide ${Number(disposition.page || 0) || "?"}.`
  };
}

function repairCoverageActionScore({ provider, kind, targetMotifs, disposition }) {
  let score = coverageActionScore({ provider, kind, targetMotifs });
  if (safeString(disposition.minimumUnitPolicy) === "rebuild-semantic-structure") score += 4;
  if (/matrix|table|grid/.test(safeString(disposition.detector).toLowerCase())) score += 3;
  return Math.min(99, score);
}

function collectMotifRecallActions(recall = {}) {
  const actions = [];
  for (const row of Array.isArray(recall?.rows) ? recall.rows : []) {
    if (safeString(row.status) === "ready") continue;
    for (const suggestion of Array.isArray(row.suggestedCollectionActions) ? row.suggestedCollectionActions : []) {
      actions.push(...actionsFromMotifSuggestion(row, suggestion));
    }
  }
  return dedupeActions(actions);
}

function collectHarvestShortlistActions(shortlist = {}, options = {}) {
  const resolveIndex = options.resolveIndex instanceof Map ? options.resolveIndex : new Map();
  return dedupeActions((Array.isArray(shortlist.actions) ? shortlist.actions : [])
    .map((action) => actionFromHarvestShortlistAction(action, { resolveEvidence: resolveIndex.get(safeString(action.id)) || null }))
    .filter(Boolean));
}

function collectTargetAuditActions(targetAudit = {}) {
  const actions = [];
  for (const deck of Array.isArray(targetAudit.decks) ? targetAudit.decks : []) {
    for (const target of Array.isArray(deck.executableTargets) ? deck.executableTargets : []) {
      const action = actionFromTargetAuditRow(target, deck);
      if (action) actions.push(action);
    }
  }
  return groupTargetAuditActions(actions);
}

function countProtectedRepairCoverageSkips(repairCoverage = {}) {
  let count = 0;
  for (const deck of Array.isArray(repairCoverage?.decks) ? repairCoverage.decks : []) {
    for (const disposition of Array.isArray(deck.finalDeckDispositions) ? deck.finalDeckDispositions : []) {
      if (safeString(disposition.action) !== "replacement-candidate") continue;
      if (isProtectedNonSemanticUnit(disposition)) count += 1;
    }
  }
  return count;
}

function countProtectedTargetAuditSkips(targetAudit = {}) {
  let count = 0;
  for (const deck of Array.isArray(targetAudit?.decks) ? targetAudit.decks : []) {
    for (const target of Array.isArray(deck.executableTargets) ? deck.executableTargets : []) {
      if (safeString(target.decision) !== "executable-plugin-target") continue;
      if (isProtectedNonSemanticUnit(target)) count += 1;
    }
  }
  return count;
}

function groupTargetAuditActions(actions = []) {
  const groups = new Map();
  for (const action of actions) {
    const key = [
      action.provider,
      action.kind,
      action.id,
      (action.targetMotifs || []).join(","),
      action.action?.searchText || action.matchedKeywords
    ].join("|");
    const target = {
      deck: action.deck,
      slide: action.slide,
      imageId: action.imageId,
      imageIndex: action.imageIndex,
      layerKey: action.layerKey
    };
    if (!groups.has(key)) {
      groups.set(key, {
        ...action,
        affectedTargets: [target],
        affectedSlides: compactAffectedSlides([target])
      });
      continue;
    }
    const existing = groups.get(key);
    existing.score = Math.max(Number(existing.score || 0), Number(action.score || 0));
    if (Number(action.suitability?.score || 0) > Number(existing.suitability?.score || 0)) {
      existing.suitability = action.suitability;
    }
    existing.affectedTargets.push(target);
    existing.affectedSlides = compactAffectedSlides(existing.affectedTargets);
    existing.acquisitionReason = `${existing.acquisitionReason}; grouped-target-count:${existing.affectedTargets.length}`.slice(0, 300);
    existing.action = {
      ...existing.action,
      instruction: groupedTargetInstruction(existing)
    };
  }
  return [...groups.values()];
}

function actionFromTargetAuditRow(target = {}, deck = {}) {
  if (safeString(target.decision) !== "executable-plugin-target") return null;
  if (!isTargetAuditSemanticStructure(target)) return null;
  const plugin = target.pluginAction || {};
  const implementationStatus = safeString(plugin.implementationStatus || inferTargetAuditImplementationStatus(plugin));
  if (implementationStatus === "import-ready") return null;
  const provider = normalizeProvider(plugin.provider);
  const kind = safeString(plugin.kind).toLowerCase();
  const id = safeString(plugin.id);
  const title = safeString(plugin.title);
  if (!provider || !kind || !id || !title) return null;
  const targetMotifs = targetAuditMotifs(target);
  const searchText = targetAuditSearchText(target, title);
  const layerKey = [
    safeString(target.deck || deck.deck),
    `p${Number(target.slide || 0) || 0}`,
    safeString(target.imageId || `image-${target.imageIndex ?? ""}`)
  ].filter(Boolean).join(":");
  const action = {
    provider,
    kind,
    id,
    title,
    layerKey,
    deck: safeString(target.deck || deck.deck),
    slide: Number(target.slide || 0) || null,
    imageId: safeString(target.imageId),
    imageIndex: Number.isFinite(Number(target.imageIndex)) ? Number(target.imageIndex) : null,
    score: targetAuditActionScore(target),
    matchedKeywords: searchText,
    searchKeywords: uniqueStrings([searchText, title, id, target.expressionSubtype, target.layerType]).slice(0, 6),
    targetMotifs,
    templateFamily: safeString(target.expressionPolicy?.kind || target.structural?.reasons?.[0] || ""),
    fileName: "",
    coverUrl: "",
    reuseHint: "safe-structural-plugin-target",
    paymentType: null,
    price: null,
    downloadLookup: implementationStatus === "download-gated" ? { status: "auth-or-download-required" } : null,
    implementationMode: safeString(plugin.implementationMode),
    implementationStatus,
    acquisitionReason: [
      "plugin-target-audit:executable-plugin-target",
      implementationStatus ? `implementation:${implementationStatus}` : "",
      safeString(target.expressionPolicy?.minimumUnitPolicy),
      ...(Array.isArray(target.reasons) ? target.reasons : [])
    ].filter(Boolean).join("; ").slice(0, 300),
    action: {
      mode: "plugin-ui-apply-and-harvest",
      tab: provider === "officeplus" ? "OfficePLUS" : "iSlide",
      library: kind,
      searchText,
      expectedCandidateId: id,
      expectedTitle: title,
      instruction: `Open ${provider === "officeplus" ? "OfficePLUS" : "iSlide"}, search "${searchText}", apply ${kind} "${title}" (${id}) for ${safeString(target.deck || deck.deck)} slide ${Number(target.slide || 0) || "?"}, then harvest it as a reusable replacement component.`
    }
  };
  return {
    ...action,
    suitability: evaluateTargetAuditActionSuitability(action, target)
  };
}

function inferTargetAuditImplementationStatus(plugin = {}) {
  const implementationMode = safeString(plugin.implementationMode).toLowerCase();
  const targetStep = safeString(plugin.targetStep).toLowerCase();
  if (/import-ready|local-component|applied-component/.test(implementationMode)) return "import-ready";
  if (/auth-or-download-required|download-required|login-required/.test(implementationMode)) return "download-gated";
  if (/when-download-is-available|download/.test(targetStep)) return "download-gated";
  return "unresolved";
}

function groupedTargetInstruction(action = {}) {
  const first = Array.isArray(action.affectedTargets) ? action.affectedTargets[0] : null;
  const targetCount = Array.isArray(action.affectedTargets) ? action.affectedTargets.length : 1;
  const suffix = targetCount > 1 ? ` and ${targetCount - 1} other safe target(s)` : "";
  return `Open ${action.provider === "officeplus" ? "OfficePLUS" : "iSlide"}, search "${action.action?.searchText || action.matchedKeywords}", apply ${action.kind} "${action.title}" (${action.id}) for ${first?.deck || action.deck} slide ${first?.slide || action.slide}${suffix}, then harvest it once as a reusable replacement component.`;
}

function compactAffectedSlides(targets = []) {
  return [...new Set((Array.isArray(targets) ? targets : [])
    .map((target) => `${safeString(target.deck)}#${Number(target.slide || 0) || 0}`)
    .filter((value) => !/#0$/.test(value)))]
    .map((value) => {
      const [deck, slide] = value.split("#");
      return { deck, slide: Number(slide) };
    });
}

function actionFromHarvestShortlistAction(item = {}, options = {}) {
  const provider = normalizeProvider(item.provider);
  const kind = safeString(item.kind).toLowerCase();
  const id = safeString(item.id);
  const title = safeString(item.title);
  if (!provider || !kind || !id || !title) return null;
  const instruction = item.action && typeof item.action === "object" ? item.action : {};
  const targetMotifs = sanitizeMotifs(item.targetMotifs);
  const searchText = safeString(instruction.searchText || item.matchedKeywords || title || id);
  const status = safeString(item.status);
  const resolveEvidence = normalizeResolveEvidence(options.resolveEvidence);
  const action = {
    provider,
    kind,
    id,
    title,
    layerKey: safeString(item.layerId || item.taskId || item.taskTitle || ""),
    score: round(item.score),
    matchedKeywords: searchText,
    searchKeywords: [searchText, title, id].filter(Boolean).slice(0, 6),
    targetMotifs,
    templateFamily: safeString(item.templateFamily || item.structureSignature?.layout || ""),
    fileName: safeString(resolveEvidence.bestDocument?.fileName),
    coverUrl: safeString(resolveEvidence.bestDocument?.coverUrl),
    reuseHint: status || "component-harvest-shortlist",
    paymentType: resolveEvidence.bestDocument?.paymentType ?? null,
    price: resolveEvidence.bestDocument?.price ?? null,
    downloadLookup: resolveEvidence.downloadLookup || null,
    acquisitionMode: safeString(resolveEvidence.acquisitionMode),
    acquisitionReason: [
      status ? `shortlist:${status}` : "",
      ...(Array.isArray(item.reasons) ? item.reasons : [])
    ].filter(Boolean).join("; ").slice(0, 300),
    affectedSlides: Array.isArray(item.affectedSlides) ? item.affectedSlides : [],
    action: {
      mode: safeString(instruction.mode || "plugin-ui-apply-and-harvest"),
      tab: safeString(instruction.tab || (provider === "officeplus" ? "OfficePLUS" : "iSlide")),
      library: safeString(instruction.library || kind),
      searchText,
      expectedCandidateId: safeString(instruction.expectedCandidateId || id),
      expectedTitle: safeString(instruction.expectedTitle || title),
      instruction: safeString(instruction.instruction || defaultHarvestInstruction({ provider, kind, id, title, searchText })).slice(0, 500)
    }
  };
  return {
    ...action,
    suitability: evaluateHarvestShortlistActionSuitability(action, item)
  };
}

function indexOfficePlusResolve(report = {}) {
  const map = new Map();
  for (const row of Array.isArray(report.rows) ? report.rows : []) {
    const id = safeString(row.bestDocument?.id || row.target?.id);
    if (!id) continue;
    map.set(id, row);
  }
  return map;
}

function normalizeResolveEvidence(row = null) {
  if (!row || typeof row !== "object") {
    return {
      bestDocument: null,
      downloadLookup: null,
      acquisitionMode: ""
    };
  }
  return {
    bestDocument: row.bestDocument && typeof row.bestDocument === "object" ? row.bestDocument : null,
    downloadLookup: row.downloadLookup && typeof row.downloadLookup === "object" ? row.downloadLookup : null,
    acquisitionMode: safeString(row.acquisitionMode)
  };
}

function defaultHarvestInstruction({ provider, kind, id, title, searchText }) {
  const tab = provider === "officeplus" ? "OfficePLUS" : "iSlide";
  return `Open ${tab}, search "${searchText}", choose ${kind} "${title}" (${id}), then apply/download it into a blank active slide for harvesting.`;
}

function actionsFromMotifSuggestion(row = {}, suggestion = {}) {
  const actionType = safeString(suggestion.action);
  if (!/^(search-plugin-component-library|apply-and-harvest-plugin-component)$/.test(actionType)) return [];
  const motif = sanitizeMotifs([row.motif])[0];
  if (!motif) return [];
  const keywords = sanitizeStringArray(suggestion.keywords || row.expectedKeywords);
  const primaryKeyword = keywords[0] || motif;
  const providers = sanitizeProviders(suggestion.providers);
  return providers.flatMap((provider) => motifKindsForProvider(provider, motif).map((kind) => {
    const id = coverageActionId({
      deck: "motif-recall",
      layerKey: motif,
      provider,
      kind,
      keywords: primaryKeyword,
      motifText: motif
    });
    const score = motifRecallActionScore({ provider, kind, motif, actionType });
    const title = `${provider} ${kind} gap fill for ${motif}: ${primaryKeyword}`;
    const action = {
      provider,
      kind,
      id,
      title,
      layerKey: motif,
      score,
      matchedKeywords: primaryKeyword,
      searchKeywords: keywords.slice(0, 6),
      targetMotifs: [motif],
      templateFamily: motifTemplateFamily(motif),
      fileName: "",
      coverUrl: "",
      reuseHint: "motif-recall-gap",
      paymentType: null,
      price: null,
      downloadLookup: null,
      acquisitionReason: safeString(suggestion.reason).slice(0, 300),
      motifStatus: safeString(row.status),
      action: coverageActionInstruction({ provider, kind, id, title, keywords: primaryKeyword, motifText: motif }),
      suggestedWorkflowCommand: safeString(suggestion.command)
    };
    return {
      ...action,
      suitability: evaluateMotifRecallActionSuitability(action)
    };
  }));
}

function coverageExamples(values = [], fallbackDeck = "") {
  return (Array.isArray(values) ? values : [])
    .map((item) => ({ ...item, deck: item.deck || fallbackDeck }))
    .filter((item) => item.provider && item.kind && item.keywords);
}

function actionFromCoverageExample(example = {}) {
  const provider = normalizeProvider(example.provider);
  const kind = safeString(example.kind).toLowerCase();
  const keywords = safeString(example.keywords);
  if (!provider || !kind || !keywords) return null;
  const deck = safeString(example.deck || "coverage");
  const layerKey = safeString(example.layerKey || "");
  const targetMotifs = sanitizeMotifs(example.targetMotifs);
  const motifText = targetMotifs.length ? targetMotifs.join(",") : "unknown-motif";
  const id = coverageActionId({ deck, layerKey, provider, kind, keywords, motifText });
  const title = `${provider} ${kind} for ${motifText}: ${keywords}`;
  return {
    provider,
    kind,
    id,
    title,
    layerKey,
    score: coverageActionScore({ provider, kind, targetMotifs }),
    matchedKeywords: keywords,
    searchKeywords: [keywords, ...sanitizeStringArray(example.alternateKeywords)].filter(Boolean).slice(0, 6),
    targetMotifs,
    templateFamily: safeString(example.templateFamily),
    fileName: "",
    coverUrl: "",
    reuseHint: "coverage-acquisition-backlog",
    paymentType: null,
    price: null,
    downloadLookup: null,
    acquisitionReason: safeString(example.reason).slice(0, 300),
    deck,
    action: coverageActionInstruction({ provider, kind, id, title, keywords, motifText })
  };
}

function coverageActionInstruction({ provider, kind, id, title, keywords, motifText }) {
  const tab = provider === "officeplus" ? "OfficePLUS" : "iSlide";
  const library = kind;
  const instruction = provider === "officeplus"
    ? `Open OfficePLUS, search "${keywords}", choose the best matching ${kind} for ${motifText}, then click apply/download into the current slide.`
    : `Open iSlide component library, search "${keywords}", choose the best matching ${kind} for ${motifText}, then click download/apply into the current slide.`;
  return {
    mode: "plugin-ui-search-backlog",
    tab,
    library,
    searchText: keywords,
    expectedCandidateId: id,
    expectedTitle: title,
    instruction
  };
}

function actionFromDocument({ task = {}, document = {} } = {}) {
  const provider = normalizeProvider(document.acquisitionProvider || task.provider);
  const kind = safeString(document.kind || document.acquisitionKind || task.kind).toLowerCase();
  const id = safeString(document.id);
  const title = safeString(document.title);
  if (!provider || !kind || !id || !title) return null;
  const targetMotifs = sanitizeMotifs(document.targetMotifs || task.targetMotifs);
  const matchedKeywords = safeString(document.matchedKeywords || task.keywords);
  const action = {
    provider,
    kind,
    id,
    title,
    layerKey: safeString(task.layerKey),
    score: round(document.acquisitionScore),
    matchedKeywords,
    searchKeywords: [matchedKeywords, ...sanitizeStringArray(task.alternateKeywords)].filter(Boolean).slice(0, 6),
    targetMotifs,
    templateFamily: safeString(task.templateFamily),
    fileName: safeString(document.fileName),
    coverUrl: safeUrl(document.coverUrl),
    reuseHint: safeString(document.reuseHint),
    paymentType: document.paymentType ?? null,
    price: numberOrNull(document.price),
    downloadLookup: sanitizeDownloadLookup(document.downloadLookup),
    action: actionInstruction({ provider, kind, id, title, matchedKeywords })
  };
  return {
    ...action,
    suitability: evaluateActionSuitability(action)
  };
}

function actionInstruction({ provider, kind, id, title, matchedKeywords }) {
  if (provider === "officeplus") {
    return {
      mode: "plugin-ui-apply",
      tab: "OfficePLUS",
      library: kind,
      searchText: matchedKeywords,
      expectedCandidateId: id,
      expectedTitle: title,
      instruction: `Open OfficePLUS, search "${matchedKeywords}", choose ${kind} "${title}" (${id}), then click apply/download into the current slide.`
    };
  }
  return {
    mode: "plugin-ui-apply",
    tab: "iSlide",
    library: kind,
    searchText: matchedKeywords,
    expectedCandidateId: id,
    expectedTitle: title,
    instruction: `Open iSlide component library, search "${matchedKeywords}", choose ${kind} "${title}" (${id}), then click download/apply into the current slide.`
  };
}

function dedupeActions(actions = []) {
  const seen = new Set();
  const result = [];
  for (const action of actions) {
    const key = actionKey(action);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(action);
  }
  return result;
}

function actionKey(action = {}) {
  return [action.provider, action.kind, action.id, action.layerKey].join("|");
}

function compareActionPriority(a = {}, b = {}) {
  return suitabilityTierRank(b.suitability?.tier) - suitabilityTierRank(a.suitability?.tier)
    || Number(b.suitability?.score || 0) - Number(a.suitability?.score || 0)
    || Number(b.score || 0) - Number(a.score || 0)
    || actionKey(a).localeCompare(actionKey(b));
}

function suitabilityTierRank(tier) {
  if (tier === "strong") return 3;
  if (tier === "weak") return 2;
  if (tier === "rejected") return 0;
  return 1;
}

function coverageActionId({ deck, layerKey, provider, kind, keywords, motifText }) {
  return [
    "coverage",
    deck,
    layerKey,
    provider,
    kind,
    keywords,
    motifText
  ].map((part) => safeString(part).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80))
    .filter(Boolean)
    .join(":")
    .slice(0, 240);
}

function coverageActionScore({ provider, kind, targetMotifs }) {
  let score = 70;
  if (provider === "officeplus" && kind === "component") score += 18;
  else if (provider === "islide" && kind === "smartdiagram") score += 14;
  else if (provider === "officeplus") score += 8;
  else if (provider === "islide") score += 6;
  if ((targetMotifs || []).includes("radial-link")) score += 5;
  return Math.min(99, score);
}

function isActionEligible(action = {}, options = {}) {
  const minScore = Number.isFinite(Number(options.minScore)) ? Number(options.minScore) : 50;
  const minSuitability = Number.isFinite(Number(options.minSuitability)) ? Number(options.minSuitability) : 35;
  return Number(action.score || 0) >= minScore
    && Number(action.suitability?.score ?? 100) >= minSuitability
    && action.suitability?.tier !== "rejected";
}

function actionEligibilityRejectionReasons(action = {}, options = {}) {
  const minScore = Number.isFinite(Number(options.minScore)) ? Number(options.minScore) : 50;
  const minSuitability = Number.isFinite(Number(options.minSuitability)) ? Number(options.minSuitability) : 35;
  const reasons = [...(Array.isArray(action.suitability?.rejectionReasons) ? action.suitability.rejectionReasons : [])];
  if (Number(action.score || 0) < minScore) reasons.push("below-min-score");
  if (Number(action.suitability?.score ?? 100) < minSuitability) reasons.push("below-min-suitability");
  if (action.suitability?.tier === "rejected") reasons.push("suitability-rejected");
  return [...new Set(reasons.length ? reasons : ["unknown"])];
}

function evaluateActionSuitability(action = {}) {
  const targetMotifs = sanitizeMotifs(action.targetMotifs);
  const text = [
    action.title,
    action.fileName,
    action.reuseHint
  ].map(safeString).join(" ").toLowerCase();
  let score = 0;
  const reasons = [];
  const rejectionReasons = [];

  const kindBonus = suitabilityKindBonus(action.provider, action.kind);
  score += kindBonus;
  if (kindBonus > 0) reasons.push(`kind:${action.provider}:${action.kind}`);

  const reuseHint = safeString(action.reuseHint).toLowerCase();
  if (/grouped-pptx-component|downloadable-template/.test(reuseHint)) {
    score += 25;
    reasons.push("editable-grouped-component");
  } else if (/smart-diagram/.test(reuseHint)) {
    score += 12;
    reasons.push("smart-diagram-reference");
  } else if (/polished-diagram/.test(reuseHint)) {
    score += 8;
    reasons.push("polished-diagram-reference");
  } else if (/vector-or-icon/.test(reuseHint)) {
    score -= 10;
    rejectionReasons.push("vector-or-icon-reference");
  }

  for (const motif of targetMotifs) {
    const motifScore = scoreMotifTextEvidence(motif, text);
    score += motifScore.score;
    reasons.push(...motifScore.reasons);
    rejectionReasons.push(...motifScore.rejectionReasons);
  }

  if (Number(action.price || 0) > 0 || (action.paymentType !== null && action.paymentType !== 0)) {
    reasons.push("paid-or-member-candidate");
  }
  score = Math.max(0, Math.min(100, round(score)));
  const tier = score >= 65
    ? "strong"
    : score >= 35 && rejectionReasons.length === 0
      ? "weak"
      : "rejected";
  return {
    score,
    tier,
    reasons: [...new Set(reasons)].slice(0, 12),
    rejectionReasons: [...new Set(rejectionReasons)].slice(0, 12)
  };
}

function evaluateMotifRecallActionSuitability(action = {}) {
  const score = Math.max(0, Math.min(100, round(Number(action.score || 0))));
  const tier = score >= 82 ? "strong" : "weak";
  return {
    score,
    tier,
    reasons: [
      `motif-gap:${(action.targetMotifs || []).join(",") || "unknown"}`,
      `kind:${action.provider}:${action.kind}`
    ].filter(Boolean).slice(0, 12),
    rejectionReasons: []
  };
}

function evaluateTargetAuditActionSuitability(action = {}, target = {}) {
  let score = Math.max(0, Math.min(100, round(Number(action.score || 0))));
  const reasons = ["safe-target-audit-executable"];
  const rejectionReasons = [];
  if (action.provider === "officeplus" && action.kind === "component") {
    score += 12;
    reasons.push("editable-officeplus-component");
  }
  if ((action.targetMotifs || []).length > 0) {
    score += Math.min(15, action.targetMotifs.length * 5);
    reasons.push("structural-motif-bound");
  } else {
    score -= 20;
    rejectionReasons.push("missing-structural-motif");
  }
  const policyKind = safeString(target.expressionPolicy?.kind);
  const unitDisposition = safeString(target.expressionPolicy?.unitDisposition);
  if (unitDisposition && unitDisposition !== "semantic-native-structure") {
    score = 0;
    rejectionReasons.push("non-semantic-visual-unit");
  }
  if (policyKind === "structured-native") {
    score += 12;
    reasons.push("structured-native-policy");
  } else if (policyKind === "hybrid-native-overlays") {
    score += 4;
    reasons.push("hybrid-overlay-policy");
  }
  const compatibility = targetAuditComponentCompatibility(action);
  score += compatibility.scoreDelta;
  reasons.push(...compatibility.reasons);
  rejectionReasons.push(...compatibility.rejectionReasons);
  if (/preserve-local-crop|reject|defer/.test(safeString(target.decision))) {
    score = 0;
    rejectionReasons.push("not-executable-target");
  }
  score = Math.max(0, Math.min(100, round(score)));
  return {
    score,
    tier: score >= 65 ? "strong" : score >= 35 && rejectionReasons.length === 0 ? "weak" : "rejected",
    reasons: [...new Set(reasons)].slice(0, 12),
    rejectionReasons: [...new Set(rejectionReasons)].slice(0, 12)
  };
}

function targetAuditComponentCompatibility(action = {}) {
  const title = safeString(action.title).toLowerCase();
  const motifs = sanitizeMotifs(action.targetMotifs);
  const reasons = [];
  const rejectionReasons = [];
  let scoreDelta = 0;
  if (motifs.includes("card-grid")) {
    if (/(矩阵|表格|卡片|图表|对比|列表|清单|matrix|table|grid|card)/i.test(title)) {
      scoreDelta += 10;
      reasons.push("title-matches-card-grid");
    } else {
      scoreDelta -= 35;
      rejectionReasons.push("title-mismatches-card-grid");
    }
    if (/(流程|流转|链路|箭头|process|flow|chain)/i.test(title)
      && !/(矩阵|表格|卡片|对比|matrix|table|grid|card)/i.test(title)) {
      scoreDelta -= 25;
      rejectionReasons.push("flow-title-for-card-grid-target");
    }
  }
  if (motifs.includes("linear-arrow-chain") || motifs.includes("whole-process-template")) {
    if (/(流程|流转|链路|箭头|步骤|process|flow|chain|step)/i.test(title)) {
      scoreDelta += 10;
      reasons.push("title-matches-process-flow");
    } else {
      scoreDelta -= 25;
      rejectionReasons.push("title-mismatches-process-flow");
    }
  }
  if (motifs.includes("radial-link")) {
    if (/(关系|总分|中心|发散|辐射|圆形|环形|radial|hub|spoke|relationship)/i.test(title)) {
      scoreDelta += 8;
      reasons.push("title-matches-relationship");
    } else if (!motifs.includes("linear-arrow-chain")) {
      scoreDelta -= 20;
      rejectionReasons.push("title-mismatches-relationship");
    }
  }
  if (motifs.includes("arc-arrow") || motifs.includes("ring-node")) {
    if (/(循环|圆弧|环形|闭环|cycle|loop|ring)/i.test(title)) {
      scoreDelta += 8;
      reasons.push("title-matches-cycle");
    } else {
      scoreDelta -= 20;
      rejectionReasons.push("title-mismatches-cycle");
    }
  }
  return { scoreDelta, reasons, rejectionReasons };
}

function evaluateHarvestShortlistActionSuitability(action = {}, source = {}) {
  let score = Math.max(0, Math.min(100, round(Number(action.score || 0) / 3)));
  const status = safeString(source.status).toLowerCase();
  const reasons = [`shortlist:${status || "unknown"}`];
  const rejectionReasons = [];
  if (status === "direct-target-candidate") {
    score += 30;
    reasons.push("exact-component-id");
  } else if (status === "direct-target-search") {
    score += 35;
    reasons.push("exact-title-search");
  } else if (status === "structural-alternate") {
    score += 8;
    reasons.push("structural-alternate");
  }
  if (action.provider === "officeplus" && action.kind === "component") {
    score += 12;
    reasons.push("editable-officeplus-component");
  }
  if ((action.targetMotifs || []).length > 0) {
    score += Math.min(12, action.targetMotifs.length * 3);
    reasons.push("target-motif-bound");
  } else {
    rejectionReasons.push("missing-target-motif");
  }
  score = Math.max(0, Math.min(100, round(score)));
  return {
    score,
    tier: score >= 65 ? "strong" : score >= 35 && rejectionReasons.length === 0 ? "weak" : "rejected",
    reasons: [...new Set(reasons)].slice(0, 12),
    rejectionReasons: [...new Set(rejectionReasons)].slice(0, 12)
  };
}

function evaluateRepairCoverageActionSuitability(action = {}, disposition = {}) {
  let score = Math.max(0, Math.min(100, round(Number(action.score || 0))));
  const reasons = ["repair-coverage-replacement-candidate"];
  const rejectionReasons = [];
  if (action.provider === "officeplus" && action.kind === "component") {
    score += 8;
    reasons.push("editable-officeplus-component");
  } else if (action.provider === "islide" && action.kind === "smartdiagram") {
    score += 6;
    reasons.push("islide-smartdiagram-component");
  }
  if ((action.targetMotifs || []).length > 0) {
    score += Math.min(12, action.targetMotifs.length * 4);
    reasons.push("target-motif-bound");
  } else {
    score -= 20;
    rejectionReasons.push("missing-target-motif");
  }
  if (safeString(disposition.minimumUnitPolicy) === "preserve-as-single-crop") {
    score = 0;
    rejectionReasons.push("fidelity-crop-not-actionable");
  }
  const unitDisposition = safeString(disposition.unitDisposition);
  if (unitDisposition && unitDisposition !== "semantic-native-structure") {
    score = 0;
    rejectionReasons.push("non-semantic-visual-unit");
  }
  if (safeString(disposition.action) !== "replacement-candidate") {
    score = 0;
    rejectionReasons.push("not-replacement-candidate");
  }
  score = Math.max(0, Math.min(100, round(score)));
  return {
    score,
    tier: score >= 65 ? "strong" : score >= 35 && rejectionReasons.length === 0 ? "weak" : "rejected",
    reasons: [...new Set(reasons)].slice(0, 12),
    rejectionReasons: [...new Set(rejectionReasons)].slice(0, 12)
  };
}

function isRepairCoverageSemanticStructure(disposition = {}) {
  const unitDisposition = safeString(disposition.unitDisposition).toLowerCase();
  if (unitDisposition) return unitDisposition === "semantic-native-structure";
  if (isNonSemanticVisualAssetTarget(disposition)) return false;
  return safeString(disposition.minimumUnitPolicy).toLowerCase() !== "preserve-as-single-crop";
}

function isTargetAuditSemanticStructure(target = {}) {
  const unitDisposition = safeString(target.expressionPolicy?.unitDisposition).toLowerCase();
  if (unitDisposition) return unitDisposition === "semantic-native-structure";
  if (isNonSemanticVisualAssetTarget(target)) return false;
  const policyKind = safeString(target.expressionPolicy?.kind).toLowerCase();
  return policyKind !== "standalone-visual-asset" && policyKind !== "decorative-texture";
}

function isProtectedNonSemanticUnit(target = {}) {
  const unitDisposition = safeString(target.unitDisposition || target.expressionPolicy?.unitDisposition).toLowerCase();
  if (unitDisposition === "intentional-visual-crop"
    || unitDisposition === "intentional-decorative-crop"
    || unitDisposition === "hybrid-crop-with-native-overlays") {
    return true;
  }
  if (unitDisposition === "semantic-native-structure" || unitDisposition === "classification-needed") return false;
  return isNonSemanticVisualAssetTarget(target);
}

function isNonSemanticVisualAssetTarget(target = {}) {
  const text = [
    target.detector,
    target.layerType,
    target.expressionForm,
    target.expressionSubtype,
    target.expressionPolicy?.kind,
    target.expressionPolicy?.minimumUnitPolicy,
    target.pluginAction?.title,
    target.pluginAction?.reuseHint,
    target.reason,
    ...(Array.isArray(target.reasons) ? target.reasons : [])
  ].map(safeString).join(" ").toLowerCase();
  if (/preserve-as-single-crop|standalone-visual-asset|decorative-texture/.test(text)) return true;
  return /icon-or-illustration|illustration-zone|visual-example|component-preview|plugin-.*(?:arrow|icon)|pictogram|clipart|sticker|ornament|badge|mockup|sample|example|screenshot|screen-demo|图标|插画|图示|示意图|素材|样例|示例|截图示意|图形素材|图标图示/.test(text);
}

function suitabilityKindBonus(provider, kind) {
  if (provider === "officeplus" && kind === "component") return 35;
  if (provider === "islide" && kind === "smartdiagram") return 25;
  if (provider === "islide" && kind === "diagram") return 18;
  if (provider === "officeplus" && kind === "shape") return 16;
  if (provider === "officeplus" && kind === "vector") return 5;
  return 8;
}

function scoreMotifTextEvidence(motif, text) {
  if (motif !== "radial-link") return { score: 0, reasons: [], rejectionReasons: [] };
  const reasons = [];
  const rejectionReasons = [];
  let score = 0;
  const positivePatterns = [
    ["radial-center", /(中心|总分|发散|辐射|径向|放射|圆形|环形|关系|4项|5项|四项|五项|hub|spoke|radial)/i],
    ["radial-relationship", /(关系|总分|发散|辐射|径向|放射|共享|交换|中心)/i]
  ];
  for (const [reason, pattern] of positivePatterns) {
    if (pattern.test(text)) {
      score += 18;
      reasons.push(reason);
    }
  }
  if (/(柱状图|柱形图|条形图|折线图|饼图|太阳|紫外线|地球|计算机|图标|icon)/i.test(text)) {
    score -= 35;
    rejectionReasons.push("radial-motif-conflicting-visual");
  }
  if (/(架构图|平台架构|系统架构)/i.test(text) && !/(总分|发散|辐射|径向|放射)/i.test(text)) {
    score -= 18;
    rejectionReasons.push("radial-architecture-diagram-weak-match");
  }
  if (!/(中心|总分|发散|辐射|径向|放射|关系|hub|spoke|radial)/i.test(text)) {
    rejectionReasons.push("radial-text-evidence-missing");
  }
  return { score, reasons, rejectionReasons };
}

function summarizeActions(actions = [], rejectedCandidates = []) {
  const summary = {
    actions: actions.length,
    rejectedCandidates: rejectedCandidates.length,
    byProvider: {},
    byMotif: {},
    bySuitabilityTier: {},
    rejectedByReason: {},
    paidCandidates: 0,
    downloadUrlResolved: 0,
    downloadUrlErrors: 0
  };
  for (const action of actions) {
    addCount(summary.byProvider, action.provider || "unknown");
    addCount(summary.bySuitabilityTier, action.suitability?.tier || "unknown");
    for (const motif of action.targetMotifs || []) addCount(summary.byMotif, motif);
    if (Number(action.price || 0) > 0 || (action.paymentType !== null && action.paymentType !== 0)) summary.paidCandidates += 1;
    if (action.downloadLookup?.status === "ok" && action.downloadLookup?.downloadUrl) summary.downloadUrlResolved += 1;
    if (action.downloadLookup?.status === "error") summary.downloadUrlErrors += 1;
  }
  for (const action of rejectedCandidates) {
    for (const reason of action.rejectionReasons || action.suitability?.rejectionReasons || ["unknown"]) addCount(summary.rejectedByReason, reason);
  }
  return summary;
}

function summarizeRejectedAction(action = {}) {
  return {
    provider: action.provider,
    kind: action.kind,
    id: action.id,
    title: action.title,
    score: action.score,
    suitability: action.suitability,
    rejectionReasons: action.rejectionReasons || [],
    targetMotifs: action.targetMotifs,
    matchedKeywords: action.matchedKeywords
  };
}

function sanitizeDownloadLookup(lookup = null) {
  if (!lookup || typeof lookup !== "object") return null;
  const status = safeString(lookup.status);
  if (!/^(ok|empty|error)$/.test(status)) return null;
  return {
    status,
    ...(lookup.endpoint ? { endpoint: safeString(lookup.endpoint).slice(0, 200) } : {}),
    ...(lookup.downloadUrl ? { downloadUrl: safeUrl(lookup.downloadUrl) } : {}),
    ...(lookup.error ? { error: safeString(lookup.error).slice(0, 300) } : {})
  };
}

function sanitizeMotifs(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => safeString(value).toLowerCase())
    .filter((value) => /^(arc-arrow|ring-node|card-grid|tree-link|fishbone-cause|radial-link|linear-arrow-chain|whole-process-template|lens-funnel-flow|branch-card-flow|layered-stack|funnel-stack|pyramid-stack|venn-overlap|intersection-overlap|milestone-roadmap|quadrant-axis|pie-share-chart)$/.test(value)))];
}

function sanitizeStringArray(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((value) => safeString(value).slice(0, 80))
    .filter(Boolean);
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => safeString(value).slice(0, 120))
    .filter(Boolean))];
}

function normalizeProvider(value) {
  const provider = safeString(value).toLowerCase();
  return /^(officeplus|islide)$/.test(provider) ? provider : "";
}

function sanitizeProviders(values = []) {
  const providers = (Array.isArray(values) ? values : [])
    .map(normalizeProvider)
    .filter(Boolean);
  return [...new Set(providers.length ? providers : ["officeplus", "islide"])];
}

function motifKindsForProvider(provider, motif) {
  if (provider === "officeplus") {
    if (motif === "ring-node") return ["shape", "component"];
    return ["component"];
  }
  if (motif === "arc-arrow" || motif === "ring-node") return ["diagram", "smartdiagram"];
  return ["smartdiagram", "diagram"];
}

function motifTemplateFamily(motif) {
  const families = {
    "arc-arrow": "cycle-loop",
    "ring-node": "cycle-loop",
    "card-grid": "card-grid",
    "tree-link": "tree-hierarchy",
    "radial-link": "hub-spoke",
    "linear-arrow-chain": "process-chain",
    "whole-process-template": "process-chain"
  };
  return families[motif] || "generic";
}

function targetAuditMotifs(target = {}) {
  const text = [
    target.detector,
    target.layerType,
    target.expressionForm,
    target.expressionSubtype,
    target.pluginAction?.title
  ].map(safeString).join(" ").toLowerCase();
  const motifs = [];
  if (/table|matrix|grid|表格|矩阵/.test(text)) return sanitizeMotifs(["card-grid"]);
  if (/process|flow|chain|workflow|流程|链路|箭头/.test(text)) motifs.push("linear-arrow-chain", "whole-process-template");
  if (/relationship|hub|spoke|radial|center|总分|关系|中心|发散|辐射/.test(text)) motifs.push("radial-link");
  if (/cycle|loop|ring|环形|循环/.test(text)) motifs.push("arc-arrow", "ring-node");
  if (/tree|hierarchy|层级|树/.test(text)) motifs.push("tree-link");
  return sanitizeMotifs(motifs);
}

function targetAuditSearchText(target = {}, fallbackTitle = "") {
  const motifs = targetAuditMotifs(target);
  const subtype = safeString(target.expressionSubtype);
  if (motifs.includes("card-grid")) {
    if (/matrix|矩阵/i.test(subtype)) return "矩阵 关系 对比 组件";
    return "表格 卡片 矩阵 组件";
  }
  if (motifs.includes("linear-arrow-chain")) return "流程 箭头 组件";
  if (motifs.includes("radial-link")) return "中心 发散 关系图";
  if (motifs.includes("arc-arrow")) return "循环 圆弧 箭头";
  if (motifs.includes("tree-link")) return "层级 关系 树状图";
  return safeString(fallbackTitle || target.pluginAction?.title || target.expressionSubtype || target.layerType);
}

function targetAuditActionScore(target = {}) {
  const confidence = Number(target.pluginAction?.confidence);
  let score = Number.isFinite(confidence) ? confidence : 50;
  const structural = target.structural || {};
  const nodeCount = Number(structural.nodeCount || 0);
  const connectorCount = Number(structural.connectorCount || 0);
  const atomCount = Number(structural.atomCount || 0);
  if (nodeCount >= 2) score += Math.min(15, nodeCount);
  if (connectorCount >= 1) score += Math.min(12, connectorCount);
  if (atomCount >= 4) score += 8;
  return Math.max(0, Math.min(100, round(score)));
}

function motifRecallActionScore({ provider, kind, motif, actionType }) {
  let score = coverageActionScore({ provider, kind, targetMotifs: [motif] });
  if (actionType === "apply-and-harvest-plugin-component") score += 6;
  if (motif === "whole-process-template" && provider === "officeplus" && kind === "component") score += 8;
  if (motif === "tree-link" && provider === "islide" && kind === "smartdiagram") score += 4;
  return Math.min(99, score);
}

function addCount(target, key) {
  const safeKey = safeString(key || "unknown");
  if (!safeKey) return;
  target[safeKey] = (target[safeKey] || 0) + 1;
}

function normalizePositiveInt(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function safeUrl(value) {
  const text = safeString(value);
  return /^https?:\/\//i.test(text) ? text : "";
}

function renderPluginActionQueueMarkdown(queue = {}) {
  const lines = [
    "# Plugin Component Action Queue",
    "",
    `Generated: ${safeString(queue.generatedAt || new Date().toISOString())}`,
    `Actions: ${Number(queue.summary?.actions || 0)}`,
    "",
    "Run this watcher before applying plugin components so downloaded/applied PPTX components are harvested automatically:",
    "",
    "```powershell",
    "node skills\\pd-hifi-slideclone\\scripts\\watch-plugin-component-downloads.js --provider all --active-powerpoint --duration-ms 30000 --poll-ms 500 --out runs\\plugin-component-inventory\\watched-plugin-components",
    "```",
    ""
  ];
  const actions = Array.isArray(queue.actions) ? queue.actions : [];
  if (actions.length === 0) {
    lines.push("No plugin actions are currently queued.");
    lines.push("");
    return `${lines.join("\n")}\n`;
  }
  for (const action of actions) {
    const order = Number(action.order || 0) || actions.indexOf(action) + 1;
    const motif = (action.targetMotifs || []).join(", ") || "unknown";
    lines.push(`## ${order}. ${safeString(action.action?.tab || action.provider)} ${safeString(action.kind)} for ${motif}`);
    lines.push("");
    lines.push(`- Priority: ${safeString(action.suitability?.tier || "unknown")} / ${Number(action.suitability?.score || action.score || 0)}`);
    lines.push(`- Search: ${safeString(action.action?.searchText || action.matchedKeywords)}`);
    lines.push(`- Keywords: ${sanitizeStringArray(action.searchKeywords).join(" | ")}`);
    lines.push(`- Plugin: ${safeString(action.action?.tab || action.provider)}`);
    lines.push(`- Library: ${safeString(action.action?.library || action.kind)}`);
    if (action.acquisitionMode) lines.push(`- Acquisition mode: ${safeString(action.acquisitionMode)}`);
    if (action.fileName) lines.push(`- Source file: ${safeString(action.fileName)}`);
    if (action.paymentType !== null && action.paymentType !== undefined) lines.push(`- Payment type: ${safeString(action.paymentType)}`);
    if (action.price !== null && action.price !== undefined) lines.push(`- Price: ${safeString(action.price)}`);
    if (action.downloadLookup?.status) lines.push(`- Download lookup: ${safeString(action.downloadLookup.status)}`);
    if (action.acquisitionReason) lines.push(`- Reason: ${safeString(action.acquisitionReason)}`);
    lines.push("");
    lines.push("Instruction:");
    lines.push(safeString(action.action?.instruction || "Search and apply the matching plugin component into the active PowerPoint slide."));
    lines.push("");
    lines.push("After applying this component, refresh the component inventory:");
    lines.push("");
    lines.push("```powershell");
    lines.push("node skills\\pd-hifi-slideclone\\scripts\\component-library-refresh.js --learn-structure --watch-plugin-downloads --watch-provider all --watch-duration-ms 30000 --watch-poll-ms 500");
    lines.push("```");
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(String(file)), "utf8"));
}

function main() {
  const args = parseArgs(process.argv);
  const report = buildPluginActionQueue(args);
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (args.markdownOut) {
    fs.mkdirSync(path.dirname(path.resolve(args.markdownOut)), { recursive: true });
    fs.writeFileSync(path.resolve(args.markdownOut), renderPluginActionQueueMarkdown(report), "utf8");
  }
  console.log(`plugin component actions: ${report.summary.actions}`);
  console.log(`report: ${path.resolve(args.out)}`);
  if (args.markdownOut) console.log(`guide: ${path.resolve(args.markdownOut)}`);
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
  buildPluginActionQueue,
  buildPluginActionQueueFromCoverageMatrix,
  buildPluginActionQueueFromHarvestShortlist,
  buildPluginActionQueueFromMotifRecall,
  buildPluginActionQueueFromRepairCoverage,
  buildPluginActionQueueFromTargetAudit,
  collectActionCandidates,
  collectCoverageBacklogActions,
  collectHarvestShortlistActions,
  collectMotifRecallActions,
  collectRepairCoverageBacklogActions,
  collectTargetAuditActions,
  parseArgs,
  renderPluginActionQueueMarkdown,
  _private: {
    actionFromDocument,
    actionFromCoverageExample,
    actionFromHarvestShortlistAction,
    actionFromRepairCoverageDisposition,
    actionFromTargetAuditRow,
    actionsFromMotifSuggestion,
    coverageActionInstruction,
    evaluateRepairCoverageActionSuitability,
    evaluateHarvestShortlistActionSuitability,
    evaluateActionSuitability,
    evaluateMotifRecallActionSuitability,
    evaluateTargetAuditActionSuitability,
    isActionEligible,
    summarizeActions
  }
};
