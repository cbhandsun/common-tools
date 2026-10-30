// @ts-check
"use strict";

const {sampleLightOcrInkColor}=require("./ocr-light-ink-color");
const { hasTallPunctuationGraphicInk } = require("./ocr-punctuation-graphic-evidence");
const { framedGraphicEvidence } = require("./ocr-framed-graphic-evidence");
const { admitOcrConfidenceEvidence } = require("./ocr-confidence-evidence");
const { inspectSourceGraphicEvidence } = require("./ocr-source-graphic-evidence");
const { admitOcrPolygon, projectOcrPolygon, projectOcrTextBox } = require("./ocr-text-quadrilateral");
const { admitOcrWordPositionHints } = require("./ocr-word-position-hints");
const { registerSourceWordLayout, registerSourceWordColorSegments, validateSourceWordLayoutSession } = require("../typography/source-word-layout-registry");
const { createInkCoreConsensus } = require("../scene-plan/source-ink-core-consensus");
const {sourceLabelIdentity}=require('../scene-plan/source-label-identity');

const MAX_OCR_LINES = 10000;
const MAX_IMAGE_DIMENSION = 16384;
const MAX_IMAGE_PIXELS = 40000000;
const GLYPH_MIN_CONFIDENCE = 0.8;
const MIXED_COLOR_MIN_TEXT_LENGTH = 8;
const MIXED_COLOR_MAX_TEXT_LENGTH = 72;
const MIXED_COLOR_MAX_SEGMENT_TEXT_LENGTH = 160;
const MIXED_COLOR_MAX_RUNS = 4;
const MIXED_COLOR_MIN_SEGMENT_WIDTH_PX = 4;

/** @typedef {{ x: number, y: number, w: number, h: number }} Box */
/** @typedef {{ text: string, box: Box, confidence: number, polygon?:readonly (readonly [number,number])[], wordPositionHints?:readonly import("./ocr-word-position-hints").WordHint[], confidenceEvidence?:import("./ocr-confidence-evidence").ConfidenceEvidence }} OcrLine */
/** @typedef {{ width: number, height: number, rgba: Uint8Array }} Raster */
/** @typedef {{ r: number, g: number, b: number }} Rgb */
/** @typedef {{ text: string, color: Rgb, count: number, startIndex: number, endIndex: number }} ColorSegment */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }

/** @param {string} value @param {boolean} allowTextWhitespace */
function hasControlCharacters(value, allowTextWhitespace = false) {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (allowTextWhitespace && [9, 10, 13].includes(code)) continue;
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/** @template {{ text?: unknown }} T @param {T[]} lines @returns {T[]} */
function correctContextualOcrLines(lines) {
  if (!Array.isArray(lines) || lines.length > MAX_OCR_LINES) throw new TypeError("native image rebuild OCR lines are invalid");
  const hasCanonicalAiAgent = lines.some((line) => typeof line?.text === "string" && /\bAI\s*Agent\b/.test(line.text));
  if (!hasCanonicalAiAgent) return lines;
  return lines.map((line) => typeof line?.text === "string" && /\bAl\s+Agent\b/.test(line.text)
    ? { ...line, text: line.text.replace(/\bAl(?=\s+Agent\b)/g, "AI"), wordPositionHints: undefined }
    : line);
}

/** @param {unknown} value @returns {{widthPx: number, heightPx: number}} */
function parseDimensions(value) {
  if (!isRecord(value)) throw new TypeError("native image rebuild dimensions are invalid");
  const { widthPx, heightPx } = value;
  if (!finite(widthPx) || !finite(heightPx) || !Number.isSafeInteger(widthPx) || !Number.isSafeInteger(heightPx)
    || widthPx < 1 || heightPx < 1 || widthPx > MAX_IMAGE_DIMENSION || heightPx > MAX_IMAGE_DIMENSION || widthPx * heightPx > MAX_IMAGE_PIXELS) {
    throw new TypeError("native image rebuild dimensions are invalid");
  }
  return { widthPx, heightPx };
}

/** @param {unknown} value @returns {string} */
function parseSourcePath(value) {
  if (typeof value !== "string" || !value || value.length > 1024 || value.includes("\\") || value.includes(":") || hasControlCharacters(value)
    || value.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new TypeError("native image rebuild source path is invalid");
  }
  return value;
}

/** @param {unknown} value @param {{widthPx: number, heightPx: number}} dimensions @returns {OcrLine[]} */
function parseOcrLines(value, dimensions) {
  if (!isRecord(value) || !Array.isArray(value.lines)) throw new TypeError("native image rebuild OCR result is invalid");
  if (value.lines.length > MAX_OCR_LINES) throw new RangeError("native image rebuild OCR result exceeds limits");
  const lines = value.lines.map((line) => {
    if (!isRecord(line) || typeof line.text !== "string" || !line.text.trim() || line.text.length > 512
      || hasControlCharacters(line.text, true) || !isRecord(line.box)) {
      throw new TypeError("native image rebuild OCR result is invalid");
    }
    const { x, y, w, h } = line.box;
    if (!finite(x) || !finite(y) || !finite(w) || !finite(h) || x < 0 || y < 0 || w <= 0 || h <= 0
      || x + w > dimensions.widthPx || y + h > dimensions.heightPx) throw new RangeError("native image rebuild OCR box is invalid");
    const confidence = line.confidence === undefined ? 1 : line.confidence;
    if (!finite(confidence) || confidence < 0 || confidence > 1) throw new TypeError("native image rebuild OCR confidence is invalid");
    const admittedLine = { text: line.text, box: { x, y, w, h }, confidence };
    const evidenceProperty = Object.getOwnPropertyDescriptor(line, "confidenceEvidence");
    if (evidenceProperty && !("value" in evidenceProperty)) throw new TypeError("native OCR confidence evidence is invalid");
    const confidenceEvidence = admitOcrConfidenceEvidence(evidenceProperty?.value, admittedLine, dimensions);
    const polygonProperty = Object.getOwnPropertyDescriptor(line, "polygon");
    if (polygonProperty && !("value" in polygonProperty)) throw new TypeError("OCR polygon geometry is invalid");
    const polygon = admitOcrPolygon(polygonProperty?.value, dimensions, admittedLine.box);
    const hintsProperty = Object.getOwnPropertyDescriptor(line, "wordPositionHints");
    if (hintsProperty && !("value" in hintsProperty)) throw new TypeError("OCR word position is invalid");
    const wordPositionHints = admitOcrWordPositionHints(hintsProperty?.value, admittedLine);
    return { ...admittedLine, ...(polygon ? { polygon } : {}), ...(confidenceEvidence ? { confidenceEvidence } : {}), ...(wordPositionHints ? { wordPositionHints } : {}) };
  });
  return correctContextualOcrLines(lines);
}

/** @param {unknown} value @param {{widthPx: number, heightPx: number}} dimensions @returns {Raster | null} */
function parseOptionalSourceRaster(value, dimensions) {
  if (value === undefined || value === null) return null;
  if (!isRecord(value) || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height)
    || value.width !== dimensions.widthPx || value.height !== dimensions.heightPx
    || !(value.rgba instanceof Uint8Array) || value.rgba.length !== value.width * value.height * 4) {
    throw new TypeError("native image rebuild source raster is invalid");
  }
  return { width: value.width, height: value.height, rgba: value.rgba };
}

