"use strict";

const {
  classifyNativeRebuilderFamily,
  nativeOwnershipRules
} = require("./native-rebuilder-registry");

const DEFAULT_OWNER_RULES = Object.freeze(nativeOwnershipRules().map((rule) => ownerRule(
  rule.ownerFamily,
  rule.dropFamilies,
  rule
)));

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

function arbitrateNativeObjectOwnership(items = [], options = {}) {
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

function buildClaims(items, rules) {
  const claims = [];
  for (const rule of rules) {
    const owners = items.filter((item) => nativeRebuildFamily(item?.source?.detector, item) === rule.ownerFamily);
    if (owners.length === 0) continue;
    const byLayer = groupBy(owners, (item) => String(item?.source?.layerSourceId || ""));
    for (const [layerSourceId, layerOwners] of byLayer) {
      const validBoxes = layerOwners.map((item) => normalizeBox(item?.box)).filter(Boolean);
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

function normalizeRules(rules) {
  if (!Array.isArray(rules)) return [...DEFAULT_OWNER_RULES];
  return rules
    .filter((rule) => rule && typeof rule === "object")
    .map((rule) => ownerRule(
      String(rule.ownerFamily || ""),
      Array.isArray(rule.dropFamilies) ? rule.dropFamilies.map(String).filter(Boolean) : [],
      rule
    ))
    .filter((rule) => rule.ownerFamily && rule.dropFamilies.length > 0);
}

function nativeRebuildFamily(detector = "", item = null) {
  return classifyNativeRebuilderFamily(detector, item);
}

function normalizeBox(box) {
  if (!box || typeof box !== "object") return null;
  const x = Number(box.x);
  const y = Number(box.y);
  const w = Number(box.w);
  const h = Number(box.h);
  if (![x, y, w, h].every(Number.isFinite) || w < 0 || h < 0 || (w === 0 && h === 0)) return null;
  return { x, y, w: Math.max(1, w), h: Math.max(1, h) };
}

function unionBoxes(boxes) {
  const x1 = Math.min(...boxes.map((box) => box.x));
  const y1 = Math.min(...boxes.map((box) => box.y));
  const x2 = Math.max(...boxes.map((box) => box.x + box.w));
  const y2 = Math.max(...boxes.map((box) => box.y + box.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function intersectionCoverage(candidate, owner) {
  const width = Math.max(0, Math.min(candidate.x + candidate.w, owner.x + owner.w) - Math.max(candidate.x, owner.x));
  const height = Math.max(0, Math.min(candidate.y + candidate.h, owner.y + owner.h) - Math.max(candidate.y, owner.y));
  return (width * height) / Math.max(1e-6, candidate.w * candidate.h);
}

function boxCenterInside(candidate, owner) {
  const cx = candidate.x + candidate.w / 2;
  const cy = candidate.y + candidate.h / 2;
  return cx >= owner.x && cx <= owner.x + owner.w && cy >= owner.y && cy <= owner.y + owner.h;
}

function finiteRatio(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeText(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, "").trim().toLowerCase();
}

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

function normalizeOwnerTextMatch(value, required) {
  if (value === "same-or-contained") return value;
  return required === true ? "same" : "none";
}

function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

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
