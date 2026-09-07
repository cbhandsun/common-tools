// @ts-check
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { types } = require("node:util");
const { validateDeckPageStructures } = require("./deck-ir-structure");
const { validateDeckIrEnvelope } = require("./deck-ir-tree");
const { validateDeckNativeChartPayloads } = require("./chart-native-payload");
const { validateReconstructionContracts } = require("./reconstruction-contract-validation");

/** @param {unknown} value */
function safeAssetPath(value) {
  if (typeof value !== "string" || !value || value.length > 512 || value.includes("\0") || value.includes("\\") || path.posix.isAbsolute(value)) throw new Error("editable deck references an unsafe asset path");
  const normalized = path.posix.normalize(value);
  if (!normalized.startsWith("assets/") || normalized === "assets" || normalized.includes("../")) throw new Error("editable deck asset must be inside assets/");
  return normalized;
}
/** @param {unknown} ir @param {string} root */
function validateDeckIr(ir, root) {
  const { pages } = validateDeckIrEnvelope(ir);
  validateDeckPageStructures(pages);
  validateDeckNativeChartPayloads(pages);
  if (!validateReconstructionContracts(ir, { allowManualRequired: true }).ok) throw new Error("editable deck reconstruction metadata is invalid");
  /** @type {Set<string>} */
  const referencedAssets = new Set();
  /** @param {unknown} value @param {string} [parentKey] */
  function visit(value, parentKey = "") {
    if (Array.isArray(value)) { for (const item of value) visit(item, ""); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if ((key.toLowerCase() === "assetpath" || (key.toLowerCase() === "pageimage" && parentKey.toLowerCase() === "source")) && item != null) referencedAssets.add(safeAssetPath(item));
      visit(item, key);
    }
  }
  visit(ir);
  for (const asset of referencedAssets) {
    const file = path.resolve(root, ...asset.split("/"));
    if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error("editable deck references a missing asset");
  }
  return { pages: pages.length, assets: referencedAssets.size };
}

/** Admit the delegate result before traversing it or copying its assets.
 * @param {unknown} result @param {string} root */
function admitRebuiltPage(result, root) {
  if (!result || typeof result !== "object" || types.isProxy(result) || Array.isArray(result)) throw new TypeError("raw image rebuild result is invalid");
  const descriptor = Object.getOwnPropertyDescriptor(result, "deck");
  if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new TypeError("raw image rebuild requires a deck data property");
  const deck = /** @type {unknown} */ (descriptor.value);
  const envelope = validateDeckIrEnvelope(deck);
  if (envelope.pages.length !== 1) throw new Error("raw image rebuild must produce exactly one page per source image");
  validateDeckIr(deck, root);
  return deck;
}

module.exports = { safeAssetPath, validateDeckIr, admitRebuiltPage };
