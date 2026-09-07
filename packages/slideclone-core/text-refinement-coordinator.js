// @ts-check
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { readPng } = require("./png");
const { measureTextInkGeometry } = require("./text-ink-geometry");
const { planMeasuredSingleLineTextFit } = require("./measured-text-fit");

const MAX_PAGES = 20;
const MAX_TEXT_BOXES_PER_PAGE = 2000;
const MAX_IMAGE_BYTES = 60 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_TOTAL_PIXELS = 80_000_000;
const MAX_PPTX_BYTES = 512 * 1024 * 1024;
const PRIMARY_METRICS = Object.freeze(["pixel-diff-ratio", "foreground-missing-ratio", "mean-absolute-delta"]);
const PNG_HEADER_BYTES = 24;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }
/** @param {string} root @param {string} candidate @returns {boolean} */
function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** @param {unknown} value @returns {{root:string, real:string}} */
function workspaceRoot(value) {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw new TypeError("text refinement root is invalid");
  const root = path.resolve(value);
  const info = fs.lstatSync(root);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("text refinement root is invalid");
  const real = fs.realpathSync.native(root);
  const realInfo = fs.lstatSync(real);
  if (!realInfo.isDirectory() || realInfo.isSymbolicLink()) throw new Error("text refinement root is invalid");
  return { root, real };
}

/** @param {unknown} value @param {{root:string,real:string}} workspace @param {string} name @param {number} maximum */
function regularFile(value, workspace, name, maximum) {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw new TypeError(`text refinement ${name} is invalid`);
  const candidate = path.resolve(value);
  if (!inside(workspace.root, candidate)) throw new Error(`text refinement ${name} is outside the root`);
  const info = fs.lstatSync(candidate);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > maximum) throw new Error(`text refinement ${name} is invalid`);
  const real = fs.realpathSync.native(candidate);
  if (!inside(workspace.real, real)) throw new Error(`text refinement ${name} is outside the root`);
  const realInfo = fs.lstatSync(real);
  if (!realInfo.isFile() || realInfo.isSymbolicLink()) throw new Error(`text refinement ${name} is invalid`);
  return candidate;
}

/** @param {unknown} value @param {string} name @returns {unknown[]} */
function boundedArray(value, name) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_PAGES) throw new TypeError(`text refinement ${name} is invalid`);
  return value;
}

/** @param {unknown} value @returns {Record<string, unknown>[]} */
function deckPages(value) {
  if (!record(value)) throw new TypeError("text refinement deck is invalid");
  const pages = boundedArray(value.pages, "deck pages");
  /** @type {Record<string, unknown>[]} */
  const result = [];
  for (const page of pages) {
    if (!record(page) || !Array.isArray(page.textBoxes) || page.textBoxes.length > MAX_TEXT_BOXES_PER_PAGE) {
      throw new TypeError("text refinement deck page is invalid");
    }
    result.push(page);
  }
  return result;
}

/** @param {unknown} value @param {string} name */
function callback(value, name) {
  if (typeof value !== "function") throw new TypeError(`text refinement ${name} is invalid`);
  return value;
}

/** @param {unknown} quality @param {string} name */
function qualityReport(quality, name) {
  if (!record(quality) || typeof quality.passed !== "boolean" || !Array.isArray(quality.checks) || quality.checks.length < 1 || !record(quality.metrics)) {
    throw new TypeError(`text refinement ${name} quality is invalid`);
  }
  const rendered = quality.checks.some((check) => record(check) && check.name === "quality-rendered" && check.passed === true);
  const metrics = quality.metrics;
  if (!rendered || !finite(metrics["pixel-diff-ratio"]) || metrics["pixel-diff-ratio"] < 0 || metrics["pixel-diff-ratio"] > 1
    || !finite(metrics["foreground-missing-ratio"]) || metrics["foreground-missing-ratio"] < 0 || metrics["foreground-missing-ratio"] > 1
    || !finite(metrics["mean-absolute-delta"]) || metrics["mean-absolute-delta"] < 0 || metrics["mean-absolute-delta"] > 255
    || (quality.passed && !quality.checks.every((check) => record(check) && check.passed === true))) {
    throw new TypeError(`text refinement ${name} quality is invalid`);
  }
  return quality;
}

/** Read only the fixed PNG header needed to retain malformed geometry as a hard failure.
 * @param {string} file */