/** @param {OcrLine[]} lines @param {Raster | null} sourceRaster @param {{remaining:number}} budget @returns {Map<OcrLine, import("./ocr-graphic-evidence-admission").OcrGraphicEvidence | null>} */
function uncertainOversizedGlyphs(lines, sourceRaster, budget) {
  const referenceHeights = lines.filter(line => line.confidence >= GLYPH_MIN_CONFIDENCE && Array.from(line.text.trim()).length > 1 && !/[\r\n]/u.test(line.text))
    .map(line => line.box.h).sort((left, right) => left - right);
  const median = referenceHeights[Math.floor(referenceHeights.length / 2)];
  if (referenceHeights.length < 4 || median === undefined || !sourceRaster) return new Map();
  const candidates = lines.filter(line => line.confidence < GLYPH_MIN_CONFIDENCE
    && (Array.from(line.text.trim()).length <= 2 || /^[\p{Pd}_.=~ \t]{2,8}$/u.test(line.text.trim())));
  if (candidates.length > 512) return new Map();
  /** @type {Map<OcrLine, import("./ocr-graphic-evidence-admission").OcrGraphicEvidence | null>} */
  const selected = new Map();
  for (const line of candidates) {
    const inspected = inspectSourceGraphicEvidence({ image: sourceRaster, line, lines, referenceHeight: median,
      maxScanPixels: Math.min(262144, budget.remaining) });
    budget.remaining -= inspected.scannedPixels;
    const sourceEvidence = inspected.evidence;
    if (sourceEvidence) {
      selected.set(line, sourceEvidence);
      continue;
    }
    if (line.confidence >= 0.65 || line.box.h <= median * 1.8) continue;
    const framedCandidate = line.confidence < 0.35 && Array.from(line.text.trim()).length === 1 && !/[\r\n]/u.test(line.text);
    const punctuationCandidate = /^[\p{Pd}_.=~ \t]{2,8}$/u.test(line.text.trim()) && !/[\r\n]/u.test(line.text);
    if (!framedCandidate && !punctuationCandidate) continue;
    const pad = framedCandidate ? Math.ceil(Math.min(line.box.w, line.box.h) * 0.1) : 0;
    const pixels = (Math.ceil(line.box.x + line.box.w) - Math.floor(line.box.x) + pad * 2)
      * (Math.ceil(line.box.y + line.box.h) - Math.floor(line.box.y) + pad * 2);
    if (pixels > budget.remaining) continue;
    budget.remaining -= pixels;
    if (hasTallPunctuationGraphicInk(sourceRaster, line.text, line.box)
      || (framedCandidate && framedGraphicEvidence(sourceRaster, line.box) !== null)) selected.set(line, null);
  }
  return selected;
}

