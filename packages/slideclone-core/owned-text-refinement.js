// @ts-check
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { types } = require("node:util");
const { planOwnedTextWarpFit, textProbeRevision } = require("./owned-text-advance");
const { isOwnedTextEligible } = require("./owned-text-eligibility");
const { ownedTextTargetWindow } = require("./owned-text-target-window");

const MAX_PAGES = 20;
const MAX_TEXT_BOXES_PER_PAGE = 2000;
const MAX_DECK_BYTES = 64 * 1024 * 1024;
const MAX_IMAGE_BYTES = 60 * 1024 * 1024;
const MAX_PPTX_BYTES = 512 * 1024 * 1024;
const HASH_CHUNK_BYTES = 64 * 1024;
const LOCAL_EPSILON = 1e-9;

/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {Record<string,unknown> & {textBoxes:unknown[]}} DeckPage */
/** @typedef {Record<string,unknown> & {pages:DeckPage[],slideSize:unknown}} Deck */
/** @typedef {{pageIndex:number,id:string,box:Box}} TextTarget */
/** @typedef {TextTarget & {contributionScore:number,textRevision:string,sourceHash:string}} RankedTarget */
/** @typedef {{severity:number,pixelDiffRatio:number,foregroundMissingRatio:number}} LocalMetric */
/** @typedef {{root:string,real:string}} Workspace */
/** @typedef {{id:string,textId:string,textRevision:string}} GlyphOwner */
/** @typedef {{probeOwnedTexts:Function,validateDeck:Function,auditSemantic:Function,qualityAcceptable:Function,prepareSourceTargets?:(input:unknown)=>Promise<unknown>,planTextFit?:(input:unknown)=>{textBoxes:unknown[],changes:{id:string}[]}}} Dependencies */

/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !types.isProxy(value)
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(item => "value" in item);
}
/** @param {unknown} value @returns {value is unknown[]} */
function dataArray(value) {
  return Array.isArray(value) && !types.isProxy(value)
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(item => "value" in item);
}
/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }
/** @param {string} root @param {string} candidate */
function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** @param {unknown} value @returns {Workspace} */
function workspaceRoot(value) {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw new TypeError("owned text refinement root is invalid");
  const root = path.resolve(value), info = fs.lstatSync(root);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("owned text refinement root is invalid");
  const real = fs.realpathSync.native(root), realInfo = fs.lstatSync(real);
  if (!realInfo.isDirectory() || realInfo.isSymbolicLink()) throw new Error("owned text refinement root is invalid");
  return { root, real };
}

/** @param {unknown} value @param {Workspace} workspace @param {string} name @param {number} maximum */
function regularFile(value, workspace, name, maximum) {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw new TypeError(`owned text refinement ${name} is invalid`);
  const candidate = path.resolve(value);
  if (!inside(workspace.root, candidate)) throw new Error(`owned text refinement ${name} is outside the root`);
  const info = fs.lstatSync(candidate);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > maximum) {
    throw new Error(`owned text refinement ${name} is invalid`);
  }
  const real = fs.realpathSync.native(candidate), realInfo = fs.lstatSync(real);
  if (!inside(workspace.real, real) || !realInfo.isFile() || realInfo.isSymbolicLink()) {
    throw new Error(`owned text refinement ${name} is outside the root`);
  }
  return candidate;
}

/** @param {string} file @param {number} maximum */
function sha256File(file, maximum) {
  const descriptor = fs.openSync(file, "r");
  try {
    const before = fs.fstatSync(descriptor);
    if (!before.isFile() || before.size < 1 || before.size > maximum) throw new Error("owned text refinement hash input is invalid");
    const hash = crypto.createHash("sha256"), buffer = Buffer.allocUnsafe(HASH_CHUNK_BYTES);
    let position = 0;
    while (position < before.size) {
      const bytes = fs.readSync(descriptor, buffer, 0, Math.min(buffer.length, before.size - position), position);
      if (bytes < 1) throw new Error("owned text refinement hash input changed");
      hash.update(buffer.subarray(0, bytes));
      position += bytes;
    }
    const after = fs.fstatSync(descriptor);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error("owned text refinement hash input changed");
    return hash.digest("hex");
  } finally {
    fs.closeSync(descriptor);
  }
}

