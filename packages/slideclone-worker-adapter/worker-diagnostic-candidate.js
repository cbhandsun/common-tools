// @ts-check
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { types } = require("node:util");
const { readZipEntries } = require("../slideclone-core/pptx-zip");
const MAX_BYTES = 256 * 1024 * 1024;
const FIELDS = Object.freeze(["pixel-diff-ratio", "foreground-missing-ratio", "mean-absolute-delta"]);
/** @typedef {{passed: boolean, metrics: Record<string, number>}} Evidence */
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !types.isProxy(value) && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(item => "value" in item);
}
/** @param {string} root @param {string} file */
function inside(root, file) {
  const relative = path.relative(root, file);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
/** Copy only numeric render evidence. Provider text, IDs and messages never enter diagnostics.
 * @param {unknown} quality @returns {Evidence | null} */
function evidence(quality) {
  if (!record(quality) || !record(quality.metrics) || !Array.isArray(quality.checks) || types.isProxy(quality.checks)
    || quality.checks.length > 128 || Object.getPrototypeOf(quality.checks) !== Array.prototype
    || Object.values(Object.getOwnPropertyDescriptors(quality.checks)).some(item => !("value" in item))) return null;
  let rendered = false, fidelity = false;
  const seen = new Set();
  for (let index = 0; index < quality.checks.length; index++) {
    const property = Object.getOwnPropertyDescriptor(quality.checks, String(index));
    if (!property || !("value" in property)) return null;
    const check = /** @type {unknown} */ (property.value);
    if (!record(check) || typeof check.passed !== "boolean") return null;
    if (check.name === "quality-rendered" || check.name === "visual-fidelity") {
      if (seen.has(check.name)) return null;
      seen.add(check.name);
      if (check.name === "quality-rendered") rendered = check.passed;
      else fidelity = check.passed;
    }
  }
  if (!rendered) return null;
  /** @type {Record<string, number>} */ const metrics = {};
  for (const [index, name] of FIELDS.entries()) {
    const value = quality.metrics[name];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > (index === 2 ? 255 : 1)) return null;
    metrics[name] = value;
  }
  return { passed: fidelity, metrics };
}
/** Job-local artifact snapshot; retention never grants publication or replaces quality checks.
 * @param {string} temporaryRoot */
function createWorkerDiagnosticCandidate(temporaryRoot) {
  if (typeof temporaryRoot !== "string" || !path.isAbsolute(temporaryRoot)) throw new TypeError("worker diagnostic root is invalid");
  const base = fs.realpathSync(temporaryRoot);
  /** @type {{directory: string, file: string, sha256: string, evidence: Evidence} | null} */ let saved = null;
  let verifiedCandidates = 0;
  return {
    /** @param {unknown} request @param {unknown} quality */
    remember(request, quality) {
      const next = evidence(quality);
      if (!next) return false;
      if (!record(request) || typeof request.root !== "string" || !path.isAbsolute(request.root)
        || typeof request.pptxFile !== "string" || !path.isAbsolute(request.pptxFile)) throw new TypeError("worker diagnostic candidate is invalid");
      const root = fs.realpathSync(request.root), file = request.pptxFile;
      const info = fs.lstatSync(file);
      if (!inside(base, root) || !inside(root, fs.realpathSync(file)) || !info.isFile() || info.isSymbolicLink()
        || info.size < 1 || info.size > MAX_BYTES) throw new TypeError("worker diagnostic artifact is invalid");
      verifiedCandidates++;
      if (saved && !FIELDS.every(name => (next.metrics[name] ?? Infinity) <= (saved?.evidence.metrics[name] ?? -Infinity) + 1e-9)) return false;
      if (saved && !FIELDS.some(name => (next.metrics[name] ?? Infinity) < (saved?.evidence.metrics[name] ?? -Infinity) - 1e-9)) return false;
      const body = fs.readFileSync(file);
      const entries = readZipEntries(body, { maxArchiveBytes: MAX_BYTES, maxEntries: 20000, maxEntryBytes: 16 * 1024 * 1024 });
      if (!["[Content_Types].xml", "ppt/presentation.xml"].every(name => entries.some(entry => entry.name === name)))
        throw new Error("worker diagnostic presentation is invalid");
      const digest = crypto.createHash("sha256").update(body).digest("hex");
      const directory = saved?.directory ?? fs.mkdtempSync(path.join(base, "common-tools-editable-diagnostic-"));
      const copy = path.join(directory, "candidate.pptx");
      fs.writeFileSync(copy, body);
      saved = { directory, file: copy, sha256: digest, evidence: next };
      return true;
    },
    /** @param {unknown} executionBudget */
    retain(executionBudget) {
      if (!saved) return null;
      const body = fs.readFileSync(saved.file);
      if (crypto.createHash("sha256").update(body).digest("hex") !== saved.sha256) throw new Error("worker diagnostic snapshot changed");
      if (!record(executionBudget) || typeof executionBudget.timeoutMs !== "number" || typeof executionBudget.elapsedMs !== "number"
        || !Number.isSafeInteger(executionBudget.timeoutMs) || executionBudget.timeoutMs < 1 || executionBudget.timeoutMs > 540000
        || !Number.isFinite(executionBudget.elapsedMs) || executionBudget.elapsedMs < 0 || executionBudget.timedOut !== true)
        throw new TypeError("worker diagnostic execution budget is invalid");
      const summary = Object.freeze({ version: 1, publishable: false, verifiedCandidates,
        executionBudget: { timeoutMs: executionBudget.timeoutMs, elapsedMs: executionBudget.elapsedMs, timedOut: true },
        renderVerified: true, visualFidelityPassed: saved.evidence.passed, metrics: saved.evidence.metrics, sha256: saved.sha256 });
      fs.writeFileSync(path.join(saved.directory, "diagnostic.json"), `${JSON.stringify(summary)}\n`, "utf8");
      return Object.freeze({ directory: saved.directory, ...summary });
    },
    close() {
      if (saved) {
        if (!inside(base, saved.directory) || path.dirname(saved.directory) !== base
          || !path.basename(saved.directory).startsWith("common-tools-editable-diagnostic-")) throw new Error("worker diagnostic cleanup path is invalid");
        fs.rmSync(saved.directory, { recursive: true, force: true });
        saved = null;
      }
    }
  };
}

module.exports = { createWorkerDiagnosticCandidate };
