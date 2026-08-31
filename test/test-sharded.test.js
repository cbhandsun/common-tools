"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
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
  assert.equal(parseSuite(["--suite", "common-tools"], {}), "common-tools");
  assert.equal(includesSuite("test/common-tools-project-audit.test.js", "common-tools"), true);
  assert.equal(includesSuite("test/common-tools-ppt-create-openxml-smoke.test.js", "common-tools"), true);
  for (const name of ["font-fit.test.js", "common-tools-test.js", "common-tools-test.test.js.bak"]) {
    assert.equal(includesSuite(name, "common-tools"), false);
  }
  assert.throws(() => parseSuite(["--suite", "slow"], {}), /one of/);
  assert.equal(classifyTestResource("test/font-fit.test.js"), "standard");
  assert.equal(classifyTestResource("test/real-pptx-native-network.test.js"), "memory-heavy");
  assert.equal(classifyTestResource("test/common-tools-ppt-ir-editor-browser.test.js"), "memory-heavy");
  assert.equal(classifyTestResource("test/openxml-native-chart-smoke.test.js"), "external-process");
  assert.equal(classifyTestResource("test/common-tools-team-ocr-profile.test.js"), "external-process");
  assert.equal(classifyTestResource("test/common-tools-mcp.test.js"), "external-process");
});

test("real shards serialize files even for standard resources and propagate failures", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ct-shard-contract-"));
  try {
    const env = { ...process.env, TEST_REPORTER: "dot" };
    delete env.NODE_TEST_CONTEXT;
    const run = (files, resource) => spawnSync(process.execPath, ["--eval",
      `require(${JSON.stringify(require.resolve("../scripts/test-sharded"))}).runShard(${JSON.stringify(root)}, {files:${JSON.stringify(files)}, resources:new Set([${JSON.stringify(resource)}])}, 0).then(result => { process.exitCode = result.code; });`
    ], { env, encoding: "utf8", windowsHide: true, timeout: 15000 });
    const source = `const fs = require('node:fs'); const test = require('node:test');
test('exclusive file execution', async () => {
  const descriptor = fs.openSync('exclusive.lock', 'wx');
  try { await new Promise(resolve => setTimeout(resolve, 300)); fs.writeFileSync(__filename + '.executed', 'yes'); }
  finally { fs.closeSync(descriptor); fs.unlinkSync('exclusive.lock'); }
});`;
    for (const name of ["a.test.cjs", "b.test.cjs"]) fs.writeFileSync(path.join(root, name), source);
    const passed = run(["a.test.cjs", "b.test.cjs"], "standard");
    assert.equal(passed.status, 0, passed.stdout + passed.stderr);
    for (const name of ["a.test.cjs", "b.test.cjs"]) assert.equal(fs.readFileSync(path.join(root, name + ".executed"), "utf8"), "yes");
    fs.writeFileSync(path.join(root, "fail.test.cjs"), "require('node:test')('expected failure', () => { throw new Error('fixture failure'); });");
    const failed = run(["fail.test.cjs"], "external-process");
    assert.equal(failed.status, 1, failed.stdout + failed.stderr);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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
