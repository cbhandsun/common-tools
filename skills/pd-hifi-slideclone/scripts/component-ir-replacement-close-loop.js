#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  buildComponentIrReplacementPlan
} = require("./component-ir-replacement-plan");
const {
  buildComponentIrReplacementApplyPlans
} = require("./component-ir-replacement-apply-plan");
const {
  runComponentIrReplacementApplyBatch
} = require("./component-ir-replacement-apply-batch");
const {
  runComponentIrVisualRegressionAudit
} = require("./component-ir-visual-regression-audit");
const {
  evaluateCloseLoopGate
} = require("./component-replacement-close-loop-gate");
const {
  renderHarvestQueueMarkdown
} = require("./component-replacement-harvest-queue");

const STRICT_GEOMETRY_THRESHOLDS = Object.freeze({
  minBoundsIoU: 0.92,
  maxCenterOffsetPt: 6
});

function parseArgs(argv = process.argv) {
  const args = {
    harvestQueue: "",
    irDir: path.join("ppt文档", "组件策略可编辑版本"),
    inventory: "",
    pptxDir: path.join("ppt文档", "组件策略可编辑版本"),
    out: path.join("runs", "component-ir-replacement-close-loop"),
    concurrency: 1,
    engine: "openxml",
    dryRun: false,
    allowPendingSamples: false,
    minAppliedCount: 0,
    minRemovedShapeCount: 0,
    maxFallbackWithoutRemoval: 0,
    minBoundsIoU: null,
    maxCenterOffsetPt: null,
    strictGeometry: false,
    objectAudit: false,
    minObjectPictureReduction: 1,
    minObjectNativeIncrease: 1,
    visualAudit: false,
    visualTargetRegionAudit: false,
    visualRenderer: "libreoffice",
    visualReuseRender: false,
    visualReviewAssets: false,
    visualMaxDecks: 0,
    visualMaxPagesPerDeck: 0,
    visualPageBudget: 0,
    visualMaxPixelDiffRatio: 0.42,
    visualMaxForegroundMissingRatio: 0.58,
    visualMaxMeanDelta: 72,
    visualMaxTargetPixelDiffRatio: 0.22,
    visualMaxTargetForegroundMissingRatio: 0.28,
    visualMaxTargetMeanDelta: 46
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
    } else if (arg === "--pptx-dir" && next) {
      args.pptxDir = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (arg === "--concurrency" && next) {
      args.concurrency = Number(next);
      index += 1;
    } else if (arg === "--engine" && next) {
      args.engine = next;
      index += 1;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--allow-pending-samples") {
      args.allowPendingSamples = true;
    } else if (arg === "--min-applied-count" && next) {
      args.minAppliedCount = Number(next);
      index += 1;
    } else if (arg === "--min-removed-shape-count" && next) {
      args.minRemovedShapeCount = Number(next);
      index += 1;
    } else if (arg === "--max-fallback-without-removal" && next) {
      args.maxFallbackWithoutRemoval = Number(next);
      index += 1;
    } else if (arg === "--min-bounds-iou" && next) {
      args.minBoundsIoU = Number(next);
      index += 1;
    } else if (arg === "--max-center-offset-pt" && next) {
      args.maxCenterOffsetPt = Number(next);
      index += 1;
    } else if (arg === "--strict-geometry") {
      args.strictGeometry = true;
    } else if (arg === "--object-audit") {
      args.objectAudit = true;
    } else if (arg === "--min-object-picture-reduction" && next) {
      args.minObjectPictureReduction = Number(next);
      index += 1;
    } else if (arg === "--min-object-native-increase" && next) {
      args.minObjectNativeIncrease = Number(next);
      index += 1;
    } else if (arg === "--visual-audit") {
      args.visualAudit = true;
    } else if (arg === "--visual-target-region-audit") {
      args.visualTargetRegionAudit = true;
    } else if (arg === "--visual-renderer" && next) {
      args.visualRenderer = next;
      index += 1;
    } else if (arg === "--visual-reuse-render") {
      args.visualReuseRender = true;
    } else if (arg === "--visual-review-assets") {
      args.visualReviewAssets = true;
    } else if (arg === "--visual-max-decks" && next) {
      args.visualMaxDecks = Number(next);
      index += 1;
    } else if (arg === "--visual-max-pages-per-deck" && next) {
      args.visualMaxPagesPerDeck = Number(next);
      index += 1;
    } else if (arg === "--visual-page-budget" && next) {
      args.visualPageBudget = Number(next);
      index += 1;
    } else if (arg === "--visual-max-pixel-diff-ratio" && next) {
      args.visualMaxPixelDiffRatio = Number(next);
      index += 1;
    } else if (arg === "--visual-max-foreground-missing-ratio" && next) {
      args.visualMaxForegroundMissingRatio = Number(next);
      index += 1;
    } else if (arg === "--visual-max-mean-delta" && next) {
      args.visualMaxMeanDelta = Number(next);
      index += 1;
    } else if (arg === "--visual-max-target-pixel-diff-ratio" && next) {
      args.visualMaxTargetPixelDiffRatio = Number(next);
      index += 1;
    } else if (arg === "--visual-max-target-foreground-missing-ratio" && next) {
      args.visualMaxTargetForegroundMissingRatio = Number(next);
      index += 1;
    } else if (arg === "--visual-max-target-mean-delta" && next) {
      args.visualMaxTargetMeanDelta = Number(next);
      index += 1;
    } else {
      throw new Error(`Unknown component-ir-replacement-close-loop argument: ${arg}`);
    }
  }
  if (!args.harvestQueue) throw new Error("--harvest-queue is required.");
  return args;
}

