"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

let enginePromise = null;

module.exports = async function umiPaddleOcr(input, context = {}) {
  const engine = await getEngine(context);
  const result = await engine.run(input.sourceImage);
  if (result.code !== 100) {
    return {
      ok: false,
      provider: "umi-paddleocr-json",
      error: `PaddleOCR-json failed: code=${result.code}, data=${JSON.stringify(result.data)}`
    };
  }
  const scale = getScale(input);
  engine.scheduleClose();
  return {
    ok: true,
    provider: "umi-paddleocr-json",
    data: parseResult(result.data || [], input.sourceImage, input.pageIndex, scale, engine.exePath)
  };
};

async function getEngine(context) {
  if (!enginePromise) enginePromise = startEngine(context);
  return enginePromise;
}

async function startEngine(context) {
  const config = context.config?.umiOcr || {};
  const exePath = resolvePath(context, config.paddleBin || "C:/Program Files/Umi-OCR_Paddle_v2.1.5/UmiOCR-data/plugins/win7_x64_PaddleOCR-json/PaddleOCR-json.exe");
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
  const engine = new PaddleEngine(child, exePath);
  await engine.waitReady(Number(config.initTimeoutMs || 60000));
  process.once("exit", () => engine.close());
  return engine;
}

class PaddleEngine {
  constructor(child, exePath) {
    this.child = child;
    this.exePath = exePath;
    this.buffer = "";
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
    this.buffer += chunk.toString("utf8");
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop();
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

  run(imagePath) {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    return new Promise((resolve, reject) => {
      if (!this.child || this.child.exitCode !== null) {
        reject(new Error("PaddleOCR-json is not running."));
        return;
      }
      this.pending.push({ resolve, reject });
      this.child.stdin.write(`${JSON.stringify({ image_path: path.resolve(imagePath) })}\n`, "utf8", (error) => {
        if (error) reject(error);
      });
    });
  }

  close() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
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

function parseResult(items, sourceImage, pageIndex, scale, exePath) {
  const lines = items
    .filter((item) => item && item.text)
    .map((item, index) => {
      const box = boxFromPoints(item.box || []);
      return {
        id: `p${pageIndex}-l${index}`,
        text: item.text,
        confidence: typeof item.score === "number" ? item.score : null,
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
    engine: exePath
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
