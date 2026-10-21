// @ts-check
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { readPng } = require("./png");
const { measureTextInkGeometry } = require("./text-ink-geometry");
const { planMeasuredSingleLineTextFit } = require("./measured-text-fit");
const { createReconstructionSearchControl } = require("./reconstruction-search-control");
const {planIntactSourceWordLayouts}=require('./source-word-layout-registry');

/** @typedef {Record<string,unknown> & {id:string,sizeRatio:number,widthRatio:number,heightRatio:number,localMismatchScore:number,segmentGroupId:string|null}} TextChange */
/** @typedef {{rank:number,severity:number}} WorstEvidence */
/** @typedef {{severity:number,pixelDiffRatio:number,foregroundMissingRatio:number}} LocalMetrics */
/** @typedef {{kind:"singleton",id:string,priority:number,severity:number,mismatch:number,rank:number,pageIndex:number,targetId:string,changedTextBoxes:number}} SingletonSpec */
/** @typedef {{kind:"group",id:string,priority:number,severity:number,mismatch:number,rank:number,pageIndex:number,targetIds:string[],validationTargetIds:string[],changedTextBoxes:number}} GroupSpec */
/** @typedef {{kind:"systemic",pageIndex:number,targetIds:string[],validationTargetIds:string[],changedTextBoxes:number}} SystemicSpec */
/** @typedef {{kind:"ranked",candidateLimit:number,changedTextBoxes:number}} RankedSpec */
/** @typedef {{kind:"intact",changedTextBoxes:number}} IntactSpec */
/** @typedef {SingletonSpec|GroupSpec|SystemicSpec|RankedSpec|IntactSpec} CandidateSpec */

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
/** Typography cannot repair a failed source/structure gate after the verifier
 * has already accepted visual fidelity. Preserve the failure, stop font search.
 * @param {Record<string,unknown>} quality */