async function runComponentIrReplacementCloseLoop(options = {}) {
  const args = normalizeOptions(options);
  fs.mkdirSync(args.out, { recursive: true });
  const inventoryResolution = args.inventory
    ? resolveInventoryInput(args.inventory, args.out)
    : { inventory: "", note: "no-inventory" };

  const irPlanFile = path.join(args.out, "component-ir-replacement-plan.json");
  const irPlanGuide = path.join(args.out, "component-ir-replacement-plan.md");
  const irPlan = buildComponentIrReplacementPlan({
    harvestQueue: args.harvestQueue,
    irDir: args.irDir,
    inventory: inventoryResolution.inventory,
    out: irPlanFile,
    markdownOut: irPlanGuide
  });

  const pending = Number(irPlan.summary?.pendingSample || 0);
  const missingTargets = Number(irPlan.summary?.missingTarget || 0);
  const blockedNonSemanticTargets = Number(irPlan.summary?.blockedNonSemanticTarget || 0);
  if ((pending > 0 || missingTargets > 0) && !args.allowPendingSamples) {
    const harvestGuideFile = path.join(args.out, "real-component-harvest-guide.md");
    writeText(harvestGuideFile, renderPendingHarvestGuide({
      args,
      irPlan,
      harvestQueue: readJson(args.harvestQueue)
    }));
    return writeCloseLoopReport(args, {
      status: missingTargets > 0 ? "blocked_missing_targets" : "needs_harvest",
      artifacts: {
        irReplacementPlan: irPlanFile,
        irReplacementPlanGuide: irPlanGuide,
        harvestGuide: harvestGuideFile
      },
      totals: {
        irPlan: irPlan.summary
      },
      inventoryResolution,
      findings: buildPendingFindings(irPlan.summary)
    });
  }

  if (Number(irPlan.summary?.ready || 0) === 0 && blockedNonSemanticTargets > 0) {
    return writeCloseLoopReport(args, {
      status: "protected_non_semantic_targets",
      artifacts: {
        irReplacementPlan: irPlanFile,
        irReplacementPlanGuide: irPlanGuide
      },
      totals: {
        irPlan: irPlan.summary
      },
      inventoryResolution,
      findings: buildProtectedFindings(irPlan.summary)
    });
  }

  const applyPlanDir = path.join(args.out, "apply-plans");
  const applyManifestFile = path.join(applyPlanDir, "component-ir-replacement-apply-manifest.json");
  const applyManifest = buildComponentIrReplacementApplyPlans({
    irPlan: irPlanFile,
    pptxDir: args.pptxDir,
    outDir: applyPlanDir,
    manifestOut: applyManifestFile,
    requireReady: !args.allowPendingSamples && blockedNonSemanticTargets === 0
  });

  if (applyManifest.status !== "ready") {
    return writeCloseLoopReport(args, {
      status: "blocked_apply_manifest",
      artifacts: {
        irReplacementPlan: irPlanFile,
        irReplacementPlanGuide: irPlanGuide,
        applyManifest: applyManifestFile
      },
      totals: {
        irPlan: irPlan.summary,
        applyManifest: applyManifest.summary
      },
      findings: applyManifest.findings || []
    });
  }

  const batchOut = path.join(args.out, "batch");
  const batch = await runComponentIrReplacementApplyBatch({
    manifest: applyManifestFile,
    out: batchOut,
    concurrency: args.concurrency,
    engine: args.engine,
    dryRun: args.dryRun,
    minAppliedCount: args.minAppliedCount,
    minRemovedShapeCount: args.minRemovedShapeCount,
    maxFallbackWithoutRemoval: args.maxFallbackWithoutRemoval,
    minBoundsIoU: args.minBoundsIoU,
    maxCenterOffsetPt: args.maxCenterOffsetPt,
    objectAudit: args.objectAudit,
    minObjectPictureReduction: args.minObjectPictureReduction,
    minObjectNativeIncrease: args.minObjectNativeIncrease,
    objectAuditRunner: args.objectAuditRunner,
    runner: args.runner,
    skillRoot: args.skillRoot
  });

  const visualAudit = args.visualAudit && !args.dryRun
    ? await runVisualAudit({
      batch,
      args,
      out: path.join(args.out, "visual-regression")
    })
    : null;
  const visualAuditPassed = !visualAudit || visualAudit.totals.failedDecks === 0;

  const closeLoopEvidenceFile = path.join(args.out, "component-ir-replacement-close-loop-evidence.json");
  writeJson(closeLoopEvidenceFile, {
    status: batch.applyQualityGate.status === "passed" && batch.totals.failedDecks === 0 && visualAuditPassed ? "applied" : "failed",
    totals: {
      batch: {
        failed: batch.totals.failedDecks,
        appliedCount: batch.totals.appliedCount,
        canApplyAll: batch.totals.canApplyAll
      },
      visualAudit: visualAudit ? {
        failedDecks: visualAudit.totals.failedDecks,
        failedPages: visualAudit.totals.failedPages
      } : null,
      gaps: {
        missingComponents: 0,
        canApplyAll: batch.totals.canApplyAll && visualAuditPassed
      },
      geometry: {
        policy: args.geometryPolicy,
        checkedCount: Number(batch.applyQualityGate.summary?.geometryCheckedCount || 0),
        missingCount: Number(batch.applyQualityGate.summary?.geometryMissingCount || 0),
        minBoundsIoU: batch.applyQualityGate.summary?.minBoundsIoU ?? null,
        maxCenterOffsetPt: batch.applyQualityGate.summary?.maxCenterOffsetPt ?? null
      }
    }
  });
  const closeLoopGateFile = path.join(args.out, "component-replacement-close-loop-gate.json");
  const closeLoopGate = evaluateCloseLoopGate({
    report: closeLoopEvidenceFile,
    applyQualityGate: batch.applyQualityGateFile,
    out: closeLoopGateFile,
    minAppliedCount: args.minAppliedCount
  });

  return writeCloseLoopReport(args, {
    status: closeLoopGate.status === "passed" && visualAuditPassed ? "applied" : "failed",
    artifacts: {
      irReplacementPlan: irPlanFile,
      irReplacementPlanGuide: irPlanGuide,
      applyManifest: applyManifestFile,
      batchReport: batch.reportFile,
      applyQualityGate: batch.applyQualityGateFile,
      visualAudit: visualAudit?.reportFile || null,
      closeLoopEvidence: closeLoopEvidenceFile,
      closeLoopGate: closeLoopGateFile
    },
    totals: {
      irPlan: irPlan.summary,
      applyManifest: applyManifest.summary,
      batch: batch.totals,
      applyQualityGate: batch.applyQualityGate.summary,
      visualAudit: visualAudit?.totals || null,
      closeLoopGate: closeLoopGate.summary
    },
    inventoryResolution,
    findings: [
      ...buildProtectedFindings(irPlan.summary),
      ...safeArray(batch.applyQualityGate.findings),
      ...visualAuditFindings(visualAudit),
      ...safeArray(closeLoopGate.findings)
    ]
  });
}

