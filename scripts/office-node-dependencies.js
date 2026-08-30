#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { dependencyCacheKey, prepareNodeDependencies, runtimeIdentity } = require("./lib/office-node-dependencies");

function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1 || !["key", "prepare"].includes(argv[0])) throw new Error("Usage: node scripts/office-node-dependencies.js <key|prepare>");
  const root = path.resolve(__dirname, "..");
  if (argv[0] === "key") {
    const key = dependencyCacheKey(root, runtimeIdentity());
    if (!process.env.GITHUB_OUTPUT) throw new Error("Office Node cache key requires GITHUB_OUTPUT");
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `key=${key}\n`, "utf8");
    process.stdout.write("Office Node dependency cache identity ready\n");
    return;
  }
  const report = prepareNodeDependencies(root, process.env.OFFICE_NODE_CACHE_HIT);
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (require.main === module) {
  try { main(); } catch { process.stderr.write("Office Node dependency preparation failed; installation or validation did not complete\n"); process.exitCode = 1; }
}

module.exports = { main };
