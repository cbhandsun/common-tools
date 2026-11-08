"use strict";

const { createNativeUnderlayRemovalProposal } = require("./native-underlay-removal-proposal");
const { largeRasterEditability, nativeObjectMetrics, qualityRendered } = require("./worker-output-services");
const { createArchiveAdmission } = require("./worker-input-services");
const { assertEditableInputDocument } = require("./worker-input-services");
const { createStrictNativeCandidatePolicy, hasMeasuredVisualGain } = require("./candidate-quality-policy");
const { remainingWorkerTimeout, runWorkerStage, recordWorkerCandidateDecision } = require("./worker-budget-runner");
const { componentFidelityTargetBox, componentWorstPriority, componentWorstRole, finalRefinementQualityAcceptable, nativeOnlyResidualQualityAcceptable, sharedWorstComponentRegression } = require('./worker-quality-policy');
const { createProvisionalNativeSearch } = require("./provisional-native-search");
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const { safeAssetPath, admitRebuiltPage } = require("./worker-input-services");
const { admitRebuiltPageMetadata } = require("./worker-input-services");
const { residualDeduplicationStatus } = require('./worker-native-recovery');
const { admitOcrResult } = require("./worker-input-services");
const { WorkerFailure } = require("./worker-output-services");
const { admitTemplateBuild } = require("./worker-input-services");
const { run: runProcess } = require("./worker-output-services");
const { MAX_ARTIFACT_BYTES: MAX_PPTX_BYTES } = require("./worker-output-services");
const { readZipEntries } = require("./worker-input-services");
const { colorBrightness, colorDistance, isFiniteBox, isRaster } = require('./worker-primitives');

const proposeNativeUnderlayRemoval = createNativeUnderlayRemovalProposal({ largeRasterEditability });

const { validatePackage, validateDocumentPackage, readRawImageDimensions } = createArchiveAdmission(assertEditableInputDocument);

const assessStrictNativeCandidate = createStrictNativeCandidatePolicy({ recordDecision: recordWorkerCandidateDecision,
  assessRasterRemoval: nativeOnlyResidualQualityAcceptable });

const searchProvisionalNativeCandidate = createProvisionalNativeSearch({ assess: assessStrictNativeCandidate, qualityAcceptable: finalRefinementQualityAcceptable, hasMeasuredGain: hasMeasuredVisualGain });

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }

function assertObjectStore(objectStore) {
  if (!objectStore || typeof objectStore.readObject !== "function" || typeof objectStore.putObject !== "function") throw new TypeError("team object store does not support worker I/O");
  return objectStore;
}

function allPagesHaveNativeGraphics(deck) {
  return Array.isArray(deck?.pages) && deck.pages.length > 0 && deck.pages.every((page) => nativeObjectMetrics({ pages: [page] }).graphicalObjects > 0);
}

const {namespaceRawPageAssets}=require('./worker-asset-namespace');

