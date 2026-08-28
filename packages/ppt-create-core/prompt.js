"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { containsControlCharacter } = require("../capability-contracts");
const { insideRoot } = require("../capability-runtime");
const { extractMarkdownOutline, outlineToBrief } = require("./document-ingest");
const { planPresentation, validatePresentationBrief } = require("./planner");
const { normalizeCitations } = require("./content-metadata");
const { validatePresentationSpec } = require("./spec");

const MAX_PROMPT_BYTES = 256 * 1024;
const MAX_PROMPT_CHARACTERS = 120_000;
const SUPPORTED_PROMPT_EXTENSIONS = Object.freeze([".md", ".markdown", ".txt"]);

function boundedText(value, label, maximum, multiline = false) {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  const normalized = value.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n").trim();
  const unsafeControl = multiline ? [...normalized].some((character) => { const code = character.codePointAt(0); return (code <= 0x1f && code !== 0x0a && code !== 0x09) || code === 0x7f; }) : containsControlCharacter(normalized);
  if (!normalized || normalized.length > maximum || unsafeControl) throw new TypeError(`${label} is invalid`);
  return normalized;
}

function proseOutline(text) {
  const records = extractMarkdownOutline(text);
  if (records.some((record) => record.kind === "heading")) return records;
  const fragments = text.split(/\n{2,}|(?<=[。！？!?])\s+/u).map((item) => item.trim()).filter(Boolean);
  if (fragments.length < 2) return records;
  return fragments.flatMap((fragment, index) => index === 0
    ? [{ kind: "heading", level: 1, text: fragment.slice(0, 160) }]
    : [{ kind: "paragraph", text: fragment }]);
}

function promptRequest(rawPrompt, options = {}) {
  const prompt = boundedText(rawPrompt, "presentation prompt", MAX_PROMPT_CHARACTERS, true);
  return Object.freeze({
    version: "1.0",
    prompt,
    audience: boundedText(options.audience, "presentation audience", 160),
    purpose: boundedText(options.purpose, "presentation purpose", 320),
    language: options.language === undefined ? "zh-CN" : boundedText(options.language, "presentation language", 32),
    ...(options.theme === undefined ? {} : { theme: boundedText(options.theme, "presentation theme", 80) }),
    ...(options.maxSlides === undefined ? {} : { maxSlides: options.maxSlides }),
    ...(options.deckVariantCount === undefined ? {} : { deckVariantCount: options.deckVariantCount }),
    closing: options.closing === undefined ? [] : options.closing
  });
}

function deterministicBrief(request) {
  return outlineToBrief(proseOutline(request.prompt), {
    audience: request.audience,
    purpose: request.purpose,
    language: request.language,
    theme: request.theme,
    maxSlides: request.maxSlides,
    deckVariantCount: request.deckVariantCount,
    closing: request.closing,
    fallbackTitle: request.prompt.split("\n", 1)[0].slice(0, 160),
    defaultSectionTitle: request.language.toLowerCase().startsWith("zh") ? "核心内容" : "Key points"
  });
}

function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function normalizeProviderEnvelope(value) {
  if (!plainObject(value) || !Object.hasOwn(value, "brief")) return Object.freeze({ brief: validatePresentationBrief(value), provenance: undefined, citationsBySection: undefined });
  if (Object.keys(value).some((key) => !["brief", "provenance", "citationsBySection"].includes(key)) || !plainObject(value.provenance)) throw new TypeError("content provider envelope is invalid");
  const provenance = value.provenance; if (Object.keys(provenance).some((key) => !["providerId", "model", "requestId", "retrievedAt", "sources"].includes(key))) throw new TypeError("content provider provenance is invalid");
  const providerId = boundedText(provenance.providerId, "content provider id", 80); const model = boundedText(provenance.model, "content provider model", 120); const requestId = boundedText(provenance.requestId, "content provider request id", 160);
  if (typeof provenance.retrievedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[.]\d{3})?Z$/u.test(provenance.retrievedAt)) throw new TypeError("content provider retrievedAt is invalid");
  const sources = normalizeCitations(provenance.sources, 0); const byId = new Map(sources.map((source) => [source.id, source]));
  if (!plainObject(value.citationsBySection) || Object.keys(value.citationsBySection).length < 1 || Object.keys(value.citationsBySection).length > 24) throw new TypeError("content provider citation coverage is invalid");
  const citationsBySection = Object.fromEntries(Object.entries(value.citationsBySection).map(([sectionId, sourceIds]) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(sectionId) || !Array.isArray(sourceIds) || sourceIds.length < 1 || sourceIds.length > 5 || new Set(sourceIds).size !== sourceIds.length || sourceIds.some((id) => !byId.has(id))) throw new TypeError("content provider citation coverage is invalid");
    return [sectionId, Object.freeze(sourceIds.map((id) => byId.get(id)))];
  }));
  return Object.freeze({ brief: validatePresentationBrief(value.brief), provenance: Object.freeze({ providerId, model, requestId, retrievedAt: provenance.retrievedAt, sources: Object.freeze(sources) }), citationsBySection: Object.freeze(citationsBySection) });
}

