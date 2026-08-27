#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const skillRoot = path.resolve(__dirname, "..");
const {
  applyRoleFontOption,
  describeRoleOption,
  getRoleFitPlan,
  normalizeFontTargetRole
} = require(path.join(skillRoot, "scripts", "lib", "font-fit"));
const {
  applyTextBoxMicroAdjustments,
  applyTextBoxEvidenceFit,
  applyTextBoxSuggestionSet
} = require(path.join(skillRoot, "scripts", "lib", "text-box-micro-adjust"));
const { readPng, cropPng } = require(path.join(skillRoot, "scripts", "lib", "png"));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ir) throw new Error("--ir is required");
  const fixtureFile = path.resolve(args.ir);
  const fixtureDir = path.dirname(fixtureFile);
  const outputDir = path.resolve(args.out || path.join(process.cwd(), "runs", `${path.basename(fixtureFile, path.extname(fixtureFile))}-delivery-smoke`));

  ensureDir(path.join(outputDir, "pptx"));
  ensureDir(path.join(outputDir, "render"));
  ensureDir(path.join(outputDir, "diff"));
  ensureDir(path.join(outputDir, "compare"));
  ensureDir(path.join(outputDir, "reports"));

  const ir = resolveIrPaths(readJson(fixtureFile), fixtureDir);
  const pptx = require(path.join(skillRoot, "scripts", "adapters", "pptx-python-pptx.js"));
  const render = resolveRenderAdapter(args.renderer || args.render, skillRoot);
  const diff = require(path.join(skillRoot, "scripts", "adapters", "diff-pixel-png.js"));
  const compare = require(path.join(skillRoot, "scripts", "adapters", "compare-placeholder.js"));

  const context = {
    skillRoot,
    outputDir,
    configFile: fixtureFile,
    config: {
      diff: {
        foregroundTolerancePx: Number(args.foregroundTolerancePx || 2),
        foregroundToleranceDelta: Number(args.foregroundToleranceDelta || 54)
      },
      thresholds: {
        pixelDiffRatio: Number(args.pixelDiffRatioThreshold || 0.08),
        foregroundMissingRatio: Number(args.foregroundMissingRatioThreshold || 0.12),
        layoutMeanIoU: Number(args.layoutMeanIoUThreshold || 0.86),
        textCoverage: Number(args.textCoverageThreshold || 0.95),
        maxCriticalOffsetPt: Number(args.maxCriticalOffsetPtThreshold || 8),
        maxOutOfBoundsPt: Number(args.maxOutOfBoundsPtThreshold || 1),
        maxImageAspectRatioDelta: Number(args.maxImageAspectRatioDeltaThreshold || 0.03),
        maxRasterImageAreaRatio: Number(args.maxRasterImageAreaRatioThreshold || 0.25)
      },
      powerPoint: {
        cleanupHidden: args.cleanupHidden !== "false"
      },
      adapters: {
        ocr: args.ocr || "scripts/adapters/ocr-paddleocr-local.js"
      },
      searchTextOcr: args["search-text-ocr"] === "true",
      textOcr: {
        enabled: true,
        adapter: args.ocr || "scripts/adapters/ocr-paddleocr-local.js",
        mode: "anchored",
        paddingPt: Number(args.paddingPt || 16),
        upscale: Number(args.upscale || 1),
        psm: Number(args.psm || 6),
        preprocess: args.preprocess === "true"
      },
      umiOcr: {
        paddleBin: args.umiBin || "C:/Program Files/Umi-OCR_Paddle_v2.1.5/UmiOCR-data/plugins/win7_x64_PaddleOCR-json/PaddleOCR-json.exe",
        initTimeoutMs: Number(args.umiInitTimeoutMs || 60000)
      },
      tesseract: {
        bin: args.tesseractBin || "tesseract",
        lang: args.tesseractLang || "chi_sim+eng",
        tessdataPrefix: args.tessdataPrefix || "./tools/tessdata",
        psm: Number(args.psm || 6)
      },
      fontFit: {
        enabled: args["font-fit"] === "true",
        mode: "role-greedy",
        localScoring: args["font-fit-local-scoring"] !== "false",
        candidates: parseCsv(args["font-candidates"]) || ["Arial", "Segoe UI", "Microsoft YaHei", "Aptos", "Calibri", "SimHei"],
        onlyRoles: parseCsv(args["font-fit-only-roles"]) || null,
        maxTrialsPerRole: Number(args["font-fit-max-trials-per-role"] || 0),
        roleOrder: parseCsv(args["font-fit-role-order"]) || ["title", "table", "caption", "body"],
        roleCandidates: {
          title: { sizeAdjustPt: [1, 0.5, 0, -0.5, -1], weights: ["bold", "regular"] },
          table: { sizeAdjustPt: [0.5, 0, -0.5, -1], weights: ["regular"] },
          caption: { sizeAdjustPt: [0.5, 0, -0.5], weights: ["regular", "bold"] },
          body: { sizeAdjustPt: [0.5, 0, -0.5], weights: ["regular", "bold"] }
        }
      },
      tableStyleFit: {
        enabled: args["table-style-fit"] === "true",
        onlyIds: parseCsv(args["table-style-fit-only-ids"]) || null,
        strokeWidthOffsetsPt: parseNumberCsv(args["table-style-fit-stroke-width-offsets-pt"]) || [-0.15, -0.1, -0.05, 0],
        textLighten: parseNumberCsv(args["table-style-fit-text-lighten"]) || [0, 0.08, 0.14],
        borderLighten: parseNumberCsv(args["table-style-fit-border-lighten"]) || [0, 0.08, 0.14],
        maxTrialsPerTable: Number(args["table-style-fit-max-trials-per-table"] || 0)
      },
      textMicroAdjust: {
        enabled: args["text-micro-adjust"] === "true",
        minCoverage: Number(args["text-micro-adjust-min-coverage"] || 0.995),
        paddingPt: Number(args["text-micro-adjust-padding-pt"] || args.paddingPt || 16),
        maxMovePt: Number(args["text-micro-adjust-max-move-pt"] || 3),
        maxHeightAdjustPt: Number(args["text-micro-adjust-max-height-adjust-pt"] || 2.5),
        maxWidthAdjustPt: Number(args["text-micro-adjust-max-width-adjust-pt"] || 3),
        minDeltaPt: Number(args["text-micro-adjust-min-delta-pt"] || 0.15),
        inspectAligned: args["text-micro-adjust-inspect-aligned"] === "true",
        maxLayoutRegression: Number(args["text-micro-adjust-max-layout-regression"] || 0.08),
        maxCriticalOffsetIncreasePt: Number(args["text-micro-adjust-max-critical-offset-increase-pt"] || 6),
        layoutPenaltyWeight: Number(args["text-micro-adjust-layout-penalty-weight"] || 0.35),
        criticalPenaltyWeight: Number(args["text-micro-adjust-critical-penalty-weight"] || 0.002)
      }
    }
  };

  const baseline = await evaluateIrVariant({
    fixtureFile,
    ir,
    label: "baseline",
    outputDir,
    context,
    adapters: { pptx, render, diff, compare },
    iteration: 0
  });
  let best = baseline;
  let fontFitSummary = null;
  let tableStyleFitSummary = null;
  let textMicroAdjustSummary = null;

  if (context.config.fontFit.enabled === true) {
    const fitResult = await optimizeIrFontsByRole({
      fixtureFile,
      ir,
      baseline,
      context,
      outputDir,
      adapters: { pptx, render, diff, compare }
    });
    best = fitResult.best || baseline;
    fontFitSummary = fitResult.summary;
  }

  if (context.config.tableStyleFit.enabled === true) {
    const tableStyleFitResult = await optimizeTableStyles({
      fixtureFile,
      baseline: best,
      context,
      outputDir,
      adapters: { pptx, render, diff, compare }
    });
    best = tableStyleFitResult.best || best;
    tableStyleFitSummary = tableStyleFitResult.summary;
  }

  if (context.config.textMicroAdjust.enabled === true) {
    best = await ensureFullTextOcrVariant({
      variant: best,
      labelSuffix: "text-ocr",
      fixtureFile,
      outputDir,
      context,
      adapters: { pptx, render, diff, compare }
    });
  }

  if (context.config.textMicroAdjust.enabled === true) {
    const textAdjustResult = await optimizeIrTextBoxes({
      fixtureFile,
      baseline: best,
      context,
      outputDir,
      adapters: { pptx, render, diff, compare }
    });
    best = textAdjustResult.best || best;
    textMicroAdjustSummary = textAdjustResult.summary;
  }

  best = await ensureFullTextOcrVariant({
    variant: best,
    labelSuffix: "final",
    fixtureFile,
    outputDir,
    context,
    adapters: { pptx, render, diff, compare }
  });

  const report = {
    provider: "ir-delivery-smoke",
    fixtureFile,
    outputDir,
    pptx: best.pptx.data,
    render: best.render.data,
    diff: best.diff.data,
    compare: best.compare.data,
    baseline: summarizeVariant(baseline),
    fontFit: fontFitSummary,
    tableStyleFit: tableStyleFitSummary,
    textMicroAdjust: textMicroAdjustSummary,
    generatedAt: new Date().toISOString()
  };
  const reportFile = path.join(outputDir, "reports", "ir-delivery-smoke.report.json");
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const summary = {
    fixtureFile,
    passed: best.compare.data?.passed === true,
    metrics: best.compare.data?.summary || {},
    editableObjects: best.compare.data?.editability?.editableObjects ?? null,
    nonEditableObjects: best.compare.data?.editability?.nonEditableObjects ?? null,
    fontFit: fontFitSummary,
    tableStyleFit: tableStyleFitSummary,
    textMicroAdjust: textMicroAdjustSummary,
    reportFile
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function assertOk(stage, result) {
  if (!result || result.ok !== true) {
    throw new Error(`${stage} failed: ${result?.error || result?.message || "adapter returned non-ok result"}`);
  }
  return result;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function resolveIrPaths(ir, baseDir) {
  const next = JSON.parse(JSON.stringify(ir));
  for (const page of next.pages || []) {
    if (page.sourceImage) page.sourceImage = resolveMaybeRelative(baseDir, page.sourceImage);
    for (const group of ["textBoxes", "shapes", "images", "tables", "charts", "icons"]) {
      for (const item of page[group] || []) {
        if (item.assetPath) item.assetPath = resolveMaybeRelative(baseDir, item.assetPath);
        if (item.source?.pageImage) item.source.pageImage = resolveMaybeRelative(baseDir, item.source.pageImage);
        if (item.source?.cropImage) item.source.cropImage = resolveMaybeRelative(baseDir, item.source.cropImage);
      }
    }
  }
  return next;
}

function resolveMaybeRelative(baseDir, value) {
  return path.isAbsolute(value) ? value : path.resolve(baseDir, value);
}

async function optimizeIrFontsByRole({ fixtureFile, ir, baseline, context, outputDir, adapters }) {
  const plan = getRoleFitPlan(ir, context.config.fontFit || {});
  const searchContext = contextForSearch(context);
  const summary = {
    provider: "ir-delivery-smoke-font-fit",
    enabled: true,
    mode: "role-greedy",
    baseline: summarizeVariant(baseline),
    selected: null,
    changed: false,
    roles: plan,
    roleTrials: []
  };
  if (plan.length === 0) {
    summary.skipped = true;
    summary.reason = "No font roles available for IR font fit.";
    return { best: baseline, summary };
  }

  let current = baseline;
  for (const rolePlan of plan) {
    const baselineRoleScore = roleScopedScore(current, rolePlan.role);
    const roleResult = {
      role: rolePlan.role,
      count: rolePlan.count,
      baselineScore: current.score,
      baselineRoleScore,
      selected: null,
      improved: false,
      trials: []
    };
    let bestForRole = current;
    let bestRoleScore = baselineRoleScore;
    for (const family of rolePlan.families) {
      for (const weight of rolePlan.weights) {
        for (const sizeAdjustPt of rolePlan.sizeAdjustPt) {
          if (context.config.fontFit.maxTrialsPerRole > 0 && roleResult.trials.length >= context.config.fontFit.maxTrialsPerRole) break;
          const option = { family, weight, sizeAdjustPt };
          const applied = applyRoleFontOption(current.ir, rolePlan.role, option);
          if (!applied.changed) continue;
          const label = `fontfit-${sanitizeName(rolePlan.role)}-${roleResult.trials.length + 1}`;
          const variant = await evaluateIrVariant({
            fixtureFile: path.join(outputDir, "ir", `${label}.json`),
            ir: applied.ir,
            label,
            outputDir,
            context: searchContext,
            adapters,
            iteration: roleResult.trials.length + 1
          });
          const trial = {
            role: rolePlan.role,
            option,
            label: describeRoleOption(rolePlan.role, option),
            score: variant.score,
            roleScore: roleScopedScore(variant, rolePlan.role),
            metrics: variant.compare.data?.summary || {}
          };
          roleResult.trials.push(trial);
          if (shouldAcceptRoleTrial(trial, { bestRoleScore, bestVariant: bestForRole, localScoring: context.config.fontFit?.localScoring !== false })) {
            bestForRole = variant;
            bestRoleScore = trial.roleScore;
            roleResult.selected = trial;
            roleResult.improved = true;
          }
        }
        if (context.config.fontFit.maxTrialsPerRole > 0 && roleResult.trials.length >= context.config.fontFit.maxTrialsPerRole) break;
      }
      if (context.config.fontFit.maxTrialsPerRole > 0 && roleResult.trials.length >= context.config.fontFit.maxTrialsPerRole) break;
    }
    summary.roleTrials.push(roleResult);
    current = bestForRole;
  }

  summary.selected = summarizeVariant(current);
  summary.changed = current.label !== baseline.label;
  return { best: current, summary };
}

async function optimizeIrTextBoxes({ fixtureFile, baseline, context, outputDir, adapters }) {
  const config = context.config.textMicroAdjust || {};
  // OCR identifies candidates on the baseline. Candidate selection is visual-only,
  // then the winning variant gets one final OCR pass before it can be delivered.
  const searchContext = contextForSearch(context);
  const adjusted = applyTextBoxMicroAdjustments(baseline.ir, baseline.compare?.data?.textCoverage, {
    enabled: true,
    paddingPt: config.paddingPt,
    minCoverage: config.minCoverage,
    maxMovePt: config.maxMovePt,
    maxHeightAdjustPt: config.maxHeightAdjustPt,
    maxWidthAdjustPt: config.maxWidthAdjustPt,
    minDeltaPt: config.minDeltaPt,
    inspectAligned: config.inspectAligned === true
  });
  const evidenceFit = applyTextBoxEvidenceFit(baseline.ir, baseline.compare?.data?.textCoverage, {
    paddingPt: config.evidencePaddingPt ?? 1,
    minDeltaPt: config.minDeltaPt
  });
  const summary = {
    provider: "ir-delivery-smoke-text-micro-adjust",
    enabled: true,
    baseline: summarizeVariant(baseline),
    selected: summarizeVariant(baseline),
    changed: false,
    inspectAligned: config.inspectAligned === true,
    suggestionCount: adjusted.changes.length + evidenceFit.changes.length,
    candidateTrials: [],
    suggestionsByPage: (adjusted.perPage || []).map((page) => ({
      pageIndex: page.pageIndex,
      suggestionCount: (page.suggestions || []).length,
      changeCount: (page.changes || []).length
    }))
  };
  if (!adjusted.changed && !evidenceFit.changed) {
    summary.skipped = true;
    summary.reason = "No text-box micro adjustments were suggested for the current OCR crops.";
    return { best: baseline, summary };
  }

  const candidatePlans = [
    { id: "text-micro-adjust", moveScale: 1, fontScale: 1, heightScale: 1, widthScale: 1, lineHeightScale: 1, valignEnabled: true },
    { id: "text-micro-adjust-balanced", moveScale: 0.75, fontScale: 0.75, heightScale: 0.5, widthScale: 0.5, lineHeightScale: 0.5, valignEnabled: true },
    { id: "text-micro-adjust-soft", moveScale: 0.5, fontScale: 0.5, heightScale: 0.5, widthScale: 0.5, lineHeightScale: 0.5, valignEnabled: false },
    { id: "text-micro-adjust-font-only", moveScale: 0, fontScale: 1, heightScale: 0, widthScale: 0, lineHeightScale: 1, valignEnabled: false },
    { id: "text-micro-adjust-move-only", moveScale: 1, fontScale: 0, heightScale: 0, widthScale: 0, lineHeightScale: 0, valignEnabled: false },
    { id: "text-evidence-box-fit", directAdjust: evidenceFit }
  ];
  let bestVariant = baseline;
  let bestSelectionScore = scoreTextAdjustVariant(baseline, baseline, config);

  for (const [index, plan] of candidatePlans.entries()) {
    const candidateAdjust = plan.directAdjust || applyTextBoxSuggestionSet(baseline.ir, adjusted.perPage, {
      moveScale: plan.moveScale,
      fontScale: plan.fontScale,
      heightScale: plan.heightScale,
      widthScale: plan.widthScale,
      lineHeightScale: plan.lineHeightScale,
      valignEnabled: plan.valignEnabled,
      minDeltaPt: config.minDeltaPt
    });
    if (!candidateAdjust.changed) continue;
    const variant = await evaluateIrVariant({
            fixtureFile: path.join(outputDir, "ir", `${plan.id}.json`),
            ir: candidateAdjust.ir,
            label: plan.id,
            outputDir,
            context: searchContext,
            adapters,
      iteration: (baseline.compare?.data?.iteration ? baseline.compare.data.iteration + 1 : 1) + index
    });
    const guardrails = evaluateTextAdjustGuardrails(variant, baseline, context, config);
    const selectionScore = scoreTextAdjustVariant(variant, baseline, config);
    const trial = {
      id: plan.id,
      moveScale: plan.moveScale,
      fontScale: plan.fontScale,
      heightScale: plan.heightScale,
      widthScale: plan.widthScale,
      lineHeightScale: plan.lineHeightScale,
      valignEnabled: plan.valignEnabled,
      strategy: plan.directAdjust ? "evidence-box-fit" : "ocr-ink-adjust",
      score: variant.score,
      selectionScore,
      acceptable: guardrails.ok,
      guardrails,
      metrics: variant.compare.data?.summary || {}
    };
    summary.candidateTrials.push(trial);
    if (!guardrails.ok) continue;
    if (selectionScore < bestSelectionScore) {
      bestSelectionScore = selectionScore;
      bestVariant = variant;
    }
  }

  summary.selected = summarizeVariant(bestVariant);
  summary.selectionScore = Number.isFinite(bestSelectionScore) ? round(bestSelectionScore) : null;
  summary.changed = bestVariant.label !== baseline.label;
  summary.accepted = summary.changed;
  if (summary.changed && context.config?.textOcr?.enabled === true) {
    const ocrVerified = await evaluateIrVariant({
      fixtureFile: path.join(outputDir, "ir", `${bestVariant.label}-ocr-verified.json`),
      ir: bestVariant.ir,
      label: `${bestVariant.label}-ocr-verified`,
      outputDir,
      context,
      adapters,
      iteration: nextIteration(bestVariant)
    });
    const ocrGuardrails = evaluateTextAdjustGuardrails(ocrVerified, baseline, context, config);
    summary.ocrVerification = {
      selected: summarizeVariant(ocrVerified),
      guardrails: ocrGuardrails
    };
    if (!ocrGuardrails.ok) {
      bestVariant = baseline;
      summary.selected = summarizeVariant(baseline);
      summary.changed = false;
      summary.accepted = false;
      summary.reverted = true;
      summary.reason = "Winning visual candidate regressed final OCR or layout guardrails and was reverted.";
    } else {
      bestVariant = ocrVerified;
      summary.selected = summarizeVariant(bestVariant);
    }
  }
  if (!summary.changed) {
    if (summary.reverted) return { best: baseline, summary };
    summary.reverted = true;
    summary.reason = summary.candidateTrials.some((trial) => trial.acceptable)
      ? "Text-box micro adjustments did not improve the constrained delivery score."
      : "Text-box micro adjustments violated layout guardrails for every candidate.";
    return { best: baseline, summary };
  }
  return { best: bestVariant, summary };
}

async function optimizeTableStyles({ fixtureFile, baseline, context, outputDir, adapters }) {
  const config = context.config.tableStyleFit || {};
  const searchContext = contextForSearch(context);
  const plan = collectTableStylePlan(baseline.ir, config);
  const summary = {
    provider: "ir-delivery-smoke-table-style-fit",
    enabled: true,
    baseline: summarizeVariant(baseline),
    selected: summarizeVariant(baseline),
    changed: false,
    tables: plan,
    tableTrials: []
  };
  if (plan.length === 0) {
    summary.skipped = true;
    summary.reason = "No editable tables available for style fit.";
    return { best: baseline, summary };
  }

  let current = baseline;
  for (const tablePlan of plan) {
    const baselineTableScore = tableScopedScore(current, tablePlan.tableId);
    const tableResult = {
      tableId: tablePlan.tableId,
      pageIndex: tablePlan.pageIndex,
      baselineScore: current.score,
      baselineTableScore,
      selected: null,
      improved: false,
      trials: []
    };
    let bestForTable = current;
    let bestTableScore = baselineTableScore;
    for (const strokeWidthPt of tablePlan.strokeWidthPt) {
      for (const textLighten of tablePlan.textLighten) {
        for (const borderLighten of tablePlan.borderLighten) {
          if (config.maxTrialsPerTable > 0 && tableResult.trials.length >= config.maxTrialsPerTable) break;
          const option = { strokeWidthPt, textLighten, borderLighten };
          const applied = applyTableStyleOption(current.ir, tablePlan.tableId, option);
          if (!applied.changed) continue;
          const label = `tablefit-${sanitizeName(tablePlan.tableId)}-${tableResult.trials.length + 1}`;
          const variant = await evaluateIrVariant({
            fixtureFile: path.join(outputDir, "ir", `${label}.json`),
            ir: applied.ir,
            label,
            outputDir,
            context: searchContext,
            adapters,
            iteration: tableResult.trials.length + 1
          });
          const trial = {
            tableId: tablePlan.tableId,
            option,
            label,
            score: variant.score,
            tableScore: tableScopedScore(variant, tablePlan.tableId),
            metrics: variant.compare.data?.summary || {}
          };
          tableResult.trials.push(trial);
          if (trial.tableScore < bestTableScore - 1e-6 || (Math.abs(trial.tableScore - bestTableScore) <= 1e-6 && trial.score < bestForTable.score - 1e-6)) {
            bestForTable = variant;
            bestTableScore = trial.tableScore;
            tableResult.selected = trial;
            tableResult.improved = true;
          }
        }
        if (config.maxTrialsPerTable > 0 && tableResult.trials.length >= config.maxTrialsPerTable) break;
      }
      if (config.maxTrialsPerTable > 0 && tableResult.trials.length >= config.maxTrialsPerTable) break;
    }
    summary.tableTrials.push(tableResult);
    current = bestForTable;
  }

  summary.selected = summarizeVariant(current);
  summary.changed = current.label !== baseline.label;
  return { best: current, summary };
}

async function evaluateIrVariant({ fixtureFile, ir, label, outputDir, context, adapters, iteration }) {
  const irFile = path.extname(fixtureFile).toLowerCase() === ".json" && fs.existsSync(fixtureFile)
    ? fixtureFile
    : path.join(outputDir, "ir", `${label}.json`);
  if (!fs.existsSync(irFile) || irFile.endsWith(`${label}.json`)) {
    ensureDir(path.dirname(irFile));
    fs.writeFileSync(irFile, `${JSON.stringify(ir, null, 2)}\n`, "utf8");
  }
  const pptxResult = assertOk("pptx", await adapters.pptx({
    irFile,
    ir,
    iteration
  }, context));
  const renderResult = assertOk("render", await adapters.render({
    irFile,
    ir,
    pptx: pptxResult.data,
    iteration
  }, context));
  const diffResult = assertOk("diff", await adapters.diff({
    irFile,
    ir,
    render: renderResult.data,
    iteration
  }, context));
  const compareResult = assertOk("compare", await adapters.compare({
    irFile,
    ir,
    render: renderResult.data,
    diff: diffResult.data,
    thresholds: context.config.thresholds,
    iteration
  }, context));
  return {
    label,
    ir,
    irFile,
    pptx: pptxResult,
    render: renderResult,
    diff: diffResult,
    compare: compareResult,
    score: scoreSummary(diffResult.data?.summary || {})
  };
}

async function ensureFullTextOcrVariant({ variant, labelSuffix, fixtureFile, outputDir, context, adapters }) {
  if (!needsTextOcrRefresh(variant, context)) return variant;
  const label = `${variant.label}-${labelSuffix}`;
  return evaluateIrVariant({
    fixtureFile: path.join(outputDir, "ir", `${label}.json`),
    ir: variant.ir,
    label,
    outputDir,
    context,
    adapters,
    iteration: nextIteration(variant)
  });
}

function needsTextOcrRefresh(variant, context) {
  if (context.config?.textOcr?.enabled !== true) return false;
  return typeof variant.compare?.data?.summary?.textCoverage !== "number";
}

function contextForSearch(context) {
  if (context.config?.searchTextOcr === true) return context;
  return {
    ...context,
    config: {
      ...context.config,
      textOcr: {
        ...(context.config?.textOcr || {}),
        enabled: false
      }
    }
  };
}

function nextIteration(variant) {
  const current = Number(variant.compare?.data?.iteration);
  return Number.isFinite(current) ? current + 1 : 1;
}

function summarizeVariant(variant) {
  return {
    label: variant.label,
    score: variant.score,
    metrics: variant.compare?.data?.summary || {}
  };
}

function scoreSummary(summary = {}) {
  const pixel = typeof summary.pixelDiffRatio === "number" ? summary.pixelDiffRatio : 1;
  const foreground = typeof summary.foregroundMissingRatio === "number" ? summary.foregroundMissingRatio : 1;
  const raw = typeof summary.foregroundMissingRatioRaw === "number" ? summary.foregroundMissingRatioRaw : foreground;
  return Math.round((pixel + foreground * 0.8 + raw * 0.25) * 1000000) / 1000000;
}

function roleScopedScore(variant, role) {
  const pageImages = new Map((variant.render?.data?.renderedPages || []).map((page) => [page.pageIndex, page.image]));
  const roleBoxes = collectRoleBoxes(variant.ir, role);
  if (roleBoxes.length === 0) return Number.POSITIVE_INFINITY;
  let totalArea = 0;
  let totalScore = 0;
  for (const item of roleBoxes) {
    const renderedImage = pageImages.get(item.pageIndex);
    const sourceImage = item.sourceImage;
    if (!renderedImage || !sourceImage) continue;
    try {
      const metrics = compareLocalBox(sourceImage, renderedImage, item.box);
      const area = Math.max(1, item.box.w * item.box.h);
      totalArea += area;
      totalScore += scoreSummary(metrics) * area;
    } catch {
      // Fall through and let remaining boxes contribute.
    }
  }
  if (totalArea === 0) return variant.score;
  return round(totalScore / totalArea);
}

function tableScopedScore(variant, tableId) {
  const table = findTableById(variant.ir, tableId);
  if (!table) return variant.score;
  const renderedPage = (variant.render?.data?.renderedPages || []).find((page) => page.pageIndex === table.pageIndex);
  if (!renderedPage || !table.sourceImage) return variant.score;
  try {
    const metrics = compareLocalBox(table.sourceImage, renderedPage.image, expandBox(table.box, 6));
    return round(scoreSummary(metrics));
  } catch {
    return variant.score;
  }
}

function collectRoleBoxes(ir, role) {
  const boxes = [];
  const targetRole = String(role || "").trim().toLowerCase();
  for (const page of ir.pages || []) {
    for (const textBox of page.textBoxes || []) {
      if (normalizeFontTargetRole(textBox, "text") !== targetRole) continue;
      const evidenceBox = textBox.source?.evidenceBox || textBox.box;
      if (!isFiniteBox(evidenceBox)) continue;
      boxes.push({
        pageIndex: page.pageIndex,
        sourceImage: page.sourceImage,
        box: expandBox(evidenceBox, 6)
      });
    }
    for (const table of page.tables || []) {
      if (normalizeFontTargetRole(table, "table") !== targetRole) continue;
      const evidenceBox = table.source?.evidenceBox || table.box;
      if (!isFiniteBox(evidenceBox)) continue;
      boxes.push({
        pageIndex: page.pageIndex,
        sourceImage: page.sourceImage,
        box: expandBox(evidenceBox, 6)
      });
    }
  }
  return boxes;
}

function collectTableStylePlan(ir, config = {}) {
  const plans = [];
  const onlyIds = Array.isArray(config.onlyIds)
    ? new Set(config.onlyIds.map((value) => String(value || "").trim()).filter(Boolean))
    : null;
  for (const page of ir.pages || []) {
    for (const table of page.tables || []) {
      if (onlyIds && !onlyIds.has(table.id)) continue;
      const style = table.style || {};
      plans.push({
        tableId: table.id,
        pageIndex: page.pageIndex,
        strokeWidthPt: uniqueRoundedNumbers((config.strokeWidthOffsetsPt || []).map((offset) => round((style.strokeWidthPt ?? 0.35) + offset)).filter((value) => value > 0.05)),
        textLighten: uniqueRoundedNumbers(config.textLighten || [0]),
        borderLighten: uniqueRoundedNumbers(config.borderLighten || [0])
      });
    }
  }
  return plans;
}

function applyTableStyleOption(ir, tableId, option = {}) {
  const next = JSON.parse(JSON.stringify(ir));
  let changed = false;
  for (const page of next.pages || []) {
    for (const table of page.tables || []) {
      if (table.id !== tableId) continue;
      table.style = table.style || {};
      if (typeof option.strokeWidthPt === "number" && table.style.strokeWidthPt !== option.strokeWidthPt) {
        table.style.strokeWidthPt = option.strokeWidthPt;
        changed = true;
      }
      if (typeof option.textLighten === "number") {
        const nextText = lightenHex(table.style.textColor || "#222222", option.textLighten);
        const nextHeaderText = lightenHex(table.style.headerTextColor || table.style.textColor || "#222222", option.textLighten);
        if (table.style.textColor !== nextText) {
          table.style.textColor = nextText;
          changed = true;
        }
        if (table.style.headerTextColor !== nextHeaderText) {
          table.style.headerTextColor = nextHeaderText;
          changed = true;
        }
      }
      if (typeof option.borderLighten === "number") {
        const nextStroke = lightenHex(table.style.stroke || "#D0D7DE", option.borderLighten);
        if (table.style.stroke !== nextStroke) {
          table.style.stroke = nextStroke;
          changed = true;
        }
      }
    }
  }
  return { ir: next, changed };
}

function findTableById(ir, tableId) {
  for (const page of ir.pages || []) {
    for (const table of page.tables || []) {
      if (table.id !== tableId) continue;
      return {
        tableId,
        pageIndex: page.pageIndex,
        sourceImage: page.sourceImage,
        box: table.source?.evidenceBox || table.box
      };
    }
  }
  return null;
}

function compareLocalBox(sourceFile, renderedFile, box) {
  const source = cropPng(readCachedPng(sourceFile), box);
  const rendered = cropPng(readCachedPng(renderedFile), box);
  const threshold = Number(process.env.SLIDECLONE_PIXEL_THRESHOLD || "24");
  const foregroundTolerancePx = 2;
  const foregroundToleranceDelta = 54;
  return compareLocalImages(source, rendered, { threshold, foregroundTolerancePx, foregroundToleranceDelta });
}

function compareLocalImages(source, generated, options) {
  let changed = 0;
  let totalDelta = 0;
  let foreground = 0;
  let foregroundMissing = 0;
  let foregroundMissingRaw = 0;
  const total = source.width * source.height;
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const srcOffset = (y * source.width + x) * 4;
      const genOffset = (y * generated.width + x) * 4;
      const delta = Math.abs(source.rgba[srcOffset] - generated.rgba[genOffset])
        + Math.abs(source.rgba[srcOffset + 1] - generated.rgba[genOffset + 1])
        + Math.abs(source.rgba[srcOffset + 2] - generated.rgba[genOffset + 2])
        + Math.abs(source.rgba[srcOffset + 3] - generated.rgba[genOffset + 3]);
      totalDelta += delta / 4;
      const sourceForeground = isForegroundPixel(source.rgba, srcOffset);
      const isChanged = delta / 4 > options.threshold;
      if (sourceForeground) foreground += 1;
      if (isChanged) changed += 1;
      if (sourceForeground && isChanged) {
        foregroundMissingRaw += 1;
        if (!hasNearbyForegroundMatch(source, srcOffset, generated, x, y, options)) {
          foregroundMissing += 1;
        }
      }
    }
  }
  return {
    pixelDiffRatio: total ? changed / total : 1,
    foregroundMissingRatio: foreground ? foregroundMissing / foreground : 1,
    foregroundMissingRatioRaw: foreground ? foregroundMissingRaw / foreground : 1,
    meanAbsoluteDelta: total ? totalDelta / total : 255
  };
}

