"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const { normalizeTimeoutMs } = require("../lib/process-boundaries");
const { resolvePythonExecutable } = require("../lib/python-env");
const { boxFromPolygon, normalizeOcrItems } = require("../lib/ocr-result-contract");

const PROVIDER = "paddleocr-local-v1";
const PROTOCOL_VERSION = 2;
const MAX_BATCH_SIZE = 16;
const DEFAULT_MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
let enginePromise = null;
let activeEngine = null;
let activeIdentity = null;
let processExitHookInstalled = false;
const cachedSettingsIdentities = new Map();

async function paddleOcrLocal(input, context = {}) {
  const startedAt = Date.now();
  const normalizedInput = validateInput(input);
  const settings = resolveSettings(context);
  const imageHashStartedAt = Date.now();
  const imageHash = settings.cacheEnabled ? sha256File(normalizedInput.sourceImage) : null;
  const imageHashMs = Date.now() - imageHashStartedAt;
  const cacheLookupStartedAt = Date.now();
  const cache = readCache(normalizedInput, settings, imageHash);
  const cacheLookupMs = Date.now() - cacheLookupStartedAt;
  if (cache) return { ...cache, performance: safePerformance({ imageHashMs, cacheLookupMs, totalMs: Date.now() - startedAt, broker: false }) };
  const broker = resolveBroker(context);
  const inferenceStartedAt = Date.now();
  const raw = broker
    ? await runBrokerRaw(normalizedInput, settings, broker, context.signal)
    : await runLocalRawValidated(normalizedInput, settings, context.signal, true);
  const inferenceMs = Date.now() - inferenceStartedAt;
  writeCache(normalizedInput, settings, raw.items, raw.metadata, imageHash);
  return {
    ok: true,
    provider: PROVIDER,
    data: formatResult(raw.items, normalizedInput, raw.metadata),
    performance: safePerformance({ imageHashMs, cacheLookupMs, inferenceMs, totalMs: Date.now() - startedAt, broker: Boolean(broker) })
  };
}

async function paddleOcrBatch(inputs, context = {}) {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > MAX_BATCH_SIZE) throw new Error(`PaddleOCR batch size must be between 1 and ${MAX_BATCH_SIZE}`);
  const startedAt = Date.now();
  const normalized = inputs.map(validateInput);
  const settings = resolveSettings(context);
  const hashes = normalized.map((item) => settings.cacheEnabled ? sha256File(item.sourceImage) : null);
  const results = normalized.map((item, index) => readCache(item, settings, hashes[index]));
  const misses = normalized.map((item, index) => ({ item, index })).filter(({ index }) => !results[index]);
  if (misses.length > 0) {
    const broker = resolveBroker(context);
    const raw = broker
      ? await runBrokerRawBatch(misses.map(({ item }) => item), settings, broker, context.signal)
      : await runLocalRawBatchValidated(misses.map(({ item }) => item), settings, context.signal, true);
    raw.itemsByImage.forEach((items, missIndex) => {
      const { item, index } = misses[missIndex];
      writeCache(item, settings, items, raw.metadata, hashes[index]);
      results[index] = { ok: true, provider: PROVIDER, data: formatResult(items, item, raw.metadata) };
    });
  }
  const totalMs = Date.now() - startedAt;
  return results.map((result) => ({ ...result, performance: safePerformance({ totalMs, broker: Boolean(resolveBroker(context)) }) }));
}

async function runLocalRaw(input, context = {}) {
  const normalizedInput = validateInput(input);
  const settings = resolveSettings(context);
  return runLocalRawValidated(normalizedInput, settings, context.signal, false);
}

async function runLocalRawBatch(inputs, context = {}) {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > MAX_BATCH_SIZE) throw new Error(`PaddleOCR batch size must be between 1 and ${MAX_BATCH_SIZE}`);
  const normalized = inputs.map(validateInput);
  const settings = resolveSettings(context);
  return runLocalRawBatchValidated(normalized, settings, context.signal, false);
}

async function runLocalRawValidated(normalizedInput, settings, signal, scheduleClose) {
  const result = await runLocalRawBatchValidated([normalizedInput], settings, signal, scheduleClose);
  return { identity: result.identity, items: result.itemsByImage[0], metadata: result.metadata };
}

