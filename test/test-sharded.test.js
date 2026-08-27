"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  balanceTestFiles,
  createExecutionWaves,
  parseReporter,
  parseShardCount,
  parseSuite
} = require("../scripts/test-sharded");
const {
  classifyTestFile,
  classifyTestResource,
  includesSuite,
  validateTestSuiteManifest
} = require("../scripts/test-suites");

test("balanceTestFiles deterministically distributes the largest files first", () => {
  const shards = balanceTestFiles([
    { file: "test/a.test.js", size: 10 },
    { file: "test/b.test.js", size: 8 },
    { file: "test/c.test.js", size: 6 },
    { file: "test/d.test.js", size: 4 }
  ], 2);
  assert.deepEqual(shards.map((shard) => shard.files), [
    ["test/a.test.js", "test/d.test.js"],
    ["test/b.test.js", "test/c.test.js"]
  ]);
  assert.deepEqual(shards.map((shard) => shard.size), [14, 14]);
});

test("parseReporter bounds CI output modes", () => {
  assert.equal(parseReporter({}), "");
  assert.equal(parseReporter({ TEST_REPORTER: "dot" }), "dot");
  assert.throws(() => parseReporter({ TEST_REPORTER: "json" }), /dot, spec, or tap/);
});

test("parseShardCount validates command and environment boundaries", () => {
  assert.equal(parseShardCount(["--shards", "4"], {}), 4);
  assert.equal(parseShardCount([], { TEST_SHARDS: "3" }), 3);
  assert.throws(() => parseShardCount(["--shards", "0"], {}), /integer from 1 to 8/);
  assert.throws(() => parseShardCount(["--shards", "many"], {}), /integer from 1 to 8/);
});

test("test suites classify fast feedback, contracts, and integration checks", () => {
  assert.equal(classifyTestFile("test/font-fit.test.js"), "unit");
  assert.equal(classifyTestFile("test/package-scripts.test.js"), "contract");
  assert.equal(classifyTestFile("test/quality-gate-real-pptx.test.js"), "integration");
  assert.equal(includesSuite("test/font-fit.test.js", "unit"), true);
  assert.equal(includesSuite("test/font-fit.test.js", "integration"), false);
  assert.equal(includesSuite("test/font-fit.test.js", "all"), true);
  assert.equal(parseSuite(["--suite", "contract"], {}), "contract");
  assert.equal(parseSuite([], { TEST_SUITE: "integration" }), "integration");
  assert.throws(() => parseSuite(["--suite", "slow"], {}), /one of/);
  assert.equal(classifyTestResource("test/font-fit.test.js"), "standard");
  assert.equal(classifyTestResource("test/real-pptx-native-network.test.js"), "memory-heavy");
  assert.equal(classifyTestResource("test/openxml-native-chart-smoke.test.js"), "external-process");
  assert.equal(classifyTestResource("test/common-tools-team-ocr-profile.test.js"), "external-process");
});

test("resource-aware execution isolates heavy shards while retaining standard parallelism", () => {
  const waves = createExecutionWaves([
    { file: "test/a.test.js", size: 10, resource: "standard" },
    { file: "test/b.test.js", size: 8, resource: "standard" },
    { file: "test/heavy.test.js", size: 7, resource: "memory-heavy" },
    { file: "test/external.test.js", size: 6, resource: "external-process" }
  ], 2);
  assert.equal(waves[0].length, 2);
  assert.deepEqual(waves.slice(1).map((wave) => wave[0].files), [
    ["test/heavy.test.js"],
    ["test/external.test.js"]
  ]);
  assert.ok(waves.slice(1).every((wave) => wave.length === 1));
});

test("test suite manifest fails closed for renamed and unclassified integration tests", () => {
  const files = [
    "cli-scaffold-generator.test.js",
    "openxml-dotnet-contract.test.js",
    "package-scripts.test.js",
    "test-sharded.test.js"
  ];
  const missing = validateTestSuiteManifest(files);
  assert.ok(missing.some((error) => error.includes("integration test manifest references a missing file")));
  const integrationLike = validateTestSuiteManifest([...files, "new-render-smoke.test.js"]);
  assert.ok(integrationLike.some((error) => error.includes("must be explicitly classified")));
});
