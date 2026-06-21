"use strict";

const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, ...env }
    }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function parseTsv(tsv, sourceImage, pageIndex, scale) {
  const lines = tsv.trim().split(/\r?\n/);
  if (lines.length < 2) return { words: [], lines: [], paragraphs: [] };
  const header = lines[0].split("\t");
  const rows = lines.slice(1).map((line) => {
    const cells = line.split("\t");
    const row = {};
    header.forEach((key, index) => {
      row[key] = cells[index] || "";
    });
    return row;
  });

  const words = rows
    .filter((row) => row.text && Number(row.conf) > 0)
    .map((row, index) => ({
      id: `p${pageIndex}-w${index}`,
      text: row.text,
      confidence: Number(row.conf) / 100,
      box: {
        x: Number(row.left) * scale.x,
        y: Number(row.top) * scale.y,
        w: Number(row.width) * scale.x,
        h: Number(row.height) * scale.y
      },
      sourceImage
    }));

  const lineMap = new Map();
  for (const word of words) {
    const key = `${Math.round(word.box.y / 8)}:${Math.round(word.box.h / 4)}`;
    if (!lineMap.has(key)) lineMap.set(key, []);
    lineMap.get(key).push(word);
  }

  const groupedLines = [...lineMap.values()].map((items, index) => {
    items.sort((a, b) => a.box.x - b.box.x);
    const minX = Math.min(...items.map((item) => item.box.x));
    const minY = Math.min(...items.map((item) => item.box.y));
    const maxX = Math.max(...items.map((item) => item.box.x + item.box.w));
    const maxY = Math.max(...items.map((item) => item.box.y + item.box.h));
    return {
      id: `p${pageIndex}-l${index}`,
      text: items.map((item) => item.text).join(" "),
      confidence: items.reduce((sum, item) => sum + item.confidence, 0) / items.length,
      box: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      wordIds: items.map((item) => item.id)
    };
  }).sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);

  return {
    words,
    lines: groupedLines,
    paragraphs: [],
    provider: "tesseract-cli"
  };
}

module.exports = async function tesseractCli(input, context = {}) {
  const tesseract = context.config?.tesseract || {};
  const tesseractBin = process.env.TESSERACT_BIN || tesseract.bin || "tesseract";
  const lang = process.env.TESSERACT_LANG || tesseract.lang || "chi_sim+eng";
  const psm = input.tesseractOptions?.psm || tesseract.psm || null;
  const tessdataPrefix = process.env.TESSDATA_PREFIX || tesseract.tessdataPrefix || null;
  const resolvedTessdataPrefix = tessdataPrefix ? resolvePath(context, tessdataPrefix) : null;
  const env = resolvedTessdataPrefix ? { TESSDATA_PREFIX: resolvedTessdataPrefix } : {};
  const tempBase = path.join(os.tmpdir(), `slideclone-ocr-${process.pid}-${input.pageIndex}`);
  const args = [input.sourceImage, tempBase, "-l", lang];
  if (psm) args.push("--psm", String(psm));
  args.push("-c", "tessedit_create_tsv=1");
  await run(tesseractBin, args, env);
  const tsvFile = `${tempBase}.tsv`;
  const tsv = fs.readFileSync(tsvFile, "utf8");
  fs.rmSync(tsvFile, { force: true });
  const scale = getScale(input);
  return {
    ok: true,
    provider: "tesseract-cli",
    data: {
      ...parseTsv(tsv, input.sourceImage, input.pageIndex, scale),
      tesseractBin,
      lang,
      psm,
      tessdataPrefix: resolvedTessdataPrefix
    }
  };
};

function resolvePath(context, value) {
  if (path.isAbsolute(value)) return value;
  const candidates = [
    context.configFile ? path.resolve(path.dirname(context.configFile), value) : null,
    context.skillRoot ? path.resolve(context.skillRoot, value) : null,
    path.resolve(process.cwd(), value)
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[candidates.length - 1];
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