async function runVisualAudit({ batch, args, out }) {
  const runner = typeof args.visualAuditRunner === "function"
    ? args.visualAuditRunner
    : runComponentIrVisualRegressionAudit;
  return runner({
    report: batch.reportFile,
    out,
    renderer: args.visualRenderer,
    maxDecks: args.visualMaxDecks,
    maxPagesPerDeck: args.visualMaxPagesPerDeck,
    pageBudget: args.visualPageBudget,
    reuseRender: args.visualReuseRender,
    reviewAssets: args.visualReviewAssets,
    targetRegionAudit: args.visualTargetRegionAudit,
    thresholds: {
      maxPixelDiffRatio: args.visualMaxPixelDiffRatio,
      maxForegroundMissingRatio: args.visualMaxForegroundMissingRatio,
      maxMeanAbsoluteDelta: args.visualMaxMeanDelta,
      maxTargetPixelDiffRatio: args.visualMaxTargetPixelDiffRatio,
      maxTargetForegroundMissingRatio: args.visualMaxTargetForegroundMissingRatio,
      maxTargetMeanAbsoluteDelta: args.visualMaxTargetMeanDelta
    }
  });
}

function visualAuditFindings(visualAudit) {
  if (!visualAudit || Number(visualAudit.totals?.failedDecks || 0) === 0) return [];
  return [{
    code: "visual-regression-audit-failed",
    message: `Visual regression audit failed for ${visualAudit.totals.failedDecks} deck(s) and ${visualAudit.totals.failedPages} page(s).`,
    reportFile: visualAudit.reportFile || null
  }];
}