function applyProviderCitations(spec, brief, envelope) {
  if (!envelope.provenance) return spec;
  if (brief.sections.some((section) => !envelope.citationsBySection[section.id])) throw new TypeError("content provider must cite every generated section");
  const draft = JSON.parse(JSON.stringify(spec));
  for (const section of brief.sections) for (const slide of draft.slides.filter((candidate) => candidate.id === section.id || candidate.id.startsWith(`${section.id}-`))) slide.citations = envelope.citationsBySection[section.id];
  return validatePresentationSpec(draft);
}

function createGenerationManifest(request, report) {
  return validateGenerationManifest({ version: "1.0", request: { promptSha256: report.promptSha256, sourceCharacters: report.sourceCharacters, audience: request.audience, purpose: request.purpose, language: request.language, ...(request.theme ? { theme: request.theme } : {}) }, generation: { provider: report.provider, ...(report.provenance ? { provenance: report.provenance } : {}) }, checks: report.checks });
}

function validateGenerationManifest(value) {
  if (!plainObject(value) || Object.keys(value).some((key) => !["version", "request", "generation", "checks"].includes(key)) || value.version !== "1.0" || !plainObject(value.request) || !plainObject(value.generation) || !Array.isArray(value.checks)) throw new TypeError("generation manifest is invalid");
  if (Object.keys(value.request).some((key) => !["promptSha256", "sourceCharacters", "audience", "purpose", "language", "theme"].includes(key)) || !/^[a-f0-9]{64}$/u.test(value.request.promptSha256 || "") || !Number.isSafeInteger(value.request.sourceCharacters) || value.request.sourceCharacters < 1 || value.request.sourceCharacters > MAX_PROMPT_CHARACTERS) throw new TypeError("generation manifest request is invalid");
  const request = { promptSha256: value.request.promptSha256, sourceCharacters: value.request.sourceCharacters, audience: boundedText(value.request.audience, "generation audience", 160), purpose: boundedText(value.request.purpose, "generation purpose", 320), language: boundedText(value.request.language, "generation language", 32), ...(value.request.theme === undefined ? {} : { theme: boundedText(value.request.theme, "generation theme", 80) }) };
  if (Object.keys(value.generation).some((key) => !["provider", "provenance"].includes(key))) throw new TypeError("generation manifest provider is invalid");
  let provenance;
  if (value.generation.provenance !== undefined) {
    const raw = value.generation.provenance; if (!plainObject(raw) || Object.keys(raw).some((key) => !["providerId", "model", "requestId", "retrievedAt", "sources"].includes(key)) || typeof raw.retrievedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[.]\d{3})?Z$/u.test(raw.retrievedAt)) throw new TypeError("generation provenance is invalid");
    provenance = Object.freeze({ providerId: boundedText(raw.providerId, "generation provider id", 80), model: boundedText(raw.model, "generation model", 120), requestId: boundedText(raw.requestId, "generation request id", 160), retrievedAt: raw.retrievedAt, sources: normalizeCitations(raw.sources, 0) });
  }
  const generation = { provider: boundedText(value.generation.provider, "generation provider", 80), ...(provenance ? { provenance } : {}) };
  const checks = value.checks.map((check) => { if (!plainObject(check) || Object.keys(check).some((key) => !["name", "passed"].includes(key)) || typeof check.passed !== "boolean") throw new TypeError("generation manifest check is invalid"); return Object.freeze({ name: boundedText(check.name, "generation check", 120), passed: check.passed }); });
  const manifest = { version: "1.0", request: Object.freeze(request), generation: Object.freeze(generation), checks: Object.freeze(checks) }; if (Buffer.byteLength(JSON.stringify(manifest)) > 256 * 1024) throw new TypeError("generation manifest is too large"); return Object.freeze(manifest);
}

