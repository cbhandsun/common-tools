"use strict";

const fs = require("fs");
const path = require("path");
const { run } = require("../lib/exec");
const { readImageSize } = require("../lib/image-size");

module.exports = async function normalizeCli(input) {
  const normalizedDir = path.join(input.outputDir, "normalized");
  fs.mkdirSync(normalizedDir, { recursive: true });

  const files = fs.existsSync(input.inputDir)
    ? fs.readdirSync(input.inputDir)
      .map((name) => path.resolve(input.inputDir, name))
      .filter((file) => fs.statSync(file).isFile())
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true }))
    : [];

  const pageImages = [];
  const warnings = [];
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
      const target = path.join(normalizedDir, `${String(pageImages.length + 1).padStart(3, "0")}${ext}`);
      fs.copyFileSync(file, target);
      pageImages.push({ sourceImage: target, originalSource: file, ...readImageSize(target) });
    } else if (ext === ".pdf") {
      pageImages.push(...await renderPdf(file, normalizedDir, pageImages.length));
    } else if ([".ppt", ".pptx"].includes(ext)) {
      const pdf = await convertOfficeToPdf(file, normalizedDir);
      pageImages.push(...await renderPdf(pdf, normalizedDir, pageImages.length));
    } else {
      warnings.push(`Skipped unsupported input: ${file}`);
    }
  }

  return {
    ok: true,
    data: {
      provider: "normalize-cli",
      pageImages,
      normalizedDir,
      warnings
    }
  };
};

async function convertOfficeToPdf(file, outDir) {
  const soffice = process.env.LIBREOFFICE_BIN || "soffice";
  await run(soffice, ["--headless", "--convert-to", "pdf", "--outdir", outDir, file]);
  const pdf = path.join(outDir, `${path.basename(file, path.extname(file))}.pdf`);
  if (!fs.existsSync(pdf)) throw new Error(`LibreOffice did not create expected PDF: ${pdf}`);
  return pdf;
}

async function renderPdf(pdf, outDir, startIndex) {
  const pdftoppm = process.env.PDFTOPPM_BIN || "pdftoppm";
  const prefix = path.join(outDir, `pdf-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const dpi = process.env.SLIDECLONE_DPI || "144";
  await run(pdftoppm, ["-png", "-r", dpi, pdf, prefix]);
  return fs.readdirSync(outDir)
    .filter((name) => name.startsWith(path.basename(prefix)) && name.endsWith(".png"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name, index) => {
      const generated = path.join(outDir, name);
      const target = path.join(outDir, `${String(startIndex + index + 1).padStart(3, "0")}.png`);
      fs.rmSync(target, { force: true });
      fs.renameSync(generated, target);
      return { sourceImage: target, originalSource: pdf, ...readImageSize(target) };
    });
}
