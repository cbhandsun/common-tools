// @ts-check
"use strict";
const { types } = require("node:util");
const MINIMUM_INTERNAL_RESIDUAL = 0.18;
/** @typedef {{id:string,textRevision:string,sourceHash:string,pixelDiffRatio:number,foregroundMissingRatio:number}} Residual */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !types.isProxy(value) && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(property => "value" in property);
}
/** Residuals authorize a bounded proposal, not admission. Real rendering and rollback remain mandatory.
 * @param {unknown} value @returns {Map<string,Residual>} */
function parseOwnedTextResiduals(value) {
  /** @type {Map<string,Residual>} */ const result = new Map();
  if (value === undefined) return result;
  if (!Array.isArray(value) || types.isProxy(value) || value.length > 2000) throw new TypeError("owned text residual evidence is invalid");
  for (let index = 0; index < value.length; index++) {
    const property = Object.getOwnPropertyDescriptor(value, String(index));
    if (!property || !("value" in property)) throw new TypeError("owned text residual entry is invalid");
    const row = property.value;
    if (!record(row) || typeof row.id !== "string" || !row.id || row.id.length > 256 || [...row.id].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
      || result.has(row.id) || typeof row.textRevision !== "string" || !/^[a-f0-9]{64}$/u.test(row.textRevision)
      || typeof row.sourceHash !== "string" || !/^[a-f0-9]{64}$/u.test(row.sourceHash)
      || typeof row.pixelDiffRatio !== "number" || !Number.isFinite(row.pixelDiffRatio) || row.pixelDiffRatio < 0 || row.pixelDiffRatio > 1
      || typeof row.foregroundMissingRatio !== "number" || !Number.isFinite(row.foregroundMissingRatio)
      || row.foregroundMissingRatio < 0 || row.foregroundMissingRatio > 1) throw new TypeError("owned text residual evidence is invalid");
    result.set(row.id, { id: row.id, textRevision: row.textRevision, sourceHash: row.sourceHash,
      pixelDiffRatio: row.pixelDiffRatio, foregroundMissingRatio: row.foregroundMissingRatio });
  }
  return result;
}
/** @param {Residual|undefined} evidence @param {string} revision @param {string} sourceHash */
function hasOwnedTextInternalResidual(evidence, revision, sourceHash) {
  return evidence !== undefined && evidence.textRevision === revision && evidence.sourceHash === sourceHash
    && Math.max(evidence.pixelDiffRatio, evidence.foregroundMissingRatio) >= MINIMUM_INTERNAL_RESIDUAL;
}
module.exports = { parseOwnedTextResiduals, hasOwnedTextInternalResidual };