async function runLocalRawBatchValidated(normalizedInputs, settings, signal, scheduleClose) {
  const engine = await getEngine(settings);
  try {
    const response = await engine.runMany(normalizedInputs.map((item) => item.sourceImage), settings.timeoutMs, signal);
    return {
      identity: settings.identity,
      itemsByImage: response.itemsByImage.map((items, index) => normalizeOcrItems(items, {
        imageWidth: normalizedInputs[index].page?.widthPx,
        imageHeight: normalizedInputs[index].page?.heightPx
      })),
      metadata: engine.metadata
    };
  } finally {
    if (scheduleClose) engine.scheduleClose(settings.idleTimeoutMs);
  }
}

function validateInput(input) {
  if (!input || typeof input !== "object" || typeof input.sourceImage !== "string" || !input.sourceImage) {
    throw new Error("PaddleOCR input is invalid");
  }
  const sourceImage = path.resolve(input.sourceImage);
  let stats;
  try {
    stats = fs.statSync(sourceImage);
  } catch {
    throw new Error("PaddleOCR input image is unavailable");
  }
  if (!stats.isFile() || stats.size < 1 || stats.size > 256 * 1024 * 1024) {
    throw new Error("PaddleOCR input image is invalid");
  }
  const pageIndex = Number(input.pageIndex);
  if (!Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex > 100_000) {
    throw new Error("PaddleOCR page index is invalid");
  }
  return { ...input, sourceImage, pageIndex };
}

function resolveSettings(context) {
  const config = context.config?.paddleOcr || {};
  const skillRoot = context.skillRoot || path.resolve(__dirname, "../..");
  const workerScript = resolvePath(context, config.workerScript || "scripts/python/paddleocr_worker.py");
  if (!fs.existsSync(workerScript) || !fs.statSync(workerScript).isFile()) {
    throw new Error("PaddleOCR worker script is unavailable");
  }
  const settings = {
    pythonBin: resolvePaddlePython(config.pythonBin, skillRoot),
    workerScript,
    lang: boundedToken(config.lang, "ch", "language", /^[A-Za-z0-9_-]{2,32}$/),
    ocrVersion: boundedToken(config.ocrVersion, "PP-OCRv6", "OCR version", /^PP-OCRv[3-9]$/),
    device: optionalToken(config.device, "device", /^[A-Za-z0-9:_,-]{1,64}$/),
    engine: optionalEnum(config.engine ?? (process.platform === "win32" ? "paddle_dynamic" : null), "engine", ["paddle", "paddle_static", "paddle_dynamic", "transformers", "onnxruntime"]),
    cpuThreads: optionalInteger(config.cpuThreads, "cpuThreads", 1, 128),
    textDetectionModel: boundedToken(config.textDetectionModel, "PP-OCRv6_small_det", "textDetectionModel", /^[A-Za-z0-9_.-]{1,128}$/),
    textRecognitionModel: boundedToken(config.textRecognitionModel, "PP-OCRv6_small_rec", "textRecognitionModel", /^[A-Za-z0-9_.-]{1,128}$/),
    textDetectionModelDir: optionalExistingDirectory(context, config.textDetectionModelDir, "textDetectionModelDir"),
    textRecognitionModelDir: optionalExistingDirectory(context, config.textRecognitionModelDir, "textRecognitionModelDir"),
    enableHpi: config.enableHpi === true,
    useTextlineOrientation: config.useTextlineOrientation === true,
    timeoutMs: normalizeTimeoutMs(config.timeoutMs, 120_000),
    initTimeoutMs: normalizeTimeoutMs(config.initTimeoutMs, 180_000),
    idleTimeoutMs: normalizeTimeoutMs(config.idleTimeoutMs, 30_000),
    maxOutputBytes: optionalInteger(config.maxOutputBytes, "maxOutputBytes", 1024 * 1024, 64 * 1024 * 1024) || DEFAULT_MAX_OUTPUT_BYTES,
    cacheEnabled: config.cache !== false && config.cache !== "false",
    cacheDir: resolveCacheDir(context, config.cacheDir || "runs/ocr-cache/paddleocr-local"),
    modelCacheDir: config.modelCacheDir
      ? resolvePath(context, config.modelCacheDir)
      : path.resolve(skillRoot, "..", "..", ".tools", "paddleocr-models"),
    skillRoot
  };
  settings.identity = settingsIdentity(settings);
  return Object.freeze(settings);
}

