"use strict";
// @ts-check

const PRODUCER_FIELDS = Object.freeze([
  "demandUnderstandingNativeTextBoxes",
  "comparisonMatrixNativeTextBoxes",
  "genericNodeDiagramNativeTextBoxes",
  "horizontalStepChainNativeTextBoxes",
  "sparseFlowCardChainNativeTextBoxes",
  "sparseMatrixProcessStripNativeTextBoxes",
  "visualClusterStackNativeTextBoxes",
  "valueQuadrantNativeTextBoxes",
  "coverEngineCoreNativeTextBoxes",
  "prototypeValidationNativeTextBoxes",
  "skillChainOverviewNativeTextBoxes",
  "triangleTopologyNativeTextBoxes",
  "wmsRouteChainNativeTextBoxes",
  "collaborationFlowNativeTextBoxes",
  "prdGenerationNativeTextBoxes",
  "saturatedDiagramNativeTextBoxes",
  "twoPanelDiagramNativeTextBoxes",
  "topComplexDiagramNativeTextBoxes",
  "tableZoneSemanticNativeTextBoxes",
  "kpiEvidenceNativeTextBoxes"
]);

/** @param {unknown} value @returns {Record<string, unknown> | null} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? /** @type {Record<string, unknown>} */ (value) : null;
}
/** Read data properties without executing accessors from malformed metadata.
 * @param {unknown} value @param {string} key @returns {unknown} */
function field(value, key) {
  const object = record(value);
  if (!object) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (descriptor && !("value" in descriptor)) throw new TypeError("diagram text metadata accessor is invalid");
  return descriptor?.value;
}
/** @param {unknown} value */
function label(value) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.length > 100000) throw new TypeError("diagram text label is invalid");
  return value;
}
/** @param {unknown} value */
function coordinate(value) {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value !== "number" && typeof value !== "string") throw new TypeError("diagram text coordinate is invalid");
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > 1000000) throw new TypeError("diagram text coordinate is invalid");
  return Math.round(number * 100) / 100;
}
/** Collect internal producer metadata in stable image/producer/item order.
 * Retain original object identity; specialized ownership remains a later stage.
 * @param {unknown} images
 * @returns {Record<string, unknown>[]} */
function collectDiagramTextCandidates(images = []) {
  if (images === null) return [];
  if (!Array.isArray(images) || images.length > 100000) throw new TypeError("diagram text images are invalid");
  const result = [];
  const seen = new Set();
  let count = 0;
  for (const image of images) {
    const source = field(image, "source");
    for (const producer of PRODUCER_FIELDS) {
      const items = field(source, producer);
      if (!Array.isArray(items)) continue;
      count += items.length;
      if (count > 100000) throw new RangeError("diagram text candidate limit exceeded");
      for (const item of items) {
        const textBox = record(item);
        if (!textBox) throw new TypeError("diagram text candidate is invalid");
        const box = field(textBox, "box");
        const key = JSON.stringify([
          label(field(field(textBox, "source"), "detector")), label(field(textBox, "text")),
          ...["x", "y", "w", "h"].map((axis) => coordinate(field(box, axis)))
        ]);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(textBox);
      }
    }
  }
  return result;
}
module.exports = { collectDiagramTextCandidates, PRODUCER_FIELDS };
