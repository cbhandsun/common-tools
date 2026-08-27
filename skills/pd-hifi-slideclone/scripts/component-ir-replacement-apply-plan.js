#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv = process.argv) {
  const args = {
    irPlan: "",
    pptxDir: path.join("ppt文档", "组件策略可编辑版本"),
    outDir: path.join("runs", "component-ir-replacement-apply-plans"),
    manifestOut: "",
    requireReady: false,
    allowMissingPptx: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if ((arg === "--ir-plan" || arg === "--plan") && next) {
      args.irPlan = next;
      index += 1;
    } else if (arg === "--pptx-dir" && next) {
      args.pptxDir = next;
      index += 1;
    } else if ((arg === "--out-dir" || arg === "--out") && next) {
      args.outDir = next;
      index += 1;
    } else if (arg === "--manifest-out" && next) {
      args.manifestOut = next;
      index += 1;
    } else if (arg === "--require-ready") {
      args.requireReady = true;
    } else if (arg === "--allow-missing-pptx") {
      args.allowMissingPptx = true;
    } else {
      throw new Error(`Unknown component-ir-replacement-apply-plan argument: ${arg}`);
    }
  }
  if (!args.irPlan) throw new Error("--ir-plan is required.");
  return args;
}

function buildComponentIrReplacementApplyPlans(options = {}) {
  const irPlanFile = path.resolve(String(options.irPlan || ""));
  if (!fs.existsSync(irPlanFile)) throw new Error(`IR replacement plan was not found: ${irPlanFile}`);
  const pptxDir = path.resolve(String(options.pptxDir || path.join("ppt文档", "组件策略可编辑版本")));
  const outDir = path.resolve(String(options.outDir || path.join("runs", "component-ir-replacement-apply-plans")));
  const requireReady = options.requireReady === true;
  const allowMissingPptx = options.allowMissingPptx === true;
  const irPlan = readJson(irPlanFile);
  const operations = safeArray(irPlan.operations);
  const byDeck = groupReadyOperationsByDeck(operations);
  const reports = [];
  const findings = [];
  const samplePathResolutions = [];

  fs.mkdirSync(outDir, { recursive: true });
  for (const [deck, deckOperations] of byDeck.entries()) {
    const pptx = resolveDeckPptx(deck, pptxDir);
    if (!pptx && !allowMissingPptx) {
      findings.push({
        code: "pptx-not-found",
        deck,
        message: `No editable PPTX found for deck ${deck} in ${pptxDir}`
      });
      continue;
    }
    const validOperations = [];
    for (const operation of deckOperations) {
      const resolution = resolveSampleFile(operation.sample, options);
      const samplePath = resolution.path;
      if (!samplePath || !fs.existsSync(samplePath)) {
        findings.push({
          code: "component-sample-file-not-found",
          deck,
          imageId: safeString(operation.imageId),
          componentId: safeString(operation.component?.componentId),
          samplePath,
          message: `Component sample file was not found for ${deck} ${operation.imageId || operation.layerKey || ""}`.trim()
        });
        continue;
      }
      const resolvedOperation = resolution.relocated
        ? {
          ...operation,
          sample: {
            ...operation.sample,
            path: samplePath,
            pathResolution: resolution.metadata
          }
        }
        : operation;
      if (resolution.relocated) {
        samplePathResolutions.push({
          deck,
          imageId: safeString(operation.imageId),
          componentId: safeString(operation.component?.componentId),
          ...resolution.metadata
        });
      }
      validOperations.push(resolvedOperation);
    }
    if (validOperations.length === 0) continue;
    const applyPlan = buildDeckApplyPlan({ deck, pptx, operations: validOperations });
    const planFile = path.join(outDir, `${safeFileStem(deck)}.component-ir-apply-plan.json`);
    writeJson(planFile, applyPlan);
    reports.push({
      deck,
      pptx,
      planFile,
      operationCount: applyPlan.operations.length,
      readyCount: applyPlan.operations.filter((item) => item.status === "ready").length,
      missingCount: applyPlan.operations.filter((item) => item.status !== "ready").length,
      slides: uniqueNumbers(applyPlan.operations.flatMap((item) => item.slides || []))
    });
  }

  const pending = operations.filter((operation) => operation.status !== "ready");
  if (requireReady && pending.length > 0) {
    findings.push({
      code: "pending-ir-replacement-operations",
      message: `${pending.length} IR replacement operation(s) are not ready`,
      count: pending.length
    });
  }
  const manifest = {
    provider: "component-ir-replacement-apply-plan-v1",
    createdAt: new Date().toISOString(),
    irPlan: irPlanFile,
    pptxDir,
    outDir,
    status: findings.length === 0 ? "ready" : "blocked",
    summary: {
      sourceOperations: operations.length,
      readySourceOperations: operations.filter((operation) => operation.status === "ready").length,
      pendingSourceOperations: pending.length,
      blockedNonSemanticSourceOperations: operations.filter((operation) => operation.status === "blocked_non_semantic_target").length,
      reconciledSamplePaths: samplePathResolutions.length,
      decks: reports.length,
      applyOperations: reports.reduce((sum, report) => sum + report.operationCount, 0),
      findings: findings.length
    },
    findings,
    samplePathResolutions,
    decks: reports
  };
  const manifestOut = path.resolve(String(options.manifestOut || path.join(outDir, "component-ir-replacement-apply-manifest.json")));
  writeJson(manifestOut, manifest);
  return { ...manifest, manifestFile: manifestOut };
}

