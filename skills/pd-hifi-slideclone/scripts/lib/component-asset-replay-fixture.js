"use strict";

const path = require("node:path");
const { createComponentTemplateNativeObjects } = require("./component-template-native-shapes");

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function buildComponentAssetReplayIr({ summary = {}, sourceImage = "", slideSize = DEFAULT_SLIDE, asset = {}, assetDir = "" } = {}) {
  const safeSlide = normalizeSlideSize(slideSize);
  const group = selectReplayGroup(summary.componentCatalog);
  if (!group) throw new Error("No reusable component replay group found");
  const box = normalizeBox(group.boundsPt, safeSlide);
  if (!box) throw new Error("Selected component group has invalid bounds");
  const provider = safeToken(asset.provider, "local-component");
  const replayGroup = {
    ...group,
    score: Math.max(96, finiteNumber(group.score ?? group.componentScore, 96)),
    matchScore: Math.max(96, finiteNumber(group.matchScore ?? group.componentScore, 96)),
    assetAppliedComponent: true,
    assetReusePolicy: "inspect-openxml-applied-plugin-component",
    assetMotifReady: true,
    assetTargetMotifs: sanitizeMotifs(group.structure?.motifs),
    reuseReadiness: group.reuseReadiness?.level === "high"
      ? group.reuseReadiness
      : { level: "high", score: 100, reasons: ["self-fidelity-replay-fixture"] }
  };
  const family = familyForStructure(group.structure?.kind);
  const image = {
    id: "component-self-fidelity-source",
    type: "fidelity-crop",
    box,
    source: {
      detector: "component-self-fidelity-source",
      expressionForm: "diagram-or-chart",
      recommendedAction: "rebuild-native",
      componentAssetReadiness: {
        status: "applied-plugin-motif-ready",
        targetMotifs: replayGroup.assetTargetMotifs
      },
      componentRenderStrategy: {
        mode: "plugin-component-template",
        applicationPlan: {
          currentStep: "replay-applied-plugin-component",
          preservesFidelityNow: false
        }
      },
      layer: {
        layerType: "diagram-zone",
        templateFamily: family,
        box
      },
      componentLocalAssets: [{
        provider,
        name: safeText(asset.name).slice(0, 160) || "component-self-fidelity.pptx",
        path: safeAbsolutePath(asset.path),
        roleTags: ["applied-component", "template-layout", "openxml-inspectable"],
        reusePolicy: "inspect-openxml-applied-plugin-component",
        recommendedComponentGroups: [replayGroup]
      }]
    }
  };
  const objects = createComponentTemplateNativeObjects([image], safeSlide, {
    minScore: 58,
    preserveGenericPluginText: true,
    assetDir: safeAbsolutePath(assetDir)
  });
  if (objects.shapes.length < 3) throw new Error("Component replay produced insufficient native shapes");
  return {
    version: "1.0",
    slideSize: safeSlide,
    pages: [{
      pageIndex: 0,
      sourceImage: safeAbsolutePath(sourceImage),
      background: { fill: "#FFFFFF" },
      shapes: objects.shapes,
      textBoxes: objects.textBoxes,
      images: objects.images,
      tables: [],
      charts: [],
      source: {
        detector: "component-asset-self-fidelity-replay",
        componentGroupId: group.id,
        componentProvider: provider
      }
    }]
  };
}

function selectReplayGroup(catalog = []) {
  return (Array.isArray(catalog) ? catalog : [])
    // Keep this aligned with isolated native verification: a three-part arrow or process
    // component is still meaningfully editable, and remains subject to visual fidelity gates.
    .filter((group) => Array.isArray(group?.replayChildLayout?.children) && group.replayChildLayout.children.length >= 3)
    .filter((group) => normalizeBox(group?.boundsPt, { widthPt: 100000, heightPt: 100000 }))
    .sort((a, b) => replayGroupScore(b) - replayGroupScore(a) || safeText(a.id).localeCompare(safeText(b.id)))[0] || null;
}

function replayGroupScore(group = {}) {
  const replayCount = Array.isArray(group?.replayChildLayout?.children) ? group.replayChildLayout.children.length : 0;
  const picturePenalty = finiteNumber(group.pictureCount, 0) * 12;
  const connectorBonus = Math.min(18, finiteNumber(group.connectorCount, 0) * 3);
  const readinessBonus = safeText(group.reuseReadiness?.level).toLowerCase() === "high" ? 20 : 0;
  return finiteNumber(group.componentScore, 0) + Math.min(48, replayCount) + connectorBonus + readinessBonus - picturePenalty;
}

function parsePresentationSlideSize(xml = "") {
  const tag = (String(xml).match(/<p:sldSz\b[^>]*>/i) || [])[0] || "";
  const cx = Number((tag.match(/\bcx="(\d+)"/i) || [])[1]);
  const cy = Number((tag.match(/\bcy="(\d+)"/i) || [])[1]);
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || cx <= 0 || cy <= 0) return { ...DEFAULT_SLIDE };
  return normalizeSlideSize({ widthPt: cx / 12700, heightPt: cy / 12700 });
}

function normalizeSlideSize(value = {}) {
  const widthPt = finiteNumber(value.widthPt, DEFAULT_SLIDE.widthPt);
  const heightPt = finiteNumber(value.heightPt, DEFAULT_SLIDE.heightPt);
  if (widthPt < 100 || widthPt > 4000 || heightPt < 100 || heightPt > 4000) return { ...DEFAULT_SLIDE };
  return { widthPt: round(widthPt), heightPt: round(heightPt) };
}

function normalizeBox(box = {}, slideSize = DEFAULT_SLIDE) {
  const x = Number(box.x);
  const y = Number(box.y);
  const w = Number(box.w ?? box.width);
  const h = Number(box.h ?? box.height);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  if (Math.abs(x) > slideSize.widthPt * 4 || Math.abs(y) > slideSize.heightPt * 4) return null;
  if (w > slideSize.widthPt * 4 || h > slideSize.heightPt * 4) return null;
  return { x: round(x), y: round(y), w: round(w), h: round(h) };
}

function familyForStructure(value) {
  const kind = safeText(value).toLowerCase();
  if (kind === "matrix") return "grid-or-matrix";
  if (["hub-spoke", "cycle-loop", "timeline", "layered-stack", "quadrant"].includes(kind)) return kind;
  return "process-chain";
}

function sanitizeMotifs(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((value) => safeText(value).toLowerCase())
    .filter((value) => /^[a-z0-9-]{2,60}$/.test(value))
    .slice(0, 12);
}

function safeAbsolutePath(value) {
  const text = safeText(value);
  return text && path.isAbsolute(text) ? path.normalize(text) : "";
}

function safeToken(value, fallback) {
  const text = safeText(value).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return text.slice(0, 60) || fallback;
}

function safeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value) {
  return Math.round(Number(value) * 10000) / 10000;
}

module.exports = {
  buildComponentAssetReplayIr,
  parsePresentationSlideSize,
  selectReplayGroup,
  _private: {
    familyForStructure,
    normalizeBox,
    normalizeSlideSize,
    replayGroupScore,
    sanitizeMotifs
  }
};