/** @param {unknown} value @returns {DeckPage[]} */
function deckPages(value) {
  if (!record(value) || !record(value.slideSize) || !Array.isArray(value.pages)
    || value.pages.length < 1 || value.pages.length > MAX_PAGES) throw new TypeError("owned text refinement deck is invalid");
  /** @type {DeckPage[]} */ const pages = [];
  for (const page of value.pages) {
    if (!record(page) || !Array.isArray(page.textBoxes) || page.textBoxes.length > MAX_TEXT_BOXES_PER_PAGE) {
      throw new TypeError("owned text refinement page is invalid");
    }
    pages.push(/** @type {DeckPage} */ (page));
  }
  return pages;
}

/** @param {unknown} value @param {string} name */
function callback(value, name) {
  if (typeof value !== "function") throw new TypeError(`owned text refinement ${name} is invalid`);
  return value;
}

/** @param {unknown} value @param {number} pageCount @param {string} name */
function pageFiles(value, pageCount, name) {
  if (!Array.isArray(value) || value.length !== pageCount) throw new TypeError(`owned text refinement ${name} are invalid`);
  return value;
}

/** @param {unknown} value @returns {Box} */
function box(value) {
  if (!record(value) || !finite(value.x) || !finite(value.y) || !finite(value.w) || !finite(value.h)
    || value.x < 0 || value.y < 0 || value.w <= 0 || value.h <= 0) throw new TypeError("owned text refinement ROI is invalid");
  return { x: value.x, y: value.y, w: value.w, h: value.h };
}

/** @param {unknown} value */
function rendererSignature(value) {
  if (!record(value) || !["render-libreoffice", "render-powerpoint-com"].includes(String(value.rendererId))
    || typeof value.version !== "string" || !value.version || value.version.length > 128
    || !finite(value.dpi) || value.dpi < 16 || value.dpi > 600
    || !finite(value.pixelWidth) || !finite(value.pixelHeight)
    || !Number.isSafeInteger(value.pixelWidth) || !Number.isSafeInteger(value.pixelHeight)
    || value.pixelWidth < 1 || value.pixelHeight < 1 || value.pixelWidth > 16384 || value.pixelHeight > 16384
    || value.pixelWidth * value.pixelHeight > 40_000_000
    || typeof value.runtimeHash !== "string" || !/^[a-f0-9]{64}$/u.test(value.runtimeHash)
    || typeof value.sourceHash !== "string" || !/^[a-f0-9]{64}$/u.test(value.sourceHash)) {
    throw new TypeError("owned text refinement renderer profile is invalid");
  }
  return JSON.stringify([value.rendererId, value.version, value.dpi, value.runtimeHash]);
}

/** @param {unknown} value @param {number} pageIndex @param {string} sourceHash @param {string[]} targetIds */
function probeResult(value, pageIndex, sourceHash, targetIds) {
  if (!record(value) || value.pageIndex !== pageIndex || value.sourceHash !== sourceHash
    || !record(value.renderProfile) || value.renderProfile.sourceHash !== sourceHash
    || !Array.isArray(value.measurements) || value.measurements.length > MAX_TEXT_BOXES_PER_PAGE) {
    throw new TypeError("owned text refinement probe result is invalid");
  }
  const allowed = new Set(targetIds);
  for (const measurement of value.measurements) {
    if (!record(measurement) || typeof measurement.id !== "string" || !allowed.has(measurement.id)) {
      throw new TypeError("owned text refinement probe target is invalid");
    }
  }
  const signature = rendererSignature(value.renderProfile);
  const glyphValues = value.ownedGlyphShapes === undefined ? [] : value.ownedGlyphShapes;
  if (!Array.isArray(glyphValues) || glyphValues.length > 128) throw new TypeError("owned text refinement glyph ownership is invalid");
  /** @type {GlyphOwner[]} */ const ownedGlyphShapes = [];
  const seen = new Set();
  for (const entry of glyphValues) {
    if (!record(entry) || typeof entry.id !== "string" || !entry.id || entry.id.length > 256 || seen.has(entry.id)
      || typeof entry.textId !== "string" || !allowed.has(entry.textId)
      || typeof entry.textRevision !== "string" || !/^[a-f0-9]{64}$/u.test(entry.textRevision)) {
      throw new TypeError("owned text refinement glyph ownership is invalid");
    }
    seen.add(entry.id);
    ownedGlyphShapes.push({ id: entry.id, textId: entry.textId, textRevision: entry.textRevision });
  }
  return { renderProfile: value.renderProfile, measurements: value.measurements, signature, ownedGlyphShapes };
}

