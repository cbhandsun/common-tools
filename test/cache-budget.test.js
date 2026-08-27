"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { maintainHashedCache } = require("../skills/pd-hifi-slideclone/scripts/lib/cache-budget");

test("cache budget removes only oldest recognized hashed entries", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-cache-budget-"));
  const names = ["a".repeat(64), "b".repeat(64)];
  for (const [index, name] of names.entries()) {
    const file = path.join(root, `${name}.json`);
    fs.writeFileSync(file, Buffer.alloc(700 * 1024, index));
    const time = new Date(Date.now() - (2 - index) * 60_000);
    fs.utimesSync(file, time, time);
  }
  const unrelated = path.join(root, "keep.txt");
  fs.writeFileSync(unrelated, "keep");
  const result = maintainHashedCache({ root, maxBytes: 1024 * 1024, layout: "flat", force: true });
  assert.equal(result.removed, 1);
  assert.equal(fs.existsSync(path.join(root, `${names[0]}.json`)), false);
  assert.equal(fs.existsSync(path.join(root, `${names[1]}.json`)), true);
  assert.equal(fs.readFileSync(unrelated, "utf8"), "keep");
  fs.rmSync(root, { recursive: true, force: true });
});

test("cache budget is inert for invalid, missing, and below-minimum boundaries", () => {
  assert.deepEqual(maintainHashedCache({ root: "", maxBytes: 1024, force: true }), { scanned: false, removed: 0, bytes: 0 });
  assert.deepEqual(maintainHashedCache({ root: path.join(os.tmpdir(), "missing-slideclone-cache"), maxBytes: 1024 * 1024, force: true }), { scanned: false, removed: 0, bytes: 0 });
});
