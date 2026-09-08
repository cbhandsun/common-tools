"use strict";

const fs = require("fs");
const path = require("path");
const { readImageSize } = require("../lib/image-size");
const { cropRegions } = require("../lib/region-proposal");

module.exports = async function normalizeRegions(input, context) {
  const normalizedDir = path.join(input.outputDir, "normalized");
  const regionsDir = path.join(normalizedDir, "regions");
  fs.mkdirSync(regionsDir, { recursive: true });

  const imageExtensions = new Set([".png"]);
  const files = fs.existsSync(input.inputDir)
    ? fs.readdirSync(input.inputDir)
      .map((name) => path.resolve(input.inputDir, name))
      .filter((file) => fs.statSync(file).isFile())
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true }))
    : [];

  const pageImages = [];
  const regionReports = [];
  const warnings = [];
  const options = context.config?.regionProposal || {};
  const includeFullPage = options.includeFullPage !== false;
  const emitRegionPages = options.emitRegionPages === true || !includeFullPage;

  for (const file of files) {
    if (!imageExtensions.has(path.extname(file).toLowerCase())) {
      warnings.push(`Region proposal currently supports PNG only, skipped: ${file}`);
      continue;
    }
    const crops = cropRegions(file, regionsDir, options);
    const regionProposals = crops.map(({ sourceImage, originalSource, widthPx, heightPx, ...region }) => ({
      ...region,
      cropImage: sourceImage,
      widthPx,
      heightPx
    }));
    regionReports.push({
      sourceImage: file,
      regions: regionProposals
    });
    if (includeFullPage) {
      pageImages.push({
        sourceImage: file,
        regionRole: "full-page",
        regionProposals,
        ...readImageSize(file)
      });
    }
    if (!emitRegionPages) continue;
    for (const crop of crops) {
      pageImages.push({
        sourceImage: crop.sourceImage,
        originalSource: crop.originalSource,
        regionRole: crop.type,
        regionBox: crop.box,
        regionConfidence: crop.confidence,
        widthPx: crop.widthPx,
        heightPx: crop.heightPx
      });
    }
  }

  const reportFile = path.join(input.outputDir, "reports", "region-proposals.json");
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify({ provider: "normalize-regions", regionReports, warnings }, null, 2)}\n`, "utf8");

  return {
    ok: true,
    data: {
      provider: "normalize-regions",
      pageImages,
      normalizedDir,
      regionsDir,
      reportFile,
      regionReports,
      warnings
    }
  };
};