async function rebuildRawImages({ root, metadata, rawImageOcr, rawImageRebuilder, isCancellationRequested, ocrCheckpoint, job, ocrResults = new Map(), recoverOcrCropText = false, recoveryScope = null }) {
  const pageDecks = []; const sourceImages = []; const reconstructionProfiles = []; const componentQuality = [];
  let slideSize; let candidateObjects = 0; let erasedObjects = 0; let ocrSourceLines = 0; let ocrRecoveredLines = 0; let ocrCropsErased = 0;
  for (const source of metadata.sources) {
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const pageRoot = path.join(root, ".raw-pages", String(source.pageIndex + 1).padStart(3, "0"));
    fs.mkdirSync(path.join(pageRoot, "assets"), { recursive: true });
    fs.copyFileSync(source.inputFile, path.join(pageRoot, ...source.assetPath.split("/")));
    const runOcr = () => rawImageOcr({ inputFile: source.inputFile, dimensions: source.dimensions, pageIndex: source.pageIndex, isCancellationRequested });
    let ocr = ocrResults.get(source.pageIndex);
    if (!ocr) {
      ocr = await runWorkerStage("IMAGE_OCR_FAILED", async () => admitOcrResult(await (ocrCheckpoint ? ocrCheckpoint({ job, source, runOcr, isCancellationRequested }) : runOcr()), source.dimensions));
      ocrResults.set(source.pageIndex, ocr);
    }
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const rebuilt = await runWorkerStage("IMAGE_REBUILD_FAILED", () => rawImageRebuilder({ root: pageRoot, metadata: source, ocr, pageIndex: source.pageIndex, isCancellationRequested, recoverOcrCropText, ...(recoveryScope ? { recoverOcrCropIds: recoveryScope.pageIndex === source.pageIndex ? [recoveryScope.cropId] : [] } : {}) }));
    let deck = admitRebuiltPage(rebuilt, pageRoot);
    const details = admitRebuiltPageMetadata(rebuilt, { pageRoot, sourceInputFile: source.inputFile });
    if (!slideSize) slideSize = deck.slideSize;
    else if (deck.slideSize?.widthPt !== slideSize.widthPt || deck.slideSize?.heightPt !== slideSize.heightPt) throw new Error("raw image batch sources must have a consistent slide aspect ratio");
    try { deck = namespaceRawPageAssets(deck, pageRoot, root, source.pageIndex + 1); }
    catch (error) { throw new WorkerFailure("IMAGE_ASSET_NAMESPACE_FAILED", { cause: error }); }
    deck.pages[0].pageIndex = source.pageIndex; pageDecks.push(deck.pages[0]); sourceImages.push(details.sourceImage);
    const residual = residualDeduplicationStatus(deck, details.residual);
    if (residual.required && !residual.passed) throw new Error(`native image residual deduplication is incomplete for page ${source.pageIndex + 1}`);
    candidateObjects += residual.candidateObjects; erasedObjects += residual.erasedObjects;
    reconstructionProfiles.push(details.reconstructionProfile);
    if (details.nativeComponentQuality) componentQuality.push(details.nativeComponentQuality);
    ocrSourceLines += details.ocrCropRecovery?.sourceLines || 0;
    ocrRecoveredLines += details.ocrCropRecovery?.recovered || 0;
    ocrCropsErased += details.ocrCropRecovery?.cropsErased || 0;
  }
  const distinctProfiles = new Set(reconstructionProfiles);
  const reconstructionProfile = distinctProfiles.size === 1 && reconstructionProfiles[0] !== null ? reconstructionProfiles[0] : null;
  const deck = { version: "1.0", meta: { source: "team-raw-image-batch", reconstructionMode: "native-hybrid", reconstructionProfile, sourceCount: metadata.sources.length, ocrCropRecovery: { sourceLines: ocrSourceLines, recovered: ocrRecoveredLines, cropsErased: ocrCropsErased } }, slideSize, pages: pageDecks };
  const nativeComponentQuality = componentQuality.length === 0 ? null : {
    passed: componentQuality.length === metadata.sources.length && componentQuality.every((item) => item.passed),
    pagesAudited: componentQuality.length,
    connectors: componentQuality.reduce((sum, item) => sum + (item.metrics?.connectors || 0), 0),
    minimumUnitCrops: componentQuality.reduce((sum, item) => sum + (item.metrics?.minimumUnitCrops || 0), 0),
    evidencedMinimumUnitCrops: componentQuality.reduce((sum, item) => sum + (item.metrics?.evidencedMinimumUnitCrops || 0), 0),
    unverifiedMinimumUnitCrops: componentQuality.reduce((sum, item) => sum + (item.metrics?.unverifiedMinimumUnitCrops || 0), 0),
    ignoredPixelPrimitives: componentQuality.reduce((sum, item) => sum + (item.metrics?.ignoredPixelPrimitives || 0), 0),
  };
  return { deck, sourceImages, residual: { candidateObjects, erasedObjects }, reconstructionProfile, nativeComponentQuality, ocrCropRecovery: { sourceLines: ocrSourceLines, recovered: ocrRecoveredLines, cropsErased: ocrCropsErased } };
}