/** @param {unknown} input */
function boundedOcrSourceDeck(input) {
  if (!isRecord(input) || !isRecord(input.metadata)) throw new TypeError("native image rebuild dimensions are invalid");
  const wordSessionProperty=Object.getOwnPropertyDescriptor(input,'sourceWordSession');
  if(wordSessionProperty&&!('value'in wordSessionProperty))throw new TypeError('source word session option is invalid');
  const sourceWordSession=wordSessionProperty?.value;
  if (input.preserveUncertainGlyphs !== undefined && typeof input.preserveUncertainGlyphs !== "boolean") throw new TypeError("native image rebuild OCR glyph policy is invalid");
  const dimensions = parseDimensions(input.metadata.dimensions);
  const sourceImage = parseSourcePath(input.sourceImage);
  const lines = parseOcrLines(input.ocr, dimensions);
  const sourceRaster = parseOptionalSourceRaster(input.sourceRaster, dimensions);
  if(sourceWordSession!==undefined)validateSourceWordLayoutSession(sourceWordSession,sourceRaster);
  const fontScale = ocrFontScale(lines);
  const sourceAnalysisBudget={remaining:4_000_000};
  const sourceNeighborBoxes=lines.map(line=>line.box);
  const graphicGlyphEvidence = uncertainOversizedGlyphs(lines, sourceRaster,sourceAnalysisBudget);
  const rasterGlyphs = input.preserveUncertainGlyphs === true ? new Set(graphicGlyphEvidence.keys()) : new Set();
  const widthPt = 960;
  const heightPt = Math.max(72, Math.min(4000, Math.round(widthPt * dimensions.heightPx / dimensions.widthPx)));
  const scaleX = widthPt / dimensions.widthPx; const scaleY = heightPt / dimensions.heightPx;
  /** @type {{text:Record<string,unknown>,line:OcrLine}[]} */const rotatedLayouts=[];
  const textBoxes = lines.flatMap((line, index) => {
    if (rasterGlyphs.has(line)) return [];
    const ocrGraphicEvidence = graphicGlyphEvidence.get(line);
    const box = { x: line.box.x * scaleX, y: line.box.y * scaleY, w: line.box.w * scaleX, h: line.box.h * scaleY };
    if (box.x + box.w > widthPt || box.y + box.h > heightPt) throw new RangeError("native image rebuild OCR box is invalid");
    // OCR supplies glyph geometry, not font-weight evidence.
    const textGeometry = projectOcrPolygon(line.polygon, scaleX, scaleY);
    const nativeGeometry=projectOcrTextBox({box,source:{evidenceBox:box,
      ...(line.polygon?{ocrPolygonPt:line.polygon.map(([x,y])=>[x*scaleX,y*scaleY])}:{})}});
    // Color bands and word layout must follow the geometry actually emitted by
    // the shared native projector, including its existing OCR-jitter handling.
    const horizontalText = !line.polygon || (textGeometry !== null && !nativeGeometry.rotation);
    const lightInk=sourceRaster&&line.confidence>=.9&&horizontalText&&!/[\r\n]/u.test(line.text)
      ?sampleLightOcrInkColor(sourceRaster,line.box,sourceAnalysisBudget):null;
    const font = { family: "Microsoft YaHei", sizePt: Math.max(6, Math.min(400, (textGeometry?.box.h ?? box.h) * fontScale)), color: lightInk||"#111111", opacity: 0, align: "left", valign: "middle" };
    // Horizontal color bands do not provide positions along a rotated or
    // perspective text baseline. Keep that measured quadrilateral intact.
    const mixedColorSegments = sourceRaster && horizontalText ? detectMixedColorTextSegments(sourceRaster, line) : null;
    const positionedMixedColorTextSegments = mixedColorSegments
      ? mixedColorSegments.map((segment, segmentIndex) => ({
        text: segment.text.trim(),
        box: {
          x: segment.pixelStart * scaleX,
          y: box.y,
          w: Math.max(MIXED_COLOR_MIN_SEGMENT_WIDTH_PX * scaleX, (segment.pixelEnd - segment.pixelStart) * scaleX),
          h: box.h
        },
        color: rgbToHex(segment.color),
        segmentIndex: segmentIndex + 1,
        startIndex: segment.startIndex,
        endIndex: segment.endIndex,
        sourceInkPixelBox: {
          x: segment.pixelStart,
          y: line.box.y,
          w: Math.max(MIXED_COLOR_MIN_SEGMENT_WIDTH_PX, segment.pixelEnd - segment.pixelStart),
          h: line.box.h
        }
      }))
      : null;
    const runs = mixedColorSegments && Array.from(line.text.trim()).length <= MIXED_COLOR_MAX_TEXT_LENGTH ? mixedColorSegments.map((segment) => ({
      text: segment.text,
      font: { ...font, color: rgbToHex(segment.color) }
    })) : null;
    const textBox = {
      id: `p0-ocr-${String(index + 1).padStart(3, "0")}`,
      role: "body", text: line.text.trim(), box,
      font,
      style: { visibility: "hidden", opacity: 0, marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0 },
      ...(runs ? { runs } : {}),
      source: {
        pageImage: sourceImage,
        ocrProvider: "team-pinned-ocr",
        confidence: line.confidence,
        ...(line.polygon ? { ocrPolygonPt: line.polygon.map(([x, y]) => [x * scaleX, y * scaleY]) } : {}),
        ...(line.confidenceEvidence ? { ocrOriginalConfidence: line.confidenceEvidence.originalConfidence,
          ocrConfidenceEvidence: line.confidenceEvidence } : {}),
        ...(ocrGraphicEvidence ? { ocrGraphicEvidence } : {}),
        evidenceBox: {...box},
        ocrLabelBox: {...box},
        ocrLabelRef: sourceLabelIdentity(line.box,dimensions),
        editable: true,
        overlayVisibility: "hidden",
        ...(runs ? { mixedColorTextRuns: runs.length } : {}),
        ...(positionedMixedColorTextSegments ? { mixedColorTextSegments: positionedMixedColorTextSegments.length, positionedMixedColorTextSegments } : {})
      }
    };
    // Color bands require horizontal source geometry. Word layout instead proves
    // complete source ink and must match the native representation actually used.
    // Reuse its existing projection decision; never flatten a rotated or
    // unresolved perspective frame, and keep the shared source-analysis budget.
    const unrotatedNativeText = horizontalText;
    if (sourceRaster && unrotatedNativeText){
      if(positionedMixedColorTextSegments)registerSourceWordColorSegments(textBox,
        /** @type {Record<string,unknown>[]} */(expandPositionedMixedColorTextSegments([textBox])),line,sourceRaster,sourceAnalysisBudget,sourceNeighborBoxes,sourceWordSession,{x:scaleX,y:scaleY});
      else registerSourceWordLayout(textBox,line,sourceRaster,sourceAnalysisBudget,sourceNeighborBoxes,false,sourceWordSession,{x:scaleX,y:scaleY});
    }
    else if(sourceRaster&&textGeometry&&projectOcrTextBox(textBox).rotation&&rotatedLayouts.length<32)rotatedLayouts.push({text:textBox,line});
    return [textBox];
  });
  // Preserve ordinary source measurements' existing priority and debit only
  // their remaining shared allowance for bounded rotated candidates.
  if(sourceRaster)for(const entry of rotatedLayouts)registerSourceWordLayout(entry.text,entry.line,sourceRaster,sourceAnalysisBudget,sourceNeighborBoxes,true,sourceWordSession,{x:scaleX,y:scaleY});
  return {
    version: "1.0",
    meta: { source: "team-raw-image", reconstructionMode: "native-hybrid", ocrAdmission: { inputLines: lines.length, editableLines: textBoxes.length, rasterFallbackGlyphs: rasterGlyphs.size } },
    slideSize: { widthPt, heightPt },
    pages: [{ pageIndex: 0, sourceImage, background: { fill: "#FFFFFF" }, textBoxes,
      shapes: emptyObjects(), images: emptyObjects(), tables: emptyObjects(), charts: emptyObjects(), icons: emptyObjects() }]
  };
}

