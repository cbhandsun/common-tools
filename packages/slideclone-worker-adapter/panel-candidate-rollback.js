// @ts-check
"use strict";
const { isDeepStrictEqual } = require("node:util");
const { missingReferenceRegions } = require("./missing-component-regression");

/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @param {unknown} value @returns {value is Box} */
function box(value) {
  return record(value) && [value.x, value.y, value.w, value.h].every(v => typeof v === "number" && Number.isFinite(v))
    && typeof value.w === "number" && typeof value.h === "number" && value.w > 0 && value.h > 0;
}
/** @param {unknown} value @returns {value is Record<string,unknown> & {box:Box}} */
function panel(value) {
  if (!record(value) || !box(value.box) || !record(value.source) || !record(value.style)
    || (value.type !== "rect" && value.type !== "roundRect")) return false;
  const source = value.source;
  return source.editable === true && source.nativeRebuild === true && source.semanticNativeStructure === true
    && (source.preserveResidualInterior === true || (source.visualFallbackPrimitive === true && source.retainedInVisualFallback === true && source.componentQualityIgnore === true));
}
/** @param {Box} a @param {Box} b */
function overlaps(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
/** @param {unknown} values */
function shapeMap(values) {
  if (!Array.isArray(values) || values.length > 10000) throw new TypeError("Invalid panel rollback objects");
  /** @type {Map<string,Record<string,unknown>>} */ const result = new Map();
  for (const value of values) {
    if (!record(value) || typeof value.id !== "string" || !value.id || value.id.length > 256 || result.has(value.id)) throw new TypeError("Ambiguous panel rollback objects");
    result.set(value.id, value);
  }
  return result;
}

/** Restore source-backed panel operations covering truly regressed fixed regions.
 * The returned IR must be rebuilt and verified; this never declares quality passed.
 * @param {unknown} input
 */
function rollbackRegressedPanels(input) {
  if (!record(input) || !record(input.baselineDeck) || !record(input.candidateDeck)
    || !Array.isArray(input.baselineDeck.pages) || !Array.isArray(input.candidateDeck.pages)
    || input.baselineDeck.pages.length !== input.candidateDeck.pages.length || input.candidateDeck.pages.length > 50
    || !record(input.candidateQuality) || !Array.isArray(input.candidateQuality.componentReferenceMetrics)) throw new TypeError("Invalid panel rollback evidence");
  const before = missingReferenceRegions(input.baselineQuality), after = missingReferenceRegions(input.candidateQuality);
  const pageCount = input.baselineDeck.pages.length;
  if (before.length !== after.length) throw new TypeError("Incomplete panel rollback evidence");
  if (before.some(row => row.pageIndex >= pageCount)) throw new TypeError("Invalid panel rollback page evidence");
  const regressions = before.filter(region => {
    const matches = after.filter(row => row.pageIndex === region.pageIndex && isDeepStrictEqual(row.box, region.box));
    const match = matches[0];
    if (matches.length !== 1 || !match) throw new TypeError("Ambiguous panel rollback evidence");
    return match.severity > region.severity + 0.08;
  });
  const deck = structuredClone(input.candidateDeck);
  let rolledBackPanels = 0, retainedChanges = 0;
  for (const [pageIndex, page] of /** @type {unknown[]} */ (deck.pages).entries()) {
    const baselinePage = input.baselineDeck.pages[pageIndex];
    if (!record(page) || !record(baselinePage)) throw new TypeError("Invalid panel rollback page");
    const originals = shapeMap(baselinePage.shapes), candidates = shapeMap(page.shapes);
    for (const id of candidates.keys()) if (!originals.has(id)) throw new TypeError("Unexpected panel rollback addition");
    const regions = regressions.filter(row => row.pageIndex === pageIndex);
    const resolved = new Map([...originals.entries()].map(([id, original]) => {
      const candidate = candidates.get(id);
      if (isDeepStrictEqual(original, candidate)) return [id, candidate];
      if (panel(original) && regions.some(row => overlaps(original.box, row.box) || (panel(candidate) && overlaps(candidate.box, row.box)))) {
        rolledBackPanels++;
        return [id, structuredClone(original)];
      }
      retainedChanges++;
      return [id, candidate];
    }));
    // Keep accepted foreground ordering. Only restored deletions need their
    // original neighboring anchor; restoring all baseline order hides icons again.
    /** @type {Map<string, Record<string,unknown>[]>} */ const insertions = new Map();
    let anchor = "";
    for (const id of [...originals.keys()].reverse()) {
      if (candidates.has(id)) { anchor = id; continue; }
      const restored = resolved.get(id);
      if (!record(restored)) continue;
      const pending = insertions.get(anchor) || [];
      pending.push(restored);
      insertions.set(anchor, pending);
    }
    page.shapes = [...candidates.keys()].flatMap(id => [
      ...(insertions.get(id) || []).reverse(), resolved.get(id)
    ]).concat((insertions.get("") || []).reverse());
  }
  return { deck, rolledBackPanels, retainedChanges };
}

module.exports = { rollbackRegressedPanels };