async function getEngine(settings) {
  if (activeIdentity && activeIdentity !== settings.identity) closeActiveEngine();
  if (!enginePromise) {
    activeIdentity = settings.identity;
    enginePromise = startEngine(settings).catch((error) => {
      enginePromise = null;
      activeIdentity = null;
      throw error;
    });
  }
  return enginePromise;
}

async function startEngine(settings) {
  const args = [settings.workerScript, ...workerArguments(settings)];
  const child = spawn(settings.pythonBin, args, {
    cwd: path.dirname(settings.workerScript),
    windowsHide: true,
    shell: false,
    stdio: ["pipe", "pipe", "ignore"],
    env: safeWorkerEnvironment(settings)
  });
  const engine = new PaddleOcrEngine(child, settings);
  await engine.waitReady(settings.initTimeoutMs);
  activeEngine = engine;
  ensureProcessExitHook();
  return engine;
}

class PaddleOcrEngine {
  constructor(child, settings) {
    this.child = child;
    this.settings = settings;
    this.buffer = "";
    this.bufferBytes = 0;
    this.pending = new Map();
    this.idleTimer = null;
    this.ready = null;
    this.metadata = Object.freeze({ protocolVersion: PROTOCOL_VERSION, paddleocrVersion: "unknown", paddlepaddleVersion: "unknown" });
    child.stdout.on("data", (chunk) => this.onStdout(chunk));
    child.once("error", () => this.failAll(new Error("PaddleOCR worker could not start")));
    child.once("exit", () => this.failAll(new Error("PaddleOCR worker exited unexpectedly")));
  }

  waitReady(timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.close();
        reject(new Error("PaddleOCR worker initialization timed out"));
      }, timeoutMs);
      this.ready = {
        resolve: (metadata) => {
          clearTimeout(timer);
          this.ready = null;
          this.metadata = metadata;
          resolve();
        },
        reject: (error) => {
          clearTimeout(timer);
          this.ready = null;
          reject(error);
        }
      };
    });
  }

  onStdout(chunk) {
    this.bufferBytes += chunk.length;
    if (this.bufferBytes > this.settings.maxOutputBytes) {
      this.close(new Error("PaddleOCR worker output exceeds limits"));
      return;
    }
    this.buffer += chunk.toString("utf8");
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop();
    this.bufferBytes = Buffer.byteLength(this.buffer, "utf8");
    for (const line of lines) {
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        this.close(new Error("PaddleOCR worker returned invalid output"));
        return;
      }
      this.handleMessage(message);
    }
  }

  handleMessage(message) {
    if (!message || typeof message !== "object") {
      this.close(new Error("PaddleOCR worker returned invalid output"));
      return;
    }
    if (message.type === "ready" && this.ready) {
      if (message.protocolVersion !== PROTOCOL_VERSION) {
        this.close(new Error("PaddleOCR worker protocol is unsupported"));
        return;
      }
      this.ready.resolve(Object.freeze({
        protocolVersion: PROTOCOL_VERSION,
        ocrVersion: this.settings.ocrVersion,
        lang: this.settings.lang,
        engine: this.settings.engine,
        textDetectionModel: this.settings.textDetectionModel,
        textRecognitionModel: this.settings.textRecognitionModel,
        paddleocrVersion: safeVersion(message.paddleocrVersion),
        paddlepaddleVersion: safeVersion(message.paddlepaddleVersion)
      }));
      return;
    }
    if (message.type === "fatal" && this.ready) {
      const errorType = safeErrorType(message.errorType);
      this.close(new Error(`PaddleOCR worker initialization failed${errorType ? ` (${errorType})` : ""}`));
      return;
    }
    if (typeof message.id !== "string") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    pending.cleanup();
    if (message.type === "result" && Array.isArray(message.itemsByImage)) pending.resolve({ itemsByImage: message.itemsByImage });
    else {
      const errorType = safeErrorType(message.errorType);
      pending.reject(new Error(`PaddleOCR inference failed${errorType ? ` (${errorType})` : ""}`));
    }
  }

  run(imagePath, timeoutMs, signal) {
    return this.runMany([imagePath], timeoutMs, signal).then((result) => ({ items: result.itemsByImage[0] }));
  }

  runMany(imagePaths, timeoutMs, signal) {
    if (!this.child || this.child.exitCode !== null) return Promise.reject(new Error("PaddleOCR worker is not running"));
    if (signal?.aborted) return Promise.reject(new Error("PaddleOCR inference was cancelled"));
    if (!Array.isArray(imagePaths) || imagePaths.length < 1 || imagePaths.length > MAX_BATCH_SIZE || imagePaths.some((item) => typeof item !== "string")) {
      return Promise.reject(new Error("PaddleOCR worker batch request is invalid"));
    }
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    const id = crypto.randomUUID();
    const requestBody = `${JSON.stringify({ id, imagePaths })}\n`;
    if (Buffer.byteLength(requestBody, "utf8") > 64 * 1024) return Promise.reject(new Error("PaddleOCR worker batch request exceeds limits"));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        cleanup();
        this.close();
        reject(new Error("PaddleOCR inference timed out"));
      }, timeoutMs);
      const abort = () => {
        this.pending.delete(id);
        cleanup();
        this.close();
        reject(new Error("PaddleOCR inference was cancelled"));
      };
      const cleanup = () => {
        clearTimeout(timeout);
        if (signal) signal.removeEventListener("abort", abort);
      };
      this.pending.set(id, { resolve, reject, cleanup });
      if (signal) signal.addEventListener("abort", abort, { once: true });
      this.child.stdin.write(requestBody, "utf8", (error) => {
        if (!error || !this.pending.has(id)) return;
        this.pending.delete(id);
        cleanup();
        reject(new Error("PaddleOCR worker request failed"));
      });
    });
  }

  failAll(error) {
    if (this.ready) this.ready.reject(error);
    for (const pending of this.pending.values()) {
      pending.cleanup();
      pending.reject(error);
    }
    this.pending.clear();
  }

  scheduleClose(delayMs) {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.close(), delayMs);
    this.idleTimer.unref?.();
  }

  close(error = new Error("PaddleOCR worker stopped")) {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.failAll(error);
    if (activeEngine === this) activeEngine = null;
    if (activeIdentity === this.settings.identity) activeIdentity = null;
    if (enginePromise) enginePromise = null;
    try {
      if (this.child && this.child.exitCode === null) this.child.kill();
    } catch {
      // Best-effort cleanup of the isolated worker.
    }
  }
}

