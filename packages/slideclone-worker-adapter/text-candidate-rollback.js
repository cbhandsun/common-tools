// @ts-check
"use strict";
const {pairedTextMetrics}=require('./text-comparison-session');

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** @param {unknown} quality @param {boolean} strictMetrics */
function textMetrics(quality, strictMetrics) {
  if (!record(quality) || !Array.isArray(quality.componentLocalMetrics) || quality.componentLocalMetrics.length > 5000) throw new TypeError("text rollback metrics are invalid");
  /** @type {Map<string, {severity:number,pixelDiffRatio:number|null,foregroundMissingRatio:number|null,box:unknown}>} */
  const metrics = new Map();
  for (const row of quality.componentLocalMetrics) {
    if (!record(row) || row.kind !== "text" || row.role !== "text") continue;
    if (typeof row.id !== "string" || !row.id || row.id.length > 256 || typeof row.pageIndex !== "number" || !Number.isSafeInteger(row.pageIndex)
      || row.pageIndex < 0 || row.pageIndex >= 50 || typeof row.severity !== "number" || !Number.isFinite(row.severity) || row.severity < 0 || row.severity > 10) throw new TypeError("text rollback evidence is invalid");
    const key = `${row.pageIndex}:${row.id}`;
    if (metrics.has(key)) throw new TypeError("text rollback evidence is ambiguous");
    if (strictMetrics && [row.pixelDiffRatio, row.foregroundMissingRatio].some(value => typeof value !== "number"
      || !Number.isFinite(value) || value < 0 || value > 1)) throw new TypeError("text rollback pixel evidence is invalid");
    metrics.set(key, { severity: row.severity,box:row.box,
      pixelDiffRatio: strictMetrics ? /** @type {number} */ (row.pixelDiffRatio) : null,
      foregroundMissingRatio: strictMetrics ? /** @type {number} */ (row.foregroundMissingRatio) : null });
  }
  return metrics;
}

/** Restore whole native text objects that regress, then require a fresh build and verification.
 * @param {unknown} input
 */
function rollbackRegressedNativeTexts(input) {
  if (!record(input) || !record(input.baselineDeck) || !record(input.candidateDeck) ||
      !Array.isArray(input.baselineDeck.pages) || !Array.isArray(input.candidateDeck.pages) ||
      input.baselineDeck.pages.length !== input.candidateDeck.pages.length || input.candidateDeck.pages.length > 20) throw new TypeError("text rollback deck is invalid");
  if (input.strictMetrics !== undefined && typeof input.strictMetrics !== "boolean") throw new TypeError("text rollback policy is invalid");
  const strictMetrics = input.strictMetrics === true;
  const paired=pairedTextMetrics(input.baselineQuality,input.candidateQuality);
  const before = textMetrics(paired?{componentLocalMetrics:paired.before}:input.baselineQuality, strictMetrics),
    after = textMetrics(paired?{componentLocalMetrics:paired.after}:input.candidateQuality, strictMetrics);
  const deck = structuredClone(input.candidateDeck);
  let rolledBackTextBoxes = 0;
  const pages = /** @type {unknown[]} */ (deck.pages);
  for (const [pageIndex, page] of pages.entries()) {
    const baseline = input.baselineDeck.pages[pageIndex];
    if (!record(page) || !record(baseline) || !Array.isArray(page.textBoxes) || !Array.isArray(baseline.textBoxes) ||
        page.textBoxes.length > 2000 || baseline.textBoxes.length > 2000) throw new TypeError("text rollback page is invalid");
    /** @type {Map<string, Record<string, unknown>>} */
    const originals = new Map();
    for (const text of baseline.textBoxes) {
      if (!record(text) || typeof text.id !== "string" || !text.id || originals.has(text.id)) throw new TypeError("text rollback original ids are invalid");
      originals.set(text.id, text);
    }
    const candidateIds = new Set();
    page.textBoxes = page.textBoxes.map(text => {
      if (!record(text) || typeof text.id !== "string" || !text.id || candidateIds.has(text.id)) throw new TypeError("text rollback object is invalid");
      candidateIds.add(text.id);
      const original = originals.get(text.id), key = `${pageIndex}:${text.id}`;
      if (!original || original.text !== text.text || JSON.stringify(original) === JSON.stringify(text)) return text;
      const a = before.get(key), b = after.get(key);
      if (a === undefined || b === undefined) throw new TypeError("text rollback evidence is incomplete");
      if(JSON.stringify(a.box)!==JSON.stringify(b.box))throw new TypeError('text rollback regions are not comparable');
      const pixelRegressed = strictMetrics && (/** @type {number} */ (b.pixelDiffRatio) > /** @type {number} */ (a.pixelDiffRatio) + 1e-9
        || /** @type {number} */ (b.foregroundMissingRatio) > /** @type {number} */ (a.foregroundMissingRatio) + 1e-9);
      if (b.severity <= a.severity + 0.08 && !pixelRegressed) return text;
      rolledBackTextBoxes++;
      return structuredClone(original);
    });
  }
  return { deck, rolledBackTextBoxes };
}

module.exports = { rollbackRegressedNativeTexts };