function imagePixelsFromHeader(file) {
  const descriptor = fs.openSync(file, "r");
  try {
    const header = Buffer.alloc(PNG_HEADER_BYTES);
    if (fs.readSync(descriptor, header, 0, header.length, 0) !== header.length
      || !header.subarray(0, 8).equals(PNG_SIGNATURE)
      || header.readUInt32BE(8) !== 13
      || header.toString("ascii", 12, 16) !== "IHDR") {
      throw new Error("text refinement image header is invalid");
    }
    const width = header.readUInt32BE(16), height = header.readUInt32BE(20);
    const pixels = width * height;
    if (!Number.isSafeInteger(pixels) || width < 1 || height < 1 || pixels > MAX_IMAGE_PIXELS) {
      throw new RangeError("text refinement image dimensions exceed the processing boundary");
    }
    return pixels;
  } finally {
    fs.closeSync(descriptor);
  }
}

/** @param {string[]} sourceFiles @param {string[]} renderedFiles */
function imagePairPixels(sourceFiles, renderedFiles) {
  let totalPixels = 0;
  for (const file of [...sourceFiles, ...renderedFiles]) totalPixels += imagePixelsFromHeader(file);
  return totalPixels;
}

/** @param {Record<string, unknown>} candidate @param {Record<string, unknown>} baseline */
function strictlyImproves(candidate, baseline) {
  const candidateMetrics = /** @type {Record<string, unknown>} */ (candidate.metrics);
  const baselineMetrics = /** @type {Record<string, unknown>} */ (baseline.metrics);
  if (!candidate.passed || !PRIMARY_METRICS.every((metric) => /** @type {number} */ (candidateMetrics[metric]) <= /** @type {number} */ (baselineMetrics[metric]))) return false;
  const attention = "component-regions-attention";
  if (finite(candidateMetrics[attention]) && finite(baselineMetrics[attention]) && candidateMetrics[attention] > baselineMetrics[attention]) return false;
  return PRIMARY_METRICS.some((metric) => /** @type {number} */ (candidateMetrics[metric]) < /** @type {number} */ (baselineMetrics[metric]))
    || (finite(candidateMetrics[attention]) && finite(baselineMetrics[attention]) && candidateMetrics[attention] < baselineMetrics[attention]);
}

/** @param {unknown} isCancellationRequested */
async function cancelled(isCancellationRequested) {
  if (await /** @type {() => Promise<unknown>} */ (isCancellationRequested)()) throw new Error("editable job was cancelled");
}

/** @param {string} file @param {{root:string,real:string}} workspace */
function removeOwnedFile(file, workspace) {
  try {
    if (!inside(workspace.root, file)) return new Error("text refinement cleanup target is outside the root");
    const info = fs.lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink()) return new Error("text refinement cleanup target was replaced");
    const real = fs.realpathSync.native(file);
    if (!inside(workspace.real, real)) return new Error("text refinement cleanup target was replaced");
    fs.unlinkSync(file);
    return null;
  } catch (error) {
    if (record(error) && error.code === "ENOENT") return null;
    return error;
  }
}

/** @param {string[]} files @param {{root:string,real:string}} workspace @param {unknown} cause */
function cleanup(files, workspace, cause) {
  /** @type {unknown[]} */
  const errors = [];
  for (const file of files) {
    const error = removeOwnedFile(file, workspace);
    if (error) errors.push(error);
  }
  if (errors.length) throw new AggregateError(cause === undefined ? errors : [cause, ...errors], "text refinement cleanup failed");
}

/**
 * Attempts one conservative, measurement-backed text refinement and retains it only when rendered fidelity strictly improves.
 * @param {unknown} input
 * @returns {Promise<{deck:unknown,deckFile:unknown,pptxFile:unknown,quality:unknown,accepted:boolean,changedTextBoxes:number,skippedPixelBudget:number}>}
 */
