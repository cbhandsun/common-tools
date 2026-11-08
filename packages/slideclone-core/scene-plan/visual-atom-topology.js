"use strict";
const {centerOfBox} = require("./raster-native-detection");

function annotateVisualAtomTopology(atoms = []) {
  const hierarchicalAtoms = annotateVisualAtomContainerHierarchy(atoms);
  const nodes = hierarchicalAtoms.filter((atom) => isVisualAtomTopologyNode(atom));
  if (nodes.length === 0) return atoms;
  const attachableNodes = nodes.filter((node) => node.topologyRole !== "container");
  const connectorNodes = attachableNodes.length > 0 ? attachableNodes : nodes;
  return hierarchicalAtoms.map((atom) => {
    if (!isVisualAtomTopologyConnector(atom)) return atom;
    const endpoints = atom.lineEndpoints?.from && atom.lineEndpoints?.to
      ? atom.lineEndpoints
      : fallbackLineEndpoints(atom.box || {}, Number(atom.box?.w || 0) >= Number(atom.box?.h || 0));
    const fromNode = nearestVisualAtomNodeForPoint(endpoints.from, connectorNodes, atom);
    const toNode = nearestVisualAtomNodeForPoint(endpoints.to, connectorNodes, atom);
    if (!fromNode && !toNode) return atom;
    return {
      ...atom,
      fromAtomId: fromNode?.id || atom.fromAtomId || null,
      toAtomId: toNode?.id || atom.toAtomId || null,
      topologyInferred: true
    };
  });
}

function annotateVisualAtomContainerHierarchy(atoms = []) {
  const nodes = atoms.filter((atom) => isVisualAtomTopologyNode(atom));
  if (nodes.length < 2) return atoms;
  const containers = nodes
    .map((node) => ({
      node,
      children: nodes.filter((candidate) => candidate !== node && visualAtomNodeInsideContainer(candidate, node))
    }))
    .filter((entry) => entry.children.length > 0);
  if (containers.length === 0) return atoms;
  return atoms.map((atom) => {
    const containerEntry = containers.find((entry) => entry.node === atom);
    if (containerEntry) {
      return {
        ...atom,
        topologyRole: "container",
        containedAtomIds: containerEntry.children.map((child) => child.id).filter(Boolean)
      };
    }
    const parent = containers
      .filter((entry) => entry.children.includes(atom))
      .sort((a, b) => visualAtomBoxArea(a.node.box) - visualAtomBoxArea(b.node.box))[0]?.node;
    if (!parent) return atom;
    return {
      ...atom,
      topologyRole: atom.topologyRole || "node",
      containerAtomId: parent.id || null
    };
  });
}

function visualAtomNodeInsideContainer(node = {}, container = {}) {
  const nodeBox = node.box || {};
  const containerBox = container.box || {};
  const nodeArea = visualAtomBoxArea(nodeBox);
  const containerArea = visualAtomBoxArea(containerBox);
  if (nodeArea <= 0 || containerArea < nodeArea * 1.8) return false;
  const center = centerOfBox(nodeBox);
  const left = Number(containerBox.x || 0);
  const top = Number(containerBox.y || 0);
  const right = left + Number(containerBox.w || 0);
  const bottom = top + Number(containerBox.h || 0);
  const pad = Math.max(3, Math.min(Number(containerBox.w || 0), Number(containerBox.h || 0)) * 0.04);
  return center.x >= left + pad
    && center.x <= right - pad
    && center.y >= top + pad
    && center.y <= bottom - pad;
}

function visualAtomBoxArea(box = {}) {
  return Math.max(0, Number(box.w || 0)) * Math.max(0, Number(box.h || 0));
}

function isVisualAtomTopologyNode(atom = {}) {
  return /^(?:native-rect|native-ellipse|native-diamond|native-triangle|native-chevron|native-parallelogram|native-cylinder|native-cloud|native-document|native-screen|native-phone)-candidate$/.test(String(atom.kind || ""))
    && atom?.box;
}

function isVisualAtomTopologyConnector(atom = {}) {
  return /^(?:connector-line|connector-arrow|grid-line)-candidate$/.test(String(atom.kind || ""))
    && atom?.box;
}

function nearestVisualAtomNodeForPoint(point = {}, nodes = [], connector = {}) {
  const ranked = nodes
    .map((node) => ({ node, score: visualAtomNodeEndpointScore(point, node, connector) }))
    .filter((item) => item.score < Infinity)
    .sort((a, b) => a.score - b.score);
  return ranked[0]?.node || null;
}

function visualAtomNodeEndpointScore(point = {}, node = {}, connector = {}) {
  const box = node.box || {};
  const px = Number(point.x || 0);
  const py = Number(point.y || 0);
  const left = Number(box.x || 0);
  const top = Number(box.y || 0);
  const right = left + Number(box.w || 0);
  const bottom = top + Number(box.h || 0);
  const clampedX = Math.max(left, Math.min(right, px));
  const clampedY = Math.max(top, Math.min(bottom, py));
  const distance = Math.hypot(px - clampedX, py - clampedY);
  const connectorBox = connector.box || {};
  const threshold = Math.max(
    12,
    Math.min(42, Math.max(Number(box.w || 0), Number(box.h || 0)) * 0.5),
    Math.min(30, Math.max(Number(connectorBox.w || 0), Number(connectorBox.h || 0)) * 0.16)
  );
  return distance <= threshold ? distance : Infinity;
}

function fallbackLineEndpoints(box, horizontal) {
  return horizontal
    ? { from: { x: box.x, y: box.y + box.h / 2 }, to: { x: box.x + box.w, y: box.y + box.h / 2 } }
    : { from: { x: box.x + box.w / 2, y: box.y }, to: { x: box.x + box.w / 2, y: box.y + box.h } };
}

module.exports = { annotateVisualAtomTopology, annotateVisualAtomContainerHierarchy, isVisualAtomTopologyNode, visualAtomBoxArea, visualAtomNodeInsideContainer, fallbackLineEndpoints, isVisualAtomTopologyConnector, nearestVisualAtomNodeForPoint, visualAtomNodeEndpointScore };
