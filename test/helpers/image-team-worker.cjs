"use strict";
const assert = require("node:assert/strict");

const { spawnSync } = require("node:child_process");

const fs = require("node:fs");

const os = require("node:os");

const path = require("node:path");

const test = require("node:test");

const zlib = require("node:zlib");

const { addNativeResidualPrimitives, changedComponentKeysFromFit, compactDeckFinalQualitySourceProvenance, compactDeckLateShapeSourceBudgetProvenance, compactDeckLateTextSourceBudgetProvenance, compactDeckNativeShapeSourceProvenance, createImageToEditableArchiveHandler, finalRefinementQualityAcceptable, fitDeckEditableTextFontFamily, fitDeckLightCardGeometry, fitDeckLightCardSideAccents, fitDeckLightCardSourceStrokes, fitDeckLightCardStrokeColors, fitDeckLightCardStrokes, fitDeckLowContrastFooterMarks, fitDeckLowContrastFooterPrimitives, fitDeckLowSaturationPanelFills, fitDeckMissingNativeVisualAtomShapes, fitDeckNativeShapeThinStrokes, fitDeckOcrEvidenceToSource, fitDeckSaturatedColorPanels, fitDeckSourceVerticalLines, fitDeckTextFidelityPrimitives, fitDeckWorstComponentFidelityPrimitives, fitDeckWorstConnectorStyles, fitDeckWorstRichOcrTextLayout, fitDeckWorstTextArrowGlyphs, fitDeckWorstTextBoxNudge, fitDeckWorstTextColors, fitDeckWorstTextComposite, fitDeckWorstTextInkBoxes, fitDeckWorstTextScale, fitDeckWorstTextWeight, focusedCandidateLimits, focusedLightCardStrokeWidthCandidates, isReliableMissingNativeVisualAtom, lightCardSourceStrokeQualityAcceptable, missingNativeTargetInkRunShapes, nativeOnlyMissingNativeLinesDoesNotRegress, nativeOnlyRefinementDoesNotMateriallyRegress, nativeOnlyResidualQualityAcceptable, removeFullSlideResidualImages, replacePictorialIconCropsWithNativeShapes, residualDeduplicationStatus, targetComponentQualityImproves, targetMissingNativeComponentQualityImproves, tryBuildFinalLineTextCoveredCropDropCandidate, tryBuildFinalWorstTextArrowGlyphWithTextFidelityCandidate, tryBuildNativeOnlyPictorialIconCandidate, tryBuildNativeOnlyRichOcrTextLayoutCandidate, validateDeckIr, worstTextBoxNudgeCandidates, worstTextCompositeScaleCandidates } = require("../../packages/slideclone-worker-adapter/team-worker");

const { addLowContrastFooterNativeMarks, boundedOcrSourceDeck, correctContextualOcrLines, createRawImageNativeRebuilder, largeRasterEditability, nativeObjectMetrics, residualEraseObjects, shouldOmitFullSlideResidual, writeTextErasedVisualFallbackAsset } = require("../../packages/slideclone-core/team-native-rebuild");

const { PRODUCTION_PROFILE_NAME } = require("../../packages/slideclone-core/native-rebuild-profile");

const { PROFILE_NAME, sha256File } = require("../../packages/slideclone-core/ocr/team-ocr-profile");

const { PROFILE_NAME: PADDLE_PROFILE_NAME } = require("../../packages/slideclone-core/ocr/team-paddleocr-profile");

const { createNativeRebuilder, startupFailureCode, workerSettings } = require("../../packages/remote-mcp-server/bin/common-tools-team-image-worker");

const { eraseMasks, readPng, rebuildDeckFromWorkDir } = require("../../packages/slideclone-native-engine").loadNativeImageEngine();

const { createFullSlideResidualBuilder } = require("../../packages/slideclone-core/archetypes/full-slide-native-residual");

const { addKnowledgeGraphPictorialConnectors, applyKnowledgeGraphPanelNativeRebuild, findKnowledgeGraphPanelModel } = require("../../packages/slideclone-core/archetypes/knowledge-graph-native");