/** @param {unknown[]} textBoxes */
function expandPositionedMixedColorTextSegments(textBoxes) {
  if (!Array.isArray(textBoxes)) return [];
  return textBoxes.flatMap((textBox) => {
    if (!isRecord(textBox) || !isRecord(textBox.source) || !Array.isArray(textBox.source.positionedMixedColorTextSegments)) return [textBox];
    const originalSource = textBox.source;
    const segments = originalSource.positionedMixedColorTextSegments;
    if (!Array.isArray(segments)) return [textBox];
    const lineId = typeof textBox.id === "string" ? textBox.id : "";
    const confidence = Number(textBox.source.confidence || textBox.confidence || 0);
    return segments
      .filter((segment) => isRecord(segment) && typeof segment.text === "string" && segment.text.trim().length > 0 && isRecord(segment.box) && typeof segment.color === "string")
      .map((segment, index) => {
        /** @type {Record<string, unknown>} */
        const source = {
          ...originalSource,
          confidence,
          evidenceBox: {...segment.box},
          segmentedOcrLineId: lineId,
          mixedColorTextSegment: index + 1,
          mixedColorTextSegments: segments.length,
          ...(Number.isSafeInteger(segment.startIndex) ? { segmentStartIndex: segment.startIndex } : {}),
          ...(Number.isSafeInteger(segment.endIndex) ? { segmentEndIndex: segment.endIndex } : {}),
          ...(isRecord(segment.sourceInkPixelBox) ? { sourceInkPixelBox: segment.sourceInkPixelBox } : {})
        };
        if (originalSource.ocrPolygonPt !== undefined) {
          source.segmentedOcrLinePolygonPt = originalSource.ocrPolygonPt;
          // The parent's polygon describes the full line, not this measured
          // color segment. Preserve provenance without granting full-line ink.
          delete source.ocrPolygonPt;
        }
        delete source.positionedMixedColorTextSegments;
        /** @type {Record<string, unknown>} */
        const expanded = {
          ...textBox,
          id: `${lineId || "ocr"}-seg-${index + 1}`,
          text: segment.text.trim(),
          box: {...segment.box},
          font: { ...(isRecord(textBox.font) ? textBox.font : {}), color: segment.color },
          source
        };
        delete expanded.runs;
        return expanded;
      });
  });
}

/** @param {OcrLine[]} lines */
function ocrFontScale(lines) {
  if (lines.length < 160) return 0.72;
  const textLikeLines = lines.filter((line) => Array.from(line.text.trim()).length >= 2);
  if (textLikeLines.length < 120) return 0.72;
  return 0.62;
}

