"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PROFILE_NAME = "paddleocr-ppocrv6-v1";
const EXPECTED_VERSIONS = Object.freeze({ paddlepaddle: "3.3.1", paddleocr: "3.7.0" });
const MAX_LINES = 10000;

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
function required(environment, name) {
  const value = environment?.[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required when PaddleOCR is enabled`);
  return value.trim();
}
function checkedFile(environment, pathName, hashName) {
  const file = required(environment, pathName);
  const expected = required(environment, hashName).toLowerCase();
  if (!path.isAbsolute(file) || !/^[a-f0-9]{64}$/.test(expected)) throw new Error(`${pathName} is invalid`);
  let valid;
  try { valid = fs.statSync(file).isFile(); } catch { throw new Error(`${pathName} is unavailable`); }
  if (!valid) throw new Error(`${pathName} is unavailable`);
  const actual = sha256File(file);
  if (!crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) throw new Error(`${pathName} checksum does not match`);
  return file;
}
function readPinnedPaddleOcrProfile(environment = process.env) {
  if (!environment || typeof environment !== "object") throw new TypeError("PaddleOCR profile configuration is invalid");
  if (environment.COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE !== PROFILE_NAME) throw new Error("PaddleOCR profile name is unsupported");
  const modelCacheDir = required(environment, "COMMON_TOOLS_IMAGE_PADDLEOCR_MODEL_CACHE");
  let modelCacheValid;
  try { modelCacheValid = path.isAbsolute(modelCacheDir) && fs.statSync(modelCacheDir).isDirectory(); } catch { throw new Error("COMMON_TOOLS_IMAGE_PADDLEOCR_MODEL_CACHE is unavailable"); }
  if (!modelCacheValid) throw new Error("COMMON_TOOLS_IMAGE_PADDLEOCR_MODEL_CACHE is unavailable");
  return Object.freeze({
    enabled: true,
    kind: "paddleocr",
    name: PROFILE_NAME,
    python: checkedFile(environment, "COMMON_TOOLS_IMAGE_PADDLEOCR_PYTHON", "COMMON_TOOLS_IMAGE_PADDLEOCR_PYTHON_SHA256"),
    adapter: checkedFile(environment, "COMMON_TOOLS_IMAGE_PADDLEOCR_ADAPTER", "COMMON_TOOLS_IMAGE_PADDLEOCR_ADAPTER_SHA256"),
    worker: checkedFile(environment, "COMMON_TOOLS_IMAGE_PADDLEOCR_WORKER", "COMMON_TOOLS_IMAGE_PADDLEOCR_WORKER_SHA256"),
    healthcheckImage: checkedFile(environment, "COMMON_TOOLS_IMAGE_PADDLEOCR_HEALTHCHECK", "COMMON_TOOLS_IMAGE_PADDLEOCR_HEALTHCHECK_SHA256"),
    modelCacheDir
  });
}
function polygonBox(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 4 || polygon.length > 16) throw new Error("PaddleOCR result polygon is invalid");
  const points = polygon.map((point) => {
    if (!Array.isArray(point) || point.length !== 2 || point.some((value) => !Number.isFinite(value))) throw new Error("PaddleOCR result polygon is invalid");
    return point;
  });
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const x = Math.min(...xs); const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
function normalizeLines(items, dimensions) {
  if (!Array.isArray(items) || items.length > MAX_LINES) throw new Error("PaddleOCR result exceeds limits");
  const lines = items.map((item) => {
    if (!item || typeof item.text !== "string" || !item.text.trim() || item.text.length > 512) throw new Error("PaddleOCR result text is invalid");
    const box = polygonBox(item.polygon);
    if (box.x < 0 || box.y < 0 || box.w <= 0 || box.h <= 0 || box.x + box.w > dimensions.widthPx || box.y + box.h > dimensions.heightPx) throw new Error("PaddleOCR result geometry is invalid");
    return Object.freeze({ text: item.text.trim(), box: Object.freeze(box) });
  });
  return Object.freeze({ lines: Object.freeze(lines) });
}
function createPinnedPaddleRawImageOcr(profile, { loadAdapter = require } = {}) {
  if (!profile || profile.enabled !== true || profile.kind !== "paddleocr" || typeof loadAdapter !== "function") throw new TypeError("PaddleOCR profile is invalid");
  const adapter = loadAdapter(profile.adapter);
  const runLocalRaw = adapter?._private?.runLocalRaw;
  if (typeof runLocalRaw !== "function") throw new Error("PaddleOCR adapter contract is unavailable");
  const ocr = async ({ inputFile, dimensions, isCancellationRequested }) => {
    if (typeof inputFile !== "string" || !path.isAbsolute(inputFile) || !dimensions || !Number.isSafeInteger(dimensions.widthPx) || !Number.isSafeInteger(dimensions.heightPx)) throw new Error("PaddleOCR request is invalid");
    if (await isCancellationRequested?.()) throw new Error("PaddleOCR request was cancelled");
    const controller = new AbortController();
    let checking = false;
    const cancellationTimer = typeof isCancellationRequested === "function" ? setInterval(async () => {
      if (checking) return;
      checking = true;
      try { if (await isCancellationRequested()) controller.abort(); } catch { controller.abort(); }
      finally { checking = false; }
    }, 250) : null;
    try {
      const raw = await runLocalRaw({ sourceImage: inputFile, pageIndex: 0, page: dimensions, slideSize: { widthPt: dimensions.widthPx, heightPt: dimensions.heightPx } }, {
        signal: controller.signal,
        skillRoot: path.resolve(path.dirname(profile.adapter), "..", ".."),
        config: { paddleOcr: { pythonBin: profile.python, workerScript: profile.worker, modelCacheDir: profile.modelCacheDir, lang: "ch", ocrVersion: "PP-OCRv6", device: "cpu", engine: "paddle_dynamic", cpuThreads: 2, textDetectionModel: "PP-OCRv6_small_det", textRecognitionModel: "PP-OCRv6_small_rec", cache: false, timeoutMs: 120000, initTimeoutMs: 180000 } }
      });
      if (!raw?.metadata || raw.metadata.paddleocrVersion !== EXPECTED_VERSIONS.paddleocr || raw.metadata.paddlepaddleVersion !== EXPECTED_VERSIONS.paddlepaddle) throw new Error("PaddleOCR runtime version does not match");
      return normalizeLines(raw.items, dimensions);
    } finally { if (cancellationTimer) clearInterval(cancellationTimer); }
  };
  ocr.close = () => adapter.closeActiveEngine?.();
  return ocr;
}
async function verifyPinnedPaddleOcrProfile(profile, ocr) {
  if (typeof ocr !== "function") throw new TypeError("PaddleOCR startup verifier is invalid");
  // A real inference warms the long-lived model process and verifies that the
  // packaged Python environment, models, adapter and worker agree.
  await ocr({ inputFile: profile.healthcheckImage, dimensions: { widthPx: 960, heightPx: 540 }, isCancellationRequested: async () => false });
  return true;
}

module.exports = { EXPECTED_VERSIONS, PROFILE_NAME, createPinnedPaddleRawImageOcr, normalizeLines, readPinnedPaddleOcrProfile, sha256File, verifyPinnedPaddleOcrProfile };