async function runBuilder({ executable, builderArgs = [], deckFile, outputFile, cwd, timeoutMs, isCancellationRequested }) {
  if (typeof executable !== "string" || !path.isAbsolute(executable)) throw new Error("OpenXML builder executable is invalid");
  if (!Array.isArray(builderArgs) || builderArgs.some((arg) => typeof arg !== "string" || !arg)) throw new TypeError("OpenXML builder arguments are invalid");
  if (await isCancellationRequested()) throw new Error("editable job was cancelled");
  await admitTemplateBuild({executable, builderArgs, deckFile, cwd, timeoutMs: remainingWorkerTimeout(timeoutMs), isCancellationRequested});
  await runProcess(executable, [...builderArgs, "--ir", deckFile, "--out", outputFile, "--powerpoint-safe", "true"], { cwd, timeout: remainingWorkerTimeout(timeoutMs), maxBuffer: 1024 * 1024, isCancellationRequested });
  assertBuiltPptx(outputFile);
}

function assertBuiltPptx(pptxFile) {
  if (typeof pptxFile !== "string" || !path.isAbsolute(pptxFile)) throw new TypeError("editable builder output path is invalid");
  if (!fs.existsSync(pptxFile) || !fs.statSync(pptxFile).isFile() || fs.statSync(pptxFile).size < 1 || fs.statSync(pptxFile).size > MAX_PPTX_BYTES) {
    throw new Error("editable builder produced an invalid artifact");
  }
  let entries;
  try {
    entries = readZipEntries(fs.readFileSync(pptxFile), { maxArchiveBytes: MAX_PPTX_BYTES, maxEntries: 20000, maxEntryBytes: 16 * 1024 * 1024 });
  } catch (error) {
    throw new Error("editable builder produced an invalid PPTX package", { cause: error });
  }
  const names = new Set(entries.map((entry) => entry.name));
  if (!names.has("[Content_Types].xml") || !names.has("ppt/presentation.xml")) {
    throw new Error("editable builder produced an incomplete PPTX package");
  }
}

function changedComponentKeysFromFit(fitted, priorityIds = new Map()) {
  const keys = Array.isArray(fitted?.changedComponentKeys) ? fitted.changedComponentKeys.filter((key) => typeof key === "string" && key) : [];
  if (keys.length > 0) return new Set(keys);
  return priorityIds instanceof Map ? new Set(priorityIds.keys()) : new Set();
}

function lineSourcePixelMatchesStroke(color, stroke) {
  if (color.a <= 64 || colorDistance(color, stroke) > 36) return false;
  return colorBrightness(color) < 252 || colorDistance(color, { r: 255, g: 255, b: 255, a: 255 }) > 10;
}

function nativeShapeThinStrokeMultipliers() {
  return [0.86, 0.75, 0.66, 0.58];
}

function cardSideAttachmentMatchesGeometry(accent, oldBox) {
  if (!accent?.box || !oldBox) return false;
  const side = String(accent?.source?.side || accent?.source?.supportedSide || "");
  const box = accent.box;
  const tolerance = Math.max(1.5, Math.min(9, Math.max(Number(oldBox.w || 0), Number(oldBox.h || 0)) * 0.075));
  const x1 = Number(box.x || 0);
  const x2 = x1 + Math.max(0, Number(box.w || 0));
  const y1 = Number(box.y || 0);
  const y2 = y1 + Math.max(0, Number(box.h || 0));
  if (side === "left" || side === "right") {
    const edgeX = side === "left" ? Number(oldBox.x || 0) : Number(oldBox.x || 0) + Number(oldBox.w || 0);
    const overlap = Math.min(y2, Number(oldBox.y || 0) + Number(oldBox.h || 0)) - Math.max(y1, Number(oldBox.y || 0));
    return Math.abs(x1 - edgeX) <= tolerance && overlap >= Math.max(1, Math.min(Number(oldBox.h || 0), Math.max(0, y2 - y1)) * 0.45);
  }
  if (side === "top" || side === "bottom") {
    const edgeY = side === "top" ? Number(oldBox.y || 0) : Number(oldBox.y || 0) + Number(oldBox.h || 0);
    const overlap = Math.min(x2, Number(oldBox.x || 0) + Number(oldBox.w || 0)) - Math.max(x1, Number(oldBox.x || 0));
    return Math.abs(y1 - edgeY) <= tolerance && overlap >= Math.max(1, Math.min(Number(oldBox.w || 0), Math.max(0, x2 - x1)) * 0.45);
  }
  return false;
}

