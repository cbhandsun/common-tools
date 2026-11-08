"use strict";

const { attemptSourceResidual } = require("./scene-plan/residual-branch-result");
const { assertUnverifiedRegionTextPreserved } = require("./typography/screenshot-texture-evidence");
const { canErasePreservedInteriorPath } = require("./scene-plan/residual-preserved-path");
const { refineSourceNativeEdges, reassignSourceNativeEdgeOwners } = require("./routing/source-native-edge-refinement");
const { refineGrayBorderResiduals } = require("./archetypes/gray-border-residual");
const { replaceResidualCropsWithNativeComponents } = require("./scene-plan/residual-crop-native-replacement");
const { finalizeSourceNativePage, ungroupSourceNativeOverlays } = require("./scene-plan/source-native-finalization");
const { finalizeWithApprovedFrames } = require("./scene-plan/approved-frame-application-lifecycle");
const { withApprovedBackdropBudget } = require("./scene-plan/approved-backdrop-budget");
const {finalizeNativeRouteRepresentations,commitNativeRouteMaterialization}=require('./routing/source-native-route-finalization');
const {parseNativeOutputPolicy,selectNativeOutputImages}=require('./quality/native-output-selection');
const {groupSemanticNodes}=require('./scene-plan/semantic-node-edit-groups');

function filterBoundaryAttachedWatermarkTextBoxes(textBoxes = [], slideSize = {}, sourceRaster) {
  if (!Array.isArray(textBoxes) || !sourceRaster || !Number.isFinite(slideSize?.widthPt) || !Number.isFinite(slideSize?.heightPt)) return textBoxes;
  const { sourceTextEraseMask } = require("./typography/residual-source-text-evidence");
  const { compileResidualTextMask } = require("./typography/residual-text-mask");
  return textBoxes.filter((tb) => {
    if (!tb || typeof tb !== "object" || typeof tb.text !== "string" || (!tb.box || !Number.isFinite(tb.box.x) || !Number.isFinite(tb.box.y) || !Number.isFinite(tb.box.w) || !Number.isFinite(tb.box.h))) return true;
    if (tb.box.y + tb.box.h < slideSize.heightPt * 0.94 || tb.box.x + tb.box.w < slideSize.widthPt * 0.85) return true;
    try {
      const mask = sourceTextEraseMask(tb, sourceRaster, slideSize);
      const plan = compileResidualTextMask(sourceRaster, mask, mask.textInk);
      if (plan && plan.ownedPixels === 0 && plan.rejectedBoundaryPixels > 0) return false;
    } catch {
      return true;
    }
    return true;
  });
}

