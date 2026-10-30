"use strict";



function residualDeduplicationStatus(deck, residual) {
  const required = Array.isArray(deck?.pages) && deck.pages.some((page) => (Array.isArray(page?.images) ? page.images : []).some((image) => image?.source?.residualCrop === true));
  const candidateObjects = Number.isSafeInteger(residual?.candidateObjects) && residual.candidateObjects >= 0 ? residual.candidateObjects : 0;
  const erasedObjects = Number.isSafeInteger(residual?.erasedObjects) && residual.erasedObjects >= 0 ? residual.erasedObjects : 0;
  return Object.freeze({ required, passed: !required || (candidateObjects > 0 && erasedObjects === candidateObjects), candidateObjects, erasedObjects });
}

function visualFallbackAnchor(pageIndex) {
  return {
    id: `visual-fallback-native-anchor-${pageIndex + 1}`,
    type: "rect",
    box: { x: 0, y: 0, w: 1, h: 1 },
    style: { fill: "#FFFFFF", stroke: "none", strokeWidthPt: 0, opacity: 0 },
    source: { editable: true, nativeRebuild: true, detector: "visual-fallback-native-anchor" }
  };
}

function visualFallbackRejection(suffix, code) {
  return Object.freeze({ suffix, code });
}

function vectorizeLegacySimpleStatusIconMarks(page) {
  if (!page || typeof page !== "object" || !Array.isArray(page.textBoxes)) return 0;
  const shapes = Array.isArray(page.shapes) ? page.shapes : [];
  const retainedTextBoxes = [];
  let converted = 0;
  for (const textBox of page.textBoxes) {
    const detector = String(textBox?.source?.detector || "");
    const mark = String(textBox?.text || "").trim();
    if (detector !== "simple-status-icon-mark" || (mark !== "✓" && mark !== "×")) {
      retainedTextBoxes.push(textBox);
      continue;
    }
    const box = textBox?.box || {};
    if (!["x", "y", "w", "h"].every((key) => Number.isFinite(Number(box[key]))) || Number(box.w) <= 0 || Number(box.h) <= 0) {
      retainedTextBoxes.push(textBox);
      continue;
    }
    converted += 1;
  }
  if (converted > 0) {
    page.textBoxes = retainedTextBoxes;
    page.shapes = shapes;
  }
  return converted;
}

function normalizeKnowledgeGraphNativeZOrder(page) {
  if (!page || typeof page !== "object" || !Array.isArray(page.shapes)) return 0;
  const indexed = page.shapes.map((shape, index) => ({ shape, index }));
  const knowledgeGraph = indexed.filter((entry) => String(entry.shape?.source?.detector || "").startsWith("team-knowledge-graph-"));
  if (knowledgeGraph.length < 2) return 0;
  const order = (shape) => {
    const role = String(shape?.source?.nativeComponentRole || "");
    const detector = String(shape?.source?.detector || "");
    if (role === "panel" || role === "layer-band") return 0;
    if (role === "relationship") return 1;
    if (role === "node") return 2;
    if (/team-knowledge-graph-(panel|layer-band)/u.test(detector)) return 0;
    if (/team-knowledge-graph-(.*link|translator-hub|right-|feedback-|layer-flow|pictorial-|legacy-)/u.test(detector)) return 1;
    if (/team-knowledge-graph-node-/u.test(detector)) return 2;
    return 3;
  };
  const sorted = [...knowledgeGraph].sort((left, right) => order(left.shape) - order(right.shape) || left.index - right.index);
  let changed = 0;
  let cursor = 0;
  page.shapes = indexed.map((entry) => {
    if (!String(entry.shape?.source?.detector || "").startsWith("team-knowledge-graph-")) return entry.shape;
    const replacement = sorted[cursor++].shape;
    if (replacement !== entry.shape) changed += 1;
    return replacement;
  });
  return changed;
}

function isReplaceablePictorialIconCrop(image) {
  if (!image || typeof image !== "object") return false;
  if (!image.box || ![image.box.x, image.box.y, image.box.w, image.box.h].every(Number.isFinite) || image.box.w <= 0 || image.box.h <= 0) return false;
  const source = image.source && typeof image.source === "object" ? image.source : {};
  return source.detector === "knowledge-graph-semantic-icon-crop"
    && source.protectedMinimumUnit === true
    && source.expressionForm === "icon-or-illustration"
    && source.intentionalMinimumUnitCrop === true;
}

module.exports = { residualDeduplicationStatus, visualFallbackAnchor, visualFallbackRejection, vectorizeLegacySimpleStatusIconMarks, normalizeKnowledgeGraphNativeZOrder, isReplaceablePictorialIconCrop };
