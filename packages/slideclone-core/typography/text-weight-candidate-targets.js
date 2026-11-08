// @ts-check
"use strict";

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

/** @param {unknown} quality */
function textWeightCandidateTargets(quality) {
  if (!isRecord(quality) || !Array.isArray(quality.componentWorst) || quality.componentWorst.length > 20000) return [];
  /** @type {Map<string, {key: string, score: number, order: number}>} */
  const targets = new Map();
  for (const [order, row] of quality.componentWorst.entries()) {
    if (!isRecord(row) || row.kind !== "text" || row.role !== "text" || typeof row.pageIndex !== "number" || !Number.isSafeInteger(row.pageIndex)
      || row.pageIndex < 0 || row.pageIndex >= 50 || typeof row.id !== "string" || !row.id
      || row.id.length > 256 || [...row.id].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) continue;
    const score = typeof row.contributionScore === "number" && Number.isFinite(row.contributionScore) && row.contributionScore >= 0 ? row.contributionScore : 0;
    const key = `${row.pageIndex}:${row.id}`;
    const previous = targets.get(key);
    if (!previous || score > previous.score) targets.set(key, { key, score, order: previous?.order ?? order });
  }
  return [...targets.values()].sort((a, b) => b.score - a.score || a.order - b.order).slice(0, 8).map(row => row.key);
}

module.exports = { textWeightCandidateTargets };