function renderPendingHarvestGuide({ args, irPlan, harvestQueue }) {
  const lines = [
    "# Real Component Harvest Guide",
    "",
    "Status: needs_harvest",
    `Pending replacement operations: ${irPlan.summary?.pendingSample || 0}`,
    `Missing IR targets: ${irPlan.summary?.missingTarget || 0}`,
    "",
    "## Harvest Tasks",
    "",
    renderHarvestQueueMarkdown(normalizeHarvestQueueForGuide(harvestQueue)).trim(),
    "",
    "## Refresh Inventory",
    "",
    "After harvesting the plugin components, refresh or point the close-loop command at the harvested inventory JSON.",
    "",
    "Typical harvest commands write into `runs/plugin-component-inventory`; use the inventory produced by your harvest/refresh step as `--inventory` below.",
    "",
    "## Rerun Close Loop",
    "",
    "```powershell",
    buildRerunCommand(args),
    "```",
    ""
  ];
  return `${lines.join("\n")}\n`;
}

function normalizeHarvestQueueForGuide(queue = {}) {
  const tasks = safeArray(queue.tasks).map((task, index) => ({
    ...task,
    priority: task.priority ?? index + 1,
    status: task.status || "needs_harvest",
    affectedFileCount: Number(task.affectedFileCount || 0),
    totalAnchorCount: Number(task.totalAnchorCount || safeArray(task.affectedTargets).length || 0),
    targetMotifs: safeArray(task.targetMotifs),
    searchKeywords: safeArray(task.searchKeywords),
    workflow: safeArray(task.workflow),
    affectedFiles: safeArray(task.affectedFiles),
    affectedTargets: safeArray(task.affectedTargets)
  }));
  return {
    ...queue,
    createdAt: queue.createdAt || new Date().toISOString(),
    sourceKind: queue.sourceKind || "unknown",
    summary: {
      taskCount: Number(queue.summary?.taskCount ?? tasks.length),
      affectedFiles: Number(queue.summary?.affectedFiles ?? 0),
      totalAnchorCount: Number(queue.summary?.totalAnchorCount ?? tasks.reduce((sum, task) => sum + Number(task.totalAnchorCount || 0), 0)),
      totalAffectedTargets: Number(queue.summary?.totalAffectedTargets ?? tasks.reduce((sum, task) => sum + safeArray(task.affectedTargets).length, 0))
    },
    tasks
  };
}

