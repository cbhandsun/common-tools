"use strict";

const { ANALYSIS_MODELS } = require("./data-models");
const MATRIX_MODELS = new Set(["swot", "quadrant"]);
const HIERARCHY_MODELS = new Set(["org-chart", "decision-tree"]);

function box(x, y, w, h) { return Object.freeze({ x, y, w, h }); }
function center(item) { return Object.freeze({ x: item.box.x + item.box.w / 2, y: item.box.y + item.box.h / 2 }); }
function gridNodes(entries, bounds, columns, shape = "roundRect") {
  const gap = 12; const rows = Math.ceil(entries.length / columns); const width = (bounds.w - gap * (columns - 1)) / columns; const height = (bounds.h - gap * (rows - 1)) / rows;
  return entries.map((entry, index) => Object.freeze({ id: entry.id, shape, box: box(bounds.x + (index % columns) * (width + gap), bounds.y + Math.floor(index / columns) * (height + gap), width, height) }));
}
function funnelNodes(entries, bounds) {
  const gap = 8; const height = (bounds.h - gap * (entries.length - 1)) / entries.length;
  return entries.map((entry, index) => { const ratio = 1 - index * 0.5 / Math.max(1, entries.length - 1); const width = bounds.w * ratio; return Object.freeze({ id: entry.id, shape: "roundRect", box: box(bounds.x + (bounds.w - width) / 2, bounds.y + index * (height + gap), width, height) }); });
}
function timelineNodes(entries, bounds) {
  const width = Math.min(164, (bounds.w - 16 * (entries.length - 1)) / entries.length); const step = entries.length === 1 ? 0 : (bounds.w - width) / (entries.length - 1);
  return entries.map((entry, index) => Object.freeze({ id: entry.id, shape: "roundRect", box: box(bounds.x + index * step, bounds.y + (index % 2) * bounds.h * 0.38, width, bounds.h * 0.62) }));
}
function roadmapNodes(entries, bounds) {
  const marker = Math.min(116, (bounds.w - 18 * (entries.length - 1)) / entries.length); const step = entries.length === 1 ? 0 : (bounds.w - marker) / (entries.length - 1);
  return entries.map((entry, index) => Object.freeze({ id: entry.id, shape: index % 2 ? "roundRect" : "ellipse", box: box(bounds.x + index * step, bounds.y + (index % 2 ? bounds.h * 0.48 : 0), marker, bounds.h * 0.45) }));
}
function ganttNodes(entries, bounds) {
  const gap = 7; const height = (bounds.h - gap * (entries.length - 1)) / entries.length; const unit = bounds.w / Math.max(6, entries.length + 3);
  return entries.map((entry, index) => { const x = bounds.x + Math.min(bounds.w * 0.44, index * unit * 0.72); const width = Math.max(unit * 1.8, Math.min(bounds.x + bounds.w - x, unit * (2.4 + index % 3))); return Object.freeze({ id: entry.id, shape: "roundRect", box: box(x, bounds.y + index * (height + gap), width, height) }); });
}
function hierarchyLevels(visual) {
  const ids = visual.entries.map((entry) => entry.id); const incoming = new Map(ids.map((id) => [id, 0])); const outgoing = new Map(ids.map((id) => [id, []]));
  for (const link of visual.links || []) { incoming.set(link.to, incoming.get(link.to) + 1); outgoing.get(link.from).push(link.to); }
  const roots = ids.filter((id) => incoming.get(id) === 0); const queue = (roots.length ? roots : ids.slice(0, 1)).map((id) => [id, 0]); const levels = new Map();
  while (queue.length) { const [id, level] = queue.shift(); if ((levels.get(id) ?? -1) >= level) continue; levels.set(id, level); for (const child of outgoing.get(id)) queue.push([child, level + 1]); }
  for (const id of ids) if (!levels.has(id)) levels.set(id, Math.max(0, ...levels.values()) + 1);
  return levels;
}
function hierarchyNodes(visual, bounds) {
  const levels = hierarchyLevels(visual); const rows = [...new Set(levels.values())].sort((a, b) => a - b).map((level) => visual.entries.filter((entry) => levels.get(entry.id) === level)); const gapY = 18; const rowHeight = (bounds.h - gapY * (rows.length - 1)) / rows.length;
  return rows.flatMap((entries, rowIndex) => { const gapX = 14; const width = Math.min(220, (bounds.w - gapX * (entries.length - 1)) / entries.length); const occupied = width * entries.length + gapX * (entries.length - 1); return entries.map((entry, index) => Object.freeze({ id: entry.id, shape: "roundRect", box: box(bounds.x + (bounds.w - occupied) / 2 + index * (width + gapX), bounds.y + rowIndex * (rowHeight + gapY), width, rowHeight) })); });
}
function graphNodes(entries, bounds) {
  const width = Math.min(170, bounds.w / 3.4); const height = Math.min(92, bounds.h / 2.5); const radiusX = Math.max(1, (bounds.w - width) / 2); const radiusY = Math.max(1, (bounds.h - height) / 2);
  return entries.map((entry, index) => { const angle = -Math.PI / 2 + index * Math.PI * 2 / entries.length; return Object.freeze({ id: entry.id, shape: "ellipse", box: box(bounds.x + radiusX + Math.cos(angle) * radiusX, bounds.y + radiusY + Math.sin(angle) * radiusY, width, height) }); });
}
function architectureNodes(visual, bounds) {
  const levels = hierarchyLevels(visual); const columns = [...new Set(levels.values())].sort((a, b) => a - b); const gapX = 22; const width = Math.min(190, (bounds.w - gapX * (columns.length - 1)) / columns.length);
  return columns.flatMap((level, columnIndex) => { const entries = visual.entries.filter((entry) => levels.get(entry.id) === level); const gapY = 12; const height = Math.min(86, (bounds.h - gapY * (entries.length - 1)) / entries.length); const occupied = height * entries.length + gapY * (entries.length - 1); return entries.map((entry, index) => Object.freeze({ id: entry.id, shape: "roundRect", box: box(bounds.x + columnIndex * (width + gapX), bounds.y + (bounds.h - occupied) / 2 + index * (height + gapY), width, height) })); });
}
function planSemanticAnalysis(visual, bounds) {
  if (!visual || visual.kind !== "analysis" || !ANALYSIS_MODELS.includes(visual.model) || !Array.isArray(visual.entries) || visual.entries.length < 2 || visual.entries.length > 8 || !bounds || ![bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isFinite) || bounds.w <= 0 || bounds.h <= 0) throw new TypeError("semantic analysis input is invalid");
  const ids = visual.entries.map((entry) => entry?.id);
  if (ids.some((id) => typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(id)) || new Set(ids).size !== ids.length) throw new TypeError("semantic analysis entries are invalid");
  if (visual.links !== undefined && (!Array.isArray(visual.links) || visual.links.length > 32 || visual.links.some((link) => !link || typeof link.id !== "string" || !ids.includes(link.from) || !ids.includes(link.to) || link.from === link.to))) throw new TypeError("semantic analysis links are invalid");
  let component = "graph"; let nodes;
  if (MATRIX_MODELS.has(visual.model)) { component = "matrix"; nodes = gridNodes(visual.entries, bounds, 2); }
  else if (visual.model === "funnel") { component = "funnel"; nodes = funnelNodes(visual.entries, bounds); }
  else if (visual.model === "timeline") { component = "timeline"; nodes = timelineNodes(visual.entries, bounds); }
  else if (visual.model === "roadmap") { component = "roadmap"; nodes = roadmapNodes(visual.entries, bounds); }
  else if (visual.model === "gantt") { component = "gantt"; nodes = ganttNodes(visual.entries, bounds); }
  else if (HIERARCHY_MODELS.has(visual.model)) { component = "hierarchy"; nodes = hierarchyNodes(visual, bounds); }
  else if (visual.model === "architecture") { component = "architecture"; nodes = architectureNodes(visual, bounds); }
  else if (visual.model === "network") nodes = graphNodes(visual.entries, bounds);
  else nodes = gridNodes(visual.entries, bounds, Math.min(4, visual.entries.length));
  const positions = new Map(nodes.map((node) => [node.id, center(node)]));
  const links = Object.freeze((visual.links || []).map((link) => Object.freeze({ id: link.id, from: positions.get(link.from), to: positions.get(link.to) })));
  return Object.freeze({ version: "1.0", component, model: visual.model, nodes: Object.freeze(nodes), links });
}

module.exports = { planSemanticAnalysis };
