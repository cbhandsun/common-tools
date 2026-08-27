#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { validatePowerPointEditableRoundTrip } = require("../skills/pd-hifi-slideclone/scripts/adapters/validate-powerpoint-editable-roundtrip");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return process.stdout.write(`${usage()}\n`);
  const files = array(args.file);
  const modes = array(args.mode);
  if (files.length === 0) throw new Error("At least one --file is required.");
  if (modes.length > 1 && modes.length !== files.length) throw new Error("Provide one --mode for all files or one mode per file.");
  const cases = files.map((file, index) => ({ file, mode: modes.length === 1 ? modes[0] : modes[index] || "auto" }));
  const report = await validatePowerPointEditableRoundTrip(cases, {
    outputDir: path.resolve(args.out || "artifacts/powerpoint-editable-roundtrip"),
    timeoutMs: positiveInteger(args["timeout-ms"], 240000)
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function parseArgs(argv) {
  const result = {};
  const repeatable = new Set(["file", "mode"]);
  const allowed = new Set(["file", "mode", "out", "timeout-ms", "help"]);
  for (let index = 0; index < argv.length; index++) {
    const item = argv[index];
    if (!item.startsWith("--")) throw new Error(`Unexpected positional argument: ${item}`);
    const key = item.slice(2);
    if (!allowed.has(key)) throw new Error(`Unknown option: --${key}`);
    if (key === "help") { result.help = true; continue; }
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    if (repeatable.has(key)) (result[key] ||= []).push(value);
    else if (result[key] !== undefined) throw new Error(`Duplicate option: --${key}`);
    else result[key] = value;
  }
  return result;
}

function array(value) { return Array.isArray(value) ? value : []; }
function positiveInteger(value, fallback) { if (value == null) return fallback; const number = Number(value); if (!Number.isSafeInteger(number) || number < 1000 || number > 1800000) throw new Error("--timeout-ms is outside the supported range"); return number; }
function usage() { return "Usage: node scripts/powerpoint-editable-roundtrip.js --file <deck.pptx> [--mode auto|shape-text|smartart-text|geometry] [--out <directory>]"; }

if (require.main === module) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });

module.exports = { parseArgs, positiveInteger };
