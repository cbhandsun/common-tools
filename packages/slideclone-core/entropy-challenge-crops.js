"use strict";
const path = require("node:path");
const { shouldUseEntropyChallengeCrops } = require("./graphic-crop-generation");
const { clamp, expandPtBox, ptToPxBox, round, constrainPtBox } = require("./raster-native-detection");
const { cropPng, writePng } = require("./png");
const { ensureDir, eraseMasks } = require("./residual-primitive-erasure");
const { DEFAULT_SLIDE } = require("./page-text-rule-helpers");
const { normalizeCjkText } = require("./prd-generation-shapes");

function createEntropyChallengeCrops(image, textBoxes, slideSize, options) {
  if (!options.assetDir || !shouldUseEntropyChallengeCrops(textBoxes, slideSize)) return [];
  ensureDir(options.assetDir);
  const boxes = [
    { name: "fragment-cloud", x: 40, y: 118, w: 330, h: 294 },
    { name: "island-frame", x: 350, y: 96, w: 580, h: 356 }
  ].map((box) => ({
    name: box.name,
    x: round(clamp(box.x, 0, slideSize.widthPt - 1)),
    y: round(clamp(box.y, 0, slideSize.heightPt - 1)),
    w: round(clamp(box.w, 1, slideSize.widthPt - box.x)),
    h: round(clamp(box.h, 1, slideSize.heightPt - box.y))
  }));
  const annotationEntries = entropyChallengeAnnotationEntries(textBoxes, slideSize);
  return boxes.map((box, index) => {
    const pxBox = ptToPxBox(box, image, slideSize, 0);
    const cropSource = box.name === "fragment-cloud" && annotationEntries.length === 4
      ? eraseMasks(image, annotationEntries.map((entry) =>
        ptToPxBox(expandPtBox(entry.box, slideSize, 7, 4), image, slideSize, 0)))
      : image;
    const crop = cropPng(cropSource, pxBox);
    const file = path.join(options.assetDir, `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}-entropy-challenge-${String(index + 1).padStart(2, "0")}.png`);
    writePng(file, crop);
    return {
      id: `native-entropy-challenge-crop-${box.name || index}`,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
      box,
      source: {
        editable: false,
        nativeRebuild: true,
        // The perspective island looks grid-like, but its depth routes and
        // illustration styling are the minimum visual unit, not a data table.
        standaloneVisualAsset: true,
        expressionFamily: "pictorial-asset",
        expressionForm: "icon-or-illustration",
        expressionSubtype: box.name === "island-frame"
          ? "perspective-island-illustration"
          : "fragment-cloud-illustration",
        recommendedAction: "keep-local-crop-with-native-helper-overlays",
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        minimumUnitPolicy: "preserve-pictorial-illustration-unit",
        minimumUnitReason: box.name === "island-frame"
          ? "perspective frame and crossing curved routes form one decorated pictorial unit"
          : "fragment cloud consists of decorative shards without independently labeled semantic nodes",
        annotationTextErasedFromCrop: box.name === "fragment-cloud" && annotationEntries.length === 4,
        componentRenderStrategy: {
          mode: box.name === "fragment-cloud" ? "preserve-crop-with-native-overlays" : "preserve-local-crop",
          implementationMode: box.name === "fragment-cloud" ? "hybrid-native-overlay" : "native-generator-safe-fallback",
          editableExpectation: box.name === "fragment-cloud"
            ? "source-faithful-fragment-illustration-with-editable-annotation-labels"
            : "standalone-perspective-illustration-preserved-as-movable-crop",
          visualFidelityBias: "fidelity-first"
        },
        layer: {
          layerType: "illustration-zone",
          detector: box.name === "island-frame" ? "entropy-challenge-island-crop" : "entropy-challenge-crop",
          expressionForm: "icon-or-illustration",
          expressionSubtype: box.name === "island-frame"
            ? "perspective-island-illustration"
            : "fragment-cloud-illustration",
          recommendedAction: "keep-local-crop-with-native-helper-overlays",
          componentRenderStrategy: {
            mode: box.name === "fragment-cloud" ? "preserve-crop-with-native-overlays" : "preserve-local-crop"
          }
        },
        // This page is deliberately retained as a fidelity-first diagram.
        // Prevent generic visual-atom reconstruction from erasing pixels in
        // the crop before a validated native replacement is available.
        skipVisualAtomRebuild: true,
        detector: box.name === "island-frame" ? "entropy-challenge-island-crop" : "entropy-challenge-crop",
        reason: box.name === "island-frame"
          ? "perspective island frame preserved as a local fidelity crop with editable helper shapes layered above"
          : "complex fragment illustration preserved as a local fidelity crop with editable helper shapes layered above",
        nonEditableReason: box.name === "island-frame"
          ? "perspective island frame and crossing routes are a decorated illustration rather than a semantic table"
          : "decorative fragment cloud remains a pictorial unit while its four annotation labels are editable"
      }
    };
  });
}

function entropyChallengeAnnotationEntries(textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const labels = ["分散的飞书材料", "过期的历史PRD", "脱节的原型设计", "滞后的评审记录"];
  const bounds = { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt };
  return labels.map((label, index) => {
    const textBox = (textBoxes || []).find((item) => normalizeCjkText(item?.text) === normalizeCjkText(label));
    if (!textBox?.box) return null;
    return {
      index,
      label,
      box: constrainPtBox({
        x: Number(textBox.box.x || 0),
        y: Number(textBox.box.y || 0),
        w: Number(textBox.box.w || 0),
        h: Number(textBox.box.h || 0)
      }, bounds)
    };
  }).filter(Boolean);
}

module.exports = { createEntropyChallengeCrops, entropyChallengeAnnotationEntries };