/** @param {Raster} image @param {OcrLine} line @param {Record<string, unknown>} font */
function detectMixedColorTextRuns(image, line, font) {
  const characters = Array.from(line.text.trim());
  if (characters.length > MIXED_COLOR_MAX_TEXT_LENGTH) return null;
  const segments = detectMixedColorTextSegments(image, line);
  if (!segments) return null;
  return segments.map((segment) => ({
    text: segment.text,
    font: { ...font, color: rgbToHex(segment.color) }
  }));
}

/** @param {Raster} image @param {OcrLine} line */
function detectMixedColorTextSegments(image, line) {
  const text = line.text.trim();
  const characters = Array.from(text);
  if (characters.length < MIXED_COLOR_MIN_TEXT_LENGTH || characters.length > MIXED_COLOR_MAX_SEGMENT_TEXT_LENGTH || line.box.w < 24 || line.box.h < 5) return null;
  const region = boundedPixelBox(line.box, image);
  if (!region) return null;
  const background = estimateBackgroundColor(image, region);
  if (!background) return null;
  const {columns, cores} = collectInkColumns(image, region, background, characters[0]);
  const alignment=admitOcrWordPositionHints(line.wordPositionHints,line);
  if(alignment)return detectAlignedColorSegments(alignment,region,columns,cores);
  const inkColumns = columns.filter((column) => column.count > 0);
  const minimumInkColumns = Math.min(Math.max(6, Math.ceil(region.w * 0.08)), Math.max(6, region.w - 1));
  if (inkColumns.length < minimumInkColumns) return null;
  const charRanges = characterAdvanceRanges(characters, columns, region.w);
  const charColors = characters.map((_, index) => characterColor(index, characters.length, region, columns, charRanges));
  if (charColors.some((color) => color === null)) return null;
  const segments = reduceColorSegmentsToLimit(mergeCharacterColorSegments(characters, /** @type {{r:number,g:number,b:number}[]} */ (charColors)), MIXED_COLOR_MAX_RUNS);
  if (!segments || segments.length < 2 || segments.length > MIXED_COLOR_MAX_RUNS) return null;
  if (!segments.some((segment, index) => {
    const previous = index > 0 ? segments[index - 1] : undefined;
    return previous !== undefined && colorDistance(segment.color, previous.color) >= 48;
  })) return null;
  // Coverage changes the mean of antialias pixels without changing the
  // underlying paint. Corroborate every interval from the already observed
  // opaque cores before splitting and losing the complete line's layout.
  if (cores.isUniform(characters.length)) return null;
  if (cores.hasPaintTransition(segments.map(segment=>({startIndex:segment.startIndex,endIndex:segment.endIndex})),characters.length,background)===false) return null;
  const shortest = Math.min(...segments.map((segment) => Array.from(segment.text).length));
  if (shortest < 2) return null;
  const positioned = segments.map((segment) => {
    const bounds = segmentInkColumnBounds(region, columns, segment, characters.length, charRanges);
    if (!bounds) return null;
    return {
      text: segment.text,
      color: cores.proposePaintForColumns(bounds.left, bounds.right) ?? segment.color,
      startIndex: segment.startIndex,
      endIndex: segment.endIndex,
      pixelStart: region.x + bounds.left,
      pixelEnd: region.x + bounds.right
    };
  });
  if (positioned.some((segment) => segment === null)) return null;
  return /** @type {{text:string,color:{r:number,g:number,b:number},startIndex:number,endIndex:number,pixelStart:number,pixelEnd:number}[]} */ (positioned);
}

/** Alignment proposes paint intervals; two empty source columns prove each
 * geometric cut. Core medians propose paint for final rendering comparison,
 * never erasure or ownership. No equal-width character assumption is
 * used for a supplied word sequence, and missing evidence stays unresolved.
 * @param {readonly import('./ocr-word-position-hints').WordHint[]} alignment
 * @param {Box} region
 * @param {{r:number,g:number,b:number,count:number}[]} columns
 * @param {ReturnType<typeof createInkCoreConsensus>} cores */
function detectAlignedColorSegments(alignment,region,columns,cores){
 /** @type {{text:string,color:Rgb,startIndex:number,endIndex:number,left:number,right:number}[]} */const groups=[];
 let index=0;
 for(const hint of alignment){
  const length=Array.from(hint.text).length,left=Math.max(0,Math.floor(hint.box.x-region.x)),right=Math.min(region.w,Math.ceil(hint.box.x+hint.box.w-region.x));
  const previous=groups.at(-1);
  if(!hint.text.trim()){
   if(!previous)return null;previous.text+=hint.text;previous.endIndex+=length;index+=length;continue;
  }
  if(right<=left)return null;const color=cores.proposePaintForColumns(left,right);if(!color)return null;
  if(previous&&colorDistance(previous.color,color)<=38){previous.text+=hint.text;previous.endIndex+=length;previous.right=right;}
  else groups.push({text:hint.text,color,startIndex:index,endIndex:index+length,left,right});
  index+=length;
 }
 if(groups.length<2||groups.length>MIXED_COLOR_MAX_RUNS)return null;
 for(let i=1;i<groups.length;i++){
  const before=groups[i-1],after=groups[i];if(!before||!after||colorDistance(before.color,after.color)<48)return null;
  const from=Math.max(1,Math.floor((before.left+before.right)/2)),to=Math.min(region.w-1,Math.ceil((after.left+after.right)/2));
  const middle=(before.right+after.left)/2;let cut=-1,distance=Infinity;
  for(let x=from;x<=to;x++)if(!columns[x]?.count&&!columns[x-1]?.count&&Math.abs(x-middle)<distance){cut=x;distance=Math.abs(x-middle);}
  if(cut<0)return null;before.right=cut;after.left=cut;
 }
 const result=groups.map(group=>{
  const bounds=columnBounds(columns,group.left,group.right,()=>true);if(!bounds)return null;
  return {text:group.text,color:group.color,startIndex:group.startIndex,endIndex:group.endIndex,
   pixelStart:region.x+Math.max(group.left,bounds.left-1),pixelEnd:region.x+Math.min(group.right,bounds.right+2)};
 });
 if(result.some(segment=>!segment||segment.pixelEnd-segment.pixelStart<MIXED_COLOR_MIN_SEGMENT_WIDTH_PX))return null;
 return /** @type {{text:string,color:Rgb,startIndex:number,endIndex:number,pixelStart:number,pixelEnd:number}[]} */(result);
}

