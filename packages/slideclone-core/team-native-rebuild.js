"use strict";
const { assertUnverifiedRegionTextPreserved } = require("./screenshot-texture-evidence");

const fs = require("node:fs");
const path = require("node:path");
const { addKnowledgeGraphPictorialConnectors, applyKnowledgeGraphPanelNativeRebuild } = require("./knowledge-graph-native");
const { auditNativeComponentQuality } = require("./native-component-quality");
const { PRODUCTION_PROFILE_NAME, createProductionNativeRebuildOptions } = require("./native-rebuild-profile");
const { compactTeamComponentEvidence } = require("./team-component-evidence");

const { boundedOcrSourceDeck, correctContextualOcrLines } = require("./ocr-source-deck");

function nativeObjectMetrics(deck) {
  const totals = { shapes: 0, connectors: 0, textBoxes: 0, tables: 0, charts: 0, icons: 0, images: 0 };
  for (const page of Array.isArray(deck?.pages) ? deck.pages : []) {
    for (const key of ["shapes", "textBoxes", "tables", "charts", "icons", "images"]) totals[key] += Array.isArray(page?.[key]) ? page[key].length : 0;
    totals.connectors += (Array.isArray(page?.shapes) ? page.shapes : []).filter((shape) => shape?.type === "line" || shape?.type === "connector" || (shape?.type === "arc" && (shape?.style?.endArrow || shape?.style?.startArrow)) || shape?.source?.connector === true).length;
  }
  return Object.freeze({ ...totals, graphicalObjects: totals.shapes + totals.tables + totals.charts + totals.icons });
}

function copyDirectoryFiles(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (!entry.isFile()) throw new Error("native image rebuild produced an invalid asset tree");
    fs.copyFileSync(path.join(source, entry.name), path.join(destination, entry.name));
  }
}

function normalizeSourceAssetProvenance(deck, assetPath) {
  if (typeof assetPath !== "string" || !assetPath.startsWith("assets/") || assetPath.includes("..") || assetPath.includes("\\") || assetPath.includes("\0")) throw new TypeError("native image source asset path is invalid");
  for (const page of Array.isArray(deck?.pages) ? deck.pages : []) {
    page.sourceImage = assetPath;
    for (const collection of ["shapes", "textBoxes", "images", "tables", "charts", "icons"]) {
      for (const item of Array.isArray(page?.[collection]) ? page[collection] : []) {
        if (item?.source && typeof item.source === "object") item.source.pageImage = assetPath;
      }
    }
  }
  return deck;
}

function ungroupHybridOverlayObjects(page) {
  for (const item of [...(Array.isArray(page?.shapes) ? page.shapes : []), ...(Array.isArray(page?.textBoxes) ? page.textBoxes : [])]) {
    if (item?.style && typeof item.style === "object") delete item.style.nativeComponentGroupId;
    if (!item?.source || typeof item.source !== "object") continue;
    for (const key of Object.keys(item.source)) {
      if (key.startsWith("nativeComponent")) delete item.source[key];
    }
  }
}

function residualEraseObjects(page, options = {}) {
  if (!page || typeof page !== "object" || Array.isArray(page)) throw new TypeError("native image residual page is invalid");
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("native image residual options are invalid");
  const objects = [];
  const seen = new Set();
  for (const [collection, requireEditable] of [["textBoxes", false], ["shapes", true], ["tables", true], ["charts", true], ["icons", true]]) {
    for (const item of Array.isArray(page[collection]) ? page[collection] : []) {
      if (!item || typeof item !== "object" || Array.isArray(item) || item.source?.preserveResidualInterior === true || (requireEditable && item.source?.editable === false)) continue;
      const box = item.box;
      if (!box || !["x", "y", "w", "h"].every((key) => Number.isFinite(box[key]))) throw new Error("native image residual object is invalid");
      const key = [item.type || collection, box.x, box.y, box.w, box.h].join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      objects.push(item);
    }
  }
  if (options.includeLocalFidelityImages === true) {
    for (const item of Array.isArray(page.images) ? page.images : []) {
      if (!item || typeof item !== "object" || Array.isArray(item) || item.source?.fullSlideResidual === true) continue;
      const box = item.box;
      if (!box || !["x", "y", "w", "h"].every((key) => Number.isFinite(box[key])) || box.w <= 0 || box.h <= 0) {
        throw new Error("native image local fidelity object is invalid");
      }
      const key = ["image", box.x, box.y, box.w, box.h].join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      objects.push(item);
    }
  }
  return objects;
}

