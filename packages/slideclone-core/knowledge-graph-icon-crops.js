"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { cropPng, readPng, writePng } = require("./png");
const { inferIntrusionEdges, inferPointFacingEdges, refineDenseIconCrop } = require("./icon-crop-refiner");
const { buildMinimumUnitCropEvidence } = require("./graphic-crop-policy");

function refineKnowledgeGraphIconCrops({ page, slideSize, sourceFile, root } = {}) {
  validateInput(page, slideSize, sourceFile, root);
  if (page?.source?.semanticNativeStructure?.profile !== "knowledge-graph-three-panel-v1") return Object.freeze({ matched: false, replacedCrops: 0, createdCrops: 0 });
  const candidates = (Array.isArray(page.images) ? page.images : []).filter((item) => isCentralDiagramCrop(item, slideSize));
  if (candidates.length < 3 || candidates.length > 8) return Object.freeze({ matched: false, replacedCrops: 0, createdCrops: 0 });
  const source = readPng(sourceFile); const assetDir = path.join(root, "assets");
  fs.mkdirSync(assetDir, { recursive: true });
  const candidateIds = new Set(candidates.map((item) => item.id));
  const retained = page.images.filter((item) => !candidateIds.has(item.id));
  const semanticHub = candidateCentroid(candidates);
  const relationships = (Array.isArray(page.shapes) ? page.shapes : []).filter((shape) => shape?.type === "line" && /pictorial/u.test(shape.source?.detector || ""));
  const created = candidates.map((candidate, index) => createIconCrop({ candidate, index, source, assetDir, slideSize, semanticHub, relationships }));
  page.images = [...retained, ...created];
  return Object.freeze({ matched: true, replacedCrops: candidates.length, createdCrops: created.length });
}

function createIconCrop({ candidate, index, source, assetDir, slideSize, semanticHub, relationships }) {
  const pxBox = ptToPxBox(candidate.box, source, slideSize);
  const croppedSource = cropPng(source, pxBox);
  const inferredEdges = relationships.length
    ? inferIntrusionEdges({ box: candidate.box, relationships, fallbackPoint: semanticHub })
    : inferPointFacingEdges(candidate.box, semanticHub);
  const selection = selectLowestRiskRefinement(croppedSource, inferredEdges);
  const refinement = selection.refinement; const intrusionEdges = [selection.edge];
  const fileName = `deck-p01-knowledge-graph-icon-${String(index + 1).padStart(2, "0")}.png`;
  writePng(path.join(assetDir, fileName), refinement.image);
  const refinedPxBox = { x: pxBox.x + refinement.box.x, y: pxBox.y + refinement.box.y, w: refinement.box.w, h: refinement.box.h };
  const refinedPtBox = pxToPtBox(refinedPxBox, source, slideSize);
  const cropEvidence = buildMinimumUnitCropEvidence({ sourceWidth: source.width, sourceHeight: source.height, originalPixelBox: pxBox, refinement });
  const connectorAnchorPoint = nearestOpaquePointToward(refinement.image, refinedPtBox, semanticHub);
  return {
    id: `team-knowledge-graph-icon-${index + 1}`,
    type: "fidelity-crop",
    assetPath: `assets/${fileName}`,
    box: refinedPtBox,
    style: { opacity: 1, assetPath: `assets/${fileName}`, strategy: "semantic-minimum-unit-crop" },
    source: {
      editable: false, nativeRebuild: true, detector: "knowledge-graph-semantic-icon-crop", strategy: "local-fidelity-crop",
      expressionForm: "icon-or-illustration", expressionSubtype: "knowledge-graph-icon", intentionalMinimumUnitCrop: true,
      protectedMinimumUnit: true, ...cropEvidence, iconCropRefined: refinement.refined, intrusionEdges,
      trimmedEdgeIntrusionPx: refinement.trimmedEdgeIntrusionPx || { top: 0, right: 0, bottom: 0, left: 0 }, role: `diagram-icon-${index + 1}`,
      removedOverlapPixels: refinement.removedOverlapPixels || 0, intrusionFallbackPoint: semanticHub, relationshipCount: relationships.length,
      connectorAnchorPoint,
      sourceCropId: candidate.id || null,
      nonEditableReason: "dense pictorial region retained as a tight local crop while cards and relationships remain native"
    }
  };
}

