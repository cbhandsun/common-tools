"use strict";
const { validBox, boxCenter, clusterByCoordinate, boxArea } = require("./relationship-native-geometry");
const { sankeyNodeShape, sankeyBandShape } = require("./relationship-native-shapes");
const { isIgnorableContainedFragment } = require("./relationship-topology-helpers");

function createSankeyFlowShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.62 || !validBox(image.box)) return null;
  if (atoms.some((atom) => atom?.residualCandidate === true)) return null;
  const nodes = sankeyNodes(atoms, image.box);
  const bands = atoms.filter((atom) =>
    atom?.kind === "native-sankey-band-candidate"
    && validBox(atom.box)
    && validSankeyBand(atom.sankeyBand)
    && Number(atom.sankeyBand.confidence || 0) >= 0.68);
  if (nodes.length < 3 || nodes.length > 24 || bands.length < 1 || bands.length > 32) return null;
  const columns = clusterByCoordinate(nodes, (node) => boxCenter(node.box).x, Math.max(8, image.box.w * 0.035));
  if (columns.length < 2 || columns.length > 8) return null;
  const attachments = bands.map((band) => attachSankeyBand(band, nodes, image.box));
  if (attachments.some((attachment) => !attachment)) return null;
  const attachedNodeIds = new Set(attachments.flatMap((attachment) => [attachment.source.id, attachment.target.id]));
  if (attachedNodeIds.size < 3) return null;
  if (!sankeyFlowIsAcyclic(attachments)) return null;
  const handled = new Set([...nodes, ...bands].map((atom) => atom.id));
  if (atoms.some((atom) => !handled.has(atom?.id) && !isIgnorableContainedFragment(atom, [...nodes, ...bands], image.box))) return null;
  return {
    shapes: [
      ...bands.map((band, index) => sankeyBandShape(image, band, attachments[index], index, understanding)),
      ...nodes.map((node, index) => sankeyNodeShape(image, node, index, understanding))
    ],
    handledAtomCount: handled.size,
    fullyObjectified: true,
    shellKind: "sankey-flow-chart"
  };
}

function sankeyNodes(atoms = [], layerBox = {}) {
  const layerArea = boxArea(layerBox);
  return (atoms || [])
    .filter((atom) => atom?.kind === "native-rect-candidate" && validBox(atom.box))
    .filter((atom) => {
      const width = Number(atom.box.w || 0);
      const height = Number(atom.box.h || 0);
      const areaRatio = boxArea(atom.box) / Math.max(1, layerArea);
      const density = Number(atom.density || 0);
      return width <= Math.max(34, Number(layerBox.w || 0) * 0.075)
        && height >= Math.max(18, Number(layerBox.h || 0) * 0.07)
        && height >= width * 1.35
        && areaRatio >= 0.001
        && areaRatio <= 0.09
        && density >= 0.72;
    })
    .sort((left, right) => boxCenter(left.box).x - boxCenter(right.box).x || left.box.y - right.box.y);
}

function validSankeyBand(band = {}) {
  return [
    band.sourceX,
    band.targetX,
    band.sourceTop,
    band.sourceBottom,
    band.targetTop,
    band.targetBottom,
    band.sourceThickness,
    band.targetThickness
  ].every((value) => Number.isFinite(Number(value)))
    && Number(band.targetX) > Number(band.sourceX)
    && Number(band.sourceBottom) > Number(band.sourceTop)
    && Number(band.targetBottom) > Number(band.targetTop);
}

function attachSankeyBand(bandAtom = {}, nodes = [], layerBox = {}) {
  const band = bandAtom.sankeyBand;
  const tolerance = Math.max(7, Number(layerBox.w || 0) * 0.025);
  const source = nearestSankeyEndpointNode(nodes, band.sourceX, band.sourceTop, band.sourceBottom, "source", tolerance);
  const target = nearestSankeyEndpointNode(nodes, band.targetX, band.targetTop, band.targetBottom, "target", tolerance);
  if (!source || !target || source.id === target.id) return null;
  if (boxCenter(source.box).x >= boxCenter(target.box).x) return null;
  return { source, target };
}

function nearestSankeyEndpointNode(nodes = [], x, top, bottom, side, tolerance) {
  const thickness = Math.max(1, Number(bottom || 0) - Number(top || 0));
  return nodes
    .map((node) => {
      const edgeX = side === "source" ? node.box.x + node.box.w : node.box.x;
      const xDistance = Math.abs(edgeX - Number(x || 0));
      const overlap = Math.max(0, Math.min(node.box.y + node.box.h, bottom) - Math.max(node.box.y, top));
      return { node, xDistance, overlapRatio: overlap / thickness };
    })
    .filter((candidate) => candidate.xDistance <= tolerance && candidate.overlapRatio >= 0.62)
    .sort((left, right) => left.xDistance - right.xDistance || right.overlapRatio - left.overlapRatio)[0]?.node || null;
}

function sankeyFlowIsAcyclic(attachments = []) {
  return attachments.every((attachment) => boxCenter(attachment.source.box).x < boxCenter(attachment.target.box).x);
}

module.exports = {
  createSankeyFlowShell,
  sankeyNodes,
  validSankeyBand,
  attachSankeyBand,
  nearestSankeyEndpointNode,
  sankeyFlowIsAcyclic
};
