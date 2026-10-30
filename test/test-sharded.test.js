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
  parseListFilesMode,
  parseListMode,
  parseReporter,
  parseShardCount,
  parseSuite,
  runShard,
  summarizeExecutionWaves
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
  assert.equal(parseReporter({}), "dot");
  assert.equal(parseReporter({ TEST_REPORTER: "dot" }), "dot");
  assert.equal(parseReporter({ TEST_REPORTER: "tap" }), "tap");
  assert.throws(() => parseReporter({ TEST_REPORTER: "json" }), /dot, spec, or tap/);
});

test("parseListMode enables a read-only suite inventory", () => {
  assert.equal(parseListMode([]), false);
  assert.equal(parseListMode(["--suite", "unit"]), false);
  assert.equal(parseListMode(["--suite", "unit", "--list"]), true);
  assert.equal(parseListMode(["--suite", "unit", "--list-files"]), true);
  assert.equal(parseListFilesMode(["--suite", "unit", "--list"]), false);
  assert.equal(parseListFilesMode(["--suite", "unit", "--list", "--list-files"]), true);
});

test("--list-files alone inventories CI files without executing a test shard", () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, "..", "scripts", "test-sharded.js"), "--suite", "all", "--list-files"], {
    encoding: "utf8", windowsHide: true, timeout: 30000, maxBuffer: 2 * 1024 * 1024
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const inventory = JSON.parse(result.stdout);
  assert.equal(inventory.files.length, inventory.fileCount);
  assert.ok(inventory.files.includes(path.join("test", "openxml-native-line-dash-contract.test.js")));
  assert.doesNotMatch(result.stdout, /test shard \d+:/u);
});

test("suite inventory summarizes scheduled waves without listing files by default", () => {
  const waves = createExecutionWaves([
    { file: "test/a.test.js", size: 10, resource: "standard" },
    { file: "test/b.test.js", size: 8, resource: "standard" },
    { file: "test/heavy.test.js", size: 7, resource: "memory-heavy" }
  ], 2);
  assert.deepEqual(summarizeExecutionWaves(waves), {
    waveCount: 2,
    shardCount: 3,
    waves: [
      {
        wave: 1,
        shardCount: 2,
        resources: ["standard"],
        fileCount: 2,
        shards: [
          { shard: 1, fileCount: 1, resources: ["standard"] },
          { shard: 2, fileCount: 1, resources: ["standard"] }
        ]
      },
      {
        wave: 2,
        shardCount: 1,
        resources: ["memory-heavy"],
        fileCount: 1,
        shards: [
          { shard: 1, fileCount: 1, resources: ["memory-heavy"] }
        ]
      }
    ]
  });
  assert.deepEqual(summarizeExecutionWaves(waves, { includeFiles: true }).waves[1].shards[0].files, ["test/heavy.test.js"]);
});

test("parseShardCount validates command and environment boundaries", () => {
  assert.equal(parseShardCount([], {}), 4);
  assert.equal(parseShardCount(["--shards", "4"], {}), 4);
  assert.equal(parseShardCount(["--shards", "4", "--shards", "2"], {}), 2);
  assert.equal(parseShardCount([], { TEST_SHARDS: "3" }), 3);
  assert.throws(() => parseShardCount(["--shards", "0"], {}), /integer from 1 to 8/);
  assert.throws(() => parseShardCount(["--shards", "many"], {}), /integer from 1 to 8/);
});

