// @ts-check
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { types } = require("node:util");

/** @param {unknown} value @param {string} key @returns {unknown} */
function field(value, key) {
  if (!value || typeof value !== "object" || types.isProxy(value) || Array.isArray(value)) throw new TypeError("raw image rebuild metadata is invalid");
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return undefined;
  if (!("value" in descriptor)) throw new TypeError("raw image rebuild metadata requires data properties");
  return /** @type {unknown} */ (descriptor.value);
}

/** Bound per-page counters so summing the supported 20 pages remains exact.
 * @param {unknown} value @returns {number} */
function count(value) {
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > Math.floor(Number.MAX_SAFE_INTEGER / 20)) throw new TypeError("raw image rebuild metric is invalid");
  return value;
}

/** @param {unknown} result @param {{pageRoot: string, sourceInputFile: string}} context */
function admitRebuiltPageMetadata(result, context) {
  const source = field(result, "sourceImage");
  const sourceImage = source === undefined || source === null || source === "" ? context.sourceInputFile : source;
  if (typeof sourceImage !== "string" || sourceImage.length > 4096 || sourceImage.includes("\0") || !path.isAbsolute(sourceImage)) throw new TypeError("raw image rebuild source image is invalid");
  const resolved = path.resolve(sourceImage);
  const pageRoot = fs.realpathSync(context.pageRoot);
  let canonical;
  try { canonical = fs.realpathSync(resolved); } catch { throw new TypeError("raw image rebuild source image is unavailable"); }
  const original = fs.realpathSync(context.sourceInputFile);
  if ((canonical !== original && !canonical.startsWith(`${pageRoot}${path.sep}`)) || !fs.statSync(canonical).isFile()) throw new TypeError("raw image rebuild source image is outside the page workspace");
  const residualInput = field(result, "residual");
  const residual = residualInput == null ? null : Object.freeze({ candidateObjects: count(field(residualInput, "candidateObjects")), erasedObjects: count(field(residualInput, "erasedObjects")) });
  if (residual && residual.erasedObjects > residual.candidateObjects) throw new TypeError("raw image rebuild residual counts are inconsistent");
  const profile = field(result, "reconstructionProfile");
  if (profile != null && (typeof profile !== "string" || profile.length > 256 || /[\r\n\t\0]/u.test(profile))) throw new TypeError("raw image rebuild profile is invalid");
  const quality = field(result, "nativeComponentQuality");
  let nativeComponentQuality = null;
  if (quality != null) {
    const passed = field(quality, "passed");
    if (typeof passed !== "boolean") throw new TypeError("raw image rebuild quality status is invalid");
    const metrics = field(quality, "metrics");
    const metric = (/** @type {string} */ name) => metrics == null ? 0 : count(field(metrics, name));
    nativeComponentQuality = Object.freeze({ passed, metrics: Object.freeze({ connectors: metric("connectors"), minimumUnitCrops: metric("minimumUnitCrops"), evidencedMinimumUnitCrops: metric("evidencedMinimumUnitCrops"), unverifiedMinimumUnitCrops: metric("unverifiedMinimumUnitCrops") }) });
  }
  return Object.freeze({ sourceImage: resolved, residual, reconstructionProfile: profile || null, nativeComponentQuality });
}

module.exports = { admitRebuiltPageMetadata };
