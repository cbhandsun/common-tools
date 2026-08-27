#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { createReviewStudioServer } = require("./lib/review-studio-server");

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) continue;
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) out[key.slice(2)] = true;
    else { out[key.slice(2)] = value; index += 1; }
  }
  return out;
}

function parsePort(value) {
  if (value === undefined) return 0;
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error("--port must be an integer from 0 to 65535");
  return port;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (typeof args.ir !== "string") throw new Error("Usage: review-studio.js --ir deck.ir.json [--port 4317]");
  const irFile = path.resolve(args.ir);
  const { server } = createReviewStudioServer({ irFile, baseDir: typeof args["base-dir"] === "string" ? path.resolve(args["base-dir"]) : path.dirname(irFile) });
  const port = parsePort(args.port);
  server.listen(port, "127.0.0.1", () => {
    const address = server.address();
    process.stdout.write(`Review Studio: http://127.0.0.1:${address.port}\n`);
  });
}

if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`Review Studio failed: ${String(error?.message || error).slice(0, 500)}\n`);
    process.exitCode = 1;
  }
}

module.exports = { main, parseArgs, parsePort };
