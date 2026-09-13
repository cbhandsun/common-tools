"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { readZipEntry } = require("./pptx-inventory");
const {
  normalizeTextVertical,
  sanitizeTemplateGradient,
  sanitizeTemplateTextReflection
} = require("./component-template-style");
const { componentTemplateTargetMotifs, isWholeProcessTemplateMatch } = require("./component-template-motifs");
const {
  boxCenter,
  boxOverlapArea,
  clampBox,
  clampNumber,
  distance,
  round,
  scaleRelativeBox
} = require("./component-template-geometry");
const { isAppliedPluginComponentMatch } = require("./component-template-applied-layout-replay");
const {
  safeColor,
  safeLocalPptxPath,
  safeMediaTarget,
  safeOutputAssetDir,
  safeRelationshipId,
  safeText
} = require("./component-template-sanitizers");

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function createComponentTemplateOutputProjection(deps = {}) {
  const componentTemplateNativeGroupId = requiredDependency(deps, "componentTemplateNativeGroupId");
  const groupHasNoisyGenericPlaceholderText = requiredDependency(deps, "groupHasNoisyGenericPlaceholderText");
  const isGenericPluginPlaceholderText = requiredDependency(deps, "isGenericPluginPlaceholderText");
  const safeBox = requiredDependency(deps, "safeBox");
  const sanitizeStructureFitReasons = requiredDependency(deps, "sanitizeStructureFitReasons");
  const shouldSkipLowReuseComponentGroup = requiredDependency(deps, "shouldSkipLowReuseComponentGroup");

  function componentTemplateTextBoxesFromShapes(shapes = [], image = {}, match = {}, textBackfillState = null, options = {}) {
    const result = [];
    for (const shape of Array.isArray(shapes) ? shapes : []) {
      const textStyle = shape?.style?.text;
      if (!textStyle || typeof textStyle !== "object") continue;
      const box = safeBox(shape.box, DEFAULT_SLIDE);
      if (!box) continue;
      const textBox = templateTextBoxFromStyle({
        id: `${shape.id || "component-template"}-text`,
        box,
        textStyle,
        textBackfillState,
        preserveGenericPluginText: options.preserveGenericPluginText === true,
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "plugin-component-template-native-textbox",
          componentTemplateGroupApplied: true,
          layerSourceId: image.id || null,
          matchedComponentGroupId: safeText(match.id),
          matchedComponentAssetProvider: safeText(match.assetProvider),
          matchedComponentAssetName: safeText(match.assetName),
          matchedComponentAssetMotifReady: match.assetMotifReady === true,
          matchedComponentTargetMotifs: componentTemplateTargetMotifs(image, match),
          matchedComponentWholeProcessTemplate: isWholeProcessTemplateMatch(image, match),
          matchedComponentStructureFitScore: clampNumber(match.structureFitScore, -100, 100, 0),
          matchedComponentStructureFitReasons: sanitizeStructureFitReasons(match.structureFitReasons),
          nativeComponentGroupId: shape?.source?.nativeComponentGroupId || componentTemplateNativeGroupId(image, match),
          nativeComponentAtomId: `${shape?.source?.nativeComponentAtomId || shape.id || "component-template"}-text`,
          nativeComponentRole: safeText(shape?.source?.nativeComponentRole),
          appliedPluginStructureRole: safeText(shape?.source?.appliedPluginStructureRole),
          replacedTextShellId: safeText(shape.id),
          appliedPluginDirectReplay: shape?.source?.appliedPluginDirectReplay === true,
          appliedPluginChildIndex: clampNumber(shape?.source?.appliedPluginChildIndex, 0, 9999, 0)
        }
      });
      if (textBox) result.push(textBox);
    }
    return result;
  }

  function componentTemplateSourceBoundTextBoxesFromShapes(shapes = [], image = {}, match = {}, textBackfillState = null) {
    if (!textBackfillState || !Array.isArray(textBackfillState.sourceTextBoxes) || textBackfillState.sourceTextBoxes.length === 0) return [];
    const result = [];
    for (const shape of Array.isArray(shapes) ? shapes : []) {
      if (shape?.style?.text) continue;
      if (shape?.source?.appliedPluginDirectReplay === true) continue;
      if (!isSourceBindableComponentPart(shape?.source?.componentTemplatePart)) continue;
      const box = safeBox(shape.box, DEFAULT_SLIDE);
      if (!box) continue;
      const part = safeText(shape?.source?.componentTemplatePart);
      const backfill = findSourceTextStrictlyInsideBox(textBindingSearchBoxForComponentPart(box, part), textBackfillState);
      if (!backfill) continue;
      result.push({
        id: `${shape.id || "component-template"}-source-text`,
        text: backfill.text,
        box: insetTextBoxForComponentPart(box),
        font: {
          family: "Microsoft YaHei",
          sizePt: sourceBoundTextSizePt(box, part, backfill.text),
          weight: /header|title/.test(part) ? "bold" : "regular",
          color: "#111827",
          align: "center",
          valign: "middle"
        },
        style: {
          marginLeftPt: 1.5,
          marginRightPt: 1.5,
          marginTopPt: 0,
          marginBottomPt: 0
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "plugin-component-template-source-bound-textbox",
          componentTemplateGroupApplied: true,
          componentTemplateSourceBoundText: true,
          layerSourceId: image.id || null,
          matchedComponentGroupId: safeText(match.id),
          matchedComponentAssetProvider: safeText(match.assetProvider),
          matchedComponentAssetName: safeText(match.assetName),
          matchedComponentAssetMotifReady: match.assetMotifReady === true,
          matchedComponentTargetMotifs: componentTemplateTargetMotifs(image, match),
          matchedComponentWholeProcessTemplate: isWholeProcessTemplateMatch(image, match),
          matchedComponentStructureFitScore: clampNumber(match.structureFitScore, -100, 100, 0),
          matchedComponentStructureFitReasons: sanitizeStructureFitReasons(match.structureFitReasons),
          nativeComponentGroupId: shape?.source?.nativeComponentGroupId || componentTemplateNativeGroupId(image, match),
          nativeComponentAtomId: `${shape?.source?.nativeComponentAtomId || shape.id || "component-template"}-source-text`,
          nativeComponentRole: safeText(shape?.source?.nativeComponentRole),
          appliedPluginStructureRole: safeText(shape?.source?.appliedPluginStructureRole) || "node",
          replacedTextShellId: safeText(shape.id),
          pluginPlaceholderTextBackfilled: true,
          pluginTextBackfillSourceId: backfill.id,
          pluginTextBackfillScore: backfill.score,
          componentTemplateTextBindingMode: "source-center-inside-component-node"
        }
      });
    }
    return result;
  }

  function isSourceBindableComponentPart(part) {
    const text = safeText(part).toLowerCase();
    return /(?:swimlane|process|timeline|quadrant|matrix|card|node|cell|header|step)/.test(text)
      && !/(?:connector|axis|decoration|background|lane$|picture|shell)/.test(text);
  }

  function findSourceTextStrictlyInsideBox(targetBox = {}, state = null) {
    const target = safeBox(targetBox, DEFAULT_SLIDE);
    if (!target || !state || !Array.isArray(state.sourceTextBoxes)) return null;
    let best = null;
    const targetCenter = boxCenter(target);
    for (const candidate of state.sourceTextBoxes) {
      if (state.usedSourceTextBoxIds.has(candidate.id)) continue;
      const candidateBox = safeBox(candidate.box, DEFAULT_SLIDE);
      if (!candidateBox) continue;
      const candidateCenter = boxCenter(candidateBox);
      const overlap = boxOverlapArea(target, candidateBox);
      const textArea = Math.max(1, candidateBox.w * candidateBox.h);
      const overlapRatio = overlap / textArea;
      const centerInside = pointInsideBox(candidateCenter, target);
      if (!centerInside && overlapRatio < 0.62) continue;
      const dist = distance(targetCenter, candidateCenter);
      const score = round(overlapRatio * 100 + (centerInside ? 35 : 0) - dist * 0.03);
      if (!best || score > best.score) best = { ...candidate, score };
    }
    if (!best) return null;
    state.usedSourceTextBoxIds.add(best.id);
    return best;
  }

  function textBindingSearchBoxForComponentPart(box = {}, part = "") {
    const safe = safeBox(box, DEFAULT_SLIDE);
    if (!safe) return box;
    if (/swimlane-header/i.test(part)) {
      return {
        x: safe.x,
        y: safe.y - Math.min(4, safe.h * 0.08),
        w: safe.w + Math.min(48, Math.max(12, safe.w * 0.55)),
        h: safe.h + Math.min(8, safe.h * 0.16)
      };
    }
    if (/swimlane-node/i.test(part)) {
      return {
        x: safe.x,
        y: safe.y - Math.min(3, safe.h * 0.08),
        w: safe.w,
        h: safe.h + Math.min(36, Math.max(10, safe.h * 1.05))
      };
    }
    return safe;
  }

  function pointInsideBox(point = {}, box = {}) {
    const x = Number(point.x);
    const y = Number(point.y);
    return Number.isFinite(x)
      && Number.isFinite(y)
      && x >= Number(box.x || 0)
      && x <= Number(box.x || 0) + Number(box.w || 0)
      && y >= Number(box.y || 0)
      && y <= Number(box.y || 0) + Number(box.h || 0);
  }

  function insetTextBoxForComponentPart(box = {}) {
    const insetX = Math.min(8, Math.max(1.5, Number(box.w || 0) * 0.04));
    const insetY = Math.min(4, Math.max(0, Number(box.h || 0) * 0.08));
    return {
      x: round(Number(box.x || 0) + insetX),
      y: round(Number(box.y || 0) + insetY),
      w: round(Math.max(1, Number(box.w || 0) - insetX * 2)),
      h: round(Math.max(1, Number(box.h || 0) - insetY * 2))
    };
  }

  function sourceBoundTextSizePt(box = {}, part = "", text = "") {
    const heightDriven = Number(box.h || 0) * (/header/.test(part) ? 0.36 : 0.42);
    const lengthPenalty = safeText(text).length > 10 ? 1.5 : 0;
    return round(clampNumber(heightDriven - lengthPenalty, 8, 18, 11));
  }

  function componentTemplateSupplementalTextBoxes(image = {}, match = {}, slideSize = DEFAULT_SLIDE, textBackfillState = null) {
    if (!isAppliedPluginComponentMatch(match)) return [];
    const targetBox = safeBox(image.box, slideSize);
    if (!targetBox) return [];
    const groups = supplementalTextGroupsForMatch(image, match);
    if (groups.length === 0) return [];
    const union = boundsUnion(groups.map((group) => group.boundsPt));
    if (!union) return [];
    const result = [];
    for (const group of groups) {
      const groupBox = mapBoundsIntoTarget(group.boundsPt, union, targetBox, slideSize);
      if (!groupBox) continue;
      const children = Array.isArray(group.childLayout?.children) ? group.childLayout.children : [];
      children.forEach((child, childIndex) => {
        const textStyle = child?.style?.text;
        if (!textStyle || typeof textStyle !== "object") return;
        const childBox = scaleRelativeBox(child.box, groupBox, slideSize);
        if (!childBox) return;
        result.push(templateTextBoxFromStyle({
          id: `${image.id || "component-template"}-${group.id || "group"}-supplemental-text-${childIndex}`,
          box: childBox,
          textStyle,
          textBackfillState,
          source: {
            editable: true,
            nativeRebuild: true,
            detector: "plugin-component-template-supplemental-textbox",
            componentTemplateGroupApplied: true,
            componentTemplateSupplementalText: true,
            layerSourceId: image.id || null,
            matchedComponentGroupId: safeText(group.id),
            matchedComponentAssetProvider: safeText(match.assetProvider),
            matchedComponentAssetName: safeText(match.assetName),
            matchedComponentAssetMotifReady: match.assetMotifReady === true,
            matchedComponentTargetMotifs: componentTemplateTargetMotifs(image, match),
            matchedComponentWholeProcessTemplate: isWholeProcessTemplateMatch(image, match),
            matchedComponentStructureFitScore: clampNumber(match.structureFitScore, -100, 100, 0),
            matchedComponentStructureFitReasons: sanitizeStructureFitReasons(match.structureFitReasons),
            nativeComponentGroupId: componentTemplateNativeGroupId(image, { id: group.id || match.id }),
            nativeComponentAtomId: `${image.id || "component-template"}-${group.id || "group"}-supplemental-text-${childIndex}`,
            appliedPluginDirectReplay: true,
            appliedPluginChildIndex: clampNumber(childIndex, 0, 9999, 0)
          }
        }));
      });
      if (result.length >= 16) break;
    }
    return result.slice(0, 16);
  }

  function supplementalTextGroupsForMatch(image = {}, match = {}) {
    const assets = Array.isArray(image?.source?.componentLocalAssets) ? image.source.componentLocalAssets : [];
    const matchedPath = safeText(match.assetPath);
    const matchedName = safeText(match.assetName);
    const matchedProvider = safeText(match.assetProvider);
    const groups = [];
    const seen = new Set();
    for (const asset of assets) {
      if (matchedPath && safeText(asset.path) !== matchedPath) continue;
      if (!matchedPath && matchedName && safeText(asset.name) !== matchedName) continue;
      if (!matchedPath && !matchedName && matchedProvider && safeText(asset.provider) !== matchedProvider) continue;
      for (const group of Array.isArray(asset.recommendedComponentGroups) ? asset.recommendedComponentGroups : []) {
        if (safeText(group.id) === safeText(match.id)) continue;
        if (shouldSkipLowReuseComponentGroup(group)) continue;
        const score = clampNumber(group.score ?? group.matchScore, 0, 100, 0);
        if (score < 35) continue;
        const textChildren = (Array.isArray(group.childLayout?.children) ? group.childLayout.children : [])
          .filter((child) => child?.style?.text && child?.box);
        if (textChildren.length === 0) continue;
        if (groupHasNoisyGenericPlaceholderText(group, { isGenericPluginPlaceholderText })) continue;
        if (!validBounds(group.boundsPt)) continue;
        const key = [
          safeText(group.id),
          round(Number(group.boundsPt.x)),
          round(Number(group.boundsPt.y)),
          round(Number(group.boundsPt.w)),
          round(Number(group.boundsPt.h))
        ].join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        groups.push(group);
      }
    }
    return groups.slice(0, 8);
  }

  function templateTextBoxFromStyle({
    id,
    box,
    textStyle = {},
    source = {},
    textBackfillState = null,
    preserveGenericPluginText = false
  } = {}) {
    const placeholder = safeText(textStyle.placeholderText).slice(0, 120);
    const genericPlaceholder = isGenericPluginPlaceholderText(placeholder);
    const backfill = genericPlaceholder ? findSourceTextBackfill(box, textBackfillState) : null;
    if (genericPlaceholder && !backfill && !preserveGenericPluginText) return null;
    const placeholderSuppressed = Boolean(backfill);
    return {
      id,
      text: backfill?.text || placeholder,
      box,
      font: {
        family: safeText(textStyle.family) || undefined,
        sizePt: clampNumber(textStyle.fontSizePt, 4, 96, 12),
        weight: safeText(textStyle.weight) === "bold" ? "bold" : "regular",
        color: safeColor(textStyle.color) || "#111111",
        align: normalizeTextAlign(textStyle.align),
        valign: normalizeTextValign(textStyle.valign),
        ...(Number.isFinite(Number(textStyle.lineHeightMultiple))
          ? { lineHeightMultiple: clampNumber(textStyle.lineHeightMultiple, 0.5, 4, 1) }
          : {})
      },
      style: {
        marginLeftPt: clampNumber(textStyle.marginLeftPt, 0, 72, 0),
        marginRightPt: clampNumber(textStyle.marginRightPt, 0, 72, 0),
        marginTopPt: clampNumber(textStyle.marginTopPt, 0, 72, 0),
        marginBottomPt: clampNumber(textStyle.marginBottomPt, 0, 72, 0),
        ...(normalizeTextVertical(textStyle.vertical) ? { vertical: normalizeTextVertical(textStyle.vertical) } : {}),
        ...(sanitizeTemplateGradient(textStyle.gradient) ? { textGradient: sanitizeTemplateGradient(textStyle.gradient) } : {}),
        ...(sanitizeTemplateTextReflection(textStyle.reflection) ? { textReflection: sanitizeTemplateTextReflection(textStyle.reflection) } : {})
      },
      source: {
        ...source,
        pluginPlaceholderTextSuppressed: placeholderSuppressed,
        ...(genericPlaceholder && !backfill && preserveGenericPluginText
          ? { pluginPlaceholderTextPreservedForLearning: true }
          : {}),
        ...(backfill ? {
          pluginPlaceholderTextBackfilled: true,
          pluginTextBackfillSourceId: backfill.id,
          pluginTextBackfillScore: backfill.score
        } : {})
      }
    };
  }

  function normalizeSourceTextBoxes(textBoxes = []) {
    return (Array.isArray(textBoxes) ? textBoxes : [])
      .map((item, index) => {
        const box = safeBox(item?.box, DEFAULT_SLIDE);
        const text = safeText(item?.text).slice(0, 240);
        if (!box || !text || isGenericPluginPlaceholderText(text)) return null;
        return {
          id: safeText(item.id) || `source-text-${index}`,
          text,
          box
        };
      })
      .filter(Boolean)
      .slice(0, 300);
  }

  function findSourceTextBackfill(targetBox = {}, state = null) {
    if (!state || !Array.isArray(state.sourceTextBoxes) || state.sourceTextBoxes.length === 0) return null;
    const target = safeBox(targetBox, DEFAULT_SLIDE);
    if (!target) return null;
    const targetArea = Math.max(1, target.w * target.h);
    const targetCenter = boxCenter(target);
    const maxDistance = Math.max(28, Math.min(160, Math.max(target.w, target.h) * 2.2));
    let best = null;
    for (const candidate of state.sourceTextBoxes) {
      if (state.usedSourceTextBoxIds.has(candidate.id)) continue;
      const overlap = boxOverlapArea(target, candidate.box);
      const overlapRatio = overlap / Math.max(1, Math.min(targetArea, candidate.box.w * candidate.box.h));
      const dist = distance(targetCenter, boxCenter(candidate.box));
      if (overlapRatio < 0.08 && dist > maxDistance) continue;
      const score = round(overlapRatio * 100 - dist * 0.05);
      if (!best || score > best.score) best = { ...candidate, score };
    }
    if (!best) return null;
    state.usedSourceTextBoxIds.add(best.id);
    return best;
  }

  function boundsUnion(boundsList = []) {
    const valid = (Array.isArray(boundsList) ? boundsList : []).filter(validBounds);
    if (valid.length === 0) return null;
    const left = Math.min(...valid.map((box) => Number(box.x)));
    const top = Math.min(...valid.map((box) => Number(box.y)));
    const right = Math.max(...valid.map((box) => Number(box.x) + Number(box.w)));
    const bottom = Math.max(...valid.map((box) => Number(box.y) + Number(box.h)));
    return { x: left, y: top, w: right - left, h: bottom - top };
  }

  function validBounds(box = {}) {
    return !!box
      && typeof box === "object"
      && [box.x, box.y, box.w, box.h].every((value) => Number.isFinite(Number(value)))
      && Number(box.w) > 0
      && Number(box.h) > 0;
  }

  function mapBoundsIntoTarget(bounds = {}, union = {}, targetBox = {}, slideSize = DEFAULT_SLIDE) {
    if (!validBounds(bounds) || !validBounds(union) || !validBounds(targetBox)) return null;
    return clampBox({
      x: Number(targetBox.x) + ((Number(bounds.x) - Number(union.x)) / Number(union.w)) * Number(targetBox.w),
      y: Number(targetBox.y) + ((Number(bounds.y) - Number(union.y)) / Number(union.h)) * Number(targetBox.h),
      w: (Number(bounds.w) / Number(union.w)) * Number(targetBox.w),
      h: (Number(bounds.h) / Number(union.h)) * Number(targetBox.h)
    }, slideSize);
  }

  function componentTemplateImagesFromShapes(shapes = [], image = {}, match = {}, options = {}) {
    const assetDir = safeOutputAssetDir(options.assetDir);
    if (!assetDir) return [];
    const assetPath = safeLocalPptxPath(match.assetPath);
    if (!assetPath) return [];
    const result = [];
    for (const shape of Array.isArray(shapes) ? shapes : []) {
      if (shape?.source?.appliedPluginPictureShell !== true) continue;
      const picture = shape?.style?.picture || {};
      const mediaTarget = safeMediaTarget(picture.mediaTarget);
      if (!mediaTarget) continue;
      const copied = extractPluginPictureMedia({ assetPath, mediaTarget, assetDir });
      if (!copied) continue;
      result.push({
        id: `${shape.id || "component-template-picture"}-image`,
        type: "plugin-component-picture",
        box: shape.box,
        assetPath: copied,
        drawAfterShapes: true,
        style: {
          opacity: Number.isFinite(Number(picture.opacity)) ? clampNumber(picture.opacity, 0, 1, 1) : undefined,
          crop: picture.crop || undefined
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "plugin-component-template-native-picture",
          layerSourceId: image.id || null,
          matchedComponentGroupId: safeText(match.id),
          matchedComponentAssetProvider: safeText(match.assetProvider),
          matchedComponentAssetName: safeText(match.assetName),
          matchedComponentAssetMotifReady: match.assetMotifReady === true,
          matchedComponentTargetMotifs: componentTemplateTargetMotifs(image, match),
          matchedComponentWholeProcessTemplate: isWholeProcessTemplateMatch(image, match),
          matchedComponentStructureFitScore: clampNumber(match.structureFitScore, -100, 100, 0),
          matchedComponentStructureFitReasons: sanitizeStructureFitReasons(match.structureFitReasons),
          matchedComponentAssetPath: assetPath,
          nativeComponentGroupId: shape?.source?.nativeComponentGroupId || componentTemplateNativeGroupId(image, match),
          nativeComponentAtomId: `${shape?.source?.nativeComponentAtomId || shape.id || "component-template"}-image`,
          nativeComponentRole: safeText(shape?.source?.nativeComponentRole),
          appliedPluginStructureRole: safeText(shape?.source?.appliedPluginStructureRole),
          replacedPictureShellId: shape.id || "",
          appliedPluginPictureRelId: safeRelationshipId(picture.embedRelId),
          appliedPluginPictureMediaTarget: mediaTarget,
          appliedPluginPictureCrop: picture.crop ? JSON.stringify(picture.crop) : ""
        }
      });
    }
    return result;
  }

  return {
    componentTemplateImagesFromShapes,
    componentTemplateSourceBoundTextBoxesFromShapes,
    componentTemplateSupplementalTextBoxes,
    componentTemplateTextBoxesFromShapes,
    normalizeSourceTextBoxes
  };
}

