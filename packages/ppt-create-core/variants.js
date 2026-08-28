"use strict";

const { deckIrFingerprint } = require("./export");

function variantNames(variantIndex) {
  if (!Number.isSafeInteger(variantIndex) || variantIndex < 0 || variantIndex > 2) throw new RangeError("deck variant index is invalid");
  const suffix = variantIndex === 0 ? "" : `.variant-${variantIndex + 1}`;
  return Object.freeze({ ir: `deck${suffix}.ir.json`, preview: `deck${suffix}.preview.html`, html: `deck${suffix}.html`, pptx: `deck${suffix}.pptx`, pdf: `deck${suffix}.pdf` });
}
function describeVariants(variants) {
  if (!Array.isArray(variants) || variants.length < 1 || variants.length > 3) throw new TypeError("deck variants are invalid");
  const records = variants.map((variant, index) => {
    if (variant?.variantIndex !== index || variant.id !== `variant-${index + 1}` || !variant.ir || !Array.isArray(variant.ir.pages)) throw new TypeError("deck variant order is invalid");
    return Object.freeze({ id: variant.id, variantIndex: index, fingerprint: deckIrFingerprint(variant.ir), layoutIds: Object.freeze(variant.ir.pages.map((page) => page.intent?.layoutId)) });
  });
  const signatures = records.map((record) => record.layoutIds.join("\u0000"));
  if (new Set(signatures).size !== records.length) throw new Error("requested deck variants are not structurally distinct");
  return Object.freeze(records);
}
function variantManifest(records) {
  return Object.freeze({ version: "1.0", semantics: "whole-deck-layout-alternatives", variants: records });
}

module.exports = { describeVariants, variantManifest, variantNames };
