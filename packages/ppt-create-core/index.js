"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { assertNonEmptyString, assertQualityReport } = require("../capability-contracts");
const { JobStore, insideRoot, sha256File } = require("../capability-runtime");
const { createDeckIr } = require("./layout");
const { MAX_SPEC_BYTES, parsePresentationSpec } = require("./spec");

const CAPABILITY = "ppt-create";
const REGISTRATION = Object.freeze({ capability: CAPABILITY, toolNames: ["create_ppt_create_job", "get_ppt_create_report"], minimumRuntimeVersion: ">=0.1.0 <1.0.0", requiredWorkerProfile: "ppt-create" });
const PPTX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const ARTIFACT_NAMES = Object.freeze({ ir: "deck.ir.json", pptx: "deck.pptx", json: "ppt-create-report.json", markdown: "ppt-create-report.md" });

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function assertInputFile(workspaceRoot, input) {
  const file = insideRoot(workspaceRoot, input);
  const info = fs.lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > MAX_SPEC_BYTES || path.extname(file).toLowerCase() !== ".json") throw new Error("ppt-create input must be a bounded, non-symbolic JSON file");
  return file;
}
function assertNewOutput(workspaceRoot, output) {
  const directory = insideRoot(workspaceRoot, output);
  if (fs.existsSync(directory)) throw new Error("ppt-create output directory must not already exist");
  const parent = path.dirname(directory);
  const approvedParent = insideRoot(workspaceRoot, parent);
  if (!fs.existsSync(approvedParent) || !fs.statSync(approvedParent).isDirectory()) throw new Error("ppt-create output parent directory is unavailable");
  return directory;
}
function createPptCreateJob({ workspaceRoot, stateRoot, ownerId, input, output, idempotencyKey }) {
  const approvedInput = assertInputFile(workspaceRoot, input);
  const approvedOutput = assertNewOutput(workspaceRoot, output);
  const inputBuffer = fs.readFileSync(approvedInput);
  parsePresentationSpec(inputBuffer);
  const inputSha256 = sha256(inputBuffer);
  const key = idempotencyKey || sha256(Buffer.from(`${inputSha256}\u0000${approvedOutput}`, "utf8"));
  const store = new JobStore({ root: stateRoot, ownerId });
  const job = store.create({ id: crypto.randomUUID(), capability: CAPABILITY, idempotencyKey: assertNonEmptyString(key, "idempotencyKey"), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
  if (!job.input) store.write({ ...job, input: { path: approvedInput, sha256: inputSha256 }, output: { path: approvedOutput } });
  return store.get(job.id);
}
function qualityFor(spec, ir) {
  const editableObjects = ir.pages.reduce((total, page) => total + page.textBoxes.length + page.shapes.length + page.tables.length + page.charts.length, 0);
  const requiredFacts = spec.slides.reduce((total, slide) => total + slide.items.filter((item) => item.required).length, 0);
  const renderedFacts = spec.slides.reduce((total, slide) => total + slide.items.length, 0);
  const candidateLayouts = ir.pages.reduce((total, page) => total + (Array.isArray(page.intent?.candidateLayoutIds) ? page.intent.candidateLayoutIds.length : 0), 0);
  const selectedLayoutsResolved = ir.pages.every((page) => typeof page.intent?.layoutId === "string" && page.intent.candidateLayoutIds?.includes(page.intent.layoutId));
  const layoutCandidatesAvailable = ir.pages.every((page) => Array.isArray(page.intent?.candidateLayoutIds) && page.intent.candidateLayoutIds.length >= 2);
  const checks = [
    { name: "presentation-spec-valid", passed: true },
    { name: "required-facts-covered", passed: renderedFacts >= requiredFacts },
    { name: "editable-content-present", passed: editableObjects > 0 },
    { name: "slide-count-matches", passed: ir.pages.length === spec.slides.length },
    { name: "layout-candidates-available", passed: layoutCandidatesAvailable },
    { name: "layout-selection-resolved", passed: selectedLayoutsResolved }
  ];
  return assertQualityReport({ passed: checks.every((check) => check.passed), checks, metrics: { pages: ir.pages.length, "required-facts": requiredFacts, "rendered-facts": renderedFacts, "editable-objects": editableObjects, "candidate-layouts": candidateLayouts, "raster-images": 0 } });
}
function creationReport(spec, quality, inputSha256, pptxSha256) {
  return Object.freeze({
    version: "1.0",
    capability: CAPABILITY,
    generatedAt: new Date().toISOString(),
    source: Object.freeze({ sha256: inputSha256 }),
    result: Object.freeze({ theme: spec.theme, pageCount: spec.slides.length, pptxSha256 }),
    quality
  });
}
function renderMarkdown(report) {
  const status = report.quality.passed ? "passed" : "failed";
  return `# PPT Create Report\n\n- Status: ${status}\n- Theme: ${report.result.theme}\n- Pages: ${report.result.pageCount}\n- Editable objects: ${report.quality.metrics["editable-objects"]}\n- Raster images: ${report.quality.metrics["raster-images"]}\n`;
}
function writeExclusive(file, value) { fs.writeFileSync(file, value, { flag: "wx", mode: 0o600 }); }
function artifact(file, name, mediaType) { return Object.freeze({ name, mediaType, uri: file, sha256: sha256File(file) }); }
function runPptCreateJob({ stateRoot, ownerId, id, buildPptx }) {
  const store = new JobStore({ root: stateRoot, ownerId });
  const job = store.get(id);
  if (!job) throw new Error("job not found");
  if (job.capability !== CAPABILITY || job.status !== "queued" || !job.input?.path || !job.input?.sha256 || !job.output?.path) throw new Error("ppt-create job is incomplete");
  if (typeof buildPptx !== "function") throw new TypeError("ppt-create requires an OpenXML build adapter");
  store.transition(id, "running", { attempt: job.attempt + 1, lease: { workerId: `host-${process.pid}`, heartbeatAt: new Date().toISOString(), expiresAt: job.expiresAt } });
  const output = job.output.path;
  try {
    const input = fs.readFileSync(job.input.path);
    if (sha256(input) !== job.input.sha256) throw new Error("presentation spec changed after job creation");
    const spec = parsePresentationSpec(input);
    const ir = createDeckIr(spec);
    fs.mkdirSync(output, { recursive: false });
    const irFile = path.join(output, ARTIFACT_NAMES.ir);
    const pptxFile = path.join(output, ARTIFACT_NAMES.pptx);
    writeExclusive(irFile, `${JSON.stringify(ir, null, 2)}\n`);
    buildPptx(Object.freeze({ irFile, outFile: pptxFile }));
    const pptxInfo = fs.lstatSync(pptxFile);
    if (!pptxInfo.isFile() || pptxInfo.isSymbolicLink() || pptxInfo.size < 22) throw new Error("OpenXML builder did not create a valid PPTX artifact");
    const quality = qualityFor(spec, ir);
    const report = creationReport(spec, quality, job.input.sha256, sha256File(pptxFile));
    const reportFile = path.join(output, ARTIFACT_NAMES.json);
    const markdownFile = path.join(output, ARTIFACT_NAMES.markdown);
    writeExclusive(reportFile, `${JSON.stringify(report, null, 2)}\n`);
    writeExclusive(markdownFile, renderMarkdown(report));
    const artifacts = [artifact(irFile, ARTIFACT_NAMES.ir, "application/json"), artifact(pptxFile, ARTIFACT_NAMES.pptx, PPTX_MEDIA_TYPE), artifact(reportFile, ARTIFACT_NAMES.json, "application/json"), artifact(markdownFile, ARTIFACT_NAMES.markdown, "text/markdown")];
    return store.transition(id, "succeeded", { artifacts, quality, lease: undefined });
  } catch {
    try { fs.rmSync(output, { recursive: true, force: true, maxRetries: 2 }); } catch { /* preserve the original bounded failure */ }
    return store.transition(id, "failed", { error: { code: "PPT_CREATE_FAILED", message: "PPT creation failed", retryable: false }, lease: undefined });
  }
}
function pptCreateSummary(job, workspaceRoot) {
  try {
    if (!job || job.capability !== CAPABILITY || job.status !== "succeeded" || !job.output?.path) throw new Error("unavailable");
    const output = insideRoot(workspaceRoot, job.output.path);
    const reportFile = insideRoot(output, path.join(output, ARTIFACT_NAMES.json));
    const reportArtifact = job.artifacts.find((item) => item.name === ARTIFACT_NAMES.json && item.uri === reportFile && item.mediaType === "application/json");
    if (!reportArtifact || sha256File(reportFile) !== reportArtifact.sha256 || fs.statSync(reportFile).size > 256 * 1024) throw new Error("unavailable");
    const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
    if (report?.capability !== CAPABILITY || !report.result || !Number.isSafeInteger(report.result.pageCount) || report.result.pageCount < 1 || report.result.pageCount > 100 || typeof report.result.theme !== "string" || !/^[a-f0-9]{64}$/.test(report.result.pptxSha256 || "")) throw new Error("unavailable");
    return Object.freeze({ theme: report.result.theme, pageCount: report.result.pageCount, pptxSha256: report.result.pptxSha256 });
  } catch { return null; }
}

module.exports = { ARTIFACT_NAMES, CAPABILITY, PPTX_MEDIA_TYPE, REGISTRATION, createPptCreateJob, creationReport, pptCreateSummary, qualityFor, renderMarkdown, runPptCreateJob };
