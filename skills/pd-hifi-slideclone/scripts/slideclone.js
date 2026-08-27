#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  buildReconstructionInventory,
  enrichReconstructionContracts,
  validateReconstructionContracts
} = require("./lib/reconstruction-contract");
const {
  applyRoleFontOption,
  describeRoleOption,
  getRoleFitPlan
} = require("./lib/font-fit");
const {
  applyContainerStyleOption,
  collectContainerStylePlan,
  describeContainerOption
} = require("./lib/container-style-fit");
const {
  rankedOptionsForRole,
  rankRoleFontOptions
} = require("./lib/font-fast-rank");
const { assertValidConfig } = require("./lib/config-validation");
const { processPages } = require("./lib/page-pipeline");
const { loadTrustedAdapter } = require("./lib/trusted-adapter");
const { DEFAULT_OCR_ADAPTER, defaultOcrProviderConfigs } = require("./lib/ocr-provider-config");

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

function readJson(file, maxBytes = 128 * 1024 * 1024) {
  const stats = fs.statSync(file);
  if (!stats.isFile() || stats.size <= 0 || stats.size > maxBytes) {
    throw new Error(`JSON file size exceeds the processing boundary: ${file}`);
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON file ${file}: ${error.message}`);
  }
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
    pageConcurrency: 2,
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
      mode: "role-greedy",
      candidates: ["Microsoft YaHei", "SimHei", "DengXian", "Arial"],
      roleOrder: ["title", "banner", "card-title", "button", "caption", "body"],
      roleCandidates: {
        title: { sizeAdjustPt: [-1, 0, 1], weights: ["bold"] },
        banner: { sizeAdjustPt: [-1, 0, 1], weights: ["bold"] },
        "card-title": { sizeAdjustPt: [-0.5, 0, 0.5], weights: ["bold"] },
        button: { sizeAdjustPt: [-0.5, 0, 0.5], weights: ["regular", "bold"] },
        caption: { sizeAdjustPt: [-0.5, 0, 0.5], weights: ["regular", "bold"] },
        body: { sizeAdjustPt: [0], weights: ["regular", "bold"] }
      }
    },
    containerStyleFit: {
      enabled: false,
      mode: "container-greedy",
      kindCandidates: {
        banner: {
          radiusRatio: [0.03, 0.035, 0.04],
          shadowAlpha: [0.11, 0.13, 0.15],
          shadowBlurPt: [3.2, 3.8, 4.4],
          shadowDistancePt: [0.8, 1.0, 1.2],
          shadowAngleDeg: [45]
        },
        card: {
          radiusRatio: [0.05, 0.06, 0.07],
          shadowAlpha: [0.14, 0.16, 0.18],
          shadowBlurPt: [3.8, 4.2, 4.8],
          shadowDistancePt: [1.0, 1.3, 1.6],
          shadowAngleDeg: [45]
        },
        "strong-card": {
          radiusRatio: [0.05, 0.055, 0.06],
          shadowAlpha: [0.18, 0.2, 0.22],
          shadowBlurPt: [4.2, 4.6, 5.0],
          shadowDistancePt: [1.2, 1.6, 2.0],
          shadowAngleDeg: [45]
        },
        container: {
          radiusRatio: [0.045, 0.05],
          shadowAlpha: [0.16, 0.18],
          shadowBlurPt: [4.0, 4.4],
          shadowDistancePt: [1.2, 1.5],
          shadowAngleDeg: [45]
        }
      }
    },
    textOcr: {
      enabled: true,
      adapter: DEFAULT_OCR_ADAPTER,
      mode: "anchored",
      paddingPt: 16,
      upscale: 1,
      psm: 6,
      preprocess: false
    },
    ...defaultOcrProviderConfigs(),
    textMicroAdjust: {
      enabled: true,
      minCoverage: 0.995,
      paddingPt: 16,
      maxMovePt: 3,
      maxHeightAdjustPt: 2.5,
      minDeltaPt: 0.15,
      inspectAligned: true,
      maxLayoutRegression: 0.08,
      maxCriticalOffsetIncreasePt: 6,
      layoutPenaltyWeight: 0.35,
      criticalPenaltyWeight: 0.002
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
  if (!ir || typeof ir !== "object" || Array.isArray(ir)) {
    return { ok: false, errors: ["IR must be an object"], warnings };
  }
  if (!ir || ir.version !== "1.0") errors.push("version must be 1.0");
  if (!ir.slideSize || typeof ir.slideSize.widthPt !== "number" || typeof ir.slideSize.heightPt !== "number") {
    errors.push("slideSize.widthPt and slideSize.heightPt are required numbers");
  }
  if (!Array.isArray(ir.pages)) errors.push("pages must be an array");
  const slideWidth = ir?.slideSize?.widthPt || 0;
  const slideHeight = ir?.slideSize?.heightPt || 0;
  const pages = Array.isArray(ir.pages) ? ir.pages : [];
  pages.forEach((page, pageIdx) => {
    const pageLabel = `pages[${pageIdx}]`;
    if (!page || typeof page !== "object" || Array.isArray(page)) {
      errors.push(`${pageLabel} must be an object`);
      return;
    }
    if (typeof page.pageIndex !== "number") errors.push(`${pageLabel}.pageIndex must be a number`);
    if (typeof page.sourceImage !== "string" || !page.sourceImage.trim()) {
      errors.push(`${pageLabel}.sourceImage is required`);
    } else {
      validateExistingFile(`${pageLabel}.sourceImage`, page.sourceImage, options, warnings);
    }
    const ids = new Map();
    const collections = {};
    ["textBoxes", "shapes", "images", "tables", "charts", "icons"].forEach((key) => {
      if (!Array.isArray(page[key])) errors.push(`pages[${pageIdx}].${key} must be an array`);
      collections[key] = Array.isArray(page[key]) ? page[key] : [];
    });
    collections.textBoxes.forEach((textBox, boxIdx) => {
      const label = `${pageLabel}.textBoxes[${boxIdx}]`;
      if (!validateElementCommon(textBox, label, "text", { errors, warnings, ids, options, slideWidth, slideHeight })) return;
      if (typeof textBox.text !== "string") errors.push(`${label}.text must be a string`);
      if (!textBox.font?.family) warnings.push(`${label}.font.family is missing; PowerPoint may substitute fonts.`);
    });
    ["shapes", "images", "tables", "charts", "icons"].forEach((key) => {
      collections[key].forEach((item, itemIdx) => {
        const label = `${pageLabel}.${key}[${itemIdx}]`;
        if (!validateElementCommon(item, label, key, { errors, warnings, ids, options, slideWidth, slideHeight })) return;
        if (!item.type) errors.push(`${label}.type is required`);
        if (key === "images") validateImageElement(item, label, { errors, warnings, options });
        if (key === "tables" && !Array.isArray(item.rows)) warnings.push(`${label}.rows is missing; table may not be editable.`);
      });
    });
  });
  const reconstruction = validateReconstructionContracts(ir, options);
  errors.push(...reconstruction.errors);
  warnings.push(...reconstruction.warnings);
  return { ok: errors.length === 0, errors, warnings };
}

function prepareReconstructionIrForBuild(ir, options = {}) {
  const irFile = path.resolve(options.irFile || path.join(process.cwd(), "deck.json"));
  const baseDir = path.dirname(irFile);
  const preparedIr = enrichReconstructionContracts(ir, { baseDir });
  return {
    ir: preparedIr,
    validation: validateIr(preparedIr, {
      baseDir,
      checkFiles: options.checkFiles !== false,
      allowManualRequired: options.allowManualRequired === true
    }),
    inventory: buildReconstructionInventory(preparedIr)
  };
}

function isBox(box) {
  return box && ["x", "y", "w", "h"].every((key) => Number.isFinite(box[key]));
}

function validateElementCommon(item, label, group, state) {
  const { errors, warnings, ids, options, slideWidth, slideHeight } = state;
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    errors.push(`${label} must be an object`);
    return false;
  }
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
  return true;
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

async function loadAdapter(configDir, adapterPath, options = {}) {
  return loadTrustedAdapter({
    configDir,
    skillRoot,
    adapterPath,
    allowExternal: options.allowExternal === true
  });
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
  const config = assertValidConfig(readJson(configFile, 1024 * 1024));
  const inputDir = path.resolve(configDir, config.inputDir);
  const outputDir = path.resolve(configDir, config.outputDir);
  const inputFiles = resolveRequestedInputFiles(args["input-file"], inputDir);
  ensureRunDirs(outputDir);
  const adapterOptions = { allowExternal: args["allow-external-adapters"] === true };

  const context = {
    config,
    configFile,
    inputDir,
    outputDir,
    inputFiles,
    skillRoot
  };

  const normalize = await loadAdapter(configDir, config.adapters.normalize || defaultAdapters.normalize, adapterOptions);
  const normalizeResult = assertAdapterOk("normalize", await normalize({ inputDir, outputDir }, context));
  const pages = normalizeResult.data?.pageImages || [];
  if (pages.length === 0) {
    const unsupported = normalizeResult.data?.unsupportedSources || [];
    const suffix = unsupported.length > 0
      ? ` Unsupported inputs need a real normalize adapter first: ${unsupported.join(", ")}.`
      : "";
    throw new Error(`No normalized page images found in ${inputDir}. Put png/jpg/jpeg/webp pages there first or configure a PDF/PPTX normalizer.${suffix}`);
  }

  const ocr = await loadAdapter(configDir, config.adapters.ocr, adapterOptions);
  const vision = await loadAdapter(configDir, config.adapters.vision, adapterOptions);
  const pptx = await loadAdapter(configDir, config.adapters.pptx, adapterOptions);
  const render = await loadAdapter(configDir, config.adapters.render, adapterOptions);
  const diff = await loadAdapter(configDir, config.adapters.diff, adapterOptions);
  const compare = await loadAdapter(configDir, config.adapters.compare || defaultAdapters.compare, adapterOptions);
  const polish = await loadAdapter(configDir, config.adapters.polish || defaultAdapters.polish, adapterOptions);
  const compress = await loadAdapter(configDir, config.adapters.compress || defaultAdapters.compress, adapterOptions);

  const ir = {
    version: "1.0",
    slideSize: {
      widthPt: config.slide?.widthPt || 960,
      heightPt: config.slide?.heightPt || 540
    },
    pages: []
  };

  const pagePipeline = await processPages({
    pages,
    slideSize: ir.slideSize,
    ocr,
    vision,
    context,
    requestedConcurrency: config.pageConcurrency || 1
  });
  ir.pages = pagePipeline.pages;

  const irFile = path.join(outputDir, "ir", "deck.json");
  const prepared = prepareReconstructionIrForBuild(ir, { irFile, checkFiles: true });
  const enrichedIr = prepared.ir;
  writeJson(irFile, enrichedIr);
  writeJson(
    path.join(outputDir, "reports", "reconstruction-inventory.json"),
    prepared.inventory
  );

  const validation = prepared.validation;
  writeJson(path.join(outputDir, "reports", "ir-validation.json"), {
    ok: validation.errors.length === 0,
    errors: validation.errors,
    warnings: validation.warnings
  });
  if (validation.errors.length > 0) {
    throw new Error(`IR validation failed. See ${path.join(outputDir, "reports", "ir-validation.json")}`);
  }

  let currentIr = enrichedIr;
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
    pageConcurrency: pagePipeline.concurrency,
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
  let containerStyleFitSummary = null;
  let acceptedState = null;

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
  if (config.containerStyleFit?.enabled === true) {
    const styleFitResult = await optimizeContainerStyles({
      config,
      context,
      adapters,
      ir: currentIr,
      irFile: currentIrFile,
      pptxResult: currentPptxResult
    });
    containerStyleFitSummary = styleFitResult.summary;
    currentIr = styleFitResult.ir;
    currentIrFile = styleFitResult.irFile;
    currentPptxResult = styleFitResult.pptxResult;
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

    const preferred = iteration === 0
      || isPreferredCompare(compareResult.data, acceptedState?.compare || null, config.thresholds);
    if (!preferred && acceptedState) {
      currentIr = acceptedState.ir;
      currentIrFile = acceptedState.irFile;
      currentPptxResult = acceptedState.pptxResult;
      lastCompare = acceptedState.compare;
      break;
    }

    lastCompare = compareResult.data;
    acceptedState = {
      ir: currentIr,
      irFile: currentIrFile,
      pptxResult: currentPptxResult,
      compare: compareResult.data
    };
    iterations.push({
      iteration,
      irFile: currentIrFile,
      pptx: currentPptxResult.data,
      render: renderResult.data,
      diff: diffResult.data,
      compare: compareResult.data
    });

    const passed = compareResult.data?.passed === true;
    const needsTextMicroPolish = hasTextMicroPolishOpportunity(compareResult.data, config);
    const shouldStop = passed
      && postprocess.stopWhenThresholdPassed
      && !needsTextMicroPolish;
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

    currentIrFile = path.join(context.outputDir, "ir", `deck.polished.${iteration + 1}.json`);
    const preparedPolished = prepareReconstructionIrForBuild(polishResult.data.ir, {
      irFile: currentIrFile,
      checkFiles: true
    });
    currentIr = preparedPolished.ir;
    writeJson(currentIrFile, currentIr);
    writeJson(path.join(context.outputDir, "reports", `ir-validation.polished.${iteration + 1}.json`), {
      ok: preparedPolished.validation.ok,
      errors: preparedPolished.validation.errors,
      warnings: preparedPolished.validation.warnings
    });
    if (!preparedPolished.validation.ok) {
      throw new Error(`Polished IR validation failed. See ${path.join(context.outputDir, "reports", `ir-validation.polished.${iteration + 1}.json`)}`);
    }
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
    compress: compressResult.data,
    priorRender: matchingFinalRender(iterations, currentPptxResult.data?.pptxFile)
  });
  writeJson(
    path.join(context.outputDir, "reports", "reconstruction-inventory.json"),
    buildReconstructionInventory(currentIr)
  );

  writeJson(path.join(context.outputDir, "reports", "postprocess-result.json"), {
    ok: true,
    finalIrFile: currentIrFile,
    finalPptx: currentPptxResult.data,
    delivery,
    compare: lastCompare,
    fontFit: fontFitSummary,
    containerStyleFit: containerStyleFitSummary,
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
    containerStyleFit: containerStyleFitSummary,
    polish: polishSummary,
    compress: compressResult.data,
    iterations
  };
}

function matchingFinalRender(iterations, finalPptxFile) {
  if (!Array.isArray(iterations) || typeof finalPptxFile !== "string" || !finalPptxFile) return null;
  const last = iterations[iterations.length - 1];
  if (typeof last?.pptx?.pptxFile !== "string" || path.resolve(last.pptx.pptxFile) !== path.resolve(finalPptxFile)) return null;
  return last.render || null;
}

function resolveRequestedInputFiles(value, inputDir) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error("--input-file must be a non-empty file path");
  const root = fs.realpathSync.native(inputDir);
  const candidate = path.isAbsolute(value) ? path.resolve(value) : path.resolve(inputDir, value);
  const relative = path.relative(root, candidate);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("--input-file must be an existing child file of config.inputDir");
  }
  let info;
  try {
    info = fs.lstatSync(candidate);
  } catch {
    throw new Error("--input-file must be an existing child file of config.inputDir");
  }
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("--input-file must be an existing non-symbolic child file of config.inputDir");
  const actual = fs.realpathSync.native(candidate);
  const actualRelative = path.relative(root, actual);
  if (!actualRelative || actualRelative === ".." || actualRelative.startsWith(`..${path.sep}`) || path.isAbsolute(actualRelative)) {
    throw new Error("--input-file must resolve inside config.inputDir");
  }
  return [actual];
}

function hasTextMicroPolishOpportunity(compare, config = {}) {
  if (config.textMicroAdjust?.enabled === false) return false;
  const minCoverage = Number(config.textMicroAdjust?.minCoverage ?? 0.995);
  if (!Number.isFinite(minCoverage)) return false;
  const pages = compare?.textCoverage?.pages;
  if (!Array.isArray(pages)) return false;
  return pages.some((page) =>
    (page?.boxes || []).some((box) => box?.ok === true && (
      (typeof box.textCoverage === "number" && box.textCoverage < minCoverage)
      || (typeof box.expectedCoverage === "number" && box.expectedCoverage < minCoverage)
    )));
}

function isPreferredCompare(candidate, baseline, thresholds = {}) {
  if (!baseline) return true;
  const candidateVector = compareVector(candidate, thresholds);
  const baselineVector = compareVector(baseline, thresholds);
  for (let index = 0; index < candidateVector.length; index += 1) {
    if (candidateVector[index] === baselineVector[index]) continue;
    return candidateVector[index] > baselineVector[index];
  }
  return true;
}

function compareVector(compare, thresholds = {}) {
  const metrics = compare?.summary || {};
  const checks = Array.isArray(compare?.checks) ? compare.checks : [];
  const requiredFailures = checks.filter((check) => check.required && check.passed !== true).length;
  const optionalFailures = checks.filter((check) => !check.required && check.passed !== true).length;
  const textCoverage = typeof metrics.textCoverage === "number" ? metrics.textCoverage : -1;
  const layoutMeanIoU = typeof metrics.layoutMeanIoU === "number" ? metrics.layoutMeanIoU : -1;
  const pixelDiff = typeof metrics.pixelDiffRatio === "number" ? metrics.pixelDiffRatio : Number.POSITIVE_INFINITY;
  const foregroundMissing = typeof metrics.foregroundMissingRatio === "number" ? metrics.foregroundMissingRatio : Number.POSITIVE_INFINITY;
  const maxCriticalOffset = typeof metrics.maxCriticalOffsetPt === "number" ? metrics.maxCriticalOffsetPt : Number.POSITIVE_INFINITY;
  const textDelta = typeof thresholds.textCoverage === "number" && typeof metrics.textCoverage === "number"
    ? metrics.textCoverage - thresholds.textCoverage
    : textCoverage;
  const layoutDelta = typeof thresholds.layoutMeanIoU === "number" && typeof metrics.layoutMeanIoU === "number"
    ? metrics.layoutMeanIoU - thresholds.layoutMeanIoU
    : layoutMeanIoU;
  const offsetDelta = typeof thresholds.maxCriticalOffsetPt === "number" && typeof metrics.maxCriticalOffsetPt === "number"
    ? thresholds.maxCriticalOffsetPt - metrics.maxCriticalOffsetPt
    : -maxCriticalOffset;
  return [
    requiredFailures * -1,
    textDelta,
    layoutDelta,
    optionalFailures * -1,
    offsetDelta,
    pixelDiff * -1,
    foregroundMissing * -1
  ];
}

async function optimizeFonts({ config, context, adapters, ir, irFile, pptxResult }) {
  if (shouldUseRoleFontFit(config)) {
    return optimizeFontsByRole({ config, context, adapters, ir, irFile, pptxResult });
  }
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

async function optimizeFontsByRole({ config, context, adapters, ir, irFile, pptxResult }) {
  const plan = getRoleFitPlan(ir, config.fontFit || {});
  const maxTrialsPerRole = positiveIntOrNull(config.fontFit?.maxTrialsPerRole);
  const fastRankEnabled = config.fontFit?.fastRank?.enabled === true;
  const fastRankTopN = positiveIntOrNull(config.fontFit?.fastRank?.topN) || maxTrialsPerRole || 2;
  const summary = {
    provider: "font-fit-role-render-diff",
    enabled: true,
    mode: "role-greedy",
    fastRank: null,
    selected: null,
    changed: false,
    roles: plan,
    baseline: null,
    trials: [],
    roleTrials: []
  };
  if (plan.length === 0 || countTextBoxes(ir) === 0) {
    summary.skipped = true;
    summary.reason = plan.length === 0 ? "No text roles available for role-based font fit." : "IR has no text boxes.";
    writeJson(path.join(context.outputDir, "reports", "font-fit-result.json"), summary);
    return { ir, irFile, pptxResult, summary };
  }

  let current = await evaluateFontTrial({
    context,
    adapters,
    ir,
    irFile,
    iterationLabel: "fontfit-role-baseline",
    label: "baseline",
    pptxResult
  });
  summary.baseline = current.trial;
  summary.trials.push(current.trial);

  const optionsByRole = plan.map((rolePlan) => ({
    role: rolePlan.role,
    options: roleFontOptions(rolePlan)
  }));
  const fastRank = fastRankEnabled
    ? await rankRoleFontOptions({
      skillRoot,
      outputDir: context.outputDir,
      ir: current.ir,
      irFile: current.irFile,
      roles: optionsByRole,
      topN: fastRankTopN
    })
    : null;
  if (fastRank) {
    summary.fastRank = {
      ok: fastRank.ok,
      reportFile: fastRank.reportFile,
      inputFile: fastRank.inputFile,
      topN: fastRankTopN,
      preselectOnly: config.fontFit?.fastRank?.preselectOnly === true,
      provider: fastRank.data?.provider || null,
      error: fastRank.ok ? null : fastRank.error || "font fast rank failed"
    };
  }

  if (fastRank?.ok === true && config.fontFit?.fastRank?.preselectOnly === true) {
    const baseline = current;
    let selectedIr = current.ir;
    let selectedIrFile = current.irFile;
    let changed = false;
    for (const rolePlan of plan) {
      const allOptions = roleFontOptions(rolePlan);
      const rankedOptions = rankedOptionsForRole(fastRank, rolePlan.role, allOptions);
      const selectedEntry = fastRank.data?.rankings?.[rolePlan.role]?.[0] || null;
      const option = rankedOptions[0];
      const roleResult = {
        role: rolePlan.role,
        count: rolePlan.count,
        baselineScore: current.trial.score,
        selected: null,
        improved: false,
        fastRanked: true,
        preselected: true,
        availableTrialCount: allOptions.length,
        trials: []
      };
      if (option) {
        const applied = applyRoleFontOption(selectedIr, rolePlan.role, option);
        const trial = {
          label: describeRoleOption(rolePlan.role, option),
          role: rolePlan.role,
          option,
          verified: false,
          fastRankScore: selectedEntry?.score ?? null
        };
        roleResult.trials.push(trial);
        roleResult.selected = trial;
        if (applied.changed) {
          selectedIr = applied.ir;
          changed = true;
        }
      }
      summary.roleTrials.push(roleResult);
    }
    if (changed) {
      selectedIrFile = path.join(context.outputDir, "ir", "deck.fontfit-role-fast-rank-selected.json");
      current = await evaluateFontTrial({
        context,
        adapters,
        ir: selectedIr,
        irFile: selectedIrFile,
        iterationLabel: "fontfit-role-fast-rank-selected",
        label: "fast-rank-selected"
      });
      summary.trials.push(current.trial);
      if (current.trial.score >= baseline.trial.score) {
        summary.preselectRejected = {
          reason: "Fast-rank preselection did not improve the verified PowerPoint diff score.",
          baselineScore: baseline.trial.score,
          candidateScore: current.trial.score
        };
        current = baseline;
        changed = false;
      }
    }
    summary.selected = current.trial;
    summary.changed = changed;
    const finalPptxFile = preservePptx(current.pptxResult.data?.pptxFile, context.outputDir, "deck.pptx");
    if (finalPptxFile) {
      current.pptxResult = {
        ...current.pptxResult,
        data: {
          ...current.pptxResult.data,
          pptxFile: finalPptxFile,
          selectedCandidatePptxFile: current.trial.pptxFile
        }
      };
      summary.finalPptxFile = finalPptxFile;
    }
    writeJson(path.join(context.outputDir, "reports", "font-fit-result.json"), summary);
    return {
      ir: current.ir,
      irFile: current.irFile,
      pptxResult: current.pptxResult,
      summary
    };
  }

  for (const rolePlan of plan) {
    const roleResult = {
      role: rolePlan.role,
      count: rolePlan.count,
      baselineScore: current.trial.score,
      selected: null,
      improved: false,
      trials: []
    };
    let bestForRole = current;
    const allOptions = roleFontOptions(rolePlan);
    const rankedOptions = fastRank?.ok === true
      ? rankedOptionsForRole(fastRank, rolePlan.role, allOptions)
      : allOptions;
    roleResult.fastRanked = fastRank?.ok === true;
    roleResult.availableTrialCount = allOptions.length;
    for (const option of rankedOptions) {
      if (maxTrialsPerRole && roleResult.trials.length >= maxTrialsPerRole) {
        roleResult.truncated = true;
        break;
      }
      const applied = applyRoleFontOption(current.ir, rolePlan.role, option);
      if (!applied.changed) continue;
      const label = `fontfit-role-${sanitizeName(rolePlan.role)}-${roleResult.trials.length + 1}`;
      const evaluated = await evaluateFontTrial({
        context,
        adapters,
        ir: applied.ir,
        irFile: path.join(context.outputDir, "ir", `deck.${label}.json`),
        iterationLabel: label,
        label: describeRoleOption(rolePlan.role, option)
      });
      const roleTrial = {
        ...evaluated.trial,
        role: rolePlan.role,
        option
      };
      roleResult.trials.push(roleTrial);
      summary.trials.push(roleTrial);
      if (evaluated.trial.score < bestForRole.trial.score) {
        bestForRole = evaluated;
        roleResult.selected = roleTrial;
        roleResult.improved = true;
      }
    }
    summary.roleTrials.push(roleResult);
    current = bestForRole;
  }

  summary.selected = current.trial;
  summary.changed = current.irFile !== irFile || current.trial.label !== "baseline";
  const finalPptxFile = preservePptx(current.pptxResult.data?.pptxFile, context.outputDir, "deck.pptx");
  if (finalPptxFile) {
    current.pptxResult = {
      ...current.pptxResult,
      data: {
        ...current.pptxResult.data,
        pptxFile: finalPptxFile,
        selectedCandidatePptxFile: current.trial.pptxFile
      }
    };
    summary.finalPptxFile = finalPptxFile;
  }
  writeJson(path.join(context.outputDir, "reports", "font-fit-result.json"), summary);
  return {
    ir: current.ir,
    irFile: current.irFile,
    pptxResult: current.pptxResult,
    summary
  };
}

async function optimizeContainerStyles({ config, context, adapters, ir, irFile, pptxResult }) {
  const plan = collectContainerStylePlan(ir, config.containerStyleFit || {});
  const maxTrialsPerTarget = positiveIntOrNull(config.containerStyleFit?.maxTrialsPerTarget);
  const summary = {
    provider: "container-style-fit-render-diff",
    enabled: true,
    mode: "container-greedy",
    selected: null,
    changed: false,
    targets: plan,
    baseline: null,
    trials: [],
    targetTrials: []
  };
  if (plan.length === 0) {
    summary.skipped = true;
    summary.reason = "No rounded container shapes available for style fit.";
    writeJson(path.join(context.outputDir, "reports", "container-style-fit-result.json"), summary);
    return { ir, irFile, pptxResult, summary };
  }

  let current = await evaluateFontTrial({
    context,
    adapters,
    ir,
    irFile,
    iterationLabel: "containerfit-baseline",
    label: "baseline",
    pptxResult
  });
  summary.baseline = current.trial;
  summary.trials.push(current.trial);

  for (const target of plan) {
    const targetResult = {
      elementId: target.elementId,
      pageIndex: target.pageIndex,
      kind: target.kind,
      baselineScore: current.trial.score,
      selected: null,
      improved: false,
      trials: []
    };
    let bestForTarget = current;
    for (const option of containerStyleOptions(target)) {
      if (maxTrialsPerTarget && targetResult.trials.length >= maxTrialsPerTarget) {
        targetResult.truncated = true;
        break;
      }
      const applied = applyContainerStyleOption(current.ir, target, option);
      if (!applied.changed) continue;
      const label = `containerfit-${sanitizeName(target.elementId)}-${targetResult.trials.length + 1}`;
      const evaluated = await evaluateFontTrial({
        context,
        adapters,
        ir: applied.ir,
        irFile: path.join(context.outputDir, "ir", `deck.${label}.json`),
        iterationLabel: label,
        label: describeContainerOption(target, option)
      });
      const targetTrial = {
        ...evaluated.trial,
        elementId: target.elementId,
        pageIndex: target.pageIndex,
        kind: target.kind,
        option
      };
      targetResult.trials.push(targetTrial);
      summary.trials.push(targetTrial);
      if (evaluated.trial.score < bestForTarget.trial.score) {
        bestForTarget = evaluated;
        targetResult.selected = targetTrial;
        targetResult.improved = true;
      }
    }
    summary.targetTrials.push(targetResult);
    current = bestForTarget;
  }

  summary.selected = current.trial;
  summary.changed = current.irFile !== irFile || current.trial.label !== "baseline";
  const finalPptxFile = preservePptx(current.pptxResult.data?.pptxFile, context.outputDir, "deck.pptx");
  if (finalPptxFile) {
    current.pptxResult = {
      ...current.pptxResult,
      data: {
        ...current.pptxResult.data,
        pptxFile: finalPptxFile,
        selectedCandidatePptxFile: current.trial.pptxFile
      }
    };
    summary.finalPptxFile = finalPptxFile;
  }
  writeJson(path.join(context.outputDir, "reports", "container-style-fit-result.json"), summary);
  return {
    ir: current.ir,
    irFile: current.irFile,
    pptxResult: current.pptxResult,
    summary
  };
}

async function evaluateFontTrial({ context, adapters, ir, irFile, iterationLabel, label, pptxResult = null }) {
  writeJson(irFile, ir);
  const candidatePptx = pptxResult || assertAdapterOk("font-fit-pptx", await adapters.pptx({
    irFile,
    ir,
    iteration: iterationLabel
  }, context));
  const preservedPptxFile = preservePptx(candidatePptx.data?.pptxFile, context.outputDir, `deck.${sanitizeName(iterationLabel)}.pptx`);
  const renderResult = assertAdapterOk("font-fit-render", await adapters.render({
    irFile,
    ir,
    pptx: { ...candidatePptx.data, pptxFile: preservedPptxFile || candidatePptx.data?.pptxFile },
    iteration: iterationLabel
  }, context));
  const diffResult = assertAdapterOk("font-fit-diff", await adapters.diff({
    irFile,
    ir,
    render: renderResult.data,
    iteration: iterationLabel
  }, context));
  const score = scoreDiff(diffResult.data?.summary);
  return {
    ir,
    irFile,
    pptxResult: {
      ...candidatePptx,
      data: {
        ...candidatePptx.data,
        pptxFile: preservedPptxFile || candidatePptx.data?.pptxFile
      }
    },
    trial: {
      label,
      irFile,
      pptxFile: preservedPptxFile || candidatePptx.data?.pptxFile,
      renderDir: renderResult.data?.renderDir,
      diffReportFile: diffResult.data?.reportFile,
      score,
      pixelDiffRatio: diffResult.data?.summary?.pixelDiffRatio ?? null,
      foregroundMissingRatio: diffResult.data?.summary?.foregroundMissingRatio ?? null,
      foregroundMissingRatioRaw: diffResult.data?.summary?.foregroundMissingRatioRaw ?? null
    }
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

function shouldUseRoleFontFit(config = {}) {
  return config.fontFit?.mode === "role-greedy" || Boolean(config.fontFit?.roleCandidates);
}

function roleFontOptions(rolePlan) {
  const options = [];
  for (const family of rolePlan.families) {
    for (const weight of rolePlan.weights) {
      for (const sizeAdjustPt of rolePlan.sizeAdjustPt) {
        options.push({ family, weight, sizeAdjustPt });
      }
    }
  }
  return options;
}

function containerStyleOptions(target) {
  const options = [];
  for (const radiusRatio of target.radiusRatio) {
    for (const alpha of target.shadowAlpha) {
      for (const blurPt of target.shadowBlurPt) {
        for (const distancePt of target.shadowDistancePt) {
          for (const angleDeg of target.shadowAngleDeg) {
            options.push({ radiusRatio, alpha, blurPt, distancePt, angleDeg, color: target.current.shadow.color });
          }
        }
      }
    }
  }
  return options;
}

function positiveIntOrNull(value) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function sanitizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "trial";
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

function writeDeliverySummary({ config, outputDir, pages, normalize, postprocess, pipeline }) {
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
    schemaVersion: 1,
    provider: "slideclone-delivery-summary",
    generatedAt: new Date().toISOString(),
    status: overallPassed ? "passed" : "failed",
    passed: overallPassed,
    pages: {
      count: pages.length,
      imageOnlyCount: countImageOnlyPages(normalize)
    },
    adapters: summarizeDeliveryAdapters(config),
    artifacts: {
      irFile: deliveryArtifactPath(postprocess.irFile, outputDir),
      pptxFile: deliveryArtifactPath(postprocess.pptx?.pptxFile, outputDir),
      deliveryPptxFile: deliveryArtifactPath(delivery.pptxFile, outputDir),
      compressedPptxFile: deliveryArtifactPath(compress.compressedPptxFile, outputDir),
      postprocessReport: "reports/postprocess-result.json",
      pipelineReport: "reports/pipeline-result.json",
      diffReport: deliveryArtifactPath(latestDiffReport(postprocess.iterations), outputDir),
      textCoverageReport: deliveryArtifactPath(compare.textCoverage?.reportFile, outputDir),
      compressionReport: deliveryArtifactPath(compress.reportFile, outputDir),
      renderedDeliveryPages: (delivery.verification?.renderedPages || [])
        .map((file) => deliveryArtifactPath(file, outputDir))
        .filter(Boolean)
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
      renderDir: deliveryArtifactPath(delivery.verification?.renderDir, outputDir),
      renderedPageCount: Array.isArray(delivery.verification?.renderedPages)
        ? delivery.verification.renderedPages.length
        : 0
    },
    fontFit: postprocess.fontFit
      ? {
        selected: postprocess.fontFit.selected?.family || postprocess.fontFit.selected?.label || null,
        changed: postprocess.fontFit.changed === true,
        trials: (postprocess.fontFit.trials || []).map((trial) => ({
          family: trial.family || null,
          label: trial.label || null,
          role: trial.role || null,
          score: trial.score,
          pixelDiffRatio: trial.pixelDiffRatio,
          foregroundMissingRatio: trial.foregroundMissingRatio
        }))
      }
      : null,
    containerStyleFit: postprocess.containerStyleFit
      ? {
        selected: postprocess.containerStyleFit.selected?.label || null,
        changed: postprocess.containerStyleFit.changed === true,
        trials: (postprocess.containerStyleFit.trials || []).map((trial) => ({
          elementId: trial.elementId || null,
          kind: trial.kind || null,
          label: trial.label || null,
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

function summarizeDeliveryAdapters(config = {}) {
  const adapters = {};
  for (const [name, value] of Object.entries(config.adapters || {})) {
    adapters[name] = deliveryAdapterId(value);
  }
  adapters.textOcr = config.textOcr?.enabled === true ? deliveryAdapterId(config.textOcr.adapter) : null;
  return adapters;
}

function deliveryAdapterId(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  return path.basename(value.trim(), path.extname(value.trim())).slice(0, 128) || null;
}

function deliveryArtifactPath(value, outputDir) {
  if (typeof value !== "string" || !value.trim()) return null;
  const root = path.resolve(outputDir);
  const absolute = path.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value);
  const relative = path.relative(root, absolute);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join("/");
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

async function verifyDelivery({ postprocess, context, render, ir, pptx, compress, priorRender = null }) {
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
    const priorVerification = renderedDeliveryVerification(priorRender);
    if (priorVerification) {
      delivery.verified = true;
      delivery.verification = priorVerification;
      return delivery;
    }
    delivery.verification = compressedPptxFile
      ? { skipped: true, reason: "postprocess.verifyCompressed=false" }
      : { skipped: true, reason: "No rendered delivery verification was requested." };
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

function renderedDeliveryVerification(render) {
  if (!render || typeof render !== "object" || !Array.isArray(render.renderedPages) || render.renderedPages.length === 0) return null;
  const renderedPages = render.renderedPages
    .filter((page) => page && typeof page.image === "string" && page.image)
    .map((page) => ({ ...page }));
  if (renderedPages.length !== render.renderedPages.length || /placeholder/i.test(String(render.provider || ""))) return null;
  return {
    provider: typeof render.provider === "string" ? render.provider : null,
    renderDir: typeof render.renderDir === "string" ? render.renderDir : null,
    renderedPages
  };
}

async function validateCommand(args) {
  if (!args.ir) throw new Error("--ir is required");
  const irFile = path.resolve(args.ir);
  const ir = readJson(irFile, 128 * 1024 * 1024);
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
  const summary = readJson(summaryFile, 16 * 1024 * 1024);
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

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  createConfig,
  loadAdapter,
  parseArgs,
  prepareReconstructionIrForBuild,
  readJson,
  renderedDeliveryVerification,
  verifyDelivery,
  validateIr
};