function buildRerunCommand(args) {
  const parts = [
    "node",
    "skills\\pd-hifi-slideclone\\scripts\\component-ir-replacement-close-loop.js",
    "--harvest-queue",
    quoteCli(args.harvestQueue),
    "--ir-dir",
    quoteCli(args.irDir),
    "--inventory",
    quoteCli(args.inventory || path.join("runs", "plugin-component-inventory")),
    "--pptx-dir",
    quoteCli(args.pptxDir),
    "--out",
    quoteCli(path.join(args.out, "real-apply")),
    "--concurrency",
    String(args.concurrency || 1),
    "--min-applied-count",
    String(args.minAppliedCount || 0),
    "--min-removed-shape-count",
    String(args.minRemovedShapeCount || 0),
    "--max-fallback-without-removal",
    String(args.maxFallbackWithoutRemoval || 0)
  ];
  if (args.minBoundsIoU !== null && args.minBoundsIoU !== undefined) {
    parts.push("--min-bounds-iou", String(args.minBoundsIoU));
  }
  if (args.maxCenterOffsetPt !== null && args.maxCenterOffsetPt !== undefined) {
    parts.push("--max-center-offset-pt", String(args.maxCenterOffsetPt));
  }
  if (args.strictGeometry) parts.push("--strict-geometry");
  if (args.dryRun) parts.push("--dry-run");
  return parts.join(" ");
}

function quoteCli(value) {
  const text = String(value || "");
  return /[\s\u4e00-\u9fff]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}