/** @param {unknown} quality @param {DeckPage[]} pages @param {string[]} sourceHashes @param {unknown} history @param {Set<string>|null} ready */
function rankedTargets(quality, pages, sourceHashes, history, ready) {
  if (!record(quality) || !Array.isArray(quality.componentLocalMetrics) || quality.componentLocalMetrics.length > 5000) {
    throw new TypeError("owned text refinement target metrics are invalid");
  }
  /** @type {RankedTarget[]} */ const targets = [];
  const seen = new Set();
  for (const row of quality.componentLocalMetrics) {
    if (!record(row)) throw new TypeError("owned text refinement target metrics are invalid");
    if (row.kind !== "text" || row.role !== "text" || row.sufficientEvidence !== true) continue;
    if (typeof row.pageIndex !== "number" || !Number.isSafeInteger(row.pageIndex) || row.pageIndex < 0 || row.pageIndex >= pages.length
      || typeof row.id !== "string" || !row.id || row.id.length > 256
      || !finite(row.contributionScore) || row.contributionScore < 0) {
      throw new TypeError("owned text refinement target metric is invalid");
    }
    const pageIndex = row.pageIndex, id = row.id, contributionScore = row.contributionScore;
    const key = `${pageIndex}:${id}`;
    if (seen.has(key)) throw new TypeError("owned text refinement target metrics are ambiguous");
    seen.add(key);
    const page = pages[pageIndex], text = page?.textBoxes.find((/** @type {unknown} */ item) => record(item) && item.id === id);
    if (!isOwnedTextEligible(text) || (ready && !ready.has(key))) continue;
    targets.push({ pageIndex, id, box: box(text.box), contributionScore,
      textRevision: textProbeRevision(text), sourceHash: sourceHashes[pageIndex] ?? "" });
  }
  return ownedTextTargetWindow(targets.sort((left, right) => right.contributionScore - left.contributionScore
    || left.pageIndex - right.pageIndex || left.id.localeCompare(right.id)), history);
}

/** @param {unknown} result */
function semanticPassed(result) {
  if (!record(result) || typeof result.passed !== "boolean") throw new TypeError("owned text refinement semantic audit is invalid");
  return result.passed;
}

/** @param {unknown} quality @param {TextTarget[]} targets @param {string} name */
function targetMetrics(quality, targets, name) {
  if (!record(quality) || !Array.isArray(quality.componentLocalMetrics) || quality.componentLocalMetrics.length > 5000) {
    throw new TypeError(`owned text refinement ${name} local metrics are invalid`);
  }
  const wanted = new Set(targets.map(target => `${target.pageIndex}:${target.id}`));
  /** @type {Map<string,LocalMetric>} */ const found = new Map();
  for (const row of quality.componentLocalMetrics) {
    if (!record(row)) throw new TypeError(`owned text refinement ${name} local metrics are invalid`);
    if (!Number.isSafeInteger(row.pageIndex) || typeof row.id !== "string") continue;
    const key = `${row.pageIndex}:${row.id}`;
    if (!wanted.has(key) || row.kind !== "text" || row.role !== "text") continue;
    if (found.has(key) || row.sufficientEvidence !== true || !finite(row.severity) || row.severity < 0 || row.severity > 10
      || !finite(row.pixelDiffRatio) || row.pixelDiffRatio < 0 || row.pixelDiffRatio > 1
      || !finite(row.foregroundMissingRatio) || row.foregroundMissingRatio < 0 || row.foregroundMissingRatio > 1) {
      throw new TypeError(`owned text refinement ${name} local metrics are invalid`);
    }
    found.set(key, { severity: row.severity, pixelDiffRatio: row.pixelDiffRatio,
      foregroundMissingRatio: row.foregroundMissingRatio });
  }
  if (found.size !== wanted.size) throw new TypeError(`owned text refinement ${name} local metrics are incomplete`);
  return found;
}

