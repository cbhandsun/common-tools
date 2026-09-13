#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { auditRealIrBlindLayers } = require("./lib/real-blind-layer-audit");

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args.ir.length === 0) {
    process.stdout.write(`${usage()}\n`);
    return args.help ? 0 : 2;
  }
  const startedAt = process.hrtime.bigint();
  const reports = args.ir.map((file) => auditRealIrBlindLayers(file, { canvasScale: args.canvasScale }));
  const report = {
    provider: "real-blind-layer-audit-batch-v1",
    fileCount: reports.length,
    layerCount: reports.reduce((sum, item) => sum + item.layerCount, 0),
    protectedMinimumUnitCount: reports.reduce((sum, item) => sum + item.protectedMinimumUnitCount, 0),
    issueCount: reports.reduce((sum, item) => sum + item.issueCount, 0),
    durationMs: Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6),
    passed: reports.every((item) => item.passed),
    reports
  };
  if (args.out) {
    const output = path.resolve(args.out);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.passed ? 0 : 1;
}

function parseArgs(argv = []) {
  const result = { ir: [], out: null, canvasScale: "auto", help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") result.help = true;
    else if (value === "--ir") result.ir.push(requireValue(argv, ++index, "--ir"));
    else if (value === "--out") result.out = requireValue(argv, ++index, "--out");
    else if (value === "--canvas-scale") result.canvasScale = parseCanvasScale(requireValue(argv, ++index, "--canvas-scale"));
    else throw new Error(`Unknown argument: ${value}`);
  }
  return result;
}

function parseCanvasScale(value) {
  if (value === "auto") return value;
  const scale = Number(value);
  if (!Number.isInteger(scale) || scale < 1 || scale > 4) throw new Error("--canvas-scale must be auto or an integer from 1 to 4");
  return scale;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function usage() {
  return "Usage: node real-blind-layer-audit.js --ir <file.ir.json> [--ir <file.ir.json> ...] [--out <report.json>] [--canvas-scale <auto|1|2|3|4>]";
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = { main, parseArgs, usage };