function calibrateSnappedTextColorsForResidual(eraseObjects = [], slideSize = {}, sourceRaster) {
  if (!Array.isArray(eraseObjects) || !sourceRaster || !Number.isFinite(slideSize?.widthPt) || !Number.isFinite(slideSize?.heightPt)) return eraseObjects;
  const { sourceTextEraseMask } = require("./typography/residual-source-text-evidence");
  const { compileResidualTextMask, insideTextPolygon } = require("./typography/residual-text-mask");
  const chebyshev = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
  return eraseObjects.map((textBox) => {
    if (!textBox || typeof textBox !== "object" || typeof textBox.text !== "string") return textBox;
    const rawColor = typeof textBox.font?.color === "string" ? textBox.font.color.toUpperCase() : "";
    if (!/^#[0-9A-F]{6}$/u.test(rawColor)) return textBox;
    let mask, plan;
    try {
      mask = sourceTextEraseMask(textBox, sourceRaster, slideSize);
      plan = compileResidualTextMask(sourceRaster, mask, mask.textInk);
    } catch {
      return textBox;
    }
    const ink = mask.textInk;
    const isLightInk = Math.min(...ink.color) >= 200;
    if (!plan || plan.corePixels >= (isLightInk ? 160 : 16)) return textBox;
    const bgBuckets = new Map();
    for (let y = mask.y; y < mask.y + mask.h; y += 1) {
      for (let x = mask.x; x < mask.x + mask.w; x += 1) {
        const inPoly = insideTextPolygon(x + 0.5, y + 0.5, ink);
        if (inPoly && !isLightInk) continue;
        const o = (y * sourceRaster.width + x) * 4;
        if ((sourceRaster.rgba[o + 3] ?? 0) < 64) continue;
        const c = [sourceRaster.rgba[o] ?? 0, sourceRaster.rgba[o + 1] ?? 0, sourceRaster.rgba[o + 2] ?? 0];
        if (chebyshev(c, ink.color) < (inPoly ? 80 : 64)) continue;
        const k = c.map((v) => Math.round(v / 16)).join(",");
        let b = bgBuckets.get(k);
        if (!b) { b = { sum: [0, 0, 0], count: 0 }; bgBuckets.set(k, b); }
        b.count += 1;
        b.sum[0] += c[0]; b.sum[1] += c[1]; b.sum[2] += c[2];
      }
    }
    const topBg = [...bgBuckets.values()].filter((b) => b.count >= 4).sort((a, b) => b.count - a.count)[0];
    if (!topBg) return textBox;
    const bgColor = topBg.sum.map((v) => Math.round(v / topBg.count));
    const fgBuckets = new Map();
    for (let y = mask.y; y < mask.y + mask.h; y += 1) {
      for (let x = mask.x; x < mask.x + mask.w; x += 1) {
        if (!insideTextPolygon(x + 0.5, y + 0.5, ink)) continue;
        const o = (y * sourceRaster.width + x) * 4;
        if ((sourceRaster.rgba[o + 3] ?? 0) < 64) continue;
        const c = [sourceRaster.rgba[o] ?? 0, sourceRaster.rgba[o + 1] ?? 0, sourceRaster.rgba[o + 2] ?? 0];
        const distBg = chebyshev(c, bgColor);
        const distInk = chebyshev(c, ink.color);
        if (distBg < 48 || distInk <= 18 || distInk > 165) continue;
        const dot = (c[0] - bgColor[0]) * (ink.color[0] - bgColor[0]) + (c[1] - bgColor[1]) * (ink.color[1] - bgColor[1]) + (c[2] - bgColor[2]) * (ink.color[2] - bgColor[2]);
        if (dot <= 0) continue;
        const k = c.map((v) => v >> 4).join(",");
        let b = fgBuckets.get(k);
        if (!b) { b = { sum: [0, 0, 0], count: 0 }; fgBuckets.set(k, b); }
        b.count += 1;
        b.sum[0] += c[0]; b.sum[1] += c[1]; b.sum[2] += c[2];
      }
    }
    const topFg = [...fgBuckets.values()].filter((b) => b.count >= 4).sort((a, b) => b.count - a.count)[0];
    if (!topFg) return textBox;
    const fgRgb = topFg.sum.map((v) => Math.max(0, Math.min(255, Math.round(v / topFg.count))));
    const hex = `#${fgRgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
    try {
      const candidateTb = { ...textBox, font: { ...(textBox.font || {}), color: hex } };
      const candidateMask = sourceTextEraseMask(candidateTb, sourceRaster, slideSize);
      const candidatePlan = compileResidualTextMask(sourceRaster, candidateMask, candidateMask.textInk);
      if (candidatePlan && candidatePlan.corePixels >= Math.max(4, (plan.corePixels || 0) * 2) && candidatePlan.rejectedBoundaryPixels === 0 && candidatePlan.rejectedSupportPixels === 0) {
        return candidateTb;
      }
    } catch {
      // Leave uncalibrated if validation fails.
    }
    return textBox;
  });
}


module.exports = { filterBoundaryAttachedWatermarkTextBoxes, calibrateSnappedTextColorsForResidual, attemptSourceResidual, assertUnverifiedRegionTextPreserved, canErasePreservedInteriorPath, refineSourceNativeEdges, reassignSourceNativeEdgeOwners, refineGrayBorderResiduals, replaceResidualCropsWithNativeComponents, finalizeSourceNativePage, ungroupSourceNativeOverlays, finalizeWithApprovedFrames, withApprovedBackdropBudget,finalizeNativeRouteRepresentations,commitNativeRouteMaterialization,parseNativeOutputPolicy,selectNativeOutputImages,groupSemanticNodes };
