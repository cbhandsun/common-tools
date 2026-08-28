"use strict";

const { ANALYSIS_MODELS } = require("./data-models");
const MATRIX_MODELS = new Set(["swot", "quadrant"]);
const TIMELINE_MODELS = new Set(["timeline", "roadmap", "gantt"]);
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
function hierarchyNodes(visual, bounds) {
  const parents = new Map(visual.entries.map((entry) => [entry.id, 0]));
  for (const link of visual.links || []) parents.set(link.to, (parents.get(link.to) || 0) + 1);
  const roots = visual.entries.filter((entry) => parents.get(entry.id) === 0); const rootIds = new Set((roots.length ? roots : visual.entries.slice(0, 1)).map((entry) => entry.id));
  const top = visual.entries.filter((entry) => rootIds.has(entry.id)); const lower = visual.entries.filter((entry) => !rootIds.has(entry.id));
  const rows = lower.length ? [top, lower] : [top]; const gapY = 24; const rowHeight = (bounds.h - gapY * (rows.length - 1)) / rows.length;
  return rows.flatMap((entries, rowIndex) => { const gapX = 14; const width = Math.min(220, (bounds.w - gapX * (entries.length - 1)) / entries.length); const occupied = width * entries.length + gapX * (entries.length - 1); return entries.map((entry, index) => Object.freeze({ id: entry.id, shape: "roundRect", box: box(bounds.x + (bounds.w - occupied) / 2 + index * (width + gapX), bounds.y + rowIndex * (rowHeight + gapY), width, rowHeight) })); });
}
function graphNodes(entries, bounds) {
  const width = Math.min(170, bounds.w / 3.4); const height = Math.min(92, bounds.h / 2.5); const radiusX = Math.max(1, (bounds.w - width) / 2); const radiusY = Math.max(1, (bounds.h - height) / 2);
  return entries.map((entry, index) => { const angle = -Math.PI / 2 + index * Math.PI * 2 / entries.length; return Object.freeze({ id: entry.id, shape: "ellipse", box: box(bounds.x + radiusX + Math.cos(angle) * radiusX, bounds.y + radiusY + Math.sin(angle) * radiusY, width, height) }); });
}
function planSemanticAnalysis(visual, bounds) {
  if (!visual || visual.kind !== "analysis" || !ANALYSIS_MODELS.includes(visual.model) || !Array.isArray(visual.entries) || visual.entries.length < 2 || visual.entries.length > 8 || !bounds || ![bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isFinite) || bounds.w <= 0 || bounds.h <= 0) throw new TypeError("semantic analysis input is invalid");
  const ids = visual.entries.map((entry) => entry?.id);
  if (ids.some((id) => typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(id)) || new Set(ids).size !== ids.length) throw new TypeError("semantic analysis entries are invalid");
  if (visual.links !== undefined && (!Array.isArray(visual.links) || visual.links.length > 32 || visual.links.some((link) => !link || typeof link.id !== "string" || !ids.includes(link.from) || !ids.includes(link.to) || link.from === link.to))) throw new TypeError("semantic analysis links are invalid");
  let component = "graph"; let nodes;
  if (MATRIX_MODELS.has(visual.model)) { component = "matrix"; nodes = gridNodes(visual.entries, bounds, 2); }
  else if (visual.model === "funnel") { component = "funnel"; nodes = funnelNodes(visual.entries, bounds); }
  else if (TIMELINE_MODELS.has(visual.model)) { component = "timeline"; nodes = timelineNodes(visual.entries, bounds); }
  else if (HIERARCHY_MODELS.has(visual.model)) { component = "hierarchy"; nodes = hierarchyNodes(visual, bounds); }
  else if (visual.model === "architecture" || visual.model === "network") nodes = graphNodes(visual.entries, bounds);
  else nodes = gridNodes(visual.entries, bounds, Math.min(4, visual.entries.length));
  const positions = new Map(nodes.map((node) => [node.id, center(node)]));
  const links = Object.freeze((visual.links || []).map((link) => Object.freeze({ id: link.id, from: positions.get(link.from), to: positions.get(link.to) })));
  return Object.freeze({ version: "1.0", component, model: visual.model, nodes: Object.freeze(nodes), links });
}

module.exports = { planSemanticAnalysis };