function formatResult(items, input, metadata) {
  const scale = getScale(input);
  const lines = spatiallySortItems(items).map((item, index) => {
    const pixelBox = boxFromPolygon(item.polygon);
    const polygon = item.polygon.map(([x, y]) => Object.freeze([x * scale.x, y * scale.y]));
    return {
      id: `p${input.pageIndex}-l${index}`,
      text: item.text,
      confidence: item.confidence,
      orientation: item.orientation,
      polygon,
      box: { x: pixelBox.x * scale.x, y: pixelBox.y * scale.y, w: pixelBox.w * scale.x, h: pixelBox.h * scale.y },
      sourceImage: input.sourceImage
    };
  });
  return {
    words: lines.map((line, index) => ({ ...line, id: `p${input.pageIndex}-w${index}` })),
    lines,
    paragraphs: [],
    provider: PROVIDER,
    model: {
      ocrVersion: metadata.ocrVersion || null,
      lang: metadata.lang || null,
      engine: metadata.engine || null,
      textDetectionModel: metadata.textDetectionModel || null,
      textRecognitionModel: metadata.textRecognitionModel || null,
      paddleocrVersion: metadata.paddleocrVersion,
      paddlepaddleVersion: metadata.paddlepaddleVersion
    }
  };
}

function spatiallySortItems(items) {
  return [...items].sort((left, right) => {
    const a = boxFromPolygon(left.polygon);
    const b = boxFromPolygon(right.polygon);
    const rowTolerance = Math.max(a.h, b.h) * 0.6;
    const aCenter = a.y + a.h / 2;
    const bCenter = b.y + b.h / 2;
    return Math.abs(aCenter - bCenter) <= rowTolerance ? a.x - b.x : aCenter - bCenter;
  });
}

