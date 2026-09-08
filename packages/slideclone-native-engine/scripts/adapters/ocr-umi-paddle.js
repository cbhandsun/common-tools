"use strict";

const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { normalizeTimeoutMs } = require("../lib/process-boundaries");
const { boxFromPolygon, normalizeOcrItems } = require("../lib/ocr-result-contract");

let enginePromise = null;
let activeEngine = null;
let activeIdentity = null;
let processExitHookInstalled = false;

async function umiPaddleOcr(input, context = {}) {
  validateInput(input);
  const cache = readCache(input, context);
  if (cache) return cache;
  const engine = await getEngine(context);
  const result = await engine.run(input.sourceImage, normalizeTimeoutMs(context.config?.umiOcr?.timeoutMs, 120000));
  if (result.code !== 100) {
    engine.scheduleClose(normalizeTimeoutMs(context.config?.umiOcr?.idleTimeoutMs, 30000));
    return failureResult(result.code);
  }
  const scale = getScale(input);
  writeCache(input, context, result.data || []);
  engine.scheduleClose(normalizeTimeoutMs(context.config?.umiOcr?.idleTimeoutMs, 30000));
  return {
    ok: true,
    provider: "umi-paddleocr-json",
    data: parseResult(result.data || [], input.sourceImage, input.pageIndex, scale, engine.exePath)
  };
}

module.exports = umiPaddleOcr;
module.exports.maxConcurrency = 1;
module.exports.closeActiveEngine = closeActiveEngine;
module.exports._private = {
  engineIdentity,
  failureResult,
  parseResult,
  spatiallySortOcrItems
};

function closeActiveEngine() {
  if (activeEngine) activeEngine.close();
  enginePromise = null;
  activeIdentity = null;
}

function readCache(input, context) {
  const file = cacheFile(input, context);
  if (!file || !fs.existsSync(file)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(file, "utf8"));
    if (payload.identity !== engineIdentity(context) || payload.imageHash !== imageHash(input.sourceImage)) return null;
    const scale = getScale(input);
    return {
      ok: true,
      provider: "umi-paddleocr-json",
      cached: true,
      data: parseResult(payload.items || [], input.sourceImage, input.pageIndex, scale, payload.metadata || {})
    };
  } catch {
    return null;
  }
}

