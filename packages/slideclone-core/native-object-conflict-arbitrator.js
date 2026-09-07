"use strict";
// @ts-check
/** @typedef {{x: number, y: number, w: number, h: number}} Box */
/** @typedef {{id?: unknown, text?: unknown, box?: unknown, source?: {detector?: string, layerSourceId?: unknown}|null}} NativeItem */
/** @typedef {import("./native-rebuilder-policy").Ownership} Ownership */
/** @typedef {Readonly<Ownership & {ownerFamily: string}>} OwnerRule */
/** @typedef {OwnerRule & {layerSourceId: string, box: Box|null, ownerIds: string[], ownerTexts: Set<string>}} Claim */
/** @typedef {Partial<Ownership> & {ownerFamily?: string}} RuleInput */

const {
  classifyNativeRebuilderFamily,
  nativeOwnershipRules
} = require("./native-rebuilder-policy");

const DEFAULT_OWNER_RULES = Object.freeze(nativeOwnershipRules().map((rule) => ownerRule(
  rule.ownerFamily,
  rule.dropFamilies,
  rule
)));

/** @param {string} ownerFamily @param {readonly string[]} dropFamilies @param {Partial<Ownership>} options @returns {OwnerRule} */
function ownerRule(ownerFamily, dropFamilies, options = {}) {
  return Object.freeze({
    ownerFamily,
    dropFamilies: Object.freeze([...dropFamilies]),
    spatial: options.spatial === true,
    minCandidateCoverage: finiteRatio(options.minCandidateCoverage, 0.6),
    preserveDroppedText: options.preserveDroppedText === true,
    requireMatchingOwnerText: options.requireMatchingOwnerText === true,
    ownerTextMatch: normalizeOwnerTextMatch(options.ownerTextMatch, options.requireMatchingOwnerText)
  });
}

/**
 * Internal native-object contract; unknown external documents must be parsed before this stage.
 * @template {NativeItem} T
 * @param {T[]|null} items
 * @param {{rules?: readonly RuleInput[]}} options
 */
function arbitrateNativeObjectOwnership(items = [], options = {}) {
  /** @type {T[]} */
  const sourceItems = Array.isArray(items) ? items.filter(Boolean) : [];
  if (sourceItems.length === 0) return { items: [], dropped: [], claims: [] };
  const rules = normalizeRules(options.rules || DEFAULT_OWNER_RULES);
  const claims = buildClaims(sourceItems, rules);
  if (claims.length === 0) return { items: [...sourceItems], dropped: [], claims: [] };

  const kept = [];
  const dropped = [];
  for (const item of sourceItems) {
    const family = nativeRebuildFamily(item?.source?.detector, item);
    const conflict = claims
      .map((claim) => matchClaim(item, family, claim))
      .find(Boolean);
    if (!conflict) {
      kept.push(item);
      continue;
    }
    dropped.push({
      id: String(item?.id || ""),
      family,
      detector: String(item?.source?.detector || ""),
      ownerFamily: conflict.claim.ownerFamily,
      layerSourceId: String(item?.source?.layerSourceId || ""),
      reason: conflict.reason
    });
  }
  return { items: kept, dropped, claims: claims.map(publicClaim) };
}

/** @param {NativeItem[]} items @param {readonly OwnerRule[]} rules @returns {Claim[]} */
function buildClaims(items, rules) {
  /** @type {Claim[]} */
  const claims = [];
  for (const rule of rules) {
    const owners = items.filter((item) => nativeRebuildFamily(item?.source?.detector, item) === rule.ownerFamily);
    if (owners.length === 0) continue;
    const byLayer = groupBy(owners, (item) => String(item?.source?.layerSourceId || ""));
    for (const [layerSourceId, layerOwners] of byLayer) {
      const validBoxes = layerOwners.map((item) => normalizeBox(item?.box)).filter((box) => box !== null);
      claims.push({
        ...rule,
        layerSourceId,
        box: rule.spatial && validBoxes.length > 0 ? unionBoxes(validBoxes) : null,
        ownerIds: layerOwners.map((item) => String(item?.id || "")).filter(Boolean),
        ownerTexts: new Set(layerOwners.map((item) => normalizeText(item?.text)).filter(Boolean))
      });
    }
  }
  return claims;
}

/** @param {NativeItem} item @param {string} family @param {Claim} claim */
function matchClaim(item, family, claim) {
  if (!claim.dropFamilies.includes(family)) return null;
  if (claim.preserveDroppedText && typeof item?.text === "string") return null;
  if (claim.ownerTextMatch !== "none" && typeof item?.text === "string") {
    const text = normalizeText(item?.text);
    if (!text || !ownerTextMatches(text, claim.ownerTexts, claim.ownerTextMatch)) return null;
  }
  const layerSourceId = String(item?.source?.layerSourceId || "");
  const sameLayer = Boolean(claim.layerSourceId) && claim.layerSourceId === layerSourceId;
  if (sameLayer) return { claim, reason: "lower-priority-family-on-owned-layer" };
  if (!claim.spatial || !claim.box) return null;
  const itemBox = normalizeBox(item?.box);
  if (!itemBox) return null;
  if (intersectionCoverage(itemBox, claim.box) >= claim.minCandidateCoverage
    || boxCenterInside(itemBox, claim.box)) {
    return { claim, reason: "lower-priority-family-inside-owned-region" };
  }
  return null;
}