function collectWorstComponentPrimitiveTargets(deck, visualQuality, maximumTargets = 24, targetKinds = null) {
  const priorityIds = componentWorstPriority(visualQuality);
  if (priorityIds.size < 1 || !Array.isArray(deck?.pages)) return [];
  const targets = [];
  const allowedKinds = Array.isArray(targetKinds) && targetKinds.length > 0 ? new Set(targetKinds.map((kind) => String(kind))) : null;
  for (let pageIndex = 0; pageIndex < deck.pages.length; pageIndex += 1) {
    const page = deck.pages[pageIndex];
    for (const shape of Array.isArray(page?.shapes) ? page.shapes : []) {
      if (allowedKinds && !allowedKinds.has("shape")) continue;
      const key = `${pageIndex}:${String(shape?.id || "")}`;
      if (!priorityIds.has(key)) continue;
      const box = componentFidelityTargetBox(shape);
      if (box) targets.push({
        pageIndex,
        id: String(shape.id),
        kind: "shape",
        role: componentWorstRole(visualQuality, pageIndex, shape.id),
        box,
        geometryBox: isFiniteBox(shape.box) ? { ...shape.box } : null,
        strokeWidthPt: Number.isFinite(Number(shape?.style?.strokeWidthPt)) ? Number(shape.style.strokeWidthPt) : null,
        priority: priorityIds.get(key)
      });
    }
    for (const textBox of Array.isArray(page?.textBoxes) ? page.textBoxes : []) {
      if (allowedKinds && !allowedKinds.has("text")) continue;
      const key = `${pageIndex}:${String(textBox?.id || "")}`;
      if (!priorityIds.has(key)) continue;
      const box = componentFidelityTargetBox(textBox);
      if (box) targets.push({ pageIndex, id: String(textBox.id), kind: "text", role: componentWorstRole(visualQuality, pageIndex, textBox.id), box, priority: priorityIds.get(key) });
    }
  }
  for (const item of Array.isArray(visualQuality?.componentWorst) ? visualQuality.componentWorst : []) {
    if (allowedKinds && !allowedKinds.has("missing")) continue;
    if (item?.role !== "missing-native-component" || item?.kind !== "missing") continue;
    if (!Number.isSafeInteger(item.pageIndex) || !deck.pages[item.pageIndex] || typeof item.id !== "string" || !item.id) continue;
    const key = `${item.pageIndex}:${item.id}`;
    if (!priorityIds.has(key) || targets.some((target) => target.pageIndex === item.pageIndex && target.id === item.id)) continue;
    if (!isFiniteBox(item.box) || Number(item.box.w) <= 0 || Number(item.box.h) <= 0) continue;
    targets.push({
      pageIndex: item.pageIndex,
      id: item.id,
      kind: "missing",
      role: "missing-native-component",
      box: { x: Number(item.box.x), y: Number(item.box.y), w: Number(item.box.w), h: Number(item.box.h) },
      priority: priorityIds.get(key)
    });
  }
  return targets.sort((left, right) => left.priority - right.priority).slice(0, Math.max(0, maximumTargets));
}