function groupReadyOperationsByDeck(operations = []) {
  const byDeck = new Map();
  for (const operation of operations) {
    if (operation.status !== "ready") continue;
    const deck = safeString(operation.deck);
    if (!deck) continue;
    if (!byDeck.has(deck)) byDeck.set(deck, []);
    byDeck.get(deck).push(operation);
  }
  return byDeck;
}

function buildDeckApplyPlan({ deck = "", pptx = "", operations = [] } = {}) {
  return {
    provider: "component-replacement-apply-plan-v1",
    source: "component-ir-replacement-apply-plan-v1",
    deck,
    pptx,
    operations: operations.map(toApplyOperation)
  };
}

function toApplyOperation(operation = {}) {
  const component = operation.component || {};
  const sample = operation.sample || {};
  const layer = sanitizeMetadataValue(operation.layerKey || operation.imageId, 48);
  return {
    operation: "replace-anchor-group-with-component-sample",
    status: operation.status === "ready" ? "ready" : "missing_sample",
    groupKey: safeString(operation.layerKey || `${operation.deck}:p${operation.slide}:${operation.imageId}`),
    provider: safeString(component.provider),
    kind: safeString(component.kind || "component"),
    componentId: safeString(component.componentId),
    layer,
    tier: "ir-ready",
    score: Number(sample.matchScore || 0) || null,
    anchorCount: 1,
    slides: [Number(operation.slide)].filter(Number.isFinite),
    drawingNames: [safeString(operation.imageId)].filter(Boolean),
    target: {
      deck: safeString(operation.deck),
      slide: Number(operation.slide) || null,
      imageId: safeString(operation.imageId),
      imageIndex: Number.isFinite(Number(operation.imageIndex)) ? Number(operation.imageIndex) : null,
      layerKey: safeString(operation.layerKey),
      box: operation.targetBox || null
    },
    sample: {
      provider: safeString(sample.provider || component.provider),
      path: sample.path || null,
      name: sample.name || null,
      assetKind: sample.assetKind || null,
      roleTags: safeArray(sample.roleTags).map(safeString),
      matchScore: Number(sample.matchScore || 0) || null,
      ...(sample.pathResolution ? { pathResolution: sanitizePathResolution(sample.pathResolution) } : {}),
      ...(sample.recommendedGroup ? { recommendedGroup: sanitizeRecommendedGroup(sample.recommendedGroup) } : {}),
      ...(sample.manifestLayerKey ? {
        manifestLayerKey: safeString(sample.manifestLayerKey),
        manifestTemplateFamily: safeString(sample.manifestTemplateFamily),
        manifestTargetMotifs: safeArray(sample.manifestTargetMotifs).map(safeString).filter(Boolean)
      } : {})
    }
  };
}

function sanitizeRecommendedGroup(group = {}) {
  return {
    id: safeString(group.id),
    name: safeString(group.name),
    slide: Number.isFinite(Number(group.slide)) ? Math.trunc(Number(group.slide)) : null,
    groupIndex: Number.isFinite(Number(group.groupIndex)) ? Math.trunc(Number(group.groupIndex)) : null,
    matchScore: Number.isFinite(Number(group.matchScore)) ? Number(group.matchScore) : null,
    componentScore: Number.isFinite(Number(group.componentScore)) ? Number(group.componentScore) : null,
    structure: group.structure && typeof group.structure === "object" ? {
      kind: safeString(group.structure.kind),
      motifs: safeArray(group.structure.motifs).map(safeString).filter(Boolean)
    } : null,
    reuseReadiness: group.reuseReadiness && typeof group.reuseReadiness === "object" ? {
      level: safeString(group.reuseReadiness.level),
      score: Number.isFinite(Number(group.reuseReadiness.score)) ? Number(group.reuseReadiness.score) : null
    } : null
  };
}

