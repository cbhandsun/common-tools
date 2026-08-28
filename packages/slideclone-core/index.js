"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { JobStore, insideRoot, sha256File } = require("../capability-runtime");
const { assertNonEmptyString, assertQualityReport } = require("../capability-contracts");
const { assertValidConfig } = require("./config-validation");
const { hasCompleteImageContainer, readImageSizeBuffer } = require("./image-size");

const CAPABILITY = "image-to-editable";
const REGISTRATION = Object.freeze({ capability: CAPABILITY, toolNames: ["create_editable_job", "get_job", "cancel_job", "list_job_artifacts"], minimumRuntimeVersion: ">=0.1.0 <1.0.0", requiredWorkerProfile: "base" });
const MAX_ARTIFACTS = 32;
const MAX_ARTIFACT_CANDIDATES = 512;
const MAX_VISUAL_REPORT_BYTES = 1024 * 1024;
const VISUAL_REPORT_NAME = path.join("reports", "delivery-summary.json");
const MAX_EDITABLE_INPUT_BYTES = 100 * 1024 * 1024;
const MAX_EDITABLE_IMAGE_DIMENSION = 16384;
const MAX_EDITABLE_IMAGE_PIXELS = 40_000_000;

function resolvedConfigPath(configFile, value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`slideclone config ${label} is invalid`);
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(path.dirname(configFile), value);
}
function assertEditableConfig({ workspaceRoot, input, output, configFile }) {
  const info = fs.statSync(configFile);
  if (!info.isFile() || info.size < 1 || info.size > 1024 * 1024) throw new Error("slideclone config size is invalid");
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(configFile, "utf8")); }
  catch { throw new Error("slideclone config is invalid JSON"); }
  try { assertValidConfig(parsed); }
  catch { throw new Error("slideclone config is invalid"); }
  let configInput;
  let configOutput;
  try {
    configInput = insideRoot(workspaceRoot, resolvedConfigPath(configFile, parsed.inputDir, "inputDir"));
    configOutput = insideRoot(workspaceRoot, resolvedConfigPath(configFile, parsed.outputDir, "outputDir"));
  } catch { throw new Error("slideclone config paths must stay inside the workspace root"); }
  if (configInput !== path.dirname(input) || configOutput !== output) throw new Error("slideclone config inputDir and outputDir must match the requested input and output");
}
function assertEditableInputImage(file) {
  const info = fs.statSync(file);
  const extension = path.extname(file).toLowerCase();
  if (!info.isFile() || info.size < 24 || info.size > MAX_EDITABLE_INPUT_BYTES || ![".png", ".jpg", ".jpeg"].includes(extension)) throw new Error("image-to-editable input must be a bounded PNG or JPEG image");
  const buffer = fs.readFileSync(file);
  const isPng = extension === ".png" && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = (extension === ".jpg" || extension === ".jpeg") && buffer[0] === 0xff && buffer[1] === 0xd8;
  const size = readImageSizeBuffer(buffer, extension);
  const pixels = Number.isSafeInteger(size.widthPx) && Number.isSafeInteger(size.heightPx) ? size.widthPx * size.heightPx : 0;
  if ((!isPng && !isJpeg) || !Number.isSafeInteger(size.widthPx) || !Number.isSafeInteger(size.heightPx) || size.widthPx < 1 || size.heightPx < 1 || size.widthPx > MAX_EDITABLE_IMAGE_DIMENSION || size.heightPx > MAX_EDITABLE_IMAGE_DIMENSION || !Number.isSafeInteger(pixels) || pixels > MAX_EDITABLE_IMAGE_PIXELS) throw new Error("image-to-editable input image dimensions exceed the processing boundary");
  if (!hasCompleteImageContainer(buffer, extension)) throw new Error("image-to-editable input image is invalid");
}

