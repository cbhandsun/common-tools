"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { runLimited, syntaxCheckConcurrency } = require("../scripts/check-common-tools");

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
