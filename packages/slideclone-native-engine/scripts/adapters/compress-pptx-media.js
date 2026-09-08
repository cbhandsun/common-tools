"use strict";

const fs = require("fs");
const path = require("path");
const { run } = require("../lib/exec");
const { pythonEnv } = require("../lib/python-env");

module.exports = async function compressPptxMedia(input, context) {
  const pptxFile = input.pptx?.pptxFile;
  if (!pptxFile) {
    return {
      ok: false,
      error: "pptx.pptxFile is required for compress-pptx-media"
    };
  }

  const compressDir = path.join(context.outputDir, "compress");
  fs.mkdirSync(compressDir, { recursive: true });
  const compressedPptxFile = path.join(compressDir, "deck.compressed.pptx");
  const reportFile = path.join(context.outputDir, "reports", "compression-report.json");
  const script = path.join(context.skillRoot, "scripts", "python", "compress_pptx_media.py");
  const python = process.env.PYTHON_BIN || "python";
  const config = context.config?.compress || {};

  await run(python, [
    script,
    "--pptx",
    pptxFile,
    "--out",
    compressedPptxFile,
    "--report",
    reportFile,
    "--jpeg-quality",
    String(config.jpegQuality ?? 88),
    "--png-compress-level",
    String(config.pngCompressLevel ?? 9),
    "--max-image-pixels",
    String(config.maxImagePixels ?? 0),
    "--min-saving-bytes",
    String(config.minSavingBytes ?? 128)
  ], {
    cwd: context.outputDir,
    maxBuffer: 20 * 1024 * 1024,
    env: pythonEnv(context.skillRoot)
  });

  const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  return {
    ok: true,
    data: {
      ...report,
      reportFile
    }
  };
};
