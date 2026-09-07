// @ts-check
"use strict";
const { validateNativeChartPayload } = require("./chart-native-payload");
const CONTENT_FAMILIES = new Set(["text", "graphic", "data", "geometry", "scene", "unknown"]);
const REALIZATIONS = new Set([
  "native_text",
  "native_shape",
  "native_table",
  "native_chart",
  "source_crop",
  "registered_image_layer",
  "manual_required"
]);
const SOURCE_SUFFICIENCY = new Set(["sufficient", "reconstructable", "insufficient", "unknown"]);
const BOUNDARY_STATES = new Set(["complete", "partial", "occluded", "contaminated", "unknown"]);
const Z_ORDER_ROLES = new Set(["base", "midground", "subject", "foreground", "source_graphic", "native"]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

/** @param {unknown} ir @param {{allowManualRequired?: boolean, requireComplete?: boolean}} [options] */
function validateReconstructionContracts(ir, options = {}) {
  /** @type {string[]} */ const errors = [];
  /** @type {string[]} */ const warnings = [];
  const allowManualRequired = options.allowManualRequired === true;
  const requireComplete = options.requireComplete === true;
  const pages = isPlainObject(ir) ? ir.pages : undefined;
  for (const [pageOffset, page] of (Array.isArray(pages) ? /** @type {unknown[]} */ (pages) : []).entries()) {
    const pageLabel = `pages[${pageOffset}]`;
    validatePageContract(field(page, "reconstruction"), pageLabel, errors, warnings, requireComplete);
    for (const [collection, items] of pageCollections(page)) {
      for (const [itemOffset, item] of items.entries()) {
        const label = `${pageLabel}.${collection}[${itemOffset}].source.reconstruction`;
        const contract = field(field(item, "source"), "reconstruction");
        if (!isPlainObject(contract)) {
          const message = `${label} is missing; run reconstruction enrichment before production delivery`;
          (requireComplete ? errors : warnings).push(message);
          continue;
        }
        validateItemContract(contract, label, { errors, warnings, allowManualRequired });
        if (collection === "charts" && contract.realization === "native_chart") {
          const nativePayload = validateNativeChartPayload(item, `${pageLabel}.${collection}[${itemOffset}]`);
          errors.push(...nativePayload.errors);
        }
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

/** @param {unknown} contract @param {string} label @param {string[]} errors @param {string[]} warnings @param {boolean} requireComplete */
function validatePageContract(contract, label, errors, warnings, requireComplete) {
  if (!isPlainObject(contract)) {
    const message = `${label}.reconstruction is missing`;
    (requireComplete ? errors : warnings).push(message);
    return;
  }
  if (contract.contractVersion !== "1.0") errors.push(`${label}.reconstruction.contractVersion must be 1.0`);
  if (contract.canonicalPageSha256 !== undefined && !SHA256_PATTERN.test(String(contract.canonicalPageSha256))) {
    errors.push(`${label}.reconstruction.canonicalPageSha256 must be a lowercase SHA-256 digest`);
  }
  if (contract.canonicalCanvas !== undefined) validateCanonicalCanvas(contract.canonicalCanvas, `${label}.reconstruction.canonicalCanvas`, errors);
  if (contract.allowCanonicalMedia === true && !nonEmptyString(contract.allowCanonicalMediaReason)) {
    errors.push(`${label}.reconstruction.allowCanonicalMediaReason is required when canonical media is allowed`);
  }
  if (contract.qualityBudget === undefined) warnings.push(`${label}.reconstruction.qualityBudget is missing`);
  else validateQualityBudget(contract.qualityBudget, `${label}.reconstruction.qualityBudget`, errors);
}

/** @param {unknown} value @param {string} label @param {string[]} errors */
function validateQualityBudget(value, label, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  if (value.contractVersion !== "1.0") errors.push(`${label}.contractVersion must be 1.0`);
  if (!(typeof value.policy === "string" && ["editable-first", "hybrid", "fidelity-first"].includes(value.policy))) errors.push(`${label}.policy is invalid`);
  if (typeof value.passed !== "boolean") errors.push(`${label}.passed must be a boolean`);
  if (!Array.isArray(value.reasonCodes) || value.reasonCodes.some((item) => typeof item !== "string" || !/^quality\.[a-z0-9-]+$/.test(item))) {
    errors.push(`${label}.reasonCodes must contain safe quality codes`);
  }
  if (!isPlainObject(value.metrics)) {
    errors.push(`${label}.metrics must be an object`);
    return;
  }
  for (const key of ["residualAreaRatio", "largestResidualAreaRatio"]) {
    if (typeof value.metrics[key] !== "number" || !Number.isFinite(value.metrics[key]) || value.metrics[key] < 0 || value.metrics[key] > 1) errors.push(`${label}.metrics.${key} must be between 0 and 1`);
  }
  for (const key of ["residualCount", "nativeObjectCount", "imageCount"]) {
    if (typeof value.metrics[key] !== "number" || !Number.isSafeInteger(value.metrics[key]) || value.metrics[key] < 0) errors.push(`${label}.metrics.${key} must be a non-negative integer`);
  }
}

/** @param {Record<string, unknown>} contract @param {string} label @param {{errors: string[], warnings: string[], allowManualRequired: boolean}} state */
function validateItemContract(contract, label, state) {
  const { errors, warnings, allowManualRequired } = state;
  if (contract.contractVersion !== "1.0") errors.push(`${label}.contractVersion must be 1.0`);
  validateEnum(contract.family, CONTENT_FAMILIES, `${label}.family`, errors);
  validateEnum(contract.realization, REALIZATIONS, `${label}.realization`, errors);
  validateEnum(contract.sourceSufficiency, SOURCE_SUFFICIENCY, `${label}.sourceSufficiency`, errors);
  validateEnum(contract.boundaryState, BOUNDARY_STATES, `${label}.boundaryState`, errors);
  validateEnum(contract.zOrderRole, Z_ORDER_ROLES, `${label}.zOrderRole`, errors);
  if (contract.canonicalPageSha256 !== undefined && !SHA256_PATTERN.test(String(contract.canonicalPageSha256))) {
    errors.push(`${label}.canonicalPageSha256 must be a lowercase SHA-256 digest`);
  }
  if (contract.canonicalCanvas !== undefined) validateCanonicalCanvas(contract.canonicalCanvas, `${label}.canonicalCanvas`, errors);
  if (contract.realization === "registered_image_layer") {
    if (!safeId(contract.registrationGroupId)) errors.push(`${label}.registrationGroupId is required for registered_image_layer`);
    if (!isPlainObject(contract.canonicalCanvas)) errors.push(`${label}.canonicalCanvas is required for registered_image_layer`);
  }
  if (contract.realization === "native_chart" && contract.dataVerifiable !== true) {
    errors.push(`${label}.dataVerifiable must be true for native_chart`);
  }
  if (contract.realization === "manual_required") {
    if (!nonEmptyString(contract.manualRequiredReason)) errors.push(`${label}.manualRequiredReason is required for manual_required`);
    if (!allowManualRequired) errors.push(`${label} blocks successful delivery because realization is manual_required`);
  } else if (contract.manualRequiredReason !== undefined) {
    warnings.push(`${label}.manualRequiredReason is ignored unless realization is manual_required`);
  }
}

/** @param {unknown} canvas @param {string} label @param {string[]} errors */
function validateCanonicalCanvas(canvas, label, errors) {
  if (!isPlainObject(canvas)) {
    errors.push(`${label} must be an object`);
    return;
  }
  if (typeof canvas.widthPx !== "number" || !Number.isSafeInteger(canvas.widthPx) || canvas.widthPx <= 0) errors.push(`${label}.widthPx must be a positive integer`);
  if (typeof canvas.heightPx !== "number" || !Number.isSafeInteger(canvas.heightPx) || canvas.heightPx <= 0) errors.push(`${label}.heightPx must be a positive integer`);
  if (!SHA256_PATTERN.test(String(canvas.sha256 || ""))) errors.push(`${label}.sha256 must be a lowercase SHA-256 digest`);
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isPlainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** @param {unknown} value @param {string} key @returns {unknown} */
function field(value, key) { return isPlainObject(value) ? value[key] : undefined; }
/** @param {unknown} value @returns {value is string} */
function nonEmptyString(value) { return typeof value === "string" && value.trim().length > 0; }
/** @param {unknown} value */
function safeId(value) { return nonEmptyString(value) && /^[A-Za-z0-9._:-]{1,160}$/.test(value.trim()) ? value.trim() : ""; }
/** @param {unknown} page @returns {[string, unknown[]][]} */
function pageCollections(page) { return ["textBoxes", "shapes", "images", "tables", "charts", "icons"].map(name => { const items = field(page, name); return [name, Array.isArray(items) ? items : []]; }); }
/** @param {unknown} value @param {Set<string>} values @param {string} label @param {string[]} errors */
function validateEnum(value, values, label, errors) { if (typeof value !== "string" || !values.has(value)) errors.push(`${label} must be one of: ${[...values].join(", ")}`); }

module.exports = { BOUNDARY_STATES, CONTENT_FAMILIES, REALIZATIONS, SOURCE_SUFFICIENCY, Z_ORDER_ROLES, validateReconstructionContracts };
