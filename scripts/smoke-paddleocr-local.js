#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const paddleOcr = require("../skills/pd-hifi-slideclone/scripts/adapters/ocr-paddleocr-local");

async function main() {
  const workspaceRoot = path.resolve(__dirname, "..");
  const skillRoot = path.join(workspaceRoot, "skills", "pd-hifi-slideclone");
  const sourceImage = path.resolve(process.argv[2] || path.join(skillRoot, "examples", "ocr-text-smoke.source.png"));
  if (!fs.existsSync(sourceImage) || !fs.statSync(sourceImage).isFile()) throw new Error("PaddleOCR smoke input is unavailable");
  const result = await paddleOcr({
    sourceImage,
    pageIndex: 0,
    page: {},
    slideSize: {}
  }, {
    skillRoot,
    config: { paddleOcr: { cache: false, initTimeoutMs: 600000, timeoutMs: 300000 } }
  });
  const confidences = result.data.lines.map((line) => line.confidence).filter(Number.isFinite);
  process.stdout.write(`${JSON.stringify({
    ok: result.ok,
    provider: result.provider,
    lineCount: result.data.lines.length,
    meanConfidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : null,
    model: result.data.model
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "PaddleOCR smoke failed"}\n`);
  process.exitCode = 1;
}).finally(() => paddleOcr.closeActiveEngine());
