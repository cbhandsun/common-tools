"use strict";

const path = require("path");

const MAX_CASES = 512;
const MAX_CATEGORIES = 64;

function resolveCorpusCases(corpusManifest = {}, goldenManifest = {}, options = {}) {
  const corpus = validateCorpusManifest(corpusManifest);
  const goldenCases = validateGoldenCases(goldenManifest?.cases);
  const selectedIds = selectCorpusIds(corpus, options);
  const resolved = [];
  for (const corpusCase of corpus.cases) {
    if (selectedIds && !selectedIds.has(corpusCase.id)) continue;
    const golden = goldenCases.get(corpusCase.goldenCaseId);
    if (!golden) throw new Error(`Corpus case "${corpusCase.id}" references unknown golden case "${corpusCase.goldenCaseId}".`);
    resolved.push({
      ...golden,
      command: applyRendererOverride(golden.command, corpusCase.renderer),
      expect: { ...(golden.expect || {}), ...corpusCase.qualityExpect },
      id: corpusCase.id,
      goldenCaseId: corpusCase.goldenCaseId,
      corpusCategory: corpusCase.category,
      corpusTags: corpusCase.tags,
      sourceDeck: corpusCase.sourceDeck || null,
      sourcePage: corpusCase.sourcePage ?? null
    });
  }
  const coverage = summarizeCorpusCoverage(resolved, corpus.requiredCategories);
  if (options.requireCoverage !== false && !coverage.passed) {
    throw new Error(`Corpus coverage is incomplete: ${coverage.missingCategories.join(", ")}`);
  }
  return { id: corpus.id, description: corpus.description, cases: resolved, coverage };
}

function validateCorpusManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new TypeError("corpus manifest must be an object");
  const id = safeId(manifest.id, "corpus manifest id");
  const description = safeText(manifest.description || "", "corpus description", 500);
  const requiredCategories = uniqueStrings(manifest.requiredCategories || [], "requiredCategories", MAX_CATEGORIES);
  if (!Array.isArray(manifest.cases) || manifest.cases.length === 0 || manifest.cases.length > MAX_CASES) {
    throw new TypeError(`corpus cases must contain between 1 and ${MAX_CASES} entries`);
  }
  const seen = new Set();
  const cases = manifest.cases.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new TypeError(`corpus case ${index} must be an object`);
    const caseId = safeId(entry.id, `corpus case ${index} id`);
    if (seen.has(caseId)) throw new Error(`Duplicate corpus case id: ${caseId}`);
    seen.add(caseId);
    const sourcePage = entry.sourcePage == null ? null : boundedInteger(entry.sourcePage, "sourcePage", 1, 10000);
    return Object.freeze({
      id: caseId,
      goldenCaseId: safeId(entry.goldenCaseId, `corpus case ${caseId} goldenCaseId`),
      category: safeId(entry.category, `corpus case ${caseId} category`),
      tags: uniqueStrings(entry.tags || [], `corpus case ${caseId} tags`, 32),
      sourceDeck: entry.sourceDeck == null ? null : safeText(entry.sourceDeck, "sourceDeck", 260),
      sourcePage,
      renderer: normalizeRenderer(entry.renderer),
      qualityExpect: normalizeQualityExpect(entry.qualityExpect)
    });
  });
  return Object.freeze({ id, description, requiredCategories, cases });
}

function applyRendererOverride(command, renderer) {
  if (!renderer) return Array.isArray(command) ? [...command] : command;
  if (!Array.isArray(command)) throw new TypeError("golden command must be an array before applying a renderer override");
  const output = [...command];
  const index = output.indexOf("--renderer");
  if (index >= 0) {
    if (index + 1 >= output.length) throw new Error("golden command has an incomplete --renderer option");
    output[index + 1] = renderer;
  } else {
    output.push("--renderer", renderer);
  }
  return output;
}

function normalizeRenderer(value) {
  if (value == null || value === "") return null;
  const renderer = String(value).trim().toLowerCase();
  if (renderer !== "libreoffice" && renderer !== "powerpoint") throw new TypeError("corpus renderer must be libreoffice or powerpoint");
  return renderer;
}

