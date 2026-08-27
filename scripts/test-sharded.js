"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { classifyTestResource, includesSuite, parseSuite, validateTestSuiteManifest } = require("./test-suites");

function parseShardCount(argv = process.argv.slice(2), env = process.env) {
  const index = argv.indexOf("--shards");
  const raw = index >= 0 ? argv[index + 1] : env.TEST_SHARDS || "2";
  const count = Number(raw);
  if (!Number.isInteger(count) || count < 1 || count > 8) {
    throw new Error(`--shards must be an integer from 1 to 8; received ${JSON.stringify(raw)}`);
  }
  return count;
}

function parseReporter(env = process.env) {
  const reporter = String(env.TEST_REPORTER || "").trim();
  if (!reporter) return "";
  if (!["dot", "spec", "tap"].includes(reporter)) {
    throw new Error(`TEST_REPORTER must be dot, spec, or tap; received ${JSON.stringify(reporter)}`);
  }
  return reporter;
}

function balanceTestFiles(files, shardCount) {
  const shards = Array.from({ length: shardCount }, () => ({ size: 0, files: [], resources: new Set() }));
  for (const file of [...files].sort((a, b) => b.size - a.size || a.file.localeCompare(b.file))) {
    const shard = shards.reduce((best, candidate) => candidate.size < best.size ? candidate : best);
    shard.files.push(file.file);
    shard.size += file.size;
    shard.resources.add(file.resource || "standard");
  }
  return shards.filter((shard) => shard.files.length > 0);
}

function createExecutionWaves(files, shardCount) {
  const groups = new Map([
    ["standard", []],
    ["memory-heavy", []],
    ["external-process", []]
  ]);
  for (const file of files) groups.get(file.resource || "standard").push(file);
  const waves = [];
  const standard = balanceTestFiles(groups.get("standard"), shardCount);
  if (standard.length > 0) waves.push(standard);
  for (const resource of ["memory-heavy", "external-process"]) {
    const resourceFiles = groups.get(resource);
    const dedicated = balanceTestFiles(resourceFiles, Math.min(shardCount, Math.max(1, resourceFiles.length)));
    for (const shard of dedicated) waves.push([shard]);
  }
  return waves;
}

function discoverTestFiles(root, suite = "all") {
  const testDir = path.join(root, "test");
  const entries = fs.readdirSync(testDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.js"))
    .map((entry) => {
      const file = path.join("test", entry.name);
      return { file, size: fs.statSync(path.join(root, file)).size, resource: classifyTestResource(file) };
    });
  const manifestErrors = validateTestSuiteManifest(entries.map(({ file }) => file));
  if (manifestErrors.length > 0) throw new Error(`Invalid test suite manifest:\n- ${manifestErrors.join("\n- ")}`);
  return entries.filter(({ file }) => includesSuite(file, suite));
}

function runShard(root, shard, index) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const reporter = parseReporter();
    const child = spawn(process.execPath, [
      "--test",
      ...(shard.resources?.has("standard") === false ? ["--test-concurrency=1"] : []),
      ...(reporter ? [`--test-reporter=${reporter}`] : []),
      ...shard.files
    ], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
      windowsHide: true
    });
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({
      index,
      code: Number.isInteger(code) ? code : 1,
      signal: signal || null,
      elapsedMs: Date.now() - startedAt,
      fileCount: shard.files.length
    }));
  });
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const shardCount = parseShardCount();
  const suite = parseSuite();
  const files = discoverTestFiles(root, suite);
  if (files.length === 0) {
    throw new Error(`No test files found for suite ${JSON.stringify(suite)}`);
  }
  const waves = createExecutionWaves(files, shardCount);
  const startedAt = Date.now();
  const results = [];
  let shardIndex = 0;
  for (const wave of waves) {
    const waveResults = await Promise.all(wave.map((shard) => runShard(root, shard, shardIndex++)));
    results.push(...waveResults);
  }
  for (const result of results) {
    console.log(`test shard ${result.index + 1}: ${result.code === 0 ? "passed" : "failed"} (${result.fileCount} files, ${result.elapsedMs} ms)`);
  }
  console.log(`${suite} test shards completed in ${Date.now() - startedAt} ms`);
  if (results.some((result) => result.code !== 0)) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  balanceTestFiles,
  createExecutionWaves,
  discoverTestFiles,
  parseShardCount,
  parseReporter,
  parseSuite
};