function nearestOpaquePointToward(image, box, target, minimumAlpha = 32) {
  if (!image || !Buffer.isBuffer(image.rgba) || !validBox(box) || ![target?.x, target?.y].every(Number.isFinite)) return null;
  let nearest = null; let nearestDistance = Number.POSITIVE_INFINITY;
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    if (image.rgba[(y * image.width + x) * 4 + 3] < minimumAlpha) continue;
    const point = { x: box.x + (x + 0.5) / image.width * box.w, y: box.y + (y + 0.5) / image.height * box.h };
    const distance = (point.x - target.x) ** 2 + (point.y - target.y) ** 2;
    if (distance < nearestDistance) { nearest = point; nearestDistance = distance; }
  }
  return nearest ? { x: Math.round(nearest.x * 100) / 100, y: Math.round(nearest.y * 100) / 100 } : null;
}

function selectLowestRiskRefinement(image, edges) {
  const candidates = edges.map((edge) => ({
    edge,
    refinement: refineDenseIconCrop(image, { paddingPx: 3, radiusPx: 2, minimumNeighbors: 17, intrusionEdges: [edge] })
  }));
  const effective = candidates.filter((item) => {
    const trim = item.refinement.trimmedEdgeIntrusionPx?.[item.edge] || 0;
    const dimension = item.edge === "top" || item.edge === "bottom" ? image.height : image.width;
    return trim >= Math.max(3, dimension * 0.05);
  });
  const pool = effective.length ? effective : candidates;
  return pool.sort((left, right) => refinementRisk(left, image) - refinementRisk(right, image))[0];
}

function refinementRisk(item, image) {
  const trim = item.refinement.trimmedEdgeIntrusionPx?.[item.edge] || 0;
  const dimension = item.edge === "top" || item.edge === "bottom" ? image.height : image.width;
  return trim / Math.max(1, dimension) + (item.refinement.removedOverlapPixels || 0) / Math.max(1, image.width * image.height) * 20;
}

function candidateCentroid(candidates) {
  const totals = candidates.reduce((sum, item) => ({
    x: sum.x + item.box.x + item.box.w / 2,
    y: sum.y + item.box.y + item.box.h / 2
  }), { x: 0, y: 0 });
  return { x: totals.x / candidates.length, y: totals.y / candidates.length };
}

function isCentralDiagramCrop(item, slideSize) {
  if (item?.source?.strategy !== "local-fidelity-crop" || !validBox(item.box)) return false;
  const pointX = item.box.x + item.box.w / 2; const pointY = item.box.y + item.box.h / 2;
  return pointX >= slideSize.widthPt / 3 && pointX <= slideSize.widthPt * 2 / 3 && pointY >= slideSize.heightPt * 0.18 && pointY <= slideSize.heightPt * 0.64;
}

function ptToPxBox(box, source, slideSize) {
  const left = Math.max(0, Math.floor(box.x * source.width / slideSize.widthPt)); const top = Math.max(0, Math.floor(box.y * source.height / slideSize.heightPt));
  const right = Math.min(source.width, Math.ceil((box.x + box.w) * source.width / slideSize.widthPt)); const bottom = Math.min(source.height, Math.ceil((box.y + box.h) * source.height / slideSize.heightPt));
  return { x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top) };
}
function pxToPtBox(box, source, slideSize) { return { x: box.x * slideSize.widthPt / source.width, y: box.y * slideSize.heightPt / source.height, w: box.w * slideSize.widthPt / source.width, h: box.h * slideSize.heightPt / source.height }; }
function validateInput(page, slideSize, sourceFile, root) {
  if (!page || typeof page !== "object" || Array.isArray(page)) throw new TypeError("knowledge graph crop page is invalid");
  if (![slideSize?.widthPt, slideSize?.heightPt].every((value) => Number.isFinite(value) && value > 0)) throw new TypeError("knowledge graph crop slide size is invalid");
  if (typeof sourceFile !== "string" || !path.isAbsolute(sourceFile) || !fs.statSync(sourceFile).isFile()) throw new TypeError("knowledge graph crop source is invalid");
  if (typeof root !== "string" || !path.isAbsolute(root)) throw new TypeError("knowledge graph crop root is invalid");
}
function validBox(box) { return !!box && [box.x, box.y, box.w, box.h].every(Number.isFinite) && box.w > 0 && box.h > 0; }

module.exports = { refineKnowledgeGraphIconCrops };
