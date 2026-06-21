"use strict";

const fs = require("fs");
const path = require("path");
const { run } = require("../lib/exec");
const { readImageSize } = require("../lib/image-size");

module.exports = async function renderLibreOffice(input, context) {
  const pptxFile = input.pptx?.pptxFile;
  if (!pptxFile) {
    return {
      ok: false,
      error: "pptx.pptxFile is required for render-libreoffice"
    };
  }

  const renderDir = path.join(context.outputDir, "render", `iteration-${input.iteration || 0}`);
  fs.mkdirSync(renderDir, { recursive: true });
  const soffice = process.env.LIBREOFFICE_BIN || "soffice";
  const pdftoppm = process.env.PDFTOPPM_BIN || "pdftoppm";
  const dpi = process.env.SLIDECLONE_DPI || "144";

  await run(soffice, ["--headless", "--convert-to", "pdf", "--outdir", renderDir, pptxFile]);
  const pdf = path.join(renderDir, `${path.basename(pptxFile, path.extname(pptxFile))}.pdf`);
  if (!fs.existsSync(pdf)) throw new Error(`LibreOffice did not create expected PDF: ${pdf}`);

  const prefix = path.join(renderDir, "page");
  await run(pdftoppm, ["-png", "-r", dpi, pdf, prefix]);
  const renderedPages = fs.readdirSync(renderDir)
    .filter((name) => name.startsWith("page-") && name.endsWith(".png"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name, pageIndex) => {
      const image = path.join(renderDir, name);
      return { pageIndex, image, ...readImageSize(image) };
    });

  return {
    ok: true,
    data: {
      provider: "render-libreoffice",
      renderDir,
      pdf,
      renderedPages
    }
  };
};