const { writePng } = require("../../packages/slideclone-core/png");

const { refineKnowledgeGraphIconCrops } = require("../../packages/slideclone-core/archetypes/knowledge-graph-icon-crops");

const { assessStrictNativeCandidate } = require("../../packages/slideclone-worker-adapter/candidate-quality-policy");

const { auditNativeComponentQuality } = require("../../packages/slideclone-core/quality/native-component-quality");

const { auditSemanticEditability } = require("../../packages/slideclone-core/quality/semantic-editability-quality");

const { readZipEntries, writeStoredZipAtomic } = require("../../packages/ooxml-core/pptx-zip");

const createFullSlideResidual = createFullSlideResidualBuilder({ eraseMasks, readPng, writePng });

const MINIMAL_PPTX_ENTRIES = Object.freeze([
  { name: "[Content_Types].xml", data: Buffer.from('<Types><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>') },
  { name: "ppt/presentation.xml", data: Buffer.from('<p:presentation xmlns:p="urn:p"/>') }
]);

function writeMinimalPptx(file) {
  writeStoredZipAtomic(file, MINIMAL_PPTX_ENTRIES);
}

function assertMinimalPptxBuffer(value) {
  const entries = readZipEntries(Buffer.from(value));
  const names = new Set(entries.map((entry) => entry.name));
  assert.equal(names.has("[Content_Types].xml"), true);
  assert.equal(names.has("ppt/presentation.xml"), true);
}

function minimalPptxBuilderSource() {
  const zipModule = require.resolve("../../packages/ooxml-core/pptx-zip");
  const entries = MINIMAL_PPTX_ENTRIES.map((entry) => ({
    name: entry.name,
    data: entry.data.toString("utf8")
  }));
  return `const { writeStoredZipAtomic } = require(${JSON.stringify(zipModule)});\nconst out = process.argv[process.argv.indexOf('--out') + 1];\nwriteStoredZipAtomic(out, ${JSON.stringify(entries)}.map((entry) => ({ name: entry.name, data: Buffer.from(entry.data) })));\n`;
}

function delayedMinimalPptxBuilderSource({ readyFile, finishedFile, releaseFile }) {
  const zipModule = require.resolve("../../packages/ooxml-core/pptx-zip");
  const entries = MINIMAL_PPTX_ENTRIES.map((entry) => ({
    name: entry.name,
    data: entry.data.toString("utf8")
  }));
  return `const fs = require('node:fs');\nconst { writeStoredZipAtomic } = require(${JSON.stringify(zipModule)});\nconst entries = ${JSON.stringify(entries)}.map((entry) => ({ name: entry.name, data: Buffer.from(entry.data) }));\nfs.writeFileSync(${JSON.stringify(readyFile)}, JSON.stringify({ pid: process.pid }));\nconst timer = setInterval(() => { if (!fs.existsSync(${JSON.stringify(releaseFile)})) return; clearInterval(timer); writeStoredZipAtomic(process.argv[process.argv.indexOf('--out') + 1], entries); fs.writeFileSync(${JSON.stringify(finishedFile)}, 'finished'); }, 25);\n`;
}

function field(buffer, offset, length, value) { buffer.write(value.slice(0, length), offset, length, "utf8"); }

function tarEntry(name, content) {
  const body = Buffer.from(content);
  const header = Buffer.alloc(512);
  field(header, 0, 100, name);
  field(header, 100, 8, "0000600\0");
  field(header, 124, 12, `${body.length.toString(8).padStart(11, "0")}\0`);
  field(header, 156, 1, "0");
  field(header, 257, 6, "ustar\0");
  return Buffer.concat([header, body, Buffer.alloc((512 - (body.length % 512)) % 512)]);
}

function archive(entries) { return zlib.gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)])); }

