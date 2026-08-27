"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { EXPECTED_VERSIONS, PROFILE_NAME, createPinnedPaddleRawImageOcr, normalizeLines, readPinnedPaddleOcrProfile, sha256File, verifyPinnedPaddleOcrProfile } = require("../packages/slideclone-core/team-paddleocr-profile");

function environment(overrides = {}) {
  const fixture = path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png");
  return {
    COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE: PROFILE_NAME,
    COMMON_TOOLS_IMAGE_PADDLEOCR_PYTHON: process.execPath,
    COMMON_TOOLS_IMAGE_PADDLEOCR_PYTHON_SHA256: sha256File(process.execPath),
    COMMON_TOOLS_IMAGE_PADDLEOCR_ADAPTER: __filename,
    COMMON_TOOLS_IMAGE_PADDLEOCR_ADAPTER_SHA256: sha256File(__filename),
    COMMON_TOOLS_IMAGE_PADDLEOCR_WORKER: __filename,
    COMMON_TOOLS_IMAGE_PADDLEOCR_WORKER_SHA256: sha256File(__filename),
    COMMON_TOOLS_IMAGE_PADDLEOCR_MODEL_CACHE: os.tmpdir(),
    COMMON_TOOLS_IMAGE_PADDLEOCR_HEALTHCHECK: fixture,
    COMMON_TOOLS_IMAGE_PADDLEOCR_HEALTHCHECK_SHA256: sha256File(fixture),
    ...overrides
  };
}

test("pinned PaddleOCR profile validates every executable source and model boundary", () => {
  const profile = readPinnedPaddleOcrProfile(environment());
  assert.equal(profile.kind, "paddleocr");
  assert.equal(profile.name, PROFILE_NAME);
  assert.throws(() => readPinnedPaddleOcrProfile(environment({ COMMON_TOOLS_IMAGE_PADDLEOCR_WORKER_SHA256: "b".repeat(64) })), /checksum/);
  assert.throws(() => readPinnedPaddleOcrProfile(environment({ COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE: "paddle-latest" })), /unsupported/);
  assert.throws(() => readPinnedPaddleOcrProfile(environment({ COMMON_TOOLS_IMAGE_PADDLEOCR_MODEL_CACHE: path.join(os.tmpdir(), "missing-paddle-models") })), /unavailable/);
});

test("PaddleOCR result normalization rejects unsafe text and geometry", () => {
  const valid = [{ text: "你好", polygon: [[1, 2], [11, 2], [11, 8], [1, 8]], confidence: 0.99 }];
  assert.deepEqual(normalizeLines(valid, { widthPx: 100, heightPx: 100 }), { lines: [{ text: "你好", box: { x: 1, y: 2, w: 10, h: 6 } }] });
  assert.throws(() => normalizeLines([{ ...valid[0], polygon: [[99, 2], [110, 2], [110, 8], [99, 8]] }], { widthPx: 100, heightPx: 100 }), /geometry/);
  assert.throws(() => normalizeLines([{ ...valid[0], text: "" }], { widthPx: 100, heightPx: 100 }), /text/);
});

test("pinned PaddleOCR adapter uses fixed models, checks versions, warms startup and observes cancellation", async () => {
  const profile = readPinnedPaddleOcrProfile(environment());
  let context;
  let closed = false;
  const loadAdapter = () => ({ closeActiveEngine: () => { closed = true; }, _private: { runLocalRaw: async (_input, value) => {
    context = value;
    return { items: [{ text: "Editable", polygon: [[1, 2], [21, 2], [21, 10], [1, 10]], confidence: 0.9 }], metadata: { paddleocrVersion: EXPECTED_VERSIONS.paddleocr, paddlepaddleVersion: EXPECTED_VERSIONS.paddlepaddle } };
  } } });
  const ocr = createPinnedPaddleRawImageOcr(profile, { loadAdapter });
  const result = await ocr({ inputFile: profile.healthcheckImage, dimensions: { widthPx: 960, heightPx: 540 }, isCancellationRequested: async () => false });
  assert.equal(result.lines[0].text, "Editable");
  assert.deepEqual({ lang: context.config.paddleOcr.lang, version: context.config.paddleOcr.ocrVersion, engine: context.config.paddleOcr.engine, detection: context.config.paddleOcr.textDetectionModel, recognition: context.config.paddleOcr.textRecognitionModel, cache: context.config.paddleOcr.cache }, { lang: "ch", version: "PP-OCRv6", engine: "paddle_dynamic", detection: "PP-OCRv6_small_det", recognition: "PP-OCRv6_small_rec", cache: false });
  assert.equal(await verifyPinnedPaddleOcrProfile(profile, ocr), true);
  ocr.close();
  assert.equal(closed, true);
  await assert.rejects(() => ocr({ inputFile: profile.healthcheckImage, dimensions: { widthPx: 960, heightPx: 540 }, isCancellationRequested: async () => true }), /cancelled/);
  const badVersion = createPinnedPaddleRawImageOcr(profile, { loadAdapter: () => ({ _private: { runLocalRaw: async () => ({ items: [], metadata: { paddleocrVersion: "latest", paddlepaddleVersion: EXPECTED_VERSIONS.paddlepaddle } }) } }) });
  await assert.rejects(() => badVersion({ inputFile: profile.healthcheckImage, dimensions: { widthPx: 960, heightPx: 540 }, isCancellationRequested: async () => false }), /version/);
});
