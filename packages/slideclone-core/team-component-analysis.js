"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MAX_SOURCE_BYTES = 60 * 1024 * 1024;
const MAX_REPORT_BYTES = 4 * 1024 * 1024;
const MAX_IMAGES = 2000;

function createTeamComponentAnalysis(dependencies = {}) {
  const required = ["rebuildDeckFromWorkDir", "searchIrComponentCandidates", "buildComponentAssetManifest", "buildComponentStrategyIndex", "buildComponentAssetIndex"];
  for (const name of required) if (typeof dependencies[name] !== "function") throw new TypeError(`component analysis ${name} is required`);
  if (!isPlainObject(dependencies.inventory)) throw new TypeError("component analysis inventory is invalid");

  return Object.freeze({
    async resolve({ workDir, root, metadata, isCancellationRequested } = {}) {
      try {
        if (typeof isCancellationRequested === "function" && await isCancellationRequested()) throw new Error("cancelled");
        const paths = resolveOwnedPaths(workDir, root);
        const source = readSourceFingerprint(metadata);
        const analysisDir = path.join(paths.root, ".component-analysis");
        fs.mkdirSync(analysisDir, { recursive: true });
        assertOwnedDirectory(analysisDir, paths.root);
        const preDeck = dependencies.rebuildDeckFromWorkDir(paths.workDir, {
          preserveGraphics: true,
          pages: "1",
          assetDir: path.join(analysisDir, "assets"),
          irDir: analysisDir,
          deckName: "component-pre"
        });
        validatePreDeck(preDeck);
        const preFile = path.join(analysisDir, "component-pre.ir.json");
        writeBoundedJson(preFile, preDeck, MAX_REPORT_BYTES);
        if (typeof isCancellationRequested === "function" && await isCancellationRequested()) throw new Error("cancelled");
        const report = await dependencies.searchIrComponentCandidates({ ir: preFile, dryRun: true, size: 3 });
        validateReport(report, preDeck.pages[0].images.length);
        assertBoundedObject(report, MAX_REPORT_BYTES);
        const manifest = dependencies.buildComponentAssetManifest({ candidateReport: report, inventory: dependencies.inventory, maxAssetsPerLayer: 4 });
        validateManifest(manifest, preDeck.pages[0].images.length, dependencies.inventory);
        assertBoundedObject(manifest, MAX_REPORT_BYTES);
        assertSameSource(source, metadata);
        // Unmatched offline preservation recommendations must not disable the
        // existing native detectors for a page that has no reusable component.
        const matchedLayers = manifest.layers.filter(layer => Array.isArray(layer.localAssets) && layer.localAssets.length > 0);
        const matchedKeys = new Set(matchedLayers.map(layerKey));
        const nativeModes = new Set(["native-visual-atom-rebuild", "native-rebuild-with-component-style-guide"]);
        const matchedReport = { ...report, layers: report.layers.filter(layer => matchedKeys.has(layerKey(layer)) && nativeModes.has(layer.componentRenderStrategy.mode)) };
        const matchedManifest = { ...manifest, layers: matchedLayers };
        const strategyLayers = matchedReport.layers.length;
        const assetLayers = matchedLayers.length;
        const assetMatches = manifest.layers.reduce((count, layer) => count + (Array.isArray(layer.localAssets) ? layer.localAssets.length : 0), 0);
        const result = {
          evidence: Object.freeze({
            provider: "team-component-analysis-v1",
            sourceSha256: source.sha256,
            preImages: preDeck.pages[0].images.length,
            analysisLayers: report.layers.length,
            assetMatches,
            strategyLayers,
            assetLayers
          })
        };
        if (strategyLayers > 0) result.componentStrategyIndex = dependencies.buildComponentStrategyIndex(matchedReport);
        if (assetLayers > 0) result.componentAssetIndex = dependencies.buildComponentAssetIndex(matchedManifest);
        return Object.freeze(result);
      } catch (cause) {
        throw new Error("team component analysis failed", { cause });
      }
    }
  });
}

function resolveOwnedPaths(workDir, root) {
  if (typeof workDir !== "string" || typeof root !== "string" || !path.isAbsolute(workDir) || !path.isAbsolute(root)) throw new Error("invalid root");
  const realRoot = realDirectory(root);
  const realWorkDir = realDirectory(workDir);
  if (realWorkDir === realRoot || !inside(realRoot, realWorkDir)) throw new Error("work directory escapes root");
  return { root: realRoot, workDir: realWorkDir };
}

