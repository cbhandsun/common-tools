"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { EXPECTED_VERSIONS, MIN_TEXT_CONFIDENCE, PROFILE_NAME, createPinnedPaddleImageNormalizer, createPinnedPaddleRawImageOcr, normalizeLines, readPinnedPaddleOcrProfile, sha256File, verifyPinnedPaddleOcrProfile } = require("../packages/slideclone-core/team-paddleocr-profile");

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
    COMMON_TOOLS_IMAGE_PADDLEOCR_IMAGE_NORMALIZER: __filename,
    COMMON_TOOLS_IMAGE_PADDLEOCR_IMAGE_NORMALIZER_SHA256: sha256File(__filename),
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
  assert.deepEqual(normalizeLines(valid, { widthPx: 100, heightPx: 100 }), { lines: [{ text: "你好", confidence: 0.99, box: { x: 1, y: 2, w: 10, h: 6 } }] });
  assert.deepEqual(normalizeLines([{ ...valid[0], confidence: MIN_TEXT_CONFIDENCE - 0.01 }], { widthPx: 100, heightPx: 100 }), { lines: [] });
  assert.throws(() => normalizeLines([{ ...valid[0], confidence: 2 }], { widthPx: 100, heightPx: 100 }), /confidence/);
  assert.throws(() => normalizeLines([{ ...valid[0], polygon: [[99, 2], [110, 2], [110, 8], [99, 8]] }], { widthPx: 100, heightPx: 100 }), /geometry/);
  assert.throws(() => normalizeLines([{ ...valid[0], text: "" }], { widthPx: 100, heightPx: 100 }), /text/);
});

test("pinned image normalizer uses fixed arguments, a minimal environment, cancellation and sanitized failures", async () => {
  const profile = readPinnedPaddleOcrProfile(environment());
  const calls = [];
  const normalizer = createPinnedPaddleImageNormalizer(profile, { execFile: (file, args, options, callback) => { calls.push({ file, args, options }); callback(null); } });
  await normalizer({ inputFile: __filename, outputFile: path.join(os.tmpdir(), "normalized.png"), dimensions: { widthPx: 960, heightPx: 540 }, isCancellationRequested: async () => false });
  assert.equal(calls[0].file, profile.python);
  assert.deepEqual(calls[0].args.slice(0, 5), [profile.imageNormalizer, "--input", __filename, "--output", path.join(os.tmpdir(), "normalized.png")]);
  assert.equal(calls[0].options.env.TEST_PADDLEOCR_SECRET, undefined);
  await assert.rejects(() => normalizer({ inputFile: "relative.jpg", outputFile: path.join(os.tmpdir(), "x.png"), dimensions: { widthPx: 1, heightPx: 1 } }), /request is invalid/);
  await assert.rejects(() => normalizer({ inputFile: __filename, outputFile: path.join(os.tmpdir(), "x.png"), dimensions: { widthPx: 0, heightPx: 1 } }), /request is invalid/);
  await assert.rejects(() => normalizer({ inputFile: __filename, outputFile: path.join(os.tmpdir(), "x.png"), dimensions: { widthPx: 1, heightPx: 1 }, isCancellationRequested: async () => true }), /cancelled/);
  const failed = createPinnedPaddleImageNormalizer(profile, { execFile: (_file, _args, _options, callback) => callback(new Error("token=secret")) });
  await assert.rejects(() => failed({ inputFile: __filename, outputFile: path.join(os.tmpdir(), "x.png"), dimensions: { widthPx: 1, heightPx: 1 } }), /^Error: PaddleOCR image normalization failed$/);
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