function readCache(input, settings, imageHash) {
  const file = cacheFile(settings, imageHash);
  if (!file || !fs.existsSync(file)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(file, "utf8"));
    if (payload.provider !== PROVIDER || payload.identity !== settings.identity || payload.imageHash !== imageHash) return null;
    const items = normalizeOcrItems(payload.items, { imageWidth: input.page?.widthPx, imageHeight: input.page?.heightPx });
    return { ok: true, provider: PROVIDER, cached: true, data: formatResult(items, input, payload.metadata || {}) };
  } catch {
    return null;
  }
}

function writeCache(input, settings, items, metadata, imageHash) {
  const file = cacheFile(settings, imageHash);
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const payload = { provider: PROVIDER, identity: settings.identity, imageHash, metadata, items };
    fs.writeFileSync(file, `${JSON.stringify(payload)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error?.code !== "EEXIST") {
      // Cache is best-effort and contains no loggable user content.
    }
  }
}

function cacheFile(settings, imageHash) {
  if (!settings.cacheEnabled || !imageHash) return null;
  const key = crypto.createHash("sha256").update(`${imageHash}|${settings.identity}`).digest("hex");
  return path.join(settings.cacheDir, `${key}.json`);
}

function resolveBroker(context = {}) {
  if (context.disablePaddleOcrBroker === true) return null;
  const config = context.config?.paddleOcr || {};
  const rawUrl = config.brokerUrl || process.env.SLIDECLONE_PADDLE_OCR_BROKER_URL;
  const token = config.brokerToken || process.env.SLIDECLONE_PADDLE_OCR_BROKER_TOKEN;
  if (!rawUrl && !token) return null;
  if (typeof rawUrl !== "string" || typeof token !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
    throw new Error("PaddleOCR broker configuration is invalid");
  }
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("PaddleOCR broker URL is invalid");
  }
  if (url.protocol !== "http:" || !["127.0.0.1", "::1"].includes(url.hostname) || url.pathname !== "/") {
    throw new Error("PaddleOCR broker must use a loopback HTTP endpoint");
  }
  return Object.freeze({ url: url.origin, token });
}

function runBrokerRaw(input, settings, broker, signal) {
  return runBrokerRequest("/v1/ocr", { input: brokerInput(input) }, input, settings, broker, signal);
}

async function runBrokerRawBatch(inputs, settings, broker, signal) {
  const payload = await runBrokerRequest("/v1/ocr-batch", { inputs: inputs.map(brokerInput) }, null, settings, broker, signal);
  if (!Array.isArray(payload.itemsByImage) || payload.itemsByImage.length !== inputs.length) throw new Error("PaddleOCR broker returned invalid output");
  return {
    identity: payload.identity,
    itemsByImage: payload.itemsByImage.map((items, index) => normalizeOcrItems(items, {
      imageWidth: inputs[index].page?.widthPx,
      imageHeight: inputs[index].page?.heightPx
    })),
    metadata: payload.metadata || {}
  };
}

function brokerInput(input) {
  return { sourceImage: input.sourceImage, pageIndex: input.pageIndex, page: input.page, slideSize: input.slideSize };
}

function runBrokerRequest(endpoint, payload, input, settings, broker, signal) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(payload), "utf8");
    const url = new URL(endpoint, broker.url);
    const request = http.request(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${broker.token}`,
        "content-type": "application/json",
        "content-length": body.length
      }
    });
    let responseBody = "";
    let responseBytes = 0;
    const timer = setTimeout(() => request.destroy(new Error("PaddleOCR broker timed out")), settings.timeoutMs + settings.initTimeoutMs);
    const abort = () => request.destroy(new Error("PaddleOCR request cancelled"));
    if (signal?.aborted) abort();
    else signal?.addEventListener?.("abort", abort, { once: true });
    request.on("response", (response) => {
      response.on("data", (chunk) => {
        responseBytes += chunk.length;
        if (responseBytes > settings.maxOutputBytes) request.destroy(new Error("PaddleOCR broker output exceeds limits"));
        else responseBody += chunk.toString("utf8");
      });
      response.on("end", () => {
        clearTimeout(timer);
        signal?.removeEventListener?.("abort", abort);
        if (response.statusCode !== 200) return reject(new Error(`PaddleOCR broker failed (${response.statusCode || 500})`));
        try {
          const payload = JSON.parse(responseBody);
          if (payload.identity !== settings.identity) throw new Error("PaddleOCR broker identity mismatch");
          const normalized = {
            identity: payload.identity,
            items: input ? normalizeOcrItems(payload.items, {
              imageWidth: input.page?.widthPx,
              imageHeight: input.page?.heightPx
            }) : payload.items,
            itemsByImage: payload.itemsByImage,
            metadata: payload.metadata || {}
          };
          resolve(normalized);
        } catch {
          reject(new Error("PaddleOCR broker returned invalid output"));
        }
      });
    });
    request.once("error", (error) => {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", abort);
      reject(error);
    });
    request.end(body);
  });
}

