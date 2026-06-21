"use strict";

const fs = require("fs");
const path = require("path");

module.exports = async function compressPlaceholder(input, context) {
  const reportFile = path.join(context.outputDir, "reports", "compression-plan.json");
  const pptxFile = input.pptx?.pptxFile || null;
  const plan = {
    provider: "compress-placeholder",
    pptxFile,
    compressedPptxFile: null,
    actions: [
      "Deduplicate identical raster assets.",
      "Downsample oversized cropped images to target display size.",
      "Convert PNG photos to JPEG/WebP when transparency is not needed.",
      "Remove hidden source-reference layers before final delivery.",
      "Prefer vector shapes/text/tables over embedded page screenshots."
    ],
    warning: "No binary PPTX compression was applied. Replace with an adapter that rewrites PPTX media parts."
  };
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return {
    ok: true,
    data: plan
  };
};
