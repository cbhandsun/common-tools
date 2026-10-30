"use strict";
const {compactNativeOpacityDefaults}=require("../scene-plan/native-opacity-defaults");
const {compactNativeTextInsetDefaults}=require("../typography/native-text-inset-defaults");
const {compactNativeFreeformPaths}=require("../scene-plan/native-freeform-path");
const {compactNativeTextEvidenceDefaults}=require("../typography/native-text-evidence-defaults");

// Template geometry is consumed during reconstruction. Publish references, not
// a second copy of the template tree inside every generated image's provenance.
function compactTeamComponentEvidence(deck) {
  compactNativeFreeformPaths(deck);
  compactNativeOpacityDefaults(deck);
  compactNativeTextInsetDefaults(deck);
  compactNativeTextEvidenceDefaults(deck);
  for (const page of deck.pages) {
    for (const name of ["images", "shapes", "textBoxes", "tables", "charts", "icons"]) {
      for (const item of Array.isArray(page[name]) ? page[name] : []) {
        const source = item.source;
        if (!source || !Object.hasOwn(source, "componentLocalAssets")) continue;
        const assets = ownValue(source, "componentLocalAssets");
        if (!Array.isArray(assets) || assets.length > 100) throw new TypeError("component evidence assets are invalid");
        source.componentLocalAssets = assets.map(asset => {
          if (!asset || typeof asset !== "object" || Array.isArray(asset)) throw new TypeError("component evidence asset is invalid");
          const reference = {};
          for (const key of ["id", "provider", "assetKind", "matchScore", "selfFidelityPromoted", "suggestedUse"]) {
            const value = ownValue(asset, key);
            if (value !== undefined) reference[key] = value;
          }
          return reference;
        });
      }
    }
  }
  return deck;
}

function ownValue(value, key) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return undefined;
  if (!Object.hasOwn(descriptor, "value")) throw new TypeError("component evidence accessors are invalid");
  return descriptor.value;
}

module.exports = { compactTeamComponentEvidence };
