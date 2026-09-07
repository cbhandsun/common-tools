"use strict";

const NARRATIVE_PREFIXES = [
  "结构自动成型：",
  "规则完整覆盖：",
  "边界智能补全：",
  "口径绝对统一："
];

function createPrdAutoGenerationNarrativeTextBoxes(rawTextBoxes = []) {
  if (!Array.isArray(rawTextBoxes)) return [];
  const result = [];
  for (const [index, prefix] of NARRATIVE_PREFIXES.entries()) {
    const item = rawTextBoxes.find((candidate) => String(candidate?.text || "").trim().startsWith(prefix));
    if (!item || !isBox(item.box)) continue;
    const text = String(item.text || "").trim();
    const body = text.slice(prefix.length);
    if (!body) continue;
    const sizePt = clamp(Number(item.font?.sizePt), 9.5, 13, 11.5);
    const evidenceBox = copyBox(item.box);
    result.push({
      id: `prd-auto-generation-narrative-${index + 1}`,
      text,
      box: copyBox(item.box),
      font: { family: "Microsoft YaHei", sizePt, color: "#111111", opacity: 1, weight: "regular", align: "left", valign: "middle" },
      style: { visibility: "visible", opacity: 1, wrap: false, fit: "shrink", marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0 },
      runs: [
        { text: prefix, font: { family: "Microsoft YaHei", sizePt, weight: "bold", color: "#111111" } },
        { text: body, font: { family: "Microsoft YaHei", sizePt, weight: "regular", color: "#111111" } }
      ],
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "prd-auto-generation-native-narrative",
        nativeComponentInstance: true,
        nativeComponentGroupId: "prd-auto-generation-narrative",
        nativeComponentArchetype: "prd-auto-generation-flow",
        nativeComponentRole: `narrative-${index + 1}`,
        confidence: Number.isFinite(Number(item.source?.confidence)) ? Number(item.source.confidence) : 0.8,
        evidenceBox
      }
    });
  }
  return result;
}

function isBox(box) {
  return [box?.x, box?.y, box?.w, box?.h].every((value) => Number.isFinite(Number(value)))
    && Number(box.w) > 0
    && Number(box.h) > 0;
}

function copyBox(box) {
  return { x: Number(box.x), y: Number(box.y), w: Number(box.w), h: Number(box.h) };
}

function clamp(value, min, max, fallback) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

module.exports = {
  NARRATIVE_PREFIXES,
  createPrdAutoGenerationNarrativeTextBoxes
};
