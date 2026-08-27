"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { readImageSize } = require("./image-size");
const { promoteNativeChartPayload, validateNativeChartPayload } = require("./chart-native-payload");
const { evaluatePageReconstructionBudget } = require("./reconstruction-quality-budget");

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

function enrichReconstructionContracts(ir, options = {}) {
  const baseDir = path.resolve(options.baseDir || process.cwd());
  const next = structuredCloneJson(ir);
  for (const page of Array.isArray(next?.pages) ? next.pages : []) {
    const sourceImage = resolveExistingFile(baseDir, page?.sourceImage);
    const pageSha256 = sourceImage ? hashFile(sourceImage) : "";
    const dimensions = sourceImage ? safeImageSize(sourceImage) : null;
    page.reconstruction = {
      ...(isPlainObject(page.reconstruction) ? page.reconstruction : {}),
      contractVersion: "1.0",
      canonicalPageSha256: pageSha256 || undefined,
      canonicalCanvas: dimensions ? {
        widthPx: dimensions.width,
        heightPx: dimensions.height,
        sha256: pageSha256
      } : undefined,
      sourceImageAvailable: Boolean(sourceImage)
    };
    for (const [collection, items] of pageCollections(page)) {
      for (const item of items) {
        item.source = isPlainObject(item.source) ? item.source : {};
        item.source.reconstruction = normalizeReconstruction(
          item.source.reconstruction,
          defaultReconstruction(collection, item, pageSha256, dimensions)
        );
        if (collection === "charts" && item.source.reconstruction.realization === "native_chart") {
          if (!isPlainObject(item.nativePayload)) {
            try {
              item.nativePayload = promoteNativeChartPayload(item);
            } catch (error) {
              item.source.reconstruction = {
                ...item.source.reconstruction,
                realization: "manual_required",
                manualRequiredReason: `native chart promotion failed: ${sanitizeReason(error)}`
              };
            }
          }
        }
      }
    }
    page.reconstruction.qualityBudget = evaluatePageReconstructionBudget(page, next.slideSize, {
      policy: page.reconstruction.expressionPolicy || options.expressionPolicy || "hybrid"
    });
  }
  return next;
}

function buildReconstructionInventory(ir) {
  return {
    contractVersion: "1.0",
    pages: (Array.isArray(ir?.pages) ? ir.pages : []).map((page) => ({
      pageIndex: page.pageIndex,
      sourceImage: page.sourceImage,
      canonicalPageSha256: page.reconstruction?.canonicalPageSha256 || "",
      canonicalCanvas: page.reconstruction?.canonicalCanvas || null,
      regions: pageCollections(page).flatMap(([collection, items]) => items.map((item) => ({
        id: item.id,
        collection,
        box: item.box,
        evidenceBox: item.source?.evidenceBox || null,
        confidence: finiteOrNull(item.source?.confidence),
        ...item.source?.reconstruction
      })))
    }))
  };
}