function mergeVerticalComponentPrimitiveRuns(runs, scaleX, scaleY, target, limit) {
  const merged = [];
  const active = new Map();
  let order = 0;
  for (const run of runs) {
    const key = `${run.start}:${run.length}:${run.fill}`;
    const current = active.get(key);
    if (current && current.lastY === run.y - 1) {
      current.lastY = run.y;
      current.score += Number(run.score || 0);
      continue;
    }
    if (current) merged.push(current);
    active.set(key, { start: run.start, length: run.length, fill: run.fill, firstY: run.y, lastY: run.y, score: Number(run.score || 0), order: order++ });
  }
  for (const current of active.values()) merged.push(current);
  return merged
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .slice(0, Math.max(0, limit))
    .sort((left, right) => left.firstY - right.firstY || left.start - right.start || left.length - right.length)
    .map((run) => ({
      type: "rect",
      box: { x: run.start / scaleX, y: run.firstY / scaleY, w: run.length / scaleX, h: (run.lastY - run.firstY + 1) / scaleY },
      style: { fill: run.fill },
      sourceComponentId: target.id,
      sourceComponentKind: target.kind
    }));
}

function insideComponentPrimitiveTargetGeometry(slideX, slideY, target) {
  if (target?.role !== "container-border") return true;
  const box = target.geometryBox || target.box;
  if (!box) return true;
  const strokeWidthPt = Number(target.strokeWidthPt);
  const corridorPt = Math.max(2, Math.min(8, (Number.isFinite(strokeWidthPt) && strokeWidthPt > 0 ? strokeWidthPt : 1) * 1.75 + 1));
  const horizontal = slideX >= box.x - corridorPt
    && slideX <= box.x + box.w + corridorPt
    && (Math.abs(slideY - box.y) <= corridorPt || Math.abs(slideY - box.y - box.h) <= corridorPt);
  const vertical = slideY >= box.y
    && slideY <= box.y + box.h
    && (Math.abs(slideX - box.x) <= corridorPt || Math.abs(slideX - box.x - box.w) <= corridorPt);
  return horizontal || vertical;
}

function unionManyPtBoxes(boxes) {
  if (!Array.isArray(boxes) || boxes.length < 1) return null;
  return boxes.reduce((acc, box) => acc ? unionPtBoxes(acc, box) : { ...box }, null);
}

function lineBoxesHaveGaps(boxes, orientation, thickness) {
  for (let index = 1; index < boxes.length; index += 1) {
    const previous = boxes[index - 1];
    const current = boxes[index];
    const gap = orientation === "horizontal"
      ? Number(current.x) - (Number(previous.x) + Number(previous.w))
      : Number(current.y) - (Number(previous.y) + Number(previous.h));
    if (gap > Math.max(1.5, thickness * 1.5)) return true;
  }
  return false;
}

function boxesNear(left, right) {
  if (!isFiniteBox(left) || !isFiniteBox(right)) return false;
  const leftOrientation = boxDominantOrientation(left);
  const rightOrientation = boxDominantOrientation(right);
  const leftCx = Number(left.x) + Number(left.w) / 2;
  const rightCx = Number(right.x) + Number(right.w) / 2;
  const leftCy = Number(left.y) + Number(left.h) / 2;
  const rightCy = Number(right.y) + Number(right.h) / 2;
  const gapX = Math.max(0, Math.max(left.x, right.x) - Math.min(left.x + left.w, right.x + right.w));
  const gapY = Math.max(0, Math.max(left.y, right.y) - Math.min(left.y + left.h, right.y + right.h));
  const scale = Math.max(8, Math.min(36, Math.max(left.w, left.h, right.w, right.h) * 1.25));
  if (leftOrientation === "horizontal" || rightOrientation === "horizontal") {
    if (leftOrientation !== rightOrientation) return false;
    const rowTolerance = Math.max(3, Math.min(10, Math.max(Number(left.h), Number(right.h)) * 2.5));
    return Math.abs(leftCy - rightCy) <= rowTolerance && gapX <= scale;
  }
  if (leftOrientation === "vertical" || rightOrientation === "vertical") {
    if (leftOrientation !== rightOrientation) return false;
    const columnTolerance = Math.max(3, Math.min(10, Math.max(Number(left.w), Number(right.w)) * 2.5));
    return Math.abs(leftCx - rightCx) <= columnTolerance && gapY <= scale;
  }
  return gapX <= scale && gapY <= scale;
}