function writeCache(input, context, items) {
  const file = cacheFile(input, context);
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({
      provider: "umi-paddleocr-json",
      imageHash: imageHash(input.sourceImage),
      identity: engineIdentity(context),
      metadata: { generation: "PaddleOCR-json-v2" },
      items
    }, null, 2)}\n`, "utf8");
  } catch {
    // Cache is best-effort; OCR correctness must not depend on filesystem writes.
  }
}

function cacheFile(input, context) {
  const config = context.config?.umiOcr || {};
  if (config.cache === false || config.cache === "false") return null;
  if (!input?.sourceImage || !fs.existsSync(input.sourceImage)) return null;
  const dir = resolveCacheDir(context, config.cacheDir || "runs/ocr-cache/umi-paddle");
  const key = [
    imageHash(input.sourceImage),
    engineIdentity(context),
    input.tesseractOptions?.psm || ""
  ].join("|");
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  return path.join(dir, `${hash}.json`);
}

function resolveCacheDir(context, value) {
  if (path.isAbsolute(value)) return value;
  return path.resolve(process.cwd(), value);
}

function imageHash(file) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

async function getEngine(context) {
  const identity = engineIdentity(context);
  if (activeIdentity && activeIdentity !== identity) closeActiveEngine();
  if (!enginePromise) {
    activeIdentity = identity;
    enginePromise = startEngine(context).catch((error) => {
      enginePromise = null;
      activeIdentity = null;
      throw error;
    });
  }
  return enginePromise;
}

async function startEngine(context) {
  const config = context.config?.umiOcr || {};
  const exePath = resolvePath(context, config.paddleBin || process.env.COMMON_TOOLS_UMI_OCR_BIN || "C:/Program Files/Umi-OCR_Paddle_v2.1.5/UmiOCR-data/plugins/win7_x64_PaddleOCR-json/PaddleOCR-json.exe");
  if (!fs.existsSync(exePath)) {
    throw new Error(`Umi PaddleOCR-json executable not found: ${exePath}`);
  }
  const args = [];
  const modelsPath = config.modelsPath ? resolvePath(context, config.modelsPath) : null;
  if (modelsPath && fs.existsSync(modelsPath)) args.push("--models_path", modelsPath);
  const child = spawn(exePath, args, {
    cwd: path.dirname(exePath),
    windowsHide: true,
    stdio: ["pipe", "pipe", "ignore"]
  });
  const engine = new PaddleEngine(child, exePath, normalizeOutputLimit(config.maxOutputBytes));
  await engine.waitReady(normalizeTimeoutMs(config.initTimeoutMs, 60000));
  activeEngine = engine;
  ensureProcessExitHook();
  return engine;
}

class PaddleEngine {
  constructor(child, exePath, maxOutputBytes) {
    this.child = child;
    this.exePath = exePath;
    this.buffer = "";
    this.bufferBytes = 0;
    this.maxOutputBytes = maxOutputBytes;
    this.pending = [];
    this.idleTimer = null;
    child.stdout.on("data", (chunk) => this.onStdout(chunk));
    child.on("exit", () => {
      while (this.pending.length) {
        this.pending.shift().reject(new Error("PaddleOCR-json exited before returning a result."));
      }
    });
  }

  waitReady(timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for PaddleOCR-json initialization.")), timeoutMs);
      const check = (line) => {
        if (line.includes("OCR init completed.")) {
          clearTimeout(timer);
          this.readyListener = null;
          resolve();
        }
      };
      this.readyListener = check;
    });
  }

  onStdout(chunk) {
    this.bufferBytes += chunk.length;
    if (this.bufferBytes > this.maxOutputBytes) {
      this.close(new Error("PaddleOCR-json output exceeds limits."));
      return;
    }
    this.buffer += chunk.toString("utf8");
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop();
    this.bufferBytes = Buffer.byteLength(this.buffer, "utf8");
    for (const line of lines) {
      if (!line.trim()) continue;
      if (this.readyListener) this.readyListener(line);
      if (!line.trim().startsWith("{")) continue;
      const pending = this.pending.shift();
      if (!pending) continue;
      try {
        pending.resolve(JSON.parse(line));
      } catch (error) {
        pending.reject(error);
      }
    }
  }

  run(imagePath, timeoutMs = 120000) {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    return new Promise((resolve, reject) => {
      if (!this.child || this.child.exitCode !== null) {
        reject(new Error("PaddleOCR-json is not running."));
        return;
      }
      const pending = {};
      const timer = setTimeout(() => {
        const index = this.pending.indexOf(pending);
        if (index >= 0) this.pending.splice(index, 1);
        this.close();
        reject(new Error("PaddleOCR-json inference timed out."));
      }, timeoutMs);
      const guardedResolve = (value) => {
        clearTimeout(timer);
        resolve(value);
      };
      const guardedReject = (error) => {
        clearTimeout(timer);
        reject(error);
      };
      pending.resolve = guardedResolve;
      pending.reject = guardedReject;
      this.pending.push(pending);
      this.child.stdin.write(`${JSON.stringify({ image_path: path.resolve(imagePath) })}\n`, "utf8", (error) => {
        if (!error) return;
        const index = this.pending.indexOf(pending);
        if (index >= 0) this.pending.splice(index, 1);
        guardedReject(new Error("PaddleOCR-json request failed."));
      });
    });
  }

  close(error = new Error("PaddleOCR-json stopped.")) {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (activeEngine === this) activeEngine = null;
    while (this.pending.length) this.pending.shift().reject(error);
    try {
      if (this.child && this.child.exitCode === null) this.child.kill();
    } catch {
      // best effort cleanup
    }
  }

  scheduleClose(delayMs = 800) {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.close();
      if (enginePromise) enginePromise = null;
    }, delayMs);
    if (this.idleTimer.unref) this.idleTimer.unref();
  }
}

function parseResult(items, sourceImage, pageIndex, scale, metadata = {}) {
  const normalized = normalizeOcrItems((Array.isArray(items) ? items : []).map((item) => ({
    text: item?.text,
    confidence: item?.score,
    polygon: item?.box,
    orientation: item?.orientation
  })));
  const lines = spatiallySortOcrItems(normalized)
    .map((item, index) => {
      const box = boxFromPolygon(item.polygon);
      return {
        id: `p${pageIndex}-l${index}`,
        text: item.text,
        confidence: item.confidence,
        orientation: item.orientation,
        polygon: item.polygon.map(([x, y]) => [x * scale.x, y * scale.y]),
        box: {
          x: box.x * scale.x,
          y: box.y * scale.y,
          w: box.w * scale.x,
          h: box.h * scale.y
        },
        sourceImage
      };
    });
  return {
    words: lines.map((line, index) => ({
      id: `p${pageIndex}-w${index}`,
      text: line.text,
      confidence: line.confidence,
      box: line.box,
      sourceImage
    })),
    lines,
    paragraphs: [],
    provider: "umi-paddleocr-json",
    model: { generation: safeVersion(metadata.generation) }
  };
}

function boxFromPoints(points) {
  const xs = points.map((point) => Number(point?.[0])).filter(Number.isFinite);
  const ys = points.map((point) => Number(point?.[1])).filter(Number.isFinite);
  if (!xs.length || !ys.length) return { x: 0, y: 0, w: 0, h: 0 };
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function getScale(input) {
  const widthPx = input.page?.widthPx;
  const heightPx = input.page?.heightPx;
  const widthPt = input.slideSize?.widthPt;
  const heightPt = input.slideSize?.heightPt;
  if (typeof widthPx === "number" && typeof heightPx === "number" && widthPx > 0 && heightPx > 0) {
    return {
      x: typeof widthPt === "number" ? widthPt / widthPx : 1,
      y: typeof heightPt === "number" ? heightPt / heightPx : 1
    };
  }
  return { x: 1, y: 1 };
}

function resolvePath(context, value) {
  if (path.isAbsolute(value)) return value;
  const candidates = [
    context.configFile ? path.resolve(path.dirname(context.configFile), value) : null,
    context.skillRoot ? path.resolve(context.skillRoot, value) : null,
    path.resolve(process.cwd(), value)
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[candidates.length - 1];
}

function spatiallySortOcrItems(items) {
  const positioned = [];
  const unpositioned = [];
  for (const [sourceIndex, item] of (Array.isArray(items) ? items : []).entries()) {
    if (!item || !item.text) continue;
    const box = item.polygon ? boxFromPolygon(item.polygon) : boxFromPoints(item.box || []);
    const entry = { item, sourceIndex, box };
    if (box.w > 0 && box.h > 0) positioned.push(entry);
    else unpositioned.push(entry);
  }

  positioned.sort((left, right) => {
    const leftCenter = left.box.y + left.box.h / 2;
    const rightCenter = right.box.y + right.box.h / 2;
    return leftCenter - rightCenter || left.box.x - right.box.x || left.sourceIndex - right.sourceIndex;
  });

  const rows = [];
  for (const entry of positioned) {
    const centerY = entry.box.y + entry.box.h / 2;
    let bestRow = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const row of rows) {
      const distance = Math.abs(centerY - row.centerY);
      const tolerance = Math.max(entry.box.h, row.meanHeight) * 0.85;
      if (distance <= tolerance && distance < bestDistance) {
        bestRow = row;
        bestDistance = distance;
      }
    }
    if (!bestRow) {
      rows.push({ entries: [entry], centerY, meanHeight: entry.box.h });
      continue;
    }
    bestRow.entries.push(entry);
    const count = bestRow.entries.length;
    bestRow.centerY = ((bestRow.centerY * (count - 1)) + centerY) / count;
    bestRow.meanHeight = ((bestRow.meanHeight * (count - 1)) + entry.box.h) / count;
  }

  rows.sort((left, right) => left.centerY - right.centerY);
  const sorted = rows.flatMap((row) => row.entries
    .sort((left, right) => left.box.x - right.box.x || left.sourceIndex - right.sourceIndex));
  return [...sorted, ...unpositioned.sort((left, right) => left.sourceIndex - right.sourceIndex)]
    .map((entry) => entry.item);
}

function validateInput(input) {
  if (!input || typeof input !== "object" || typeof input.sourceImage !== "string" || !fs.existsSync(input.sourceImage)) {
    throw new Error("PaddleOCR-json input image is invalid.");
  }
  const stats = fs.statSync(input.sourceImage);
  if (!stats.isFile() || stats.size < 1 || stats.size > 256 * 1024 * 1024) throw new Error("PaddleOCR-json input image is invalid.");
  if (!Number.isSafeInteger(Number(input.pageIndex)) || Number(input.pageIndex) < 0) throw new Error("PaddleOCR-json page index is invalid.");
}

function engineIdentity(context) {
  const config = context.config?.umiOcr || {};
  const exePath = resolvePath(context, config.paddleBin || process.env.COMMON_TOOLS_UMI_OCR_BIN || "C:/Program Files/Umi-OCR_Paddle_v2.1.5/UmiOCR-data/plugins/win7_x64_PaddleOCR-json/PaddleOCR-json.exe");
  const modelsPath = config.modelsPath ? resolvePath(context, config.modelsPath) : null;
  return crypto.createHash("sha256").update(JSON.stringify({
    protocol: 2,
    executable: fileStatIdentity(exePath),
    models: fileStatIdentity(modelsPath)
  })).digest("hex");
}

function fileStatIdentity(value) {
  if (!value || !fs.existsSync(value)) return value || null;
  const stat = fs.statSync(value);
  return `${path.resolve(value)}:${stat.size}:${stat.mtimeMs}`;
}

function normalizeOutputLimit(value) {
  if (value === undefined || value === null || value === "") return 32 * 1024 * 1024;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1024 * 1024 || number > 64 * 1024 * 1024) throw new Error("PaddleOCR-json output limit is invalid.");
  return number;
}

function safeResultCode(value) {
  return Number.isSafeInteger(Number(value)) ? String(Number(value)) : "unknown";
}

function failureResult(code) {
  return {
    ok: false,
    provider: "umi-paddleocr-json",
    error: `PaddleOCR-json failed with code ${safeResultCode(code)}`
  };
}

function safeVersion(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.+-]{1,64}$/.test(value) ? value : "unknown";
}

function ensureProcessExitHook() {
  if (processExitHookInstalled) return;
  processExitHookInstalled = true;
  process.once("exit", () => {
    if (activeEngine) activeEngine.close();
  });
}
