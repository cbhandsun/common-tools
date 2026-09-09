"use strict";

const path = require("path");
const { DEFAULT_SLIDE } = require("@common-tools/slideclone-core/page-text-rule-helpers");

function createAssetHubSuperBrainPortalFactory(dependencies = {}) {
  const {
    boxAreaValue,
    clampPtBoxToSlide,
    cropPng,
    ensureDir,
    eraseMasks,
    expandPtBox,
    normalizeCjkText,
    ptBoxOverlapAreaValue,
    ptToPxBox,
    round,
    safeComponentToken,
    safeIdentifier,
    temporaryAnswerWorkflowTextBox,
    writePng
  } = dependencies;
  const required = {
    boxAreaValue,
    clampPtBoxToSlide,
    cropPng,
    ensureDir,
    eraseMasks,
    expandPtBox,
    normalizeCjkText,
    ptBoxOverlapAreaValue,
    ptToPxBox,
    round,
    safeComponentToken,
    safeIdentifier,
    temporaryAnswerWorkflowTextBox,
    writePng
  };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== "function") {
      throw new TypeError(`native rebuild asset hub super brain portal dependency ${name} must be a function`);
    }
  }

  function protectAssetHubSuperBrainPortalIllustration(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
    const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");
    if (!/企业级Hub门户|超级数字大脑/.test(labels)) return false;
    let target = (page.images || []).find((image) => {
      const box = image?.box || {};
      const areaRatio = Number(box.w || 0) * Number(box.h || 0)
        / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
      return image?.source?.detector === "structured-case-graphic-underlay-crop" && areaRatio >= 0.55;
    });
    if (!target && (!options.sourceImage || !options.assetDir || !options.irDir)) return false;
    target.source = {
      ...(target.source || {}),
      detector: "asset-hub-super-brain-portal-illustration-crop",
      strategy: "local-fidelity-crop",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "3d-portal-landscape-infographic",
      recommendedAction: "keep-local-crop",
      intentionalMinimumUnitCrop: true,
      protectedMinimumUnit: true,
      skipVisualAtomRebuild: true,
      assetHubSuperBrainPortalProtected: true,
      componentRenderStrategy: {
        ...(target.source?.componentRenderStrategy || {}),
        mode: "preserve-crop-with-native-overlays",
        implementationMode: "hybrid-native-overlay",
        editableExpectation: "fidelity-illustration-with-editable-native-callout-overlays",
        visualFidelityBias: "fidelity-first",
        applicationPlan: {
          currentStep: "preserve-source-crop-and-rebuild-detected-overlays-as-native",
          targetStep: "keep-complex-illustration-below-editable-callouts",
          preservesFidelityNow: true,
          requiresDownload: false
        },
        reason: "dense perspective illustration remains a fidelity crop while OCR-backed callouts are rebuilt as native editable overlays"
      },
      nonEditableReason: "three-dimensional portal landscape contains dense perspective grids and micro-nodes; retaining the source illustration is more faithful than a primitive reconstruction"
    };
    target.source.layer = {
      ...(target.source.layer || {}),
      componentRenderStrategy: {
        ...(target.source.layer?.componentRenderStrategy || {}),
        ...target.source.componentRenderStrategy
      }
    };
    const calloutOverlay = inferIllustrationCalloutOverlay(rawTextBoxes, target.box, slideSize);
    if (options.sourceImage && options.assetDir && options.irDir) {
      ensureDir(options.assetDir);
      const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : 0;
      const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-asset-hub-super-brain-portal`, "asset-hub-super-brain-portal");
      const file = path.join(options.assetDir, `${base}-source-faithful-crop.png`);
      const pxBox = ptToPxBox(clampPtBoxToSlide(target.box, slideSize), options.sourceImage, slideSize, 0);
      const overlayMasks = [
        ...calloutOverlay.groups.map((group) => ptToPxBox(group.cardBox, options.sourceImage, slideSize, 0)),
        ...(calloutOverlay.quote ? [ptToPxBox(expandPtBox(calloutOverlay.quote.box, slideSize, 24, 6), options.sourceImage, slideSize, 0)] : [])
      ];
      const sourceImage = overlayMasks.length > 0
        ? eraseMasks(options.sourceImage, overlayMasks)
        : options.sourceImage;
      writePng(file, cropPng(sourceImage, pxBox));
      target.assetPath = path.relative(options.irDir, file).replace(/\\/g, "/");
      target.source.sourceFaithfulCrop = true;
      target.source.calloutOverlayReady = calloutOverlay.groups.length >= 2;
      target.source.calloutOverlayCount = calloutOverlay.groups.length;
      target.source.calloutTextErasedFromCrop = overlayMasks.length > 0;
    }
    return true;
  }

  function createAssetHubSuperBrainPortalChromeObjects(
    rawTextBoxes = [],
    illustrationBox = null,
    slideSize = DEFAULT_SLIDE,
    options = {}
  ) {
    const source = (detector, extra = {}) => {
      const calloutIndex = Number.isInteger(extra.index) ? extra.index : null;
      const componentRole = /^asset-hub-super-brain-portal-chrome-search(?:-|$)/.test(detector)
        || extra.role === "search-placeholder"
        ? "search-control"
        : calloutIndex !== null && /^asset-hub-super-brain-portal-callout(?:-|$)/.test(detector)
          ? `callout-${calloutIndex}`
          : null;
      const erasedOverlay = detector === "asset-hub-super-brain-portal-callout-text"
        && options.calloutTextErasedFromCrop === true
        && String(options.illustrationId || "").trim();
      return {
        editable: true,
        nativeRebuild: true,
        detector,
        confidence: 0.94,
        expressionForm: "text-and-ui-chrome",
        expressionSubtype: "portal-illustration-chrome",
        ...extra,
        ...(erasedOverlay
          ? { layerSourceId: String(options.illustrationId), textErasedFromCrop: true }
          : {}),
        ...(componentRole
          ? assetHubSuperBrainPortalNativeComponentMetadata(componentRole, extra.role || detector)
          : {})
      };
    };
    const shadow = { color: "#8CB4D0", alpha: 0.16, blurPt: 5, distancePt: 2, angle: 45 };
    const shapes = [
      { id: "asset-hub-super-brain-portal-chrome-search-box", type: "rect", box: { x: 716, y: 44, w: 205, h: 34 }, style: { fill: "#FFFFFF", stroke: "#CED7E2", strokeWidthPt: 1, radiusPt: 4, shadow }, source: source("asset-hub-super-brain-portal-chrome-search") },
      { id: "asset-hub-super-brain-portal-chrome-search-lens", type: "ellipse", box: { x: 729, y: 54, w: 14, h: 14 }, style: { fill: "none", stroke: "#95A3AF", strokeWidthPt: 1.5 }, source: source("asset-hub-super-brain-portal-chrome-search-icon") },
      { id: "asset-hub-super-brain-portal-chrome-search-handle", type: "line", box: { x: 740, y: 66, w: 8, h: 8 }, style: { stroke: "#95A3AF", strokeWidthPt: 1.5, connectorType: "straight" }, source: source("asset-hub-super-brain-portal-chrome-search-icon") }
    ];
    const textBoxes = [
      temporaryAnswerWorkflowTextBox("asset-hub-super-brain-portal-chrome-title", "企业级 Hub 门户：构建产品资产的“超级数字大脑”", { x: 40, y: 39, w: 650, h: 38 }, { sizePt: 26, color: "#101D2F", weight: "bold", align: "left" }, source("asset-hub-super-brain-portal-chrome-text", { role: "title" })),
      temporaryAnswerWorkflowTextBox("asset-hub-super-brain-portal-chrome-subtitle", "告别人才流失导致的知识断档，让组织的每一次迭代都成为复利。", { x: 42, y: 84, w: 620, h: 22 }, { sizePt: 15.5, color: "#101D2F", weight: "regular", align: "left" }, source("asset-hub-super-brain-portal-chrome-text", { role: "subtitle" })),
      temporaryAnswerWorkflowTextBox("asset-hub-super-brain-portal-chrome-search-text", "跨域资产搜索...", { x: 752, y: 51, w: 118, h: 18 }, { sizePt: 12, color: "#8B98A5", weight: "regular", align: "left" }, source("asset-hub-super-brain-portal-chrome-text", { role: "search-placeholder" }))
    ];
    const overlay = inferIllustrationCalloutOverlay(rawTextBoxes, illustrationBox, slideSize);
    const cardShadow = { color: "#8CB4D0", alpha: 0.16, blurPt: 5, distancePt: 2, angle: 45 };
    overlay.groups.forEach((group, index) => {
      shapes.push(
        {
          id: `asset-hub-super-brain-portal-callout-${index}`,
          type: "roundRect",
          box: group.cardBox,
          style: { fill: "#F1FBFF", stroke: "#75AFC0", strokeWidthPt: 1.2, radiusPt: 5, shadow: cardShadow },
          source: source("asset-hub-super-brain-portal-callout", { index, role: "callout-card" })
        },
        {
          id: `asset-hub-super-brain-portal-callout-accent-${index}`,
          type: "roundRect",
          box: { x: group.cardBox.x, y: group.cardBox.y + 13, w: 6, h: Math.min(48, group.cardBox.h - 24) },
          style: { fill: "#2FCC87", stroke: "#2FCC87", strokeWidthPt: 0, radiusPt: 3 },
          source: source("asset-hub-super-brain-portal-callout", { index, role: "accent" })
        }
      );
      textBoxes.push(
        temporaryAnswerWorkflowTextBox(
          `asset-hub-super-brain-portal-callout-title-${index}`,
          group.title.text,
          {
            x: group.cardBox.x + 17,
            y: group.title.box.y,
            w: Math.max(group.title.box.w, group.cardBox.w - 34),
            h: group.title.box.h + 3
          },
          { sizePt: 13.5, color: "#101D2F", weight: "bold", align: "left" },
          source("asset-hub-super-brain-portal-callout-text", { index, role: "title" })
        ),
        temporaryAnswerWorkflowTextBox(
          `asset-hub-super-brain-portal-callout-body-${index}`,
          group.body.map((line) => line.text).join("\n"),
          unionTextBoxes(group.body.map((line) => line.box)),
          { sizePt: 12, color: "#101D2F", weight: "regular", align: "left", lineHeightMultiple: 1.15 },
          source("asset-hub-super-brain-portal-callout-text", { index, role: "body" })
        )
      );
    });
    if (overlay.quote) {
      textBoxes.push(temporaryAnswerWorkflowTextBox(
        "asset-hub-super-brain-portal-callout-quote",
        normalizePortalQuoteText(overlay.quote.text),
        {
          x: Math.max(150, overlay.quote.box.x - 20),
          y: overlay.quote.box.y - 1,
          w: Math.min(slideSize.widthPt - 300, overlay.quote.box.w + 40),
          h: overlay.quote.box.h + 4
        },
        { sizePt: 12.5, color: "#101D2F", weight: "bold", align: "center" },
        source("asset-hub-super-brain-portal-callout-text", { role: "quote" })
      ));
    }
    return { shapes, textBoxes };
  }
  
  function assetHubSuperBrainPortalNativeComponentMetadata(role, part) {
    const safeRole = safeComponentToken(role || "unknown");
    return {
      nativeComponentGroupId: `asset-hub-super-brain-portal-${safeRole}`,
      nativeComponentParentId: "asset-hub-super-brain-portal",
      nativeComponentArchetype: role === "search-control" ? "search-control" : "illustration-callout",
      nativeComponentInstance: true,
      nativeComponentMinimumUnit: "semantic-component",
      nativeComponentRole: role || "unknown",
      nativeComponentPart: part || "detail"
    };
  }
  
  function inferIllustrationCalloutOverlay(rawTextBoxes = [], illustrationBox = null, slideSize = DEFAULT_SLIDE) {
    if (!illustrationBox) return { groups: [], quote: null };
    const inside = (rawTextBoxes || [])
      .filter((item) => item?.box && ptBoxOverlapAreaValue(illustrationBox, item.box) >= boxAreaValue(item.box) * 0.72)
      .filter((item) => String(item.text || "").trim())
      .sort((left, right) => Number(left.box.y || 0) - Number(right.box.y || 0) || Number(left.box.x || 0) - Number(right.box.x || 0));
    const quote = inside.find((item) =>
      Number(item.box.y || 0) >= Number(illustrationBox.y || 0) + Number(illustrationBox.h || 0) * 0.86
      && Number(item.box.w || 0) >= Number(illustrationBox.w || 0) * 0.35
    ) || null;
    const content = inside.filter((item) => item !== quote && Number(item.box.y || 0) < Number(illustrationBox.y || 0) + Number(illustrationBox.h || 0) * 0.45);
    const clusters = [];
    for (const item of content) {
      const centerX = Number(item.box.x || 0) + Number(item.box.w || 0) / 2;
      const cluster = clusters.find((candidate) =>
        Math.abs(candidate.centerX - centerX) <= Math.max(72, Number(illustrationBox.w || 0) * 0.12)
        && Number(item.box.y || 0) <= candidate.bottom + 30
      );
      if (cluster) {
        cluster.items.push(item);
        cluster.centerX = cluster.items.reduce(
          (sum, entry) => sum + Number(entry.box.x || 0) + Number(entry.box.w || 0) / 2,
          0
        ) / cluster.items.length;
        cluster.bottom = Math.max(cluster.bottom, Number(item.box.y || 0) + Number(item.box.h || 0));
      } else {
        clusters.push({ items: [item], centerX, bottom: Number(item.box.y || 0) + Number(item.box.h || 0) });
      }
    }
    const groups = clusters
      .filter((cluster) => cluster.items.length >= 2)
      .map((cluster) => {
        const items = cluster.items.slice().sort((left, right) => Number(left.box.y || 0) - Number(right.box.y || 0));
        const title = items.slice().sort((left, right) => Number(right.box.h || 0) - Number(left.box.h || 0))[0];
        const body = items.filter((item) => item !== title).sort((left, right) => Number(left.box.y || 0) - Number(right.box.y || 0));
        const textBounds = unionTextBoxes(items.map((item) => item.box));
        return {
          title,
          body,
          cardBox: clampPtBoxToSlide({
            x: textBounds.x - 16,
            y: textBounds.y - 15,
            w: textBounds.w + 31,
            h: textBounds.h + 28
          }, slideSize)
        };
      })
      .filter((group) => group.body.length >= 1 && group.cardBox.w >= 150 && group.cardBox.h >= 60)
      .sort((left, right) => left.cardBox.x - right.cardBox.x);
    return { groups: groups.length >= 2 && groups.length <= 5 ? groups : [], quote };
  }
  
  function unionTextBoxes(boxes = []) {
    const valid = boxes.filter((box) => box && Number(box.w || 0) > 0 && Number(box.h || 0) > 0);
    if (valid.length === 0) return { x: 0, y: 0, w: 1, h: 1 };
    const x1 = Math.min(...valid.map((box) => Number(box.x || 0)));
    const y1 = Math.min(...valid.map((box) => Number(box.y || 0)));
    const x2 = Math.max(...valid.map((box) => Number(box.x || 0) + Number(box.w || 0)));
    const y2 = Math.max(...valid.map((box) => Number(box.y || 0) + Number(box.h || 0)));
    return { x: round(x1), y: round(y1), w: round(x2 - x1), h: round(y2 - y1) };
  }
  
  
  
  function normalizePortalQuoteText(text = "") {
    const normalized = String(text || "").trim().replace(/^["“”]+|["“”]+$/g, "");
    return normalized ? `“${normalized}”` : "";
  }

  return {
    createAssetHubSuperBrainPortalChromeObjects,
    protectAssetHubSuperBrainPortalIllustration
  };
}

module.exports = { createAssetHubSuperBrainPortalFactory };