function createEditableJob({ workspaceRoot, stateRoot, ownerId, input, output, config, idempotencyKey }) {
  const approvedInput = insideRoot(workspaceRoot, input);
  if (!fs.existsSync(approvedInput) || !fs.statSync(approvedInput).isFile()) throw new Error("input must be an existing file inside the workspace root");
  const approvedOutput = insideRoot(workspaceRoot, output);
  if (typeof config !== "string" || !config.trim()) throw new Error("image-to-editable requires a slideclone config inside the workspace root");
  const approvedConfig = insideRoot(workspaceRoot, config);
  if (!fs.existsSync(approvedConfig) || !fs.statSync(approvedConfig).isFile()) throw new Error("config must be an existing file inside the workspace root");
  assertEditableConfig({ workspaceRoot, input: approvedInput, output: approvedOutput, configFile: approvedConfig });
  assertEditableInputImage(approvedInput);
  const store = new JobStore({ root: stateRoot, ownerId });
  const key = idempotencyKey || crypto.createHash("sha256").update(`${approvedInput}\u0000${approvedOutput}`).digest("hex");
  const job = store.create({ id: crypto.randomUUID(), capability: CAPABILITY, idempotencyKey: assertNonEmptyString(key, "idempotencyKey"), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
  if (!job.input) store.write({ ...job, input: { path: approvedInput }, output: { path: approvedOutput }, config: approvedConfig ? { path: approvedConfig } : null });
  return store.get(job.id);
}

function getJob({ stateRoot, ownerId, id }) { return new JobStore({ root: stateRoot, ownerId }).get(id); }
function cancelJob({ stateRoot, ownerId, id }) {
  const store = new JobStore({ root: stateRoot, ownerId });
  const job = store.get(id);
  if (!job) return null;
  if (job.status === "queued") return store.transition(id, "cancelled");
  if (job.status === "running" || job.status === "input_required") return store.transition(id, "cancel_requested");
  return job;
}

function runEditableJob({ stateRoot, ownerId, id, executeSlideclone, enhanceArtifacts }) {
  const store = new JobStore({ root: stateRoot, ownerId });
  const job = store.get(id);
  if (!job) throw new Error("job not found");
  if (job.status !== "queued") throw new Error("only queued jobs can be run");
  if (!job.config?.path) throw new Error("job is missing its required slideclone config");
  if (typeof executeSlideclone !== "function") throw new TypeError("an image-to-editable execution adapter is required");
  if (enhanceArtifacts !== undefined && typeof enhanceArtifacts !== "function") throw new TypeError("image delivery enhancement adapter is invalid");
  store.transition(id, "running", { attempt: job.attempt + 1, lease: { workerId: `host-${process.pid}`, heartbeatAt: new Date().toISOString(), expiresAt: job.expiresAt } });
  let result;
  try {
    result = executeSlideclone(Object.freeze({ configPath: job.config.path, inputPath: job.input.path }));
  } catch {
    result = null;
  }
  if (!result || result.status !== 0) return store.transition(id, "failed", { error: { code: "SLIDECLONE_FAILED", message: "slideclone execution failed", retryable: false }, lease: undefined });
  let delivery;
  if (enhanceArtifacts !== undefined) {
    try { delivery = enhanceArtifacts({ outputDir: job.output.path }); }
    catch { return store.transition(id, "failed", { error: { code: "IMAGE_DELIVERY_FAILED", message: "image delivery artifact enhancement failed", retryable: false }, lease: undefined }); }
  }
  const artifacts = collectArtifacts(job.output.path);
  let quality;
  try { quality = editableQuality(artifacts, delivery); }
  catch { return store.transition(id, "failed", { artifacts, error: { code: "IMAGE_DELIVERY_QUALITY_INVALID", message: "image delivery quality result is invalid", retryable: false }, lease: undefined }); }
  if (!quality.passed) {
    const hasPptx = quality.metrics["pptx-artifacts"] > 0;
    return store.transition(id, "failed", { artifacts, quality, error: { code: hasPptx ? "IMAGE_DELIVERY_QUALITY_FAILED" : "SLIDECLONE_ARTIFACT_MISSING", message: hasPptx ? "image delivery artifacts did not pass quality gates" : "slideclone completed without a PPTX artifact", retryable: false }, lease: undefined });
  }
  return store.transition(id, "succeeded", { artifacts, quality, lease: undefined });
}

function editableQuality(artifacts, delivery) {
  if (!Array.isArray(artifacts)) throw new TypeError("editable artifacts are invalid");
  const pptxArtifacts = artifacts.filter((artifact) => artifact?.mediaType === "application/vnd.openxmlformats-officedocument.presentationml.presentation").length;
  const checks = [{ name: "slideclone-completed", passed: true }, { name: "pptx-artifact-present", passed: pptxArtifacts > 0 }];
  if (delivery !== undefined) {
    if (!delivery || !Array.isArray(delivery.checks)) throw new TypeError("image delivery quality is invalid");
    checks.push(...delivery.checks);
  }
  const passed = checks.every((check) => check.passed);
  return assertQualityReport({ passed, checks, metrics: { artifacts: artifacts.length, "pptx-artifacts": pptxArtifacts, ...(delivery ? { "delivery-pages": delivery.pageCount } : {}) } });
}

function collectArtifacts(outputPath) {
  if (!fs.existsSync(outputPath)) return [];
  const outputInfo = fs.lstatSync(outputPath);
  if (outputInfo.isSymbolicLink()) return [];
  if (outputInfo.isFile()) return [artifactForFile(outputPath, path.basename(outputPath))];
  if (!outputInfo.isDirectory()) return [];
  const candidates = new Map();
  const addCandidate = (file, name) => {
    if (candidates.has(name)) return;
    try {
      const info = fs.lstatSync(file);
      if (info.isFile() && !info.isSymbolicLink() && /\.(pptx|pdf|html|json)$/i.test(name)) candidates.set(name, file);
    } catch { /* A concurrently removed optional artifact is not a Job failure. */ }
  };
  addCandidate(path.join(outputPath, VISUAL_REPORT_NAME), VISUAL_REPORT_NAME);
  const queue = [{ directory: outputPath, prefix: "" }];
  let scannedEntries = 0;
  while (queue.length > 0 && scannedEntries < MAX_ARTIFACT_CANDIDATES) {
    const current = queue.shift();
    for (const entry of fs.readdirSync(current.directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      scannedEntries += 1;
      if (scannedEntries > MAX_ARTIFACT_CANDIDATES) break;
      const relative = path.join(current.prefix, entry.name);
      const candidate = path.join(current.directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) queue.push({ directory: candidate, prefix: relative });
      else if (entry.isFile()) addCandidate(candidate, relative);
    }
  }
  const priority = (name) => name === VISUAL_REPORT_NAME ? 0 : /deck\.(pptx|ir\.json|preview\.html|html|pdf|preservation-plan\.json)$/iu.test(name.replaceAll("\\", "/")) ? 1 : 2;
  return [...candidates.entries()]
    .sort(([left], [right]) => priority(left) - priority(right) || left.localeCompare(right))
    .slice(0, MAX_ARTIFACTS)
    .map(([name, file]) => artifactForFile(file, name));
}

function artifactForFile(file, name) {
  const extension = path.extname(file).toLowerCase();
  const mediaType = extension === ".pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : extension === ".pdf" ? "application/pdf" : extension === ".html" ? "text/html" : "application/json";
  return { name, mediaType, uri: file, sha256: sha256File(file) };
}

function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function boundedNumber(value, maximum) { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum ? value : null; }
function reportMetric(metrics, name, maximum, integer = false) {
  const value = boundedNumber(metrics?.[name], maximum);
  return value !== null && (!integer || Number.isSafeInteger(value)) ? value : undefined;
}
function verifiedJsonArtifact(job, outputReal, name, file) {
  try {
    if (typeof name !== "string" || !name || typeof file !== "string") return null;
    const candidate = insideRoot(outputReal, file);
    const relative = path.relative(outputReal, candidate);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
    const artifact = job.artifacts.find((item) => plainObject(item) && item.name === name && item.mediaType === "application/json" && item.uri === candidate && /^[a-f0-9]{64}$/.test(item.sha256 || ""));
    if (!artifact) return null;
    const info = fs.lstatSync(candidate);
    if (!info.isFile() || info.isSymbolicLink() || info.size < 2 || info.size > MAX_VISUAL_REPORT_BYTES || sha256File(candidate) !== artifact.sha256) return null;
    const real = fs.realpathSync.native(candidate);
    const realRelative = path.relative(outputReal, real);
    if (!realRelative || realRelative === ".." || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) return null;
    const document = JSON.parse(fs.readFileSync(candidate, "utf8"));
    return plainObject(document) ? Object.freeze({ document, path: candidate }) : null;
  } catch { return null; }
}
function perPageVisualSummary(job, outputReal, delivery, pageCount) {
  const diffPath = plainObject(delivery.artifacts) && typeof delivery.artifacts.diffReport === "string" ? delivery.artifacts.diffReport : null;
  if (!diffPath) return null;
  const resolvedDiffPath = path.isAbsolute(diffPath) ? diffPath : path.resolve(outputReal, diffPath);
  const diffName = path.relative(outputReal, resolvedDiffPath);
  if (!diffName || diffName === ".." || diffName.startsWith(`..${path.sep}`) || path.isAbsolute(diffName)) return null;
  const diff = verifiedJsonArtifact(job, outputReal, diffName, resolvedDiffPath);
  if (!diff || !Array.isArray(diff.document.metrics) || diff.document.metrics.length === 0 || diff.document.metrics.length > 100) return null;
  const seen = new Set();
  const pages = [];
  for (const metric of diff.document.metrics) {
    if (!plainObject(metric) || !Number.isSafeInteger(metric.pageIndex) || metric.pageIndex < 0 || metric.pageIndex >= pageCount || typeof metric.ok !== "boolean" || seen.has(metric.pageIndex)) return null;
    seen.add(metric.pageIndex);
    const page = { page: metric.pageIndex + 1, compared: metric.ok };
    if (metric.ok) {
      for (const name of ["pixelDiffRatio", "foregroundMissingRatio"]) {
        const value = reportMetric(metric, name, 1);
        if (value !== undefined) page[name] = value;
      }
      const meanAbsoluteDelta = reportMetric(metric, "meanAbsoluteDelta", 255);
      if (meanAbsoluteDelta !== undefined) page.meanAbsoluteDelta = meanAbsoluteDelta;
    }
    pages.push(Object.freeze(page));
  }
  return Object.freeze(pages);
}
function editableVisualSummary(job, workspaceRoot) {
  try {
    if (!plainObject(job) || job.capability !== CAPABILITY || job.status !== "succeeded" || !plainObject(job.output) || typeof job.output.path !== "string" || !Array.isArray(job.artifacts)) return null;
    const approvedWorkspace = path.resolve(workspaceRoot);
    const output = insideRoot(approvedWorkspace, job.output.path);
    const outputInfo = fs.lstatSync(output);
    if (!outputInfo.isDirectory() || outputInfo.isSymbolicLink()) return null;
    const outputReal = fs.realpathSync.native(output);
    const delivery = verifiedJsonArtifact(job, outputReal, VISUAL_REPORT_NAME, path.join(outputReal, VISUAL_REPORT_NAME));
    if (!delivery) return null;
    const parsed = delivery.document;
    if (!plainObject(parsed) || !plainObject(parsed.pages) || !plainObject(parsed.metrics)) return null;
    const count = reportMetric(parsed.pages, "count", 1000, true);
    const imageOnlyCount = reportMetric(parsed.pages, "imageOnlyCount", 1000, true);
    if (count === undefined || imageOnlyCount === undefined || imageOnlyCount > count) return null;
    const metrics = {};
    for (const name of ["pixelDiffRatio", "foregroundMissingRatio", "layoutMeanIoU", "textCoverage", "rasterImageAreaRatio"]) {
      const value = reportMetric(parsed.metrics, name, 1);
      if (value !== undefined) metrics[name] = value;
    }
    for (const name of ["editableObjects", "nonEditableObjects"]) {
      const value = reportMetric(parsed.metrics, name, 10000000, true);
      if (value !== undefined) metrics[name] = value;
    }
    const perPage = perPageVisualSummary(job, outputReal, parsed, count);
    return Object.freeze({ pages: Object.freeze({ count, imageOnlyCount }), metrics: Object.freeze(metrics), ...(perPage ? { perPage } : {}), warnings: Array.isArray(parsed.warnings) && parsed.warnings.length <= 1000 ? parsed.warnings.length : 0 });
  } catch { return null; }
}

module.exports = { CAPABILITY, REGISTRATION, VISUAL_REPORT_NAME, cancelJob, collectArtifacts, createEditableJob, editableQuality, editableVisualSummary, getJob, runEditableJob };
