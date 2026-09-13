"use strict";

const {
  arbitrateNativeObjectOwnership,
  intersectionCoverage,
  normalizeBox
} = require("./native-object-conflict-arbitrator");

function summarizeNativeObjectConflicts(ir = {}, options = {}) {
  const pages = Array.isArray(ir?.pages) ? ir.pages : [];
  const pageProfiles = pages.map((page, ordinal) => auditPage(page, ordinal, options));
  return {
    provider: "native-object-conflict-audit-v1",
    pages: pageProfiles.length,
    unresolvedOwnershipConflictCount: sum(pageProfiles, "unresolvedOwnershipConflictCount"),
    duplicateTextPairCount: sum(pageProfiles, "duplicateTextPairCount"),
    resolvedDroppedShapeCount: sum(pageProfiles, "resolvedDroppedShapeCount"),
    resolvedDroppedTextBoxCount: sum(pageProfiles, "resolvedDroppedTextBoxCount"),
    pagesWithUnresolvedConflicts: pageProfiles.filter((page) => page.unresolvedConflictCount > 0).length,
    unresolvedConflictCount: sum(pageProfiles, "unresolvedConflictCount"),
    pagesDetail: pageProfiles
  };
}

function auditPage(page = {}, ordinal = 0, options = {}) {
  const shapes = Array.isArray(page?.shapes) ? page.shapes.filter(Boolean) : [];
  const textBoxes = Array.isArray(page?.textBoxes) ? page.textBoxes.filter(Boolean) : [];
  const shapeOwnership = arbitrateNativeObjectOwnership(shapes);
  const textOwnership = arbitrateNativeObjectOwnership(textBoxes);
  const duplicateTextPairs = findDuplicateTextPairs(textBoxes, options);
  const recorded = page?.source?.nativeOwnershipArbitration || {};
  const unresolvedOwnershipConflicts = [...shapeOwnership.dropped, ...textOwnership.dropped];
  return {
    pageIndex: Number.isInteger(page?.pageIndex) ? page.pageIndex : ordinal,
    unresolvedOwnershipConflictCount: unresolvedOwnershipConflicts.length,
    duplicateTextPairCount: duplicateTextPairs.length,
    unresolvedConflictCount: unresolvedOwnershipConflicts.length + duplicateTextPairs.length,
    resolvedDroppedShapeCount: nonNegativeInteger(recorded.droppedShapeCount),
    resolvedDroppedTextBoxCount: nonNegativeInteger(recorded.droppedTextBoxCount),
    unresolvedOwnershipConflicts: unresolvedOwnershipConflicts.slice(0, 20),
    duplicateTextPairs: duplicateTextPairs.slice(0, 20)
  };
}

function findDuplicateTextPairs(textBoxes = [], options = {}) {
  const minCoverage = finiteRatio(options.minCoverage, 0.58);
  const maxPairs = positiveInteger(options.maxPairs, 100);
  const candidates = (Array.isArray(textBoxes) ? textBoxes : [])
    .map((item) => ({ item, box: normalizeBox(item?.box), normalized: normalizeComparableText(item?.text) }))
    .filter((entry) => entry.box && entry.normalized.length >= 2);
  const pairs = [];
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex];
      const right = candidates[rightIndex];
      const overlap = Math.max(
        intersectionCoverage(left.box, right.box),
        intersectionCoverage(right.box, left.box)
      );
      if (overlap < minCoverage) continue;
      const relation = textRelation(left.normalized, right.normalized);
      if (!relation) continue;
      pairs.push({
        leftId: String(left.item?.id || ""),
        rightId: String(right.item?.id || ""),
        leftText: String(left.item?.text || "").slice(0, 160),
        rightText: String(right.item?.text || "").slice(0, 160),
        relation,
        overlap: round(overlap),
        leftDetector: String(left.item?.source?.detector || ""),
        rightDetector: String(right.item?.source?.detector || "")
      });
      if (pairs.length >= maxPairs) return pairs;
    }
  }
  return pairs;
}

function textRelation(left, right) {
  if (left === right) return "same-normalized-text";
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  if (shorter.length >= 3 && longer.includes(shorter)) return "contained-normalized-text";
  return null;
}

function normalizeComparableText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function finiteRatio(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function positiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.floor(numeric);
}

function nonNegativeInteger(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
}

function sum(items, field) {
  return items.reduce((total, item) => total + Number(item?.[field] || 0), 0);
}

function round(value) {
  return Math.round(Number(value) * 10000) / 10000;
}

module.exports = {
  auditPage,
  findDuplicateTextPairs,
  normalizeComparableText,
  summarizeNativeObjectConflicts,
  textRelation
};