function extractPluginPictureMedia({ assetPath, mediaTarget, assetDir }) {
  const safeTarget = safeMediaTarget(mediaTarget);
  const safeAssetPath = safeLocalPptxPath(assetPath);
  const safeDir = safeOutputAssetDir(assetDir);
  if (!safeTarget || !safeAssetPath || !safeDir) return "";
  let data;
  try {
    data = readZipEntry(safeAssetPath, safeTarget, { maxBytes: 8 * 1024 * 1024 });
  } catch {
    return "";
  }
  if (!data || data.length === 0) return "";
  const ext = path.extname(safeTarget).toLowerCase();
  const hash = crypto.createHash("sha1").update(safeAssetPath).update("\0").update(safeTarget).update("\0").update(data).digest("hex").slice(0, 16);
  const dir = path.join(safeDir, "plugin-component-media");
  const out = path.join(dir, `plugin-${hash}${ext}`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(out)) fs.writeFileSync(out, data);
    return out;
  } catch {
    return "";
  }
}

function normalizeTextAlign(value) {
  const text = safeText(value).toLowerCase();
  return ["left", "center", "right", "justify"].includes(text) ? text : "center";
}

function normalizeTextValign(value) {
  const text = safeText(value).toLowerCase();
  return ["top", "middle", "bottom"].includes(text) ? text : "top";
}

function requiredDependency(deps = {}, name = "") {
  const value = deps[name];
  if (typeof value !== "function") throw new TypeError(`${name} dependency is required`);
  return value;
}

module.exports = {
  createComponentTemplateOutputProjection
};