function validateReconstructionContracts(ir, options = {}) {
  const errors = [];
  const warnings = [];
  const allowManualRequired = options.allowManualRequired === true;
  const requireComplete = options.requireComplete === true;
  for (const [pageOffset, page] of (Array.isArray(ir?.pages) ? ir.pages : []).entries()) {
    const pageLabel = `pages[${pageOffset}]`;
    validatePageContract(page?.reconstruction, pageLabel, errors, warnings, requireComplete);
    for (const [collection, items] of pageCollections(page)) {
      for (const [itemOffset, item] of items.entries()) {
        const label = `${pageLabel}.${collection}[${itemOffset}].source.reconstruction`;
        const contract = item?.source?.reconstruction;
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

function validateQualityBudget(value, label, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  if (value.contractVersion !== "1.0") errors.push(`${label}.contractVersion must be 1.0`);
  if (!["editable-first", "hybrid", "fidelity-first"].includes(value.policy)) errors.push(`${label}.policy is invalid`);
  if (typeof value.passed !== "boolean") errors.push(`${label}.passed must be a boolean`);
  if (!Array.isArray(value.reasonCodes) || value.reasonCodes.some((item) => typeof item !== "string" || !/^quality\.[a-z0-9-]+$/.test(item))) {
    errors.push(`${label}.reasonCodes must contain safe quality codes`);
  }
  if (!isPlainObject(value.metrics)) {
    errors.push(`${label}.metrics must be an object`);
    return;
  }
  for (const key of ["residualAreaRatio", "largestResidualAreaRatio"]) {
    if (!Number.isFinite(value.metrics[key]) || value.metrics[key] < 0 || value.metrics[key] > 1) errors.push(`${label}.metrics.${key} must be between 0 and 1`);
  }
  for (const key of ["residualCount", "nativeObjectCount", "imageCount"]) {
    if (!Number.isSafeInteger(value.metrics[key]) || value.metrics[key] < 0) errors.push(`${label}.metrics.${key} must be a non-negative integer`);
  }
}

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

function validateCanonicalCanvas(canvas, label, errors) {
  if (!isPlainObject(canvas)) {
    errors.push(`${label} must be an object`);
    return;
  }
  if (!Number.isSafeInteger(canvas.widthPx) || canvas.widthPx <= 0) errors.push(`${label}.widthPx must be a positive integer`);
  if (!Number.isSafeInteger(canvas.heightPx) || canvas.heightPx <= 0) errors.push(`${label}.heightPx must be a positive integer`);
  if (!SHA256_PATTERN.test(String(canvas.sha256 || ""))) errors.push(`${label}.sha256 must be a lowercase SHA-256 digest`);
}

function defaultReconstruction(collection, item, pageSha256, dimensions) {
  const source = isPlainObject(item?.source) ? item.source : {};
  const manualReason = nonEmptyString(source.manualRequiredReason) ? source.manualRequiredReason.trim() : "";
  const manualRequired = source.manualRequired === true || Boolean(manualReason);
  const registrationGroupId = safeId(source.registrationGroupId)
    || safeId(source.nativeComponentGroupId)
    || safeId(source.layer?.registrationGroupId);
  const registeredLayer = collection === "images" && Boolean(registrationGroupId);
  const realization = manualRequired
    ? "manual_required"
    : realizationFor(collection, item, registeredLayer);
  const requiresManual = realization === "manual_required";
  const family = familyFor(collection, item);
  const confidence = finiteOrNull(source.confidence);
  const sourceSufficiency = requiresManual
    ? "insufficient"
    : source.sourceSufficiency || (confidence !== null && confidence >= 0.75 ? "sufficient" : "unknown");
  return {
    contractVersion: "1.0",
    family,
    realization,
    sourceSufficiency,
    boundaryState: source.boundaryState || boundaryStateFor(source),
    zOrderRole: registeredLayer ? zOrderRoleFor(source) : (collection === "images" ? "source_graphic" : "native"),
    canonicalPageSha256: pageSha256 || undefined,
    canonicalCanvas: dimensions && pageSha256 ? {
      widthPx: dimensions.width,
      heightPx: dimensions.height,
      sha256: pageSha256
    } : undefined,
    registrationGroupId: registeredLayer ? registrationGroupId : undefined,
    identityVerifiable: booleanOrUndefined(source.identityVerifiable),
    dataVerifiable: collection === "charts" || collection === "tables"
      ? source.dataVerifiable === true || hasVerifiableData(collection, item)
      : booleanOrUndefined(source.dataVerifiable),
    reconstructedPixels: source.reconstructedPixels === true,
    manualRequiredReason: requiresManual ? (manualReason || "source evidence is insufficient for authoritative reconstruction") : undefined
  };
}

function normalizeReconstruction(current, defaults) {
  const merged = { ...defaults, ...(isPlainObject(current) ? current : {}) };
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
  return merged;
}

function realizationFor(collection, item, registeredLayer) {
  if (collection === "textBoxes") return "native_text";
  if (collection === "tables") return Array.isArray(item?.rows) && item.rows.length ? "native_table" : "manual_required";
  if (collection === "charts") return hasVerifiableData(collection, item) ? "native_chart" : "manual_required";
  if (collection === "images") return registeredLayer ? "registered_image_layer" : "source_crop";
  return "native_shape";
}

function familyFor(collection, item) {
  if (collection === "textBoxes") return "text";
  if (collection === "tables" || collection === "charts") return "data";
  if (collection === "images") return /photo|scene|subject|foreground|background/i.test(String(item?.type || "")) ? "scene" : "graphic";
  return "geometry";
}

function hasVerifiableData(collection, item) {
  if (collection === "tables") return Array.isArray(item?.rows) && item.rows.length > 0;
  if (collection !== "charts") return false;
  const series = Array.isArray(item?.series) ? item.series : [];
  return (Array.isArray(item?.values) && item.values.length > 0)
    || series.some((entry) => Array.isArray(entry?.values) && entry.values.length > 0);
}

function boundaryStateFor(source) {
  if (source.occluded === true) return "occluded";
  if (source.contaminated === true) return "contaminated";
  if (source.boundaryComplete === true) return "complete";
  if (source.boundaryComplete === false) return "partial";
  return "unknown";
}

function zOrderRoleFor(source) {
  const value = String(source.zOrderRole || source.layerRole || source.layer?.role || "").trim().toLowerCase().replace(/-/g, "_");
  return Z_ORDER_ROLES.has(value) ? value : "source_graphic";
}

function pageCollections(page) {
  return ["textBoxes", "shapes", "images", "tables", "charts", "icons"]
    .map((name) => [name, Array.isArray(page?.[name]) ? page[name] : []]);
}

function resolveExistingFile(baseDir, value) {
  if (!nonEmptyString(value)) return null;
  const resolved = path.isAbsolute(value) ? path.resolve(value) : path.resolve(baseDir, value);
  const stat = fs.statSync(resolved, { throwIfNoEntry: false });
  return stat?.isFile() ? resolved : null;
}

function hashFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function safeImageSize(file) {
  try {
    const value = readImageSize(file);
    return Number.isSafeInteger(value?.widthPx) && Number.isSafeInteger(value?.heightPx)
      ? { width: value.widthPx, height: value.heightPx }
      : null;
  } catch {
    return null;
  }
}

function validateEnum(value, values, label, errors) {
  if (!values.has(value)) errors.push(`${label} must be one of: ${[...values].join(", ")}`);
}

function structuredCloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function safeId(value) {
  return nonEmptyString(value) && /^[A-Za-z0-9._:-]{1,160}$/.test(value.trim()) ? value.trim() : "";
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function sanitizeReason(error) {
  return String(error?.message || error || "unsupported chart payload")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .slice(0, 300);
}

function booleanOrUndefined(value) {
  return typeof value === "boolean" ? value : undefined;
}

module.exports = {
  BOUNDARY_STATES,
  CONTENT_FAMILIES,
  REALIZATIONS,
  SOURCE_SUFFICIENCY,
  Z_ORDER_ROLES,
  buildReconstructionInventory,
  enrichReconstructionContracts,
  validateReconstructionContracts
};
