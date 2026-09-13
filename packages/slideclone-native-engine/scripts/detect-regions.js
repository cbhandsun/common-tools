#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { cropRegions } = require("./lib/region-proposal");

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.input || !args.out) {
    process.stderr.write("Usage: detect-regions.js --input <page.png> --out <output-dir>\n");
    return 1;
  }

  fs.mkdirSync(args.out, { recursive: true });
  const crops = cropRegions(path.resolve(args.input), path.resolve(args.out), {
    includeFullPage: false,
    minConfidence: args.minConfidence ? Number(args.minConfidence) : undefined
  });
  const report = {
    input: path.resolve(args.input),
    outputDir: path.resolve(args.out),
    regions: crops.map(({ sourceImage, originalSource, widthPx, heightPx, ...region }) => ({
      ...region,
      cropImage: sourceImage,
      widthPx,
      heightPx
    }))
  };
  fs.writeFileSync(path.join(args.out, "regions.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return 0;
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    result[key.slice(2)] = argv[i + 1];
    i += 1;
  }
  return result;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = { main, parseArgs };