function boxDominantOrientation(box) {
  if (!isFiniteBox(box)) return "block";
  const width = Number(box.w);
  const height = Number(box.h);
  if (width >= height * 2.2) return "horizontal";
  if (height >= width * 2.2) return "vertical";
  return "block";
}

function unionPtBoxes(left, right) {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const maxX = Math.max(left.x + left.w, right.x + right.w);
  const maxY = Math.max(left.y + left.h, right.y + right.h);
  return { x, y, w: maxX - x, h: maxY - y };
}

function intersectPtBoxes(left, right) {
  if (!isFiniteBox(left) || !isFiniteBox(right)) return null;
  const x = Math.max(Number(left.x), Number(right.x));
  const y = Math.max(Number(left.y), Number(right.y));
  const maxX = Math.min(Number(left.x) + Number(left.w), Number(right.x) + Number(right.w));
  const maxY = Math.min(Number(left.y) + Number(left.h), Number(right.y) + Number(right.h));
  if (maxX <= x || maxY <= y) return null;
  return { x, y, w: maxX - x, h: maxY - y };
}

function ptBoxOverlapArea(left, right) {
  if (!isFiniteBox(left) || !isFiniteBox(right)) return 0;
  return Math.max(0, Math.min(Number(left.x) + Number(left.w), Number(right.x) + Number(right.w)) - Math.max(Number(left.x), Number(right.x)))
    * Math.max(0, Math.min(Number(left.y) + Number(left.h), Number(right.y) + Number(right.h)) - Math.max(Number(left.y), Number(right.y)));
}

function expandPtBox(box, paddingPt, slideSize) {
  const left = Math.max(0, Number(box.x) - paddingPt);
  const top = Math.max(0, Number(box.y) - paddingPt);
  const right = Math.min(Number(slideSize.widthPt), Number(box.x) + Number(box.w) + paddingPt);
  const bottom = Math.min(Number(slideSize.heightPt), Number(box.y) + Number(box.h) + paddingPt);
  return { x: left, y: top, w: Math.max(0.01, right - left), h: Math.max(0.01, bottom - top) };
}

function isEditableJobCancellation(error) {
  return error instanceof Error && /editable job was cancelled/iu.test(error.message);
}

function cropRaster(raster, box) {
  const out = { width: box.w, height: box.h, rgba: Buffer.alloc(box.w * box.h * 4) };
  for (let y = 0; y < box.h; y += 1) for (let x = 0; x < box.w; x += 1) {
    const sourceOffset = ((box.y + y) * raster.width + box.x + x) * 4;
    const targetOffset = (y * box.w + x) * 4;
    out.rgba[targetOffset] = raster.rgba[sourceOffset] ?? 0;
    out.rgba[targetOffset + 1] = raster.rgba[sourceOffset + 1] ?? 0;
    out.rgba[targetOffset + 2] = raster.rgba[sourceOffset + 2] ?? 0;
    out.rgba[targetOffset + 3] = raster.rgba[sourceOffset + 3] ?? 0;
  }
  return out;
}

function resolveDeckAssetFile(root, assetPath) {
  try {
    return path.join(root, ...safeAssetPath(assetPath).split("/"));
  } catch {
    return null;
  }
}

function rasterPixel(raster, x, y) {
  if (!isRaster(raster) || x < 0 || y < 0 || x >= raster.width || y >= raster.height) return null;
  const offset = (Math.floor(y) * raster.width + Math.floor(x)) * 4;
  return {
    r: raster.rgba[offset] ?? 0,
    g: raster.rgba[offset + 1] ?? 0,
    b: raster.rgba[offset + 2] ?? 0,
    a: raster.rgba[offset + 3] ?? 0
  };
}