/** @param {readonly RuleInput[]} rules @returns {OwnerRule[]} */
function normalizeRules(rules) {
  if (!Array.isArray(rules)) return [...DEFAULT_OWNER_RULES];
  /** @type {readonly RuleInput[]} */
  const inputRules = rules;
  return inputRules
    .filter((rule) => rule && typeof rule === "object")
    .map((rule) => ownerRule(
      String(rule.ownerFamily || ""),
      Array.isArray(rule.dropFamilies) ? rule.dropFamilies.map(String).filter(Boolean) : [],
      rule
    ))
    .filter((rule) => rule.ownerFamily && rule.dropFamilies.length > 0);
}

/** @param {string} detector @param {NativeItem|null} item */
function nativeRebuildFamily(detector = "", item = null) {
  return classifyNativeRebuilderFamily(detector, item);
}

/** @param {unknown} box @returns {Box|null} */
function normalizeBox(box) {
  if (!box || typeof box !== "object") return null;
  const x = Number("x" in box ? box.x : undefined);
  const y = Number("y" in box ? box.y : undefined);
  const w = Number("w" in box ? box.w : undefined);
  const h = Number("h" in box ? box.h : undefined);
  if (![x, y, w, h].every(Number.isFinite) || w < 0 || h < 0 || (w === 0 && h === 0)) return null;
  return { x, y, w: Math.max(1, w), h: Math.max(1, h) };
}

/** @param {readonly Box[]} boxes @returns {Box} */
function unionBoxes(boxes) {
  const x1 = Math.min(...boxes.map((box) => box.x));
  const y1 = Math.min(...boxes.map((box) => box.y));
  const x2 = Math.max(...boxes.map((box) => box.x + box.w));
  const y2 = Math.max(...boxes.map((box) => box.y + box.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** @param {Box} candidate @param {Box} owner @returns {number} */
function intersectionCoverage(candidate, owner) {
  const width = Math.max(0, Math.min(candidate.x + candidate.w, owner.x + owner.w) - Math.max(candidate.x, owner.x));
  const height = Math.max(0, Math.min(candidate.y + candidate.h, owner.y + owner.h) - Math.max(candidate.y, owner.y));
  return (width * height) / Math.max(1e-6, candidate.w * candidate.h);
}

/** @param {Box} candidate @param {Box} owner */
function boxCenterInside(candidate, owner) {
  const cx = candidate.x + candidate.w / 2;
  const cy = candidate.y + candidate.h / 2;
  return cx >= owner.x && cx <= owner.x + owner.w && cy >= owner.y && cy <= owner.y + owner.h;
}

/** @param {unknown} value @param {number} fallback */
function finiteRatio(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

/** @param {unknown} value */
function normalizeText(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, "").trim().toLowerCase();
}

/** @param {string} candidate @param {Set<string>} ownerTexts @param {Ownership["ownerTextMatch"]} mode */
function ownerTextMatches(candidate, ownerTexts, mode) {
  if (!(ownerTexts instanceof Set) || ownerTexts.size === 0) return false;
  if (ownerTexts.has(candidate)) return true;
  if (mode !== "same-or-contained" || candidate.length < 3) return false;
  for (const owner of ownerTexts) {
    const shorter = Math.min(candidate.length, owner.length);
    const longer = Math.max(candidate.length, owner.length);
    if (shorter < 3 || shorter / Math.max(1, longer) < 0.7) continue;
    if (candidate.includes(owner) || owner.includes(candidate)) return true;
  }
  return false;
}

/** @param {unknown} value @param {unknown} required @returns {Ownership["ownerTextMatch"]} */
function normalizeOwnerTextMatch(value, required) {
  if (value === "same-or-contained") return value;
  return required === true ? "same" : "none";
}

/** @template T @param {T[]} items @param {(item: T) => string} keyFn @returns {Map<string, T[]>} */
function groupBy(items, keyFn) {
  /** @type {Map<string, T[]>} */
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

/** @param {Claim} claim */
function publicClaim(claim) {
  return {
    ownerFamily: claim.ownerFamily,
    layerSourceId: claim.layerSourceId,
    box: claim.box,
    dropFamilies: [...claim.dropFamilies],
    ownerIds: [...claim.ownerIds]
  };
}

module.exports = {
  DEFAULT_OWNER_RULES,
  arbitrateNativeObjectOwnership,
  intersectionCoverage,
  nativeRebuildFamily,
  normalizeBox,
  unionBoxes
};