/**
 * @param {readonly string[]} characters
 * @param {{r:number,g:number,b:number,count:number}[]} columns
 * @param {number} regionW
 */
function characterAdvanceRanges(characters, columns, regionW) {
  let inkStart = 0;
  let inkEnd = regionW;
  const firstInk = columns.findIndex((c) => c.count > 0);
  if (firstInk >= 0) {
    inkStart = firstInk;
    for (let i = columns.length - 1; i >= firstInk; i -= 1) {
      if (columns[i]?.count) {
        inkEnd = i + 1;
        break;
      }
    }
  }
  const span = Math.max(1, inkEnd - inkStart);
  const weights = characters.map((ch) => {
    if (/^\s$/u.test(ch)) return 0.32;
    if (/^[.,:;!|'"`()[\]{}/\\-]$/u.test(ch)) return 0.36;
    if (ch.charCodeAt(0) < 0x0250) return 0.56;
    return 1.0;
  });
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return weights.map((w) => {
    const left = Math.max(0, inkStart + Math.floor((acc / total) * span));
    acc += w;
    const right = Math.min(regionW, Math.max(left + 1, inkStart + Math.ceil((acc / total) * span)));
    return { left, right };
  });
}

/**
 * @param {{x:number,y:number,w:number,h:number}} region
 * @param {{r:number,g:number,b:number,count:number}[]} columns
 * @param {{color:{r:number,g:number,b:number},startIndex:number,endIndex:number}} segment
 * @param {number} characterCount
 * @param {readonly {left:number,right:number}[]} [charRanges]
 */
function segmentInkColumnBounds(region, columns, segment, characterCount, charRanges) {
  const approximateLeft = charRanges ? (charRanges[segment.startIndex]?.left ?? 0) : Math.max(0, Math.floor(segment.startIndex * region.w / characterCount));
  const approximateRight = charRanges ? (charRanges[segment.endIndex - 1]?.right ?? region.w) : Math.min(region.w, Math.ceil(segment.endIndex * region.w / characterCount));
  if (approximateRight <= approximateLeft) return null;
  const preferred = columnBounds(columns, approximateLeft, approximateRight, (column) => colorDistance(column, segment.color) <= 72);
  const fallback = preferred || columnBounds(columns, approximateLeft, approximateRight, () => true);
  if (!fallback) return null;
  const left = Math.max(0, fallback.left - 1);
  const right = Math.min(region.w, fallback.right + 2);
  if (right - left < MIXED_COLOR_MIN_SEGMENT_WIDTH_PX) return null;
  return { left, right };
}

/**
 * @param {{r:number,g:number,b:number,count:number}[]} columns
 * @param {number} left
 * @param {number} right
 * @param {(column:{r:number,g:number,b:number,count:number}) => boolean} predicate
 */
function columnBounds(columns, left, right, predicate) {
  let first = -1;
  let last = -1;
  for (let index = left; index < right; index += 1) {
    const column = columns[index];
    if (!column?.count || !predicate(column)) continue;
    if (first < 0) first = index;
    last = index;
  }
  if (first < 0 || last < first) return null;
  return { left: first, right: last };
}

/** @param {Box} box @param {Raster} image */
function boundedPixelBox(box, image) {
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const right = Math.min(image.width, Math.ceil(box.x + box.w));
  const bottom = Math.min(image.height, Math.ceil(box.y + box.h));
  if (right <= x || bottom <= y) return null;
  return { x, y, w: right - x, h: bottom - y };
}

/** @param {Raster} image @param {{x:number,y:number,w:number,h:number}} region */
function estimateBackgroundColor(image, region) {
  /** @type {{r:number,g:number,b:number,brightness:number}[]} */
  const samples = [];
  const stepX = Math.max(1, Math.floor(region.w / 64));
  const stepY = Math.max(1, Math.floor(region.h / 16));
  for (let y = region.y; y < region.y + region.h; y += stepY) {
    for (let x = region.x; x < region.x + region.w; x += stepX) {
      const color = readPixel(image, x, y);
      if (!color || color.a < 180) continue;
      samples.push({ r: color.r, g: color.g, b: color.b, brightness: (color.r + color.g + color.b) / 3 });
    }
  }
  if (samples.length < 8) return null;
  samples.sort((left, right) => right.brightness - left.brightness);
  const keep = samples.slice(0, Math.max(4, Math.ceil(samples.length * 0.2)));
  return averageColor(keep);
}

/** @param {Raster} image @param {{x:number,y:number,w:number,h:number}} region @param {{r:number,g:number,b:number}} background @param {string} [firstChar] */
function collectInkColumns(image, region, background, firstChar) {
  /** @type {{r:number,g:number,b:number,count:number,minY:number,maxY:number,samples:{r:number,g:number,b:number,a:number,contrast:number}[]}[]} */
  const raw = Array.from({ length: region.w }, () => ({ r: 0, g: 0, b: 0, count: 0, minY: Infinity, maxY: -1, samples: /** @type {{r:number,g:number,b:number,a:number,contrast:number}[]} */([]) }));
  for (let y = region.y; y < region.y + region.h; y += 1) {
    for (let x = region.x; x < region.x + region.w; x += 1) {
      const color = readPixel(image, x, y);
      if (!color || color.a < 140) continue;
      const contrast = colorDistance(color, background);
      if (contrast < 34) continue;
      const saturation = Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
      const bgBrightness = (background.r + background.g + background.b) / 3;
      const brightness = (color.r + color.g + color.b) / 3;
      if (Math.abs(bgBrightness - brightness) < 18 && saturation < 22) continue;
      const column = raw[x - region.x];
      if (!column) continue;
      column.samples.push({ r: color.r, g: color.g, b: color.b, a: color.a, contrast });
      column.r += color.r;
      column.g += color.g;
      column.b += color.b;
      column.count += 1;
      column.minY = Math.min(column.minY, y - region.y);
      column.maxY = Math.max(column.maxY, y - region.y);
    }
  }
  if (firstChar && !/^[\p{P}\p{S}]/u.test(firstChar)) {
    const c0 = raw.findIndex((c) => c.count > 0);
    if (c0 >= 0) {
      let c1 = c0;
      while (c1 + 1 < raw.length && (raw[c1 + 1]?.count || raw[c1 + 2]?.count)) c1 += 1;
      let c2 = c1 + 1;
      while (c2 < raw.length && !raw[c2]?.count) c2 += 1;
      if (c2 < raw.length && c2 - c1 - 1 >= 2) {
        const clusterWidth = c1 - c0 + 1;
        let minY = Infinity, maxY = -1, restMinY = Infinity, restMaxY = -1;
        for (let i = c0; i <= c1; i += 1) {
          const column = raw[i];
          if (column?.count) { minY = Math.min(minY, column.minY); maxY = Math.max(maxY, column.maxY); }
        }
        for (let i = c2; i < raw.length; i += 1) {
          const column = raw[i];
          if (column?.count) { restMinY = Math.min(restMinY, column.minY); restMaxY = Math.max(restMaxY, column.maxY); }
        }
        const clusterSpan = maxY >= minY ? maxY - minY + 1 : 0;
        const restSpan = restMaxY >= restMinY ? restMaxY - restMinY + 1 : 0;
        if (clusterWidth <= Math.ceil(region.h * 0.65) && restSpan > 0 && clusterSpan <= restSpan * 0.58) {
          for (let i = c0; i <= c1; i += 1) {
            raw[i] = { r: 0, g: 0, b: 0, count: 0, minY: Infinity, maxY: -1, samples: [] };
          }
        }
      }
    }
  }
  const cores = createInkCoreConsensus(region.w);
  for (let i = 0; i < raw.length; i += 1) {
    for (const s of raw[i]?.samples ?? []) {
      cores.observe(i, s.r, s.g, s.b, s.a, s.contrast);
    }
  }
  return {cores, columns: raw.map((column) => column.count > 0
    ? { r: column.r / column.count, g: column.g / column.count, b: column.b / column.count, count: column.count }
    : { r: 0, g: 0, b: 0, count: 0 })};
}

/** @param {number} index @param {number} count @param {{w:number}} region @param {{r:number,g:number,b:number,count:number}[]} columns @param {readonly {left:number,right:number}[]} [charRanges] */
function characterColor(index, count, region, columns, charRanges) {
  const left = charRanges ? (charRanges[index]?.left ?? 0) : Math.floor(index * region.w / count);
  const right = charRanges ? (charRanges[index]?.right ?? region.w) : Math.max(left + 1, Math.ceil((index + 1) * region.w / count));
  const exact = averageColumns(columns.slice(left, right).filter((column) => column.count > 0));
  if (exact) return exact;
  for (let radius = 1; radius <= Math.max(3, Math.ceil(region.w / Math.max(1, count))); radius += 1) {
    const nearby = [];
    const before = columns[left - radius];
    const after = columns[right - 1 + radius];
    if (before?.count) nearby.push(before);
    if (after?.count) nearby.push(after);
    const color = averageColumns(nearby);
    if (color) return color;
  }
  return null;
}

/** @param {string[]} characters @param {Rgb[]} colors @returns {ColorSegment[]} */
function mergeCharacterColorSegments(characters, colors) {
  /** @type {ColorSegment[]} */
  const segments = [];
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index] || "";
    const color = /** @type {Rgb} */ (colors[index]);
    const previous = segments[segments.length - 1];
    if (previous && colorDistance(previous.color, color) <= 38) {
      previous.text += character;
      previous.color = averageWeighted(previous.color, previous.count, color, 1);
      previous.count += 1;
      previous.endIndex = index + 1;
    } else {
      segments.push({ text: character, color, count: 1, startIndex: index, endIndex: index + 1 });
    }
  }
  const compact = coalesceTinyColorSegments(segments);
  if (compact.length === segments.length) return compact;
  return coalesceTinyColorSegments(compact);
}