function readSourceFingerprint(metadata) {
  const input = dataValue(metadata, "inputFile");
  if (!isPlainObject(metadata) || typeof input !== "string" || !path.isAbsolute(input)) throw new Error("invalid input");
  const stat = fs.lstatSync(input);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_SOURCE_BYTES) throw new Error("invalid input");
  return { file: fs.realpathSync(input), size: stat.size, sha256: hashFile(input) };
}

function assertSameSource(before, metadata) {
  const after = readSourceFingerprint(metadata);
  if (after.file !== before.file || after.size !== before.size || after.sha256 !== before.sha256) throw new Error("source changed");
}

function validatePreDeck(deck) {
  if (!isPlainObject(deck) || !Array.isArray(deck.pages) || deck.pages.length !== 1 || !isPlainObject(deck.pages[0]) || !Array.isArray(deck.pages[0].images) || deck.pages[0].images.length > MAX_IMAGES) throw new Error("invalid pre-analysis deck");
}

function validateReport(report, imageCount) {
  if (!isPlainObject(report) || !Array.isArray(report.layers)) throw new Error("invalid component report");
  for (const layer of report.layers) {
    const imageLayer = validImageIndex(layer?.imageIndex, imageCount);
    const shapeLayer = layer?.imageIndex == null && typeof layer?.shapeLayerId === "string" && layer.shapeLayerId.length > 0 && layer.shapeLayerId.length <= 500;
    if (!isPlainObject(layer) || layer.pageIndex !== 0 || (!imageLayer && !shapeLayer) || !isPlainObject(layer.componentRenderStrategy)) throw new Error("invalid component report");
  }
}

function validateManifest(manifest, imageCount, inventory) {
  if (!isPlainObject(manifest) || !Array.isArray(manifest.layers)) throw new Error("invalid component manifest");
  const allowed = new Set((Array.isArray(inventory.candidates) ? inventory.candidates : []).map(candidate => isPlainObject(candidate) ? candidate.path : null).filter(value => typeof value === "string"));
  for (const layer of manifest.layers) {
    if (!isPlainObject(layer) || layer.pageIndex !== 0 || (layer.imageIndex != null && !validImageIndex(layer.imageIndex, imageCount))) throw new Error("invalid component manifest");
    for (const asset of Array.isArray(layer.localAssets) ? layer.localAssets : []) {
      if (!isPlainObject(asset) || typeof asset.path !== "string" || !allowed.has(asset.path)) throw new Error("untrusted component asset");
      const stat = fs.lstatSync(asset.path);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("untrusted component asset");
    }
  }
}

function layerKey(layer) { return JSON.stringify([layer.pageIndex, layer.imageIndex, layer.shapeLayerId || null]); }
function validImageIndex(value, imageCount) { return Number.isInteger(value) && value >= 0 && value < imageCount; }
function realDirectory(value) { const stat = fs.lstatSync(value); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("invalid directory"); return fs.realpathSync(value); }
function assertOwnedDirectory(value, root) { const real = realDirectory(value); if (!inside(root, real)) throw new Error("analysis directory escapes root"); }
function inside(root, target) { return target === root || target.startsWith(`${root}${path.sep}`); }
function isPlainObject(value) { if (!value || typeof value !== "object" || Array.isArray(value)) return false; const prototype = Object.getPrototypeOf(value); return prototype === Object.prototype || prototype === null; }
function dataValue(object, key) { if (!object || typeof object !== "object") return undefined; const descriptor = Object.getOwnPropertyDescriptor(object, key); return descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value") ? descriptor.value : undefined; }
function assertBoundedObject(value, limit) { if (Buffer.byteLength(JSON.stringify(value), "utf8") > limit) throw new Error("analysis output exceeds boundary"); }
function writeBoundedJson(file, value, limit) { assertBoundedObject(value, limit); fs.writeFileSync(file, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "w", mode: 0o600 }); }
function hashFile(file) { const hash = crypto.createHash("sha256"); const buffer = Buffer.allocUnsafe(1024 * 1024); const handle = fs.openSync(file, "r"); try { for (;;) { const bytes = fs.readSync(handle, buffer, 0, buffer.length, null); if (!bytes) break; hash.update(buffer.subarray(0, bytes)); } } finally { fs.closeSync(handle); } return hash.digest("hex"); }

module.exports = { MAX_IMAGES, MAX_REPORT_BYTES, MAX_SOURCE_BYTES, createTeamComponentAnalysis };
