// @ts-check
"use strict";

const { traceDiagonalConnectorFromRaster } = require("./diagonal-connector-contours");

/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{widthPt:number,heightPt:number}} Size */
/** @typedef {{width:number,height:number,rgba:Buffer}} Raster */
/** @typedef {{ids:string[],box:Box,kind:"pictorial"|"container"}} Node */
/** @typedef {Record<string,unknown> & {images?:unknown[],shapes?:unknown[]}} Page */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** @param {unknown} value @returns {value is Box} */
function signedBox(value) {
  return record(value) && [value.x, value.y, value.w, value.h].every(number => typeof number === "number" && Number.isFinite(number));
}
/** @param {unknown} value @returns {value is Box} */
function box(value) {
  return signedBox(value) && value.w > 0 && value.h > 0;
}
/** @param {Box} value */
function center(value) { return { x: value.x + value.w / 2, y: value.y + value.h / 2 }; }
/** @param {Box} a @param {Box} b */
function union(a, b) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
/** @param {Box} a @param {Box} b @param {number} [padding] */
function intersects(a, b, padding = 0) {
  return a.x <= b.x + b.w + padding && b.x <= a.x + a.w + padding && a.y <= b.y + b.h + padding && b.y <= a.y + a.h + padding;
}
/** @param {Box} value @param {{x:number,y:number}} toward */
function boundary(value, toward) {
  const p = center(value), dx = toward.x - p.x, dy = toward.y - p.y;
  const k = 1 / Math.max(Math.abs(dx) / (value.w / 2), Math.abs(dy) / (value.h / 2));
  return { x: p.x + dx * k, y: p.y + dy * k };
}

/** Native parts and approved crops describe the same node boundary contract.
 * @param {Page} page @param {Size} slideSize */
function collectSourceConnectorNodes(page, slideSize) {
  /** @type {Node[]} */
  const nodes = [];
  /** @type {Node[]} */
  const parts = [];
  for (const item of [...(page.images || []), ...(page.shapes || [])]) {
    if (!record(item) || typeof item.id !== "string" || !item.id || item.id.length > 256
      || [...item.id].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || !box(item.box) || !record(item.source)) continue;
    const source = item.source;
    const style = record(item.style) ? item.style : {};
    if (style.opacity === 0 || item.box.w > slideSize.widthPt * 0.22 || item.box.h > slideSize.heightPt * 0.22) continue;
    const pictorial = source.intentionalMinimumUnitCrop === true || source.semanticPictorialNative === true;
    const recoveredPart = source.semanticNativeStructure === true && item.type === "freeform"
      && style.fill && style.fill !== "none" && !source.diagonalConnectorEvidence
      && !source.sparseConnectorEvidence && source.componentQualityRole !== "connector-curve"
      && source.componentQualityRole !== "connector-straight";
    if (pictorial || recoveredPart) {
      const bounds = box(source.sourceIconBox) ? source.sourceIconBox : item.box;
      if (bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.w > slideSize.widthPt || bounds.y + bounds.h > slideSize.heightPt
        || bounds.w > slideSize.widthPt * 0.22 || bounds.h > slideSize.heightPt * 0.22) continue;
      parts.push({ ids: [item.id], box: { ...bounds }, kind: "pictorial" });
      if (parts.length > 512) throw new RangeError("Source connector native part count exceeds boundary");
    } else if (source.semanticNativeStructure === true && typeof item.type === "string" && ["roundRect", "rect"].includes(item.type)
      && item.box.w >= 25 && item.box.h >= 20 && style.stroke && style.stroke !== "none") {
      nodes.push({ ids: [item.id], box: { ...item.box }, kind: "container" });
    }
  }
  // Overlapping native parts are one object, not multiple prospective endpoints.
  for (const part of parts) {
    let merged = part;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      if (!node || node.kind !== "pictorial" || !intersects(merged.box, node.box, 1)) continue;
      merged = { ids: [...node.ids, ...merged.ids], box: union(node.box, merged.box), kind: "pictorial" };
      nodes.splice(i, 1);
    }
    nodes.push(merged);
  }
  return nodes;
}