function workerArguments(settings) {
  const args = ["--lang", settings.lang, "--ocr-version", settings.ocrVersion];
  pushArgument(args, "--device", settings.device);
  pushArgument(args, "--engine", settings.engine);
  pushArgument(args, "--cpu-threads", settings.cpuThreads);
  pushArgument(args, "--text-detection-model", settings.textDetectionModel);
  pushArgument(args, "--text-recognition-model", settings.textRecognitionModel);
  pushArgument(args, "--text-detection-model-dir", settings.textDetectionModelDir);
  pushArgument(args, "--text-recognition-model-dir", settings.textRecognitionModelDir);
  if (settings.enableHpi) args.push("--enable-hpi");
  if (settings.useTextlineOrientation) args.push("--use-textline-orientation");
  return args;
}

function safeWorkerEnvironment(settings) {
  const names = ["PATH", "Path", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE", "CUDA_VISIBLE_DEVICES", "CUDA_PATH", "LD_LIBRARY_PATH"];
  const env = {};
  for (const name of names) if (typeof process.env[name] === "string") env[name] = process.env[name];
  env.PYTHONIOENCODING = "utf-8";
  env.PYTHONUNBUFFERED = "1";
  if (settings.modelCacheDir) env.PADDLE_PDX_CACHE_HOME = settings.modelCacheDir;
  return env;
}

function settingsIdentity(settings) {
  const scriptStat = fs.statSync(settings.workerScript);
  const identityCacheKey = JSON.stringify({
    workerScript: path.resolve(settings.workerScript),
    scriptSize: scriptStat.size,
    scriptMtimeMs: scriptStat.mtimeMs,
    scriptCtimeMs: scriptStat.ctimeMs,
    pythonBin: executableIdentity(settings.pythonBin),
    lang: settings.lang,
    ocrVersion: settings.ocrVersion,
    device: settings.device,
    engine: settings.engine,
    cpuThreads: settings.cpuThreads,
    textDetectionModel: settings.textDetectionModel,
    textRecognitionModel: settings.textRecognitionModel,
    textDetectionModelDir: directoryIdentity(settings.textDetectionModelDir),
    textRecognitionModelDir: directoryIdentity(settings.textRecognitionModelDir),
    enableHpi: settings.enableHpi,
    useTextlineOrientation: settings.useTextlineOrientation
  });
  if (cachedSettingsIdentities.has(identityCacheKey)) return cachedSettingsIdentities.get(identityCacheKey);
  const identity = {
    protocolVersion: PROTOCOL_VERSION,
    workerScript: sha256File(settings.workerScript),
    pythonBin: executableIdentity(settings.pythonBin),
    lang: settings.lang,
    ocrVersion: settings.ocrVersion,
    device: settings.device,
    engine: settings.engine,
    cpuThreads: settings.cpuThreads,
    textDetectionModel: settings.textDetectionModel,
    textRecognitionModel: settings.textRecognitionModel,
    textDetectionModelDir: directoryIdentity(settings.textDetectionModelDir),
    textRecognitionModelDir: directoryIdentity(settings.textRecognitionModelDir),
    enableHpi: settings.enableHpi,
    useTextlineOrientation: settings.useTextlineOrientation,
    scriptSize: scriptStat.size
  };
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(identity)).digest("hex");
  if (cachedSettingsIdentities.size >= 32) cachedSettingsIdentities.delete(cachedSettingsIdentities.keys().next().value);
  cachedSettingsIdentities.set(identityCacheKey, fingerprint);
  return fingerprint;
}

