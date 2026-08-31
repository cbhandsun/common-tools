#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { dependencyCacheKey, parseCacheHit, prepareNodeDependencies, runtimeIdentity } = require("./lib/office-node-dependencies");
const { localCacheContext, restoreLocalCache, saveLocalCache } = require("./lib/office-node-local-cache");

async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1 || !["key", "prepare"].includes(argv[0])) throw new Error("Usage: node scripts/office-node-dependencies.js <key|prepare>");
  const root = path.resolve(__dirname, "..");
  if (argv[0] === "key") {
    const key = dependencyCacheKey(root, runtimeIdentity());
    if (!process.env.GITHUB_OUTPUT) throw new Error("Office Node cache key requires GITHUB_OUTPUT");
    const localHit = process.env.RUNNER_TOOL_CACHE ? await restoreLocalCache(localCacheContext(root, key, process.env)) : false;
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `key=${key}\nlocal_hit=${localHit}\n`, "utf8");
    process.stdout.write("Office Node dependency cache identity ready\n");
    return;
  }
  const localHit = parseCacheHit(process.env.OFFICE_NODE_LOCAL_CACHE_HIT);
  const local = process.env.RUNNER_TOOL_CACHE ? localCacheContext(root, process.env.OFFICE_NODE_CACHE_KEY, process.env) : null;
  if (localHit && !local) throw new Error("Office local cache context is required for a local hit");
  const report = prepareNodeDependencies(root, process.env.OFFICE_NODE_CACHE_HIT);
  let localCacheSaved = false;
  if (local && (!localHit || !report.reused)) {
    await saveLocalCache(local);
    localCacheSaved = true;
  }
  process.stdout.write(`${JSON.stringify({ ...report, cacheSource: report.reused ? localHit ? "runner-local" : "actions" : "install", localCacheSaved })}\n`);
}

if (require.main === module) {
  main().catch(() => { process.stderr.write("Office Node dependency preparation failed; installation or validation did not complete\n"); process.exitCode = 1; });
}

module.exports = { main };