/** @param {unknown} input */
function restoreSourceNodeConnectors(input) {
  if (!record(input) || !record(input.page) || !record(input.slideSize) || !record(input.image)) throw new TypeError("Source node connector request is invalid");
  const { page, slideSize, image } = /** @type {{page:Page,slideSize:Size,image:Raster}} */ (input);
  if (![slideSize.widthPt, slideSize.heightPt].every(value => Number.isFinite(value) && value > 0)
    || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width < 1 || image.height < 1
    || image.width > 16384 || image.height > 16384 || image.width * image.height > 40_000_000
    || !Buffer.isBuffer(image.rgba) || image.rgba.length !== image.width * image.height * 4) throw new TypeError("Source node connector raster is invalid");
  for (const key of /** @type {const} */ (["shapes", "images"])) {
    if (page[key] !== undefined && (!Array.isArray(page[key]) || page[key].length > 10000)) throw new RangeError("Source node connector objects exceed boundary");
  }
  const nodes = collectSourceConnectorNodes(page, slideSize);
  if (nodes.length > 96) throw new RangeError("Source connector node count exceeds boundary");
  const shapes = Array.isArray(page.shapes) ? page.shapes : [];
  /** @type {Record<string,unknown>[]} */
  const additions = [];
  const evidence = { nodes: nodes.length, pairs: 0, supported: 0, duplicates: 0, samples: 0 };
  const scaleX = image.width / slideSize.widthPt, scaleY = image.height / slideSize.heightPt;
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    if (!a || !b) throw new Error("Source connector node boundary is incomplete");
    if (a.kind === b.kind || intersects(a.box, b.box)) continue;
    const p = boundary(a.box, center(b.box)), q = boundary(b.box, center(a.box));
    const dx = q.x - p.x, dy = q.y - p.y, length = Math.hypot(dx, dy);
    if (length < 10 || length > Math.min(slideSize.widthPt, slideSize.heightPt) * 0.25 || Math.abs(dx) < 8 || Math.abs(dy) < 8) continue;
    const inset = Math.min(2, length * 0.05);
    const from = { x: p.x + dx / length * inset, y: p.y + dy / length * inset };
    const to = { x: q.x - dx / length * inset, y: q.y - dy / length * inset };
    const region = {
      x: Math.max(0, Math.min(from.x, to.x) - 2), y: Math.max(0, Math.min(from.y, to.y) - 2),
      w: Math.abs(to.x - from.x) + 4, h: Math.abs(to.y - from.y) + 4
    };
    region.w = Math.min(region.w, slideSize.widthPt - region.x);
    region.h = Math.min(region.h, slideSize.heightPt - region.y);
    evidence.samples += Math.ceil(region.w * scaleX + 2) * Math.ceil(region.h * scaleY + 2);
    if (evidence.samples > 4_000_000) throw new RangeError("Source connector sampling exceeds boundary");
    evidence.pairs++;
    const fit = traceDiagonalConnectorFromRaster({ image, box: region, slideSize });
    if (!fit) continue;
    evidence.supported++;
    const duplicate = [...shapes, ...additions].some(item => {
      if (!record(item) || !signedBox(item.box)) return false;
      const connector = (typeof item.type === "string" && ["line", "connector"].includes(item.type)) || (record(item.source) && item.source.diagonalConnectorEvidence);
      if (!connector) return false;
      const normalized = { x: Math.min(item.box.x, item.box.x + item.box.w), y: Math.min(item.box.y, item.box.y + item.box.h), w: Math.abs(item.box.w), h: Math.abs(item.box.h) };
      const overlapW = Math.max(0, Math.min(normalized.x + normalized.w, fit.box.x + fit.box.w) - Math.max(normalized.x, fit.box.x));
      const overlapH = Math.max(0, Math.min(normalized.y + normalized.h, fit.box.y + fit.box.h) - Math.max(normalized.y, fit.box.y));
      return overlapW * overlapH / (fit.box.w * fit.box.h) >= 0.8 && normalized.w * normalized.h <= fit.box.w * fit.box.h * 1.5;
    });
    if (duplicate) { evidence.duplicates++; continue; }
    const id = `source-node-connector-${i + 1}-${j + 1}`;
    if ([...shapes, ...additions].some(item => record(item) && item.id === id)) throw new TypeError("Source connector identity conflicts");
    additions.push({ id, type: "freeform", box: fit.box,
      style: { fill: fit.color, stroke: "none", strokeWidthPt: 0, freeformSegments: fit.segments },
      source: { editable: true, nativeRebuild: true, semanticNativeStructure: true, nativeComponentRole: "relationship",
        detector: "source-node-diagonal-connector", componentQualityRole: "connector-straight", diagonalConnectorEvidence: fit.evidence,
        sourceNodeIds: [a.ids, b.ids], pageImage: page.sourceImage }
    });
  }
  return { page: { ...page, shapes: [...shapes, ...additions] }, evidence: { ...evidence, added: additions.length } };
}

module.exports = { restoreSourceNodeConnectors };
