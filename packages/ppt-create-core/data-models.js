"use strict";

const crypto = require("node:crypto");
const { containsControlCharacter } = require("../capability-contracts");

const VISUAL_KINDS = Object.freeze(["media", "table", "chart", "analysis"]);
const CHART_TYPES = Object.freeze(["bar", "column", "line", "pie", "donut"]);
const ANALYSIS_MODELS = Object.freeze(["swot", "quadrant", "funnel", "timeline", "org-chart", "architecture", "network", "decision-tree", "roadmap", "gantt"]);
const MEDIA_TYPES = Object.freeze(["image", "illustration", "icon"]);
const MEDIA_FITS = Object.freeze(["contain", "cover"]);

function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, allowed, label) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new TypeError(`${label} contains unsupported fields`);
}
function boundedText(value, label, maximum) {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  if (!normalized || normalized.length > maximum || containsControlCharacter(normalized)) throw new TypeError(`${label} is invalid`);
  return normalized;
}
function safeId(value, label) {
  const id = boundedText(value, label, 80);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(id)) throw new TypeError(`${label} is invalid`);
  return id;
}
function optionalText(value, label, maximum) { return value === undefined ? undefined : boundedText(value, label, maximum); }
function boundedStringArray(value, label, { minimum, maximum, itemMaximum }) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new TypeError(`${label} is invalid`);
  return Object.freeze(value.map((item, index) => boundedText(item, `${label} ${index + 1}`, itemMaximum)));
}
function normalizeMedia(value, label) {
  exactKeys(value, ["kind", "mediaType", "alt", "caption", "assetId", "fit", "crop"], label);
  if (!MEDIA_TYPES.includes(value.mediaType)) throw new TypeError(`${label} mediaType is invalid`);
  const caption = optionalText(value.caption, `${label} caption`, 160);
  const assetId = value.assetId === undefined ? undefined : safeId(value.assetId, `${label} assetId`);
  const fit = value.fit === undefined ? "contain" : value.fit;
  if (!MEDIA_FITS.includes(fit)) throw new TypeError(`${label} fit is invalid`);
  let crop;
  if (value.crop !== undefined) {
    exactKeys(value.crop, ["left", "top", "right", "bottom"], `${label} crop`);
    if (![value.crop.left, value.crop.top, value.crop.right, value.crop.bottom].every((item) => typeof item === "number" && Number.isFinite(item) && item >= 0 && item < 1) || value.crop.left + value.crop.right >= 1 || value.crop.top + value.crop.bottom >= 1) throw new TypeError(`${label} crop is invalid`);
    crop = Object.freeze({ ...value.crop });
  }
  return Object.freeze({ kind: "media", mediaType: value.mediaType, alt: boundedText(value.alt, `${label} alt`, 240), ...(caption ? { caption } : {}), ...(assetId ? { assetId } : {}), fit, ...(crop ? { crop } : {}) });
}
function normalizeTable(value, label) {
  exactKeys(value, ["kind", "headers", "rows", "insight"], label);
  const headers = boundedStringArray(value.headers, `${label} headers`, { minimum: 2, maximum: 6, itemMaximum: 80 });
  if (!Array.isArray(value.rows) || value.rows.length < 1 || value.rows.length > 12) throw new TypeError(`${label} rows are invalid`);
  const rows = value.rows.map((row, rowIndex) => {
    const normalized = boundedStringArray(row, `${label} row ${rowIndex + 1}`, { minimum: headers.length, maximum: headers.length, itemMaximum: 120 });
    return normalized;
  });
  return Object.freeze({ kind: "table", headers, rows: Object.freeze(rows), ...(value.insight === undefined ? {} : { insight: boundedText(value.insight, `${label} insight`, 240) }) });
}
function finiteValue(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1_000_000_000) throw new TypeError(`${label} must be a bounded finite number`);
  return Object.is(value, -0) ? 0 : value;
}
function normalizeChart(value, label) {
  exactKeys(value, ["kind", "type", "categories", "series", "insight"], label);
  if (!CHART_TYPES.includes(value.type)) throw new TypeError(`${label} type is invalid`);
  const categories = boundedStringArray(value.categories, `${label} categories`, { minimum: 2, maximum: 12, itemMaximum: 80 });
  if (!Array.isArray(value.series) || value.series.length < 1 || value.series.length > 4) throw new TypeError(`${label} series are invalid`);
  const series = value.series.map((entry, index) => {
    if (!plainObject(entry)) throw new TypeError(`${label} series ${index + 1} must be an object`);
    exactKeys(entry, ["name", "values"], `${label} series ${index + 1}`);
    if (!Array.isArray(entry.values) || entry.values.length !== categories.length) throw new TypeError(`${label} series ${index + 1} values are invalid`);
    return Object.freeze({ name: boundedText(entry.name, `${label} series ${index + 1} name`, 80), values: Object.freeze(entry.values.map((item, valueIndex) => finiteValue(item, `${label} series ${index + 1} value ${valueIndex + 1}`))) });
  });
  if (["pie", "donut"].includes(value.type) && series.length !== 1) throw new TypeError(`${label} ${value.type} charts require exactly one series`);
  return Object.freeze({ kind: "chart", type: value.type, categories, series: Object.freeze(series), ...(value.insight === undefined ? {} : { insight: boundedText(value.insight, `${label} insight`, 240) }) });
}
function normalizeAnalysis(value, label) {
  exactKeys(value, ["kind", "model", "entries", "links", "insight"], label);
  if (!ANALYSIS_MODELS.includes(value.model)) throw new TypeError(`${label} model is invalid`);
  const bounds = value.model === "swot" || value.model === "quadrant" ? [4, 8] : [2, 8];
  if (!Array.isArray(value.entries) || value.entries.length < bounds[0] || value.entries.length > bounds[1]) throw new TypeError(`${label} entries are invalid`);
  const groups = { swot: ["strengths", "weaknesses", "opportunities", "threats"], quadrant: ["q1", "q2", "q3", "q4"] }[value.model];
  const entries = value.entries.map((entry, index) => {
    if (!plainObject(entry)) throw new TypeError(`${label} entry ${index + 1} must be an object`);
    exactKeys(entry, ["id", "label", "detail", "group"], `${label} entry ${index + 1}`);
    const group = optionalText(entry.group, `${label} entry ${index + 1} group`, 24);
    if (groups && !groups.includes(group)) throw new TypeError(`${label} entry ${index + 1} group is invalid`);
    if (!groups && group !== undefined) throw new TypeError(`${label} entry ${index + 1} group is unsupported`);
    return Object.freeze({ id: safeId(entry.id, `${label} entry ${index + 1} id`), label: boundedText(entry.label, `${label} entry ${index + 1} label`, 80), ...(entry.detail === undefined ? {} : { detail: boundedText(entry.detail, `${label} entry ${index + 1} detail`, 180) }), ...(group ? { group } : {}) });
  });
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) throw new TypeError(`${label} entry ids must be unique`);
  if (groups && groups.some((group) => !entries.some((entry) => entry.group === group))) throw new TypeError(`${label} must cover every analysis group`);
  let links;
  if (value.links !== undefined) {
    if (!Array.isArray(value.links) || value.links.length < 1 || value.links.length > 32 || !["org-chart", "architecture", "network", "decision-tree", "roadmap"].includes(value.model)) throw new TypeError(`${label} links are invalid`); const entryIds = new Set(entries.map((entry) => entry.id)); const linkIds = new Set();
    links = value.links.map((link, index) => { if (!plainObject(link)) throw new TypeError(`${label} link ${index + 1} is invalid`); exactKeys(link, ["id", "from", "to", "label"], `${label} link ${index + 1}`); const id = safeId(link.id, `${label} link ${index + 1} id`); const from = safeId(link.from, `${label} link ${index + 1} from`); const to = safeId(link.to, `${label} link ${index + 1} to`); if (linkIds.has(id) || !entryIds.has(from) || !entryIds.has(to) || from === to) throw new TypeError(`${label} link ${index + 1} is invalid`); linkIds.add(id); return Object.freeze({ id, from, to, ...(link.label === undefined ? {} : { label: boundedText(link.label, `${label} link ${index + 1} label`, 80) }) }); });
  }
  return Object.freeze({ kind: "analysis", model: value.model, entries: Object.freeze(entries), ...(links ? { links: Object.freeze(links) } : {}), ...(value.insight === undefined ? {} : { insight: boundedText(value.insight, `${label} insight`, 240) }) });
}
function normalizeVisual(value, label) {
  if (!plainObject(value) || !VISUAL_KINDS.includes(value.kind)) throw new TypeError(`${label} is invalid`);
  return { media: normalizeMedia, table: normalizeTable, chart: normalizeChart, analysis: normalizeAnalysis }[value.kind](value, label);
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!plainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}
function nativeChartPayload(chart, style) {
  const signature = JSON.stringify({ categories: chart.categories, schemaVersion: "1.0", series: chart.series, style: canonical(style), type: chart.type });
  return Object.freeze({ schemaVersion: "1.0", dataVerified: true, fallbackSignature: signature, fallbackSha256: crypto.createHash("sha256").update(signature).digest("hex"), workbook: Object.freeze({ sheetName: "Data" }) });
}

module.exports = { ANALYSIS_MODELS, CHART_TYPES, MEDIA_FITS, MEDIA_TYPES, VISUAL_KINDS, nativeChartPayload, normalizeVisual };
