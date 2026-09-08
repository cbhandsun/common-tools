"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { checkCommonTools, collectCommonToolFiles, runLimited, syntaxCheckConcurrency } = require("../scripts/check-common-tools");

test("common-tools syntax checker uses bounded parallelism without dropping work", async () => {
  const seen = [];
  let active = 0;
  let maxActive = 0;
  await runLimited([1, 2, 3, 4], 2, async (value) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await Promise.resolve();
    seen.push(value);
    active -= 1;
  });
  assert.deepEqual(seen.sort(), [1, 2, 3, 4]);
  assert.equal(maxActive <= 2, true);
  assert.equal(syntaxCheckConcurrency() >= 1, true);
  assert.equal(syntaxCheckConcurrency() <= 8, true);
});

test("common-tools syntax checker propagates worker failures", async () => {
  await assert.rejects(
    runLimited(["safe", "broken"], 2, async (value) => {
      if (value === "broken") throw new Error("boom");
    }),
    /boom/
  );
});

test("common-tools syntax checker collects repository files lazily and accepts bounded file lists", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "check-common-tools-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "valid.js");
  fs.writeFileSync(file, '"use strict";\nmodule.exports = true;\n');
  assert.equal(await checkCommonTools({ files: [file] }), 1);
  assert.equal(collectCommonToolFiles().some((candidate) => candidate.endsWith(path.join("packages", "cli", "bin", "common-tools.js"))), true);
  await assert.rejects(checkCommonTools({ files: [path.join(directory, "missing.js")] }));
  await assert.rejects(checkCommonTools({ files: [null] }), /files are invalid/);
});
