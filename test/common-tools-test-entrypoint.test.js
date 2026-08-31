"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { discoverTestFiles, createExecutionWaves } = require("../scripts/test-sharded");

const ROOT = path.resolve(__dirname, "..");

test("common-tools contract test entrypoint retains complete coverage with bounded Windows concurrency", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const workflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
  assert.equal(packageJson.scripts["common-tools:test"], "node scripts/test-sharded.js --suite common-tools");
  assert.match(workflow, /name: Run common-tools contract tests\s+run: npm run common-tools:test/s);
});

test("common-tools scheduling retains every contract file and isolates browser and compiler processes", () => {
  const files = discoverTestFiles(ROOT, "common-tools");
  const expected = fs.readdirSync(path.join(ROOT, "test")).filter((name) => /^common-tools-.*\.test\.js$/.test(name)).sort();
  assert.deepEqual(files.map(({ file }) => path.basename(file)).sort(), expected);
  for (const count of [1, 2, 8]) {
    const waves = createExecutionWaves(files, count);
    assert.deepEqual(waves.flat(2).flatMap((shard) => shard.files).map((file) => path.basename(file)).sort(), expected);
    for (const name of ["common-tools-project-audit.test.js", "common-tools-remote-plugin-bundles.test.js"]) {
      assert.equal(files.find(({ file }) => path.basename(file) === name).resource, "external-process");
      const wave = waves.find((wave) => wave.some((shard) => shard.files.some((file) => path.basename(file) === name)));
      assert.equal(wave.length, 1);
      assert.deepEqual([...wave[0].resources], ["external-process"]);
    }
  }
});