function visualFidelityPassed(quality){
 const textAttention=[quality.componentWorst,quality.componentLocalMetrics].some(items=>Array.isArray(items)&&items.some(item=>record(item)&&item.kind==='text'&&(item.attention===true||finite(item.severity)&&item.severity>1)));
 return !textAttention&&Array.isArray(quality.checks)&&quality.checks.some(check=>record(check)&&check.name==='visual-fidelity'&&check.passed===true);
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

/** @param {Record<string, unknown>} candidate @param {Record<string, unknown>} baseline @param {boolean} acceptImprovedFailure */
function strictlyImproves(candidate, baseline, acceptImprovedFailure) {
  const candidateMetrics = /** @type {Record<string, unknown>} */ (candidate.metrics);
  const baselineMetrics = /** @type {Record<string, unknown>} */ (baseline.metrics);
  if ((!candidate.passed && (!acceptImprovedFailure || baseline.passed))
    || !PRIMARY_METRICS.every((metric) => /** @type {number} */ (candidateMetrics[metric]) <= /** @type {number} */ (baselineMetrics[metric]))) return false;
  const attention = "component-regions-attention";
  if (finite(candidateMetrics[attention]) && finite(baselineMetrics[attention]) && candidateMetrics[attention] > baselineMetrics[attention]) return false;
  if (acceptImprovedFailure && !candidate.passed) {
    for (const name of [attention, "worst-component-normalized-severity", "worst-component-pixel-diff-ratio", "worst-component-foreground-missing-ratio"]) {
      if (finite(baselineMetrics[name]) && (!finite(candidateMetrics[name]) || candidateMetrics[name] > baselineMetrics[name])) return false;
    }
  }
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

/** @param {number} count */
function candidateLimits(count) {
  if (!Number.isSafeInteger(count) || count < 1) return [];
  const cappedFullSet = Math.min(count, 6);
  const boundedFullSet = count <= 16 ? count : null;
  const limits = [1, 2, 3, cappedFullSet, ...(boundedFullSet === null ? [] : [boundedFullSet])].filter((value) => value <= count);
  return [...new Set(limits.length ? limits : [count])];
}

/** @param {SingletonSpec[]} specs */
function boundedSingletonSpecs(specs) {
  const sorted = [...specs].sort((left, right) => left.priority - right.priority || right.severity - left.severity || right.mismatch - left.mismatch || left.rank - right.rank || left.pageIndex - right.pageIndex || String(left.targetId || left.id).localeCompare(String(right.targetId || right.id)));
  const worst = sorted.filter((spec) => spec.priority === 0).slice(0, 4);
  if (worst.length > 0) return worst;
  return sorted.slice(0, 4);
}

/** @param {unknown} value */
function segmentGroupId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 256 ? value : null;
}

/** @param {Record<string, unknown>} text */
function measuredOcrText(text) {
  const source = record(text.source) ? text.source : null;
  return source?.ocrProvider !== undefined
    || source?.ocrRecoveredFromLineTextCrop === true
    || source?.ocrRecoveredFromNativeLineTextShape === true;
}

/** @param {Record<string, unknown>} change */
function consistentMeasuredGrowth(change) {
  if (!finite(change.sizeRatio) || !finite(change.widthRatio) || !finite(change.heightRatio)) return false;
  const anisotropy = change.widthRatio / change.heightRatio;
  return change.sizeRatio >= 1.08 && change.sizeRatio <= 2.25
    && change.widthRatio >= 1.05 && change.heightRatio >= 1.05
    && anisotropy >= 0.65 && anisotropy <= 1.55;
}

/**
 * Finds complete positioned OCR lines. Incomplete measured groups are not safe
 * to update as a unit because one unchanged segment can create overlaps or gaps.
 * @param {Record<string, unknown>} page
 * @param {Record<string, unknown>[]} changes
 */
function completeSegmentGroups(page, changes) {
  /** @type {Map<string,string[]>} */ const members = new Map();
  for (const item of /** @type {unknown[]} */ (page.textBoxes)) {
    if (!record(item) || typeof item.id !== "string" || !record(item.source)) continue;
    const groupId = segmentGroupId(item.source.segmentedOcrLineId);
    if (groupId === null) continue;
    const ids = members.get(groupId) || [];
    ids.push(item.id);
    members.set(groupId, ids);
  }
  /** @type {Map<string,Record<string,unknown>[]>} */ const changed = new Map();
  for (const change of changes) {
    const groupId = segmentGroupId(change.segmentGroupId);
    if (groupId === null || typeof change.id !== "string") continue;
    const items = changed.get(groupId) || [];
    items.push(change);
    changed.set(groupId, items);
  }
  /** @type {Map<string,Record<string,unknown>[]>} */ const complete = new Map();
  for (const [groupId, groupChanges] of changed) {
    const groupMembers = members.get(groupId);
    if (Array.isArray(groupMembers) && groupMembers.length >= 2 && groupMembers.length === groupChanges.length) {
      complete.set(groupId, groupChanges);
    }
  }
  return complete;
}

/** @param {Record<string, unknown>} page @param {Record<string, unknown>[]} changes */
function systemicGrowthTargetIds(page, changes) {
  const textById = new Map(/** @type {Record<string, unknown>[]} */ (page.textBoxes).map((text) => [text.id, text]));
  const completeGroups = completeSegmentGroups(page, changes);
  const selected = [];
  const selectedGroups = new Set();
  for (const change of changes) {
    if (typeof change.id !== "string" || !consistentMeasuredGrowth(change)) continue;
    const text = textById.get(change.id);
    if (!record(text) || !measuredOcrText(text)) continue;
    const groupId = segmentGroupId(change.segmentGroupId);
    if (groupId === null) {
      selected.push(change.id);
      continue;
    }
    if (selectedGroups.has(groupId)) continue;
    const group = completeGroups.get(groupId);
    if (!group || !group.every((item) => consistentMeasuredGrowth(item))) continue;
    selected.push(...group.map((item) => /** @type {string} */ (item.id)));
    selectedGroups.add(groupId);
  }
  return selected.length >= 8 ? selected : [];
}

/**
 * @param {{page:Record<string,unknown>,changes:Record<string,unknown>[]}[]} measuredPages
 * @param {Map<string,{rank:number,severity:number}>} worstEvidenceById
 * @returns {SystemicSpec[]}
 */
function systemicCandidateSpecs(measuredPages, worstEvidenceById) {
  return measuredPages.flatMap(({ page, changes }, pageIndex) => {
    const targetIds = systemicGrowthTargetIds(page, changes);
    if (targetIds.length < 1) return [];
    const validationTargetIds = targetIds.filter((id) => worstEvidenceById.has(id));
    return [{ kind: "systemic", pageIndex, targetIds, validationTargetIds, changedTextBoxes: targetIds.length }];
  });
}

/**
 * @param {{page:Record<string,unknown>,changes:Record<string,unknown>[]}[]} measuredPages
 * @param {Map<string,{rank:number,severity:number}>} worstEvidenceById
 * @returns {GroupSpec[]}
 */
function segmentedGroupCandidateSpecs(measuredPages, worstEvidenceById) {
  /** @type {GroupSpec[]} */ const specs = measuredPages.flatMap(({ page, changes }, pageIndex) => [...completeSegmentGroups(page, changes).entries()].map(([groupId, groupChanges]) => {
    const ids = groupChanges.map((change) => /** @type {string} */ (change.id));
    const worst = ids.flatMap((id) => {
      const evidence = worstEvidenceById.get(id);
      return evidence ? [evidence] : [];
    });
    return {
      kind: "group",
      id: groupId,
      pageIndex,
      targetIds: ids,
      validationTargetIds: ids,
      changedTextBoxes: ids.length,
      priority: worst.length > 0 ? 0 : Number.MAX_SAFE_INTEGER,
      severity: worst.length > 0 ? Math.max(...worst.map((item) => item.severity)) : 0,
      mismatch: Math.max(...groupChanges.map((change) => finite(change.localMismatchScore) ? change.localMismatchScore : 0)),
      rank: worst.length > 0 ? Math.min(...worst.map((item) => item.rank)) : Number.MAX_SAFE_INTEGER
    };
  }));
  specs.sort((left, right) => left.priority - right.priority || right.severity - left.severity || right.mismatch - left.mismatch || left.rank - right.rank || left.pageIndex - right.pageIndex || left.id.localeCompare(right.id));
  const worst = specs.filter((spec) => spec.priority === 0).slice(0, 4);
  return worst.length > 0 ? worst : specs.slice(0, 2);
}

/** @param {unknown} quality */
function textWorstEvidenceById(quality) {
  /** @type {Map<string,WorstEvidence>} */ const evidence = new Map();
  if (!record(quality) || !Array.isArray(quality.componentWorst)) return evidence;
  for (const item of quality.componentWorst) {
    if (!record(item) || typeof item.id !== "string" || !item.id) continue;
    if (item.kind !== "text" || item.role !== "text") continue;
    const severity = finite(item.severity) ? item.severity : finite(item.normalizedSeverity) ? item.normalizedSeverity : 0;
    if (!evidence.has(item.id)) evidence.set(item.id, { rank: evidence.size, severity });
  }
  return evidence;
}

/** @param {unknown} quality */
function componentWorstById(quality) {
  const result = new Map();
  if (!record(quality) || !Array.isArray(quality.componentWorst)) return result;
  for (const item of quality.componentWorst) {
    if (!record(item) || typeof item.id !== "string" || !item.id || item.kind !== "text" || item.role !== "text") continue;
    const severity = finite(item.severity) ? item.severity : finite(item.normalizedSeverity) ? item.normalizedSeverity : null;
    if (severity === null) continue;
    result.set(item.id, severity);
  }
  return result;
}

/** @param {unknown} quality */
function textLocalMetricsById(quality) {
  const result = new Map();
  if (!record(quality) || !Array.isArray(quality.componentLocalMetrics)) return result;
  for (const item of quality.componentLocalMetrics) {
    if (!record(item) || typeof item.id !== "string" || !item.id || item.kind !== "text" || item.role !== "text") continue;
    const severity = finite(item.severity) ? item.severity : null;
    const pixelDiffRatio = finite(item.pixelDiffRatio) ? item.pixelDiffRatio : null;
    const foregroundMissingRatio = finite(item.foregroundMissingRatio) ? item.foregroundMissingRatio : null;
    if (severity === null || pixelDiffRatio === null || foregroundMissingRatio === null) continue;
    result.set(item.id, { severity, pixelDiffRatio, foregroundMissingRatio });
  }
  return result;
}

/** @param {LocalMetrics} candidate @param {LocalMetrics} baseline */
function localMetricImproves(candidate, baseline) {
  const epsilon = 1e-9;
  if (candidate.severity > baseline.severity + epsilon) return false;
  if (candidate.pixelDiffRatio > baseline.pixelDiffRatio + epsilon) return false;
  if (candidate.foregroundMissingRatio > baseline.foregroundMissingRatio + epsilon) return false;
  return candidate.severity <= baseline.severity - 0.01
    || candidate.pixelDiffRatio <= baseline.pixelDiffRatio - 0.01
    || candidate.foregroundMissingRatio <= baseline.foregroundMissingRatio - 0.01;
}

/**
 * If the baseline verifier named specific edited text as bad, the candidate
 * must improve those same components locally, not just shift unrelated global noise.
 * @param {Record<string, unknown>} candidate
 * @param {Record<string, unknown>} baseline
 * @param {string[]} targetIds
 */
function targetComponentImproves(candidate, baseline, targetIds) {
  if (!Array.isArray(targetIds) || targetIds.length < 1) return true;
  const baselineLocal = textLocalMetricsById(baseline);
  if (baselineLocal.size > 0) {
    const candidateLocal = textLocalMetricsById(candidate);
    const relevantLocal = targetIds.filter((id) => baselineLocal.has(id));
    if (relevantLocal.length > 0) {
      return relevantLocal.every((id) => {
        if (!candidateLocal.has(id)) return false;
        return localMetricImproves(candidateLocal.get(id), baselineLocal.get(id));
      });
    }
  }
  const baselineWorst = componentWorstById(baseline);
  const relevant = targetIds.filter((id) => baselineWorst.has(id));
  if (relevant.length < 1) return true;
  const candidateWorst = componentWorstById(candidate);
  return relevant.every((id) => {
    const before = baselineWorst.get(id);
    if (!candidateWorst.has(id)) return true;
    const after = candidateWorst.get(id);
    return finite(before) && finite(after) && after <= before - 0.01;
  });
}
/** Independent intact proposals need complete local evidence for every edit.
 * Missing local measurements cannot be replaced by an aggregate improvement.
 * @param {Record<string,unknown>} candidate @param {Record<string,unknown>} baseline @param {string[]} ids */
function intactComponentsDoNotRegress(candidate,baseline,ids){
 const before=textLocalMetricsById(baseline),after=textLocalMetricsById(candidate);
 return ids.length>0&&ids.every(id=>{
  const a=before.get(id),b=after.get(id);
  return a&&b&&b.severity<=a.severity+1e-9&&b.pixelDiffRatio<=a.pixelDiffRatio+1e-9&&b.foregroundMissingRatio<=a.foregroundMissingRatio+1e-9;
 });
}

/** @param {Record<string, unknown>} candidate @param {Record<string, unknown>} baseline @param {string[]} targetIds */
function targetComponentProgressivelyImproves(candidate, baseline, targetIds) {
  if (baseline.passed || candidate.passed || !Array.isArray(targetIds) || targetIds.length < 1) return false;
  if (!targetComponentImproves(candidate, baseline, targetIds)) return false;
  const candidateMetrics = /** @type {Record<string, unknown>} */ (candidate.metrics);
  const baselineMetrics = /** @type {Record<string, unknown>} */ (baseline.metrics);
  const pixelDiff = candidateMetrics["pixel-diff-ratio"];
  const baselinePixelDiff = baselineMetrics["pixel-diff-ratio"];
  const foregroundMissing = candidateMetrics["foreground-missing-ratio"];
  const baselineForegroundMissing = baselineMetrics["foreground-missing-ratio"];
  const meanDelta = candidateMetrics["mean-absolute-delta"];
  const baselineMeanDelta = baselineMetrics["mean-absolute-delta"];
  if (!finite(pixelDiff) || !finite(baselinePixelDiff) || pixelDiff > baselinePixelDiff + 1e-9) return false;
  if (!finite(foregroundMissing) || !finite(baselineForegroundMissing) || foregroundMissing > baselineForegroundMissing + 1e-9) return false;
  if (!finite(meanDelta) || !finite(baselineMeanDelta) || meanDelta > baselineMeanDelta + 0.05) return false;
  for (const name of ["component-regions-attention", "worst-component-normalized-severity", "worst-component-pixel-diff-ratio", "worst-component-foreground-missing-ratio"]) {
    if (finite(baselineMetrics[name]) && (!finite(candidateMetrics[name]) || candidateMetrics[name] > baselineMetrics[name] + 1e-9)) return false;
  }
  return true;
}

/**
 * Attempts one conservative, measurement-backed text refinement and retains it only when rendered fidelity strictly improves.
 * @param {unknown} input
 * @returns {Promise<{deck:unknown,deckFile:unknown,pptxFile:unknown,quality:unknown,accepted:boolean,changedTextBoxes:number,skippedPixelBudget:number}>}
 */
async function refineRenderedTextOnce(input) {
  if (!record(input)) throw new TypeError("text refinement request is invalid");
  if(input.searchControl!==undefined&&typeof input.searchControl!=="boolean"||input.onSearchDecision!==undefined&&typeof input.onSearchDecision!=="function")
    throw new TypeError("text refinement search policy is invalid");
  if (input.acceptImprovedFailure !== undefined && typeof input.acceptImprovedFailure !== "boolean") {
    throw new TypeError("text refinement improvement policy is invalid");
  }
  const candidateSpecLimit = input.candidateSpecLimit === undefined ? null : Number(input.candidateSpecLimit);
  if (candidateSpecLimit !== null && (!Number.isSafeInteger(candidateSpecLimit) || candidateSpecLimit < 1 || candidateSpecLimit > 32)) {
    throw new TypeError("text refinement candidate limit is invalid");
  }
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
  if (baseline.passed||visualFidelityPassed(baseline)) return base;

  const sourceFiles = sources.map((file) => regularFile(file, workspace, "source image", MAX_IMAGE_BYTES));
  const renderedFiles = rendered.map((file) => regularFile(file, workspace, "rendered image", MAX_IMAGE_BYTES));
  const totalPixels = imagePairPixels(sourceFiles, renderedFiles);
  if (totalPixels > MAX_TOTAL_PIXELS) {
    return {...base, skippedPixelBudget: totalPixels};
  }
  /** @type {{page: Record<string, unknown>, measurements: unknown[], changes: TextChange[]}[]} */
  const measuredPages = [];
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
    measuredPages.push({ page, measurements: geometry.measurements, changes: plan.changes });
    await cancelled(isCancellationRequested);
  }
  const intactPlans=pages.map(page=>planIntactSourceWordLayouts({textBoxes:/** @type {Record<string,unknown>[]} */(page.textBoxes)}));
  const intactChanges=intactPlans.reduce((sum,plan)=>sum+plan.changes.length,0);
  if (changedTextBoxes === 0&&intactChanges===0) return base;

  const limits = candidateLimits(changedTextBoxes);
  const worstEvidenceById = textWorstEvidenceById(baseline);
  /** @type {SingletonSpec[]} */ const singletonSpecs = measuredPages.flatMap((page, pageIndex) => page.changes.map((change) => {
    const evidence = worstEvidenceById.get(change.id);
    return {
      kind: /** @type {const} */ ("singleton"),
      pageIndex,
      targetId: change.id,
      id: change.id,
      changedTextBoxes: 1,
      priority: evidence ? 0 : Number.MAX_SAFE_INTEGER,
      severity: evidence?.severity ?? 0,
      mismatch: finite(change.localMismatchScore) ? change.localMismatchScore : 0,
      rank: evidence?.rank ?? Number.MAX_SAFE_INTEGER
    };
  }).filter((spec) => segmentGroupId(measuredPages[spec.pageIndex]?.changes.find((change) => change.id === spec.id)?.segmentGroupId) === null));
  /** @type {CandidateSpec[]} */ const allCandidateSpecs = [
    ...(intactChanges?[{kind:/** @type {const} */('intact'),changedTextBoxes:intactChanges}]:[]),
    ...systemicCandidateSpecs(measuredPages, worstEvidenceById),
    ...segmentedGroupCandidateSpecs(measuredPages, worstEvidenceById),
    ...boundedSingletonSpecs(singletonSpecs),
    ...limits.map((limit) => ({ kind: /** @type {const} */ ("ranked"), candidateLimit: limit, changedTextBoxes: limit }))
  ];
  const candidateSpecs = candidateSpecLimit === null ? allCandidateSpecs : allCandidateSpecs.slice(0, candidateSpecLimit);
  const searchMetrics=(/** @type {Record<string,unknown>} */q)=>{const m=/** @type {Record<string,number>} */(q.metrics);return {pdr:m["pixel-diff-ratio"]??1,missing:m["foreground-missing-ratio"]??1,mad:m["mean-absolute-delta"]??255,layout:0,style:0};};
  const search=input.searchControl===true?createReconstructionSearchControl({baseline:searchMetrics(baseline),
    baselineHash:crypto.createHash("sha256").update(JSON.stringify(deck)).digest("hex"),families:[...new Set(candidateSpecs.map(s=>s.kind))]}):null;
  /** @type {{deck: unknown, deckFile: string, pptxFile: string, quality: unknown, changedTextBoxes: number, owned: string[]} | null} */
  let best = null;
  /** @type {string[]} */
  let currentOwned = [];
  try {
    for (const spec of candidateSpecs) {
      await cancelled(isCancellationRequested);
      /** @type {string[]} */
      const candidateTargetIds = [];
      const candidatePages = measuredPages.map(({ page, measurements }, pageIndex) => {
        if(spec.kind==='intact'){
          const plan=intactPlans[pageIndex];
          if(!plan)throw new Error('source word candidate page is inconsistent');
          candidateTargetIds.push(...plan.changes.map(change=>change.id));
          return {...page,textBoxes:plan.textBoxes};
        }
        const singleton = spec.kind === "singleton" && spec.pageIndex === pageIndex ? [spec.targetId] : null;
        const targeted = (spec.kind === "systemic" || spec.kind === "group") && spec.pageIndex === pageIndex ? spec.targetIds : null;
        const plan = spec.kind === "singleton"
          ? (singleton ? planMeasuredSingleLineTextFit({ slideSize: /** @type {Record<string, unknown>} */ (deck).slideSize, textBoxes: page.textBoxes, measurements, targetIds: singleton }) : { textBoxes: page.textBoxes, changes: /** @type {TextChange[]} */ ([]) })
          : spec.kind === "systemic" || spec.kind === "group"
            ? (targeted ? planMeasuredSingleLineTextFit({ slideSize: /** @type {Record<string, unknown>} */ (deck).slideSize, textBoxes: page.textBoxes, measurements, targetIds: targeted }) : { textBoxes: page.textBoxes, changes: /** @type {TextChange[]} */ ([]) })
            : planMeasuredSingleLineTextFit({ slideSize: /** @type {Record<string, unknown>} */ (deck).slideSize, textBoxes: page.textBoxes, measurements, candidateLimit: spec.candidateLimit });
        if (Array.isArray(plan.changes)) {
          const validationIds = new Set(spec.kind === "systemic" || spec.kind === "group" ? spec.validationTargetIds
            : spec.kind === "ranked" && spec.candidateLimit !== 1 ? []
              : plan.changes.map((change) => change?.id));
          for (const change of plan.changes) if (change && typeof change.id === "string" && change.id && validationIds.has(change.id)) candidateTargetIds.push(change.id);
        }
        return { ...page, textBoxes: plan.textBoxes };
      });
      const candidateDeck = { .../** @type {Record<string, unknown>} */ (deck), pages: candidatePages };
      const candidateHash=crypto.createHash("sha256").update(JSON.stringify(candidateDeck)).digest("hex");
      if(search&&!search.prepare({family:spec.kind,hash:candidateHash}).render)continue;
      const token = crypto.randomUUID();
      const candidateDeckFile = path.join(workspace.root, `text-refinement-${token}.json`);
      const candidatePptxFile = path.join(workspace.root, `text-refinement-${token}.pptx`);
      /** @type {string[]} */
      const owned = [];
      currentOwned = owned;
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
      const acceptsBaseline = spec.kind==='intact'
        ? strictlyImproves(candidateQuality,baseline,input.acceptImprovedFailure===true)&&intactComponentsDoNotRegress(candidateQuality,baseline,candidateTargetIds)
        : (strictlyImproves(candidateQuality, baseline, input.acceptImprovedFailure === true)
        && targetComponentImproves(candidateQuality, baseline, candidateTargetIds))
        || (input.acceptImprovedFailure === true && targetComponentProgressivelyImproves(candidateQuality, baseline, candidateTargetIds));
      const improvesBest = best === null || strictlyImproves(candidateQuality, /** @type {Record<string, unknown>} */ (best.quality), input.acceptImprovedFailure === true);
      const searchDecision=search?.complete({hash:candidateHash,metrics:searchMetrics(candidateQuality),hardFailures:Number(!acceptsBaseline),strictPassed:acceptsBaseline&&candidateQuality.passed});
      if (acceptsBaseline && improvesBest) {
        if (best) cleanup(best.owned, workspace, undefined);
        best = { deck: candidateDeck, deckFile: candidateDeckFile, pptxFile: candidatePptxFile, quality: candidateQuality, changedTextBoxes: spec.changedTextBoxes, owned };
        currentOwned = [];
        if(visualFidelityPassed(candidateQuality))break;
      } else {
        cleanup(owned, workspace, undefined);
        currentOwned = [];
      }
      if(searchDecision?.action.startsWith("stop-"))break;
    }
    if(search&&typeof input.onSearchDecision==="function")input.onSearchDecision(search.snapshot());
    if (best) return { deck: best.deck, deckFile: best.deckFile, pptxFile: best.pptxFile, quality: best.quality, accepted: true, changedTextBoxes: best.changedTextBoxes, skippedPixelBudget: 0 };
    return { ...base, changedTextBoxes };
  } catch (error) {
    cleanup(currentOwned, workspace, undefined);
    if (best) cleanup(best.owned, workspace, error);
    else cleanup([], workspace, error);
    throw error;
  }
}

module.exports = { refineRenderedTextOnce };