function normalizeQualityExpect(value) {
  if (value == null) return Object.freeze({});
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("corpus qualityExpect must be an object");
  const allowed = new Set(["maxPixelDiffRatio", "maxForegroundMissingRatio", "minLayoutMeanIoU"]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`Unknown corpus quality expectations: ${unknown.join(", ")}`);
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    const number = Number(item);
    if (!Number.isFinite(number) || number < 0 || number > 1) throw new TypeError(`${key} must be a ratio between 0 and 1`);
    output[key] = number;
  }
  return Object.freeze(output);
}

function selectCorpusIds(corpus, options = {}) {
  const requested = uniqueStrings(options.caseIds || [], "caseIds", MAX_CASES);
  const suiteNames = uniqueStrings(options.suites || [], "suites", 32);
  const categoryNames = uniqueStrings(options.categories || [], "categories", MAX_CATEGORIES);
  const ids = new Set(requested);
  const suites = options.manifestSuites || {};
  for (const suite of suiteNames) {
    const suiteIds = suites[suite];
    if (!Array.isArray(suiteIds)) throw new Error(`Unknown corpus suite: ${suite}`);
    for (const id of suiteIds) ids.add(safeId(id, `corpus suite ${suite} case id`));
  }
  for (const entry of corpus.cases) {
    if (categoryNames.includes(entry.category)) ids.add(entry.id);
  }
  if (ids.size === 0) return null;
  const known = new Set(corpus.cases.map((entry) => entry.id));
  const unknown = [...ids].filter((id) => !known.has(id));
  if (unknown.length > 0) throw new Error(`Unknown corpus case ids: ${unknown.join(", ")}`);
  return ids;
}

function summarizeCorpusCoverage(cases = [], requiredCategories = []) {
  if (!Array.isArray(cases)) throw new TypeError("corpus cases must be an array");
  const categoryCounts = {};
  const deckCounts = {};
  for (const entry of cases) {
    const category = safeId(entry?.corpusCategory, "resolved corpus category");
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    if (entry?.sourceDeck) deckCounts[entry.sourceDeck] = (deckCounts[entry.sourceDeck] || 0) + 1;
  }
  const required = uniqueStrings(requiredCategories, "requiredCategories", MAX_CATEGORIES);
  const missingCategories = required.filter((category) => !categoryCounts[category]);
  return Object.freeze({
    passed: missingCategories.length === 0,
    caseCount: cases.length,
    categoryCount: Object.keys(categoryCounts).length,
    deckCount: Object.keys(deckCounts).length,
    categoryCounts,
    deckCounts,
    missingCategories
  });
}

function validateGoldenCases(cases) {
  if (!Array.isArray(cases) || cases.length > 10000) throw new TypeError("golden manifest cases must be a bounded array");
  const byId = new Map();
  for (const entry of cases) {
    const id = safeId(entry?.id, "golden case id");
    if (byId.has(id)) throw new Error(`Duplicate golden case id: ${id}`);
    byId.set(id, entry);
  }
  return byId;
}

function resolveManifestPath(baseDir, value, label) {
  const text = safeText(value, label, 1024);
  const resolved = path.resolve(baseDir, text);
  return resolved;
}

function uniqueStrings(value, label, maximum) {
  if (!Array.isArray(value) || value.length > maximum) throw new TypeError(`${label} must be an array of at most ${maximum} strings`);
  const strings = value.map((item) => safeId(item, label));
  if (new Set(strings).size !== strings.length) throw new Error(`${label} must not contain duplicates`);
  return strings;
}

function safeId(value, label) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 128 || !/^[\w.-]+$/u.test(text)) throw new TypeError(`${label} must be a non-empty safe identifier`);
  return text;
}

function safeText(value, label, maximum) {
  const text = String(value ?? "").trim();
  if (text.length > maximum || /[\u0000-\u001F\u007F]/u.test(text)) throw new TypeError(`${label} is invalid`);
  return text;
}

function boundedInteger(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw new TypeError(`${label} must be an integer between ${minimum} and ${maximum}`);
  return number;
}

module.exports = {
  resolveCorpusCases,
  resolveManifestPath,
  summarizeCorpusCoverage,
  validateCorpusManifest
};
