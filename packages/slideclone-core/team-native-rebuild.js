"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { applyKnowledgeGraphPanelNativeRebuild } = require("./knowledge-graph-native");

const MAX_OCR_LINES = 10000;

function correctContextualOcrLines(lines) {
  const hasCanonicalAiAgent = lines.some((line) => typeof line?.text === "string" && /\bAI\s*Agent\b/.test(line.text));
  if (!hasCanonicalAiAgent) return lines;
  return lines.map((line) => typeof line?.text === "string" && /\bAl\s+Agent\b/.test(line.text)
    ? { ...line, text: line.text.replace(/\bAl(?=\s+Agent\b)/g, "AI") }
    : line);
}

function boundedOcrSourceDeck({ metadata, ocr, sourceImage }) {
  if (!metadata?.dimensions || !Number.isSafeInteger(metadata.dimensions.widthPx) || !Number.isSafeInteger(metadata.dimensions.heightPx)) {
    throw new TypeError("native image rebuild dimensions are invalid");
  }
  if (typeof sourceImage !== "string" || !sourceImage || path.isAbsolute(sourceImage) || sourceImage.includes("\0")) {
    throw new TypeError("native image rebuild source path is invalid");
  }
  const lines = correctContextualOcrLines(Array.isArray(ocr?.lines) ? ocr.lines : []);
  if (lines.length > MAX_OCR_LINES) throw new Error("native image rebuild OCR result exceeds limits");
  const widthPt = 960;
  const heightPt = Math.max(72, Math.min(4000, Math.round(widthPt * metadata.dimensions.heightPx / metadata.dimensions.widthPx)));
  const scaleX = widthPt / metadata.dimensions.widthPx;
  const scaleY = heightPt / metadata.dimensions.heightPx;
  const textBoxes = lines.map((line, index) => {
    if (!line || typeof line.text !== "string" || !line.text.trim() || line.text.length > 512 || !line.box
      || !["x", "y", "w", "h"].every((key) => Number.isFinite(line.box[key]))) {
      throw new Error("native image rebuild OCR result is invalid");
    }
    const box = { x: line.box.x * scaleX, y: line.box.y * scaleY, w: line.box.w * scaleX, h: line.box.h * scaleY };
    if (box.x < 0 || box.y < 0 || box.w <= 0 || box.h <= 0 || box.x + box.w > widthPt || box.y + box.h > heightPt) {
      throw new Error("native image rebuild OCR box is invalid");
    }
    return {
      id: `p0-ocr-${String(index + 1).padStart(3, "0")}`,
      role: "body",
      text: line.text.trim(),
      box,
      font: { family: "Microsoft YaHei", sizePt: Math.max(6, Math.min(36, box.h * 0.72)), color: "#111111", opacity: 0, weight: "regular", align: "left", valign: "middle" },
      style: { visibility: "hidden", opacity: 0, marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0 },
      source: { pageImage: sourceImage, ocrProvider: "team-pinned-ocr", confidence: Number.isFinite(line.confidence) ? line.confidence : 1, evidenceBox: box, editable: true, overlayVisibility: "hidden" }
    };
  });
  return {
    version: "1.0",
    meta: { source: "team-raw-image", reconstructionMode: "native-hybrid" },
    slideSize: { widthPt, heightPt },
    pages: [{ pageIndex: 0, sourceImage, background: { fill: "#FFFFFF" }, textBoxes, shapes: [], images: [], tables: [], charts: [], icons: [] }]
  };
}

function nativeObjectMetrics(deck) {
  const totals = { shapes: 0, connectors: 0, textBoxes: 0, tables: 0, charts: 0, icons: 0, images: 0 };
  for (const page of Array.isArray(deck?.pages) ? deck.pages : []) {
    for (const key of ["shapes", "textBoxes", "tables", "charts", "icons", "images"]) totals[key] += Array.isArray(page?.[key]) ? page[key].length : 0;
    totals.connectors += (Array.isArray(page?.shapes) ? page.shapes : []).filter((shape) => shape?.type === "line" || shape?.type === "connector" || shape?.source?.connector === true).length;
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

function residualEraseObjects(page) {
  if (!page || typeof page !== "object" || Array.isArray(page)) throw new TypeError("native image residual page is invalid");
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
  return objects;
}

function createRawImageNativeRebuilder({ rebuildDeckFromWorkDir, normalizeImageFile, createFullSlideResidual } = {}) {
  if (typeof rebuildDeckFromWorkDir !== "function") throw new TypeError("native image rebuild implementation is required");
  if (normalizeImageFile !== undefined && typeof normalizeImageFile !== "function") throw new TypeError("native image normalizer is invalid");
  if (createFullSlideResidual !== undefined && typeof createFullSlideResidual !== "function") throw new TypeError("native image residual builder is invalid");
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
    const sourceDeck = boundedOcrSourceDeck({ metadata, ocr, sourceImage: "../normalized/001.png" });
    fs.writeFileSync(path.join(workDir, "ir", "deck.json"), `${JSON.stringify(sourceDeck)}\n`, "utf8");
    const generatedDeck = rebuildDeckFromWorkDir(workDir, {
      pages: "1",
      preserveGraphics: true,
      vectorizeStatusIcons: true,
      objectifyLayerText: true,
      objectifyLayerContainers: true,
      objectifyLayerConnectors: true,
      eraseObjectifiedLayerPrimitives: true,
      splitErasedResidualCrops: true,
      objectifyTableGrid: true,
      objectifyValueBanners: true,
      irDir: root,
      assetDir: path.join(root, "assets"),
      deckName: "deck"
    });
    const semanticNative = applyKnowledgeGraphPanelNativeRebuild(generatedDeck?.pages?.[0], generatedDeck?.slideSize);
    if (createFullSlideResidual) {
      const residualAssetPath = "assets/deck-p01-full-residual.png";
      const page = generatedDeck?.pages?.[0];
      const slideSize = generatedDeck?.slideSize;
      if (!page || !Array.isArray(page.textBoxes) || !Number.isFinite(slideSize?.widthPt) || !Number.isFinite(slideSize?.heightPt)) throw new Error("native image rebuild produced an invalid page");
      const eraseObjects = residualEraseObjects(page);
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
          textObjectified: true,
          nativeObjectsErased: true,
          strategy: "full-slide-object-erased-residual",
          nonEditableReason: "Complex pictorial details are preserved after independently editable text and native objects are removed from the residual."
        }
      }];
      generatedDeck.meta = { ...(generatedDeck.meta || {}), semanticNative, residualDeduplication: { candidateObjects: eraseObjects.length, erasedObjects: residual.erasedObjects } };
    }
    normalizeSourceAssetProvenance(generatedDeck, metadata.assetPath);
    const metrics = nativeObjectMetrics(generatedDeck);
    if (metrics.graphicalObjects < 1) throw new Error("native image rebuild produced no editable graphical objects");
    copyDirectoryFiles(path.join(workDir, "ir", "assets"), path.join(root, "assets"));
    return Object.freeze({ deck: generatedDeck, metrics, sourceImage: sourceFile, residual: generatedDeck.meta?.residualDeduplication || null });
  };
}

module.exports = { boundedOcrSourceDeck, correctContextualOcrLines, createRawImageNativeRebuilder, nativeObjectMetrics, normalizeSourceAssetProvenance, residualEraseObjects, ungroupHybridOverlayObjects };
