// @ts-check
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { types } = require("node:util");
const { readPng } = require("./png");
const { measureSourceTextInkGeometry, measureTextInkGeometry } = require("./text-ink-geometry");
const { textProbeRevision } = require("./owned-text-advance");
const { isOwnedTextEligible } = require("./owned-text-eligibility");
const { pruneSourceOwnedGlyphShapes } = require("./source-owned-glyph-shapes");

/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{widthPt:number,heightPt:number}} Size */
/** @typedef {{rendererId:string,version:string,dpi:number,runtimeHash:string}} Profile */
/** @typedef {Profile & {sourceHash:string,pixelWidth:number,pixelHeight:number}} RenderProfile */
/** @typedef {{id:unknown,source:Box,rendered:Box,textRevision:string,sourceComplete:boolean,renderedComplete:boolean,renderedOwnership:string,renderProfile:RenderProfile}} Measurement */
/** @typedef {{root:string,deckFile:string,pptxFile:string}} BuildRequest */
/** @typedef {{renderPresentation:(input:unknown,context:unknown)=>Promise<unknown>,describeRenderer:(cancellation:()=>boolean|Promise<boolean>)=>Promise<unknown>,validateDeck:(deck:unknown,root:string)=>unknown}} Dependencies */

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
/** @param {string} root @param {string} file */
function inside(root, file) {
  const relative = path.relative(root, file);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
/** @param {unknown} value @param {string} root */
function inputFile(value, root) {
  if (typeof value !== "string" || !path.isAbsolute(value) || !inside(root, value)) throw new TypeError("owned text probe input file is invalid");
  const info = fs.lstatSync(value);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 60 * 1024 * 1024
    || !inside(fs.realpathSync(root), fs.realpathSync(value))) throw new TypeError("owned text probe input file is invalid");
  return value;
}
/** @param {unknown} value @returns {Profile} */
function profile(value) {
  if (!record(value) || value.rendererId !== "render-libreoffice" || typeof value.version !== "string"
    || !value.version || value.version.length > 128 || [...value.version].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
    || value.dpi !== 144 || typeof value.runtimeHash !== "string" || !/^[a-f0-9]{64}$/u.test(value.runtimeHash)) {
    throw new TypeError("owned text probe renderer profile is invalid");
  }
  return { rendererId: value.rendererId, version: value.version, dpi: value.dpi, runtimeHash: value.runtimeHash };
}
/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }
/** @param {unknown} value @param {Size} size @returns {value is Box} */
function box(value, size) {
  return record(value) && finite(value.x) && finite(value.y) && finite(value.w) && finite(value.h)
    && value.x >= 0 && value.y >= 0 && value.w > 0 && value.h > 0
    && value.x + value.w <= size.widthPt && value.y + value.h <= size.heightPt;
}
/** @param {Box} source @param {Box} frame @param {Size} size */
function measurementRegion(source, frame, size) {
  const x = Math.max(0, Math.min(source.x, frame.x) - 32);
  const y = Math.max(0, Math.min(source.y, frame.y) - 16);
  return { x, y, w: Math.min(size.widthPt - x, Math.max(source.w, frame.w) * 1.65 + 64),
    h: Math.min(size.heightPt - y, Math.max(source.h, frame.h) * 2 + 32) };
}
/** @param {()=>boolean|Promise<boolean>} cancellation */
async function cancelled(cancellation) {
  if (await cancellation()) throw new Error("editable job was cancelled");
}
/** @param {string[]} files @param {string} directory @param {string} root @param {unknown} cause */
function cleanup(files, directory, root, cause) {
  const errors = [];
  for (const file of [...files, directory]) {
    try {
      if (!fs.existsSync(file)) continue;
      if (!inside(root, file) || fs.lstatSync(file).isSymbolicLink() || !inside(fs.realpathSync(root), fs.realpathSync(file))) {
        throw new Error("owned text probe cleanup target is invalid");
      }
      fs.rmSync(file, { recursive: file === directory, force: true });
    } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(cause === undefined ? errors : [cause, ...errors], "owned text probe cleanup failed");
}

/** Isolate bounded absolute OCR text with its original rendering semantics and fresh source evidence.
 * @param {Dependencies} dependencies
 */
function createOwnedTextProbe(dependencies) {
  if (!record(dependencies) || typeof dependencies.renderPresentation !== "function"
    || typeof dependencies.describeRenderer !== "function" || typeof dependencies.validateDeck !== "function") {
    throw new TypeError("owned text probe dependencies are invalid");
  }
  const { renderPresentation, describeRenderer, validateDeck } = dependencies;
  /** @type {Map<string,{revision:string,measured:ReturnType<typeof measureSourceTextInkGeometry>}>} */
  const prepared = new Map();
  /** @param {unknown[]} texts */
  const sourceRevision = texts => crypto.createHash("sha256").update(texts.map(textProbeRevision).join(":" )).digest("hex");
  /** Source admission precedes the four-target allocation. Reuse its measurement
   * only within this window, after the normal fresh source hash checks.
   * @param {unknown} input */
  async function prepareTargets(input) {
    prepared.clear();
    if (!record(input) || typeof input.root !== "string" || !path.isAbsolute(input.root)
      || !record(input.deck) || !record(input.deck.slideSize) || !dataArray(input.deck.pages)
      || input.deck.pages.length < 1 || input.deck.pages.length > 20
      || !dataArray(input.sourceFiles) || !dataArray(input.sourceHashes)
      || input.sourceFiles.length !== input.deck.pages.length || input.sourceHashes.length !== input.deck.pages.length
      || typeof input.isCancellationRequested !== "function") throw new TypeError("owned text source admission is invalid");
    validateDeck(input.deck, input.root);
    const size = input.deck.slideSize, cancellation = /** @type {()=>boolean|Promise<boolean>} */ (input.isCancellationRequested);
    if (!finite(size.widthPt) || !finite(size.heightPt) || size.widthPt <= 0 || size.heightPt <= 0
      || size.widthPt > 100000 || size.heightPt > 100000) throw new TypeError("owned text source admission size is invalid");
    /** @type {{pageIndex:number,ids:string[]}[]} */ const admitted = [];
    let sampledPixels = 0;
    for (const [pageIndex, page] of input.deck.pages.entries()) {
      if (!record(page) || !dataArray(page.textBoxes) || page.textBoxes.length > 2000) throw new TypeError("owned text source admission page is invalid");
      await cancelled(cancellation);
      const sourceFile = inputFile(input.sourceFiles[pageIndex], input.root), sourceHash = input.sourceHashes[pageIndex];
      if (typeof sourceHash !== "string" || !/^[a-f0-9]{64}$/u.test(sourceHash)
        || crypto.createHash("sha256").update(fs.readFileSync(sourceFile)).digest("hex") !== sourceHash) throw new Error("owned text source admission binding is invalid");
      if (record(page.intent) && page.intent.templatePlaceholderBindings !== undefined) {
        admitted.push({ pageIndex, ids: [] }); continue;
      }
      const sourceImage = readPng(sourceFile, { maxFileBytes: 60 * 1024 * 1024, maxPixels: 40_000_000 });
      if (Math.abs((sourceImage.width / sourceImage.height) / (size.widthPt / size.heightPt) - 1) > 0.01) throw new TypeError("owned text source admission aspect ratio is invalid");
      const measured = measureSourceTextInkGeometry({ slideSize: size, textBoxes: page.textBoxes, sourceImage });
      sampledPixels += measured.samples;
      if (sampledPixels > 20_000_000) throw new RangeError("owned text source admission exceeds the sampling boundary");
      if (crypto.createHash("sha256").update(fs.readFileSync(sourceFile)).digest("hex") !== sourceHash) throw new Error("owned text source changed during admission");
      prepared.set(`${pageIndex}:${sourceHash}`, { revision: sourceRevision(page.textBoxes), measured });
      admitted.push({ pageIndex, ids: measured.measurements.map(row => row.id) });
    }
    return admitted;
  }
  async function probeOwnedTexts(/** @type {unknown} */ input) {
    if (!record(input) || typeof input.root !== "string" || !path.isAbsolute(input.root)
      || typeof input.isCancellationRequested !== "function" || typeof input.buildCandidate !== "function"
      || !record(input.deck) || !record(input.deck.slideSize) || !Array.isArray(input.deck.pages)
      || !Number.isSafeInteger(input.pageIndex) || !Array.isArray(input.targetIds) || input.targetIds.length > 4
      || input.targetIds.some(id => typeof id !== "string" || !id || id.length > 256)
      || new Set(input.targetIds).size !== input.targetIds.length
      || typeof input.sourceHash !== "string" || !/^[a-f0-9]{64}$/u.test(input.sourceHash)) {
      throw new TypeError("owned text probe request is invalid");
    }
    const root = path.resolve(input.root), info = fs.lstatSync(root);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new TypeError("owned text probe root is invalid");
    validateDeck(input.deck, root);
    const sizeValue = input.deck.slideSize;
    if (!finite(sizeValue.widthPt) || !finite(sizeValue.heightPt) || sizeValue.widthPt <= 0 || sizeValue.heightPt <= 0
      || sizeValue.widthPt > 100000 || sizeValue.heightPt > 100000) throw new TypeError("owned text probe slide size is invalid");
    const size = { widthPt: sizeValue.widthPt, heightPt: sizeValue.heightPt };
    const page = input.deck.pages[/** @type {number} */ (input.pageIndex)];
    if (!record(page) || !Array.isArray(page.textBoxes) || page.textBoxes.length > 2000) throw new TypeError("owned text probe page is invalid");
    const sourceFile = inputFile(input.sourceImage, root);
    const hash = () => crypto.createHash("sha256").update(fs.readFileSync(sourceFile)).digest("hex");
    if (hash() !== input.sourceHash) throw new Error("owned text probe source changed");
    const cancellation = /** @type {()=>boolean|Promise<boolean>} */ (input.isCancellationRequested);
    const buildCandidate = /** @type {(input:BuildRequest)=>Promise<unknown>} */ (input.buildCandidate);
    await cancelled(cancellation);
    const renderer = profile(await describeRenderer(cancellation));
    const sourceImage = readPng(sourceFile, { maxFileBytes: 60 * 1024 * 1024, maxPixels: 40_000_000 });
    if (Math.abs((sourceImage.width / sourceImage.height) / (size.widthPt / size.heightPt) - 1) > 0.01) {
      throw new TypeError("owned text probe source aspect ratio is invalid");
    }
    const renderProfile = { ...renderer, sourceHash: input.sourceHash,
      pixelWidth: Math.round(size.widthPt * renderer.dpi / 72), pixelHeight: Math.round(size.heightPt * renderer.dpi / 72) };
    const empty = { pageIndex: input.pageIndex, sourceHash: input.sourceHash, renderProfile, measurements: /** @type {Measurement[]} */ ([]) };
    if (record(page.intent) && page.intent.templatePlaceholderBindings !== undefined) return empty;
    const preparation = prepared.get(`${input.pageIndex}:${input.sourceHash}`);
    const sourceMeasured = preparation && preparation.revision === sourceRevision(page.textBoxes)
      ? preparation.measured : measureSourceTextInkGeometry({ slideSize: size, textBoxes: page.textBoxes, sourceImage });
    const sourceById = new Map(sourceMeasured.measurements.map(row => [row.id, row.source]));
    const requested = new Set(input.targetIds);
    const texts = page.textBoxes.filter(record).filter(text => requested.has(text.id) && isOwnedTextEligible(text)
      && box(text.box, size) && sourceById.has(/** @type {string} */ (text.id)));
    if (!texts.length) return empty;
    const pages = texts.map((text, pageIndex) => {
      const cloned = structuredClone(page);
      // Keep source/intent metadata: removing OCR provenance enables role placeholders in the builder.
      return { ...cloned, pageIndex, background: { fill: record(text.font) && typeof text.font.color === "string"
        && /^#[c-f][0-9a-f][c-f][0-9a-f][c-f][0-9a-f]$/iu.test(text.font.color) ? "#000000" : "#FFFFFF" },
      textBoxes: [structuredClone(text)], shapes: /** @type {unknown[]} */ ([]), images: /** @type {unknown[]} */ ([]),
      tables: /** @type {unknown[]} */ ([]), charts: /** @type {unknown[]} */ ([]) };
    });
    const probeDeck = { version: input.deck.version, slideSize: structuredClone(size), pages };
    validateDeck(probeDeck, root);
    const token = crypto.randomUUID(), deckFile = path.join(root, `owned-probe-${token}.json`);
    const pptxFile = path.join(root, `owned-probe-${token}.pptx`), files = [];
    const directory = fs.mkdtempSync(path.join(root, "owned-probe-render-"));
    let failure;
    try {
      fs.writeFileSync(deckFile, JSON.stringify(probeDeck), { flag: "wx", mode: 0o600 }); files.push(deckFile);
      fs.closeSync(fs.openSync(pptxFile, "wx", 0o600)); files.push(pptxFile);
      await cancelled(cancellation);
      await buildCandidate({ root, deckFile, pptxFile });
      await cancelled(cancellation);
      const built = fs.lstatSync(pptxFile);
      if (!built.isFile() || built.isSymbolicLink() || built.size < 1 || built.size > 512 * 1024 * 1024) throw new Error("owned text probe build is invalid");
      const result = await renderPresentation({ pptx: { pptxFile }, ir: probeDeck }, { outputDir: directory,
        isCancellationRequested: cancellation, config: { render: { dpi: renderer.dpi, maxPages: pages.length,
          convertTimeoutMs: 120000, renderTimeoutMs: 120000 } } });
      await cancelled(cancellation);
      if (!record(result) || result.ok !== true || !record(result.data) || result.data.provider !== renderer.rendererId
        || !Array.isArray(result.data.renderedPages) || result.data.renderedPages.length !== texts.length) throw new Error("owned text probe render is invalid");
      /** @type {Measurement[]} */ const measurements = [];
      let samples = sourceMeasured.samples;
      for (const [index, text] of texts.entries()) {
        const renderedPage = result.data.renderedPages[index];
        if (!record(renderedPage)) throw new TypeError("owned text probe rendered page is invalid");
        const image = readPng(inputFile(renderedPage.image, directory), { maxFileBytes: 60 * 1024 * 1024, maxPixels: 40_000_000 });
        if (Math.abs(image.width - renderProfile.pixelWidth) > 1 || Math.abs(image.height - renderProfile.pixelHeight) > 1) {
          throw new Error("owned text probe rendered dimensions changed");
        }
        const source = sourceById.get(/** @type {string} */ (text.id));
        if (!source || !box(text.box, size)) throw new TypeError("owned text probe target is invalid");
        /** @type {Record<string,unknown>} */
        const isolated = { ...text, box: measurementRegion(source, text.box, size) };
        delete isolated.source;
        const measured = measureTextInkGeometry({ slideSize: size, textBoxes: [isolated], sourceImage: image, renderedImage: image });
        samples += measured.samples;
        if (samples > 20_000_000) throw new RangeError("owned text probe sampling exceeds the processing boundary");
        const rendered = measured.measurements[0]?.rendered;
        if (rendered) measurements.push({ id: text.id, source, rendered, textRevision: textProbeRevision(text),
          sourceComplete: true, renderedComplete: true, renderedOwnership: "isolated", renderProfile: { ...renderProfile,
            pixelWidth: image.width, pixelHeight: image.height } });
      }
      inputFile(sourceFile, root);
      if (hash() !== input.sourceHash) throw new Error("owned text probe source changed");
      if (JSON.stringify(profile(await describeRenderer(cancellation))) !== JSON.stringify(renderer)) {
        throw new Error("owned text probe renderer identity changed");
      }
      const finalProfile = measurements[0]?.renderProfile || renderProfile;
      const glyphs = pruneSourceOwnedGlyphShapes({ page: { ...page, shapes: Array.isArray(page.shapes) ? page.shapes : [] },
        slideSize: size, sourceImage, sourceHash: input.sourceHash, measurements, renderProfile: finalProfile });
      return { ...empty, renderProfile: finalProfile, measurements, ownedGlyphShapes: glyphs.removedShapes };
    } catch (error) { failure = error; throw error; }
    finally { cleanup(files, directory, root, failure); }
  }
  return Object.assign(probeOwnedTexts, { prepareTargets });
}

module.exports = { createOwnedTextProbe };