function hasNearbyForegroundMatch(source, srcOffset, generated, gx, gy, options) {
  const radius = Math.max(0, Math.floor(options.foregroundTolerancePx || 0));
  const maxDelta = options.foregroundToleranceDelta;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const nx = gx + dx;
      const ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= generated.width || ny >= generated.height) continue;
      const genOffset = (ny * generated.width + nx) * 4;
      if (!isForegroundPixel(generated.rgba, genOffset)) continue;
      const delta = Math.abs(source.rgba[srcOffset] - generated.rgba[genOffset])
        + Math.abs(source.rgba[srcOffset + 1] - generated.rgba[genOffset + 1])
        + Math.abs(source.rgba[srcOffset + 2] - generated.rgba[genOffset + 2])
        + Math.abs(source.rgba[srcOffset + 3] - generated.rgba[genOffset + 3]);
      if (delta / 4 <= maxDelta) return true;
    }
  }
  return false;
}

function isForegroundPixel(rgba, offset) {
  const r = rgba[offset];
  const g = rgba[offset + 1];
  const b = rgba[offset + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = (r + g + b) / 3;
  return brightness < 245 || max - min > 18;
}

function shouldAcceptRoleTrial(trial, state) {
  if (state.localScoring) {
    if (trial.roleScore < state.bestRoleScore - 1e-6) return true;
    if (Math.abs(trial.roleScore - state.bestRoleScore) <= 1e-6 && trial.score < state.bestVariant.score - 1e-6) return true;
    return false;
  }
  return trial.score < state.bestVariant.score - 1e-6;
}

const pngCache = new Map();

function readCachedPng(file) {
  const key = path.resolve(file);
  if (!pngCache.has(key)) pngCache.set(key, readPng(key));
  return pngCache.get(key);
}

function isFiniteBox(box) {
  return box
    && Number.isFinite(box.x)
    && Number.isFinite(box.y)
    && Number.isFinite(box.w)
    && Number.isFinite(box.h);
}

function expandBox(box, padding) {
  return {
    x: Math.max(0, box.x - padding),
    y: Math.max(0, box.y - padding),
    w: Math.max(1, box.w + padding * 2),
    h: Math.max(1, box.h + padding * 2)
  };
}

function scoreTextAdjustVariant(variant, baseline, config = {}) {
  const baseMetrics = baseline.compare?.data?.summary || {};
  const metrics = variant.compare?.data?.summary || {};
  const layoutPenaltyWeight = Number(config.layoutPenaltyWeight ?? 0.35);
  const criticalPenaltyWeight = Number(config.criticalPenaltyWeight ?? 0.002);
  const layoutPenalty = typeof baseMetrics.layoutMeanIoU === "number" && typeof metrics.layoutMeanIoU === "number"
    ? Math.max(0, baseMetrics.layoutMeanIoU - metrics.layoutMeanIoU) * layoutPenaltyWeight
    : 0;
  const criticalPenalty = typeof metrics.maxCriticalOffsetPt === "number"
    ? metrics.maxCriticalOffsetPt * criticalPenaltyWeight
    : 0;
  return scoreSummary(metrics) + layoutPenalty + criticalPenalty;
}

function evaluateTextAdjustGuardrails(variant, baseline, context, config = {}) {
  const baselineMetrics = baseline.compare?.data?.summary || {};
  const metrics = variant.compare?.data?.summary || {};
  const thresholds = context.config?.thresholds || {};
  const checks = [];
  const maxLayoutRegression = Number(config.maxLayoutRegression ?? 0.08);
  const maxCriticalOffsetIncreasePt = Number(config.maxCriticalOffsetIncreasePt ?? 6);
  const minLayout = maxDefined(
    typeof thresholds.layoutMeanIoU === "number" ? thresholds.layoutMeanIoU : null,
    typeof baselineMetrics.layoutMeanIoU === "number" ? baselineMetrics.layoutMeanIoU - maxLayoutRegression : null
  );
  const maxCritical = minDefined(
    typeof thresholds.maxCriticalOffsetPt === "number" ? thresholds.maxCriticalOffsetPt : null,
    typeof baselineMetrics.maxCriticalOffsetPt === "number" ? baselineMetrics.maxCriticalOffsetPt + maxCriticalOffsetIncreasePt : null
  );
  const minTextCoverage = typeof baselineMetrics.textCoverage === "number" ? baselineMetrics.textCoverage : null;

  if (minTextCoverage !== null && typeof metrics.textCoverage === "number") {
    checks.push({
      metric: "textCoverage",
      ok: metrics.textCoverage + 1e-6 >= minTextCoverage,
      actual: metrics.textCoverage,
      limit: minTextCoverage
    });
  }
  if (minLayout !== null && typeof metrics.layoutMeanIoU === "number") {
    checks.push({
      metric: "layoutMeanIoU",
      ok: metrics.layoutMeanIoU + 1e-6 >= minLayout,
      actual: metrics.layoutMeanIoU,
      limit: minLayout
    });
  }
  if (maxCritical !== null && typeof metrics.maxCriticalOffsetPt === "number") {
    checks.push({
      metric: "maxCriticalOffsetPt",
      ok: metrics.maxCriticalOffsetPt <= maxCritical + 1e-6,
      actual: metrics.maxCriticalOffsetPt,
      limit: maxCritical
    });
  }
  return {
    ok: checks.every((check) => check.ok),
    checks
  };
}

function maxDefined(...values) {
  const filtered = values.filter((value) => Number.isFinite(value));
  return filtered.length ? Math.max(...filtered) : null;
}

function minDefined(...values) {
  const filtered = values.filter((value) => Number.isFinite(value));
  return filtered.length ? Math.min(...filtered) : null;
}

function uniqueRoundedNumbers(values) {
  return [...new Set((values || [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .map((value) => round(value)))];
}

function parseCsv(value) {
  if (!value) return null;
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function parseNumberCsv(value) {
  const items = parseCsv(value);
  if (!items) return null;
  const numbers = items.map((item) => Number(item)).filter((item) => Number.isFinite(item));
  return numbers.length ? numbers : null;
}

function sanitizeName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "trial";
}

function resolveRenderAdapter(renderer, root) {
  const normalized = String(renderer || "powerpoint").trim().toLowerCase();
  if (["powerpoint", "com", "powerpoint-com"].includes(normalized)) {
    return require(path.join(root, "scripts", "adapters", "render-powerpoint-com.js"));
  }
  if (["libreoffice", "libre-office", "lo"].includes(normalized)) {
    return require(path.join(root, "scripts", "adapters", "render-libreoffice.js"));
  }
  throw new Error(`Unsupported --renderer '${renderer}'. Use 'powerpoint' or 'libreoffice'.`);
}

function lightenHex(value, amount) {
  const hex = String(value || "").trim().replace(/^#/, "");
  const safe = /^[0-9a-fA-F]{6}$/.test(hex) ? hex : "000000";
  const ratio = Math.max(0, Math.min(1, Number(amount) || 0));
  const r = parseInt(safe.slice(0, 2), 16);
  const g = parseInt(safe.slice(2, 4), 16);
  const b = parseInt(safe.slice(4, 6), 16);
  return `#${[r, g, b].map((channel) => {
    const next = Math.round(channel + (255 - channel) * ratio);
    return next.toString(16).padStart(2, "0");
  }).join("").toUpperCase()}`;
}

function round(value) {
  return Math.round(value * 1000000) / 1000000;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = { _private: { resolveRenderAdapter, contextForSearch } };