/** @param {ColorSegment[]} segments @returns {ColorSegment[]} */
function coalesceTinyColorSegments(segments) {
  if (segments.length <= 1) return segments;
  /** @type {ColorSegment[]} */
  const output = [];
  for (const segment of segments) {
    if (segment.text.trim() === "" && output.length > 0) {
      const previous = /** @type {ColorSegment} */ (output[output.length - 1]);
      previous.text += segment.text;
      previous.count += segment.count;
      previous.endIndex = segment.endIndex;
      continue;
    }
    if (segment.count === 1 && segments.length > 2) {
      const previous = output[output.length - 1];
      const next = segments[segments.indexOf(segment) + 1];
      if (previous && (!next || colorDistance(previous.color, segment.color) <= colorDistance(next.color, segment.color))) {
        previous.text += segment.text;
        previous.color = averageWeighted(previous.color, previous.count, segment.color, segment.count);
        previous.count += segment.count;
        previous.endIndex = segment.endIndex;
        continue;
      }
    }
    output.push({ ...segment, color: { ...segment.color } });
  }
  return output;
}

/** @param {ColorSegment[] | null} segments @param {number} limit @returns {ColorSegment[] | null} */
function reduceColorSegmentsToLimit(segments, limit) {
  if (!segments || segments.length <= limit) return segments;
  const output = segments.map((segment) => ({ ...segment, color: { ...segment.color } }));
  while (output.length > limit) {
    let bestIndex = -1;
    let bestDistance = Infinity;
    for (let index = 0; index < output.length - 1; index += 1) {
      const left = /** @type {ColorSegment} */ (output[index]);
      const right = /** @type {ColorSegment} */ (output[index + 1]);
      const distance = colorDistance(left.color, right.color);
      const tinyPenalty = left.count === 1 || right.count === 1 ? -12 : 0;
      const score = distance + tinyPenalty;
      if (score < bestDistance) {
        bestDistance = score;
        bestIndex = index;
      }
    }
    if (bestIndex < 0) return output;
    const left = /** @type {ColorSegment} */ (output[bestIndex]);
    const right = /** @type {ColorSegment} */ (output[bestIndex + 1]);
    output.splice(bestIndex, 2, {
      text: left.text + right.text,
      color: averageWeighted(left.color, left.count, right.color, right.count),
      count: left.count + right.count,
      startIndex: left.startIndex,
      endIndex: right.endIndex
    });
  }
  return output;
}