test("test suites classify fast feedback, contracts, and integration checks", () => {
  for (const name of ["openxml-template-placeholders.test.js", "pptx-package-admission.test.js"]) {
    assert.equal(classifyTestResource(`test/${name}`), "external-process");
    assert.equal(classifyTestFile(`test/${name}`), "integration");
    assert.equal(includesSuite(`test/${name}`, "unit"), false);
    assert.equal(includesSuite(`test/${name}`, "integration"), true);
  }
  assert.equal(classifyTestFile("test/font-fit.test.js"), "unit");
  assert.equal(classifyTestFile("test/package-scripts.test.js"), "contract");
  assert.equal(classifyTestFile("test/workspace-package-boundaries.test.js"), "contract");
  assert.equal(classifyTestFile("test/engine-core-package.test.js"), "contract");
  assert.equal(classifyTestFile("test/common-tools-project-audit-runtime-package.test.js"), "contract");
  assert.equal(classifyTestFile("test/quality-gate-real-pptx.test.js"), "integration");
  assert.equal(classifyTestFile("test/common-tools-project-audit.test.js"), "integration");
  assert.equal(classifyTestFile("test/common-tools-remote-plugin-bundles.test.js"), "integration");
  assert.equal(classifyTestFile("test/common-tools-mcp.test.js"), "integration");
  assert.equal(classifyTestFile("test/common-tools-team-ocr-profile.test.js"), "integration");
  assert.equal(classifyTestFile("test/openxml-native-chart-smoke.test.js"), "integration");
  assert.equal(classifyTestFile("test/openxml-dotnet-contract.test.js"), "contract");
  assert.equal(classifyTestFile("test/native-text-spacing-contract.test.js"), "contract");
  assert.equal(classifyTestResource("test/native-text-spacing-contract.test.js"), "external-process");
  assert.equal(includesSuite("test/native-text-spacing-contract.test.js", "unit"), false);
  assert.equal(includesSuite("test/native-text-spacing-contract.test.js", "contract"), true);
  assert.equal(includesSuite("test/font-fit.test.js", "unit"), true);
  assert.equal(includesSuite("test/font-fit.test.js", "integration"), false);
  assert.equal(includesSuite("test/workspace-package-boundaries.test.js", "unit"), false);
  assert.equal(includesSuite("test/workspace-package-boundaries.test.js", "contract"), true);
  assert.equal(includesSuite("test/common-tools-project-audit-runtime-package.test.js", "unit"), false);
  assert.equal(includesSuite("test/common-tools-project-audit-runtime-package.test.js", "contract"), true);
  assert.equal(includesSuite("test/common-tools-project-audit-runtime-package.test.js", "common-tools"), true);
  assert.equal(includesSuite("test/common-tools-project-audit.test.js", "unit"), false);
  assert.equal(includesSuite("test/common-tools-project-audit.test.js", "integration"), true);
  assert.equal(includesSuite("test/common-tools-remote-plugin-bundles.test.js", "unit"), false);
  assert.equal(includesSuite("test/common-tools-remote-plugin-bundles.test.js", "integration"), true);
  assert.equal(includesSuite("test/common-tools-mcp.test.js", "unit"), false);
  assert.equal(includesSuite("test/common-tools-mcp.test.js", "integration"), true);
  assert.equal(classifyTestResource("test/common-tools-team-runtime.test.js"), "external-process");
  assert.equal(includesSuite("test/common-tools-team-runtime.test.js", "unit"), false);
  assert.equal(includesSuite("test/common-tools-team-runtime.test.js", "integration"), true);
  assert.equal(includesSuite("test/common-tools-team-runtime.test.js", "all"), true);
  assert.equal(includesSuite("test/font-fit.test.js", "all"), true);
  assert.equal(parseSuite(["--suite", "contract"], {}), "contract");
  assert.equal(parseSuite(["--suite", "all", "--suite", "unit"], {}), "unit");
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
  assert.equal(classifyTestResource("test/common-tools-production-preflight.test.js"), "external-process");
});

test("unit suite excludes external-process tests so fast feedback stays local", () => {
  const root = path.resolve(__dirname, "..");
  const externalUnitTests = require("../scripts/test-sharded")
    .discoverTestFiles(root, "unit")
    .filter(({ resource }) => resource === "external-process")
    .map(({ file }) => path.basename(file))
    .sort();
  assert.deepEqual(externalUnitTests, []);
});

