#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { runChartNativeRenderGolden } = require("./lib/chart-native-render-golden");

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const report = runChartNativeRenderGolden({
    outputDir: path.resolve(args.out || path.join("runs", "chart-native-render-golden")),
    renderer: args.renderer,
    timeoutMs: args["timeout-ms"],
    thresholds: {
      maxPixelDiffRatio: args["max-pixel-diff-ratio"],
      maxForegroundMissingRatio: args["max-foreground-missing-ratio"],
      maxMeanAbsoluteDelta: args["max-mean-delta"]
    }
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

function parseArgs(argv = []) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) result[key] = true;
    else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function usage() {
  return [
    "Usage: node chart-native-render-golden-smoke.js [options]",
    "  --out <dir>                           Output directory",
    "  --timeout-ms <1000..600000>            Render timeout",
    "  --renderer <libreoffice>                Presentation renderer (default libreoffice)",
    "  --max-pixel-diff-ratio <0..1>          Visual difference gate",
    "  --max-foreground-missing-ratio <0..1>  Missing foreground gate",
    "  --max-mean-delta <0..255>               Mean pixel delta gate"
  ].join("\n");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  }
}

module.exports = { main, parseArgs, usage };