function lineTextCoveredCropDeck({ includeCoveredCrop = true, includeUncoveredLargeCrop = false, coveredBox = { x: 20, y: 20, w: 60, h: 30 } } = {}) {
  const images = [];
  if (includeCoveredCrop) {
    images.push({
      id: "covered-foreground",
      type: "fidelity-crop",
      assetPath: "assets/covered.png",
      box: coveredBox,
      source: {
        detector: "foreground-graphic-crop",
        reason: "complex-graphic-preserved-as-movable-crop",
        strategy: "local-fidelity-crop",
        editable: false
      }
    });
  }
  if (includeUncoveredLargeCrop) {
    images.push({
      id: "uncovered-foreground",
      type: "fidelity-crop",
      assetPath: "assets/uncovered.png",
      box: { x: 4, y: 64, w: 30, h: 30 },
      source: {
        detector: "foreground-graphic-crop",
        reason: "complex-graphic-preserved-as-movable-crop",
        strategy: "local-fidelity-crop",
        editable: false
      }
    });
  }
  return {
    slideSize: { widthPt: 100, heightPt: 100 },
    pages: [{
      images,
      shapes: [
        { id: "panel", type: "rect", box: { x: 20, y: 20, w: 60, h: 30 }, style: { fill: "#FFFFFF", stroke: "#CBD5E1", strokeWidthPt: 1 }, source: { detector: "line-text-native-numbered-section-panel", editable: true, nativeRebuild: true } },
        ...Array.from({ length: 8 }, (_, index) => ({
          id: `card-${index}`,
          type: "rect",
          box: { x: 24 + (index % 4) * 13, y: 24 + Math.floor(index / 4) * 12, w: 10, h: 8 },
          style: { fill: "#FFFFFF", stroke: "#CBD5E1", strokeWidthPt: 1 },
          source: { detector: "line-text-native-card-row", editable: true, nativeRebuild: true }
        }))
      ],
      textBoxes: Array.from({ length: 8 }, (_, index) => ({
        id: `label-${index}`,
        text: `label ${index}`,
        box: { x: 25 + (index % 4) * 13, y: 26 + Math.floor(index / 4) * 12, w: 8, h: 4 },
        source: { editable: true, nativeRebuild: true }
      }))
    }]
  };
}

function writeThreeCardDiagram(file) {
  const width = 960; const height = 540; const rgba = Buffer.alloc(width * height * 4, 255);
  const pixel = (x, y, color) => { const offset = (y * width + x) * 4; rgba[offset] = color[0]; rgba[offset + 1] = color[1]; rgba[offset + 2] = color[2]; rgba[offset + 3] = 255; };
  const fillRect = (x, y, w, h, fill, stroke) => {
    for (let py = y; py < y + h; py += 1) for (let px = x; px < x + w; px += 1) pixel(px, py, px < x + 3 || px >= x + w - 3 || py < y + 3 || py >= y + h - 3 ? stroke : fill);
  };
  for (const [x, fill] of [[80, [222, 235, 255]], [380, [225, 246, 232]], [680, [255, 237, 213]]]) fillRect(x, 200, 200, 100, fill, [45, 74, 110]);
  for (const start of [280, 580]) {
    for (let x = start; x < start + 100; x += 1) for (let y = 247; y <= 252; y += 1) pixel(x, y, [45, 74, 110]);
    for (let delta = 0; delta < 16; delta += 1) for (let y = 250 - delta; y <= 250 + delta; y += 1) pixel(start + 99 - delta, y, [45, 74, 110]);
  }
  writePng(file, { width, height, rgba });
}

function deck(overrides = {}) {
  return {
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{ pageIndex: 0, background: { fill: "#FFFFFF" }, textBoxes: [{ id: "title", text: "Team deck", box: { x: 10, y: 10, w: 200, h: 30 }, font: { family: "Arial", sizePt: 20 } }], shapes: [], images: [], tables: [], charts: [], icons: [] }],
    ...overrides
  };
}
module.exports = { eraseMasks, readPng, rebuildDeckFromWorkDir, createFullSlideResidual, MINIMAL_PPTX_ENTRIES, writeMinimalPptx, assertMinimalPptxBuffer, minimalPptxBuilderSource, delayedMinimalPptxBuilderSource, field, tarEntry, archive, lineTextCoveredCropDeck, writeThreeCardDiagram, deck };