function prioritizeComponentWorstByContribution(quality, { targetKinds = [] } = {}) {
  if (!quality || !Array.isArray(quality.componentWorst) || quality.componentWorst.length < 2) return quality;
  const allowed = new Set(Array.isArray(targetKinds) ? targetKinds.map((item) => String(item)) : []);
  const prioritized = [...quality.componentWorst].sort((left, right) => {
    const leftAllowed = allowed.size < 1 || allowed.has(String(left?.kind || ""));
    const rightAllowed = allowed.size < 1 || allowed.has(String(right?.kind || ""));
    if (leftAllowed !== rightAllowed) return Number(rightAllowed) - Number(leftAllowed);
    const leftScore = Number(left?.contributionScore || 0);
    const rightScore = Number(right?.contributionScore || 0);
    if (leftScore !== rightScore) return rightScore - leftScore;
    return Number(right?.severity || 0) - Number(left?.severity || 0);
  });
  return { ...quality, componentWorst: prioritized };
}

function nativeOnlyRefinementImproves({ baselineQuality, candidateQuality }) {
  if (!qualityRendered(baselineQuality) || !qualityRendered(candidateQuality)) return false;
  const before = baselineQuality.metrics || {};
  const after = candidateQuality.metrics || {};
  const pixelBefore = Number(before["pixel-diff-ratio"]);
  const pixelAfter = Number(after["pixel-diff-ratio"]);
  const missingBefore = Number(before["foreground-missing-ratio"]);
  const missingAfter = Number(after["foreground-missing-ratio"]);
  const deltaBefore = Number(before["mean-absolute-delta"]);
  const deltaAfter = Number(after["mean-absolute-delta"]);
  if (![pixelBefore, pixelAfter, missingBefore, missingAfter, deltaBefore, deltaAfter].every(Number.isFinite)) return false;
  return pixelAfter < pixelBefore - 0.0002
    && missingAfter <= missingBefore + 0.002
    && deltaAfter <= deltaBefore + 0.1;
}

function nativeOnlyRefinementDoesNotMateriallyRegress({ baselineQuality, candidateQuality }) {
  if (!qualityRendered(baselineQuality) || !qualityRendered(candidateQuality)) return false;
  if (sharedWorstComponentRegression({ baselineQuality, candidateQuality }) > 0.08) return false;
  const before = baselineQuality.metrics || {};
  const after = candidateQuality.metrics || {};
  const pixelBefore = Number(before["pixel-diff-ratio"]);
  const pixelAfter = Number(after["pixel-diff-ratio"]);
  const missingBefore = Number(before["foreground-missing-ratio"]);
  const missingAfter = Number(after["foreground-missing-ratio"]);
  const deltaBefore = Number(before["mean-absolute-delta"]);
  const deltaAfter = Number(after["mean-absolute-delta"]);
  if (![pixelBefore, pixelAfter, missingBefore, missingAfter, deltaBefore, deltaAfter].every(Number.isFinite)) return false;
  return pixelAfter <= pixelBefore + 0.0005
    && missingAfter <= missingBefore + 0.002
    && deltaAfter <= deltaBefore + 0.15;
}

module.exports = { proposeNativeUnderlayRemoval, validatePackage, validateDocumentPackage, readRawImageDimensions, assessStrictNativeCandidate, searchProvisionalNativeCandidate, sha256, assertObjectStore, allPagesHaveNativeGraphics, namespaceRawPageAssets, rebuildRawImages, runBuilder, assertBuiltPptx, changedComponentKeysFromFit, lineSourcePixelMatchesStroke, nativeShapeThinStrokeMultipliers, cardSideAttachmentMatchesGeometry, collectWorstComponentPrimitiveTargets, mergeVerticalComponentPrimitiveRuns, insideComponentPrimitiveTargetGeometry, unionManyPtBoxes, lineBoxesHaveGaps, boxesNear, boxDominantOrientation, unionPtBoxes, intersectPtBoxes, ptBoxOverlapArea, expandPtBox, isEditableJobCancellation, cropRaster, resolveDeckAssetFile, rasterPixel, prioritizeComponentWorstByContribution, nativeOnlyRefinementImproves, nativeOnlyRefinementDoesNotMateriallyRegress };
