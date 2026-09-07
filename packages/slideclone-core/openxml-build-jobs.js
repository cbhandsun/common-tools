"use strict";
// @ts-check
const fs = require("node:fs");
const path = require("node:path");

/** @typedef {{irFile: string, outFile: string, templatePptx: string}} BuildJob */

/** Read data fields only; admission must not invoke accessors or string coercion.
 * @param {unknown} value @param {string} key @returns {unknown} */
function field(value, key) {
  if (!value || typeof value !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor && !("value" in descriptor)) throw new TypeError("buildOpenXmlDecks accessor fields are invalid");
  return descriptor?.value;
}

/** @param {unknown} value @param {string} message */
function filePath(value, message) {
  if (typeof value !== "string" || !value.trim() || value.length > 32768 || value.includes("\0")) throw new TypeError(message);
  const result = path.resolve(value.trim());
  if (result.length > 32768) throw new TypeError(message);
  return result;
}

/** @param {unknown} jobs @returns {BuildJob[]} */
function normalizeBuildJobs(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) throw new TypeError("buildOpenXmlDecks requires at least one job");
  if (jobs.length > 1000) throw new TypeError("buildOpenXmlDecks exceeds the 1000 job boundary");
  /** @type {BuildJob[]} */
  const normalized = [];
  for (let index = 0; index < jobs.length; index += 1) {
    const job = field(jobs, String(index));
    if (!job || typeof job !== "object" || Array.isArray(job)) throw new TypeError(`buildOpenXmlDecks job ${index + 1} is invalid`);
    const message = `buildOpenXmlDecks job ${index + 1} requires irFile and outFile`;
    const irFile = filePath(field(job, "irFile"), message);
    const outFile = filePath(field(job, "outFile"), message);
    const template = field(job, "templatePptx");
    let templatePptx = "";
    if (template != null && template !== "") {
      templatePptx = filePath(template, `buildOpenXmlDecks job ${index + 1} has an invalid templatePptx`);
      let isFile = false;
      try { isFile = fs.statSync(templatePptx).isFile(); }
      catch { /* Report a bounded admission error instead of the underlying path. */ }
      if (!isFile) throw new TypeError(`buildOpenXmlDecks job ${index + 1} template PPTX was not found`);
    }
    normalized.push({ irFile, outFile, templatePptx });
  }
  const inputs = new Set(normalized.flatMap((job) => [job.irFile, job.templatePptx].filter(Boolean).map(pathKey)));
  const outputs = new Set();
  for (const job of normalized) {
    const key = pathKey(job.outFile);
    if (inputs.has(key) || outputs.has(key)) throw new TypeError("buildOpenXmlDecks paths conflict");
    outputs.add(key);
  }
  return normalized;
}

/** @param {string} file */
function pathKey(file) { return process.platform === "win32" ? file.toLowerCase() : file; }

module.exports = { normalizeBuildJobs };
