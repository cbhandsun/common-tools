"use strict";

const DEFAULT_OCR_ADAPTER = "scripts/adapters/ocr-paddleocr-local.js";
const UMI_OCR_ADAPTER = "scripts/adapters/ocr-umi-paddle.js";

function defaultOcrProviderConfigs() {
  return {
    umiOcr: {
      paddleBin: "C:\\Program Files\\Umi-OCR_Paddle_v2.1.5\\UmiOCR-data\\plugins\\win7_x64_PaddleOCR-json\\PaddleOCR-json.exe",
      initTimeoutMs: 60000
    },
    paddleOcr: {
      workerScript: "scripts/python/paddleocr_worker.py",
      lang: "ch",
      ocrVersion: "PP-OCRv6",
      textDetectionModel: "PP-OCRv6_small_det",
      textRecognitionModel: "PP-OCRv6_small_rec",
      modelCacheDir: ".tools/paddleocr-models",
      initTimeoutMs: 180000,
      timeoutMs: 120000,
      idleTimeoutMs: 30000,
      cache: true,
      cacheDir: "runs/ocr-cache/paddleocr-local"
    },
    tesseract: {
      bin: "tesseract",
      lang: "chi_sim+eng",
      tessdataPrefix: "./tools/tessdata",
      psm: 6
    }
  };
}

function readUmiOcrConfig(args = {}) {
  return {
    ...(args["umi-bin"] ? { paddleBin: args["umi-bin"] } : {}),
    ...(args["umi-models"] ? { modelsPath: args["umi-models"] } : {}),
    ...(args["ocr-cache-dir"] ? { cacheDir: args["ocr-cache-dir"] } : {}),
    cache: args["ocr-cache"] !== "false",
    initTimeoutMs: numberArg(args["umi-init-timeout-ms"], 60000)
  };
}

function readPaddleOcrConfig(args = {}) {
  return {
    pythonBin: args["paddle-ocr-python"] || undefined,
    workerScript: args["paddle-ocr-worker"] || undefined,
    lang: args["paddle-ocr-lang"] || "ch",
    ocrVersion: args["paddle-ocr-version"] || "PP-OCRv6",
    device: args["paddle-ocr-device"] || undefined,
    engine: args["paddle-ocr-engine"] || undefined,
    textDetectionModel: args["paddle-ocr-detection-model"] || undefined,
    textRecognitionModel: args["paddle-ocr-recognition-model"] || undefined,
    textDetectionModelDir: args["paddle-ocr-detection-model-dir"] || undefined,
    textRecognitionModelDir: args["paddle-ocr-recognition-model-dir"] || undefined,
    modelCacheDir: args["paddle-ocr-model-cache-dir"] || undefined,
    enableHpi: args["paddle-ocr-hpi"] === "true",
    useTextlineOrientation: args["paddle-ocr-textline-orientation"] === "true",
    initTimeoutMs: numberArg(args["paddle-ocr-init-timeout-ms"], 180000),
    timeoutMs: numberArg(args["paddle-ocr-timeout-ms"], 120000),
    cache: args["paddle-ocr-cache"] !== "false",
    cacheDir: args["paddle-ocr-cache-dir"] || "runs/ocr-cache/paddleocr-local"
  };
}

function numberArg(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

module.exports = {
  DEFAULT_OCR_ADAPTER,
  UMI_OCR_ADAPTER,
  defaultOcrProviderConfigs,
  readPaddleOcrConfig,
  readUmiOcrConfig
};