function shouldOmitFullSlideResidual(semanticNative) {
  return semanticNative?.matched === true && semanticNative.imageRefinement?.matched === true && semanticNative.pictorialConnectors?.matched === true && !(semanticNative.shapeAdmission?.rejected > 0);
}

function createRawImageNativeRebuilder({ rebuildDeckFromWorkDir, normalizeImageFile, createFullSlideResidual, refineSemanticImages, admitSemanticShapes, restoreOcrGlyphs, refineGrayBorders, resolveComponentIndexes, preserveLocalFidelityImages = false } = {}) {
  if (typeof rebuildDeckFromWorkDir !== "function") throw new TypeError("native image rebuild implementation is required");
  if (resolveComponentIndexes !== undefined && typeof resolveComponentIndexes !== "function") throw new TypeError("native image component resolver is invalid");
  if (normalizeImageFile !== undefined && typeof normalizeImageFile !== "function") throw new TypeError("native image normalizer is invalid");
  if (createFullSlideResidual !== undefined && typeof createFullSlideResidual !== "function") throw new TypeError("native image residual builder is invalid");
  if (refineSemanticImages !== undefined && typeof refineSemanticImages !== "function") throw new TypeError("native image semantic crop refiner is invalid");
  if (admitSemanticShapes !== undefined && typeof admitSemanticShapes !== "function") throw new TypeError("native image semantic shape admission is invalid");
  if (restoreOcrGlyphs !== undefined && typeof restoreOcrGlyphs !== "function") throw new TypeError("native image OCR glyph restorer is invalid");
  if (refineGrayBorders !== undefined && typeof refineGrayBorders !== "function") throw new TypeError("native image gray border refiner is invalid");
  if (typeof preserveLocalFidelityImages !== "boolean") throw new TypeError("native image local fidelity policy is invalid");
  if (restoreOcrGlyphs && createFullSlideResidual && !preserveLocalFidelityImages) throw new TypeError("native image OCR glyph restoration requires preserved local images");
  return async ({ root, metadata, ocr, isCancellationRequested }) => {
    if (typeof root !== "string" || !path.isAbsolute(root) || !metadata || typeof metadata.inputFile !== "string") throw new TypeError("native image rebuild request is invalid");
    const workDir = path.join(root, "native-work");
    const normalizedDir = path.join(workDir, "normalized");
    const sourceFile = path.join(normalizedDir, "001.png");
    fs.mkdirSync(path.join(workDir, "ir"), { recursive: true });
    fs.mkdirSync(normalizedDir, { recursive: true });
    if (path.extname(metadata.inputFile).toLowerCase() === ".png") fs.copyFileSync(metadata.inputFile, sourceFile);
    else if (normalizeImageFile) await normalizeImageFile({ inputFile: metadata.inputFile, outputFile: sourceFile, dimensions: metadata.dimensions, isCancellationRequested });
    else throw new Error("native image rebuild requires a configured JPEG normalizer");
    if (await isCancellationRequested?.()) throw new Error("editable job was cancelled");
    // The shared resolver supports work-directory-relative image paths.
    const sourceDeck = boundedOcrSourceDeck({ metadata, ocr, sourceImage: "normalized/001.png" });
    const admittedSourceDeck = restoreOcrGlyphs ? boundedOcrSourceDeck({ metadata, ocr, sourceImage: "normalized/001.png", preserveUncertainGlyphs: true }) : sourceDeck;
    fs.writeFileSync(path.join(workDir, "ir", "deck.json"), `${JSON.stringify(sourceDeck)}\n`, "utf8");
    const components = resolveComponentIndexes ? await resolveComponentIndexes({ workDir, root, metadata, isCancellationRequested }) : undefined;
    if (await isCancellationRequested?.()) throw new Error("editable job was cancelled");
    const componentOptions = {};
    for (const name of ["componentStrategyIndex", "componentAssetIndex"]) {
      if (components?.[name] !== undefined) {
        if (!(components[name] instanceof Map)) throw new TypeError("native image component index is invalid");
        componentOptions[name] = components[name];
      }
    }
    const generatedDeck = rebuildDeckFromWorkDir(workDir, {
      ...createProductionNativeRebuildOptions(),
      ...componentOptions,
      pages: "1",
      irDir: root,
      assetDir: path.join(root, "assets"),
      deckName: "deck"
    });
    assertUnverifiedRegionTextPreserved(generatedDeck.pages[0], admittedSourceDeck.pages[0].textBoxes);
    if (components?.evidence) generatedDeck.pages[0].source = { ...generatedDeck.pages[0].source, componentAnalysis: components.evidence };
    if (restoreOcrGlyphs && admittedSourceDeck.meta.ocrAdmission.rasterFallbackGlyphs > 0) {
      const admittedIds = new Set(admittedSourceDeck.pages[0].textBoxes.map(item => item.id));
      const glyphs = sourceDeck.pages[0].textBoxes.filter(item => !admittedIds.has(item.id));
      const restored = await restoreOcrGlyphs({ page: generatedDeck.pages[0], slideSize: generatedDeck.slideSize, sourceFile, root, glyphs });
      if (restored?.restoredGlyphs !== glyphs.length) throw new Error("native image OCR glyph restoration is incomplete");
    }
    let semanticNative = applyKnowledgeGraphPanelNativeRebuild(generatedDeck?.pages?.[0], generatedDeck?.slideSize, {
      semanticTextBoxes: admittedSourceDeck.pages[0].textBoxes,
      sourceImageWidthPx: metadata?.dimensions?.widthPx
    });
    if (semanticNative.matched && refineSemanticImages) {
      const imageRefinement = await refineSemanticImages({ page: generatedDeck.pages[0], slideSize: generatedDeck.slideSize, sourceFile, root, metadata, isCancellationRequested });
      const pictorialConnectors = imageRefinement?.matched ? addKnowledgeGraphPictorialConnectors(generatedDeck.pages[0], generatedDeck.slideSize) : { matched: false, added: 0 };
      semanticNative = Object.freeze({ ...semanticNative, imageRefinement, pictorialConnectors });
    }
    if (semanticNative.matched && admitSemanticShapes) {
      // Reject unsupported geometry before computing erase masks, so its source
      // pixels remain available to the raster fallback.
      const page = generatedDeck.pages[0];
      const admission = await admitSemanticShapes({ page, slideSize: generatedDeck.slideSize, sourceFile });
      page.shapes = admission.shapes;
      semanticNative = Object.freeze({ ...semanticNative, addedShapes: semanticNative.addedShapes - admission.evidence.rejected, connectors: semanticNative.connectors - admission.evidence.rejected, shapeAdmission: admission.evidence });
      page.source.semanticNativeStructure.shapeAdmission = admission.evidence;
      if (admission.evidence.rejected > 0) page.intent.primarySemanticStructureNative = false;
    }
    if (createFullSlideResidual) {
      const residualAssetPath = "assets/deck-p01-full-residual.png";
      const page = generatedDeck?.pages?.[0];
      const slideSize = generatedDeck?.slideSize;
      if (!page || !Array.isArray(page.textBoxes) || !Number.isFinite(slideSize?.widthPt) || !Number.isFinite(slideSize?.heightPt)) throw new Error("native image rebuild produced an invalid page");
      const localFidelityImages = preserveLocalFidelityImages ? [...(Array.isArray(page.images) ? page.images : [])] : [];
      const omitFullSlideResidual = shouldOmitFullSlideResidual(semanticNative) && admittedSourceDeck.meta.ocrAdmission.rasterFallbackGlyphs === 0;
      if (omitFullSlideResidual) {
        ungroupHybridOverlayObjects(page);
        page.images = localFidelityImages;
        generatedDeck.meta = { ...(generatedDeck.meta || {}), semanticNative, reconstructionProfile: PRODUCTION_PROFILE_NAME, preservedLocalFidelityImages: localFidelityImages.length, fullSlideResidualOmitted: true, residualDeduplication: { candidateObjects: 0, erasedObjects: 0 } };
      } else {
      const eraseObjects = residualEraseObjects(page, { includeLocalFidelityImages: preserveLocalFidelityImages });
      const residual = await createFullSlideResidual({
        sourceFile,
        outputFile: path.join(root, ...residualAssetPath.split("/")),
        objects: eraseObjects,
        slideSize: { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt },
        isCancellationRequested
      });
      if (residual?.erasedObjects !== eraseObjects.length) throw new Error("native image residual deduplication is incomplete");
      ungroupHybridOverlayObjects(page);
      page.images = [{
        id: "full-slide-residual",
        type: "fidelity-crop",
        assetPath: residualAssetPath,
        box: { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt },
        style: { opacity: 1, assetPath: residualAssetPath, strategy: "full-slide-object-erased-residual" },
        source: {
          pageImage: metadata.assetPath,
          editable: false,
          residualCrop: true,
          fullSlideResidual: true,
          textObjectified: true,
          nativeObjectsErased: true,
          componentRenderStrategy: { mode: preserveLocalFidelityImages ? "preserve-crop-with-native-and-local-fidelity-overlays" : "preserve-crop-with-native-overlays" },
          strategy: "full-slide-object-erased-residual",
          nonEditableReason: "Complex pictorial details are preserved after independently editable text and native objects are removed from the residual."
        }
      }, ...localFidelityImages];
      generatedDeck.meta = { ...(generatedDeck.meta || {}), semanticNative, reconstructionProfile: PRODUCTION_PROFILE_NAME, preservedLocalFidelityImages: localFidelityImages.length, residualDeduplication: { candidateObjects: eraseObjects.length, erasedObjects: residual.erasedObjects } };
      }
    }
    generatedDeck.meta = { ...(generatedDeck.meta || {}), reconstructionProfile: PRODUCTION_PROFILE_NAME, ocrAdmission: admittedSourceDeck.meta.ocrAdmission };
    copyDirectoryFiles(path.join(workDir, "ir", "assets"), path.join(root, "assets"));
    if (semanticNative.matched && refineGrayBorders) {
      const grayBorderRefinement = await refineGrayBorders({ page: generatedDeck.pages[0], slideSize: generatedDeck.slideSize, sourceFile, root, isCancellationRequested });
      generatedDeck.meta = { ...generatedDeck.meta, grayBorderRefinement };
    }
    normalizeSourceAssetProvenance(generatedDeck, metadata.assetPath);
    compactTeamComponentEvidence(generatedDeck);
    const nativeComponentQuality = auditNativeComponentQuality(generatedDeck);
    generatedDeck.meta = { ...(generatedDeck.meta || {}), nativeComponentQuality };
    const metrics = nativeObjectMetrics(generatedDeck);
    return Object.freeze({ deck: generatedDeck, metrics, sourceImage: sourceFile, residual: generatedDeck.meta?.residualDeduplication || null, reconstructionProfile: PRODUCTION_PROFILE_NAME, nativeComponentQuality });
  };
}

module.exports = { boundedOcrSourceDeck, correctContextualOcrLines, createRawImageNativeRebuilder, nativeObjectMetrics, normalizeSourceAssetProvenance, residualEraseObjects, shouldOmitFullSlideResidual, ungroupHybridOverlayObjects };
