"use strict";

const { compactDeckLateTextSourceBudgetProvenance } = require('./worker-text-evidence');
const { compactDeckFinalQualitySourceProvenance } = require('./worker-quality-policy');

function compactDeckNativeShapeSourceProvenance(deck) {
  const next = structuredClone(deck);
  let changedShapes = 0;
  let removedFields = 0;
  const removedFieldNames = new Set();
  const removableFields = ["editable", "nativeRebuild", "semanticNativeStructure"];
  for (const page of Array.isArray(next?.pages) ? next.pages : []) {
    for (const shape of Array.isArray(page?.shapes) ? page.shapes : []) {
      if (!shape?.source || typeof shape.source !== "object" || Array.isArray(shape.source)) continue;
      let changed = false;
      for (const field of removableFields) {
        if (!Object.prototype.hasOwnProperty.call(shape.source, field)) continue;
        delete shape.source[field];
        removedFields += 1;
        removedFieldNames.add(field);
        changed = true;
      }
      if (changed) changedShapes += 1;
    }
  }
  if (removedFields > 0) {
    next.meta = {
      ...(next.meta || {}),
      finalShapeSourceProvenanceCompaction: {
        provider: "worker-final-shape-source-provenance-compaction-v1",
        changedShapes,
        removedFields,
        removedFieldNames: [...removedFieldNames].sort()
      }
    };
  }
  return { deck: next, changedShapes, removedFields, removedFieldNames: [...removedFieldNames].sort() };
}

function compactDeckLateShapeSourceBudgetProvenance(deck) {
  const next = structuredClone(deck);
  let changedShapes = 0;
  let removedFields = 0;
  const removedFieldNames = new Set();
  const removableFields = [
    "nativeComponentArchetype",
    "nativeComponentRole",
    "pageImage",
    "textCount",
    "rowSize",
    "sourceTextId",
    "rowIndex",
    "columnIndex",
    "finalSourceVerticalLineFit",
    "finalSaturatedColorPanelFit",
    "finalLowSaturationPanelFillFit",
    "finalLowContrastFooterMarkFit",
    "finalNativeShapeThinStrokeFit",
    "sourceComponentId",
    "sourceComponentKind"
  ];
  for (const page of Array.isArray(next?.pages) ? next.pages : []) {
    for (const shape of Array.isArray(page?.shapes) ? page.shapes : []) {
      if (!shape?.source || typeof shape.source !== "object" || Array.isArray(shape.source)) continue;
      let changed = false;
      for (const field of removableFields) {
        if (!Object.prototype.hasOwnProperty.call(shape.source, field)) continue;
        delete shape.source[field];
        removedFields += 1;
        removedFieldNames.add(field);
        changed = true;
      }
      if (shape.source.componentQualityIgnore === true
        && typeof shape.source.detector === "string"
        && shape.source.detector.endsWith("-native-primitive")) {
        delete shape.source.detector;
        removedFields += 1;
        removedFieldNames.add("detector");
        changed = true;
      }
      if (changed) changedShapes += 1;
    }
  }
  if (removedFields > 0) {
    next.meta = {
      ...(next.meta || {}),
      finalLateShapeSourceBudgetCompaction: {
        provider: "worker-final-late-shape-source-budget-compaction-v1",
        changedShapes,
        removedFields,
        removedFieldNames: [...removedFieldNames].sort()
      }
    };
  }
  return { deck: next, changedShapes, removedFields, removedFieldNames: [...removedFieldNames].sort() };
}

function compactDeckFinalPrimitiveCandidate(deck) {
  const nativeCompacted = compactDeckNativeShapeSourceProvenance(deck).deck;
  const shapeCompacted = compactDeckLateShapeSourceBudgetProvenance(nativeCompacted).deck;
  const textCompacted = compactDeckLateTextSourceBudgetProvenance(shapeCompacted).deck;
  return compactDeckPrimitiveCandidateDiagnosticMeta(compactDeckFinalQualitySourceProvenance(textCompacted).deck);
}

function compactDeckPrimitiveCandidateDiagnosticMeta(deck) {
  const next = structuredClone(deck);
  if (!next.meta || typeof next.meta !== "object" || Array.isArray(next.meta)) return next;
  compactUnsafeDiagnosticNumbers(next.meta);
  return next;
}

function compactUnsafeDiagnosticNumbers(value) {
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    const child = value[key];
    if (typeof child === "number") {
      if (!Number.isFinite(child) || Math.abs(child) > 100000) delete value[key];
      continue;
    }
    if (child && typeof child === "object") compactUnsafeDiagnosticNumbers(child);
  }
}

module.exports = { compactDeckNativeShapeSourceProvenance, compactDeckLateShapeSourceBudgetProvenance, compactDeckFinalPrimitiveCandidate, compactDeckPrimitiveCandidateDiagnosticMeta, compactUnsafeDiagnosticNumbers };