test("shared Worker consumer probes run once in the serialized integration wave", () => {
  const root = path.resolve(__dirname, "..");
  const name = "runtime-shared-route-consumer.test.js";
  const discover = require("../scripts/test-sharded").discoverTestFiles;
  assert.equal(classifyTestResource(`test/${name}`), "external-process");
  assert.equal(classifyTestFile(`test/${name}`), "integration");
  for (const suite of ["all", "integration", "unit", "contract"]) {
    const matches = discover(root, suite).filter(({ file }) => path.basename(file) === name);
    assert.equal(matches.length, suite === "all" || suite === "integration" ? 1 : 0);
  }
  const waves = createExecutionWaves(discover(root, "integration"), 2);
  const wave = waves.find((entry) => entry.some((shard) => shard.files.some((file) => path.basename(file) === name)));
  assert.ok(wave);
  assert.equal(wave.length, 1);
  assert.deepEqual([...wave[0].resources], ["external-process"]);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.match(manifest.scripts["verify:ci"], /\bnpm run test:integration\b/u);
});
test('compiler-session and feedback regressions are included in unit and unified CI discovery',()=>{
 const root=path.resolve(__dirname,'..'),discover=require('../scripts/test-sharded').discoverTestFiles;
 for(const suite of ['unit','all']){
  const files=discover(root,suite).map(r=>path.basename(r.file));
  for(const name of ['source-scene-compilation-session.test.js','source-scene-compile-feedback.test.js'])assert.ok(files.includes(name),`${suite}: ${name}`);
 }
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
  try { await new Promise(resolve => setTimeout(resolve, 300)); fs.writeFileSync(__filename + '.executed', 'yes'); fs.writeFileSync(__filename + '.runner-parent', String(process.ppid)); }
  finally { fs.closeSync(descriptor); fs.unlinkSync('exclusive.lock'); }
});`;
    for (const name of ["a.test.cjs", "b.test.cjs"]) fs.writeFileSync(path.join(root, name), source);
    const passed = run(["a.test.cjs", "b.test.cjs"], "standard");
    assert.equal(passed.status, 0, passed.stdout + passed.stderr);
    for (const name of ["a.test.cjs", "b.test.cjs"]) assert.equal(fs.readFileSync(path.join(root, name + ".executed"), "utf8"), "yes");
    const parent = name => fs.readFileSync(path.join(root, name + ".runner-parent"), "utf8");
    assert.equal(parent("a.test.cjs"), parent("b.test.cjs"), "standard files keep the shared batch runner");
    const isolated = run(["b.test.cjs", "a.test.cjs"], "external-process");
    assert.equal(isolated.status, 0, isolated.stdout + isolated.stderr);
    assert.equal(parent("a.test.cjs"), parent("b.test.cjs"), "external files retain the serialized batch runner");
    fs.writeFileSync(path.join(root, "fail.test.cjs"), "require('node:test')('expected failure', () => { throw new Error('fixture failure'); });");
    // Sorted after fail.test.cjs: a failing file must not suppress a later one.
    fs.writeFileSync(path.join(root, "z.test.cjs"), source);
    const failed = run(["fail.test.cjs", "z.test.cjs"], "external-process");
    assert.equal(failed.status, 1, failed.stdout + failed.stderr);
    assert.equal(fs.readFileSync(path.join(root, "z.test.cjs.executed"), "utf8"), "yes");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("real runner invocation normalizes Windows test paths without dropping the snapshot regressions", () => {
  const { discoverTestFiles } = require("../scripts/test-sharded");
  const files = discoverTestFiles(process.cwd(), "integration");
  assert.equal(files.filter(({ file }) => path.normalize(file) === path.join("test", "rendered-page-snapshot-cache.test.js")).length, 1);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ct-shard-path-"));
  try {
    fs.mkdirSync(path.join(root, "test"));
    fs.writeFileSync(path.join(root, "test", "rendered-page-snapshot-cache.test.js"),
      "require('node:test')('portable path', () => require('node:fs').writeFileSync('executed', 'yes'));");
    const env = { ...process.env, TEST_REPORTER: "tap" }; delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--eval",
      `require(${JSON.stringify(require.resolve("../scripts/test-sharded"))}).runShard(${JSON.stringify(root)}, {files:["test\\\\rendered-page-snapshot-cache.test.js"], resources:new Set(["external-process"])}, 0).then(result => { process.exitCode = result.code; });`
    ], { env, encoding: "utf8", windowsHide: true, timeout: 15000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /# tests 1\b/u);
    assert.equal(fs.readFileSync(path.join(root, "executed"), "utf8"), "yes");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("invalid or empty shard plans cannot produce a passing gate or supply runner options", async () => {
  for (const files of [[], null, "a.test.js", new Array(1), [null], [""], ["--test-only"], ["a\0.test.js"], new Array(4097).fill("a.test.js")]) {
    await assert.rejects(runShard(process.cwd(), { files, resources: new Set(["external-process"]) }, 0),
      { name: "TypeError", message: "Test shard files are invalid" });
  }
});

test("unified runner preserves child process failures and prints safe exit diagnostics in every reporter", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ct-shard-process-"));
  try {
    fs.writeFileSync(path.join(root, "child.test.js"), "process.exit(23);\n");
    for (const reporter of ["dot", "spec", "tap"]) {
      const env = { ...process.env, TEST_REPORTER: reporter }; delete env.NODE_TEST_CONTEXT;
      const result = spawnSync(process.execPath, ["--eval",
        `require(${JSON.stringify(require.resolve("../scripts/test-sharded"))}).runShard(${JSON.stringify(root)}, {files:["child.test.js"]}, 0).then(result => { process.exitCode = result.code; });`
      ], { env, encoding: "utf8", windowsHide: true, timeout: 15000 });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout, /# test-process-failure \{"file":"child.test.js","exitCode":23,"signal":null\}/u);
      assert.equal(result.stdout.includes(root), false);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("resource-aware execution isolates heavy shards while retaining standard parallelism", () => {
  const { classifyTestResource } = require("../scripts/test-suites");
  // This file starts nested real Node test runners. It must not share the
  // standard wave with other suites while checking child-process deadlines.
  assert.equal(classifyTestResource("test/test-sharded.test.js"), "external-process");
  const waves = createExecutionWaves([
    { file: "test/a.test.js", size: 10, resource: "standard" },
    { file: "test/b.test.js", size: 8, resource: "standard" },
    { file: "test/heavy.test.js", size: 7, resource: "memory-heavy" },
    { file: "test/heavy-2.test.js", size: 5, resource: "memory-heavy" },
    { file: "test/external.test.js", size: 6, resource: "external-process" },
    { file: "test/external-2.test.js", size: 4, resource: "external-process" }
  ], 2);
  assert.equal(waves[0].length, 2);
  assert.deepEqual(waves.slice(1).map((wave) => wave[0].files), [
    ["test/heavy.test.js", "test/heavy-2.test.js"],
    ["test/external.test.js", "test/external-2.test.js"]
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