function normalizeOptions(options = {}) {
  const requestedMinBoundsIoU = normalizeOptionalNonNegativeNumber(options.minBoundsIoU);
  const requestedMaxCenterOffsetPt = normalizeOptionalNonNegativeNumber(options.maxCenterOffsetPt);
  const strictGeometry = options.strictGeometry === true;
  const args = {
    harvestQueue: options.harvestQueue ? path.resolve(String(options.harvestQueue)) : "",
    irDir: path.resolve(String(options.irDir || path.join("ppt文档", "组件策略可编辑版本"))),
    inventory: options.inventory ? path.resolve(String(options.inventory)) : "",
    pptxDir: path.resolve(String(options.pptxDir || path.join("ppt文档", "组件策略可编辑版本"))),
    out: path.resolve(String(options.out || path.join("runs", "component-ir-replacement-close-loop"))),
    concurrency: options.concurrency,
    engine: normalizeEngine(options.engine),
    dryRun: options.dryRun === true,
    allowPendingSamples: options.allowPendingSamples === true,
    minAppliedCount: normalizeNonNegativeInt(options.minAppliedCount, 0),
    minRemovedShapeCount: normalizeNonNegativeInt(options.minRemovedShapeCount, 0),
    maxFallbackWithoutRemoval: normalizeNonNegativeInt(options.maxFallbackWithoutRemoval, 0),
    minBoundsIoU: requestedMinBoundsIoU ?? (strictGeometry ? STRICT_GEOMETRY_THRESHOLDS.minBoundsIoU : null),
    maxCenterOffsetPt: requestedMaxCenterOffsetPt ?? (strictGeometry ? STRICT_GEOMETRY_THRESHOLDS.maxCenterOffsetPt : null),
    strictGeometry,
    geometryPolicy: {
      mode: strictGeometry ? "strict" : requestedMinBoundsIoU !== null || requestedMaxCenterOffsetPt !== null ? "custom" : "disabled",
      requireGeometryEvidence: strictGeometry,
      minBoundsIoU: requestedMinBoundsIoU ?? (strictGeometry ? STRICT_GEOMETRY_THRESHOLDS.minBoundsIoU : null),
      maxCenterOffsetPt: requestedMaxCenterOffsetPt ?? (strictGeometry ? STRICT_GEOMETRY_THRESHOLDS.maxCenterOffsetPt : null)
    },
    objectAudit: options.objectAudit === true,
    minObjectPictureReduction: normalizeNonNegativeInt(options.minObjectPictureReduction, 1),
    minObjectNativeIncrease: normalizeNonNegativeInt(options.minObjectNativeIncrease, 1),
    visualAudit: options.visualAudit === true,
    visualTargetRegionAudit: options.visualTargetRegionAudit === true,
    visualRenderer: String(options.visualRenderer || "libreoffice"),
    visualReuseRender: options.visualReuseRender === true,
    visualReviewAssets: options.visualReviewAssets === true,
    visualMaxDecks: normalizeNonNegativeInt(options.visualMaxDecks, 0),
    visualMaxPagesPerDeck: normalizeNonNegativeInt(options.visualMaxPagesPerDeck, 0),
    visualPageBudget: normalizeNonNegativeInt(options.visualPageBudget, 0),
    visualMaxPixelDiffRatio: normalizeFiniteNumber(options.visualMaxPixelDiffRatio, 0.42),
    visualMaxForegroundMissingRatio: normalizeFiniteNumber(options.visualMaxForegroundMissingRatio, 0.58),
    visualMaxMeanDelta: normalizeFiniteNumber(options.visualMaxMeanDelta, 72),
    visualMaxTargetPixelDiffRatio: normalizeFiniteNumber(options.visualMaxTargetPixelDiffRatio, 0.22),
    visualMaxTargetForegroundMissingRatio: normalizeFiniteNumber(options.visualMaxTargetForegroundMissingRatio, 0.28),
    visualMaxTargetMeanDelta: normalizeFiniteNumber(options.visualMaxTargetMeanDelta, 46),
    runner: options.runner,
    objectAuditRunner: options.objectAuditRunner,
    visualAuditRunner: options.visualAuditRunner,
    skillRoot: options.skillRoot
  };
  if (!args.harvestQueue) throw new Error("harvestQueue is required.");
  if (!fs.existsSync(args.harvestQueue)) throw new Error(`Harvest queue was not found: ${args.harvestQueue}`);
  if (args.inventory && !fs.existsSync(args.inventory)) throw new Error(`Component inventory was not found: ${args.inventory}`);
  return args;
}

function normalizeEngine(value) {
  const engine = String(value || "openxml").trim().toLowerCase();
  if (engine !== "openxml" && engine !== "powerpoint") throw new Error(`Unsupported component replacement engine: ${value}`);
  return engine;
}

function resolveInventoryInput(input, outDir) {
  const resolved = path.resolve(String(input || ""));
  if (!resolved) return { inventory: "", note: "no-inventory" };
  if (!fs.existsSync(resolved)) throw new Error(`Component inventory was not found: ${resolved}`);
  if (fs.statSync(resolved).isFile()) return { inventory: resolved, note: "inventory-file" };

  const direct = path.join(resolved, "inventory.json");
  if (fs.existsSync(direct)) return { inventory: direct, note: "directory-inventory-json" };

  const discovered = discoverInventoryFiles(resolved);
  if (discovered.length === 0) throw new Error(`No inventory JSON files were found in directory: ${resolved}`);
  const merged = mergeInventoryFiles(discovered.map((item) => item.file));
  const mergedFile = path.join(outDir, "resolved-component-inventory.json");
  writeJson(mergedFile, merged);
  return {
    inventory: mergedFile,
    note: "merged-directory-inventories",
    sourceFiles: discovered.map((item) => item.file)
  };
}

