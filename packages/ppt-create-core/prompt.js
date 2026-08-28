"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { containsControlCharacter } = require("../capability-contracts");
const { insideRoot } = require("../capability-runtime");
const { extractMarkdownOutline, outlineToBrief } = require("./document-ingest");
const { planPresentation, validatePresentationBrief } = require("./planner");

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

function promptToPresentation(rawPrompt, options = {}) {
  const request = promptRequest(rawPrompt, options);
  const provider = options.contentProvider;
  if (provider !== undefined && typeof provider !== "function") throw new TypeError("contentProvider must be a function");
  const supplied = provider ? provider(request) : deterministicBrief(request);
  if (supplied && typeof supplied.then === "function") throw new TypeError("contentProvider must return synchronously");
  const brief = validatePresentationBrief(supplied);
  const planned = planPresentation(brief);
  return Object.freeze({
    brief,
    spec: planned.spec,
    report: Object.freeze({
      version: "1.0",
      provider: provider ? "injected-content-provider" : "deterministic-local",
      promptSha256: crypto.createHash("sha256").update(request.prompt).digest("hex"),
      sourceCharacters: request.prompt.length,
      sections: brief.sections.length,
      points: brief.sections.reduce((total, section) => total + section.points.length, 0),
      slideCount: planned.spec.slides.length,
      planningPassed: planned.report.passed,
      checks: Object.freeze([{ name: "prompt-source-hash-recorded", passed: true }, { name: "prompt-brief-valid", passed: true }, { name: "prompt-planning-valid", passed: planned.report.passed }])
    })
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

module.exports = { MAX_PROMPT_BYTES, MAX_PROMPT_CHARACTERS, SUPPORTED_PROMPT_EXTENSIONS, deterministicBrief, persistPromptPlan, promptRequest, promptToPresentation, proseOutline };
