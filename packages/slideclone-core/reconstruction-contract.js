"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { readImageSize } = require("./image-size");
const { promoteNativeChartPayload } = require("./chart-native-payload");
const { evaluatePageReconstructionBudget } = require("./reconstruction-quality-budget");

const { BOUNDARY_STATES, CONTENT_FAMILIES, REALIZATIONS, SOURCE_SUFFICIENCY, Z_ORDER_ROLES, validateReconstructionContracts } = require("./reconstruction-contract-validation");

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
    .split("").map(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? " " : character).join("")
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
