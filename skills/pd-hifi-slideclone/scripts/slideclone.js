#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const skillRoot = path.resolve(__dirname, "..");
const defaultAdapters = {
  normalize: "scripts/adapters/normalize-placeholder.js",
  ocr: "scripts/adapters/ocr-placeholder.js",
  vision: "scripts/adapters/vision-placeholder.js",
  pptx: "scripts/adapters/pptx-openxml-placeholder.js",
  render: "scripts/adapters/render-placeholder.js",
  diff: "scripts/adapters/diff-placeholder.js",
  compare: "scripts/adapters/compare-placeholder.js",
  polish: "scripts/adapters/polish-placeholder.js",
  compress: "scripts/adapters/compress-placeholder.js"
};

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) {
      args._.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function ensureRunDirs(outputDir) {
  ["normalized", "ir", "pptx", "render", "diff", "compare", "polish", "compress", "reports"].forEach((dir) => {
    ensureDir(path.join(outputDir, dir));
  });
}

function resolveMaybeRelative(baseDir, value) {
  if (path.isAbsolute(value)) return value;
  const fromConfig = path.resolve(baseDir, value);
  if (fs.existsSync(fromConfig)) return fromConfig;
  return path.resolve(skillRoot, value);
}

function createConfig(inputDir, outputDir) {
  return {
    inputDir,
    outputDir,
    pagePattern: "*.{png,jpg,jpeg,webp,pdf,pptx}",
    slide: {
      widthPt: 960,
      heightPt: 540
    },
    adapters: defaultAdapters,
    thresholds: {
      pixelDiffRatio: 0.08,
      foregroundMissingRatio: 0.12,
      layoutMeanIoU: 0.86,
      textCoverage: 0.95,
      maxCriticalOffsetPt: 8,
      maxOutOfBoundsPt: 1,
      maxImageAspectRatioDelta: 0.03,
      maxRasterImageAreaRatio: 0.25
    },
    fontFit: {
      enabled: false,
      candidates: ["Microsoft YaHei", "SimHei", "DengXian", "Arial"]
    },
    maxIterations: 2,
    postprocess: {
      compare: true,
      polish: true,
      compress: true,
      verifyCompressed: true,
      stopWhenThresholdPassed: true
    }
  };
}

function validateIr(ir, options = {}) {
  const errors = [];
  const warnings = [];
  if (!ir || ir.version !== "1.0") errors.push("version must be 1.0");
  if (!ir.slideSize || typeof ir.slideSize.widthPt !== "number" || typeof ir.slideSize.heightPt !== "number") {
    errors.push("slideSize.widthPt and slideSize.heightPt are required numbers");
  }
  if (!Array.isArray(ir.pages)) errors.push("pages must be an array");
  const slideWidth = ir?.slideSize?.widthPt || 0;
  const slideHeight = ir?.slideSize?.heightPt || 0;
  (ir.pages || []).forEach((page, pageIdx) => {
    const pageLabel = `pages[${pageIdx}]`;
    if (typeof page.pageIndex !== "number") errors.push(`${pageLabel}.pageIndex must be a number`);
    if (typeof page.sourceImage !== "string" || !page.sourceImage.trim()) {
      errors.push(`${pageLabel}.sourceImage is required`);
    } else {
      validateExistingFile(`${pageLabel}.sourceImage`, page.sourceImage, options, warnings);
    }
    const ids = new Map();
    ["textBoxes", "shapes", "images", "tables", "charts", "icons"].forEach((key) => {
      if (!Array.isArray(page[key])) errors.push(`pages[${pageIdx}].${key} must be an array`);
    });
    (page.textBoxes || []).forEach((textBox, boxIdx) => {
      const label = `${pageLabel}.textBoxes[${boxIdx}]`;
      validateElementCommon(textBox, label, "text", { errors, warnings, ids, options, slideWidth, slideHeight });
      if (typeof textBox.text !== "string") errors.push(`${label}.text must be a string`);
      if (!textBox.font?.family) warnings.push(`${label}.font.family is missing; PowerPoint may substitute fonts.`);
    });
    ["shapes", "images", "tables", "charts", "icons"].forEach((key) => {
      (page[key] || []).forEach((item, itemIdx) => {
        const label = `${pageLabel}.${key}[${itemIdx}]`;
        validateElementCommon(item, label, key, { errors, warnings, ids, options, slideWidth, slideHeight });
        if (!item.type) errors.push(`${label}.type is required`);
        if (key === "images") validateImageElement(item, label, { errors, warnings, options });
        if (key === "tables" && !Array.isArray(item.rows)) warnings.push(`${label}.rows is missing; table may not be editable.`);
      });
    });
  });
  return { ok: errors.length === 0, errors, warnings };
}

function isBox(box) {
  return box && ["x", "y", "w", "h"].every((key) => Number.isFinite(box[key]));
}

function validateElementCommon(item, label, group, state) {
  const { errors, warnings, ids, options, slideWidth, slideHeight } = state;
  if (!item.id || typeof item.id !== "string") {
    errors.push(`${label}.id is required`);
  } else if (ids.has(item.id)) {
    errors.push(`${label}.id duplicates ${ids.get(item.id)}`);
  } else {
    ids.set(item.id, label);
  }
  if (!isBox(item.box)) {
    errors.push(`${label}.box is invalid`);
  } else {
    const allowLine = group === "shapes" && String(item.type || "").toLowerCase() === "line";
    validateBox(label, item.box, { errors, warnings, slideWidth, slideHeight, allowLine });
  }
  validateSourceContract(item, label, { errors, warnings, options });
}

function validateBox(label, box, { errors, warnings, slideWidth, slideHeight, allowLine }) {
  if (!allowLine && (box.w <= 0 || box.h <= 0)) {
    errors.push(`${label}.box.w and box.h must be positive`);
  }
  if (allowLine && box.w === 0 && box.h === 0) {
    errors.push(`${label}.box line cannot have both zero width and zero height`);
  }
  const left = Math.min(box.x, box.x + box.w);
  const top = Math.min(box.y, box.y + box.h);
  const right = Math.max(box.x, box.x + box.w);
  const bottom = Math.max(box.y, box.y + box.h);
  if (slideWidth > 0 && slideHeight > 0 && (right < 0 || bottom < 0 || left > slideWidth || top > slideHeight)) {
    warnings.push(`${label}.box is completely outside slide bounds`);
  }
}

function validateSourceContract(item, label, { errors, warnings, options }) {
  if (!item.source || typeof item.source !== "object") {
    errors.push(`${label}.source is required for traceability`);
    return;
  }
  if (!isBox(item.source.evidenceBox)) {
    errors.push(`${label}.source.evidenceBox is required`);
  }
  if (typeof item.source.pageImage !== "string" || !item.source.pageImage.trim()) {
    warnings.push(`${label}.source.pageImage is missing`);
  } else {
    validateExistingFile(`${label}.source.pageImage`, item.source.pageImage, options, warnings);
  }
}

function validateImageElement(item, label, { errors, warnings, options }) {
  const asset = item.assetPath || item.style?.assetPath || item.source?.cropImage || item.source?.pageImage;
  if (!asset) {
    errors.push(`${label}.assetPath or source.cropImage is required`);
  } else {
    validateExistingFile(`${label}.assetPath`, asset, options, errors);
  }
  if (item.source?.editable !== true && !item.source?.nonEditableReason) {
    errors.push(`${label}.source.nonEditableReason is required when image is not editable`);
  }
}

function validateExistingFile(label, file, options, collector) {
  if (options.checkFiles === false) return;
  const resolved = resolveIrPath(options.baseDir, file);
  if (!fs.existsSync(resolved)) collector.push(`${label} does not exist: ${file}`);
}

function resolveIrPath(baseDir, value) {
  if (!value || path.isAbsolute(value)) return value;
  if (baseDir) {
    const fromBase = path.resolve(baseDir, value);
    if (fs.existsSync(fromBase)) return fromBase;
  }
  return path.resolve(skillRoot, value);
}

async function loadAdapter(configDir, adapterPath) {
  const fullPath = resolveMaybeRelative(configDir, adapterPath);
  return require(fullPath);
}

function assertAdapterOk(stage, result) {
  if (!result || result.ok !== true) {
    const message = result?.error || result?.message || "adapter returned a non-ok result";
    throw new Error(`${stage} failed: ${message}`);
  }
  return result;
}

async function initCommand(args) {
  const inputDir = path.resolve(args.input || "input");
  const outputDir = path.resolve(args.out || "runs/slideclone");
  ensureRunDirs(outputDir);
  const config = createConfig(inputDir, outputDir);
  const configFile = path.join(outputDir, "slideclone.config.json");
  writeJson(configFile, config);
  console.log(`Created ${configFile}`);
}

async function runCommand(args) {
  if (!args.config) throw new Error("--config is required");
  const configFile = path.resolve(args.config);
  const configDir = path.dirname(configFile);
  const config = readJson(configFile);
  const inputDir = path.resolve(configDir, config.inputDir);
  const outputDir = path.resolve(configDir, config.outputDir);
  ensureRunDirs(outputDir);

  const context = {
    config,
    configFile,
    inputDir,
    outputDir,
    skillRoot
  };

  const normalize = await loadAdapter(configDir, config.adapters.normalize || defaultAdapters.normalize);
  const normalizeResult = assertAdapterOk("normalize", await normalize({ inputDir, outputDir }, context));
  const pages = normalizeResult.data?.pageImages || [];
  if (pages.length === 0) {
    const unsupported = normalizeResult.data?.unsupportedSources || [];
    const suffix = unsupported.length > 0
      ? ` Unsupported inputs need a real normalize adapter first: ${unsupported.join(", ")}.`
      : "";
    throw new Error(`No normalized page images found in ${inputDir}. Put png/jpg/jpeg/webp pages there first or configure a PDF/PPTX normalizer.${suffix}`);
  }

  const ocr = await loadAdapter(configDir, config.adapters.ocr);
  const vision = await loadAdapter(configDir, config.adapters.vision);
  const pptx = await loadAdapter(configDir, config.adapters.pptx);
  const render = await loadAdapter(configDir, config.adapters.render);
  const diff = await loadAdapter(configDir, config.adapters.diff);
  const compare = await loadAdapter(configDir, config.adapters.compare || defaultAdapters.compare);
  const polish = await loadAdapter(configDir, config.adapters.polish || defaultAdapters.polish);
  const compress = await loadAdapter(configDir, config.adapters.compress || defaultAdapters.compress);

  const ir = {
    version: "1.0",
    slideSize: {
      widthPt: config.slide?.widthPt || 960,
      heightPt: config.slide?.heightPt || 540
    },
    pages: []
  };

  for (let index = 0; index < pages.length; index += 1) {
    const pageInput = pages[index];
    const pageMeta = typeof pageInput === "string" ? { sourceImage: pageInput } : pageInput;
    const sourceImage = pageMeta.sourceImage;
    const ocrResult = assertAdapterOk("ocr", await ocr({
      pageIndex: index,
      sourceImage,
      page: pageMeta,
      slideSize: ir.slideSize
    }, context));
    const visionResult = assertAdapterOk("vision", await vision({
      pageIndex: index,
      sourceImage,
      page: pageMeta,
      slideSize: ir.slideSize,
      ocr: ocrResult.data
    }, context));
    ir.pages.push({
      pageIndex: index,
      sourceImage,
      background: visionResult.data.background || {},
      textBoxes: visionResult.data.textBoxes || [],
      shapes: visionResult.data.shapes || [],
      images: visionResult.data.images || [],
      tables: visionResult.data.tables || [],
      charts: visionResult.data.charts || [],
      icons: visionResult.data.icons || []
    });
  }

  const irFile = path.join(outputDir, "ir", "deck.json");
  writeJson(irFile, ir);

  const validation = validateIr(ir, { baseDir: path.dirname(irFile), checkFiles: true });
  writeJson(path.join(outputDir, "reports", "ir-validation.json"), {
    ok: validation.errors.length === 0,
    errors: validation.errors,
    warnings: validation.warnings
  });
  if (validation.errors.length > 0) {
    throw new Error(`IR validation failed. See ${path.join(outputDir, "reports", "ir-validation.json")}`);
  }

  let currentIr = ir;
  let currentIrFile = irFile;
  let pptxResult = assertAdapterOk("pptx", await pptx({ irFile: currentIrFile, ir: currentIr, iteration: 0 }, context));
  const postprocessResult = await runPostprocess({
    config,
    context,
    adapters: { pptx, render, diff, compare, polish, compress },
    ir: currentIr,
    irFile: currentIrFile,
    pptxResult
  });

  const pipelineResult = {
    ok: true,
    pages: pages.length,
    normalize: normalizeResult.data,
    irFile: postprocessResult.irFile,
    pptx: postprocessResult.pptx,
    compare: postprocessResult.compare,
    fontFit: postprocessResult.fontFit,
    polish: postprocessResult.polish,
    compress: postprocessResult.compress,
    delivery: postprocessResult.delivery,
    iterations: postprocessResult.iterations
  };
  writeJson(path.join(outputDir, "reports", "pipeline-result.json"), pipelineResult);
  writeDeliverySummary({
    config,
    configFile,
    inputDir,
    outputDir,
    pages,
    normalize: normalizeResult.data,
    postprocess: postprocessResult,
    pipeline: pipelineResult
  });
  console.log(`Done. IR: ${postprocessResult.irFile}`);
}

async function runPostprocess({ config, context, adapters, ir, irFile, pptxResult }) {
  const maxIterations = Number.isInteger(config.maxIterations) ? config.maxIterations : 2;
  const postprocess = {
    compare: true,
    polish: true,
    compress: true,
    verifyCompressed: true,
    stopWhenThresholdPassed: true,
    ...(config.postprocess || {})
  };
  const iterations = [];
  let currentIr = ir;
  let currentIrFile = irFile;
  let currentPptxResult = pptxResult;
  let lastCompare = null;
  let polishSummary = null;
  let fontFitSummary = null;

  if (config.fontFit?.enabled === true) {
    const fitResult = await optimizeFonts({
      config,
      context,
      adapters,
      ir: currentIr,
      irFile: currentIrFile,
      pptxResult: currentPptxResult
    });
    fontFitSummary = fitResult.summary;
    currentIr = fitResult.ir;
    currentIrFile = fitResult.irFile;
    currentPptxResult = fitResult.pptxResult;
  }

  for (let iteration = 0; iteration <= maxIterations; iteration += 1) {
    const renderResult = assertAdapterOk("render", await adapters.render({
      irFile: currentIrFile,
      ir: currentIr,
      pptx: currentPptxResult.data,
      iteration
    }, context));
    const diffResult = assertAdapterOk("diff", await adapters.diff({
      irFile: currentIrFile,
      ir: currentIr,
      render: renderResult.data,
      iteration
    }, context));
    const compareResult = postprocess.compare
      ? assertAdapterOk("compare", await adapters.compare({
        irFile: currentIrFile,
        ir: currentIr,
        render: renderResult.data,
        diff: diffResult.data,
        thresholds: config.thresholds,
        iteration
      }, context))
      : { ok: true, data: { skipped: true, passed: true } };

    lastCompare = compareResult.data;
    iterations.push({
      iteration,
      irFile: currentIrFile,
      pptx: currentPptxResult.data,
      render: renderResult.data,
      diff: diffResult.data,
      compare: compareResult.data
    });

    const passed = compareResult.data?.passed === true;
    const shouldStop = passed && postprocess.stopWhenThresholdPassed;
    const canPolish = postprocess.polish && iteration < maxIterations;
    if (shouldStop || !canPolish) break;

    const polishResult = assertAdapterOk("polish", await adapters.polish({
      irFile: currentIrFile,
      ir: currentIr,
      compare: compareResult.data,
      diff: diffResult.data,
      thresholds: config.thresholds,
      iteration
    }, context));
    polishSummary = polishResult.data;
    if (!polishResult.data?.ir || polishResult.data.changed === false) break;

    currentIr = polishResult.data.ir;
    currentIrFile = path.join(context.outputDir, "ir", `deck.polished.${iteration + 1}.json`);
    writeJson(currentIrFile, currentIr);
    currentPptxResult = assertAdapterOk("pptx", await adapters.pptx({
      irFile: currentIrFile,
      ir: currentIr,
      iteration: iteration + 1
    }, context));
  }

  const compressResult = postprocess.compress
    ? assertAdapterOk("compress", await adapters.compress({
      irFile: currentIrFile,
      ir: currentIr,
      pptx: currentPptxResult.data,
      compare: lastCompare,
      iterations
    }, context))
    : { ok: true, data: { skipped: true } };
  const delivery = await verifyDelivery({
    postprocess,
    context,
    render: adapters.render,
    ir: currentIr,
    pptx: currentPptxResult.data,
    compress: compressResult.data
  });

  writeJson(path.join(context.outputDir, "reports", "postprocess-result.json"), {
    ok: true,
    finalIrFile: currentIrFile,
    finalPptx: currentPptxResult.data,
    delivery,
    compare: lastCompare,
    fontFit: fontFitSummary,
    polish: polishSummary,
    compress: compressResult.data,
    iterations
  });

  return {
    irFile: currentIrFile,
    pptx: currentPptxResult.data,
    delivery,
    compare: lastCompare,
    fontFit: fontFitSummary,
    polish: polishSummary,
    compress: compressResult.data,
    iterations
  };
}

async function optimizeFonts({ config, context, adapters, ir, irFile, pptxResult }) {
  const configured = Array.isArray(config.fontFit?.candidates) ? config.fontFit.candidates : [];
  const existingFonts = listFonts(ir);
  const candidates = unique([
    ...existingFonts,
    ...configured
  ]).filter(Boolean);
  const summary = {
    provider: "font-fit-render-diff",
    enabled: true,
    candidates,
    selected: null,
    changed: false,
    trials: []
  };
  if (candidates.length === 0 || countTextBoxes(ir) === 0) {
    summary.skipped = true;
    summary.reason = candidates.length === 0 ? "No font candidates configured." : "IR has no text boxes.";
    writeJson(path.join(context.outputDir, "reports", "font-fit-result.json"), summary);
    return { ir, irFile, pptxResult, summary };
  }

  let best = null;
  for (let index = 0; index < candidates.length; index += 1) {
    const family = candidates[index];
    const candidateIr = withFontFamily(ir, family);
    const candidateIrFile = path.join(context.outputDir, "ir", `deck.fontfit.${index + 1}.json`);
    writeJson(candidateIrFile, candidateIr);
    const candidatePptx = assertAdapterOk("font-fit-pptx", await adapters.pptx({
      irFile: candidateIrFile,
      ir: candidateIr,
      iteration: `fontfit-${index + 1}`
    }, context));
    const preservedPptxFile = preservePptx(candidatePptx.data?.pptxFile, context.outputDir, `deck.fontfit.${index + 1}.pptx`);
    const renderResult = assertAdapterOk("font-fit-render", await adapters.render({
      irFile: candidateIrFile,
      ir: candidateIr,
      pptx: { ...candidatePptx.data, pptxFile: preservedPptxFile || candidatePptx.data?.pptxFile },
      iteration: `fontfit-${index + 1}`
    }, context));
    const diffResult = assertAdapterOk("font-fit-diff", await adapters.diff({
      irFile: candidateIrFile,
      ir: candidateIr,
      render: renderResult.data,
      iteration: `fontfit-${index + 1}`
    }, context));
    const score = scoreDiff(diffResult.data?.summary);
    const trial = {
      family,
      irFile: candidateIrFile,
      pptxFile: preservedPptxFile || candidatePptx.data?.pptxFile,
      renderDir: renderResult.data?.renderDir,
      diffReportFile: diffResult.data?.reportFile,
      score,
      pixelDiffRatio: diffResult.data?.summary?.pixelDiffRatio ?? null,
      foregroundMissingRatio: diffResult.data?.summary?.foregroundMissingRatio ?? null,
      foregroundMissingRatioRaw: diffResult.data?.summary?.foregroundMissingRatioRaw ?? null
    };
    summary.trials.push(trial);
    if (!best || score < best.score) {
      best = {
        score,
        ir: candidateIr,
        irFile: candidateIrFile,
        pptxResult: {
          ...candidatePptx,
          data: {
            ...candidatePptx.data,
            pptxFile: preservedPptxFile || candidatePptx.data?.pptxFile
          }
        },
        trial
      };
    }
  }

  summary.selected = best?.trial || null;
  summary.changed = Boolean(best && firstFont(existingFonts) !== best.trial.family);
  if (!best) {
    writeJson(path.join(context.outputDir, "reports", "font-fit-result.json"), summary);
    return { ir, irFile, pptxResult, summary };
  }
  const finalPptxFile = preservePptx(best.pptxResult.data?.pptxFile, context.outputDir, "deck.pptx");
  if (finalPptxFile) {
    best.pptxResult = {
      ...best.pptxResult,
      data: {
        ...best.pptxResult.data,
        pptxFile: finalPptxFile,
        selectedCandidatePptxFile: best.trial.pptxFile
      }
    };
    summary.finalPptxFile = finalPptxFile;
  }
  writeJson(path.join(context.outputDir, "reports", "font-fit-result.json"), summary);
  return {
    ir: best.ir,
    irFile: best.irFile,
    pptxResult: best.pptxResult,
    summary
  };
}

function withFontFamily(ir, family) {
  const next = JSON.parse(JSON.stringify(ir));
  for (const page of next.pages || []) {
    for (const box of page.textBoxes || []) {
      box.font = { ...(box.font || {}), family };
    }
  }
  return next;
}

function listFonts(ir) {
  const fonts = [];
  for (const page of ir.pages || []) {
    for (const box of page.textBoxes || []) {
      if (box.font?.family) fonts.push(box.font.family);
    }
  }
  return unique(fonts);
}

function firstFont(fonts) {
  return Array.isArray(fonts) && fonts.length ? fonts[0] : null;
}

function countTextBoxes(ir) {
  return (ir.pages || []).reduce((sum, page) => sum + (page.textBoxes || []).length, 0);
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

function scoreDiff(summary = {}) {
  const pixel = typeof summary.pixelDiffRatio === "number" ? summary.pixelDiffRatio : 1;
  const foreground = typeof summary.foregroundMissingRatio === "number" ? summary.foregroundMissingRatio : 1;
  const raw = typeof summary.foregroundMissingRatioRaw === "number" ? summary.foregroundMissingRatioRaw : foreground;
  return Math.round((pixel + foreground * 0.8 + raw * 0.25) * 1000000) / 1000000;
}

function preservePptx(sourceFile, outputDir, name) {
  if (!sourceFile || !fs.existsSync(sourceFile)) return null;
  const target = path.join(outputDir, "pptx", name);
  fs.copyFileSync(sourceFile, target);
  return target;
}

function writeDeliverySummary({ config, configFile, inputDir, outputDir, pages, normalize, postprocess, pipeline }) {
  const compare = postprocess.compare || {};
  const delivery = postprocess.delivery || {};
  const compress = postprocess.compress || {};
  const failedChecks = (compare.checks || []).filter((check) => check.passed !== true);
  const requiredFailedChecks = failedChecks.filter((check) => check.required);
  const overallPassed = pipeline.ok === true
    && compare.passed === true
    && delivery.verified !== false
    && requiredFailedChecks.length === 0;
  const summary = {
    provider: "slideclone-delivery-summary",
    generatedAt: new Date().toISOString(),
    status: overallPassed ? "passed" : "failed",
    passed: overallPassed,
    configFile,
    inputDir,
    outputDir,
    pages: {
      count: pages.length,
      imageOnlyCount: countImageOnlyPages(normalize)
    },
    adapters: {
      ...(config.adapters || {}),
      textOcr: config.textOcr?.enabled === true ? config.textOcr.adapter || null : null
    },
    artifacts: {
      irFile: postprocess.irFile,
      pptxFile: postprocess.pptx?.pptxFile || null,
      deliveryPptxFile: delivery.pptxFile || null,
      compressedPptxFile: compress.compressedPptxFile || null,
      postprocessReport: path.join(outputDir, "reports", "postprocess-result.json"),
      pipelineReport: path.join(outputDir, "reports", "pipeline-result.json"),
      diffReport: latestDiffReport(postprocess.iterations),
      textCoverageReport: compare.textCoverage?.reportFile || null,
      compressionReport: compress.reportFile || null,
      renderedDeliveryPages: delivery.verification?.renderedPages || []
    },
    metrics: {
      ...(compare.summary || {}),
      rasterImageAreaRatio: compare.editability?.rasterImageAreaRatio ?? null,
      editableObjects: compare.editability?.editableObjects ?? null,
      nonEditableObjects: compare.editability?.nonEditableObjects ?? null
    },
    checks: compare.checks || [],
    failedChecks,
    editability: compare.editability || null,
    nonEditableByReason: compare.editability?.nonEditableByReason || {},
    compression: summarizeCompression(compress),
    delivery: {
      source: delivery.source || null,
      verified: delivery.verified === true,
      renderDir: delivery.verification?.renderDir || null,
      renderedPageCount: Array.isArray(delivery.verification?.renderedPages)
        ? delivery.verification.renderedPages.length
        : 0
    },
    fontFit: postprocess.fontFit
      ? {
        selected: postprocess.fontFit.selected?.family || null,
        changed: postprocess.fontFit.changed === true,
        trials: (postprocess.fontFit.trials || []).map((trial) => ({
          family: trial.family,
          score: trial.score,
          pixelDiffRatio: trial.pixelDiffRatio,
          foregroundMissingRatio: trial.foregroundMissingRatio
        }))
      }
      : null,
    warnings: collectDeliveryWarnings({ compare, delivery, compress, requiredFailedChecks })
  };
  const jsonFile = path.join(outputDir, "reports", "delivery-summary.json");
  const markdownFile = path.join(outputDir, "reports", "delivery-summary.md");
  writeJson(jsonFile, summary);
  fs.writeFileSync(markdownFile, renderDeliverySummaryMarkdown(summary), "utf8");
}

function countImageOnlyPages(normalize) {
  let count = 0;
  for (const report of normalize?.reports || []) {
    count += Number(report.imageOnlySlideCount || 0);
  }
  if (count > 0) return count;
  return (normalize?.pageImages || []).filter((page) => page.imageOnly === true).length;
}

function latestDiffReport(iterations = []) {
  const last = iterations.length ? iterations[iterations.length - 1] : null;
  return last?.diff?.reportFile || null;
}

function summarizeCompression(compress = {}) {
  return {
    skipped: compress.skipped === true,
    originalBytes: compress.originalBytes ?? null,
    compressedBytes: compress.compressedBytes ?? null,
    savedBytes: compress.savedBytes ?? null,
    savedRatio: compress.savedRatio ?? null,
    mediaCount: compress.mediaCount ?? null,
    changedMediaCount: compress.changedMediaCount ?? null
  };
}

function collectDeliveryWarnings({ compare, delivery, compress, requiredFailedChecks }) {
  const warnings = [];
  if (compare.warning) warnings.push(compare.warning);
  if (requiredFailedChecks.length > 0) {
    warnings.push(`Required check(s) failed: ${requiredFailedChecks.map((check) => check.name).join(", ")}.`);
  }
  if (delivery.verified !== true) warnings.push("Delivery PPTX was not verified by render adapter.");
  if (compress.skipped === true) warnings.push("Compression was skipped.");
  return warnings;
}

function renderDeliverySummaryMarkdown(summary) {
  const lines = [];
  lines.push("# Slide Clone Delivery Summary");
  lines.push("");
  lines.push(`- Status: ${summary.passed ? "passed" : "failed"}`);
  lines.push(`- Pages: ${summary.pages.count} (image-only: ${summary.pages.imageOnlyCount})`);
  lines.push(`- Delivery PPTX: ${summary.artifacts.deliveryPptxFile || ""}`);
  lines.push(`- IR: ${summary.artifacts.irFile || ""}`);
  lines.push(`- Verified: ${summary.delivery.verified ? "true" : "false"}`);
  lines.push("");
  lines.push("## Metrics");
  lines.push("");
  lines.push("| Metric | Actual | Threshold | Required | Passed |");
  lines.push("| --- | ---: | ---: | --- | --- |");
  for (const check of summary.checks || []) {
    lines.push(`| ${check.name} | ${formatMetric(check.actual)} | ${formatMetric(check.threshold)} | ${Boolean(check.required)} | ${Boolean(check.passed)} |`);
  }
  lines.push("");
  lines.push("## Editability");
  lines.push("");
  lines.push(`- Editable objects: ${summary.metrics.editableObjects ?? ""}`);
  lines.push(`- Non-editable objects: ${summary.metrics.nonEditableObjects ?? ""}`);
  lines.push(`- Raster image area ratio: ${formatMetric(summary.metrics.rasterImageAreaRatio)}`);
  for (const [reason, count] of Object.entries(summary.nonEditableByReason || {})) {
    lines.push(`- ${reason}: ${count}`);
  }
  lines.push("");
  lines.push("## Compression");
  lines.push("");
  lines.push(`- Original bytes: ${summary.compression.originalBytes ?? ""}`);
  lines.push(`- Compressed bytes: ${summary.compression.compressedBytes ?? ""}`);
  lines.push(`- Saved bytes: ${summary.compression.savedBytes ?? ""}`);
  lines.push(`- Changed media: ${summary.compression.changedMediaCount ?? ""}/${summary.compression.mediaCount ?? ""}`);
  if ((summary.warnings || []).length > 0) {
    lines.push("");
    lines.push("## Warnings");
    lines.push("");
    for (const warning of summary.warnings) lines.push(`- ${warning}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function formatMetric(value) {
  if (typeof value !== "number") return "";
  return Math.round(value * 1000000) / 1000000;
}

async function verifyDelivery({ postprocess, context, render, ir, pptx, compress }) {
  const compressedPptxFile = compress?.compressedPptxFile || null;
  const originalPptxFile = pptx?.pptxFile || null;
  const deliveryPptxFile = compressedPptxFile || originalPptxFile;
  const delivery = {
    pptxFile: deliveryPptxFile,
    source: compressedPptxFile ? "compressed" : "original",
    verified: false,
    verification: null
  };
  if (!deliveryPptxFile) return delivery;
  if (!compressedPptxFile || postprocess.verifyCompressed === false) {
    delivery.verified = !compressedPptxFile;
    delivery.verification = compressedPptxFile
      ? { skipped: true, reason: "postprocess.verifyCompressed=false" }
      : { skipped: true, reason: "No compressed PPTX was produced." };
    return delivery;
  }

  const renderResult = assertAdapterOk("delivery-render", await render({
    ir,
    pptx: { ...pptx, pptxFile: compressedPptxFile },
    iteration: "compressed-final"
  }, context));
  delivery.verified = true;
  delivery.verification = {
    provider: renderResult.data?.provider,
    renderDir: renderResult.data?.renderDir,
    renderedPages: renderResult.data?.renderedPages || []
  };
  return delivery;
}

async function validateCommand(args) {
  if (!args.ir) throw new Error("--ir is required");
  const irFile = path.resolve(args.ir);
  const ir = readJson(irFile);
  const validation = validateIr(ir, {
    baseDir: path.dirname(irFile),
    checkFiles: args["no-check-files"] !== true
  });
  const strict = args.strict === true;
  if (validation.warnings.length > 0) {
    console.warn(validation.warnings.map((warning) => `warning: ${warning}`).join("\n"));
  }
  if (validation.errors.length > 0 || (strict && validation.warnings.length > 0)) {
    if (validation.errors.length > 0) console.error(validation.errors.join("\n"));
    if (strict && validation.warnings.length > 0) console.error("strict mode failed because warnings were produced.");
    process.exitCode = 1;
    return;
  }
  console.log(`OK: ${irFile}`);
}

async function gateCommand(args) {
  const summaryFile = resolveGateSummaryFile(args);
  const summary = readJson(summaryFile);
  const errors = [];
  const warnings = [];

  if (summary.passed !== true || summary.status !== "passed") {
    errors.push(`summary status is not passed: ${summary.status || "unknown"}`);
  }
  const failedChecks = Array.isArray(summary.failedChecks) ? summary.failedChecks : [];
  if (failedChecks.length > 0) {
    errors.push(`failed check(s): ${failedChecks.map((check) => check.name || "unknown").join(", ")}`);
  }
  const requiredChecks = (summary.checks || []).filter((check) => check.required === true);
  const failedRequired = requiredChecks.filter((check) => check.passed !== true);
  if (requiredChecks.length === 0) {
    errors.push("no required checks found in delivery summary");
  }
  if (failedRequired.length > 0) {
    errors.push(`required check(s) failed: ${failedRequired.map((check) => check.name).join(", ")}`);
  }
  if (summary.delivery?.verified !== true && args["allow-unverified"] !== true) {
    errors.push("delivery was not verified by render adapter");
  }
  if (!summary.artifacts?.deliveryPptxFile) {
    errors.push("artifacts.deliveryPptxFile is missing");
  } else if (args["no-check-files"] !== true && !fs.existsSync(summary.artifacts.deliveryPptxFile)) {
    errors.push(`delivery PPTX does not exist: ${summary.artifacts.deliveryPptxFile}`);
  }
  if ((summary.delivery?.renderedPageCount || 0) <= 0 && args["allow-unverified"] !== true) {
    errors.push("delivery render produced no pages");
  }
  gateMetricAtLeast(summary, "textCoverage", args["min-text-coverage"], errors);
  gateMetricAtMost(summary, "rasterImageAreaRatio", args["max-raster-image-area-ratio"], errors);
  for (const warning of summary.warnings || []) warnings.push(warning);

  const report = {
    provider: "slideclone-gate",
    summaryFile,
    passed: errors.length === 0,
    errors,
    warnings,
    checkedAt: new Date().toISOString()
  };
  const reportFile = args.report ? path.resolve(args.report) : null;
  if (reportFile) writeJson(reportFile, report);
  if (warnings.length > 0) {
    console.warn(warnings.map((warning) => `warning: ${warning}`).join("\n"));
  }
  if (errors.length > 0) {
    console.error(errors.map((error) => `error: ${error}`).join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(`GATE PASSED: ${summaryFile}`);
}

function resolveGateSummaryFile(args) {
  if (args.summary) return path.resolve(args.summary);
  if (args.out) return path.resolve(args.out, "reports", "delivery-summary.json");
  throw new Error("--summary or --out is required for gate");
}

function gateMetricAtLeast(summary, key, thresholdValue, errors) {
  if (thresholdValue == null || thresholdValue === true) return;
  const threshold = Number(thresholdValue);
  const actual = summary.metrics?.[key];
  if (!Number.isFinite(threshold)) {
    errors.push(`${key} gate threshold is invalid: ${thresholdValue}`);
  } else if (typeof actual !== "number" || actual < threshold) {
    errors.push(`${key} ${formatMetric(actual)} is below gate threshold ${threshold}`);
  }
}

function gateMetricAtMost(summary, key, thresholdValue, errors) {
  if (thresholdValue == null || thresholdValue === true) return;
  const threshold = Number(thresholdValue);
  const actual = summary.metrics?.[key];
  if (!Number.isFinite(threshold)) {
    errors.push(`${key} gate threshold is invalid: ${thresholdValue}`);
  } else if (typeof actual !== "number" || actual > threshold) {
    errors.push(`${key} ${formatMetric(actual)} is above gate threshold ${threshold}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (command === "init") return initCommand(args);
  if (command === "run") return runCommand(args);
  if (command === "validate") return validateCommand(args);
  if (command === "gate") return gateCommand(args);
  console.log("Usage: slideclone.js <init|run|validate|gate> [--input dir] [--out dir] [--config file] [--ir file] [--summary file]");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