/** @param {Map<string,LocalMetric>} baseline @param {unknown} quality @param {TextTarget[]} targets */
function regressedTargets(baseline, quality, targets) {
  const candidate = targetMetrics(quality, targets, "candidate");
  return new Set(targets.filter(target => {
    const key = `${target.pageIndex}:${target.id}`, before = baseline.get(key), after = candidate.get(key);
    if (!before || !after) throw new TypeError("owned text refinement local metrics are incomplete");
    return after.severity > before.severity + LOCAL_EPSILON
      || after.pixelDiffRatio > before.pixelDiffRatio + LOCAL_EPSILON
      || after.foregroundMissingRatio > before.foregroundMissingRatio + LOCAL_EPSILON;
  }).map(target => `${target.pageIndex}:${target.id}`));
}

/** @param {Deck} candidate @param {Deck} original @param {Set<string>} rejected @param {Map<string,string>} glyphOwners */
function rollbackTargets(candidate, original, rejected, glyphOwners) {
  const next = structuredClone(candidate);
  for (const [pageIndex, page] of next.pages.entries()) {
    const originalPage = original.pages[pageIndex];
    if (!originalPage) throw new TypeError("owned text refinement rollback page is invalid");
    const originals = new Map(originalPage.textBoxes.filter(record).map(text => [String(text.id), text]));
    page.textBoxes = page.textBoxes.map(text => {
      if (!record(text) || typeof text.id !== "string") throw new TypeError("owned text refinement rollback text is invalid");
      const key = `${pageIndex}:${text.id}`, original = originals.get(text.id);
      if (rejected.has(key) && !original) throw new TypeError("owned text refinement rollback original is missing");
      return rejected.has(key) ? structuredClone(original) : text;
    });
    if (Array.isArray(page.shapes) && Array.isArray(originalPage.shapes)) {
      const retained = new Set(page.shapes.filter(record).map(shape => String(shape.id)));
      page.shapes = originalPage.shapes.filter(shape => record(shape) && (retained.has(String(shape.id))
        || rejected.has(glyphOwners.get(`${pageIndex}:${String(shape.id)}`) || ""))).map(shape => structuredClone(shape));
    }
  }
  return next;
}

/** @param {unknown} isCancellationRequested */
async function cancelled(isCancellationRequested) {
  if (await /** @type {() => Promise<unknown>} */ (isCancellationRequested)()) throw new Error("editable job was cancelled");
}

/** @param {string} file @param {Workspace} workspace */
function removeOwnedFile(file, workspace) {
  try {
    if (!inside(workspace.root, file)) return new Error("owned text refinement cleanup target is outside the root");
    const info = fs.lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink()) return new Error("owned text refinement cleanup target was replaced");
    const real = fs.realpathSync.native(file);
    if (!inside(workspace.real, real)) return new Error("owned text refinement cleanup target was replaced");
    fs.unlinkSync(file);
    return null;
  } catch (error) {
    if (record(error) && error.code === "ENOENT") return null;
    return error;
  }
}

/** @param {string[]} files @param {Workspace} workspace @param {unknown} cause */
function cleanup(files, workspace, cause) {
  /** @type {unknown[]} */ const errors = [];
  for (const file of files) {
    const error = removeOwnedFile(file, workspace);
    if (error) errors.push(error);
  }
  if (errors.length) throw new AggregateError(cause === undefined ? errors : [cause, ...errors], "owned text refinement cleanup failed");
}

/** @param {string} file @param {Workspace} workspace */
function truncateOwned(file, workspace) {
  const info = fs.lstatSync(file);
  if (!inside(workspace.root, file) || !info.isFile() || info.isSymbolicLink()
    || !inside(workspace.real, fs.realpathSync.native(file))) throw new Error("owned text refinement output was replaced");
  fs.truncateSync(file, 0);
}

/**
 * Creates a coordinator-compatible native textPlain refinement stage.
 * The verifier receives `deck` as the immutable baseline ROI deck and `candidateDeck` as the artifact IR.
 * @param {Dependencies} dependencies
 */
