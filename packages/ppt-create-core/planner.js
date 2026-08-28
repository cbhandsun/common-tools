"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { containsControlCharacter } = require("../capability-contracts");
const { insideRoot } = require("../capability-runtime");
const { THEMES, validatePresentationSpec } = require("./spec");

const BRIEF_VERSION = "1.0";
const MAX_BRIEF_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_POINTS = 400;
const SECTION_MODES = Object.freeze(["narrative", "metrics", "comparison", "process"]);

function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, allowed, label) { if (Object.keys(value).some((key) => !allowed.includes(key))) throw new TypeError(`${label} contains unsupported fields`); }
function text(value, label, maximum) {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  if (!normalized || normalized.length > maximum || containsControlCharacter(normalized) || /(?:请输入|待补充|lorem ipsum|placeholder|todo|tbd)/iu.test(normalized)) throw new TypeError(`${label} is invalid`);
  return normalized;
}
function safeId(value, label) { const id = text(value, label, 80); if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(id)) throw new TypeError(`${label} is invalid`); return id; }
function normalizePoint(value, sectionIndex, pointIndex) {
  const label = `section ${sectionIndex + 1} point ${pointIndex + 1}`;
  if (!plainObject(value)) throw new TypeError(`${label} must be an object`);
  exactKeys(value, ["id", "label", "detail", "value", "required"], label);
  if (value.required !== undefined && typeof value.required !== "boolean") throw new TypeError(`${label} required must be a boolean`);
  return Object.freeze({ id: safeId(value.id === undefined ? `point-${pointIndex + 1}` : value.id, `${label} id`), label: text(value.label, `${label} label`, 80), ...(value.detail === undefined ? {} : { detail: text(value.detail, `${label} detail`, 240) }), ...(value.value === undefined ? {} : { value: text(value.value, `${label} value`, 40) }), required: value.required !== false });
}
function normalizeSection(value, index) {
  const label = `section ${index + 1}`;
  if (!plainObject(value)) throw new TypeError(`${label} must be an object`);
  exactKeys(value, ["id", "title", "summary", "mode", "points"], label);
  const mode = value.mode === undefined ? "narrative" : value.mode;
  if (!SECTION_MODES.includes(mode)) throw new TypeError(`${label} mode is invalid`);
  if (!Array.isArray(value.points) || value.points.length < 1 || value.points.length > 48) throw new RangeError(`${label} points are invalid`);
  const points = value.points.map((point, pointIndex) => normalizePoint(point, index, pointIndex));
  if (new Set(points.map((point) => point.id)).size !== points.length) throw new TypeError(`${label} point ids must be unique`);
  if (mode === "metrics" && (points.length < 2 || points.length > 4 || points.some((point) => !point.value))) throw new RangeError(`${label} metrics mode requires two to four valued points`);
  if (mode === "comparison" && points.length !== 2) throw new RangeError(`${label} comparison mode requires exactly two points`);
  if (mode === "process" && (points.length < 2 || points.length > 6)) throw new RangeError(`${label} process mode requires two to six points`);
  return Object.freeze({ id: safeId(value.id === undefined ? `section-${index + 1}` : value.id, `${label} id`), title: text(value.title, `${label} title`, 120), ...(value.summary === undefined ? {} : { summary: text(value.summary, `${label} summary`, 500) }), mode, points: Object.freeze(points) });
}
function validatePresentationBrief(value) {
  if (!plainObject(value)) throw new TypeError("presentation brief must be an object");
  exactKeys(value, ["version", "title", "subtitle", "audience", "purpose", "language", "theme", "seed", "variantCount", "maxSlides", "sections", "closing"], "presentation brief");
  if (value.version !== BRIEF_VERSION) throw new TypeError("presentation brief version is unsupported");
  if (!Array.isArray(value.sections) || value.sections.length < 1 || value.sections.length > 24) throw new RangeError("presentation brief sections are invalid");
  const sections = value.sections.map(normalizeSection);
  if (new Set(sections.map((section) => section.id)).size !== sections.length) throw new TypeError("presentation brief section ids must be unique");
  const sourcePoints = sections.reduce((total, section) => total + section.points.length, 0);
  if (sourcePoints > MAX_SOURCE_POINTS) throw new RangeError("presentation brief contains too many source points");
  const theme = value.theme === undefined ? THEMES[0] : value.theme;
  if (!THEMES.includes(theme)) throw new TypeError("presentation brief theme is invalid");
  const maxSlides = value.maxSlides === undefined ? 30 : value.maxSlides;
  if (!Number.isSafeInteger(maxSlides) || maxSlides < 2 || maxSlides > 100) throw new RangeError("presentation brief maxSlides is invalid");
  const variantCount = value.variantCount === undefined ? 3 : value.variantCount;
  if (!Number.isSafeInteger(variantCount) || variantCount < 1 || variantCount > 3) throw new RangeError("presentation brief variantCount is invalid");
  const closing = value.closing === undefined ? [] : value.closing;
  if (!Array.isArray(closing) || closing.length > 3) throw new RangeError("presentation brief closing actions are invalid");
  return Object.freeze({ version: BRIEF_VERSION, title: text(value.title, "presentation brief title", 160), ...(value.subtitle === undefined ? {} : { subtitle: text(value.subtitle, "presentation brief subtitle", 320) }), audience: text(value.audience, "presentation brief audience", 160), purpose: text(value.purpose, "presentation brief purpose", 320), language: value.language === undefined ? "zh-CN" : text(value.language, "presentation brief language", 32), theme, seed: value.seed === undefined ? crypto.createHash("sha256").update(value.title).digest("hex").slice(0, 16) : safeId(value.seed, "presentation brief seed"), variantCount, maxSlides, sections: Object.freeze(sections), closing: Object.freeze(closing.map((item, index) => text(item, `closing action ${index + 1}`, 80))) });
}
function parsePresentationBrief(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1 || buffer.length > MAX_BRIEF_BYTES) throw new TypeError("presentation brief file size is invalid");
  let parsed; try { parsed = JSON.parse(buffer.toString("utf8")); } catch { throw new TypeError("presentation brief is invalid JSON"); }
  return validatePresentationBrief(parsed);
}
function chunks(values, size) { const result = []; for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size)); return result; }
function planPresentation(rawBrief) {
  const brief = validatePresentationBrief(rawBrief); const slides = [{ id: "cover", role: "cover", title: brief.title, summary: brief.subtitle || brief.purpose }];
  for (const section of brief.sections) {
    const groups = section.mode === "narrative" ? chunks(section.points, 6) : [section.points];
    groups.forEach((points, index) => slides.push({ id: groups.length === 1 ? section.id : `${section.id}-${index + 1}`, role: section.mode === "narrative" ? "content" : section.mode, title: index === 0 ? section.title : `${section.title.slice(0, 108)}（续 ${index + 1}）`, ...(section.summary ? { summary: section.summary } : {}), items: points }));
  }
  if (brief.closing.length) slides.push({ id: "closing", role: "closing", title: brief.language.toLowerCase().startsWith("zh") ? "下一步行动" : "Next steps", summary: brief.purpose, items: brief.closing.map((label, index) => ({ id: `action-${index + 1}`, label, required: true })) });
  if (slides.length > brief.maxSlides) throw new RangeError(`presentation brief requires at least ${slides.length} slides but maxSlides is ${brief.maxSlides}`);
  const spec = validatePresentationSpec({ version: "1.0", title: brief.title, ...(brief.subtitle ? { subtitle: brief.subtitle } : {}), audience: brief.audience, language: brief.language, theme: brief.theme, seed: brief.seed, variantCount: brief.variantCount, slides });
  const plannedPoints = spec.slides.reduce((total, slide) => total + slide.items.length, 0) - brief.closing.length;
  const sourcePoints = brief.sections.reduce((total, section) => total + section.points.length, 0);
  const requiredPoints = brief.sections.reduce((total, section) => total + section.points.filter((point) => point.required).length, 0);
  const checks = Object.freeze([{ name: "planning-source-covered", passed: plannedPoints === sourcePoints }, { name: "planning-required-points-covered", passed: spec.slides.reduce((total, slide) => total + slide.items.filter((item) => item.required).length, 0) >= requiredPoints + brief.closing.length }, { name: "planning-capacity-respected", passed: spec.slides.length <= brief.maxSlides }, { name: "planning-narrative-valid", passed: spec.slides[0].role === "cover" && (!brief.closing.length || spec.slides.at(-1).role === "closing") }]);
  return Object.freeze({ spec, report: Object.freeze({ version: "1.0", sourceSections: brief.sections.length, sourcePoints, requiredPoints, slideCount: spec.slides.length, checks, passed: checks.every((check) => check.passed) }) });
}
function persistPresentationPlan({ workspaceRoot, input, output }) {
  const inputFile = insideRoot(workspaceRoot, input); const outputFile = insideRoot(workspaceRoot, output);
  const info = fs.lstatSync(inputFile);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > MAX_BRIEF_BYTES || path.extname(inputFile).toLowerCase() !== ".json") throw new Error("ppt plan input must be a bounded, non-symbolic JSON file");
  if (fs.existsSync(outputFile) || path.extname(outputFile).toLowerCase() !== ".json") throw new Error("ppt plan output must be a new JSON file");
  const parent = insideRoot(workspaceRoot, path.dirname(outputFile));
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) throw new Error("ppt plan output parent is unavailable");
  const result = planPresentation(parsePresentationBrief(fs.readFileSync(inputFile)));
  fs.writeFileSync(outputFile, `${JSON.stringify(result.spec, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return Object.freeze({ output: outputFile, report: result.report });
}

module.exports = { BRIEF_VERSION, MAX_BRIEF_BYTES, MAX_SOURCE_POINTS, SECTION_MODES, parsePresentationBrief, persistPresentationPlan, planPresentation, validatePresentationBrief };