/** @param {{r:number,g:number,b:number,count:number}[]} columns */
function averageColumns(columns) {
  if (columns.length === 0) return null;
  let r = 0, g = 0, b = 0, total = 0;
  for (const column of columns) {
    r += column.r * column.count;
    g += column.g * column.count;
    b += column.b * column.count;
    total += column.count;
  }
  if (total <= 0) return null;
  return { r: r / total, g: g / total, b: b / total };
}

/** @param {{r:number,g:number,b:number}[]} colors */
function averageColor(colors) {
  let r = 0, g = 0, b = 0;
  for (const color of colors) {
    r += color.r;
    g += color.g;
    b += color.b;
  }
  return { r: r / colors.length, g: g / colors.length, b: b / colors.length };
}

/** @param {{r:number,g:number,b:number}} left @param {number} leftWeight @param {{r:number,g:number,b:number}} right @param {number} rightWeight */
function averageWeighted(left, leftWeight, right, rightWeight) {
  const total = Math.max(1, leftWeight + rightWeight);
  return {
    r: (left.r * leftWeight + right.r * rightWeight) / total,
    g: (left.g * leftWeight + right.g * rightWeight) / total,
    b: (left.b * leftWeight + right.b * rightWeight) / total
  };
}

/** @param {Raster} image @param {number} x @param {number} y */
function readPixel(image, x, y) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return null;
  const offset = (y * image.width + x) * 4;
  return { r: image.rgba[offset] || 0, g: image.rgba[offset + 1] || 0, b: image.rgba[offset + 2] || 0, a: image.rgba[offset + 3] || 0 };
}

/** @param {{r:number,g:number,b:number}} left @param {{r:number,g:number,b:number}} right */
function colorDistance(left, right) {
  return Math.hypot(left.r - right.r, left.g - right.g, left.b - right.b);
}

/** @param {{r:number,g:number,b:number}} color */
function rgbToHex(color) {
  return `#${[color.r, color.g, color.b].map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** @returns {unknown[]} */
function emptyObjects() { return []; }

module.exports = { boundedOcrSourceDeck, correctContextualOcrLines, detectMixedColorTextRuns, detectMixedColorTextSegments, expandPositionedMixedColorTextSegments, ocrFontScale };
