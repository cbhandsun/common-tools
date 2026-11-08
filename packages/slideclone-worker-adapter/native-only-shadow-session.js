// @ts-check
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { types } = require("node:util");
const { createOwnedSourceSnapshot } = require("../slideclone-core/owned-source-snapshot");
const { parseOwnedTextHistory } = require("../slideclone-core/owned-text-target-window");
const { safeAssetPath } = require("../slideclone-core/deck-ir-admission");
const MAX_BYTES = 512 * 1024 * 1024;
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !types.isProxy(value) && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(item => "value" in item);
}
/** Canonicalize bounded data without invoking caller getters or toJSON methods.
 * @param {unknown} value @returns {string} */
function encode(value) {
  let nodes = 0;
  const seen = new Set();
  /** @param {unknown} item @param {number} depth @returns {unknown} */
  function visit(item, depth) {
    if (++nodes > 200000 || depth > 40) throw new RangeError("native shadow data exceeds boundary");
    if (item === null || typeof item === "boolean") return item;
    if (typeof item === "string") {
      if (item.length > 4 * 1024 * 1024) throw new RangeError("native shadow string exceeds boundary");
      return item;
    }
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (typeof item !== "object" || item === null || types.isProxy(item) || seen.has(item)) throw new TypeError("native shadow data is invalid");
    seen.add(item);
    try {
      if (Array.isArray(item)) {
        if (Object.getPrototypeOf(item) !== Array.prototype || item.length > 20000) throw new TypeError("native shadow array is invalid");
        return Array.from({ length: item.length }, (_, index) => {
          const property = Object.getOwnPropertyDescriptor(item, String(index));
          if (!property || !("value" in property)) throw new TypeError("native shadow array entry is invalid");
          return visit(property.value, depth + 1);
        });
      }
      if (!record(item)) throw new TypeError("native shadow record is invalid");
      const result = Object.create(null);
      for (const key of Object.keys(item).sort()) {
        if (["__proto__", "constructor", "prototype"].includes(key)) throw new TypeError("native shadow key is invalid");
        if (item[key] !== undefined) result[key] = visit(item[key], depth + 1);
      }
      return result;
    } finally { seen.delete(item); }
  }
  const encoded = JSON.stringify(visit(value, 0));
  if (Buffer.byteLength(encoded) > 64 * 1024 * 1024) throw new RangeError("native shadow data exceeds boundary");
  return encoded;
}
/** @param {string} root @param {string} file */
function inside(root, file) {
  const relative = path.relative(root, file);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
/** @param {string} root @param {unknown} value @returns {string} */
function fileIdentity(root, value) {
  if (typeof value !== "string" || value.length > 32768 || value.includes("\0") || !path.isAbsolute(value)
    || !inside(root, path.resolve(value))) throw new TypeError("native shadow artifact path is invalid");
  const real = fs.realpathSync(value), info = fs.lstatSync(value);
  if (!info.isFile() || info.isSymbolicLink() || !inside(fs.realpathSync(root), real)) throw new TypeError("native shadow artifact is invalid");
  const fd = fs.openSync(value, "r");
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.size < 1 || before.size > MAX_BYTES) throw new RangeError("native shadow artifact size is invalid");
    const hash = crypto.createHash("sha256"), buffer = Buffer.allocUnsafe(65536);
    let position = 0;
    while (position < before.size) {
      const count = fs.readSync(fd, buffer, 0, Math.min(buffer.length, before.size - position), position);
      if (!count) throw new Error("native shadow artifact changed");
      hash.update(buffer.subarray(0, count)); position += count;
    }
    const after = fs.fstatSync(fd);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error("native shadow artifact changed");
    return encode([real, hash.digest("hex")]);
  } finally { fs.closeSync(fd); }
}
/** @param {unknown} deck @param {string} root @returns {Map<string,string>} */
function assetIdentities(deck, root) {
  const files = new Set();
  /** @param {unknown} value @param {string} parent */
  function visit(value, parent) {
    if (Array.isArray(value)) { for (const item of value) visit(item, ""); return; }
    if (!record(value)) return;
    for (const [key, item] of Object.entries(value)) {
      if (item != null && (key.toLowerCase() === "assetpath" || key === "sourceImage"
        || (key.toLowerCase() === "pageimage" && parent.toLowerCase() === "source"))) {
        files.add(path.resolve(root, safeAssetPath(item)));
        if (files.size > 10000) throw new RangeError("native shadow assets exceed boundary");
      }
      visit(item, key);
    }
  }
  visit(deck, "");
  return new Map([...files].sort().map(file => [file, fileIdentity(root, file)]));
}
/** @typedef {{assess:(input:unknown)=>unknown,hasMeasuredGain:(before:unknown,after:unknown)=>boolean,validateDeck:(deck:unknown,root:string)=>unknown}} Dependencies */
/** @typedef {{root:string,baseline:string,policy:string,sources:string,verifySources:()=>void,candidate:Record<string,unknown>,artifacts:Map<string,string>,assets:Map<string,string>,directory:string}} Checkpoint */
/** Job-local search checkpoint, never a publication decision. Caller must run its strict gate.
 * @param {Dependencies} dependencies */