async function refineRenderedTextOnce(input) {
  if (!record(input)) throw new TypeError("text refinement request is invalid");
  const workspace = workspaceRoot(input.root);
  const deck = input.deck;
  const pages = deckPages(deck);
  const deckFile = regularFile(input.deckFile, workspace, "deck file", MAX_IMAGE_BYTES);
  const pptxFile = regularFile(input.pptxFile, workspace, "PPTX file", MAX_PPTX_BYTES);
  const sources = boundedArray(input.sourceImages, "source images");
  const rendered = boundedArray(input.renderedImages, "rendered images");
  if (sources.length !== pages.length || rendered.length !== pages.length) throw new TypeError("text refinement image page counts are invalid");
  const buildCandidate = callback(input.buildCandidate, "candidate builder");
  const verifyCandidate = callback(input.verifyCandidate, "candidate verifier");
  const isCancellationRequested = callback(input.isCancellationRequested, "cancellation callback");
  const baseline = qualityReport(input.initialQuality, "initial");
  const base = { deck, deckFile, pptxFile, quality: input.initialQuality, accepted: false, changedTextBoxes: 0, skippedPixelBudget: 0 };
  await cancelled(isCancellationRequested);
  if (baseline.passed) return base;

  const sourceFiles = sources.map((file) => regularFile(file, workspace, "source image", MAX_IMAGE_BYTES));
  const renderedFiles = rendered.map((file) => regularFile(file, workspace, "rendered image", MAX_IMAGE_BYTES));
  const totalPixels = imagePairPixels(sourceFiles, renderedFiles);
  if (totalPixels > MAX_TOTAL_PIXELS) {
    return {...base, skippedPixelBudget: totalPixels};
  }
  /** @type {Record<string, unknown>[]} */
  const candidatePages = [];
  let changedTextBoxes = 0;
  for (let index = 0; index < pages.length; index += 1) {
    await cancelled(isCancellationRequested);
    const sourceFile = sourceFiles[index], renderedFile = renderedFiles[index], page = pages[index];
    if (sourceFile === undefined || renderedFile === undefined || page === undefined) throw new Error("text refinement page inputs are inconsistent");
    const sourceImage = readPng(sourceFile, { maxFileBytes: MAX_IMAGE_BYTES, maxPixels: MAX_IMAGE_PIXELS });
    const renderedImage = readPng(renderedFile, { maxFileBytes: MAX_IMAGE_BYTES, maxPixels: MAX_IMAGE_PIXELS });
    await cancelled(isCancellationRequested);
    const geometry = measureTextInkGeometry({ slideSize: /** @type {Record<string, unknown>} */ (deck).slideSize, textBoxes: page.textBoxes, sourceImage, renderedImage });
    const plan = planMeasuredSingleLineTextFit({ slideSize: /** @type {Record<string, unknown>} */ (deck).slideSize, textBoxes: page.textBoxes, measurements: geometry.measurements });
    changedTextBoxes += plan.changes.length;
    candidatePages.push({ ...page, textBoxes: plan.textBoxes });
    await cancelled(isCancellationRequested);
  }
  if (changedTextBoxes === 0) return base;

  const candidateDeck = { .../** @type {Record<string, unknown>} */ (deck), pages: candidatePages };
  const token = crypto.randomUUID();
  const candidateDeckFile = path.join(workspace.root, `text-refinement-${token}.json`);
  const candidatePptxFile = path.join(workspace.root, `text-refinement-${token}.pptx`);
  /** @type {string[]} */
  const owned = [];
  try {
    await cancelled(isCancellationRequested);
    fs.writeFileSync(candidateDeckFile, `${JSON.stringify(candidateDeck)}\n`, { encoding: "utf8", flag: "wx" });
    owned.push(candidateDeckFile);
    await cancelled(isCancellationRequested);
    fs.closeSync(fs.openSync(candidatePptxFile, "wx"));
    owned.push(candidatePptxFile);
    await buildCandidate({ deckFile: candidateDeckFile, pptxFile: candidatePptxFile });
    await cancelled(isCancellationRequested);
    regularFile(candidatePptxFile, workspace, "candidate PPTX file", MAX_PPTX_BYTES);
    await cancelled(isCancellationRequested);
    const candidateReport = await verifyCandidate({ deck: candidateDeck, pptxFile: candidatePptxFile });
    await cancelled(isCancellationRequested);
    const candidateQuality = qualityReport(candidateReport, "candidate");
    if (strictlyImproves(candidateQuality, baseline)) {
      return { deck: candidateDeck, deckFile: candidateDeckFile, pptxFile: candidatePptxFile, quality: candidateQuality, accepted: true, changedTextBoxes, skippedPixelBudget: 0 };
    }
    cleanup(owned, workspace, undefined);
    return { ...base, changedTextBoxes };
  } catch (error) {
    cleanup(owned, workspace, error);
    throw error;
  }
}

module.exports = { refineRenderedTextOnce };