function createOwnedTextRefiner(dependencies) {
  if (!record(dependencies)) throw new TypeError("owned text refinement dependencies are invalid");
  const probeOwnedTexts = callback(dependencies.probeOwnedTexts, "probe callback");
  const validateDeck = callback(dependencies.validateDeck, "deck validator");
  const auditSemantic = callback(dependencies.auditSemantic, "semantic auditor");
  const qualityAcceptable = callback(dependencies.qualityAcceptable, "quality policy");
  const planTextFit = dependencies.planTextFit || planOwnedTextWarpFit;
  callback(planTextFit, "text planner");
  if (dependencies.prepareSourceTargets !== undefined) callback(dependencies.prepareSourceTargets, "source admission callback");

  return async function refineOwnedTextsOnce(/** @type {unknown} */ input) {
    if (!record(input)) throw new TypeError("owned text refinement request is invalid");
    if (input.strictRecovery !== undefined && typeof input.strictRecovery !== "boolean") throw new TypeError("owned text strict recovery control is invalid");
    const workspace = workspaceRoot(input.root), pages = deckPages(input.deck);
    const deck = /** @type {Deck} */ (input.deck);
    const deckFile = regularFile(input.deckFile, workspace, "deck file", MAX_DECK_BYTES);
    const pptxFile = regularFile(input.pptxFile, workspace, "PPTX file", MAX_PPTX_BYTES);
    const sourceValues = pageFiles(input.sourceImages, pages.length, "source images");
    const renderedValues = pageFiles(input.renderedImages, pages.length, "rendered images");
    const sourceFiles = sourceValues.map(value => regularFile(value, workspace, "source image", MAX_IMAGE_BYTES));
    const renderedFiles = renderedValues.map(value => regularFile(value, workspace, "rendered image", MAX_IMAGE_BYTES));
    const buildCandidate = callback(input.buildCandidate, "candidate builder");
    const verifyCandidate = callback(input.verifyCandidate, "candidate verifier");
    const isCancellationRequested = callback(input.isCancellationRequested, "cancellation callback");
    if (!record(input.initialQuality)) throw new TypeError("owned text refinement initial quality is invalid");
    validateDeck(deck, workspace.root);
    const base = { deck, deckFile, pptxFile, quality: input.initialQuality, accepted: false, changedTextBoxes: 0,
      proposedTextBoxes: 0, rolledBackTextBoxes: 0, skippedPixelBudget: 0,
      /** @type {Array<{pageIndex:number,id:string,textRevision:string,sourceHash:string}>} */ probedTextTargets: [] };
    if (!semanticPassed(auditSemantic(deck))) return base;
    await cancelled(isCancellationRequested);
    // The coordinator can request a bounded repair of a relative deficit even
    // after the absolute visual gate passes. This does not change acceptance,
    // source ownership, target history, local rollback or final publication.
    if (input.initialQuality.passed === true && input.strictRecovery !== true) return base;

    const original = structuredClone(deck);
    const sourceHashes = sourceFiles.map(file => sha256File(file, MAX_IMAGE_BYTES));
    /** @type {Set<string>|null} */ let ready = null;
    if (dependencies.prepareSourceTargets) {
      const admission = await dependencies.prepareSourceTargets({ root: workspace.root, deck: original, sourceFiles, sourceHashes, isCancellationRequested });
      if (!dataArray(admission) || admission.length !== original.pages.length) throw new TypeError("owned text source admission is invalid");
      ready = new Set();
      for (const [pageIndex, row] of admission.entries()) {
        if (!record(row) || row.pageIndex !== pageIndex || !dataArray(row.ids) || row.ids.length > MAX_TEXT_BOXES_PER_PAGE
          || row.ids.some(id => typeof id !== "string" || !id || id.length > 256) || new Set(row.ids).size !== row.ids.length) throw new TypeError("owned text source admission targets are invalid");
        const ids = new Set(original.pages[pageIndex]?.textBoxes.filter(record).map(text => text.id));
        for (const id of row.ids) {
          if (!ids.has(id)) throw new TypeError("owned text source admission target is unknown");
          ready.add(`${pageIndex}:${id}`);
        }
      }
    }
    const selectedTargets = rankedTargets(input.initialQuality, original.pages, sourceHashes, input.targetHistory, ready);
    base.probedTextTargets = selectedTargets.map(({ pageIndex, id, textRevision, sourceHash }) => ({ pageIndex, id, textRevision, sourceHash }));
    if (selectedTargets.length === 0) return base;
    /** @type {DeckPage[]} */ const candidatePages = [];
    /** @type {TextTarget[]} */ const targets = [];
    /** @type {Map<string,string>} */ const glyphOwners = new Map();
    let commonRenderer = null;
    for (const [pageIndex, page] of original.pages.entries()) {
      const pageTargets = selectedTargets.filter(target => target.pageIndex === pageIndex);
      if (pageTargets.length === 0) {
        candidatePages.push(page);
        continue;
      }
      await cancelled(isCancellationRequested);
      const sourceFile = sourceFiles[pageIndex], renderedFile = renderedFiles[pageIndex];
      if (sourceFile === undefined || renderedFile === undefined) throw new Error("owned text refinement page files are inconsistent");
      const sourceHash = sourceHashes[pageIndex];
      if (sourceHash === undefined) throw new Error("owned text refinement source hashes are inconsistent");
      const result = probeResult(await probeOwnedTexts({ root: workspace.root, deck: original, deckFile, pptxFile, pageIndex,
        page: structuredClone(page), sourceImage: sourceFile, renderedImage: renderedFile, sourceHash,
        targetIds: pageTargets.map(target => target.id), targets: pageTargets.map(target => ({ id: target.id,
          textRevision: target.textRevision })), buildCandidate, isCancellationRequested }), pageIndex, sourceHash,
      pageTargets.map(target => target.id));
      await cancelled(isCancellationRequested);
      regularFile(sourceFile, workspace, "source image", MAX_IMAGE_BYTES);
      if (sha256File(sourceFile, MAX_IMAGE_BYTES) !== sourceHash) throw new Error("owned text refinement source image changed during probe");
      if (commonRenderer !== null && result.signature !== commonRenderer) throw new TypeError("owned text refinement renderer profiles are inconsistent");
      commonRenderer = result.signature;
      const local = targetMetrics(input.initialQuality, pageTargets, "baseline");
      const plan = planTextFit({ slideSize: original.slideSize, textBoxes: page.textBoxes,
        measurements: result.measurements, renderProfile: result.renderProfile,
        residualEvidence: pageTargets.map(target => ({ id: target.id, textRevision: target.textRevision, sourceHash,
          pixelDiffRatio: local.get(`${pageIndex}:${target.id}`)?.pixelDiffRatio,
          foregroundMissingRatio: local.get(`${pageIndex}:${target.id}`)?.foregroundMissingRatio })) });
      const originals = new Map(page.textBoxes.filter(record).map(text => [String(text.id), text]));
      const changedIds = new Set(plan.changes.map(change => change.id));
      const shapes = Array.isArray(page.shapes) ? page.shapes : [];
      for (const entry of result.ownedGlyphShapes) {
        const owner = originals.get(entry.textId);
        const matchingShapes = shapes.filter(shape => record(shape) && shape.id === entry.id);
        if (!owner || entry.textRevision !== textProbeRevision(owner) || matchingShapes.length !== 1) {
          throw new TypeError("owned text refinement glyph revision is invalid");
        }
        if (changedIds.has(entry.textId)) glyphOwners.set(`${pageIndex}:${entry.id}`, `${pageIndex}:${entry.textId}`);
      }
      candidatePages.push({ ...page, textBoxes: plan.textBoxes, ...(Array.isArray(page.shapes)
        ? { shapes: shapes.filter(shape => !record(shape) || !glyphOwners.has(`${pageIndex}:${String(shape.id)}`)) } : {}) });
      for (const change of plan.changes) {
        const text = originals.get(change.id);
        if (!text || typeof text.id !== "string") throw new TypeError("owned text refinement target is invalid");
        targets.push({ pageIndex, id: text.id, box: box(text.box) });
      }
    }
    if (targets.length === 0) return base;
    const baselineMetrics = targetMetrics(input.initialQuality, targets, "baseline");
    let candidateDeck = /** @type {Deck} */ ({ ...original, pages: candidatePages });
    validateDeck(candidateDeck, workspace.root);
    if (!semanticPassed(auditSemantic(candidateDeck))) return { ...base, changedTextBoxes: targets.length, proposedTextBoxes: targets.length };

    const token = crypto.randomUUID();
    const candidateDeckFile = path.join(workspace.root, `owned-text-refinement-${token}.json`);
    const candidatePptxFile = path.join(workspace.root, `owned-text-refinement-${token}.pptx`);
    /** @type {string[]} */ const owned = [];
    let adopted = false, rolledBackTextBoxes = 0;
    const writeDeck = (/** @type {boolean} */ create) => {
      const json = `${JSON.stringify(candidateDeck)}\n`;
      if (Buffer.byteLength(json) > MAX_DECK_BYTES) throw new RangeError("owned text refinement candidate deck is too large");
      if (!create) truncateOwned(candidateDeckFile, workspace);
      fs.writeFileSync(candidateDeckFile, json, { encoding: "utf8", flag: create ? "wx" : "w", mode: 0o600 });
      if (create) owned.push(candidateDeckFile);
    };
    const buildAndVerify = async () => {
      await cancelled(isCancellationRequested);
      await buildCandidate({ deckFile: candidateDeckFile, pptxFile: candidatePptxFile });
      await cancelled(isCancellationRequested);
      regularFile(candidatePptxFile, workspace, "candidate PPTX file", MAX_PPTX_BYTES);
      const quality = await verifyCandidate({ deck: structuredClone(original), candidateDeck: structuredClone(candidateDeck),
        pptxFile: candidatePptxFile, fixedTextRois: targets.map(target => structuredClone(target)) });
      await cancelled(isCancellationRequested);
      return quality;
    };
    try {
      writeDeck(true);
      fs.closeSync(fs.openSync(candidatePptxFile, "wx", 0o600));
      owned.push(candidatePptxFile);
      let quality = await buildAndVerify();
      let remaining = targets;
      const regressed = regressedTargets(baselineMetrics, quality, targets);
      if (regressed.size > 0) {
        rolledBackTextBoxes = regressed.size;
        remaining = targets.filter(target => !regressed.has(`${target.pageIndex}:${target.id}`));
        if (remaining.length === 0) return { ...base, changedTextBoxes: targets.length,
          proposedTextBoxes: targets.length, rolledBackTextBoxes };
        candidateDeck = rollbackTargets(candidateDeck, original, regressed, glyphOwners);
        validateDeck(candidateDeck, workspace.root);
        if (!semanticPassed(auditSemantic(candidateDeck))) return { ...base, changedTextBoxes: targets.length,
          proposedTextBoxes: targets.length, rolledBackTextBoxes };
        writeDeck(false);
        truncateOwned(candidatePptxFile, workspace);
        quality = await buildAndVerify();
        if (regressedTargets(baselineMetrics, quality, remaining).size > 0) return { ...base,
          changedTextBoxes: targets.length, proposedTextBoxes: targets.length, rolledBackTextBoxes };
      }
      const acceptable = qualityAcceptable({ baselineQuality: input.initialQuality, candidateQuality: quality,
        candidateDeck });
      if (typeof acceptable !== "boolean") throw new TypeError("owned text refinement quality decision is invalid");
      if (!acceptable) return { ...base, changedTextBoxes: targets.length,
        proposedTextBoxes: targets.length, rolledBackTextBoxes };
      adopted = true;
      return { deck: candidateDeck, deckFile: candidateDeckFile, pptxFile: candidatePptxFile, quality, accepted: true,
        probedTextTargets: base.probedTextTargets,
        changedTextBoxes: remaining.length, proposedTextBoxes: targets.length, rolledBackTextBoxes, skippedPixelBudget: 0,
        removedGlyphShapes: [...glyphOwners.values()].filter(owner => remaining.some(target => `${target.pageIndex}:${target.id}` === owner)).length };
    } catch (error) {
      cleanup(owned, workspace, error);
      throw error;
    } finally {
      if (!adopted && owned.some(file => fs.existsSync(file))) cleanup(owned, workspace, undefined);
    }
  };
}

module.exports = { createOwnedTextRefiner };
