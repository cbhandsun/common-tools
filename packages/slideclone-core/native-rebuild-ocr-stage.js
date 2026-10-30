"use strict";

const { recoverMissingOcrText } = require("./ocr/ocr-crop-text-recovery");
const { fitHighConfidenceSingleLineOcrToEvidence } = require("./typography/text-box-micro-adjust");
const { dropLineTextCoveredForegroundCrops, shouldDropLineTextCoveredForegroundCrop } = require("./scene-plan/page-output-rules");
const { createLineTextNativeComponentObjects } = require("./typography/line-text-native-components");
const { boundedOcrSourceDeck, correctContextualOcrLines, expandPositionedMixedColorTextSegments } = require("./ocr/ocr-source-deck");
const { admitOcrResult } = require("./ocr/ocr-result-admission");
const { applySourceWordLayouts, createSourceWordLayoutSession } = require("./typography/source-word-layout-registry");

module.exports = { recoverMissingOcrText, fitHighConfidenceSingleLineOcrToEvidence, dropLineTextCoveredForegroundCrops, shouldDropLineTextCoveredForegroundCrop, createLineTextNativeComponentObjects, boundedOcrSourceDeck, correctContextualOcrLines, expandPositionedMixedColorTextSegments, admitOcrResult, applySourceWordLayouts, createSourceWordLayoutSession };
