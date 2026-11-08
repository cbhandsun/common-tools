"use strict";

const { createArchiveAdmission, IMAGE_EXTENSIONS, MAX_DECK_BYTES } = require("../slideclone-core/archive-admission");
const { assertEditableInputDocument } = require("../slideclone-core/document-input");
const { safeAssetPath, admitRebuiltPage, validateDeckIr } = require("../slideclone-core/deck-ir-admission");
const { admitRebuiltPageMetadata } = require("../slideclone-core/rebuilt-page-metadata");
const { admitOcrResult } = require("../slideclone-core/ocr/ocr-result-admission");
const { admitTemplateBuild } = require("../slideclone-core/template-build-admission");
const { readZipEntries } = require("../slideclone-core/pptx-zip");
const { readPng, writePng } = require("../slideclone-core/png");
const { MAX_ARCHIVE_BYTES, extractProjectArchive } = require("../archive-core");
const { admitNormalizedPages } = require("../slideclone-core/normalized-pages-admission");

module.exports = { createArchiveAdmission, IMAGE_EXTENSIONS, MAX_DECK_BYTES, assertEditableInputDocument, safeAssetPath, admitRebuiltPage, validateDeckIr, admitRebuiltPageMetadata, admitOcrResult, admitTemplateBuild, readZipEntries, readPng, writePng, MAX_ARCHIVE_BYTES, extractProjectArchive, admitNormalizedPages };
