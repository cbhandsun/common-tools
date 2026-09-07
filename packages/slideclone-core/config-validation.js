// @ts-check
"use strict";

const ADAPTER_KEYS = Object.freeze([
  "normalize",
  "ocr",
  "vision",
  "pptx",
  "render",
  "diff",
  "compare",
  "polish",
  "compress"
]);

const REQUIRED_ADAPTER_KEYS = Object.freeze(["ocr", "vision", "pptx", "render", "diff"]);

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  "inputDir",
  "outputDir",
  "pagePattern",
  "slide",
  "adapters",
  "compress",
  "diff",
  "fontFit",
  "containerStyleFit",
  "textOcr",
  "umiOcr",
  "paddleOcr",
  "textMicroAdjust",
  "tesseract",
  "normalize",
  "powerPoint",
  "regionProposal",
  "thresholds",
  "maxIterations",
  "postprocess",
  "openXmlBuilder",
  "python",
  "render",
  "searchTextOcr",
  "pageConcurrency"
]);

/** @param {unknown} config */
function validateConfig(config) {
  /** @type {string[]} */
  const errors = [];
  if (!isRecord(config)) return { ok: false, errors: ["config must be a JSON object"] };

  if (Object.keys(config).some((key) => !ALLOWED_TOP_LEVEL_KEYS.has(key))) errors.push("config contains an unsupported field");

  requireNonEmptyString(config, "inputDir", errors);
  requireNonEmptyString(config, "outputDir", errors);
  validateAdapters(config.adapters, errors);

  if (config.pagePattern !== undefined && !isNonEmptyString(config.pagePattern)) {
    errors.push("config.pagePattern must be a non-empty string");
  }
  validatePositiveNumber(config.slide, "widthPt", "config.slide", errors);
  validatePositiveNumber(config.slide, "heightPt", "config.slide", errors);
  validateInteger(config.maxIterations, "config.maxIterations", errors, { min: 0, max: 20 });
  validateInteger(config.pageConcurrency, "config.pageConcurrency", errors, { min: 1, max: 8 });

  if (config.normalize !== undefined && !isRecord(config.normalize)) {
    errors.push("config.normalize must be an object");
  } else if (isRecord(config.normalize)) {
    validateInteger(config.normalize?.exportWidthPx, "config.normalize.exportWidthPx", errors, { min: 320, max: 16384 });
    validateInteger(config.normalize?.exportHeightPx, "config.normalize.exportHeightPx", errors, { min: 180, max: 16384 });
    validateInteger(config.normalize?.maxPages, "config.normalize.maxPages", errors, { min: 0, max: 10000 });
  }

  if (config.thresholds !== undefined && !isRecord(config.thresholds)) {
    errors.push("config.thresholds must be an object");
  } else if (isRecord(config.thresholds)) {
    for (const key of [
      "pixelDiffRatio",
      "foregroundMissingRatio",
      "layoutMeanIoU",
      "textCoverage",
      "maxCriticalOffsetPt",
      "maxOutOfBoundsPt",
      "maxImageAspectRatioDelta",
      "maxRasterImageAreaRatio"
    ]) {
      validateFiniteNumber(config.thresholds?.[key], `config.thresholds.${key}`, errors);
    }
  }

  for (const key of [
    "compress",
    "diff",
    "fontFit",
    "containerStyleFit",
    "textOcr",
    "umiOcr",
    "paddleOcr",
    "textMicroAdjust",
    "tesseract",
    "powerPoint",
    "regionProposal",
    "postprocess",
    "openXmlBuilder",
    "python",
    "render",
    "searchTextOcr"
  ]) {
    if (config[key] !== undefined && !isRecord(config[key])) errors.push(`config.${key} must be an object`);
  }

  if (isRecord(config.tesseract)) validateInteger(config.tesseract.timeoutMs, "config.tesseract.timeoutMs", errors, { min: 1000, max: 600000 });
  if (isRecord(config.umiOcr)) {
    validateInteger(config.umiOcr.initTimeoutMs, "config.umiOcr.initTimeoutMs", errors, { min: 1000, max: 600000 });
    validateInteger(config.umiOcr.timeoutMs, "config.umiOcr.timeoutMs", errors, { min: 1000, max: 600000 });
    validateInteger(config.umiOcr.idleTimeoutMs, "config.umiOcr.idleTimeoutMs", errors, { min: 1000, max: 600000 });
    validateInteger(config.umiOcr.maxOutputBytes, "config.umiOcr.maxOutputBytes", errors, { min: 1048576, max: 67108864 });
  }
  validatePaddleOcr(config.paddleOcr, errors);
  validateOpenXmlBuilder(config.openXmlBuilder, errors);

  return { ok: errors.length === 0, errors };
}