function resolveSampleFile(sample = {}, options = {}) {
  const directPath = safeString(sample.path || "");
  if (directPath && fs.existsSync(directPath)) {
    return { path: directPath, relocated: false, metadata: null };
  }
  if (!isRelocatableOfficePlusTemplate(sample)) {
    return { path: directPath, relocated: false, metadata: null };
  }

  const root = resolveOfficePlusInstallRoot(options);
  const candidates = discoverOfficePlusTemplatePaths(root, safeString(sample.name || "officeplus.pptx"));
  const relocated = candidates[0] || "";
  return relocated
    ? {
      path: relocated,
      relocated: true,
      metadata: {
        strategy: "officeplus-installed-template-relocation",
        originalPath: directPath || null,
        installRoot: root,
        resolvedPath: relocated
      }
    }
    : { path: directPath, relocated: false, metadata: null };
}

function isRelocatableOfficePlusTemplate(sample = {}) {
  const provider = safeString(sample.provider).toLowerCase();
  const name = safeString(sample.name).toLowerCase();
  const tags = new Set(safeArray(sample.roleTags).map((tag) => safeString(tag).toLowerCase()));
  return provider === "officeplus" && name === "officeplus.pptx" && tags.has("generic-installed-template");
}

function resolveOfficePlusInstallRoot(options = {}) {
  if (options.officePlusInstallRoot) return path.resolve(String(options.officePlusInstallRoot));
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  return path.join(programFiles, "Microsoft OfficePLUS");
}

function discoverOfficePlusTemplatePaths(root, name) {
  if (!root || !fs.existsSync(root)) return [];
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      version: entry.name,
      file: path.join(root, entry.name, "addin", name)
    }))
    .filter((candidate) => fs.existsSync(candidate.file))
    .sort((left, right) => compareVersionNames(right.version, left.version))
    .map((candidate) => candidate.file);
}

function compareVersionNames(left, right) {
  const leftParts = String(left || "").split(/[.-]/).map(Number);
  const rightParts = String(right || "").split(/[.-]/).map(Number);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = Number(leftParts[index] || 0) - Number(rightParts[index] || 0);
    if (diff !== 0) return diff;
  }
  return String(left).localeCompare(String(right));
}

function sanitizePathResolution(resolution = {}) {
  return {
    strategy: safeString(resolution.strategy),
    originalPath: safeString(resolution.originalPath) || null,
    installRoot: safeString(resolution.installRoot) || null,
    resolvedPath: safeString(resolution.resolvedPath) || null
  };
}

function resolveDeckPptx(deck, pptxDir) {
  const candidates = [
    `${deck}.native-editable.pptx`,
    `${deck}.editable.pptx`,
    `${deck}.pptx`
  ].map((name) => path.join(pptxDir, name));
  return candidates.find((file) => fs.existsSync(file)) || "";
}

function sanitizeMetadataValue(value, maxLength) {
  const chars = [];
  for (const char of String(value || "")) {
    if (chars.length >= maxLength) break;
    chars.push(/\s/.test(char) || char.charCodeAt(0) < 32 ? "_" : char);
  }
  return chars.join("").replace(/^_+|_+$/g, "");
}

function safeFileStem(value) {
  return safeString(value)
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "deck";
}

function uniqueNumbers(values = []) {
  return [...new Set(values.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(String(file)), "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(file, payload) {
  const out = path.resolve(String(file));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function main() {
  try {
    const args = parseArgs(process.argv);
    const manifest = buildComponentIrReplacementApplyPlans(args);
    console.log(JSON.stringify({
      status: manifest.status,
      ...manifest.summary,
      manifestFile: manifest.manifestFile
    }, null, 2));
    if (manifest.status !== "ready") process.exitCode = 1;
  } catch (error) {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  buildComponentIrReplacementApplyPlans,
  buildDeckApplyPlan,
  compareVersionNames,
  discoverOfficePlusTemplatePaths,
  groupReadyOperationsByDeck,
  parseArgs,
  resolveDeckPptx,
  resolveSampleFile,
  sanitizeRecommendedGroup,
  sanitizeMetadataValue,
  toApplyOperation
};