function promptToPresentation(rawPrompt, options = {}) {
  const request = promptRequest(rawPrompt, options);
  const provider = options.contentProvider;
  if (provider !== undefined && typeof provider !== "function") throw new TypeError("contentProvider must be a function");
  const supplied = provider ? provider(request) : deterministicBrief(request);
  if (supplied && typeof supplied.then === "function") throw new TypeError("contentProvider must return synchronously");
  const envelope = normalizeProviderEnvelope(supplied); const brief = envelope.brief;
  const planned = planPresentation(brief);
  const spec = applyProviderCitations(planned.spec, brief, envelope);
  const promptSha256 = crypto.createHash("sha256").update(request.prompt).digest("hex");
  const checks = Object.freeze([{ name: "prompt-source-hash-recorded", passed: true }, { name: "prompt-brief-valid", passed: true }, { name: "prompt-planning-valid", passed: planned.report.passed }, { name: "provider-sources-grounded", passed: !provider || (Boolean(envelope.provenance) && brief.sections.every((section) => Boolean(envelope.citationsBySection[section.id]))) }]);
  const report = Object.freeze({
    version: "1.1",
    provider: provider ? envelope.provenance?.providerId || "injected-content-provider" : "deterministic-local",
    promptSha256,
    sourceCharacters: request.prompt.length,
    sections: brief.sections.length,
    points: brief.sections.reduce((total, section) => total + section.points.length, 0),
    slideCount: spec.slides.length,
    planningPassed: planned.report.passed,
    ...(envelope.provenance ? { provenance: envelope.provenance } : {}),
    checks
  });
  return Object.freeze({
    brief,
    spec,
    report,
    manifest: createGenerationManifest(request, report)
  });
}

function persistPromptPlan({ workspaceRoot, input, output, outputFormat = "spec", ...options }) {
  const inputFile = insideRoot(workspaceRoot, input);
  const outputFile = insideRoot(workspaceRoot, output);
  const info = fs.lstatSync(inputFile);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > MAX_PROMPT_BYTES || !SUPPORTED_PROMPT_EXTENSIONS.includes(path.extname(inputFile).toLowerCase())) throw new Error("ppt draft input must be a bounded, non-symbolic text or Markdown file");
  if (fs.existsSync(outputFile) || path.extname(outputFile).toLowerCase() !== ".json") throw new Error("ppt draft output must be a new JSON file");
  const parent = insideRoot(workspaceRoot, path.dirname(outputFile));
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) throw new Error("ppt draft output parent is unavailable");
  if (!["brief", "spec"].includes(outputFormat)) throw new Error("ppt draft outputFormat must be brief or spec");
  const bytes = fs.readFileSync(inputFile);
  const prompt = boundedText(bytes.toString("utf8"), "presentation prompt", MAX_PROMPT_CHARACTERS, true);
  const result = promptToPresentation(prompt, options);
  fs.writeFileSync(outputFile, `${JSON.stringify(outputFormat === "brief" ? result.brief : result.spec, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return Object.freeze({ output: outputFile, report: result.report });
}

module.exports = { MAX_PROMPT_BYTES, MAX_PROMPT_CHARACTERS, SUPPORTED_PROMPT_EXTENSIONS, applyProviderCitations, createGenerationManifest, deterministicBrief, normalizeProviderEnvelope, persistPromptPlan, promptRequest, promptToPresentation, proseOutline, validateGenerationManifest };
