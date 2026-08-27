"use strict";

function visualAtomMinimumUnitGroupId({ layerId = "", archetype = "", atom = {}, shape = {} } = {}) {
  const base = `visual-component-${safeToken(layerId || shape?.source?.layerSourceId || "layer")}-${safeToken(archetype || shape?.source?.nativeComponentArchetype || "visual-atom")}`;
  if (isWholeGraphicArchetype(archetype)) return base;
  if (isLegend(shape, atom)) return `${base}-legend`;
  if (isConnector(shape, atom)) return `${base}-routing`;
  const atomId = optionalToken(atom?.id || shape?.source?.atomId || "");
  return atomId ? `${base}-${atomId}` : base;
}

function inferNativeComponentGroupForText(textBox = {}, shapes = []) {
  const explicit = String(textBox?.source?.nativeComponentGroupId || textBox?.style?.nativeComponentGroupId || "").trim();
  if (explicit) return explicit;
  if (!validBox(textBox?.box)) return "";
  const layerId = String(textBox?.source?.layerSourceId || "");
  const candidates = (Array.isArray(shapes) ? shapes : [])
    .filter((shape) => validBox(shape?.box))
    .filter((shape) => String(shape?.source?.nativeComponentGroupId || "").trim())
    .filter((shape) => !layerId || !shape?.source?.layerSourceId || String(shape.source.layerSourceId) === layerId)
    .filter((shape) => !isConnector(shape, {}));
  const centered = candidates
    .filter((shape) => pointInside(expand(shape.box, Math.min(6, Math.max(2, Math.min(shape.box.w, shape.box.h) * 0.12))), center(textBox.box)))
    .sort((a, b) => area(a.box) - area(b.box));
  if (centered[0]) return String(centered[0].source.nativeComponentGroupId);
  const groups = [...new Set(candidates.map((shape) => String(shape.source.nativeComponentGroupId)))];
  return groups.length === 1 ? groups[0] : "";
}

function isWholeGraphicArchetype(archetype) { return /(chart|gantt|timeline|treemap|donut|pie)/i.test(String(archetype || "")); }
function isLegend(shape = {}, atom = {}) { return atom?.semanticRole === "legend-marker" || /legend-marker/.test(String(shape?.source?.detector || "")); }
function isConnector(shape = {}, atom = {}) { const detector = String(shape?.source?.detector || ""); const kind = String(atom?.kind || shape?.source?.atomKind || ""); return shape?.type === "line" || /connector|grid-line|mapping-line|axis/.test(`${detector} ${kind}`); }
function safeToken(value) { return String(value || "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "unknown"; }
function optionalToken(value) { return String(value || "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80); }
function validBox(box) { return [box?.x, box?.y, box?.w, box?.h].every((value) => Number.isFinite(Number(value))) && box.w > 0 && box.h > 0; }
function center(box) { return { x: box.x + box.w / 2, y: box.y + box.h / 2 }; }
function area(box) { return box.w * box.h; }
function expand(box, amount) { return { x: box.x - amount, y: box.y - amount, w: box.w + amount * 2, h: box.h + amount * 2 }; }
function pointInside(box, point) { return point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h; }

module.exports = { inferNativeComponentGroupForText, visualAtomMinimumUnitGroupId };
