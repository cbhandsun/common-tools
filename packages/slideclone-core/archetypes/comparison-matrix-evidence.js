"use strict";
const {normalizeCjkText} = require("./prd-generation-shapes");
const DEFAULT_SLIDE = {widthPt: 960, heightPt: 540};

function hasComparisonMatrixLayerEvidence(image = {}, page = {}) {
  const understanding = image?.source?.layer?.diagramUnderstanding || {};
  const atomCounts = understanding.visualAtomKindCounts || {};
  const gridAtomCount = Number(atomCounts["grid-line-candidate"] || 0);
  const visualGridLineCount = Number(understanding.visualGrid?.lineCount || 0);
  const nodeTexts = Array.isArray(understanding.nodes)
    ? understanding.nodes.map((node) => String(node?.text || ""))
    : [];
  const pageTexts = Array.isArray(page?.textBoxes)
    ? page.textBoxes.map((item) => String(item?.text || ""))
    : [];
  const normalized = [...nodeTexts, ...pageTexts].join(" ").replace(/\s+/g, "");
  const matrixSignals = [
    "传统手工推进",
    "普通对话式AI",
    "上下文感知",
    "质量校验与拦截",
    "资产落盘"
  ].filter((signal) => normalized.includes(signal)).length;
  return (gridAtomCount >= 4 || visualGridLineCount >= 4) && matrixSignals >= 3;
}

function comparisonMatrixVisualAtoms(image) {
  const layer = image?.source?.layer || {};
  const direct = Array.isArray(layer.visualAtoms) ? layer.visualAtoms : [];
  const understood = Array.isArray(layer.diagramUnderstanding?.visualAtoms) ? layer.diagramUnderstanding.visualAtoms : [];
  if (direct.length === 0) return understood;
  if (understood.length === 0) return direct;
  const merged = [...direct];
  for (const atom of understood) {
    if (merged.some((existing) => existing?.id && atom?.id && existing.id === atom.id)) continue;
    merged.push(atom);
  }
  return merged;
}

function shouldObjectifySkillsEngineAiComparisonMatrix(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const labels = (rawTextBoxes || page.textBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");
  if (!/AI对话框无法拯救产品经理|普通的AI对话框/.test(labels)) return false;
  const target = skillsEngineAiComparisonMatrixTarget(page);
  if (!target) return false;
  const box = target.box || {};
  const areaRatio = Number(box.w || 0) * Number(box.h || 0)
    / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  const detector = String(target.source?.detector || "");
  return areaRatio >= 0.55
    && areaRatio <= 0.72
    && /cycle-illustration-underlay-crop|table|matrix|foreground-graphic|underlay/.test(detector);
}

function skillsEngineAiComparisonMatrixTarget(page = {}) {
  return (page.images || []).find((image) => {
    const box = image?.box || {};
    if (Number(box.w || 0) < 760 || Number(box.h || 0) < 300) return false;
    const detector = String(image?.source?.detector || "");
    const reason = `${image?.source?.reason || ""} ${image?.source?.nonEditableReason || ""}`;
    return /cycle-illustration-underlay-crop|table|matrix|foreground-graphic|underlay/.test(`${detector} ${reason}`);
  }) || null;
}

module.exports = {comparisonMatrixVisualAtoms, hasComparisonMatrixLayerEvidence, shouldObjectifySkillsEngineAiComparisonMatrix, skillsEngineAiComparisonMatrixTarget};