function discoverInventoryFiles(root) {
  const results = [];
  const queue = [{ dir: path.resolve(root), depth: 0 }];
  while (queue.length > 0 && results.length < 80) {
    const current = queue.shift();
    let entries = [];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current.dir, entry.name);
      if (entry.isDirectory() && current.depth < 4) {
        queue.push({ dir: full, depth: current.depth + 1 });
      } else if (entry.isFile()
        && /\.json$/i.test(entry.name)
        && /inventory|component|applied|harvest/i.test(entry.name)
        && looksLikeInventoryFile(full)) {
        results.push({ file: full, mtimeMs: fs.statSync(full).mtimeMs });
      }
    }
  }
  return results.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function looksLikeInventoryFile(file) {
  try {
    const payload = readJson(file);
    return Array.isArray(payload.candidates) || Array.isArray(payload.components);
  } catch {
    return false;
  }
}

function mergeInventoryFiles(files = []) {
  const candidates = [];
  const seen = new Set();
  for (const file of files) {
    let payload = null;
    try {
      payload = readJson(file);
    } catch {
      continue;
    }
    for (const candidate of [...safeArray(payload.candidates), ...safeArray(payload.components)]) {
      const key = [
        candidate.id,
        candidate.provider,
        candidate.path || candidate.file,
        candidate.name
      ].map((value) => String(value || "")).join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(candidate);
    }
  }
  return {
    provider: "component-ir-close-loop-merged-inventory-v1",
    createdAt: new Date().toISOString(),
    sourceFiles: files,
    summary: {
      sourceFiles: files.length,
      candidates: candidates.length
    },
    candidates
  };
}

function writeCloseLoopReport(args, payload) {
  const report = {
    provider: "component-ir-replacement-close-loop-v1",
    createdAt: new Date().toISOString(),
    harvestQueue: args.harvestQueue,
    irDir: args.irDir,
    inventory: args.inventory || null,
    resolvedInventory: payload.inventoryResolution?.inventory || args.inventory || null,
    inventoryResolution: payload.inventoryResolution || null,
    pptxDir: args.pptxDir,
    out: args.out,
    dryRun: args.dryRun,
    geometryPolicy: args.geometryPolicy,
    status: payload.status,
    artifacts: payload.artifacts || {},
    totals: payload.totals || {},
    findings: safeArray(payload.findings)
  };
  const reportFile = path.join(args.out, "component-ir-replacement-close-loop-report.json");
  writeJson(reportFile, report);
  return {
    ...report,
    reportFile
  };
}

function buildPendingFindings(summary = {}) {
  const findings = [];
  if (Number(summary.pendingSample || 0) > 0) {
    findings.push({
      code: "pending-component-samples",
      message: `${summary.pendingSample} component replacement operation(s) still need harvested plugin samples`
    });
  }
  if (Number(summary.missingTarget || 0) > 0) {
    findings.push({
      code: "missing-ir-targets",
      message: `${summary.missingTarget} component replacement operation(s) could not resolve IR targets`
    });
  }
  return findings;
}

function buildProtectedFindings(summary = {}) {
  const count = Number(summary.blockedNonSemanticTarget || 0);
  if (count <= 0) return [];
  return [{
    code: "protected-non-semantic-targets",
    message: `${count} component replacement target(s) were skipped because they are protected non-semantic visual units`
  }];
}

function writeJson(file, payload) {
  const out = path.resolve(String(file));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeText(file, text) {
  const out = path.resolve(String(file));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text, "utf8");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(String(file)), "utf8").replace(/^\uFEFF/, ""));
}

function normalizeNonNegativeInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

function normalizeFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeOptionalNonNegativeNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const report = await runComponentIrReplacementCloseLoop(args);
    console.log(JSON.stringify({
      status: report.status,
      reportFile: report.reportFile,
      findings: report.findings.length,
      totals: report.totals
    }, null, 2));
    if (report.status !== "applied"
      && report.status !== "needs_harvest"
      && report.status !== "protected_non_semantic_targets") process.exitCode = 1;
  } catch (error) {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  buildRerunCommand,
  buildPendingFindings,
  buildProtectedFindings,
  discoverInventoryFiles,
  mergeInventoryFiles,
  normalizeHarvestQueueForGuide,
  parseArgs,
  resolveInventoryInput,
  renderPendingHarvestGuide,
  runVisualAudit,
  runComponentIrReplacementCloseLoop
};