function safePerformance(value = {}) {
  return Object.freeze({
    imageHashMs: boundedMetric(value.imageHashMs),
    cacheLookupMs: boundedMetric(value.cacheLookupMs),
    inferenceMs: boundedMetric(value.inferenceMs),
    totalMs: boundedMetric(value.totalMs),
    broker: value.broker === true
  });
}

function boundedMetric(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 && number <= 3_600_000 ? number : 0;
}

function executableIdentity(value) {
  if (!path.isAbsolute(value) || !fs.existsSync(value)) return value;
  const stat = fs.statSync(value);
  return `${path.resolve(value)}:${stat.size}:${stat.mtimeMs}`;
}

function directoryIdentity(value) {
  if (!value) return null;
  const stat = fs.statSync(value);
  return `${path.resolve(value)}:${stat.mtimeMs}`;
}

function closeActiveEngine() {
  if (activeEngine) activeEngine.close();
  activeEngine = null;
  enginePromise = null;
  activeIdentity = null;
}

function ensureProcessExitHook() {
  if (processExitHookInstalled) return;
  processExitHookInstalled = true;
  process.once("exit", closeActiveEngine);
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function resolvePath(context, value) {
  if (path.isAbsolute(value)) return path.normalize(value);
  const candidates = [
    context.configFile ? path.resolve(path.dirname(context.configFile), value) : null,
    context.skillRoot ? path.resolve(context.skillRoot, value) : null,
    path.resolve(process.cwd(), value)
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[candidates.length - 1];
}

function resolvePaddlePython(explicit, skillRoot) {
  const workspaceRoot = path.resolve(skillRoot, "..", "..");
  const managed = process.platform === "win32"
    ? path.join(workspaceRoot, ".tools", "paddleocr-venv", "Scripts", "python.exe")
    : path.join(workspaceRoot, ".tools", "paddleocr-venv", "bin", "python");
  return resolvePythonExecutable(explicit || (fs.existsSync(managed) ? managed : undefined));
}

function resolveCacheDir(context, value) {
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(process.cwd(), value);
}

function optionalExistingDirectory(context, value, name) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 32_768) throw new Error(`PaddleOCR ${name} is invalid`);
  const resolved = resolvePath(context, value);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) throw new Error(`PaddleOCR ${name} is unavailable`);
  return resolved;
}

function boundedToken(value, fallback, name, pattern) {
  const resolved = value === undefined || value === null || value === "" ? fallback : value;
  if (typeof resolved !== "string" || !pattern.test(resolved)) throw new Error(`PaddleOCR ${name} is invalid`);
  return resolved;
}

function optionalToken(value, name, pattern) {
  if (value === undefined || value === null || value === "") return null;
  return boundedToken(value, null, name, pattern);
}

function optionalEnum(value, name, allowed) {
  if (value === undefined || value === null || value === "") return null;
  if (!allowed.includes(value)) throw new Error(`PaddleOCR ${name} is invalid`);
  return value;
}

function optionalInteger(value, name, minimum, maximum) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(`PaddleOCR ${name} is invalid`);
  return number;
}

function safeVersion(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.+-]{1,64}$/.test(value) ? value : "unknown";
}

function safeErrorType(value) {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value) ? value : null;
}

function pushArgument(args, name, value) {
  if (value !== null && value !== undefined) args.push(name, String(value));
}

function getScale(input) {
  const widthPx = input.page?.widthPx;
  const heightPx = input.page?.heightPx;
  const widthPt = input.slideSize?.widthPt;
  const heightPt = input.slideSize?.heightPt;
  if (Number.isFinite(widthPx) && Number.isFinite(heightPx) && widthPx > 0 && heightPx > 0) {
    return { x: Number.isFinite(widthPt) ? widthPt / widthPx : 1, y: Number.isFinite(heightPt) ? heightPt / heightPx : 1 };
  }
  return { x: 1, y: 1 };
}

module.exports = paddleOcrLocal;
module.exports.maxConcurrency = 1;
module.exports.runBatch = paddleOcrBatch;
module.exports.closeActiveEngine = closeActiveEngine;
module.exports._private = {
  formatResult,
  resolveBroker,
  resolveSettings,
  runBrokerRaw,
  runBrokerRawBatch,
  runLocalRaw,
  runLocalRawBatch,
  safePerformance,
  safeWorkerEnvironment,
  spatiallySortItems,
  workerArguments
};