function createNativeOnlyShadowSession({ assess, hasMeasuredGain, validateDeck }) {
  if (![assess, hasMeasuredGain, validateDeck].every(item => typeof item === "function")) throw new TypeError("native shadow dependencies are invalid");
  /** @type {Checkpoint|null} */ let saved = null;
  const clear = () => {
    if (!saved) return;
    const previous = saved; saved = null;
    if (!inside(previous.root, previous.directory) || path.dirname(previous.directory) !== previous.root
      || !path.basename(previous.directory).startsWith("native-search-shadow-")) throw new Error("native shadow cleanup path is invalid");
    const info = fs.lstatSync(previous.directory);
    if (!info.isDirectory() || info.isSymbolicLink() || !inside(fs.realpathSync(previous.root), fs.realpathSync(previous.directory))) throw new Error("native shadow cleanup directory changed");
    fs.rmSync(previous.directory, { recursive: true });
  };
  /** @param {unknown} value */
  const request = value => {
    if (!record(value) || typeof value.root !== "string" || !path.isAbsolute(value.root)) throw new TypeError("native shadow request is invalid");
    const root = path.resolve(value.root), info = fs.lstatSync(root);
    if (!info.isDirectory() || info.isSymbolicLink() || fs.realpathSync(root) !== root) throw new TypeError("native shadow root is invalid");
    const baseline = encode(value.baselineDeck), policy = encode(value.policy);
    const sources = encode(value.sourceImages), baselineQuality = JSON.parse(encode(value.baselineQuality));
    validateDeck(JSON.parse(baseline), root);
    return { value, root, baseline, policy, sources, baselineQuality };
  };
  /** @param {Record<string,unknown>} candidate @param {unknown} baselineQuality @param {unknown} baselineDeck */
  const retainable = (candidate, baselineQuality, baselineDeck) => {
    if (candidate.rejected === true) return false;
    const result = assess({ baselineQuality, baselineDeck, candidateQuality: candidate.quality, candidateDeck: candidate.deck });
    const parsed = JSON.parse(encode(result));
    if (!record(parsed) || typeof parsed.passed !== "boolean" || !Array.isArray(parsed.reasons)
      || parsed.reasons.length > 8 || parsed.reasons.some(reason => typeof reason !== "string")
      || (parsed.passed && parsed.reasons.length !== 0)) throw new TypeError("native shadow assessment is invalid");
    const safe = parsed.passed || (parsed.reasons.length === 1 && parsed.reasons[0] === "visual-fidelity");
    const gain = hasMeasuredGain(baselineQuality, candidate.quality);
    if (typeof gain !== "boolean") throw new TypeError("native shadow gain decision is invalid");
    return safe && gain;
  };
  return {
    /** @param {unknown} input @returns {boolean} */
    checkpoint(input) {
      const current = request(input);
      if (current.value.candidate == null) return false;
      const candidate = JSON.parse(encode(current.value.candidate));
      if (!record(candidate)) throw new TypeError("native shadow candidate is invalid");
      if (candidate.rejected === true) return false;
      parseOwnedTextHistory(candidate.ownedTextTargetHistory);
      validateDeck(candidate.deck, current.root);
      if (!retainable(candidate, current.baselineQuality, JSON.parse(current.baseline))) return false;
      if (!Array.isArray(candidate.renderedImages) || !Array.isArray(current.value.sourceImages)
        || candidate.renderedImages.length !== current.value.sourceImages.length) throw new TypeError("native shadow renders are invalid");
      const verifySources = createOwnedSourceSnapshot({ root: current.root, sourceImages: current.value.sourceImages });
      const assets = assetIdentities([JSON.parse(current.baseline), candidate.deck], current.root);
      const originalFiles = [candidate.deckFile, candidate.pptxFile, ...candidate.renderedImages];
      if (new Set(originalFiles).size !== originalFiles.length) throw new TypeError("native shadow artifact paths are ambiguous");
      const identities = originalFiles.map(file => fileIdentity(current.root, file));
      if (typeof candidate.deckFile === "string" && fs.statSync(candidate.deckFile).size > 64 * 1024 * 1024) throw new RangeError("native shadow deck exceeds boundary");
      if (typeof candidate.deckFile !== "string" || encode(JSON.parse(fs.readFileSync(candidate.deckFile, "utf8"))) !== encode(candidate.deck)) throw new Error("native shadow deck artifact does not match candidate");
      const directory = fs.mkdtempSync(path.join(current.root, "native-search-shadow-"));
      let committed = false;
      try {
        const copies = originalFiles.map((file, index) => {
          if (typeof file !== "string") throw new TypeError("native shadow artifact path is invalid");
          const copy = path.join(directory, `${index}${path.extname(file)}`);
          fs.copyFileSync(file, copy, fs.constants.COPYFILE_EXCL);
          if (fileIdentity(current.root, file) !== identities[index]) throw new Error("native shadow artifact changed during copy");
          if (JSON.parse(fileIdentity(current.root, copy))[1] !== JSON.parse(identities[index] ?? "null")[1]) throw new Error("native shadow copied artifact changed");
          return copy;
        });
        verifySources();
        for (const [file, identity] of assets) if (fileIdentity(current.root, file) !== identity) throw new Error("native shadow asset changed during copy");
        const artifacts = new Map(copies.map(file => [file, fileIdentity(current.root, file)]));
        candidate.deckFile = copies[0]; candidate.pptxFile = copies[1]; candidate.renderedImages = copies.slice(2);
        clear();
        saved = { root: current.root, baseline: current.baseline, policy: current.policy, sources: current.sources,
          verifySources, candidate, assets, artifacts, directory };
        committed = true;
        return true;
      } finally { if (!committed) fs.rmSync(directory, { recursive: true }); }
    },
    /** @param {unknown} input @returns {Record<string,unknown>|null} */
    resume(input) {
      if (!saved) return null;
      const current = request(input);
      if (current.root !== saved.root || current.baseline !== saved.baseline || current.policy !== saved.policy || current.sources !== saved.sources) {
        clear(); return null;
      }
      saved.verifySources();
      for (const [file, identity] of [...saved.artifacts, ...saved.assets]) if (fileIdentity(saved.root, file) !== identity) throw new Error("native shadow checkpoint changed");
      if (!retainable(saved.candidate, current.baselineQuality, JSON.parse(current.baseline))) { clear(); return null; }
      return JSON.parse(encode(saved.candidate));
    },
    close: clear
  };
}
module.exports = { createNativeOnlyShadowSession };