/** @param {unknown} value @param {string[]} errors */
function validatePaddleOcr(value, errors) {
  if (value === undefined || !isRecord(value)) return;
  const allowed = new Set([
    "pythonBin", "workerScript", "lang", "ocrVersion", "device", "engine", "cpuThreads",
    "textDetectionModel", "textRecognitionModel", "textDetectionModelDir", "textRecognitionModelDir",
    "modelCacheDir", "enableHpi", "useTextlineOrientation", "initTimeoutMs", "timeoutMs",
    "idleTimeoutMs", "maxOutputBytes", "cache", "cacheDir"
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) errors.push("config.paddleOcr contains an unsupported field");
  for (const key of ["pythonBin", "workerScript", "textDetectionModelDir", "textRecognitionModelDir", "modelCacheDir", "cacheDir"]) {
    validateBoundedString(value[key], `config.paddleOcr.${key}`, errors, 32768);
  }
  if (value.lang !== undefined && (typeof value.lang !== "string" || !/^[A-Za-z0-9_-]{2,32}$/.test(value.lang))) errors.push("config.paddleOcr.lang is invalid");
  if (value.ocrVersion !== undefined && (typeof value.ocrVersion !== "string" || !/^PP-OCRv[3-9]$/.test(value.ocrVersion))) errors.push("config.paddleOcr.ocrVersion is invalid");
  if (value.device !== undefined && (typeof value.device !== "string" || !/^[A-Za-z0-9:_,-]{1,64}$/.test(value.device))) errors.push("config.paddleOcr.device is invalid");
  if (value.engine !== undefined && (typeof value.engine !== "string" || !["paddle", "paddle_static", "paddle_dynamic", "transformers", "onnxruntime"].includes(value.engine))) errors.push("config.paddleOcr.engine is invalid");
  for (const key of ["textDetectionModel", "textRecognitionModel"]) {
    if (value[key] !== undefined && (typeof value[key] !== "string" || !/^[A-Za-z0-9_.-]{1,128}$/.test(value[key]))) errors.push(`config.paddleOcr.${key} is invalid`);
  }
  for (const key of ["enableHpi", "useTextlineOrientation"]) {
    if (value[key] !== undefined && typeof value[key] !== "boolean") errors.push(`config.paddleOcr.${key} must be a boolean`);
  }
  if (value.cache !== undefined && typeof value.cache !== "boolean" && typeof value.cache !== "string") errors.push("config.paddleOcr.cache must be a boolean or string");
  validateInteger(value.cpuThreads, "config.paddleOcr.cpuThreads", errors, { min: 1, max: 128 });
  for (const key of ["initTimeoutMs", "timeoutMs", "idleTimeoutMs"]) validateInteger(value[key], `config.paddleOcr.${key}`, errors, { min: 1000, max: 600000 });
  validateInteger(value.maxOutputBytes, "config.paddleOcr.maxOutputBytes", errors, { min: 1048576, max: 67108864 });
}

/** @param {unknown} value @param {string} label @param {string[]} errors @param {number} maxLength */
function validateBoundedString(value, label, errors, maxLength) {
  if (value !== undefined && (!isNonEmptyString(value) || value.length > maxLength || value.includes("\0"))) errors.push(`${label} must be a bounded non-empty string`);
}

/** @param {unknown} value @param {string[]} errors */
function validateOpenXmlBuilder(value, errors) {
  if (value === undefined || !isRecord(value)) return;
  const allowed = new Set(["configuration", "exePath", "powerPointSafe", "retainBuildArtifacts", "targetFramework"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) errors.push("config.openXmlBuilder contains an unsupported field");
  if (value.configuration !== undefined && (typeof value.configuration !== "string" || !["Debug", "Release", "debug", "release"].includes(value.configuration))) {
    errors.push("config.openXmlBuilder.configuration must be Debug or Release");
  }
  if (value.exePath !== undefined && (!isNonEmptyString(value.exePath) || value.exePath.length > 32768 || value.exePath.includes("\0"))) {
    errors.push("config.openXmlBuilder.exePath must be a bounded non-empty path string");
  }
  if (value.targetFramework !== undefined && (!isNonEmptyString(value.targetFramework) || value.targetFramework.length > 128 || !/^[A-Za-z0-9_.-]+$/.test(value.targetFramework))) {
    errors.push("config.openXmlBuilder.targetFramework is invalid");
  }
  for (const key of ["powerPointSafe", "retainBuildArtifacts"]) {
    if (value[key] !== undefined && typeof value[key] !== "boolean") errors.push(`config.openXmlBuilder.${key} must be a boolean`);
  }
}

/** @template T @param {T} config @returns {T} */
function assertValidConfig(config) {
  const result = validateConfig(config);
  if (!result.ok) {
    const error = Object.assign(new Error(`Invalid slideclone config:\n- ${result.errors.join("\n- ")}`), {
      code: "ERR_SLIDECLONE_CONFIG",
      validationErrors: result.errors
    });
    throw error;
  }
  return config;
}

/** @param {unknown} adapters @param {string[]} errors */
function validateAdapters(adapters, errors) {
  if (!isRecord(adapters)) {
    errors.push("config.adapters must be an object");
    return;
  }
  if (Object.keys(adapters).some((key) => !ADAPTER_KEYS.includes(key))) errors.push("config.adapters contains an unsupported field");
  for (const key of REQUIRED_ADAPTER_KEYS) {
    if (!isBoundedPath(adapters[key])) errors.push(`config.adapters.${key} must be a non-empty string`);
  }
  for (const key of ADAPTER_KEYS) {
    if (adapters[key] !== undefined && !isBoundedPath(adapters[key])) {
      errors.push(`config.adapters.${key} must be a non-empty string`);
    }
  }
}

/** @param {Record<string, unknown>} record @param {string} key @param {string[]} errors */
function requireNonEmptyString(record, key, errors) {
  if (!isBoundedPath(record[key])) errors.push(`config.${key} must be a non-empty string`);
}

/** @param {unknown} record @param {string} key @param {string} label @param {string[]} errors */
function validatePositiveNumber(record, key, label, errors) {
  if (record === undefined) return;
  if (!isRecord(record)) {
    if (!errors.includes(`${label} must be an object`)) errors.push(`${label} must be an object`);
    return;
  }
  const value = record[key];
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value <= 0)) {
    errors.push(`${label}.${key} must be a positive finite number`);
  }
}

/** @param {unknown} value @param {string} label @param {string[]} errors */
function validateFiniteNumber(value, label, errors) {
  if (value !== undefined && !Number.isFinite(value)) errors.push(`${label} must be a finite number`);
}

/** @param {unknown} value @param {string} label @param {string[]} errors @param {{min: number, max: number}} bounds */
function validateInteger(value, label, errors, { min, max }) {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    errors.push(`${label} must be an integer from ${min} to ${max}`);
  }
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} value @returns {value is string} */
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** @param {unknown} value @returns {value is string} */
function isBoundedPath(value) {
  return isNonEmptyString(value) && value.length <= 32768 && !value.includes("\0");
}
module.exports = {
  ADAPTER_KEYS,
  ALLOWED_TOP_LEVEL_KEYS,
  REQUIRED_ADAPTER_KEYS,
  assertValidConfig,
  validateConfig
};
